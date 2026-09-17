import { useWallet } from './lib/useWallet';
import { mstFaucetUrl } from './lib/wallet';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { AuthPanel } from './components/AuthPanel';
import { ExternalVerificationView } from './components/ExternalVerificationView';
import { DocumentVaultView } from './components/DocumentVaultView';
import { NotificationsView } from './components/NotificationsView';
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
  generateEmptyIdentityGraph, GraphDataset
} from './lib/networkGraph';

const DIDWalletView = lazy(() => import('./components/DIDWalletView').then(module => ({ default: module.DIDWalletView })));
const BehavioralRadarView = lazy(() => import('./components/BehavioralRadarView').then(module => ({ default: module.BehavioralRadarView })));
const NetworkGraphView = lazy(() => import('./components/NetworkGraphView').then(module => ({ default: module.NetworkGraphView })));
const DAppGatewayView = lazy(() => import('./components/DAppGatewayView').then(module => ({ default: module.DAppGatewayView })));
const AttackDefenseLabView = lazy(() => import('./components/AttackDefenseLabView').then(module => ({ default: module.AttackDefenseLabView })));
const TransactionHistoryView = lazy(() => import('./components/TransactionHistoryView').then(module => ({ default: module.TransactionHistoryView })));
const AdminPortalView = lazy(() => import('./components/AdminPortalView').then(module => ({ default: module.AdminPortalView })));

