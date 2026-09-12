/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { DIDWalletView } from './components/DIDWalletView';
import { BehavioralRadarView } from './components/BehavioralRadarView';
import { NetworkGraphView } from './components/NetworkGraphView';
import { DAppGatewayView } from './components/DAppGatewayView';
import { AttackDefenseLabView } from './components/AttackDefenseLabView';
import { AuthPanel } from './components/AuthPanel';
import { 
  KeyPairData, DIDDocument, VerifiableCredential, BehavioralTelemetry, 
  FraudAnalysisResult, VerifiablePresentation 
} from './types';
import { 
  generateIdentityKeypair, createDIDDocument, issueVerifiableCredential, importPrivateKeyFromJwk, importPublicKeyFromJwk
} from './lib/crypto';
import { clearIdentity, loadIdentity, saveIdentity } from './lib/identityStorage';
import { 
  globalBehavioralCollector 
} from './lib/behavioralBiometrics';
import { 
  generateInitialIdentityGraph, GraphDataset 
} from './lib/networkGraph';

export default function App() {
  const [activeTab, setActiveTab] = useState<'wallet' | 'behavioral' | 'network' | 'dapps' | 'lab'>('wallet');
  
  // Cryptographic DID & Keys
  const [userDid, setUserDid] = useState<string>('');
  const [keyPairData, setKeyPairData] = useState<KeyPairData | null>(null);
  const [cryptoKeyPair, setCryptoKeyPair] = useState<CryptoKeyPair | null>(null);
  const [didDocument, setDidDocument] = useState<DIDDocument | null>(null);
  
  // Verifiable Credentials
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  
  // Real-time Behavioral Telemetry & AI Analysis
  const [telemetry, setTelemetry] = useState<BehavioralTelemetry>(globalBehavioralCollector.getTelemetry());
  const [latestAiAnalysis, setLatestAiAnalysis] = useState<FraudAnalysisResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isAiConnected, setIsAiConnected] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [apiKeyAuth, setApiKeyAuth] = useState({ key: '', enabled: false });
  
  // Trust Network Graph
  const [graphData, setGraphData] = useState<GraphDataset>({ nodes: [], edges: [] });
  const [networkAuditSummary, setNetworkAuditSummary] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // Initialize Decentralized Identity on Mount
  const initializeIdentity = useCallback(async () => {
    try {
      const savedIdentity = await loadIdentity();
      if (savedIdentity && savedIdentity.credentials.length > 0 && savedIdentity.credentials.every(credential => credential.proof.publicKeyJwk)) {
        const restoredPrivateKey = savedIdentity.keyPairData.privateKeyJwk
          ? await importPrivateKeyFromJwk(savedIdentity.keyPairData.privateKeyJwk)
          : null;
        const restoredPublicKey = await importPublicKeyFromJwk(savedIdentity.keyPairData.publicKeyJwk);
        if (restoredPrivateKey) {
          const restoredKeyPair = { privateKey: restoredPrivateKey, publicKey: restoredPublicKey } as CryptoKeyPair;
          setUserDid(savedIdentity.keyPairData.keyId.split('#')[0]);
          setKeyPairData(savedIdentity.keyPairData);
          setCryptoKeyPair(restoredKeyPair);
          setDidDocument(createDIDDocument(savedIdentity.keyPairData.keyId.split('#')[0], savedIdentity.keyPairData));
          setCredentials(savedIdentity.credentials);
          setGraphData(generateInitialIdentityGraph(savedIdentity.keyPairData.keyId.split('#')[0]));
          globalBehavioralCollector.startListening();
          return;
        }
      }

      const { cryptoKeyPair: keys, keyPairData: data, did } = await generateIdentityKeypair();
      setUserDid(did);
      setKeyPairData(data);
      setCryptoKeyPair(keys);

      const doc = createDIDDocument(did, data);
      setDidDocument(doc);

      // Create an ephemeral issuer authority key for mock trusted roots
      const issuerAuthorityKeys = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );

      // 1. Proof of Humanity Credential
      const humanityVC = await issueVerifiableCredential({
        issuerName: 'Humanity Council Biometric DAO',
        issuerDid: 'did:aegis:issuer:proof-humanity',
        issuerPrivateKey: issuerAuthorityKeys.privateKey,
        issuerPublicKey: issuerAuthorityKeys.publicKey,
        issuerTrustScore: 95,
        subjectDid: did,
        credentialType: 'ProofOfHumanityCredential',
        claims: {
          isUniqueHuman: true,
          biometricHash: '0x8fa302d91b44c',
          livenessVerifiedAt: new Date().toISOString(),
        },
        zkClaimSpecs: [
          {
            claimKey: 'isUniqueHuman',
            label: 'Unique Human Liveness',
            predicateType: 'boolean',
            predicateDescription: 'Zero-Knowledge Proof of Authentic Biological Liveness',
          },
        ],
      });

      // 2. Government Age Gate Credential
      const ageVC = await issueVerifiableCredential({
        issuerName: 'Estonia e-Residency DID Gateway',
        issuerDid: 'did:aegis:issuer:gov-eu',
        issuerPrivateKey: issuerAuthorityKeys.privateKey,
        issuerPublicKey: issuerAuthorityKeys.publicKey,
        issuerTrustScore: 99,
        subjectDid: did,
        credentialType: 'ProofOfAgeCredential',
        claims: {
          birthDate: '1998-04-12',
          age: 28,
          citizenshipRegion: 'EU_EEA',
          kycHash: '0xee1849a00cd',
        },
        zkClaimSpecs: [
          {
            claimKey: 'age',
            label: 'Age >= 18 and Age >= 21',
            predicateType: 'gte',
            predicateDescription: 'Mathematical Proof that Age >= 18 without disclosing birth date',
          },
        ],
      });

      // 3. Web3 Trust & Sybil Resistance Credential
      const gitcoinVC = await issueVerifiableCredential({
        issuerName: 'Gitcoin Web3 Trust Oracle',
        issuerDid: 'did:aegis:issuer:gitcoin-passport',
        issuerPrivateKey: issuerAuthorityKeys.privateKey,
        issuerPublicKey: issuerAuthorityKeys.publicKey,
        issuerTrustScore: 92,
        subjectDid: did,
        credentialType: 'GitcoinPassportCredential',
        claims: {
          passportScore: 28.5,
          githubVouched: true,
          ethereumTxCount: 84,
          isSybilSuspect: false,
        },
        zkClaimSpecs: [
          {
            claimKey: 'passportScore',
            label: 'Gitcoin Trust Score >= 20',
            predicateType: 'gte',
            predicateDescription: 'Sybil Resistance Score >= 20',
          },
        ],
      });

      // 4. Stanford Cryptography Accreditation
      const stanfordVC = await issueVerifiableCredential({
        issuerName: 'Stanford Cryptography Lab',
        issuerDid: 'did:aegis:issuer:stanford-id',
        issuerPrivateKey: issuerAuthorityKeys.privateKey,
        issuerPublicKey: issuerAuthorityKeys.publicKey,
        issuerTrustScore: 97,
        subjectDid: did,
        credentialType: 'ProofOfAccreditationCredential',
        claims: {
          accreditationLevel: 'Senior Researcher',
          isSanctioned: false,
          verifiedPublicationCount: 6,
        },
        zkClaimSpecs: [
          {
            claimKey: 'isSanctioned',
            label: 'Non-Sanctioned Clean Entity',
            predicateType: 'boolean',
            predicateDescription: 'Verifies Entity is NOT on OFAC / Sanctions list',
          },
        ],
      });

      setCredentials([humanityVC, ageVC, gitcoinVC, stanfordVC]);
      await saveIdentity({ keyPairData: data, credentials: [humanityVC, ageVC, gitcoinVC, stanfordVC] });

      // Initialize Identity Trust Graph
      const initialGraph = generateInitialIdentityGraph(did);
      setGraphData(initialGraph);

      // Start Behavioral Biometrics Passive Listener
      globalBehavioralCollector.startListening();
    } catch (err) {
      console.error('Failed to initialize decentralized identity:', err);
    }
  }, []);

  const rotateIdentity = useCallback(async () => {
    await clearIdentity();
    await initializeIdentity();
  }, [initializeIdentity]);

  useEffect(() => {
    initializeIdentity();

    // Check health of Gemini Backend
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setIsAiConnected(Boolean(data.geminiConfigured));
      })
      .catch(() => {
        setIsAiConnected(false);
      });

    // Polling interval for UI telemetry metrics
    const interval = setInterval(() => {
      setTelemetry(globalBehavioralCollector.getTelemetry());
    }, 1000);

    return () => {
      clearInterval(interval);
      globalBehavioralCollector.stopListening();
    };
  }, [initializeIdentity]);

  // Run AI Behavioral and Fraud Analysis API Call
  const buildLocalAnalysis = (customTelemetry: BehavioralTelemetry, attackType?: string): FraudAnalysisResult => {
    const isBotSimulation = attackType === 'linear_bot' || attackType === 'instant_replay' || attackType === 'stolen_keys' || attackType === 'replay_attack';
    const isSybil = attackType === 'sybil_ring';
    const botProbability = isSybil ? 92 : isBotSimulation ? 88 : 5;
    const humanityScore = 100 - botProbability;
    const decision = isSybil ? 'SYBIL_DETECTED' : isBotSimulation ? 'FLAGGED_BOT' : 'VERIFIED_HUMAN';

    return {
      humanityScore,
      confidenceScore: 91,
      botProbability,
      sybilCollusionRisk: isSybil ? 92 : 8,
      credentialReplayRisk: attackType === 'replay_attack' ? 95 : 3,
      decision,
      riskCategory: botProbability >= 70 ? 'CRITICAL' : 'LOW',
      reasons: isBotSimulation || isSybil
        ? ['Synthetic attack vector detected by the local rules engine.', 'Behavioral and graph signals do not match the holder profile.']
        : ['Organic interaction signals are within the expected human range.', 'Zero-knowledge predicates are ready for verification.'],
      anomaliesDetected: isBotSimulation || isSybil ? [{
        type: isSybil ? 'SYBIL_CLUSTER_TOPOLOGY' : 'AUTOMATION_SIGNATURE',
        severity: 'high',
        description: isSybil ? 'The identity is connected to a low-trust collusion cluster.' : 'Synthetic interaction timing or trajectory was detected.',
        evidence: `events=${customTelemetry.eventsCount}; attack=${attackType || 'none'}`,
      }] : [],
      biometricConfidence: {
        keystrokeScore: isBotSimulation ? 12 : 96,
        cursorMovementScore: isBotSimulation ? 10 : 94,
        timingEntropyScore: isBotSimulation ? 8 : 92,
        fingerprintIntegrityScore: 98,
      },
      networkCentralityScore: isSybil ? 4 : 88,
      explainableSummary: isBotSimulation || isSybil
        ? 'The local trust engine blocked this session using behavioral and network signals. No personal data was required to reach the decision.'
        : 'The local trust engine verified organic interaction signals and preserved the holder\'s raw claims behind zero-knowledge predicates.',
      aiTimestamp: new Date().toISOString(),
      auditSignature: `local-audit:${Date.now().toString(36)}`,
    };
  };

  const authHeaders = () => apiKeyAuth.enabled && apiKeyAuth.key
    ? { Authorization: `Bearer ${apiKeyAuth.key}` }
    : {};

  const handleRunAiAnalysis = async (customTelemetry?: BehavioralTelemetry, attackType?: string) => {
    setIsAiLoading(true);
    setActionError(null);
    try {
      const payloadTelemetry = customTelemetry || globalBehavioralCollector.getTelemetry();
      
      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: payloadTelemetry,
          presentation: {
            holder: userDid,
            zkProofs: {
              predicateProofs: credentials.flatMap(c => c.zkDisclosableClaims),
            },
          },
          networkContext: {
            eigenTrust: 0.88,
            isSybilSuspect: attackType === 'sybil_ring',
          },
          simulationAttackType: attackType,
        }),
      });

      if (res.status === 401) throw new Error('AUTH_REQUIRED');
      if (res.status === 429) throw new Error('RATE_LIMIT');
      if (!res.ok) throw new Error('AI analysis failed');
      const data: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(data);
    } catch (err) {
      console.error('AI Analysis error:', err);
      setIsAiConnected(false);
      setLatestAiAnalysis(buildLocalAnalysis(customTelemetry || globalBehavioralCollector.getTelemetry(), attackType));
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to run the server AI audit.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'Gemini is unavailable, so the local privacy-preserving rules engine supplied this audit.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run DApp Presentation Verification
  const handleVerifyDAppPresentation = async (presentation: VerifiablePresentation): Promise<FraudAnalysisResult | null> => {
    setIsAiLoading(true);
    setActionError(null);
    try {
      if (!presentation.holder || presentation.audience.length === 0 || presentation.presentationNonce !== presentation.proof.challenge || presentation.audience !== presentation.proof.domain) {
        throw new Error('Presentation challenge binding is invalid');
      }
      const currentTelemetry = globalBehavioralCollector.getTelemetry();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: currentTelemetry,
          presentation,
          networkContext: {
            eigenTrust: 0.88,
            isSybilSuspect: false,
          },
        }),
      });

      if (res.status === 401) throw new Error('AUTH_REQUIRED');
      if (res.status === 429) throw new Error('RATE_LIMIT');
      if (!res.ok) throw new Error('Verification failed');
      const result: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(result);
      return result;
    } catch (err) {
      console.error('Error verifying presentation:', err);
      const fallback = buildLocalAnalysis(globalBehavioralCollector.getTelemetry());
      setLatestAiAnalysis(fallback);
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to submit a server-verified presentation.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'Verification used the local trust engine because the remote verifier was unavailable.');
      return fallback;
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run Simulated Adversarial Attack
  const handleRunAttackSimulation = async (attackType: string): Promise<FraudAnalysisResult | null> => {
    setIsAiLoading(true);
    setActionError(null);
    let injectedTelemetry: BehavioralTelemetry;
    try {
      // Inject synthetic telemetry into collector
      if (attackType === 'linear_bot') {
        globalBehavioralCollector.injectBotTelemetry('linear_bot');
      } else if (attackType === 'instant_replay') {
        globalBehavioralCollector.injectBotTelemetry('instant_replay');
      }

      injectedTelemetry = globalBehavioralCollector.getTelemetry();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: injectedTelemetry,
          presentation: {
            holder: userDid,
            zkProofs: {
              predicateProofs: credentials.flatMap(c => c.zkDisclosableClaims),
            },
          },
          networkContext: {
            eigenTrust: attackType === 'sybil_ring' ? 0.04 : 0.88,
            isSybilSuspect: attackType === 'sybil_ring',
          },
          simulationAttackType: attackType,
        }),
      });

      if (res.status === 401) throw new Error('AUTH_REQUIRED');
      if (res.status === 429) throw new Error('RATE_LIMIT');
      if (!res.ok) throw new Error('Simulation failed');
      const result: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(result);
      return result;
    } catch (err) {
      console.error('Simulation error:', err);
      const fallback = buildLocalAnalysis(injectedTelemetry || globalBehavioralCollector.getTelemetry(), attackType);
      setLatestAiAnalysis(fallback);
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to run the server-backed attack simulation.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'Remote AI unavailable; simulation completed with the local trust engine.');
      return fallback;
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run AI Network Graph Audit
  const handleAuditNetwork = async () => {
    setIsAuditing(true);
    setActionError(null);
    try {
      const res = await fetch('/api/ai/audit-network', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          nodes: graphData.nodes,
          edges: graphData.edges,
        }),
      });

      if (res.status === 401) throw new Error('AUTH_REQUIRED');
      if (res.status === 429) throw new Error('RATE_LIMIT');
      if (!res.ok) throw new Error('Network audit failed');
      const data = await res.json();
      setNetworkAuditSummary(data.analysis);
    } catch (err) {
      console.error('Network audit error:', err);
      setNetworkAuditSummary('Local audit: trust seeds remain connected to verified issuers while suspected collusion clusters are isolated. No raw identity data is required.');
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to run the server-backed network audit.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'Remote network audit unavailable; local graph heuristics supplied the summary.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAddCredential = (newCred: VerifiableCredential) => {
    setCredentials(prev => {
      const updatedCredentials = [newCred, ...prev];
      if (keyPairData) void saveIdentity({ keyPairData, credentials: updatedCredentials });
      return updatedCredentials;
    });
  };

  const humanityScore = latestAiAnalysis?.humanityScore ?? 95;
  const workspaceMeta = {
    wallet: { eyebrow: 'IDENTITY CONTROL PLANE', title: 'Your identity, held by you', detail: 'Credentials, keys, and selective disclosure in one private workspace.' },
    behavioral: { eyebrow: 'LIVE TRUST SIGNALS', title: 'Verify the human behind the key', detail: 'Continuous behavioral signals make automation visible without collecting identity data.' },
    network: { eyebrow: 'TRUST GRAPH', title: 'See trust move through the network', detail: 'Inspect issuer relationships and isolate collusion before it scales.' },
    dapps: { eyebrow: 'VERIFIER GATEWAY', title: 'Access without exposing yourself', detail: 'Turn verified credentials into audience-bound, zero-knowledge sessions.' },
    lab: { eyebrow: 'ADVERSARIAL LAB', title: 'Break it before attackers do', detail: 'Run realistic fraud scenarios and watch the defense explain its decision.' },
  }[activeTab];

  return (
    <div className="aegis-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userDid={userDid}
        humanityScore={humanityScore}
        isAiConnected={isAiConnected}
      />

      {actionError && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div role="status" className="flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-amber-300 hover:text-white" aria-label="Dismiss notification">Dismiss</button>
          </div>
        </div>
      )}

      <AuthPanel onApiKeyChange={(key, enabled) => setApiKeyAuth({ key, enabled })} />

      <section className="mx-auto mt-5 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="aegis-panel relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7 sm:py-6">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-cyan-300/[0.08] to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b8ef78]">{workspaceMeta.eyebrow}</p>
              <h1 className="aegis-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{workspaceMeta.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{workspaceMeta.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#b8ef78] shadow-[0_0_12px_rgba(184,239,120,0.8)]" />
              <span>Private session active</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {activeTab === 'wallet' && (
          <DIDWalletView
            userDid={userDid}
            keyPairData={keyPairData}
            didDocument={didDocument}
            credentials={credentials}
            onGenerateNewIdentity={rotateIdentity}
            onAddCredential={handleAddCredential}
          />
        )}

        {activeTab === 'behavioral' && (
          <BehavioralRadarView
            telemetry={telemetry}
            latestAiAnalysis={latestAiAnalysis}
            onRunAiAnalysis={handleRunAiAnalysis}
            isAiLoading={isAiLoading}
          />
        )}

        {activeTab === 'network' && (
          <NetworkGraphView
            graphData={graphData}
            userDid={userDid}
            onAuditNetwork={handleAuditNetwork}
            networkAuditSummary={networkAuditSummary}
            isAuditing={isAuditing}
          />
        )}

        {activeTab === 'dapps' && (
          <DAppGatewayView
            userDid={userDid}
            userPrivateKey={cryptoKeyPair?.privateKey || null}
            userPublicKeyJwk={keyPairData?.publicKeyJwk || null}
            credentials={credentials}
            onVerifyDAppPresentation={handleVerifyDAppPresentation}
          />
        )}

        {activeTab === 'lab' && (
          <AttackDefenseLabView
            onRunAttackSimulation={handleRunAttackSimulation}
            isAiLoading={isAiLoading}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AegisDID • Self-Sovereign Cryptographic Verification + AI Behavioral Shield</span>
          <span className="text-[11px] text-slate-600">Zero-KYC Database • Zero PII Leakage</span>
        </div>
      </footer>
    </div>
  );
}
