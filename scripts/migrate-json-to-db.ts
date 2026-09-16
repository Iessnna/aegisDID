import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../src/db';
import { adminAuditLog, apiKeys, fraudFlags, transactions, users } from '../src/db/schema';

interface JsonApiKey { id: string; name: string; hash: string; createdAt: string; lastUsedAt?: string; }
interface JsonUser { id: string; email: string; passwordSalt: string; passwordHash: string; createdAt: string; apiKeys?: JsonApiKey[]; role?: 'user' | 'admin'; walletAddress?: string; did?: string; status?: 'active' | 'revoked'; }
interface JsonStore { users?: JsonUser[]; transactions?: Array<{ id: string; userId: string; walletAddress: string; type: string; txHash: string; timestamp: string; status: 'pending' | 'confirmed' | 'failed'; gasUsed?: string; error?: string }>; fraudFlags?: Array<{ id: string; userId?: string; decision: string; timestamp: string; analysis: unknown }>; adminAuditLog?: Array<{ id: string; adminUserId: string; action: string; targetUserId: string; timestamp: string }>; }

async function main() {
  migrate(db, { migrationsFolder: path.resolve('drizzle') });
  const jsonPath = path.resolve('data/auth.json');
  let store: JsonStore;
  try { store = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as JsonStore; } catch { console.log('No data/auth.json found; nothing to migrate.'); return; }
  for (const user of store.users || []) {
    db.insert(users).values({ id: user.id, email: user.email, passwordSalt: user.passwordSalt, passwordHash: user.passwordHash, role: user.role === 'admin' ? 'admin' : 'user', walletAddress: user.walletAddress || null, did: user.did || null, createdAt: user.createdAt, revoked: user.status === 'revoked', revokedAt: user.status === 'revoked' ? user.createdAt : null }).onConflictDoNothing().run();
    for (const key of user.apiKeys || []) db.insert(apiKeys).values({ id: key.id, userId: user.id, name: key.name, keyHash: key.hash, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt || null }).onConflictDoNothing().run();
  }
  for (const transaction of store.transactions || []) db.insert(transactions).values({ id: transaction.id, userId: transaction.userId, walletAddress: transaction.walletAddress, type: normalizeTransactionType(transaction.type), txHash: transaction.txHash, status: transaction.status, chainId: process.env.MST_CHAIN_ID || 'unknown', createdAt: transaction.timestamp, confirmedAt: transaction.status === 'confirmed' ? transaction.timestamp : null, errorMessage: transaction.error || null }).onConflictDoNothing().run();
  for (const flag of store.fraudFlags || []) db.insert(fraudFlags).values({ id: flag.id, userId: flag.userId || null, decision: flag.decision, analysis: JSON.stringify(flag.analysis), createdAt: flag.timestamp }).onConflictDoNothing().run();
  for (const audit of store.adminAuditLog || []) db.insert(adminAuditLog).values({ id: audit.id, adminUserId: audit.adminUserId, action: audit.action, targetUserId: audit.targetUserId || null, details: '{}', createdAt: audit.timestamp }).onConflictDoNothing().run();
  console.log('JSON to SQLite migration complete. Existing IDs were preserved and duplicate rows were skipped.');
}

function normalizeTransactionType(type: string): 'did_registration' | 'credential_anchor' | 'audit_log' | 'sybil_publish' {
  if (type === 'DID registration') return 'did_registration';
  if (type === 'Credential anchor') return 'credential_anchor';
  if (type === 'Sybil publish') return 'sybil_publish';
  return 'audit_log';
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
