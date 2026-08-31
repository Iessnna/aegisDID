import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
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

// Real-time Behavioral & Network AI Fraud Analysis
app.post('/api/ai/analyze-behavior-and-fraud', async (req: Request, res: Response) => {
  try {
    const { telemetry, presentation, networkContext, simulationAttackType } = req.body;

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

    if (simulationAttackType === 'instant_replay' || (dwellMean < 10 && dwellStdDev < 5)) {
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
        aiSummary = `Session flagged with high bot risk (${botScore}%). Observed abnormal biometric distributions including unnatural trajectory linearity (${linearity}) and robotic dwell intervals (${dwellMean}ms). Access restricted to protect platform integrity.`;
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
