import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// A landlord statement record. Rental rows and disbursement rows are stored
// as JSON text (SQLite has no array columns) and parsed in app code.
export const statements = sqliteTable("statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Issuer (company producing the statement)
  companyName: text("company_name").notNull().default("Skylimit Estates Limited"),
  companyAddress: text("company_address").notNull().default("45 Stamford Hill, London N16 5SR"),
  companyEmail: text("company_email").notNull().default("dg@skylimitestates.com"),

  // Statement meta
  statementDate: text("statement_date").notNull(), // e.g. 05/05/2026
  periodFrom: text("period_from").notNull(), // e.g. 01.04.2026
  periodTo: text("period_to").notNull(), // e.g. 30.04.2026

  // Recipient
  propertyAddress: text("property_address").notNull(),
  statementTo: text("statement_to").notNull(),
  deliveryMethod: text("delivery_method").notNull().default("By Email"),

  // Line items as JSON text
  rentalRows: text("rental_rows").notNull().default("[]"),
  disbursementRows: text("disbursement_rows").notNull().default("[]"),

  // Management fee config
  managementFeePercent: integer("management_fee_percent").notNull().default(10),
  // Base the fee is charged on: "total_income" or "sub_total"
  managementFeeBase: text("management_fee_base").notNull().default("total_income"),

  // Footer note
  footerNote: text("footer_note").notNull().default("We thank you for your custom!"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ---- Row item shapes (validated in the form, stored as JSON) ----
export const rentalRowSchema = z.object({
  rentalPeriod: z.string().default(""),
  flat: z.string().default(""),
  tenantName: z.string().default(""),
  balanceBf: z.number().default(0),
  rentDemanded: z.number().default(0),
  rentPaid: z.number().default(0),
  // balanceCf is computed: balanceBf + rentDemanded - rentPaid
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
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type Statement = typeof statements.$inferSelect;

// Keep the template's users table so nothing else breaks
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
