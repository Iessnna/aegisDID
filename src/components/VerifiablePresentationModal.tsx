import React, { useState } from 'react';
import { 
  ShieldCheck, Lock, Eye, EyeOff, Key, Sparkles, CheckCircle2, 
  AlertCircle, RefreshCw, Award, ArrowRight, ShieldAlert, Cpu
} from 'lucide-react';
import { VerifiableCredential, DAppVerificationRequest, VerifiablePresentation } from '../types';
import { createVerifiablePresentation } from '../lib/crypto';
import { globalBehavioralCollector } from '../lib/behavioralBiometrics';

interface VerifiablePresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dappRequest: DAppVerificationRequest;
  userDid: string;
  userPrivateKey: CryptoKey | null;
  userPublicKeyJwk: JsonWebKey | null;
  credentials: VerifiableCredential[];
  onVerifyComplete: (presentation: VerifiablePresentation) => Promise<void>;
}

export const VerifiablePresentationModal: React.FC<VerifiablePresentationModalProps> = ({
  isOpen,
  onClose,
  dappRequest,
  userDid,
  userPrivateKey,
  userPublicKeyJwk,
  credentials,
  onVerifyComplete,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [revealedClaimToggles, setRevealedClaimToggles] = useState<Record<string, boolean>>({});

  const credentialForType = (type: string) => credentials.find(cred => cred.type.includes(type));
  const missingRequirements = dappRequest.requiredCredentials.filter(req => !credentialForType(req.type));

  if (!isOpen) return null;

  const handleToggleClaim = (key: string) => {
    setRevealedClaimToggles(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleGenerateAndSubmitPresentation = async () => {
    if (!userPrivateKey || missingRequirements.length > 0) return;
    setIsVerifying(true);

    try {
      // Build selected disclosures
      const selectedDisclosures = dappRequest.requiredCredentials.map(reqCred => {
        const cred = credentialForType(reqCred.type)!;
        const zkPredicates = reqCred.requiredPredicates.flatMap(predicate => {
          const claim = cred.zkDisclosableClaims.find(item => item.claimKey === predicate.claimKey);
          if (!claim) return [];

          const thresholdMatch = predicate.predicate.match(/>=\s*(\d+(?:\.\d+)?)/);
          const threshold = thresholdMatch ? Number(thresholdMatch[1]) : claim.predicateType === 'boolean' ? true : claim.value;
          return [{
            claimKey: claim.claimKey,
            predicate: predicate.predicate,
            threshold,
            predicateType: (claim.predicateType || 'gte') as 'gte' | 'eq' | 'in' | 'boolean',
          }];
        });

        // Only reveal raw claims if explicitly toggled by user
        const rawClaimsToReveal: string[] = [];
        Object.keys(cred.credentialSubject).forEach(k => {
          if (k !== 'id' && revealedClaimToggles[`${cred.id}:${k}`]) {
            rawClaimsToReveal.push(k);
          }
        });

        return {
          credentialId: cred.id,
          revealRawClaims: rawClaimsToReveal,
          zkPredicateClaims: zkPredicates,
        };
      });

      const presentation = await createVerifiablePresentation({
        credentials,
        holderDid: userDid,
        privateKey: userPrivateKey,
        publicKeyJwk: userPublicKeyJwk || {},
        verifierNonce: dappRequest.nonce,
        audience: dappRequest.dappId,
        selectedDisclosures,
      });

      await onVerifyComplete(presentation);
      onClose();
    } catch (err) {
      console.error('Failed to create verifiable presentation:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400 text-lg font-bold">
              {dappRequest.dappIcon}
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {dappRequest.dappName}
              </h3>
              <p className="text-xs text-slate-400">Zero-KYC Verifiable Presentation Request</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            ✕
          </button>
        </div>

        {/* Challenge Nonce & Security Assurance */}
        <div className="p-3 rounded-xl bg-slate-950 border border-cyan-950 text-xs space-y-1">
          <div className="flex justify-between items-center text-slate-400 font-mono text-[11px]">
            <span>One-Time Cryptographic Nonce:</span>
            <span className="text-cyan-300 font-bold">{dappRequest.nonce}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            This one-time challenge binds the presentation to this verifier. Predicate values remain redacted; the issuer-signed attestation proves only the requested predicate result.
          </p>
        </div>

        {/* Required Claims & Zero-Knowledge Disclosures */}
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Requested Zero-Knowledge Predicates
            </span>
            <span className="text-emerald-400 font-mono flex items-center gap-1 text-[11px]">
              <Sparkles className="w-3 h-3" />
              Redacted claims + issuer attestations
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {dappRequest.requiredCredentials.map(reqCred => (
              <div key={reqCred.type} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                {(() => {
                  const matchingCredential = credentialForType(reqCred.type);
                  return (
                    <>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{reqCred.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${matchingCredential ? 'text-emerald-300 bg-emerald-950 border-emerald-800/60' : 'text-rose-300 bg-rose-950 border-rose-800/60'}`}>
                    {matchingCredential ? 'Credential available' : 'Credential missing'}
                  </span>
                </div>

                <div className="space-y-1.5 pl-1">
                  {reqCred.requiredPredicates.map(pred => (
                    <div key={pred.claimKey} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <div>
                          <span className="text-slate-200 font-medium block">{pred.description}</span>
                          <span className="text-[10px] text-slate-500 font-mono">Predicate: {pred.predicate}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] border font-bold font-mono ${matchingCredential?.zkDisclosableClaims.some(claim => claim.claimKey === pred.claimKey) ? 'bg-emerald-950 border-emerald-800/70 text-emerald-300' : 'bg-rose-950 border-rose-800/70 text-rose-300'}`}>
                        {matchingCredential?.zkDisclosableClaims.some(claim => claim.claimKey === pred.claimKey) ? 'ZK READY' : 'UNAVAILABLE'}
                      </span>
                    </div>
                  ))}
                </div>
                {matchingCredential && Object.entries(matchingCredential.credentialSubject).filter(([key]) => key !== 'id').map(([key]) => {
                  const toggleKey = `${matchingCredential.id}:${key}`;
                  const isRevealed = Boolean(revealedClaimToggles[toggleKey]);
                  return (
                    <button key={key} type="button" onClick={() => handleToggleClaim(toggleKey)} className={`flex w-full items-center justify-between rounded-lg border p-2 text-left ${isRevealed ? 'border-amber-400/40 bg-amber-400/10' : 'border-slate-800 bg-slate-900'}`}>
                      <span className="flex items-center gap-2"><span className="text-slate-400">{isRevealed ? <Eye className="h-3.5 w-3.5 text-amber-300" /> : <EyeOff className="h-3.5 w-3.5 text-slate-500" />}</span><span><span className="block text-slate-200">{key}</span><span className="text-[10px] text-slate-500">Optional raw disclosure</span></span></span>
                      <span className={`text-[10px] font-mono ${isRevealed ? 'text-amber-300' : 'text-slate-500'}`}>{isRevealed ? 'REVEAL' : 'HIDDEN'}</span>
                    </button>
                  );
                })}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* Behavioral Biometric Telemetry Capture Note */}
        <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-900/40 text-xs text-blue-200/90 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Real-time Behavioral Humanity Check</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            Passive biometric keystroke and cursor dynamics are evaluated concurrently to verify human authenticity and prevent automated bot farm claims.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {missingRequirements.length > 0 && (
            <span className="mr-auto text-[11px] text-rose-300">Add the missing credential before signing.</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerateAndSubmitPresentation}
            disabled={isVerifying || missingRequirements.length > 0 || !userPrivateKey}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
          >
            {isVerifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Signing & Verifying with AI...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Sign ZK Presentation & Access</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
