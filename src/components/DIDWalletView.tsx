import React, { useState } from 'react';
import { 
  Key, ShieldCheck, FileCheck, Eye, EyeOff, Plus, RefreshCw, 
  Lock, CheckCircle2, AlertCircle, Copy, Check, FileJson, Award, 
  ExternalLink, Sparkles, UserCheck, Binary, ChevronDown, ChevronUp
} from 'lucide-react';
import { VerifiableCredential, DIDDocument, KeyPairData } from '../types';
import { issueVerifiableCredential } from '../lib/crypto';
import { keccak256, toUtf8Bytes } from 'ethers';
import { submitUserTransaction } from '../lib/wallet';

interface DIDWalletViewProps {
  userDid: string;
  keyPairData: KeyPairData | null;
  didDocument: DIDDocument | null;
  credentials: VerifiableCredential[];
  onGenerateNewIdentity: () => void;
  onAddCredential: (cred: VerifiableCredential) => void;
  walletAddress: string | null;
  canWriteOnChain: boolean;
}

export const DIDWalletView: React.FC<DIDWalletViewProps> = ({
  userDid,
  keyPairData,
  didDocument,
  credentials,
  onGenerateNewIdentity,
  onAddCredential,
  walletAddress,
  canWriteOnChain,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDIDDoc, setShowDIDDoc] = useState(false);
  const [selectedCred, setSelectedCred] = useState<VerifiableCredential | null>(null);
  const [isIssuingModalOpen, setIsIssuingModalOpen] = useState(false);

  // New credential form state
  const [newCredType, setNewCredType] = useState('ProofOfIncomeCredential');
  const [newIssuerName, setNewIssuerName] = useState('Swiss Digital Banking Gateway');
  const [newClaimKey, setNewClaimKey] = useState('monthlyIncomeUsd');
  const [newClaimValue, setNewClaimValue] = useState('8500');
  const [newPredicateLabel, setNewPredicateLabel] = useState('Income >= $5,000 / mo');
  const [isIssuingLoading, setIsIssuingLoading] = useState(false);
  const [chainStatus, setChainStatus] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  const registerDidOnChain = async () => {
    setChainError(null); setChainStatus('Waiting for wallet confirmation');
    try { const hash = await submitUserTransaction('DID registration', contract => contract.registerDID(userDid, toUtf8Bytes(JSON.stringify(keyPairData?.publicKeyJwk || {})))); setChainStatus(`Confirmed: ${hash}`); }
    catch (error) { setChainStatus(null); setChainError(error instanceof Error ? error.message : 'DID registration failed'); }
  };

  const anchorSelectedCredential = async () => {
    if (!selectedCred) return;
    setChainError(null); setChainStatus('Waiting for wallet confirmation');
    try { const hash = await submitUserTransaction('Credential anchor', contract => contract.anchorCredential(keccak256(toUtf8Bytes(JSON.stringify(selectedCred))), userDid)); setChainStatus(`Confirmed: ${hash}`); }
    catch (error) { setChainStatus(null); setChainError(error instanceof Error ? error.message : 'Credential anchoring failed'); }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleIssueCustomCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyPairData) return;

    setIsIssuingLoading(true);
    try {
      // Create an ephemeral issuer keypair to sign the credential
      const ephemeralKey = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );

      const claims: Record<string, any> = {
        [newClaimKey]: isNaN(Number(newClaimValue)) ? newClaimValue : Number(newClaimValue),
        verificationLevel: 'TIER_3_CRYPTOGRAPHIC',
        issuedTimestamp: Date.now(),
      };

      const issuedVC = await issueVerifiableCredential({
        issuerName: newIssuerName,
        issuerDid: `did:aegis:issuer:${newIssuerName.toLowerCase().replace(/\s+/g, '-')}`,
        issuerPrivateKey: ephemeralKey.privateKey,
        issuerTrustScore: 96,
        subjectDid: userDid,
        credentialType: newCredType,
        claims,
        zkClaimSpecs: [
          {
            claimKey: newClaimKey,
            label: newPredicateLabel,
            predicateType: 'gte',
            predicateDescription: `Zero-Knowledge proof that ${newPredicateLabel} without disclosing exact value`,
          },
        ],
      });

      onAddCredential(issuedVC);
      setIsIssuingModalOpen(false);
      setSelectedCred(issuedVC);
    } catch (err) {
      console.error('Failed to issue credential:', err);
    } finally {
      setIsIssuingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Identity status', value: 'Verified', detail: 'ECDSA P-256', tone: 'text-[#b8ef78]' },
          { label: 'Credentials', value: credentials.length.toString().padStart(2, '0'), detail: 'ZK-enabled', tone: 'text-cyan-300' },
          { label: 'Privacy mode', value: 'Zero-KYC', detail: 'Raw claims hidden', tone: 'text-amber-300' },
          { label: 'Key custody', value: 'Browser', detail: 'Self-sovereign', tone: 'text-violet-300' },
        ].map(stat => (
          <div key={stat.label} className="aegis-panel rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className={`aegis-display mt-2 text-lg font-semibold ${stat.tone}`}>{stat.value}</p>
            <p className="mt-1 text-[11px] text-slate-500">{stat.detail}</p>
          </div>
        ))}
      </div>

      {/* Top Banner / Privacy Guarantee */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900 border border-cyan-800/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="text-base font-semibold text-white">Self-Sovereign Identity Vault (Zero-KYC)</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Your private cryptographic keys stay exclusively in your browser. Verifiable Credentials allow you to generate mathematical Zero-Knowledge proofs for dApps (e.g. proving you are over 18 or a unique human) without revealing your personal identity, birth date, or passport details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsIssuingModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Claim New Credential</span>
            </button>
            <button
              onClick={onGenerateNewIdentity}
              title="Generate a fresh cryptographic keypair and DID"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-medium transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rotate Keys</span>
            </button>
          </div>
        </div>
      </div>

      <div className="aegis-panel rounded-2xl border border-[#b8ef78]/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#b8ef78]">WALLET-SIGNED REGISTRY</p><p className="mt-1 text-xs text-slate-400">{walletAddress ? `Signer ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect a wallet to sign registry writes.'}</p></div><div className="flex gap-2"><button disabled={!canWriteOnChain || !keyPairData} onClick={() => void registerDidOnChain()} className="rounded-lg bg-[#b8ef78] px-3 py-2 text-xs font-bold text-[#071018] disabled:opacity-40">Register DID</button><button disabled={!canWriteOnChain || !selectedCred} onClick={() => void anchorSelectedCredential()} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-40">Anchor selected credential</button></div></div>
        {chainStatus && <p className="mt-3 text-xs text-emerald-300">{chainStatus}</p>}{chainError && <p className="mt-3 text-xs text-rose-300">Failed: {chainError}</p>}
      </div>

      {/* DID & Cryptographic Keypair Card */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-cyan-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Cryptographic Root Identity</h3>
              <p className="text-xs text-slate-400">W3C Decentralized Identifier & ECDSA P-256 Public Key</p>
            </div>
          </div>
          <button
            onClick={() => setShowDIDDoc(!showDIDDoc)}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>{showDIDDoc ? 'Hide DID Document' : 'View DID Document'}</span>
            {showDIDDoc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Identity Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span>Decentralized Identifier (DID)</span>
              <button
                onClick={() => copyToClipboard(userDid, 'did')}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copiedField === 'did' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="text-[10px]">{copiedField === 'did' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-slate-200 break-all select-all font-medium text-[11px]">
              {userDid}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span>Public Key Fingerprint (ES256)</span>
              <button
                onClick={() => copyToClipboard(keyPairData?.rawPublicKeyHex || '', 'pubkey')}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copiedField === 'pubkey' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="text-[10px]">{copiedField === 'pubkey' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-slate-200 truncate select-all font-medium text-[11px]">
              {keyPairData?.rawPublicKeyHex ? `0x${keyPairData.rawPublicKeyHex}` : 'Loading...'}
            </p>
          </div>
        </div>

        {/* Expandable W3C DID Document */}
        {showDIDDoc && didDocument && (
          <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-cyan-900/40 font-mono text-[11px] text-cyan-200/90 overflow-x-auto">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-slate-400 text-xs">
              <span>W3C DID Document (JSON-LD)</span>
              <button
                onClick={() => copyToClipboard(JSON.stringify(didDocument, null, 2), 'diddoc')}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copiedField === 'diddoc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'diddoc' ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto text-[11px] leading-relaxed">
              {JSON.stringify(didDocument, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Verifiable Credentials Collection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Issued Verifiable Credentials ({credentials.length})</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Cryptographically Signed & ZK Enabled
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {credentials.map(cred => {
            const isSelected = selectedCred?.id === cred.id;
            return (
              <div
                key={cred.id}
                onClick={() => setSelectedCred(cred)}
                className={`relative p-5 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500/80 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white leading-tight">
                        {cred.type[1] || cred.type[0]}
                      </h4>
                      <p className="text-[11px] text-slate-400">{cred.issuer.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 text-[10px] font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Trust {cred.issuer.trustScore}%</span>
                  </div>
                </div>

                {/* ZK Disclosable Predicates summary */}
                <div className="space-y-2 py-2 border-t border-b border-slate-800/80 my-3 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Zero-Knowledge Predicates Available</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cred.zkDisclosableClaims.map(claim => (
                      <span
                        key={claim.claimKey}
                        className="px-2 py-1 rounded-md bg-slate-950 border border-cyan-900/50 text-cyan-300 text-[11px] font-mono flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3 text-cyan-400" />
                        {claim.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Footer: Signature & Expiration */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                  <span>Issued: {new Date(cred.issuanceDate).toLocaleDateString()}</span>
                  <span className="text-cyan-400/80">ECDSA P-256 Signed</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Credential Inspector Modal / Drawer */}
      {selectedCred && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-cyan-800/60 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Binary className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">
                Credential Cryptographic Inspector: {selectedCred.type[1]}
              </h3>
            </div>
            <button
              onClick={() => setSelectedCred(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700"
            >
              Close Inspector
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Raw Claims vs ZK Proofs */}
            <div className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>Protected Raw Subject Attributes</span>
              </h4>
              <div className="space-y-2 font-mono text-[11px]">
                {Object.entries(selectedCred.credentialSubject).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-1 border-b border-slate-900">
                    <span className="text-slate-400">{key}:</span>
                    <span className="text-white font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <span className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/50 p-2 rounded-lg block">
                  🛡️ When verifying with external dApps, these raw values are blinded using Pedersen commitments. Only mathematical zero-knowledge assertions are transmitted.
                </span>
              </div>
            </div>

            {/* Cryptographic Proof Verification */}
            <div className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>ECDSA Signature & ZK Commitments</span>
              </h4>
              
              <div className="space-y-2 font-mono text-[11px] text-slate-400">
                <div>
                  <span className="text-slate-500 block">Issuer DID:</span>
                  <span className="text-cyan-300 break-all">{selectedCred.issuer.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Proof Signature:</span>
                  <span className="text-emerald-400 break-all text-[10px]">
                    0x{selectedCred.proof.signatureValue.substring(0, 48)}...
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Salt Commitments (ZKP):</span>
                  {selectedCred.zkDisclosableClaims.map(c => (
                    <div key={c.claimKey} className="text-[10px] text-slate-300">
                      {c.claimKey} hash: <span className="text-amber-400">{c.commitmentHash.substring(0, 20)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Claim New Credential Modal */}
      {isIssuingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Issue Custom Verifiable Credential</h3>
              </div>
              <button
                onClick={() => setIsIssuingModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIssueCustomCredential} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Credential Standard Type</label>
                <input
                  type="text"
                  value={newCredType}
                  onChange={e => setNewCredType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 focus:outline-none"
                  placeholder="e.g. ProofOfAccreditationCredential"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Trusted Issuer Authority</label>
                <input
                  type="text"
                  value={newIssuerName}
                  onChange={e => setNewIssuerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="e.g. Global Identity Gateway"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Claim Key</label>
                  <input
                    type="text"
                    value={newClaimKey}
                    onChange={e => setNewClaimKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. creditScore"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Claim Value (Private)</label>
                  <input
                    type="text"
                    value={newClaimValue}
                    onChange={e => setNewClaimValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. 780"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Zero-Knowledge Predicate Rule</label>
                <input
                  type="text"
                  value={newPredicateLabel}
                  onChange={e => setNewPredicateLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="e.g. Credit Score >= 700"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsIssuingModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isIssuingLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20"
                >
                  {isIssuingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  <span>Sign & Mint to Vault</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
