import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import {
  insertStatementSchema, insertPropertySchema, insertTenantSchema,
} from "@shared/schema";
import type { RentalRow } from "@shared/schema";

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
    if (/^\/documents\/\d+\/file$/.test(req.path) && req.query.key === ACCESS_KEY) return next();
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
