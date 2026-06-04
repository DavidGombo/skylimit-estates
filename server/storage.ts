import { users, statements } from '@shared/schema';
import type { User, InsertUser, Statement, InsertStatement } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Ensure tables exist (template relies on drizzle push, but create defensively)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL DEFAULT 'Skylimit Estates Limited',
    company_address TEXT NOT NULL DEFAULT '45 Stamford Hill, London N16 5SR',
    company_email TEXT NOT NULL DEFAULT 'dg@skylimitestates.com',
    statement_date TEXT NOT NULL,
    period_from TEXT NOT NULL,
    period_to TEXT NOT NULL,
    property_address TEXT NOT NULL,
    statement_to TEXT NOT NULL,
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

  listStatements(): Promise<Statement[]>;
  getStatement(id: number): Promise<Statement | undefined>;
  createStatement(data: InsertStatement): Promise<Statement>;
  updateStatement(id: number, data: InsertStatement): Promise<Statement | undefined>;
  deleteStatement(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async listStatements(): Promise<Statement[]> {
    return db.select().from(statements).orderBy(desc(statements.id)).all();
  }
  async getStatement(id: number): Promise<Statement | undefined> {
    return db.select().from(statements).where(eq(statements.id, id)).get();
  }
  async createStatement(data: InsertStatement): Promise<Statement> {
    const now = new Date().toISOString();
    return db
      .insert(statements)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }
  async updateStatement(id: number, data: InsertStatement): Promise<Statement | undefined> {
    const now = new Date().toISOString();
    return db
      .update(statements)
      .set({ ...data, updatedAt: now })
      .where(eq(statements.id, id))
      .returning()
      .get();
  }
  async deleteStatement(id: number): Promise<boolean> {
    const res = db.delete(statements).where(eq(statements.id, id)).run();
    return res.changes > 0;
  }
}

export const storage = new DatabaseStorage();
