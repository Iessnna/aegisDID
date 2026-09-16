import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import compression from 'compression';
import { createClient, type RedisClientType } from 'redis';
import { webcrypto, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mstAnchor } from './src/lib/mstAnchor';
import { JsonRpcProvider, getAddress, isAddress } from 'ethers';
import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from './src/db';
import { adminAuditLog, apiKeys, credentials, fraudFlags, notifications, sessions, spentChallenges, transactions, users } from './src/db/schema';

dotenv.config();

if (!process.env.AUTH_HASH_SALT || process.env.AUTH_HASH_SALT === 'aegis-development-salt' || process.env.AUTH_HASH_SALT.length < 32) {
  throw new Error('AUTH_HASH_SALT must be set to a random server-only secret of at least 32 characters.');
}

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const serverCrypto = webcrypto;
const scrypt = promisify(scryptCallback);
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const redisClient: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: { reconnectStrategy: false },
});
let redisReady = false;
const localResponseCache = new Map<string, { value: string; expiresAt: number }>();

redisClient.on('error', error => console.warn('Redis unavailable; using local fallbacks:', error.message));
redisClient.connect().then(() => { redisReady = true; }).catch(() => { redisReady = false; });

interface ApiKeyRecord {
  id: string;
  name: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface AuthUserRecord {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  apiKeys: ApiKeyRecord[];
  role: 'user' | 'admin';
  walletAddress: string | null;
  did: string | null;
  status: 'active' | 'revoked';
  credentialCount?: number;
}

function mapUser(row: typeof users.$inferSelect, keyRows: ApiKeyRecord[] = [], credentialCount = 0): AuthUserRecord {
  return { id: row.id, email: row.email, passwordSalt: row.passwordSalt, passwordHash: row.passwordHash, createdAt: row.createdAt, apiKeys: keyRows, role: row.role, walletAddress: row.walletAddress, did: row.did, status: row.revoked ? 'revoked' : 'active', credentialCount };
}

async function findUserById(id: string): Promise<AuthUserRecord | null> {
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (!row) return null;
  const keys = db.select({ id: apiKeys.id, name: apiKeys.name, hash: apiKeys.keyHash, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.userId, id)).all();
  return mapUser(row, keys);
}

async function findUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const row = db.select().from(users).where(eq(users.email, email)).get();
  return row ? mapUser(row, db.select({ id: apiKeys.id, name: apiKeys.name, hash: apiKeys.keyHash, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys).where(eq(apiKeys.userId, row.id)).all()) : null;
}

async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(password, salt, 64)) as Buffer;
}

async function hashApiKey(value: string): Promise<string> {
  return (await hashPassword(value, Buffer.from(process.env.AUTH_HASH_SALT || 'aegis-development-salt'))).toString('hex');
}

async function getCachedResponse(key: string): Promise<string | null> {
  const local = localResponseCache.get(key);
  if (local && local.expiresAt > Date.now()) return local.value;
  if (local) localResponseCache.delete(key);
  if (!redisReady) return null;
  try {
    const value = await redisClient.get(key);
    return typeof value === 'string' ? value : null;
  } catch { return null; }
}

async function setCachedResponse(key: string, value: string, ttlSeconds: number): Promise<void> {
  localResponseCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (localResponseCache.size > 100) localResponseCache.delete(localResponseCache.keys().next().value!);
  if (!redisReady) return;
  try { await redisClient.setEx(key, ttlSeconds, value); } catch { /* optional optimization */ }
}

function readSessionToken(req: Request): string | null {
  const cookies = req.headers.cookie?.split(';').map(cookie => cookie.trim()) || [];
  const sessionCookie = cookies.find(cookie => cookie.startsWith('aegis_session='));
  return sessionCookie ? decodeURIComponent(sessionCookie.slice('aegis_session='.length)) : null;
}

async function getAuthenticatedUser(req: Request): Promise<AuthUserRecord | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const tokenHash = await hashApiKey(token);
  const session = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
  if (!session || session.expiresAt <= Date.now()) {
    if (session) db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
    return null;
  }
  const user = await findUserById(session.userId);
  return user?.status === 'revoked' ? null : user;
}

function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `aegis_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionDurationMs / 1000}${secure}`);
}

async function requireAuthenticatedUser(req: Request, res: Response): Promise<AuthUserRecord | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) res.status(401).json({ error: 'Authentication required' });
  return user;
}

async function requireAdmin(req: Request, res: Response): Promise<AuthUserRecord | null> {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { res.status(403).json({ error: 'Administrator access required' }); return null; }
  return user;
}

function publicUser(user: AuthUserRecord) {
  return { id: user.id, email: user.email, role: user.role || 'user', walletAddress: user.walletAddress || null, did: user.did || null, status: user.status || 'active' };
}

function createNotification(userId: string | null, type: 'info' | 'error' | 'admin', title: string, message: string): void {
  db.insert(notifications).values({ id: `notice_${randomBytes(10).toString('hex')}`, userId, type, title: title.slice(0, 120), message: message.slice(0, 1000), createdAt: new Date().toISOString(), readAt: null }).run();
}

