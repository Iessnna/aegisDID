import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { schema } from './schema';

export const databasePath = path.resolve(process.env.DATABASE_PATH || './data/aegisdid.db');
mkdirSync(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });
export { sqlite };
