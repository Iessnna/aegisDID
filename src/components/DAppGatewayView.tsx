import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, Coins, Vote, Sparkles, CheckCircle2, Lock, 
  ArrowRight, ExternalLink, Key, Award, AlertCircle, FileCheck, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { DAppVerificationRequest, VerifiablePresentation, VerifiableCredential, FraudAnalysisResult } from '../types';
import { VerifiablePresentationModal } from './VerifiablePresentationModal';

interface DAppGatewayViewProps {
  userDid: string;
  userPrivateKey: CryptoKey | null;
  userPublicKeyJwk: JsonWebKey | null;
  credentials: VerifiableCredential[];
  onVerifyDAppPresentation: (presentation: VerifiablePresentation) => Promise<FraudAnalysisResult | null>;
}

export const DAppGatewayView: React.FC<DAppGatewayViewProps> = ({
  userDid,
  userPrivateKey,
  userPublicKeyJwk,
  credentials,
  onVerifyDAppPresentation,
}) => {
  const [selectedDapp, setSelectedDapp] = useState<DAppVerificationRequest | null>(null);
  const [verifiedDapps, setVerifiedDapps] = useState<Record<string, {
    timestamp: string;
    humanityScore: number;
    token: string;
  }>>({});
  const [activeReceipt, setActiveReceipt] = useState<{
    dappName: string;
    humanityScore: number;
    token: string;
    timestamp: string;
  } | null>(null);
  const [integrationActivity, setIntegrationActivity] = useState<{ id: string; audience: string; requestType: string; status: string; createdAt: string }[]>([]);

  const loadIntegrationActivity = async () => {
    const response = await fetch('/api/integrations/activity', { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    setIntegrationActivity(data.requests || []);
  };

  useEffect(() => {
    void loadIntegrationActivity().catch(() => undefined);
    const interval = window.setInterval(() => { void loadIntegrationActivity().catch(() => undefined); }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const dapps: DAppVerificationRequest[] = [
    {
      dappId: 'https://airdrop.aegis.network',
      dappName: 'Aegis DeFi $50,000 Community Airdrop',
      dappCategory: 'Sybil-Resistant DeFi Token Claim',
      dappIcon: '💰',
      requiredCredentials: [
        {
          type: 'ProofOfHumanityCredential',
          name: 'Unique Human Liveness Proof',
          requiredPredicates: [
            { claimKey: 'isUniqueHuman', predicate: 'isUniqueHuman is true', description: 'Proof of Unique Liveness' },
          ],
        },
        {
          type: 'ProofOfAgeCredential',
          name: 'Government Age Gate',
          requiredPredicates: [
            { claimKey: 'age', predicate: 'age >= 18', description: 'Zero-Knowledge Proof: Age >= 18' },
          ],
        },
      ],
      minimumHumanityScore: 80,
      maximumSybilRisk: 20,
      nonce: `nonce_airdrop_${Date.now()}`,
      rewardDescription: '2,500 $AEGIS Governance Tokens ($750 USD)',
    },
    {
      dappId: 'https://governance.aegisdao.org',
      dappName: 'Decentralized Quadratic Voting DAO',
      dappCategory: '1-Person-1-Vote Governance',
      dappIcon: '🗳️',
      requiredCredentials: [
        {
          type: 'ProofOfHumanityCredential',
          name: 'Biometric Anti-Sybil Proof',
          requiredPredicates: [
            { claimKey: 'isUniqueHuman', predicate: 'isUniqueHuman is true', description: 'One Person One Vote Attestation' },
          ],
        },
        {
          type: 'GitcoinPassportCredential',
          name: 'Web of Trust Stamp',
          requiredPredicates: [
            { claimKey: 'passportScore', predicate: 'passportScore >= 20', description: 'Sybil Defense Score >= 20' },
          ],
        },
      ],
      minimumHumanityScore: 75,
      maximumSybilRisk: 25,
      nonce: `nonce_dao_${Date.now()}`,
      rewardDescription: 'Cast Quadratic Voting Ballot for AIP-44',
    },
    {
      dappId: 'https://club.cyberlounge.io',
      dappName: 'Age-Gated Web3 Luxury Lounge',
      dappCategory: 'Zero-KYC Anonymous Age Gate',
      dappIcon: '🍸',
      requiredCredentials: [
        {
          type: 'ProofOfAgeCredential',
          name: 'Anonymous Age Verification',
          requiredPredicates: [
            { claimKey: 'age', predicate: 'age >= 21', description: 'Zero-Knowledge Proof: Age >= 21' },
          ],
        },
      ],
      minimumHumanityScore: 70,
      maximumSybilRisk: 30,
      nonce: `nonce_club_${Date.now()}`,
      rewardDescription: 'VIP Metaverse Access Pass (No Passport Stored)',
    },
    {
      dappId: 'https://trade.p2pinstitutional.net',
      dappName: 'Zero-KYC Institutional P2P Exchange',
      dappCategory: 'Privacy Compliance Gate',
      dappIcon: '⚡',
      requiredCredentials: [
        {
          type: 'ProofOfAccreditationCredential',
          name: 'Accreditation & Clean Entity Proof',
          requiredPredicates: [
            { claimKey: 'isSanctioned', predicate: 'isSanctioned is false', description: 'Non-Sanctioned Entity Attestation' },
          ],
        },
      ],
      minimumHumanityScore: 85,
      maximumSybilRisk: 15,
      nonce: `nonce_trade_${Date.now()}`,
      rewardDescription: 'Unlock Zero-Slippage High-Liquidity Trading Pool',
    },
  ];

  const handleVerifyPresentation = async (presentation: VerifiablePresentation) => {
    if (!selectedDapp) return;
    const result = await onVerifyDAppPresentation(presentation);

    if (result && result.humanityScore >= selectedDapp.minimumHumanityScore) {
      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (_) {}

      const sessionResponse = await fetch('/api/verifier/sessions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audience: selectedDapp.dappId, holderDid: presentation.holder }) });
      const sessionData = await sessionResponse.json();
      if (!sessionResponse.ok || typeof sessionData.token !== 'string') throw new Error(sessionData.error || 'The verifier session could not be issued');
      const token = sessionData.token as string;
      setVerifiedDapps(prev => ({
        ...prev,
        [selectedDapp.dappId]: {
          timestamp: new Date().toLocaleTimeString(),
          humanityScore: result.humanityScore,
          token,
        },
      }));

      setActiveReceipt({
        dappName: selectedDapp.dappName,
        humanityScore: result.humanityScore,
        token,
        timestamp: new Date().toISOString(),
      });
      void loadIntegrationActivity();
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-white">Zero-KYC Verifier Gateway</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Registered verifier examples receive redacted credentials plus issuer-signed predicate attestations, not underlying claim values. Successful checks create short-lived, audience-bound sessions on the server.
          </p>
          <a href="/demo-verifier.html" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-cyan-300 hover:text-white"><ExternalLink className="h-3.5 w-3.5" />Open connected demo verifier website</a>
        </div>
      </div>

      <section className="aegis-panel rounded-2xl border-cyan-400/20 p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">INTEGRATION ACTIVITY</p><h3 className="mt-1 text-lg font-semibold text-white">Your API and verifier requests</h3></div><button onClick={() => void loadIntegrationActivity()} className="text-xs text-cyan-300 hover:text-white">Refresh</button></div><p className="mt-2 text-xs text-slate-400">Only requests made by your signed-in AegisDID session or your API keys appear here. Anonymous public checks are not assigned to an account.</p>{integrationActivity.length === 0 ? <p className="mt-4 text-xs text-slate-500">No requests for this account yet. Sign in before approving a tester request.</p> : <div className="mt-4 space-y-2">{integrationActivity.slice(0, 12).map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs"><span className="font-mono text-cyan-200">{request.requestType}</span><span className="text-slate-400">{request.audience}</span><span className={request.status === 'issued' || request.status === 'verified' ? 'text-emerald-300' : 'text-slate-500'}>{request.status}</span><time className="text-slate-600">{new Date(request.createdAt).toLocaleString()}</time></div>)}</div>}</section>

      {/* DApp Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dapps.map(dapp => {
          const verified = verifiedDapps[dapp.dappId];
          return (
            <div
              key={dapp.dappId}
              className={`p-5 rounded-2xl border transition-all space-y-4 ${
                verified
                  ? 'bg-slate-900/95 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-2xl shadow-inner">
                    {dapp.dappIcon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">
                      {dapp.dappName}
                    </h3>
                    <p className="text-[11px] text-cyan-400 font-mono">{dapp.dappCategory}</p>
                  </div>
                </div>

                {verified ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-800 text-emerald-300 text-[10px] font-mono font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>VERIFIED</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-mono">
                    Zero-KYC Ready
                  </span>
                )}
              </div>

              {/* Requirements & Reward */}
              <div className="space-y-2 text-xs py-2 border-t border-b border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Required ZK Predicates:</span>
                  <span className="text-slate-200 font-mono font-medium">
                    {dapp.requiredCredentials.map(c => c.name).join(' + ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Min Humanity Threshold:</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    &ge; {dapp.minimumHumanityScore} / 100
                  </span>
                </div>
                {dapp.rewardDescription && (
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Target Reward / Action:</span>
                    <span className="text-amber-300 font-mono font-semibold text-[11px]">
                      {dapp.rewardDescription}
                    </span>
                  </div>
                )}
              </div>

              {/* Action / Token Status */}
              <div className="flex items-center justify-between pt-1">
                {verified ? (
                  <div className="flex items-center justify-between w-full">
                    <div className="text-[11px] text-emerald-400/90 font-mono">
                      <span>Session Token: </span>
                      <span className="text-slate-300 font-bold">{verified.token.substring(0, 16)}...</span>
                    </div>
                    <button
                      onClick={() => setSelectedDapp(dapp)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Re-Verify
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedDapp(dapp)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify with AegisDID (Zero-KYC)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verification Receipt Modal / Drawer */}
      {activeReceipt && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border border-emerald-800/50 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
              <CheckCircle2 className="w-5 h-5" />
              <span>Local verification receipt: {activeReceipt.dappName}</span>
            </div>
            <button
              onClick={() => setActiveReceipt(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-md"
            >
              Dismiss
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">AI Humanity Score</span>
              <span className="text-emerald-400 font-bold text-sm">{activeReceipt.humanityScore}/100</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Cryptographic Session Token</span>
              <span className="text-cyan-300 font-bold text-[11px] truncate block">{activeReceipt.token}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Privacy Guarantee</span>
              <span className="text-slate-300 font-bold text-[11px]">0 Bytes PII Stored</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Presentation */}
      {selectedDapp && (
        <VerifiablePresentationModal
          isOpen={Boolean(selectedDapp)}
          onClose={() => setSelectedDapp(null)}
          dappRequest={selectedDapp}
          userDid={userDid}
          userPrivateKey={userPrivateKey}
          userPublicKeyJwk={userPublicKeyJwk}
          credentials={credentials}
          onVerifyComplete={handleVerifyPresentation}
        />
      )}
    </div>
  );
};