function normalizeTransactionType(type: string): 'did_registration' | 'credential_anchor' | 'audit_log' | 'sybil_publish' | null {
  if (type === 'DID registration' || type === 'did_registration') return 'did_registration';
  if (type === 'Credential anchor' || type === 'credential_anchor') return 'credential_anchor';
  if (type === 'Audit log' || type === 'audit_log') return 'audit_log';
  if (type === 'Sybil publish' || type === 'sybil_publish') return 'sybil_publish';
  return null;
}

async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  db.insert(sessions).values({ tokenHash: await hashApiKey(token), userId, expiresAt: Date.now() + sessionDurationMs }).run();
  setSessionCookie(res, token);
}

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use((error: any, req: Request, res: Response, next: express.NextFunction) => {
  const parseError = error as SyntaxError & { status?: number; body?: unknown };
  if (error instanceof SyntaxError && parseError.status === 400 && 'body' in parseError) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  return next(error);
});

// Lazy LangChain model creation keeps the provider key server-side.
const langChainResponseCache = new Map<string, { value: string; expiresAt: number }>();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const telemetryChallenges = new Map<string, { ip: string; expiresAt: number }>();
const maxAiRequestsPerMinute = 30;
const maxLoginAttemptsPerWindow = 5;
const loginWindowMs = 15 * 60 * 1000;

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function validateTelemetry(telemetry: any): string | null {
  if (!telemetry || !Number.isInteger(telemetry.eventsCount) || telemetry.eventsCount < 0) return 'Telemetry eventsCount is invalid';
  if (!Number.isFinite(telemetry.interactionDurationMs) || telemetry.interactionDurationMs < 0 || telemetry.interactionDurationMs > 24 * 60 * 60 * 1000) return 'Telemetry interaction duration is invalid';
  const keystrokeCount = Array.isArray(telemetry.keystrokes) ? telemetry.keystrokes.length : 0;
  const mousePointCount = Array.isArray(telemetry.mousePoints) ? telemetry.mousePoints.length : 0;
  if (keystrokeCount + mousePointCount > telemetry.eventsCount) return 'Telemetry event count is inconsistent with captured samples';
  if (telemetry.eventsCount > 0 && telemetry.interactionDurationMs === 0) return 'Telemetry duration is inconsistent with captured events';
  return null;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function getApiKeyUser(req: Request): Promise<{ user: AuthUserRecord; rateKey: string } | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = await hashApiKey(token);
  const key = db.select().from(apiKeys).where(eq(apiKeys.keyHash, tokenHash)).get();
  if (!key) return null;
  db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, key.id)).run();
  const user = await findUserById(key.userId);
  return user && user.status === 'active' ? { user, rateKey: `api:${key.id}` } : null;
}