const LoadingSpinner = () => (
  <div className="flex min-h-[24rem] items-center justify-center" role="status" aria-label="Loading workspace">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-b-cyan-400" />
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'wallet' | 'documents' | 'behavioral' | 'network' | 'dapps' | 'lab' | 'transactions' | 'notifications' | 'admin'>('wallet');
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  
  // Cryptographic DID & Keys
  const [userDid, setUserDid] = useState<string>('');
  const { wallet, connect, disconnect, switchNetwork, isConnecting, isWrongNetwork, hasInsufficientBalance, walletConfigurationError } = useWallet(userDid);
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
  const isLocalFixture = (credential: VerifiableCredential) => {
    const issuerId = credential.issuer.id;
    return issuerId.includes('local-') || issuerId.includes('gov-eu') || issuerId.includes('stanford-id') || issuerId.includes('gitcoin-passport') || issuerId.includes('proof-humanity');
  };

  // Initialize Decentralized Identity on Mount
  const initializeIdentity = useCallback(async () => {
    try {
      const savedIdentity = await loadIdentity();
      if (savedIdentity && savedIdentity.keyPairData.privateKeyJwk && savedIdentity.credentials.length > 0 && savedIdentity.credentials.every(credential => credential.proof.publicKeyJwk)) {
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
          setGraphData(generateEmptyIdentityGraph(savedIdentity.keyPairData.keyId.split('#')[0]));
          void loadRealGraph(savedIdentity.keyPairData.keyId.split('#')[0]);
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

      // Seed clearly labeled local fixtures so the workspace has data on first load.
      const issuerAuthorityKeys = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );

      // 1. Proof of Humanity Credential
      const humanityVC = await issueVerifiableCredential({
        issuerName: 'AegisDID local demo issuer',
        issuerDid: 'did:aegis:issuer:local-humanity-demo',
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
        issuerName: 'AegisDID local age demo',
        issuerDid: 'did:aegis:issuer:local-age-demo',
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
        issuerName: 'AegisDID local trust demo',
        issuerDid: 'did:aegis:issuer:local-trust-demo',
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
        issuerName: 'AegisDID local accreditation demo',
        issuerDid: 'did:aegis:issuer:local-accreditation-demo',
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

      // These are explicitly labeled local fixtures for testing the presentation flow.
      setCredentials([humanityVC, ageVC, gitcoinVC, stanfordVC]);
      await saveIdentity({ keyPairData: data, credentials: [humanityVC, ageVC, gitcoinVC, stanfordVC] });

      // Initialize a truthful local graph until an authenticated backend graph is available.
      setGraphData(generateEmptyIdentityGraph(did));
      void loadRealGraph(did);

      // Start Behavioral Biometrics Passive Listener
      globalBehavioralCollector.startListening();
    } catch (err) {
      console.error('Failed to initialize decentralized identity:', err);
    }
  }, []);

  const loadRealGraph = async (did: string) => {
    try {
      await fetch('/api/auth/did', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ did }) });
      const response = await fetch('/api/network/graph', { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json() as GraphDataset;
      if (data.nodes.length > 0) setGraphData(data);
    } catch {
      // The graph remains a truthful local identity node when no account is signed in.
    }
  };

  const rotateIdentity = useCallback(async () => {
    await clearIdentity();
    await initializeIdentity();
  }, [initializeIdentity]);

  useEffect(() => {
    initializeIdentity();

    // Check health of LangChain AI backend
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setIsAiConnected(Boolean(data.aiConfigured));
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
    const hasEnoughTelemetry = customTelemetry.eventsCount >= 5;
    const telemetryBotSignals = [
      customTelemetry.clientSignals.webdriverPresent || customTelemetry.clientSignals.automatedFlags ? 45 : 0,
      customTelemetry.trajectoryLinearityScore > 0.92 ? 25 : 0,
      customTelemetry.jitterVariance < 1 ? 15 : 0,
      customTelemetry.dwellTimeMean > 0 && customTelemetry.dwellTimeMean < 15 ? 15 : 0,
    ].reduce((total, signal) => total + signal, 0);
    const botProbability = isSybil ? 92 : isBotSimulation ? 88 : hasEnoughTelemetry ? Math.min(99, telemetryBotSignals) : 50;
    const humanityScore = 100 - botProbability;
    const decision = isSybil ? 'SYBIL_DETECTED' : isBotSimulation ? 'FLAGGED_BOT' : !hasEnoughTelemetry ? 'CHALLENGE_REQUIRED' : botProbability >= 70 ? 'FLAGGED_BOT' : 'VERIFIED_HUMAN';

    return {
      humanityScore,
      confidenceScore: 91,
      botProbability,
      sybilCollusionRisk: isSybil ? 92 : 8,
      credentialReplayRisk: attackType === 'replay_attack' ? 95 : 3,
      decision,
      riskCategory: botProbability >= 70 ? 'CRITICAL' : botProbability >= 35 ? 'MEDIUM' : 'LOW',
      reasons: isBotSimulation || isSybil
        ? ['Synthetic attack vector detected by the local rules engine.', 'Behavioral and graph signals do not match the holder profile.']
        : !hasEnoughTelemetry ? ['Not enough interaction telemetry was collected to make a confident decision.', 'Continue interacting and run the audit again.'] : ['Observed interaction signals were evaluated by the local rules engine.', 'Zero-knowledge predicates are ready for verification.'],
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

  const redactedPredicateClaims = () => credentials.flatMap(credential => credential.zkDisclosableClaims.map(({ value: _value, ...claim }) => claim));

  const requestTelemetryChallenge = async (): Promise<string> => {
    const response = await fetch('/api/ai/telemetry-challenge', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || typeof data.challenge !== 'string') throw new Error('Unable to obtain a behavioral telemetry challenge');
    return data.challenge;
  };

  const handleRunAiAnalysis = async (customTelemetry?: BehavioralTelemetry, attackType?: string) => {
    setIsAiLoading(true);
    setActionError(null);
    try {
      const payloadTelemetry = customTelemetry || globalBehavioralCollector.getTelemetry();
      const telemetryChallenge = await requestTelemetryChallenge();
      
      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: payloadTelemetry,
          telemetryChallenge,
          presentation: {
            holder: userDid,
            zkProofs: {
                predicateProofs: redactedPredicateClaims(),
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
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to run the server AI audit.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'LangChain AI is unavailable, so the local privacy-preserving rules engine supplied this audit.');
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
      const telemetryChallenge = await requestTelemetryChallenge();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: currentTelemetry,
          telemetryChallenge,
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
      setActionError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Sign in or enable a valid API key to submit a server-verified presentation.' : err instanceof Error && err.message === 'RATE_LIMIT' ? 'AI request limit reached: 30 requests per minute for this session/key.' : 'Remote presentation verification failed. No dApp access was granted.');
      return null;
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
      const telemetryChallenge = await requestTelemetryChallenge();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          telemetry: injectedTelemetry,
          telemetryChallenge,
          presentation: {
            holder: userDid,
            zkProofs: {
              predicateProofs: redactedPredicateClaims(),
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
      void fetch('/api/credentials', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCred) }).then(async response => {
        if (!response.ok) console.warn('Credential was kept locally but not registered on the account:', await response.text());
        else void loadRealGraph(userDid);
      }).catch(() => console.warn('Credential was kept locally but the account service was unavailable.'));
      return updatedCredentials;
    });
  };

  const humanityScore = latestAiAnalysis?.humanityScore ?? 95;
  const workspaceMeta = {
    wallet: { eyebrow: 'IDENTITY CONTROL PLANE', title: 'Your identity, held by you', detail: 'Credentials, keys, and selective disclosure in one private workspace.' },
    documents: { eyebrow: 'PRIVATE DOCUMENT VAULT', title: 'Prove the document without sharing it', detail: 'Encrypt government-issued documents locally, then share only a signed proof with teachers, HR, or other verifiers.' },
    behavioral: { eyebrow: 'LIVE TRUST SIGNALS', title: 'Verify the human behind the key', detail: 'Continuous behavioral signals make automation visible without collecting identity data.' },
    network: { eyebrow: 'TRUST GRAPH', title: 'See trust move through the network', detail: 'Inspect issuer relationships and isolate collusion before it scales.' },
    dapps: { eyebrow: 'VERIFIER GATEWAY', title: 'Access without exposing yourself', detail: 'Turn verified credentials into audience-bound, zero-knowledge sessions.' },
    lab: { eyebrow: 'ADVERSARIAL LAB', title: 'Break it before attackers do', detail: 'Run realistic fraud scenarios and watch the defense explain its decision.' },
    transactions: { eyebrow: 'WALLET LEDGER', title: 'Your on-chain activity', detail: 'Review wallet-signed registry transactions and their verified chain status.' },
    notifications: { eyebrow: 'ACCOUNT UPDATES', title: 'Stay informed', detail: 'System status, security notices, and important administrator messages.' },
    admin: { eyebrow: 'ADMIN CONTROL PLANE', title: 'Platform oversight', detail: 'Review accounts, fraud flags, audit history, and account status.' },
  }[activeTab];

  if (typeof window !== 'undefined' && window.location.pathname === '/verify-request') {
    return <ExternalVerificationView userDid={userDid} userPrivateKey={cryptoKeyPair?.privateKey || null} userPublicKeyJwk={keyPairData?.publicKeyJwk || null} credentials={credentials} />;
  }

  return (
    <div className="aegis-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userDid={userDid}
        humanityScore={humanityScore}
        isAiConnected={isAiConnected}
        walletAddress={wallet.address}
        walletNetwork={wallet.chainName}
        walletError={wallet.error}
        isWrongNetwork={isWrongNetwork}
        isConnectingWallet={isConnecting}
        onConnectWallet={() => void connect()}
        onDisconnectWallet={disconnect}
        onSwitchNetwork={() => void switchNetwork()}
        nativeBalance={wallet.nativeBalance}
        hasInsufficientBalance={hasInsufficientBalance}
        walletConfigurationError={walletConfigurationError}
        faucetUrl={mstFaucetUrl}
        userRole={userRole}
      />

      {actionError && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div role="status" className="flex items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-amber-300 hover:text-white" aria-label="Dismiss notification">Dismiss</button>
          </div>
        </div>
      )}

      <AuthPanel onApiKeyChange={(key, enabled) => setApiKeyAuth({ key, enabled })} onUserChange={user => { setUserRole(user?.role || 'user'); if (user && wallet.address) void fetch('/api/auth/wallet', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: wallet.address, did: userDid }) }); }} />

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
          <Suspense fallback={<LoadingSpinner />}><DIDWalletView
              userDid={userDid}
              keyPairData={keyPairData}
              didDocument={didDocument}
              credentials={credentials}
              onGenerateNewIdentity={rotateIdentity}
              onAddCredential={handleAddCredential}
              walletAddress={wallet.address}
              canWriteOnChain={Boolean(wallet.address && !isWrongNetwork && !hasInsufficientBalance && !walletConfigurationError)}
            /></Suspense>
        )}

        {activeTab === 'documents' && (
          <DocumentVaultView
            userDid={userDid}
            keyPairData={keyPairData}
            privateKey={cryptoKeyPair?.privateKey || null}
            walletReady={Boolean(wallet.address && !isWrongNetwork && !hasInsufficientBalance && !walletConfigurationError)}
          />
        )}

        {activeTab === 'behavioral' && (
          <Suspense fallback={<LoadingSpinner />}><BehavioralRadarView
            telemetry={telemetry}
            latestAiAnalysis={latestAiAnalysis}
            onRunAiAnalysis={handleRunAiAnalysis}
            isAiLoading={isAiLoading}
          /></Suspense>
        )}

        {activeTab === 'network' && (
          <Suspense fallback={<LoadingSpinner />}><NetworkGraphView
            graphData={graphData}
            userDid={userDid}
            onAuditNetwork={handleAuditNetwork}
            networkAuditSummary={networkAuditSummary}
            isAuditing={isAuditing}
          /></Suspense>
        )}

        {activeTab === 'dapps' && (
          <Suspense fallback={<LoadingSpinner />}><DAppGatewayView
            userDid={userDid}
            userPrivateKey={cryptoKeyPair?.privateKey || null}
            userPublicKeyJwk={keyPairData?.publicKeyJwk || null}
            credentials={credentials}
            onVerifyDAppPresentation={handleVerifyDAppPresentation}
          /></Suspense>
        )}

        {activeTab === 'lab' && (
          <Suspense fallback={<LoadingSpinner />}><AttackDefenseLabView
            onRunAttackSimulation={handleRunAttackSimulation}
            isAiLoading={isAiLoading}
          /></Suspense>
        )}

        {activeTab === 'transactions' && <Suspense fallback={<LoadingSpinner />}><TransactionHistoryView /></Suspense>}
        {activeTab === 'notifications' && <NotificationsView />}
        {activeTab === 'admin' && userRole === 'admin' && <Suspense fallback={<LoadingSpinner />}><AdminPortalView /></Suspense>}
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
