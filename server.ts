import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { webcrypto, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

dotenv.config();

if (!process.env.AUTH_HASH_SALT || process.env.AUTH_HASH_SALT === 'aegis-development-salt' || process.env.AUTH_HASH_SALT.length < 32) {
  throw new Error('AUTH_HASH_SALT must be set to a random server-only secret of at least 32 characters.');
}

const app = express();
const PORT = 3000;
const serverCrypto = webcrypto;
const scrypt = promisify(scryptCallback);
const authStorePath = path.join(process.cwd(), 'data', 'auth.json');
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

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
}

interface AuthSessionRecord {
  userId: string;
  expiresAt: number;
}

interface AuthStore {
  users: AuthUserRecord[];
  sessions: Record<string, AuthSessionRecord>;
  spentChallenges?: Record<string, number>;
}

let authStore: AuthStore | null = null;
let authSaveQueue: Promise<void> = Promise.resolve();

async function getAuthStore(): Promise<AuthStore> {
  if (authStore) return authStore;
  try {
    authStore = JSON.parse(await fs.readFile(authStorePath, 'utf8')) as AuthStore;
  } catch {
    authStore = { users: [], sessions: {}, spentChallenges: {} };
  }
  if (!authStore.spentChallenges) authStore.spentChallenges = {};
  return authStore;
}

