import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import {
  insertStatementSchema, insertPropertySchema, insertTenantSchema,
} from "@shared/schema";
import type { RentalRow, DisbursementRow } from "@shared/schema";
import { reviewCertificate, troubleshootMaintenance, extractTenancy } from "./aiCert";
import { sendGraphMail, graphConfigStatus } from "./graphMail";

function parseRows(json: string): RentalRow[] {
  try { return JSON.parse(json) as RentalRow[]; } catch { return []; }
}
function parseDisb(json: string): DisbursementRow[] {
  try { return JSON.parse(json) as DisbursementRow[]; } catch { return []; }
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Month helpers for statement period auto-advance
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function addMonth(y: number, m: number) { // m is 0-indexed
  return m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
}
// Parse a period label like "June 2026" or "01/06/2026 - 30/06/2026" -> {y,m} of the period month, or null
function parsePeriodMonth(label: string): { y: number; m: number } | null {
  if (!label) return null;
  const named = label.match(/([A-Za-z]+)\s+(\d{4})/);
  if (named) {
    const mi = MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3)));
    if (mi >= 0) return { y: Number(named[2]), m: mi };
  }
  // ISO first (YYYY-MM-DD) so it isn't mis-read by the DMY branch.
  const iso = label.match(/(\d{4})-(\d{2})/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]) - 1 };
  // DD/MM/YYYY or DD.MM.YYYY (UK dotted) — accept both separators.
  const dmy = label.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) return { y: Number(dmy[3]), m: Number(dmy[2]) - 1 };
  return null;
}
function monthLabel(y: number, m: number) { return `${MONTHS[m]} ${y}`; }