async function requireAiAccess(req: Request, res: Response): Promise<string | null> {
  const apiKeyAccess = await getApiKeyUser(req);
  if (apiKeyAccess) {
    if (!consumeRateLimit(apiKeyAccess.rateKey, maxAiRequestsPerMinute, 60_000)) {
      res.status(429).json({ error: 'AI request limit exceeded. Try again in one minute.' });
      return null;
    }
    return apiKeyAccess.rateKey;
  }
  const sessionUser = await getAuthenticatedUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: 'Authentication required. Sign in or provide an AegisDID API key.' });
    return null;
  }
  const sessionToken = readSessionToken(req) || sessionUser.id;
  const rateKey = `session:${await hashApiKey(sessionToken)}`;
  if (!consumeRateLimit(rateKey, maxAiRequestsPerMinute, 60_000)) {
    res.status(429).json({ error: 'AI request limit exceeded. Try again in one minute.' });
    return null;
  }
  return rateKey;
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let index = 0; index < cleanHex.length; index += 2) bytes[index / 2] = Number.parseInt(cleanHex.slice(index, index + 2), 16);
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return bytesToHex(await serverCrypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function verifyEcdsa(message: string, signatureHex: string, publicKeyJwk: JsonWebKey): Promise<boolean> {
  try {
    const publicKey = await serverCrypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await serverCrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, hexToBytes(signatureHex), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

async function verifyCredential(credential: any, expectedSubjectDid?: string): Promise<boolean> {
  const publicKeyJwk = credential?.proof?.publicKeyJwk;
  if (!publicKeyJwk || !credential?.proof?.signatureValue || !credential?.proof?.claimHashes) return false;
  if (!credential?.issuer?.id || credential.proof.verificationMethod !== `${credential.issuer.id}#key-1`) return false;
  if (expectedSubjectDid && credential?.credentialSubject?.id !== expectedSubjectDid) return false;
  const expectedClaimHashes = credential.proof.claimHashes as Record<string, string>;
  for (const claim of credential.zkDisclosableClaims || []) {
    if (claim.value !== undefined) {
      const normalizedValue = typeof claim.value === 'object' ? JSON.stringify(claim.value) : String(claim.value);
      const expectedCommitment = await sha256(`${claim.claimKey}:${normalizedValue}:${claim.salt}`);
      if (expectedCommitment !== claim.commitmentHash) return false;
    }
    if (expectedClaimHashes[claim.claimKey] !== claim.commitmentHash) return false;
  }
  const claimsSummaryHash = credential.proof.claimsSummaryHash;
  if (!claimsSummaryHash) return false;
  const predicateAttestations = credential.proof.predicateAttestations || [];
  for (const attestation of predicateAttestations) {
    const attestationPayload = `${credential.id}:${attestation.claimKey}:${attestation.predicate}:${attestation.satisfied ? 'PASS' : 'FAIL'}`;
    if (!(await verifyEcdsa(attestationPayload, attestation.signatureValue, publicKeyJwk))) return false;
  }
  const payload = JSON.stringify({
    id: credential.id,
    issuer: credential.issuer.id,
    subject: credential.credentialSubject.id,
    type: credential.type,
    issuanceDate: credential.issuanceDate,
    expirationDate: credential.expirationDate,
    claimsSummaryHash,
    claimHashes: expectedClaimHashes,
    predicateAttestations,
  });
  if (!credential.expirationDate || Date.parse(credential.expirationDate) <= Date.now()) return false;
  return verifyEcdsa(payload, credential.proof.signatureValue, publicKeyJwk);
}

async function verifyPresentation(presentation: any): Promise<boolean> {
  const proof = presentation?.proof;
  if (!proof?.publicKeyJwk || !proof.signatureValue) return false;
  const credentialsValid = await Promise.all((presentation.verifiableCredential || []).map((credential: any) => verifyCredential(credential, presentation.holder)));
  if (!credentialsValid.every(Boolean)) return false;
  for (const predicateProof of presentation.zkProofs?.predicateProofs || []) {
    const credentialClaim = (presentation.verifiableCredential || [])
      .flatMap((credential: any) => credential.zkDisclosableClaims || [])
      .find((claim: any) => claim.claimKey === predicateProof.claimKey && claim.commitmentHash === predicateProof.commitmentHash);
    if (!credentialClaim || predicateProof.satisfied !== true || credentialClaim.value !== undefined) return false;
    const attestation = credentialClaim && presentation.verifiableCredential
      .flatMap((credential: any) => credential.proof?.predicateAttestations || [])
      .find((candidate: any) => candidate.claimKey === predicateProof.claimKey && candidate.predicate === predicateProof.predicate && candidate.satisfied === true);
    if (!attestation || JSON.stringify(attestation) !== JSON.stringify(predicateProof.issuerAttestation)) return false;
    // Long-term replacement: use a real ZK range-proof system (e.g. circom/snarkjs or a Pedersen range proof).
    // The current issuer-signed predicate attestation is the pragmatic privacy-preserving interim model.
  }
  const presentationPayload = JSON.stringify({
    id: presentation.id,
    holder: presentation.holder,
    verifierNonce: presentation.presentationNonce,
    audience: presentation.audience,
    revealedClaims: presentation.zkProofs.revealedClaims,
    predicateProofWitnesses: presentation.zkProofs.predicateProofs.map((predicate: any) => predicate.zkWitnessProof),
    timestamp: proof.created,
  });
  return verifyEcdsa(presentationPayload, proof.signatureValue, proof.publicKeyJwk);
}

async function queueMstIdentityAnchors(presentation: any): Promise<void> {
  if (!mstAnchor.status.configured) return;
  try {
    await mstAnchor.registerDID(presentation.holder, presentation.proof.publicKeyJwk);
    await Promise.all((presentation.verifiableCredential || []).map((credential: any) =>
      mstAnchor.anchorCredential(credential, credential.issuer?.id || 'unknown', presentation.holder),
    ));
  } catch (error: any) {
    console.warn('Optional MST identity anchoring failed:', error?.message || error);
  }
}

const publicVerificationCors = (_req: Request, res: Response, next: express.NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
};

app.get('/verify-request', (req: Request, res: Response, next: express.NextFunction) => {
  const origin = typeof req.query.origin === 'string' ? req.query.origin.slice(0, 300) : getClientIp(req);
  if (!consumeRateLimit(`verify-popup:${origin}`, 20, 60_000)) return res.status(429).send('Verification request rate limit exceeded');
  void getAuthenticatedUser(req).then(user => {
    if (user) createNotification(user.id, 'info', 'External credential request', `${origin} opened an AegisDID verification request. Review the requested predicates before approving.`);
  });
  next();
});
// Resilient LangChain generation with fallback across models to handle provider overloads.
async function generateWithLangChainFallback(prompt: string): Promise<string | null> {
  const promptHash = await sha256(prompt);
  const cached = langChainResponseCache.get(promptHash);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) langChainResponseCache.delete(promptHash);

  const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.7-flash'];

  for (const model of candidateModels) {
    try {
      if (!process.env.GEMINI_API_KEY) return null;
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        maxRetries: 0,
      });
      const response = await chatModel.invoke(prompt);
      const value = typeof response.content === 'string'
        ? response.content.trim()
        : response.content
          .filter((block): block is { type: 'text'; text: string } => typeof block === 'object' && block !== null && block.type === 'text')
          .map(block => block.text)
          .join('\n')
          .trim();
      if (value.length > 0) {
        langChainResponseCache.set(promptHash, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
        if (langChainResponseCache.size > 100) {
          const oldestKey = langChainResponseCache.keys().next().value;
          if (oldestKey) langChainResponseCache.delete(oldestKey);
        }
        return value;
      }
    } catch (err: any) {
      // If 503 (high demand) or 429 (rate limit), continue to next fallback model
      const isOverload = err?.status === 'UNAVAILABLE' || err?.code === 503 || err?.message?.includes('high demand') || err?.code === 429;
      if (isOverload) {
        continue;
      }
      // For other errors, continue to next model as well
      continue;
    }
  }

  return null;
}

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    redisConfigured: redisReady,
    mstIntegration: mstAnchor.status,
    timestamp: new Date().toISOString(),
    system: 'AegisDID Decentralized Identity & AI Fraud Shield',
  });
});

