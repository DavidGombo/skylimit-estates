import { users, statements, properties, tenants, documents, certificates, maintenanceJobs, rooms, utilities, fraActions } from '@shared/schema';
import type {
  User, InsertUser, Statement, InsertStatement,
  Property, InsertProperty, Tenant, InsertTenant,
  Document, InsertDocument, Certificate, InsertCertificate,
  MaintenanceJob, InsertMaintenanceJob,
  Room, InsertRoom, Utility, InsertUtility, FraAction, InsertFraAction,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Provide the Postgres connection string.");
}

// postgres-js client. SSL required for Supabase. Modest pool for a single service.
const client = postgres(connectionString, {
  ssl: "require",
  max: Number(process.env.DB_POOL_MAX || 10),
  idle_timeout: 20,
  connect_timeout: 15,
  prepare: false, // transaction pooler compatibility
});

export const db = drizzle(client);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  listProperties(): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  createProperty(data: InsertProperty): Promise<Property>;
  updateProperty(id: number, data: InsertProperty): Promise<Property | undefined>;
  deleteProperty(id: number): Promise<boolean>;

  listTenants(propertyId: number): Promise<Tenant[]>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: number): Promise<boolean>;

  listRooms(propertyId: number): Promise<Room[]>;
  getRoom(id: number): Promise<Room | undefined>;
  createRoom(data: InsertRoom): Promise<Room>;
  updateRoom(id: number, data: Partial<InsertRoom>): Promise<Room | undefined>;
  deleteRoom(id: number): Promise<boolean>;

  listUtilities(propertyId: number): Promise<Utility[]>;
  listAllUtilities(): Promise<Utility[]>;
  createUtility(data: InsertUtility): Promise<Utility>;
  updateUtility(id: number, data: Partial<InsertUtility>): Promise<Utility | undefined>;
  deleteUtility(id: number): Promise<boolean>;

  listFraActions(propertyId: number): Promise<FraAction[]>;
  listFraActionsByCert(certificateId: number): Promise<FraAction[]>;
  createFraAction(data: InsertFraAction): Promise<FraAction>;
  updateFraAction(id: number, data: Partial<InsertFraAction>): Promise<FraAction | undefined>;
  deleteFraAction(id: number): Promise<boolean>;

  listStatements(): Promise<Statement[]>;
  listStatementsByProperty(propertyId: number): Promise<Statement[]>;
  getStatement(id: number): Promise<Statement | undefined>;
  createStatement(data: InsertStatement): Promise<Statement>;
  updateStatement(id: number, data: InsertStatement): Promise<Statement | undefined>;
  deleteStatement(id: number): Promise<boolean>;

  listDocuments(propertyId: number): Promise<Document[]>;
  listAllStatementDocs(): Promise<Array<Pick<Document, 'id'|'propertyId'|'category'|'title'|'fileName'|'mimeType'|'fileSize'|'createdAt'>>>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<boolean>;

  listCertificates(propertyId: number): Promise<Certificate[]>;
  listAllCertificates(): Promise<Certificate[]>;
  getCertificate(id: number): Promise<Certificate | undefined>;
  createCertificate(data: InsertCertificate): Promise<Certificate>;
  updateCertificate(id: number, data: Partial<InsertCertificate>): Promise<Certificate | undefined>;
  deleteCertificate(id: number): Promise<boolean>;

  listMaintenance(propertyId: number): Promise<MaintenanceJob[]>;
  listAllMaintenance(): Promise<MaintenanceJob[]>;
  getMaintenance(id: number): Promise<MaintenanceJob | undefined>;
  createMaintenance(data: InsertMaintenanceJob): Promise<MaintenanceJob>;
  updateMaintenance(id: number, data: Partial<InsertMaintenanceJob>): Promise<MaintenanceJob | undefined>;
  deleteMaintenance(id: number): Promise<boolean>;
}

const now = () => new Date().toISOString();
const one = <T>(rows: T[]): T | undefined => rows[0];

export class DatabaseStorage implements IStorage {
  // ---- Users ----
  async getUser(id: number) { return one(await db.select().from(users).where(eq(users.id, id))); }
  async getUserByUsername(username: string) { return one(await db.select().from(users).where(eq(users.username, username))); }
  async createUser(insertUser: InsertUser) { return one(await db.insert(users).values(insertUser).returning())!; }

