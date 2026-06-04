import { users, statements, properties, tenants } from '@shared/schema';
import type {
  User, InsertUser, Statement, InsertStatement,
  Property, InsertProperty, Tenant, InsertTenant,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_address TEXT NOT NULL,
    statement_to TEXT NOT NULL DEFAULT '',
    statement_to_address TEXT NOT NULL DEFAULT '',
    delivery_method TEXT NOT NULL DEFAULT 'By Email',
    company_name TEXT NOT NULL DEFAULT 'Skylimit Estates Limited',
    company_address TEXT NOT NULL DEFAULT '45 Stamford Hill, London N16 5SR',
    company_email TEXT NOT NULL DEFAULT 'dg@skylimitestates.com',
    management_fee_percent INTEGER NOT NULL DEFAULT 10,
    management_fee_base TEXT NOT NULL DEFAULT 'total_income',
    footer_note TEXT NOT NULL DEFAULT 'We thank you for your custom!',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    flat TEXT NOT NULL DEFAULT '',
    tenant_name TEXT NOT NULL DEFAULT '',
    monthly_rent_pence INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    company_name TEXT NOT NULL DEFAULT 'Skylimit Estates Limited',
    company_address TEXT NOT NULL DEFAULT '45 Stamford Hill, London N16 5SR',
    company_email TEXT NOT NULL DEFAULT 'dg@skylimitestates.com',
    statement_date TEXT NOT NULL,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    property_address TEXT NOT NULL,
    statement_to TEXT NOT NULL,
    statement_to_address TEXT NOT NULL DEFAULT '',
    delivery_method TEXT NOT NULL DEFAULT 'By Email',
    rental_rows TEXT NOT NULL DEFAULT '[]',
    disbursement_rows TEXT NOT NULL DEFAULT '[]',
    management_fee_percent INTEGER NOT NULL DEFAULT 10,
    management_fee_base TEXT NOT NULL DEFAULT 'total_income',
    footer_note TEXT NOT NULL DEFAULT 'We thank you for your custom!',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

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

  listStatements(): Promise<Statement[]>;
  listStatementsByProperty(propertyId: number): Promise<Statement[]>;
  getStatement(id: number): Promise<Statement | undefined>;
  createStatement(data: InsertStatement): Promise<Statement>;
  updateStatement(id: number, data: InsertStatement): Promise<Statement | undefined>;
  deleteStatement(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number) { return db.select().from(users).where(eq(users.id, id)).get(); }
  async getUserByUsername(username: string) { return db.select().from(users).where(eq(users.username, username)).get(); }
  async createUser(insertUser: InsertUser) { return db.insert(users).values(insertUser).returning().get(); }

  // ---- Properties ----
  async listProperties() { return db.select().from(properties).orderBy(desc(properties.id)).all(); }
  async getProperty(id: number) { return db.select().from(properties).where(eq(properties.id, id)).get(); }
  async createProperty(data: InsertProperty) {
    const now = new Date().toISOString();
    return db.insert(properties).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  async updateProperty(id: number, data: InsertProperty) {
    const now = new Date().toISOString();
    return db.update(properties).set({ ...data, updatedAt: now }).where(eq(properties.id, id)).returning().get();
  }
  async deleteProperty(id: number) {
    db.delete(tenants).where(eq(tenants.propertyId, id)).run();
    const res = db.delete(properties).where(eq(properties.id, id)).run();
    return res.changes > 0;
  }

  // ---- Tenants ----
  async listTenants(propertyId: number) {
    return db.select().from(tenants).where(eq(tenants.propertyId, propertyId)).orderBy(tenants.id).all();
  }
  async createTenant(data: InsertTenant) {
    const now = new Date().toISOString();
    return db.insert(tenants).values({ ...data, createdAt: now }).returning().get();
  }
  async updateTenant(id: number, data: Partial<InsertTenant>) {
    return db.update(tenants).set(data).where(eq(tenants.id, id)).returning().get();
  }
  async deleteTenant(id: number) {
    const res = db.delete(tenants).where(eq(tenants.id, id)).run();
    return res.changes > 0;
  }

  // ---- Statements ----
  async listStatements() { return db.select().from(statements).orderBy(desc(statements.id)).all(); }
  async listStatementsByProperty(propertyId: number) {
    return db.select().from(statements).where(eq(statements.propertyId, propertyId)).orderBy(desc(statements.id)).all();
  }
  async getStatement(id: number) { return db.select().from(statements).where(eq(statements.id, id)).get(); }
  async createStatement(data: InsertStatement) {
    const now = new Date().toISOString();
    return db.insert(statements).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  async updateStatement(id: number, data: InsertStatement) {
    const now = new Date().toISOString();
    return db.update(statements).set({ ...data, updatedAt: now }).where(eq(statements.id, id)).returning().get();
  }
  async deleteStatement(id: number) {
    const res = db.delete(statements).where(eq(statements.id, id)).run();
    return res.changes > 0;
  }
}

export const storage = new DatabaseStorage();
