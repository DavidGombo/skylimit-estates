import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// PROPERTIES — presaved property + landlord + issuer + fee settings
// ---------------------------------------------------------------------------
export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyAddress: text("property_address").notNull(),
  statementTo: text("statement_to").notNull().default(""), // landlord / recipient
  statementToAddress: text("statement_to_address").notNull().default(""), // landlord address line
  deliveryMethod: text("delivery_method").notNull().default("By Email"),

  // Issuer (defaults to Skylimit)
  companyName: text("company_name").notNull().default("Skylimit Estates Limited"),
  companyAddress: text("company_address").notNull().default("45 Stamford Hill, London N16 5SR"),
  companyEmail: text("company_email").notNull().default("dg@skylimitestates.com"),

  // Fee settings remembered per property
  managementFeePercent: integer("management_fee_percent").notNull().default(10),
  managementFeeBase: text("management_fee_base").notNull().default("total_income"),

  footerNote: text("footer_note").notNull().default("We thank you for your custom!"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

// ---------------------------------------------------------------------------
// TENANTS — presaved per property; now a full tenant record
// ---------------------------------------------------------------------------
export const tenants = sqliteTable("tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull(),
  flat: text("flat").notNull().default(""),
  tenantName: text("tenant_name").notNull().default(""),
  monthlyRent: integer("monthly_rent_pence").notNull().default(0), // pence
  active: integer("active").notNull().default(1), // 1 active, 0 archived

  // Contact
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),

  // Tenancy details
  tenancyStart: text("tenancy_start").notNull().default(""), // YYYY-MM-DD
  tenancyEnd: text("tenancy_end").notNull().default(""),
  depositAmount: integer("deposit_amount_pence").notNull().default(0), // pence
  depositScheme: text("deposit_scheme").notNull().default(""), // DPS / MyDeposits / TDS
  idReference: text("id_reference").notNull().default(""), // passport/right-to-rent ref
  notes: text("notes").notNull().default(""),

  createdAt: text("created_at").notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true, createdAt: true,
});

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// ---------------------------------------------------------------------------
// DOCUMENTS — uploaded files (tenancy agreements now; certs reuse in Phase 2)
// Stored as base64 in SQLite so they survive redeploys via the data.db snapshot.
// ---------------------------------------------------------------------------
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull(),
  tenantId: integer("tenant_id"), // optional link to a tenant
  category: text("category").notNull().default("agreement"), // agreement | other
  title: text("title").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  fileData: text("file_data").notNull().default(""), // base64
  fileSize: integer("file_size").notNull().default(0),
  aiSummary: text("ai_summary").notNull().default(""), // AI-extracted summary of the document
  createdAt: text("created_at").notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true, createdAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ---------------------------------------------------------------------------
// STATEMENTS — a produced statement, snapshotting all values
// ---------------------------------------------------------------------------
export const statements = sqliteTable("statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id"), // link back to property (nullable for legacy)

  // Snapshotted issuer + recipient (so edits to property don't rewrite history)
  companyName: text("company_name").notNull().default("Skylimit Estates Limited"),
  companyAddress: text("company_address").notNull().default("45 Stamford Hill, London N16 5SR"),
  companyEmail: text("company_email").notNull().default("dg@skylimitestates.com"),
  statementDate: text("statement_date").notNull(),
  periodFrom: text("period_from").notNull(),
  periodTo: text("period_to").notNull(),
  propertyAddress: text("property_address").notNull(),
  statementTo: text("statement_to").notNull(),
  statementToAddress: text("statement_to_address").notNull().default(""),
  deliveryMethod: text("delivery_method").notNull().default("By Email"),

  rentalRows: text("rental_rows").notNull().default("[]"),
  disbursementRows: text("disbursement_rows").notNull().default("[]"),

  managementFeePercent: integer("management_fee_percent").notNull().default(10),
  managementFeeBase: text("management_fee_base").notNull().default("total_income"),
  footerNote: text("footer_note").notNull().default("We thank you for your custom!"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// rental row now also carries a tenantId so arrears can carry forward per tenant
export const rentalRowSchema = z.object({
  tenantId: z.number().nullable().default(null),
  rentalPeriod: z.string().default(""),
  flat: z.string().default(""),
  tenantName: z.string().default(""),
  balanceBf: z.number().default(0),
  rentDemanded: z.number().default(0),
  rentPaid: z.number().default(0),
});
export type RentalRow = z.infer<typeof rentalRowSchema>;

export const disbursementRowSchema = z.object({
  supplier: z.string().default(""),
  invoiceNumber: z.string().default(""),
  description: z.string().default(""),
  invoiceAmount: z.number().default(0),
  invoiceDate: z.string().default(""),
  balance: z.number().default(0),
});
export type DisbursementRow = z.infer<typeof disbursementRowSchema>;

export const insertStatementSchema = createInsertSchema(statements).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type Statement = typeof statements.$inferSelect;

// Keep template users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
