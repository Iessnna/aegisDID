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
import { 
  KeyPairData, DIDDocument, VerifiableCredential, BehavioralTelemetry, 
  FraudAnalysisResult, VerifiablePresentation 
} from './types';
import { 
  generateIdentityKeypair, createDIDDocument, issueVerifiableCredential 
} from './lib/crypto';
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
  
  // Trust Network Graph
  const [graphData, setGraphData] = useState<GraphDataset>({ nodes: [], edges: [] });
  const [networkAuditSummary, setNetworkAuditSummary] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // Initialize Decentralized Identity on Mount
  const initializeIdentity = useCallback(async () => {
    try {
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

      // Initialize Identity Trust Graph
      const initialGraph = generateInitialIdentityGraph(did);
      setGraphData(initialGraph);

      // Start Behavioral Biometrics Passive Listener
      globalBehavioralCollector.startListening();
    } catch (err) {
      console.error('Failed to initialize decentralized identity:', err);
    }
  }, []);

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
  const handleRunAiAnalysis = async (customTelemetry?: BehavioralTelemetry, attackType?: string) => {
    setIsAiLoading(true);
    try {
      const payloadTelemetry = customTelemetry || globalBehavioralCollector.getTelemetry();
      
      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      if (!res.ok) throw new Error('AI analysis failed');
      const data: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(data);
    } catch (err) {
      console.error('AI Analysis error:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run DApp Presentation Verification
  const handleVerifyDAppPresentation = async (presentation: VerifiablePresentation): Promise<FraudAnalysisResult | null> => {
    setIsAiLoading(true);
    try {
      const currentTelemetry = globalBehavioralCollector.getTelemetry();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telemetry: currentTelemetry,
          presentation,
          networkContext: {
            eigenTrust: 0.88,
            isSybilSuspect: false,
          },
        }),
      });

      if (!res.ok) throw new Error('Verification failed');
      const result: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(result);
      return result;
    } catch (err) {
      console.error('Error verifying presentation:', err);
      return null;
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run Simulated Adversarial Attack
  const handleRunAttackSimulation = async (attackType: string): Promise<FraudAnalysisResult | null> => {
    setIsAiLoading(true);
    try {
      // Inject synthetic telemetry into collector
      if (attackType === 'linear_bot') {
        globalBehavioralCollector.injectBotTelemetry('linear_bot');
      } else if (attackType === 'instant_replay') {
        globalBehavioralCollector.injectBotTelemetry('instant_replay');
      }

      const injectedTelemetry = globalBehavioralCollector.getTelemetry();

      const res = await fetch('/api/ai/analyze-behavior-and-fraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      if (!res.ok) throw new Error('Simulation failed');
      const result: FraudAnalysisResult = await res.json();
      setLatestAiAnalysis(result);
      return result;
    } catch (err) {
      console.error('Simulation error:', err);
      return null;
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run AI Network Graph Audit
  const handleAuditNetwork = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch('/api/ai/audit-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: graphData.nodes,
          edges: graphData.edges,
        }),
      });

      if (!res.ok) throw new Error('Network audit failed');
      const data = await res.json();
      setNetworkAuditSummary(data.analysis);
    } catch (err) {
      console.error('Network audit error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleAddCredential = (newCred: VerifiableCredential) => {
    setCredentials(prev => [newCred, ...prev]);
  };

  const humanityScore = latestAiAnalysis?.humanityScore ?? 95;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userDid={userDid}
        humanityScore={humanityScore}
        isAiConnected={isAiConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'wallet' && (
          <DIDWalletView
            userDid={userDid}
            keyPairData={keyPairData}
            didDocument={didDocument}
            credentials={credentials}
            onGenerateNewIdentity={initializeIdentity}
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
