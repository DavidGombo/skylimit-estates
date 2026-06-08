import { pgTable, text, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// PROPERTIES — presaved property + landlord + issuer + fee settings
// ---------------------------------------------------------------------------
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
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

  // Multi-room (HMO) flag — when 1, the property has individual rooms underneath
  // and compliance/utilities/tenants can be attached per room. When 0 it's a single let.
  isMultiRoom: integer("is_multi_room").notNull().default(0),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

// ---------------------------------------------------------------------------
// ROOMS — only for multi-room (HMO) properties. A room is a lettable unit
// under a parent property. Tenants, certs, utilities & maintenance may attach
// to a specific room (roomId) or stay at property level (roomId null).
// ---------------------------------------------------------------------------
export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  name: text("name").notNull().default(""), // e.g. "Room 1", "Loft", "Flat A"
  description: text("description").notNull().default(""),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});
export const insertRoomSchema = createInsertSchema(rooms).omit({ id: true, createdAt: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

// ---------------------------------------------------------------------------
// TENANTS — presaved per property; now a full tenant record
// ---------------------------------------------------------------------------
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  roomId: integer("room_id"), // optional: which room this tenant occupies (HMO)
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
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  roomId: integer("room_id"), // optional link to a room (HMO)
  tenantId: integer("tenant_id"), // optional link to a tenant
  category: text("category").notNull().default("agreement"), // agreement | other
  title: text("title").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  fileData: text("file_data").notNull().default(""), // base64
  fileSize: integer("file_size").notNull().default(0),
  aiSummary: text("ai_summary").notNull().default(""), // AI-extracted summary of the document
  // AI extraction for tenancy agreements (review-then-confirm before applying)
  aiStatus: text("ai_status").notNull().default(""), // "" | done | error
  aiExtracted: text("ai_extracted").notNull().default("{}"), // JSON of extracted tenancy fields
  createdAt: text("created_at").notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true, createdAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ---------------------------------------------------------------------------
// CERTIFICATES — compliance certs per property with expiry tracking + AI review
// ---------------------------------------------------------------------------
export const CERT_TYPES = [
  "gas_safety",   // Gas Safety / CP12 (annual)
  "eicr",         // Electrical Installation Condition Report (5 yrs)
  "epc",          // Energy Performance Certificate (10 yrs)
  "pat",          // Portable Appliance Testing
  "fire_risk",    // Fire Risk Assessment
  "legionella",   // Legionella risk assessment
  "smoke_co",     // Smoke & CO alarm check
  "insurance",    // Buildings/landlord insurance
  "hmo_licence",  // HMO licence
  "other",
] as const;

export const certificates = pgTable("certificates", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  roomId: integer("room_id"), // optional: cert applies to a specific room (HMO)
  certType: text("cert_type").notNull().default("gas_safety"),
  title: text("title").notNull().default(""), // optional custom label (esp. for 'other')
  provider: text("provider").notNull().default(""), // engineer/company who issued it
  issueDate: text("issue_date").notNull().default(""), // YYYY-MM-DD
  expiryDate: text("expiry_date").notNull().default(""), // YYYY-MM-DD
  reference: text("reference").notNull().default(""), // cert/serial number

  // EPC-specific
  epcRating: text("epc_rating").notNull().default(""), // A–G band extracted from an EPC
  epcScore: integer("epc_score").notNull().default(0),  // SAP points 1–100

  // HMO licence-specific
  licenceNumber: text("licence_number").notNull().default(""),
  licenceCouncil: text("licence_council").notNull().default(""), // issuing council
  maxOccupants: integer("max_occupants").notNull().default(0),

  // Uploaded file (base64) — optional
  fileName: text("file_name").notNull().default(""),
  mimeType: text("mime_type").notNull().default(""),
  fileData: text("file_data").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),

  // AI review output
  aiStatus: text("ai_status").notNull().default(""), // "" | pending | done | error
  aiOutcome: text("ai_outcome").notNull().default(""), // pass | advisory | fail | unknown
  aiSummary: text("ai_summary").notNull().default(""),
  aiRecommendations: text("ai_recommendations").notNull().default("[]"), // JSON array of strings
  aiExtractedExpiry: text("ai_extracted_expiry").notNull().default(""), // expiry AI read from doc

  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertCertificateSchema = createInsertSchema(certificates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type Certificate = typeof certificates.$inferSelect;

// ---------------------------------------------------------------------------
// MAINTENANCE JOBS — log all maintenance with AI troubleshooting
// ---------------------------------------------------------------------------
export const MAINT_CATEGORIES = [
  "plumbing", "electrical", "heating_gas", "appliance", "structural",
  "damp_mould", "roofing", "pest", "locks_security", "decorating",
  "garden_exterior", "cleaning", "other",
] as const;

export const maintenanceJobs = pgTable("maintenance_jobs", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  roomId: integer("room_id"), // optional: room affected (HMO)
  tenantId: integer("tenant_id"), // optional: reported by / affecting tenant
  certificateId: integer("certificate_id"), // optional: created from a failed/advisory cert

  category: text("category").notNull().default("other"),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  priority: text("priority").notNull().default("medium"), // low | medium | high | urgent
  status: text("status").notNull().default("open"), // open | in_progress | awaiting_parts | completed | cancelled

  reportedDate: text("reported_date").notNull().default(""),
  completedDate: text("completed_date").notNull().default(""),
  contractor: text("contractor").notNull().default(""),
  cost: integer("cost_pence").notNull().default(0), // pence

  // AI troubleshooting output
  aiStatus: text("ai_status").notNull().default(""), // "" | done | error
  aiDiagnosis: text("ai_diagnosis").notNull().default(""),
  aiSteps: text("ai_steps").notNull().default("[]"), // JSON array of step strings
  aiUrgency: text("ai_urgency").notNull().default(""), // routine | soon | urgent | emergency
  aiAdvice: text("ai_advice").notNull().default(""), // when to call a professional / safety note

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertMaintenanceJobSchema = createInsertSchema(maintenanceJobs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertMaintenanceJob = z.infer<typeof insertMaintenanceJobSchema>;
export type MaintenanceJob = typeof maintenanceJobs.$inferSelect;

export const MAINT_CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Plumbing", electrical: "Electrical", heating_gas: "Heating & Gas",
  appliance: "Appliance", structural: "Structural", damp_mould: "Damp & Mould",
  roofing: "Roofing", pest: "Pest Control", locks_security: "Locks & Security",
  decorating: "Decorating", garden_exterior: "Garden & Exterior", cleaning: "Cleaning",
  other: "Other",
};

// Friendly labels + typical validity (months) for default expiry suggestions
export const CERT_META: Record<string, { label: string; validityMonths: number | null }> = {
  gas_safety: { label: "Gas Safety (CP12)", validityMonths: 12 },
  eicr: { label: "EICR (Electrical)", validityMonths: 60 },
  epc: { label: "EPC", validityMonths: 120 },
  pat: { label: "PAT Testing", validityMonths: 12 },
  fire_risk: { label: "Fire Risk Assessment", validityMonths: 12 },
  legionella: { label: "Legionella Assessment", validityMonths: 24 },
  smoke_co: { label: "Smoke & CO Alarms", validityMonths: 12 },
  insurance: { label: "Landlord Insurance", validityMonths: 12 },
  hmo_licence: { label: "HMO Licence", validityMonths: 60 },
  other: { label: "Other", validityMonths: null },
};

// ---------------------------------------------------------------------------
// FRA ACTIONS — to-dos generated from a Fire Risk Assessment's recommendations,
// each with a deadline (time limit). Lives in the Compliance area.
// ---------------------------------------------------------------------------
export const fraActions = pgTable("fra_actions", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  certificateId: integer("certificate_id"), // the FRA cert it came from
  action: text("action").notNull().default(""),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  dueDate: text("due_date").notNull().default(""), // YYYY-MM-DD deadline
  status: text("status").notNull().default("open"), // open | done
  createdAt: text("created_at").notNull(),
});
export const insertFraActionSchema = createInsertSchema(fraActions).omit({ id: true, createdAt: true });
export type InsertFraAction = z.infer<typeof insertFraActionSchema>;
export type FraAction = typeof fraActions.$inferSelect;

// ---------------------------------------------------------------------------
// UTILITIES & COUNCIL TAX — per property (or per room for HMOs)
// ---------------------------------------------------------------------------
export const UTILITY_TYPES = [
  "council_tax", "gas", "electricity", "water", "internet", "tv_licence", "other",
] as const;
export const UTILITY_LABELS: Record<string, string> = {
  council_tax: "Council Tax", gas: "Gas", electricity: "Electricity", water: "Water",
  internet: "Internet/Broadband", tv_licence: "TV Licence", other: "Other",
};
export const utilities = pgTable("utilities", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull(),
  roomId: integer("room_id"), // optional: utility recorded at room level (HMO)
  utilityType: text("utility_type").notNull().default("council_tax"),
  provider: text("provider").notNull().default(""), // supplier or council name
  accountRef: text("account_ref").notNull().default(""),
  council_tax_band: text("council_tax_band").notNull().default(""), // A–H (council tax only)
  annualAmount: integer("annual_amount_pence").notNull().default(0), // pence per year
  responsibleParty: text("responsible_party").notNull().default("landlord"), // landlord | tenant | included
  renewalDate: text("renewal_date").notNull().default(""), // YYYY-MM-DD
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const insertUtilitySchema = createInsertSchema(utilities).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUtility = z.infer<typeof insertUtilitySchema>;
export type Utility = typeof utilities.$inferSelect;

// ---------------------------------------------------------------------------
// STATEMENTS — a produced statement, snapshotting all values
// ---------------------------------------------------------------------------
export const statements = pgTable("statements", {
  id: serial("id").primaryKey(),
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
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
