import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { insertStatementSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/statements", async (_req, res) => {
    const all = await storage.listStatements();
    res.json(all);
  });

  app.get("/api/statements/:id", async (req, res) => {
    const id = Number(req.params.id);
    const stmt = await storage.getStatement(id);
    if (!stmt) return res.status(404).json({ message: "Statement not found" });
    res.json(stmt);
  });

  app.post("/api/statements", async (req, res) => {
    const parsed = insertStatementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    const created = await storage.createStatement(parsed.data);
    res.status(201).json(created);
  });

  app.put("/api/statements/:id", async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertStatementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    const updated = await storage.updateStatement(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Statement not found" });
    res.json(updated);
  });

  app.delete("/api/statements/:id", async (req, res) => {
    const id = Number(req.params.id);
    const ok = await storage.deleteStatement(id);
    if (!ok) return res.status(404).json({ message: "Statement not found" });
    res.status(204).end();
  });

  return httpServer;
}
