import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { users } from '../src/db/schema';

const scrypt = promisify(scryptCallback);

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (10+ characters) are required');
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) { console.log(`Admin seed skipped; ${email} already exists.`); return; }
  const salt = randomBytes(16);
  const passwordHash = (await scrypt(password, salt, 64) as Buffer).toString('base64');
  db.insert(users).values({ id: `admin_${randomBytes(12).toString('hex')}`, email, passwordSalt: salt.toString('base64'), passwordHash, role: 'admin', createdAt: new Date().toISOString(), revoked: false }).run();
  console.log(`Admin account seeded for ${email}.`);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