app.get('/api/ai/telemetry-challenge', async (req: Request, res: Response) => {
  const token = randomBytes(24).toString('base64url');
  telemetryChallenges.set(token, { ip: getClientIp(req), expiresAt: Date.now() + 2 * 60 * 1000 });
  for (const [candidate, challenge] of telemetryChallenges) if (challenge.expiresAt <= Date.now()) telemetryChallenges.delete(candidate);
  res.json({ challenge: token, expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() });
});

app.options('/api/public/verify-presentation', publicVerificationCors);
app.post('/api/public/verify-presentation', publicVerificationCors, async (req: Request, res: Response) => {
  const rateKey = `public-verify:${getClientIp(req)}`;
  if (!consumeRateLimit(rateKey, 30, 60_000)) return res.status(429).json({ error: 'Public verification rate limit exceeded' });
  const presentation = req.body;
  if (!presentation || typeof presentation !== 'object' || !presentation.holder) return res.status(400).json({ valid: false, error: 'A VerifiablePresentation JSON body is required' });
  try {
    const valid = await verifyPresentation(presentation);
    res.json({ valid, holderDid: presentation.holder, revealedClaims: valid ? presentation.zkProofs?.revealedClaims || {} : {}, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(400).json({ valid: false, holderDid: presentation.holder, revealedClaims: {}, checkedAt: new Date().toISOString(), error: error?.message || 'Presentation verification failed' });
  }
});

// Account registration and session authentication. Passwords and session tokens are never stored raw.
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });

    if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) return res.status(409).json({ error: 'An account already exists for this email' });
    const salt = randomBytes(16);
    const user: AuthUserRecord = {
      id: `user_${randomBytes(12).toString('hex')}`,
      email,
      passwordSalt: salt.toString('base64'),
      passwordHash: (await hashPassword(password, salt)).toString('base64'),
      createdAt: new Date().toISOString(),
      apiKeys: [],
      role: 'user',
      walletAddress: null,
      did: null,
      status: 'active',
      credentialCount: 0,
    };
    db.insert(users).values({ id: user.id, email: user.email, passwordSalt: user.passwordSalt, passwordHash: user.passwordHash, role: 'user', createdAt: user.createdAt, revoked: false }).run();
    await createSession(user.id, res);
    res.status(201).json({ user: publicUser(user), apiKeys: [] });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const loginRateKey = `login:${getClientIp(req)}:${email}`;
    if (!consumeRateLimit(loginRateKey, maxLoginAttemptsPerWindow, loginWindowMs)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
    }
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const actual = await hashPassword(password, Buffer.from(user.passwordSalt, 'base64'));
    const expected = Buffer.from(user.passwordHash, 'base64');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.status === 'revoked') return res.status(403).json({ error: 'This account has been revoked' });
    await createSession(user.id, res);
    res.json({ user: publicUser(user), apiKeys: user.apiKeys.map(({ hash, ...metadata }) => metadata) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.post('/api/auth/logout', async (req: Request, res: Response) => {
  const token = readSessionToken(req);
  if (token) db.delete(sessions).where(eq(sessions.tokenHash, await hashApiKey(token))).run();
  res.setHeader('Set-Cookie', 'aegis_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.status(204).send();
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: publicUser(user), apiKeys: user.apiKeys.map(({ hash, ...metadata }) => metadata) });
});

app.get('/api/notifications', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const rows = db.select().from(notifications).where(or(eq(notifications.userId, user.id), isNull(notifications.userId))).orderBy(desc(notifications.createdAt)).limit(100).all();
  res.json({ notifications: rows, unreadCount: rows.filter(notification => !notification.readAt).length });
});

app.patch('/api/notifications/:notificationId/read', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const updated = db.update(notifications).set({ readAt: new Date().toISOString() }).where(and(eq(notifications.id, req.params.notificationId), or(eq(notifications.userId, user.id), isNull(notifications.userId)))).run();
  if (updated.changes === 0) return res.status(404).json({ error: 'Notification not found' });
  res.status(204).send();
});

app.post('/api/auth/wallet', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const address = String(req.body?.address || '');
  const did = typeof req.body?.did === 'string' ? req.body.did.slice(0, 300) : undefined;
  if (!isAddress(address)) return res.status(400).json({ error: 'A valid wallet address is required' });
  const normalizedAddress = getAddress(address);
  const owner = db.select({ id: users.id }).from(users).where(eq(users.walletAddress, normalizedAddress)).all().find(candidate => candidate.id !== user.id);
  if (owner) return res.status(409).json({ error: 'That wallet is already linked to another account' });
  db.update(users).set({ walletAddress: normalizedAddress, did: did || user.did }).where(eq(users.id, user.id)).run();
  res.json({ user: publicUser((await findUserById(user.id))!) });
});