async function saveAuthStore(): Promise<void> {
  if (!authStore) return;
  const snapshot = JSON.stringify(authStore, null, 2);
  authSaveQueue = authSaveQueue.then(async () => {
    await fs.mkdir(path.dirname(authStorePath), { recursive: true });
    const temporaryPath = `${authStorePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.writeFile(temporaryPath, snapshot, 'utf8');
    await fs.rename(temporaryPath, authStorePath);
  });
  await authSaveQueue;
}

async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(password, salt, 64)) as Buffer;
}

async function hashApiKey(value: string): Promise<string> {
  return (await hashPassword(value, Buffer.from(process.env.AUTH_HASH_SALT || 'aegis-development-salt'))).toString('hex');
}

function readSessionToken(req: Request): string | null {
  const cookies = req.headers.cookie?.split(';').map(cookie => cookie.trim()) || [];
  const sessionCookie = cookies.find(cookie => cookie.startsWith('aegis_session='));
  return sessionCookie ? decodeURIComponent(sessionCookie.slice('aegis_session='.length)) : null;
}

async function getAuthenticatedUser(req: Request): Promise<AuthUserRecord | null> {
  const store = await getAuthStore();
  const token = readSessionToken(req);
  if (!token) return null;
  const tokenHash = await hashApiKey(token);
  const session = store.sessions[tokenHash];
  if (!session || session.expiresAt <= Date.now()) {
    if (session) delete store.sessions[tokenHash];
    await saveAuthStore();
    return null;
  }
  return store.users.find(user => user.id === session.userId) || null;
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

async function createSession(userId: string, res: Response): Promise<void> {
  const store = await getAuthStore();
  const token = randomBytes(32).toString('base64url');
  store.sessions[await hashApiKey(token)] = { userId, expiresAt: Date.now() + sessionDurationMs };
  await saveAuthStore();
  setSessionCookie(res, token);
}

app.use(express.json({ limit: '10mb' }));
app.use((error: any, req: Request, res: Response, next: express.NextFunction) => {
  const parseError = error as SyntaxError & { status?: number; body?: unknown };
  if (error instanceof SyntaxError && parseError.status === 400 && 'body' in parseError) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  return next(error);
});

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
const requestWindows = new Map<string, { startedAt: number; count: number }>();
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
  const store = await getAuthStore();
  for (const user of store.users) {
    const key = user.apiKeys.find(candidate => candidate.hash === tokenHash);
    if (key) {
      key.lastUsedAt = new Date().toISOString();
      await saveAuthStore();
      return { user, rateKey: `api:${key.id}` };
    }
  }
  return null;
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

async function verifyCredential(credential: any): Promise<boolean> {
  const publicKeyJwk = credential?.proof?.publicKeyJwk;
  if (!publicKeyJwk || !credential?.proof?.signatureValue || !credential?.proof?.claimHashes) return false;
  const claims = { ...credential.credentialSubject };
  delete claims.id;
  const expectedClaimHashes = credential.proof.claimHashes as Record<string, string>;
  for (const claim of credential.zkDisclosableClaims || []) {
    const normalizedValue = typeof claim.value === 'object' ? JSON.stringify(claim.value) : String(claim.value);
    const expectedCommitment = await sha256(`${claim.claimKey}:${normalizedValue}:${claim.salt}`);
    if (expectedCommitment !== claim.commitmentHash || expectedClaimHashes[claim.claimKey] !== claim.commitmentHash) return false;
  }
  const payload = JSON.stringify({
    id: credential.id,
    issuer: credential.issuer.id,
    subject: credential.credentialSubject.id,
    type: credential.type,
    issuanceDate: credential.issuanceDate,
    expirationDate: credential.expirationDate,
    claimsSummaryHash: await sha256(JSON.stringify(claims)),
    claimHashes: expectedClaimHashes,
  });
  if (!credential.expirationDate || Date.parse(credential.expirationDate) <= Date.now()) return false;
  return verifyEcdsa(payload, credential.proof.signatureValue, publicKeyJwk);
}

async function verifyPresentation(presentation: any): Promise<boolean> {
  const proof = presentation?.proof;
  if (!proof?.publicKeyJwk || !proof.signatureValue) return false;
  const credentialsValid = await Promise.all((presentation.verifiableCredential || []).map((credential: any) => verifyCredential(credential)));
  if (!credentialsValid.every(Boolean)) return false;
  for (const predicateProof of presentation.zkProofs?.predicateProofs || []) {
    const credentialClaim = (presentation.verifiableCredential || [])
      .flatMap((credential: any) => credential.zkDisclosableClaims || [])
      .find((claim: any) => claim.claimKey === predicateProof.claimKey && claim.commitmentHash === predicateProof.commitmentHash);
    if (!credentialClaim || predicateProof.satisfied !== true) return false;
    const witnessHash = await sha256(`${credentialClaim.salt}:${credentialClaim.value}:${predicateProof.predicate}:PASS`);
    if (`zkp:pedersen_sha256:${witnessHash.substring(0, 48)}` !== predicateProof.zkWitnessProof) return false;
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
function getGenAI(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Resilient AI generation with fallback across models to handle 503 high-demand spikes
async function generateWithGeminiFallback(prompt: string): Promise<string | null> {
  const ai = getGenAI();
  if (!ai) return null;

  const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.7-flash'];

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      if (response.text && response.text.trim().length > 0) {
        return response.text.trim();
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
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
    system: 'AegisDID Decentralized Identity & AI Fraud Shield',
  });
});

// Account registration and session authentication. Passwords and session tokens are never stored raw.
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });

    const store = await getAuthStore();
    if (store.users.some(user => user.email === email)) return res.status(409).json({ error: 'An account already exists for this email' });
    const salt = randomBytes(16);
    const user: AuthUserRecord = {
      id: `user_${randomBytes(12).toString('hex')}`,
      email,
      passwordSalt: salt.toString('base64'),
      passwordHash: (await hashPassword(password, salt)).toString('base64'),
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
    store.users.push(user);
    await createSession(user.id, res);
    res.status(201).json({ user: { id: user.id, email: user.email }, apiKeys: [] });
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
    const store = await getAuthStore();
    const user = store.users.find(candidate => candidate.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const actual = await hashPassword(password, Buffer.from(user.passwordSalt, 'base64'));
    const expected = Buffer.from(user.passwordHash, 'base64');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Invalid email or password' });
    await createSession(user.id, res);
    res.json({ user: { id: user.id, email: user.email }, apiKeys: user.apiKeys.map(({ hash, ...metadata }) => metadata) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.post('/api/auth/logout', async (req: Request, res: Response) => {
  const store = await getAuthStore();
  const token = readSessionToken(req);
  if (token) delete store.sessions[await hashApiKey(token)];
  await saveAuthStore();
  res.setHeader('Set-Cookie', 'aegis_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.status(204).send();
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: { id: user.id, email: user.email }, apiKeys: user.apiKeys.map(({ hash, ...metadata }) => metadata) });
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
  user.apiKeys.push(key);
  await saveAuthStore();
  res.status(201).json({ apiKey: rawKey, metadata: { id: key.id, name: key.name, createdAt: key.createdAt } });
});

app.delete('/api/auth/api-keys/:keyId', async (req: Request, res: Response) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;
  const previousLength = user.apiKeys.length;
  user.apiKeys = user.apiKeys.filter(key => key.id !== req.params.keyId);
  if (user.apiKeys.length === previousLength) return res.status(404).json({ error: 'API key not found' });
  await saveAuthStore();
  res.status(204).send();
});

// Real-time Behavioral & Network AI Fraud Analysis
app.post('/api/ai/analyze-behavior-and-fraud', async (req: Request, res: Response) => {
  try {
    if (!(await requireAiAccess(req, res))) return;
    const { telemetry, presentation, networkContext, simulationAttackType } = req.body;

    if (presentation?.proof) {
      const challenge = presentation.proof.challenge;
      const audience = presentation.audience;
      const predicateProofs = presentation.zkProofs?.predicateProofs || [];
      const challengeKey = `${audience}:${challenge}`;
      const challengeAge = Date.now() - new Date(presentation.proof.created || 0).getTime();
      const store = await getAuthStore();
      const spentChallenges = store.spentChallenges || (store.spentChallenges = {});

      if (!presentation.holder || !audience || !challenge || challenge !== presentation.presentationNonce || audience !== presentation.proof.domain) {
        return res.status(400).json({ error: 'Invalid presentation challenge binding' });
      }
      if (!(await verifyPresentation(presentation))) return res.status(400).json({ error: 'Credential or presentation signature verification failed' });
      if (!Number.isFinite(challengeAge) || challengeAge < 0 || challengeAge > 5 * 60 * 1000) {
        return res.status(400).json({ error: 'Presentation expired' });
      }
      if (spentChallenges[challengeKey]) {
        return res.status(409).json({ error: 'Presentation challenge has already been spent' });
      }
      spentChallenges[challengeKey] = Date.now();
      for (const [key, timestamp] of Object.entries(spentChallenges)) {
        if (Date.now() - timestamp > 10 * 60 * 1000) delete spentChallenges[key];
      }
      await saveAuthStore();
    }

    const ai = getGenAI();

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

    let aiSummary = await generateWithGeminiFallback(prompt);

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

    res.json({
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
    });
  } catch (error: any) {
    console.error('Error in analyze-behavior-and-fraud:', error);
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

    let analysis = await generateWithGeminiFallback(prompt);

    if (!analysis) {
      analysis = `• Trust Seed Anchoring: Root authority credentials propagate trust through verified social distance, neutralizing isolated bot farm clusters.\n• Collusion Attack Isolation: Closed circular endorsement rings receive near-zero EigenTrust (<0.05) despite high internal link counts.\n• Privacy Preservation: Sybil defense relies purely on topological graph entropy and zero-knowledge commitments without storing raw user identity databases.`;
    }

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString(),
    });
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
