import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import {
  insertStatementSchema, insertPropertySchema, insertTenantSchema,
} from "@shared/schema";
import type { RentalRow } from "@shared/schema";
import { reviewCertificate, troubleshootMaintenance } from "./aiCert";

function parseRows(json: string): RentalRow[] {
  try { return JSON.parse(json) as RentalRow[]; } catch { return []; }
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------- Access gate ----------
  // Require a shared access key on every /api request in production.
  // Key resolves from ACCESS_KEY env var, else a compiled-in default so the
  // gate is always on for the published site. In dev (NODE_ENV !== production)
  // the gate is disabled for convenience.
  const DEFAULT_ACCESS_KEY = "Skylimit2026!";
  const ACCESS_KEY = process.env.NODE_ENV === "production"
    ? (process.env.ACCESS_KEY || DEFAULT_ACCESS_KEY)
    : undefined;
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
      "flat", "tenantName", "monthlyRent", "active",
      "email", "phone", "tenancyStart", "tenancyEnd",
      "depositAmount", "depositScheme", "idReference", "notes",
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

    const rentalRows: RentalRow[] = tenantList.map(t => {
      const rent = round2((t.monthlyRent || 0) / 100);
      const bf = round2(carryByTenant.get(t.id) || 0);
      return {
        tenantId: t.id,
        rentalPeriod: "",
        flat: t.flat,
        tenantName: t.tenantName,
        balanceBf: bf,
        rentDemanded: rent,
        rentPaid: rent, // assume paid in full; user adjusts defaulters
      };
    });

    res.json({ property, rentalRows });
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
      tenantId: tenantId ?? null,
      category: category || "agreement",
      title: title || fileName || "Document",
      fileName: fileName || "document.pdf",
      mimeType: mimeType || "application/pdf",
      fileData,
      fileSize: fileSize || 0,
      aiSummary: "",
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
      certType: b.certType || "gas_safety",
      title: b.title || "",
      provider: b.provider || "",
      issueDate: b.issueDate || "",
      expiryDate: b.expiryDate || "",
      reference: b.reference || "",
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
      "certType", "title", "provider", "issueDate", "expiryDate", "reference", "notes",
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
          review = { outcome: "unknown" as const, summary: "This PDF has no readable text (it may be a scan). Please enter the dates manually, or upload a clearer copy.", recommendations: [], extractedExpiry: "", extractedIssue: "", provider: "", reference: "" };
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
      const updated = await storage.updateCertificate(id, patch);
      const { fileData, ...rest } = updated!;
      res.json(rest);
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
      "reportedDate", "completedDate", "contractor", "cost", "tenantId",
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
        aiStatus: "done", aiDiagnosis: r.diagnosis, aiSteps: JSON.stringify(r.steps),
        aiUrgency: r.urgency, aiAdvice: r.advice,
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

  return httpServer;
}