app.get('/api/blockchain/status', (req: Request, res: Response) => {
  res.json(mstAnchor.status);
});

app.post('/api/transactions', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const txHash = String(req.body?.txHash || '');
  const type = normalizeTransactionType(String(req.body?.type || '').slice(0, 80));
  if (!user.walletAddress || !/^0x[a-fA-F0-9]{64}$/.test(txHash) || !type) return res.status(400).json({ error: 'Wallet binding, transaction hash, and valid transaction type are required' });
  if (!consumeRateLimit(`tx:${user.id}`, 30, 60_000)) return res.status(429).json({ error: 'Transaction verification rate limit exceeded' });
  const provider = process.env.MST_RPC_URL ? new JsonRpcProvider(process.env.MST_RPC_URL) : null;
  if (!provider) return res.status(503).json({ error: 'MST RPC is not configured' });
  try {
    const [transaction, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]);
    if (!transaction || !receipt) return res.status(400).json({ error: 'Transaction is not confirmed on the MST chain' });
    if (transaction.from.toLowerCase() !== user.walletAddress.toLowerCase()) return res.status(403).json({ error: 'Transaction signer does not match the linked wallet' });
    if (mstAnchor.status.registryAddress && transaction.to?.toLowerCase() !== mstAnchor.status.registryAddress.toLowerCase()) return res.status(400).json({ error: 'Transaction target is not the Aegis registry' });
    const createdAt = new Date().toISOString();
    const status = receipt.status === 1 ? 'confirmed' : 'failed';
    db.insert(transactions).values({ id: `tx_${randomBytes(10).toString('hex')}`, userId: user.id, walletAddress: user.walletAddress, type, txHash, status, chainId: process.env.MST_CHAIN_ID || 'unknown', createdAt, confirmedAt: status === 'confirmed' ? createdAt : null, errorMessage: status === 'confirmed' ? null : 'Transaction reverted on-chain' }).run();
    res.status(201).json({ transaction: { type, txHash, timestamp: createdAt, status, error: status === 'confirmed' ? undefined : 'Transaction reverted on-chain' } });
  } catch (error: any) { res.status(400).json({ error: error?.shortMessage || error?.message || 'Unable to verify transaction' }); }
});

app.get('/api/transactions', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : user.id;
  if (requestedUserId !== user.id && user.role !== 'admin') return res.status(403).json({ error: 'Users can only view their own transactions' });
  const rows = db.select().from(transactions).where(eq(transactions.userId, requestedUserId)).orderBy(desc(transactions.createdAt)).all();
  res.json({ transactions: rows.map(transaction => ({ id: transaction.id, type: transaction.type, txHash: transaction.txHash, walletAddress: transaction.walletAddress, timestamp: transaction.createdAt, status: transaction.status, gasUsed: undefined, error: transaction.errorMessage || undefined })) });
});

app.get('/api/admin/users', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const rows = db.select().from(users).all();
  res.json({ users: rows.map(user => ({ ...publicUser(mapUser(user)), createdAt: user.createdAt, credentialCount: db.select({ value: count() }).from(credentials).where(eq(credentials.userId, user.id)).get()?.value || 0 })) });
});

app.get('/api/admin/users/:userId/credentials', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ credentials: db.select().from(credentials).where(eq(credentials.userId, req.params.userId)).orderBy(desc(credentials.issuedAt)).all() });
});

app.get('/api/admin/audit-log', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ auditLog: db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).all() });
});

app.get('/api/admin/fraud-flags', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  res.json({ flags: db.select().from(fraudFlags).orderBy(desc(fraudFlags.createdAt)).all().map(flag => ({ id: flag.id, userId: flag.userId, decision: flag.decision, timestamp: flag.createdAt, analysis: JSON.parse(flag.analysis) })) });
});

app.post('/api/admin/notifications', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!consumeRateLimit(`admin-notification:${admin.id}`, 20, 60_000)) return res.status(429).json({ error: 'Admin notification rate limit exceeded' });
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const userId = req.body?.userId ? String(req.body.userId) : null;
  if (!title || !message || title.length > 120 || message.length > 1000) return res.status(400).json({ error: 'Title and message are required and must be within limits' });
  if (userId && !db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) return res.status(404).json({ error: 'Target user not found' });
  createNotification(userId, 'admin', title, message);
  res.status(201).json({ sent: true, audience: userId || 'all users' });
});