  // ---- Properties ----
  async listProperties() { return db.select().from(properties).orderBy(desc(properties.id)); }
  async getProperty(id: number) { return one(await db.select().from(properties).where(eq(properties.id, id))); }
  async createProperty(data: InsertProperty) {
    return one(await db.insert(properties).values({ ...data, createdAt: now(), updatedAt: now() }).returning())!;
  }
  async updateProperty(id: number, data: InsertProperty) {
    return one(await db.update(properties).set({ ...data, updatedAt: now() }).where(eq(properties.id, id)).returning());
  }
  async deleteProperty(id: number) {
    await db.delete(tenants).where(eq(tenants.propertyId, id));
    await db.delete(documents).where(eq(documents.propertyId, id));
    await db.delete(certificates).where(eq(certificates.propertyId, id));
    await db.delete(maintenanceJobs).where(eq(maintenanceJobs.propertyId, id));
    await db.delete(rooms).where(eq(rooms.propertyId, id));
    await db.delete(utilities).where(eq(utilities.propertyId, id));
    await db.delete(fraActions).where(eq(fraActions.propertyId, id));
    const res = await db.delete(properties).where(eq(properties.id, id)).returning();
    return res.length > 0;
  }

  // ---- Tenants ----
  async listTenants(propertyId: number) { return db.select().from(tenants).where(eq(tenants.propertyId, propertyId)).orderBy(tenants.id); }
  async createTenant(data: InsertTenant) { return one(await db.insert(tenants).values({ ...data, createdAt: now() }).returning())!; }
  async updateTenant(id: number, data: Partial<InsertTenant>) {
    return one(await db.update(tenants).set(data).where(eq(tenants.id, id)).returning());
  }
  async deleteTenant(id: number) { return (await db.delete(tenants).where(eq(tenants.id, id)).returning()).length > 0; }

  // ---- Rooms ----
  async listRooms(propertyId: number) { return db.select().from(rooms).where(eq(rooms.propertyId, propertyId)).orderBy(rooms.id); }
  async getRoom(id: number) { return one(await db.select().from(rooms).where(eq(rooms.id, id))); }
  async createRoom(data: InsertRoom) { return one(await db.insert(rooms).values({ ...data, createdAt: now() }).returning())!; }
  async updateRoom(id: number, data: Partial<InsertRoom>) { return one(await db.update(rooms).set(data).where(eq(rooms.id, id)).returning()); }
  async deleteRoom(id: number) {
    // detach references rather than orphaning them
    await db.update(tenants).set({ roomId: null }).where(eq(tenants.roomId, id));
    await db.update(certificates).set({ roomId: null }).where(eq(certificates.roomId, id));
    await db.update(documents).set({ roomId: null }).where(eq(documents.roomId, id));
    await db.update(maintenanceJobs).set({ roomId: null }).where(eq(maintenanceJobs.roomId, id));
    await db.delete(utilities).where(eq(utilities.roomId, id));
    return (await db.delete(rooms).where(eq(rooms.id, id)).returning()).length > 0;
  }

  // ---- Utilities ----
  async listUtilities(propertyId: number) { return db.select().from(utilities).where(eq(utilities.propertyId, propertyId)).orderBy(utilities.id); }
  async listAllUtilities() { return db.select().from(utilities).orderBy(desc(utilities.id)); }
  async createUtility(data: InsertUtility) { return one(await db.insert(utilities).values({ ...data, createdAt: now(), updatedAt: now() }).returning())!; }
  async updateUtility(id: number, data: Partial<InsertUtility>) { return one(await db.update(utilities).set({ ...data, updatedAt: now() }).where(eq(utilities.id, id)).returning()); }
  async deleteUtility(id: number) { return (await db.delete(utilities).where(eq(utilities.id, id)).returning()).length > 0; }

  // ---- FRA actions ----
  async listFraActions(propertyId: number) { return db.select().from(fraActions).where(eq(fraActions.propertyId, propertyId)).orderBy(fraActions.id); }
  async listFraActionsByCert(certificateId: number) { return db.select().from(fraActions).where(eq(fraActions.certificateId, certificateId)).orderBy(fraActions.id); }
  async createFraAction(data: InsertFraAction) { return one(await db.insert(fraActions).values({ ...data, createdAt: now() }).returning())!; }
  async updateFraAction(id: number, data: Partial<InsertFraAction>) { return one(await db.update(fraActions).set(data).where(eq(fraActions.id, id)).returning()); }
  async deleteFraAction(id: number) { return (await db.delete(fraActions).where(eq(fraActions.id, id)).returning()).length > 0; }