// ---- Per-tenant rent-in-arrears period helpers ----
// The seeded base dates correspond to the FIRST statement month (the anchor).
// Each subsequent monthly statement shifts every tenant's range +1 month.
const RENT_PERIOD_ANCHOR = { y: 2026, m: 6 }; // July 2026 (0-indexed month 6) = the statement these base dates were given for
function pad2(n: number) { return String(n).padStart(2, "0"); }
// Shift an ISO date (YYYY-MM-DD) forward by `months`, preserving day-of-month (clamped to month length).
function shiftIsoByMonths(iso: string, months: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  let y = Number(m[1]); let mo = Number(m[2]) - 1; const d = Number(m[3]);
  const total = y * 12 + mo + months;
  y = Math.floor(total / 12); mo = total % 12;
  const lastDay = new Date(y, mo + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${y}-${pad2(mo + 1)}-${pad2(day)}`;
}
// Format ISO YYYY-MM-DD as DD/MM/YYYY for display
function isoToDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------- Access gate ----------
  // Require a shared access key on every /api request when ACCESS_KEY is set.
  // Set ACCESS_KEY as an environment variable in production (never hardcoded).
  // When unset (local dev), the gate is disabled for convenience.
  const ACCESS_KEY = process.env.ACCESS_KEY || undefined;
  app.get("/api/auth/check", (req, res) => {
    if (!ACCESS_KEY) return res.json({ ok: true, required: false });
    const ok = req.headers["x-access-key"] === ACCESS_KEY;
    res.status(ok ? 200 : 401).json({ ok, required: true });
  });
  app.use("/api", (req, res, next) => {
    if (!ACCESS_KEY) return next();
    if (req.path === "/auth/check") return next();
    if (req.headers["x-access-key"] === ACCESS_KEY) return next();
    // Allow file downloads/views via query key (browser can't set headers on direct nav)
    if (/^\/(documents|certificates)\/\d+\/file$/.test(req.path) && req.query.key === ACCESS_KEY) return next();
    return res.status(401).json({ message: "Unauthorized" });
  });

  // ---------- Properties ----------
  app.get("/api/properties", async (_req, res) => res.json(await storage.listProperties()));
  app.get("/api/properties/:id", async (req, res) => {
    const p = await storage.getProperty(Number(req.params.id));
    if (!p) return res.status(404).json({ message: "Property not found" });
    res.json(p);
  });
  app.post("/api/properties", async (req, res) => {
    const parsed = insertPropertySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    res.status(201).json(await storage.createProperty(parsed.data));
  });
  app.put("/api/properties/:id", async (req, res) => {
    const parsed = insertPropertySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    const updated = await storage.updateProperty(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Property not found" });
    res.json(updated);
  });
  app.delete("/api/properties/:id", async (req, res) => {
    const ok = await storage.deleteProperty(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Property not found" });
    res.status(204).end();
  });

  // ---------- Tenants (scoped to a property) ----------
  app.get("/api/properties/:id/tenants", async (req, res) => {
    res.json(await storage.listTenants(Number(req.params.id)));
  });
  app.post("/api/properties/:id/tenants", async (req, res) => {
    const body = { ...req.body, propertyId: Number(req.params.id) };
    const parsed = insertTenantSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    res.status(201).json(await storage.createTenant(parsed.data));
  });

  // ---------- Rooms (multi-room / HMO properties) ----------
  app.get("/api/properties/:id/rooms", async (req, res) => {
    res.json(await storage.listRooms(Number(req.params.id)));
  });
  app.post("/api/properties/:id/rooms", async (req, res) => {
    const propertyId = Number(req.params.id);
    const b = req.body ?? {};
    res.status(201).json(await storage.createRoom({ propertyId, name: b.name || "Room", description: b.description || "", active: b.active ?? 1 }));
  });
  app.put("/api/rooms/:id", async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "description", "active"] as const) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateRoom(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Room not found" });
    res.json(updated);
  });
  app.delete("/api/rooms/:id", async (req, res) => {
    const ok = await storage.deleteRoom(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Room not found" });
    res.status(204).end();
  });

  // ---------- Utilities & Council Tax ----------
  // All utilities across properties (for the Utilities hub), with property address + room name
  app.get("/api/utilities", async (_req, res) => {
    const props = await storage.listProperties();
    const propName = new Map(props.map((p) => [p.id, p.propertyAddress]));
    const all = await storage.listAllUtilities();
    const result: any[] = [];
    for (const u of all) {
      let roomName = "";
      if (u.roomId) { const r = await storage.getRoom(u.roomId); roomName = r?.name || ""; }
      result.push({ ...u, propertyAddress: propName.get(u.propertyId) || "Property", roomName });
    }
    res.json(result);
  });
  app.get("/api/properties/:id/utilities", async (req, res) => {
    res.json(await storage.listUtilities(Number(req.params.id)));
  });
  app.post("/api/properties/:id/utilities", async (req, res) => {
    const propertyId = Number(req.params.id);
    const b = req.body ?? {};
    res.status(201).json(await storage.createUtility({
      propertyId, roomId: b.roomId ?? null,
      utilityType: b.utilityType || "council_tax", provider: b.provider || "",
      accountRef: b.accountRef || "", council_tax_band: b.council_tax_band || "",
      annualAmount: b.annualAmount || 0, responsibleParty: b.responsibleParty || "landlord",
      renewalDate: b.renewalDate || "", notes: b.notes || "",
    }));
  });
  app.put("/api/utilities/:id", async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["roomId", "utilityType", "provider", "accountRef", "council_tax_band", "annualAmount", "responsibleParty", "renewalDate", "notes"] as const) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateUtility(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Utility not found" });
    res.json(updated);
  });
  app.delete("/api/utilities/:id", async (req, res) => {
    const ok = await storage.deleteUtility(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Utility not found" });
    res.status(204).end();
  });

  // ---------- FRA actions (fire risk to-dos) ----------
  app.get("/api/properties/:id/fra-actions", async (req, res) => {
    res.json(await storage.listFraActions(Number(req.params.id)));
  });
  app.post("/api/properties/:id/fra-actions", async (req, res) => {
    const propertyId = Number(req.params.id);
    const b = req.body ?? {};
    res.status(201).json(await storage.createFraAction({
      propertyId, certificateId: b.certificateId ?? null,
      action: b.action || "", priority: b.priority || "medium",
      dueDate: b.dueDate || "", status: b.status || "open",
    }));
  });
  app.put("/api/fra-actions/:id", async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["action", "priority", "dueDate", "status"] as const) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateFraAction(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Action not found" });
    res.json(updated);
  });
  app.delete("/api/fra-actions/:id", async (req, res) => {
    const ok = await storage.deleteFraAction(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Action not found" });
    res.status(204).end();
  });
  // All tenants across properties (for the Tenants hub)
  app.get("/api/tenants", async (_req, res) => {
    const props = await storage.listProperties();
    const all: any[] = [];
    for (const p of props) {
      const ts = await storage.listTenants(p.id);
      for (const t of ts) all.push({ ...t, propertyAddress: p.propertyAddress });
    }
    res.json(all);
  });
  app.put("/api/tenants/:id", async (req, res) => {
    const allowed = ([
      "flat", "tenantName", "monthlyRent", "active", "roomId",
      "email", "phone", "tenancyStart", "tenancyEnd",
      "depositAmount", "depositScheme", "idReference", "niNumber", "notes",
      "rentPeriodStart", "rentPeriodEnd",
    ] as const);
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateTenant(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Tenant not found" });
    res.json(updated);
  });
  app.delete("/api/tenants/:id", async (req, res) => {
    const ok = await storage.deleteTenant(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Tenant not found" });
    res.status(204).end();
  });

  // ---------- Prepare a new statement for a property ----------
  // Returns property defaults + pre-filled rental rows.
  // Rent demanded + paid pre-filled to full monthly rent; Balance B/F carried
  // forward from each tenant's closing balance on the most recent statement.
  app.get("/api/properties/:id/prepare", async (req, res) => {
    const propertyId = Number(req.params.id);
    const property = await storage.getProperty(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });

    const tenantList = (await storage.listTenants(propertyId)).filter(t => t.active === 1);

    // find latest statement for this property to carry forward arrears
    const prior = await storage.listStatementsByProperty(propertyId);
    const latest = prior[0]; // listed desc by id
    const carryByTenant = new Map<number, number>();
    if (latest) {
      for (const row of parseRows(latest.rentalRows)) {
        if (row.tenantId != null) {
          const cf = round2((row.balanceBf || 0) + (row.rentDemanded || 0) - (row.rentPaid || 0));
          carryByTenant.set(row.tenantId, cf);
        }
      }
    }

    // Auto-advance the rental period: read the latest statement's period and
    // move forward one calendar month. If none, default to the current month.
    let nextPeriod = "";
    let nextFrom = "";
    let nextTo = "";
    const baseMonth = (() => {
      if (latest) {
        // Anchor off the statement's OWN period month (not the per-tenant arrears
        // date range) so the monthly cadence doesn't drift. periodFrom is ISO.
        const prev = parsePeriodMonth(latest.periodFrom) || parsePeriodMonth(latest.periodTo)
          || (parseRows(latest.rentalRows).map((r) => parsePeriodMonth(r.rentalPeriod)).find(Boolean) as { y: number; m: number } | undefined);
        if (prev) return addMonth(prev.y, prev.m);
      }
      // No prior statement: default to the PREVIOUS calendar month, because a
      // statement produced in (e.g.) August covers the July period that has just ended.
      const now = new Date();
      const prevMonth = now.getMonth() - 1;
      const y = prevMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = (prevMonth + 12) % 12;
      return { y, m };
    })();
    nextPeriod = monthLabel(baseMonth.y, baseMonth.m);
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(baseMonth.y, baseMonth.m + 1, 0).getDate();
    nextFrom = `${baseMonth.y}-${pad(baseMonth.m + 1)}-01`;
    nextTo = `${baseMonth.y}-${pad(baseMonth.m + 1)}-${pad(lastDay)}`;

    // How many months to shift each tenant's arrears window: difference between
    // the target statement month and the anchor month (July 2026).
    const monthsToShift = (baseMonth.y * 12 + baseMonth.m) - (RENT_PERIOD_ANCHOR.y * 12 + RENT_PERIOD_ANCHOR.m);

    const rentalRows: RentalRow[] = tenantList.map(t => {
      const rent = round2((t.monthlyRent || 0) / 100);
      const bf = round2(carryByTenant.get(t.id) || 0);
      // If the tenant has an arrears period template, shift it and show the exact
      // DD/MM/YYYY – DD/MM/YYYY range. Otherwise fall back to the month label.
      let period = nextPeriod;
      if (t.rentPeriodStart && t.rentPeriodEnd) {
        const from = shiftIsoByMonths(t.rentPeriodStart, monthsToShift);
        const to = shiftIsoByMonths(t.rentPeriodEnd, monthsToShift);
        period = `${isoToDMY(from)} – ${isoToDMY(to)}`;
      }
      return {
        tenantId: t.id,
        rentalPeriod: period,
        flat: t.flat,
        tenantName: t.tenantName,
        balanceBf: bf,
        rentDemanded: rent,
        rentPaid: rent, // assume paid in full; user adjusts defaulters
        transferred: false,
      };
    });

    // Carry last month's expenses forward as a starting point: copy supplier,
    // description and amount, but clear the invoice date + number so the user
    // enters this month's actuals (and deletes any that don't repeat).
    let disbursementRows: DisbursementRow[] = [];
    if (latest) {
      disbursementRows = parseDisb(latest.disbursementRows).map((d) => ({
        supplier: d.supplier || "",
        invoiceNumber: "",
        description: d.description || "",
        invoiceAmount: d.invoiceAmount || 0,
        invoiceDate: "",
        balance: 0,
      }));
    }

    res.json({ property, rentalRows, disbursementRows, nextPeriod, periodFrom: nextFrom, periodTo: nextTo });
  });

  // ---------- Statement archive (all imported/sent statement PDFs) ----------
  // Every 'statement' category document across properties, metadata only + property address.
  app.get("/api/statement-archive", async (_req, res) => {
    const props = await storage.listProperties();
    const propName = new Map(props.map((p) => [p.id, p.propertyAddress]));
    const docs = await storage.listAllStatementDocs();
    res.json(docs.map((d) => ({ ...d, propertyAddress: propName.get(d.propertyId) || "Property" })));
  });

  // ---------- Documents (per property; tenancy agreements & files) ----------
  // List omits the heavy base64 file_data for speed.
  app.get("/api/properties/:id/documents", async (req, res) => {
    const docs = await storage.listDocuments(Number(req.params.id));
    res.json(docs.map(({ fileData, ...rest }) => rest));
  });
  app.post("/api/properties/:id/documents", async (req, res) => {
    const propertyId = Number(req.params.id);
    const { tenantId, category, title, fileName, mimeType, fileData, fileSize } = req.body ?? {};
    if (!fileData || typeof fileData !== "string") {
      return res.status(400).json({ message: "Missing file data" });
    }
    // ~8MB base64 cap to keep the SQLite snapshot reasonable
    if (fileData.length > 11_000_000) {
      return res.status(413).json({ message: "File too large (max ~8MB)" });
    }
    const doc = await storage.createDocument({
      propertyId,
      roomId: req.body?.roomId ?? null,
      tenantId: tenantId ?? null,
      category: category || "agreement",
      title: title || fileName || "Document",
      fileName: fileName || "document.pdf",
      mimeType: mimeType || "application/pdf",
      fileData,
      fileSize: fileSize || 0,
      aiSummary: "",
      aiStatus: "",
      aiExtracted: "{}",
    });
    const { fileData: _omit, ...rest } = doc;
    res.status(201).json(rest);
  });
  // Download / view raw file
  app.get("/api/documents/:id/file", async (req, res) => {
    const doc = await storage.getDocument(Number(req.params.id));
    if (!doc) return res.status(404).json({ message: "Not found" });
    const buf = Buffer.from(doc.fileData, "base64");
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"`);
    res.send(buf);
  });
  app.delete("/api/documents/:id", async (req, res) => {
    const ok = await storage.deleteDocument(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.status(204).end();
  });

  // AI extract tenancy terms from an uploaded agreement (review-then-confirm)
  app.post("/api/documents/:id/ai-extract", async (req, res) => {
    const id = Number(req.params.id);
    const doc = await storage.getDocument(id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (!doc.fileData) return res.status(400).json({ message: "No file to read" });
    try {
      const buf = Buffer.from(doc.fileData, "base64");
      const isPdf = (doc.mimeType || "").includes("pdf") || (doc.fileName || "").toLowerCase().endsWith(".pdf");
      let extract;
      if (isPdf) {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        await parser.destroy().catch(() => {});
        const text = ((parsed as any).text || "").trim();
        if (!text) {
          await storage.updateDocument(id, { aiStatus: "error" });
          return res.status(422).json({ message: "This PDF has no readable text (it may be a scan). Enter details manually." });
        }
        extract = await extractTenancy({ pdfText: text });
      } else {
        extract = await extractTenancy({ imageBase64: doc.fileData, imageMime: doc.mimeType });
      }
      await storage.updateDocument(id, { aiStatus: "done", aiExtracted: JSON.stringify(extract), aiSummary: extract.summary });
      res.json(extract); // returned for review; client confirms before applying to tenant
    } catch (err: any) {
      console.error("Tenancy AI extract failed:", err?.message || err);
      await storage.updateDocument(id, { aiStatus: "error" });
      res.status(500).json({ message: "AI extraction failed", detail: err?.message });
    }
  });

  // ---------- Certificates / Compliance ----------
  // list (omit heavy file_data)
  app.get("/api/properties/:id/certificates", async (req, res) => {
    const certs = await storage.listCertificates(Number(req.params.id));
    res.json(certs.map(({ fileData, ...rest }) => rest));
  });
  // all certs across properties (for dashboard) — omit file_data
  app.get("/api/certificates", async (_req, res) => {
    const certs = await storage.listAllCertificates();
    res.json(certs.map(({ fileData, ...rest }) => rest));
  });
  // Due/overdue certs within ?days=N (default 30) — for reminder digests
  app.get("/api/compliance/due", async (req, res) => {
    const days = Number(req.query.days) || 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const props = await storage.listProperties();
    const propName = new Map(props.map((p) => [p.id, p.propertyAddress]));
    const certs = await storage.listAllCertificates();
    const items = certs
      .map((c) => {
        if (!c.expiryDate) return null;
        const d = new Date(c.expiryDate + "T00:00:00");
        if (isNaN(d.getTime())) return null;
        const daysLeft = Math.round((d.getTime() - today.getTime()) / 86400000);
        if (daysLeft > days) return null;
        return {
          id: c.id, propertyId: c.propertyId, property: propName.get(c.propertyId) || "Property",
          certType: c.certType, title: c.title, expiryDate: c.expiryDate, daysLeft,
          status: daysLeft < 0 ? "overdue" : "expiring",
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.daysLeft - b.daysLeft);
    res.json({ count: items.length, days, items });
  });
  app.post("/api/properties/:id/certificates", async (req, res) => {
    const propertyId = Number(req.params.id);
    const b = req.body ?? {};
    if (b.fileData && typeof b.fileData === "string" && b.fileData.length > 11_000_000) {
      return res.status(413).json({ message: "File too large (max ~8MB)" });
    }
    const cert = await storage.createCertificate({
      propertyId,
      roomId: b.roomId ?? null,
      certType: b.certType || "gas_safety",
      title: b.title || "",
      provider: b.provider || "",
      issueDate: b.issueDate || "",
      expiryDate: b.expiryDate || "",
      reference: b.reference || "",
      epcRating: b.epcRating || "",
      epcScore: b.epcScore || 0,
      licenceNumber: b.licenceNumber || "",
      licenceCouncil: b.licenceCouncil || "",
      maxOccupants: b.maxOccupants || 0,
      fileName: b.fileName || "",
      mimeType: b.mimeType || "",
      fileData: b.fileData || "",
      fileSize: b.fileSize || 0,
      aiStatus: "", aiOutcome: "", aiSummary: "", aiRecommendations: "[]", aiExtractedExpiry: "",
      notes: b.notes || "",
    });
    const { fileData, ...rest } = cert;
    res.status(201).json(rest);
  });
  app.put("/api/certificates/:id", async (req, res) => {
    const allowed = ([
      "roomId", "certType", "title", "provider", "issueDate", "expiryDate", "reference", "notes",
      "epcRating", "epcScore", "licenceNumber", "licenceCouncil", "maxOccupants",
      "fileName", "mimeType", "fileData", "fileSize",
    ] as const);
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateCertificate(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Certificate not found" });
    const { fileData, ...rest } = updated;
    res.json(rest);
  });
  app.get("/api/certificates/:id/file", async (req, res) => {
    const cert = await storage.getCertificate(Number(req.params.id));
    if (!cert || !cert.fileData) return res.status(404).json({ message: "No file" });
    res.setHeader("Content-Type", cert.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${(cert.fileName || "certificate").replace(/"/g, "")}"`);
    res.send(Buffer.from(cert.fileData, "base64"));
  });
  app.delete("/api/certificates/:id", async (req, res) => {
    const ok = await storage.deleteCertificate(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Certificate not found" });
    res.status(204).end();
  });

  // AI review of an uploaded certificate
  app.post("/api/certificates/:id/ai-review", async (req, res) => {
    const id = Number(req.params.id);
    const cert = await storage.getCertificate(id);
    if (!cert) return res.status(404).json({ message: "Certificate not found" });
    if (!cert.fileData) return res.status(400).json({ message: "Upload a file first so the AI can read it." });

    await storage.updateCertificate(id, { aiStatus: "pending" });
    try {
      const buf = Buffer.from(cert.fileData, "base64");
      const isPdf = (cert.mimeType || "").includes("pdf") || (cert.fileName || "").toLowerCase().endsWith(".pdf");
      let review;
      if (isPdf) {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        await parser.destroy().catch(() => {});
        const text = ((parsed as any).text || "").trim();
        if (!text) {
          // scanned PDF with no text layer
          review = { outcome: "unknown" as const, summary: "This PDF has no readable text (it may be a scan). Please enter the dates manually, or upload a clearer copy.", recommendations: [], extractedExpiry: "", extractedIssue: "", provider: "", reference: "", epcRating: "", epcScore: 0, licenceNumber: "", licenceCouncil: "", maxOccupants: 0, fraActions: [] };
        } else {
          review = await reviewCertificate({ certType: cert.certType, pdfText: text });
        }
      } else {
        review = await reviewCertificate({ certType: cert.certType, imageBase64: cert.fileData, imageMime: cert.mimeType });
      }
      const patch: Record<string, unknown> = {
        aiStatus: "done",
        aiOutcome: review.outcome,
        aiSummary: review.summary,
        aiRecommendations: JSON.stringify(review.recommendations),
        aiExtractedExpiry: review.extractedExpiry || "",
      };
      // auto-fill blank fields from AI extraction (don't overwrite user entries)
      if (!cert.expiryDate && review.extractedExpiry) patch.expiryDate = review.extractedExpiry;
      if (!cert.issueDate && review.extractedIssue) patch.issueDate = review.extractedIssue;
      if (!cert.provider && review.provider) patch.provider = review.provider;
      if (!cert.reference && review.reference) patch.reference = review.reference;
      // EPC rating/score
      if (!cert.epcRating && review.epcRating) patch.epcRating = review.epcRating;
      if (!cert.epcScore && review.epcScore) patch.epcScore = review.epcScore;
      // HMO licence fields
      if (!cert.licenceNumber && review.licenceNumber) patch.licenceNumber = review.licenceNumber;
      if (!cert.licenceCouncil && review.licenceCouncil) patch.licenceCouncil = review.licenceCouncil;
      if (!cert.maxOccupants && review.maxOccupants) patch.maxOccupants = review.maxOccupants;
      const updated = await storage.updateCertificate(id, patch);

      // FRA: auto-create dated to-dos from extracted recommendations (only once)
      let fraCreated = 0;
      if (cert.certType === "fire_risk" && review.fraActions.length) {
        const existing = await storage.listFraActionsByCert(id);
        if (existing.length === 0) {
          const today = new Date();
          for (const a of review.fraActions) {
            const due = a.timeLimitDays != null
              ? new Date(today.getTime() + a.timeLimitDays * 86400000).toISOString().slice(0, 10)
              : "";
            await storage.createFraAction({
              propertyId: cert.propertyId, certificateId: id,
              action: a.action, priority: a.priority, dueDate: due, status: "open",
            });
            fraCreated++;
          }
        }
      }
      const { fileData, ...rest } = updated!;
      res.json({ ...rest, fraCreated });
    } catch (err: any) {
      console.error("AI review failed:", err?.message || err);
      await storage.updateCertificate(id, { aiStatus: "error", aiSummary: "AI review could not be completed. " + (err?.message || "") });
      res.status(500).json({ message: "AI review failed", detail: err?.message });
    }
  });

  // ---------- Maintenance ----------
  app.get("/api/properties/:id/maintenance", async (req, res) => {
    res.json(await storage.listMaintenance(Number(req.params.id)));
  });
  app.get("/api/maintenance", async (_req, res) => res.json(await storage.listAllMaintenance()));
  app.post("/api/properties/:id/maintenance", async (req, res) => {
    const propertyId = Number(req.params.id);
    const b = req.body ?? {};
    const job = await storage.createMaintenance({
      propertyId,
      roomId: b.roomId ?? null,
      tenantId: b.tenantId ?? null,
      certificateId: b.certificateId ?? null,
      category: b.category || "other",
      title: b.title || "",
      description: b.description || "",
      priority: b.priority || "medium",
      status: b.status || "open",
      reportedDate: b.reportedDate || new Date().toISOString().slice(0, 10),
      completedDate: b.completedDate || "",
      contractor: b.contractor || "",
      cost: b.cost || 0,
      aiStatus: "", aiDiagnosis: "", aiSteps: "[]", aiUrgency: "", aiAdvice: "",
    });
    res.status(201).json(job);
  });
  app.put("/api/maintenance/:id", async (req, res) => {
    const allowed = ([
      "category", "title", "description", "priority", "status",
      "reportedDate", "completedDate", "contractor", "cost", "tenantId", "roomId",
    ] as const);
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateMaintenance(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "Job not found" });
    res.json(updated);
  });
  app.delete("/api/maintenance/:id", async (req, res) => {
    const ok = await storage.deleteMaintenance(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Job not found" });
    res.status(204).end();
  });
  // AI troubleshooting for a maintenance job
  app.post("/api/maintenance/:id/ai-troubleshoot", async (req, res) => {
    const id = Number(req.params.id);
    const job = await storage.getMaintenance(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    try {
      const r = await troubleshootMaintenance({ category: job.category, title: job.title, description: job.description });
      const updated = await storage.updateMaintenance(id, {
        aiStatus: "done", aiDiagnosis: r.diagnosis,
        aiSteps: JSON.stringify(r.steps),
        aiUrgency: r.urgency,
        // pack the enhanced fields into aiAdvice as JSON so we don't need new columns
        aiAdvice: JSON.stringify({ advice: r.advice, likelyCauses: r.likelyCauses, trade: r.trade, partsLikely: r.partsLikely, estimatedCost: r.estimatedCost, preventMeasures: r.preventMeasures }),
      });
      res.json(updated);
    } catch (err: any) {
      console.error("AI troubleshoot failed:", err?.message || err);
      await storage.updateMaintenance(id, { aiStatus: "error", aiDiagnosis: "AI troubleshooting could not be completed." });
      res.status(500).json({ message: "AI troubleshoot failed", detail: err?.message });
    }
  });
  // Create a maintenance job from a certificate (integration)
  app.post("/api/certificates/:id/create-job", async (req, res) => {
    const cert = await storage.getCertificate(Number(req.params.id));
    if (!cert) return res.status(404).json({ message: "Certificate not found" });
    const recs: string[] = (() => { try { return JSON.parse(cert.aiRecommendations || "[]"); } catch { return []; } })();
    const certLabel = cert.title || cert.certType;
    const job = await storage.createMaintenance({
      propertyId: cert.propertyId,
      tenantId: null,
      certificateId: cert.id,
      category: cert.certType === "gas_safety" ? "heating_gas" : cert.certType === "eicr" ? "electrical" : "other",
      title: `Remedial work from ${certLabel} review`,
      description: (cert.aiSummary ? cert.aiSummary + "\n\n" : "") + (recs.length ? "Recommendations:\n- " + recs.join("\n- ") : ""),
      priority: cert.aiOutcome === "fail" ? "urgent" : "medium",
      status: "open",
      reportedDate: new Date().toISOString().slice(0, 10),
      completedDate: "", contractor: "", cost: 0,
      aiStatus: "", aiDiagnosis: "", aiSteps: "[]", aiUrgency: "", aiAdvice: "",
    });
    res.status(201).json(job);
  });

  // ---------- Statements ----------
  app.get("/api/statements", async (_req, res) => res.json(await storage.listStatements()));
  app.get("/api/statements/:id", async (req, res) => {
    const s = await storage.getStatement(Number(req.params.id));
    if (!s) return res.status(404).json({ message: "Statement not found" });
    res.json(s);
  });
  app.post("/api/statements", async (req, res) => {
    const parsed = insertStatementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    res.status(201).json(await storage.createStatement(parsed.data));
  });
  app.put("/api/statements/:id", async (req, res) => {
    const parsed = insertStatementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    const updated = await storage.updateStatement(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Statement not found" });
    res.json(updated);
  });
  app.delete("/api/statements/:id", async (req, res) => {
    const ok = await storage.deleteStatement(Number(req.params.id));
    if (!ok) return res.status(404).json({ message: "Statement not found" });
    res.status(204).end();
  });

  // ---- Email settings ----
  app.get("/api/email-settings", async (_req, res) => {
    res.json(await storage.getEmailSettings());
  });
  app.put("/api/email-settings", async (req, res) => {
    const { fromName, defaultSubject, defaultBody } = req.body || {};
    const updated = await storage.updateEmailSettings({
      ...(fromName !== undefined ? { fromName } : {}),
      ...(defaultSubject !== undefined ? { defaultSubject } : {}),
      ...(defaultBody !== undefined ? { defaultBody } : {}),
    });
    res.json(updated);
  });

  // ---- Email config status (does the app have Graph credentials?) ----
  app.get("/api/email-config", async (_req, res) => {
    const st = graphConfigStatus();
    res.json({ configured: st.configured, missing: st.missing, sender: st.sender });
  });

  // ---- Email log ----
  app.get("/api/statement-emails", async (_req, res) => {
    res.json(await storage.listStatementEmails());
  });

  // ---- Send a statement PDF to the landlord via Microsoft Graph ----
  app.post("/api/statements/:id/email", async (req, res) => {
    const statementId = Number(req.params.id);
    const statement = await storage.getStatement(statementId);
    if (!statement) return res.status(404).json({ message: "Statement not found" });

    const { to, cc, subject, body, pdfBase64, fileName } = req.body || {};
    const toList: string[] = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);
    const ccList: string[] = Array.isArray(cc) ? cc.filter(Boolean) : (cc ? [cc] : []);

    if (!toList.length) return res.status(400).json({ message: "At least one recipient email is required." });
    if (!subject || !body) return res.status(400).json({ message: "Subject and message body are required." });
    if (!pdfBase64) return res.status(400).json({ message: "The statement PDF is missing." });

    const cfg = graphConfigStatus();
    if (!cfg.configured) {
      return res.status(503).json({ message: `Email is not set up yet. Missing: ${cfg.missing.join(", ")}.`, notConfigured: true });
    }

    const cleanPdf = String(pdfBase64).replace(/^data:.*;base64,/, "");
    const finalName = (fileName && String(fileName).trim()) || `Landlord Rent Statement ${statement.propertyAddress}.pdf`;

    try {
      await sendGraphMail({
        to: toList,
        cc: ccList,
        subject,
        body,
        attachments: [{ name: finalName, contentType: "application/pdf", contentBytes: cleanPdf }],
      });
      await storage.createStatementEmail({
        statementId,
        propertyId: statement.propertyId ?? null,
        toEmail: toList.join(", "),
        ccEmail: ccList.join(", "),
        subject, body, fileName: finalName, status: "sent", errorMessage: "",
      } as any);
      res.json({ ok: true, sentTo: toList });
    } catch (e: any) {
      const msg = e?.message || "Failed to send email";
      await storage.createStatementEmail({
        statementId,
        propertyId: statement.propertyId ?? null,
        toEmail: toList.join(", "),
        ccEmail: ccList.join(", "),
        subject, body, fileName: finalName, status: "error", errorMessage: msg,
      } as any);
      res.status(502).json({ message: msg });
    }
  });

  return httpServer;
}