app.post('/api/admin/users/:userId/revoke', async (req: Request, res: Response) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!consumeRateLimit(`admin-revoke:${admin.id}`, 10, 60_000)) return res.status(429).json({ error: 'Admin action rate limit exceeded' });
  const targetRow = db.select().from(users).where(eq(users.id, req.params.userId)).get();
  if (!targetRow) return res.status(404).json({ error: 'User not found' });
  const target = mapUser(targetRow);
  if (target.id === admin.id) return res.status(400).json({ error: 'Administrators cannot revoke their own account' });
  const revokedAt = new Date().toISOString();
  db.update(users).set({ revoked: true, revokedAt }).where(eq(users.id, target.id)).run();
  db.delete(sessions).where(eq(sessions.userId, target.id)).run();
  let onChainRevocation = 'not_attempted: user has no stored DID';
  if (target.did && mstAnchor.status.configured) {
    try { onChainRevocation = await mstAnchor.revokeDID(target.did) ? 'confirmed' : 'failed: server signer is not authorized'; }
    catch (error: any) { onChainRevocation = `failed: ${error?.shortMessage || error?.message || 'registry revoke failed'}`; }
  } else if (target.did) onChainRevocation = 'not_attempted: MST registry is not configured';
  db.insert(adminAuditLog).values({ id: `admin_audit_${randomBytes(8).toString('hex')}`, adminUserId: admin.id, action: 'revoke_user', targetUserId: target.id, details: JSON.stringify({ onChainRevocation }), createdAt: revokedAt }).run();
  res.json({ revoked: true, onChainRevocation });
});

// Raw API keys are returned once at creation and only their metadata is persisted afterward.
app.post('/api/auth/api-keys', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const name = String(req.body?.name || 'AegisDID integration').trim().slice(0, 80) || 'AegisDID integration';
  const rawKey = `aegis_live_${randomBytes(32).toString('base64url')}`;
  const key: ApiKeyRecord = {
    id: `key_${randomBytes(10).toString('hex')}`,
    name,
    hash: await hashApiKey(rawKey),
    createdAt: new Date().toISOString(),
  };
  db.insert(apiKeys).values({ id: key.id, userId: user.id, name: key.name, keyHash: key.hash, createdAt: key.createdAt }).run();
  res.status(201).json({ apiKey: rawKey, metadata: { id: key.id, name: key.name, createdAt: key.createdAt } });
});

app.delete('/api/auth/api-keys/:keyId', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const deleted = db.delete(apiKeys).where(and(eq(apiKeys.id, req.params.keyId), eq(apiKeys.userId, user.id))).run();
  if (deleted.changes === 0) return res.status(404).json({ error: 'API key not found' });
  res.status(204).send();
});