  // ---- Statements ----
  async listStatements() { return db.select().from(statements).orderBy(desc(statements.id)); }
  async listStatementsByProperty(propertyId: number) { return db.select().from(statements).where(eq(statements.propertyId, propertyId)).orderBy(desc(statements.id)); }
  async getStatement(id: number) { return one(await db.select().from(statements).where(eq(statements.id, id))); }
  async createStatement(data: InsertStatement) { return one(await db.insert(statements).values({ ...data, createdAt: now(), updatedAt: now() }).returning())!; }
  async updateStatement(id: number, data: InsertStatement) {
    return one(await db.update(statements).set({ ...data, updatedAt: now() }).where(eq(statements.id, id)).returning());
  }
  async deleteStatement(id: number) { return (await db.delete(statements).where(eq(statements.id, id)).returning()).length > 0; }

  // ---- Documents ----
  async listDocuments(propertyId: number) { return db.select().from(documents).where(eq(documents.propertyId, propertyId)).orderBy(desc(documents.id)); }
  // All 'statement' category docs across properties, metadata only (no base64 fileData)
  async listAllStatementDocs() {
    return db.select({
      id: documents.id, propertyId: documents.propertyId, category: documents.category,
      title: documents.title, fileName: documents.fileName, mimeType: documents.mimeType,
      fileSize: documents.fileSize, createdAt: documents.createdAt,
    }).from(documents).where(eq(documents.category, 'statement')).orderBy(desc(documents.id));
  }
  async getDocument(id: number) { return one(await db.select().from(documents).where(eq(documents.id, id))); }
  async createDocument(data: InsertDocument) { return one(await db.insert(documents).values({ ...data, createdAt: now() }).returning())!; }
  async updateDocument(id: number, data: Partial<InsertDocument>) {
    return one(await db.update(documents).set(data).where(eq(documents.id, id)).returning());
  }
  async deleteDocument(id: number) { return (await db.delete(documents).where(eq(documents.id, id)).returning()).length > 0; }

  // ---- Certificates ----
  async listCertificates(propertyId: number) { return db.select().from(certificates).where(eq(certificates.propertyId, propertyId)).orderBy(desc(certificates.id)); }
  async listAllCertificates() { return db.select().from(certificates).orderBy(desc(certificates.id)); }
  async getCertificate(id: number) { return one(await db.select().from(certificates).where(eq(certificates.id, id))); }
  async createCertificate(data: InsertCertificate) { return one(await db.insert(certificates).values({ ...data, createdAt: now(), updatedAt: now() }).returning())!; }
  async updateCertificate(id: number, data: Partial<InsertCertificate>) {
    return one(await db.update(certificates).set({ ...data, updatedAt: now() }).where(eq(certificates.id, id)).returning());
  }
  async deleteCertificate(id: number) { return (await db.delete(certificates).where(eq(certificates.id, id)).returning()).length > 0; }

  // ---- Maintenance ----
  async listMaintenance(propertyId: number) { return db.select().from(maintenanceJobs).where(eq(maintenanceJobs.propertyId, propertyId)).orderBy(desc(maintenanceJobs.id)); }
  async listAllMaintenance() { return db.select().from(maintenanceJobs).orderBy(desc(maintenanceJobs.id)); }
  async getMaintenance(id: number) { return one(await db.select().from(maintenanceJobs).where(eq(maintenanceJobs.id, id))); }
  async createMaintenance(data: InsertMaintenanceJob) { return one(await db.insert(maintenanceJobs).values({ ...data, createdAt: now(), updatedAt: now() }).returning())!; }
  async updateMaintenance(id: number, data: Partial<InsertMaintenanceJob>) {
    return one(await db.update(maintenanceJobs).set({ ...data, updatedAt: now() }).where(eq(maintenanceJobs.id, id)).returning());
  }
  async deleteMaintenance(id: number) { return (await db.delete(maintenanceJobs).where(eq(maintenanceJobs.id, id)).returning()).length > 0; }
}

export const storage = new DatabaseStorage();