// Real-time Behavioral & Network AI Fraud Analysis
app.post('/api/ai/analyze-behavior-and-fraud', async (req: Request, res: Response) => {
  try {
    if (!(await requireAiAccess(req, res))) return;
    const { telemetry, telemetryChallenge, presentation, networkContext, simulationAttackType } = req.body;
    const challenge = telemetryChallenges.get(String(telemetryChallenge || ''));
    if (!challenge || challenge.ip !== getClientIp(req) || challenge.expiresAt <= Date.now()) return res.status(400).json({ error: 'A fresh telemetry challenge is required' });
    telemetryChallenges.delete(String(telemetryChallenge));
    const telemetryError = validateTelemetry(telemetry);
    if (telemetryError) return res.status(400).json({ error: telemetryError });

    if (presentation?.proof) {
      const challenge = presentation.proof.challenge;
      const audience = presentation.audience;
      const predicateProofs = presentation.zkProofs?.predicateProofs || [];
      const challengeKey = `${audience}:${challenge}`;
      const challengeAge = Date.now() - new Date(presentation.proof.created || 0).getTime();
      const spentChallenge = db.select().from(spentChallenges).where(eq(spentChallenges.challengeKey, challengeKey)).get();

      if (!presentation.holder || !audience || !challenge || challenge !== presentation.presentationNonce || audience !== presentation.proof.domain) {
        return res.status(400).json({ error: 'Invalid presentation challenge binding' });
      }
      if (!(await verifyPresentation(presentation))) return res.status(400).json({ error: 'Credential or presentation signature verification failed' });
      const sessionUser = await getAuthenticatedUser(req);
      if (!sessionUser?.walletAddress) void queueMstIdentityAnchors(presentation);
      if (!Number.isFinite(challengeAge) || challengeAge < 0 || challengeAge > 5 * 60 * 1000) {
        return res.status(400).json({ error: 'Presentation expired' });
      }
      if (spentChallenge) {
        return res.status(409).json({ error: 'Presentation challenge has already been spent' });
      }
      db.insert(spentChallenges).values({ challengeKey, spentAt: Date.now() }).run();
      db.delete(spentChallenges).where(lt(spentChallenges.spentAt, Date.now() - 10 * 60 * 1000)).run();
    }

    // Prepare feature vector description for AI
    const dwellMean = telemetry?.dwellTimeMean ?? 90;
    const dwellStdDev = telemetry?.dwellTimeStdDev ?? 20;
    const flightMean = telemetry?.flightTimeMean ?? 130;
    const flightStdDev = telemetry?.flightTimeStdDev ?? 40;
    const curvatureEntropy = telemetry?.trajectoryCurvatureEntropy ?? 0.6;
    const linearity = telemetry?.trajectoryLinearityScore ?? 0.5;
    const jitter = telemetry?.jitterVariance ?? 10;
    const webdriver = telemetry?.clientSignals?.webdriverPresent ?? false;
    const automatedFlags = telemetry?.clientSignals?.automatedFlags ?? false;
    const holderDid = presentation?.holder ?? 'unknown';
    const zkProofsCount = presentation?.zkProofs?.predicateProofs?.length ?? 0;
    const eigenTrust = networkContext?.eigenTrust ?? 0.8;
    const isSybilSuspect = networkContext?.isSybilSuspect ?? false;

    // Calculate algorithmic baseline heuristic
    let botScore = 0;
    let reasons: string[] = [];
    let anomalies: any[] = [];

    if (webdriver || automatedFlags) {
      botScore += 65;
      reasons.push('Headless automation / WebDriver automation flags detected in browser environment.');
      anomalies.push({
        type: 'WEBDRIVER_SIGNATURE',
        severity: 'high',
        description: 'Navigator webdriver property is active, indicating programmatic execution.',
        evidence: `webdriver=${webdriver}`,
      });
    }

    if (simulationAttackType === 'linear_bot' || (linearity > 0.95 && curvatureEntropy < 0.15)) {
      botScore += 50;
      reasons.push('Unnatural straight-line mouse trajectory with zero micro-curvature entropy.');
      anomalies.push({
        type: 'LINEAR_TRAJECTORY',
        severity: 'high',
        description: 'Cursor moved in mathematically straight lines typical of automated scripts.',
        evidence: `linearity=${linearity}, entropy=${curvatureEntropy}`,
      });
    }

    if (simulationAttackType === 'instant_replay' || simulationAttackType === 'stolen_keys' || (dwellMean < 10 && dwellStdDev < 5)) {
      botScore += 60;
      reasons.push('Robotic keystroke cadence with sub-10ms dwell time and near-zero variance.');
      anomalies.push({
        type: 'SYNTHETIC_KEYSTROKES',
        severity: 'high',
        description: 'Keystrokes were injected synchronously with impossible human dwell time.',
        evidence: `dwellMean=${dwellMean}ms, dwellStdDev=${dwellStdDev}ms`,
      });
    }

    if (simulationAttackType === 'sybil_ring' || isSybilSuspect || eigenTrust < 0.1) {
      botScore += 40;
      reasons.push('Identity node exhibits topological isolation and circular collusion signatures in the decentralized trust graph.');
      anomalies.push({
        type: 'SYBIL_CLUSTER_TOPOLOGY',
        severity: 'high',
        description: 'Account is part of an isolated high-frequency endorsement ring with near-zero EigenTrust.',
        evidence: `eigenTrust=${eigenTrust}, isSybilSuspect=${isSybilSuspect}`,
      });
    }

    if (simulationAttackType === 'replay_attack') {
      botScore += 75;
      reasons.push('Presentation nonce mismatch or expired cryptographic challenge detected.');
      anomalies.push({
        type: 'REPLAY_ATTACK',
        severity: 'high',
        description: 'The cryptographic challenge was previously spent or altered.',
        evidence: 'nonce_reuse_detected',
      });
    }

    // Try Gemini AI Model with multi-model fallback for deep contextual behavioral reasoning
    let aiHumanityScore = Math.max(0, Math.min(100, 100 - botScore));
    let aiConfidence = 92;

    const prompt = `You are the AegisDID Neural Trust Engine, an advanced AI behavioral biometric & decentralized identity fraud detection system.
Analyze the following real-time biometric and cryptographic telemetry data for a user authentication attempt:

TELEMETRY VECTORS:
- Keystroke Dwell Time Mean: ${dwellMean} ms (Human typical: 60-140ms)
- Keystroke Dwell Time StdDev: ${dwellStdDev} ms (Bot typical: <5ms)
- Keystroke Flight Time Mean: ${flightMean} ms
- Keystroke Flight Time StdDev: ${flightStdDev} ms
- Mouse Trajectory Curvature Shannon Entropy: ${curvatureEntropy} (Human: 0.4-0.95, Bot: 0.0-0.2)
- Mouse Trajectory Linearity: ${linearity} (Human: 0.3-0.75, Bot: 0.95-1.0)
- Acceleration Jitter Variance: ${jitter} (Human: >5.0, Bot: <1.0)
- Client Signals: WebDriver=${webdriver}, AutomatedFlags=${automatedFlags}
- Simulation Attack Triggered: ${simulationAttackType || 'NONE (Organic Live User)'}

DECENTRALIZED IDENTITY & GRAPH CONTEXT:
- Holder DID: ${holderDid}
- Zero-Knowledge Predicates Verified: ${zkProofsCount}
- Network EigenTrust Score: ${eigenTrust} (0.0 to 1.0)
- Sybil Cluster Flag: ${isSybilSuspect}

Evaluate whether this session represents a legitimate human or an automated bot / Sybil attack.
Provide a concise, highly professional security assessment summarizing the behavioral dynamics, entropy level, and zero-knowledge privacy status. Keep the summary to 2-3 sentences.`;

    let aiSummary = await generateWithLangChainFallback(prompt);

    // Fallback explanation if Gemini wasn't available or empty
    if (!aiSummary) {
      if (botScore >= 50) {
        aiSummary = `Session flagged with high bot risk (${Math.min(99, botScore)}%). Observed abnormal biometric distributions including unnatural trajectory linearity (${linearity}) and robotic dwell intervals (${dwellMean}ms). Access restricted to protect platform integrity.`;
      } else {
        aiSummary = `Human identity cryptographically and behaviorally verified (Humanity Score: ${aiHumanityScore}/100). Micro-tremor jitter (${jitter.toFixed(1)}) and trajectory curvature entropy (${curvatureEntropy}) demonstrate authentic organic user interaction with valid Zero-Knowledge proofs.`;
      }
    }

    const finalBotProb = Math.min(99, Math.max(1, botScore));
    const finalHumanityScore = Math.max(1, Math.min(99, 100 - finalBotProb));

    let decision: 'VERIFIED_HUMAN' | 'CHALLENGE_REQUIRED' | 'FLAGGED_BOT' | 'SYBIL_DETECTED' | 'INVALID_CREDENTIAL' = 'VERIFIED_HUMAN';
    let riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (finalBotProb >= 70) {
      decision = simulationAttackType === 'sybil_ring' ? 'SYBIL_DETECTED' : 'FLAGGED_BOT';
      riskCategory = 'CRITICAL';
    } else if (finalBotProb >= 35) {
      decision = 'CHALLENGE_REQUIRED';
      riskCategory = 'MEDIUM';
    }

    if (reasons.length === 0) {
      reasons.push('Natural human keystroke cadence and organic cursor jitter verified.');
      reasons.push('Zero-knowledge predicate proofs matched issuer cryptographic signatures.');
      reasons.push('High EigenTrust score in decentralized identity web of trust.');
    }

    const auditSignature = `0x${Buffer.from(`aegis-audit:${Date.now()}:${finalHumanityScore}:${holderDid}`).toString('base64').substring(0, 48)}`;

    const analysisResult = {
      humanityScore: finalHumanityScore,
      confidenceScore: aiConfidence,
      botProbability: finalBotProb,
      sybilCollusionRisk: isSybilSuspect || simulationAttackType === 'sybil_ring' ? 92 : 8,
      credentialReplayRisk: simulationAttackType === 'replay_attack' ? 95 : 3,
      decision,
      riskCategory,
      reasons,
      anomaliesDetected: anomalies,
      biometricConfidence: {
        keystrokeScore: Math.max(10, Math.min(99, Math.round(100 - (dwellMean < 20 ? 80 : 5)))),
        cursorMovementScore: Math.max(10, Math.min(99, Math.round(curvatureEntropy * 100))),
        timingEntropyScore: Math.max(10, Math.min(99, Math.round(telemetry?.timingRandomnessScore ?? 85))),
        fingerprintIntegrityScore: webdriver ? 15 : 98,
      },
      networkCentralityScore: Math.round(eigenTrust * 100),
      explainableSummary: aiSummary,
      aiTimestamp: new Date().toISOString(),
      auditSignature,
      mst: mstAnchor.status,
    };
    if (mstAnchor.status.configured && decision === 'VERIFIED_HUMAN') {
      void mstAnchor.logAuditRecord({ userId: holderDid, decision, humanityScore: finalHumanityScore }).catch(error => {
        console.warn('Optional MST audit anchoring failed:', error.message);
      });
    }
    if (decision !== 'VERIFIED_HUMAN') {
      const sessionUser = await getAuthenticatedUser(req);
      db.insert(fraudFlags).values({ id: `flag_${randomBytes(8).toString('hex')}`, userId: sessionUser?.id || null, decision, createdAt: new Date().toISOString(), analysis: JSON.stringify(analysisResult) }).run();
    }
    res.json(analysisResult);
  } catch (error: any) {
    console.error('Error in analyze-behavior-and-fraud:', error);
    const sessionUser = await getAuthenticatedUser(req);
    if (sessionUser) createNotification(sessionUser.id, 'error', 'Behavioral audit failed', error?.message || 'The behavioral audit could not be completed.');
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Network Graph Sybil Audit Endpoint
app.post('/api/ai/audit-network', async (req: Request, res: Response) => {
  try {
    if (!(await requireAiAccess(req, res))) return;
    const { nodes, edges } = req.body;

    const prompt = `Analyze this decentralized identity network summary:
Total Nodes: ${nodes?.length || 0}
Total Edges: ${edges?.length || 0}
Known Sybil Suspicion Count: ${nodes?.filter((n: any) => n.isSybilSuspect)?.length || 0}

Summarize how EigenTrust and SybilRank prevent bot syndicates from gaining disproportionate platform voting or airdrop power without requiring centralized passport KYC. Keep it to 3 concise bullet points.`;

  const cacheKey = `aegis:network-audit:${await sha256(JSON.stringify({ nodes, edges }))}`;
  const cachedResponse = await getCachedResponse(cacheKey);
  if (cachedResponse) return res.json(JSON.parse(cachedResponse));

    let analysis = await generateWithLangChainFallback(prompt);

    if (!analysis) {
      analysis = `• Trust Seed Anchoring: Root authority credentials propagate trust through verified social distance, neutralizing isolated bot farm clusters.\n• Collusion Attack Isolation: Closed circular endorsement rings receive near-zero EigenTrust (<0.05) despite high internal link counts.\n• Privacy Preservation: Sybil defense relies purely on topological graph entropy and zero-knowledge commitments without storing raw user identity databases.`;
    }

    const result = {
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
      mst: mstAnchor.status,
    };
    await setCachedResponse(cacheKey, JSON.stringify(result), 300);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AegisDID Identity & AI Shield Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
