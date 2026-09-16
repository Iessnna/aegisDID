import React, { useMemo, useState } from 'react';
import { ShieldCheck, XCircle } from 'lucide-react';
import { DAppVerificationRequest, VerifiableCredential, VerifiablePresentation } from '../types';
import { VerifiablePresentationModal } from './VerifiablePresentationModal';

function parseRequest(value: string, origin: string, requestId: string): DAppVerificationRequest {
  const requirements = value.split(',').map(item => item.trim()).filter(Boolean).map((item, index) => {
    const separator = item.indexOf(':');
    const type = separator >= 0 ? item.slice(0, separator).trim() : item.trim();
    const predicate = separator >= 0 ? item.slice(separator + 1).trim() : '';
    const claimKey = predicate.match(/^([A-Za-z_][\w]*)/)?.[1] || 'id';
    return { type, name: type || `Credential ${index + 1}`, requiredPredicates: predicate ? [{ claimKey, predicate, description: predicate }] : [] };
  });
  return { dappId: origin, dappName: new URL(origin).hostname, dappCategory: 'External AegisDID verifier', dappIcon: 'A', requiredCredentials: requirements, minimumHumanityScore: 0, maximumSybilRisk: 100, nonce: requestId };
}

interface Props { userDid: string; userPrivateKey: CryptoKey | null; userPublicKeyJwk: JsonWebKey | null; credentials: VerifiableCredential[]; }

export const ExternalVerificationView: React.FC<Props> = ({ userDid, userPrivateKey, userPublicKeyJwk, credentials }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestId = params.get('requestId') || '';
  const requestedOrigin = params.get('origin') || '';
  const requirement = params.get('require') || '';
  const [result, setResult] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const request = useMemo(() => {
    try { return requestedOrigin && requirement ? parseRequest(requirement, requestedOrigin, requestId) : null; }
    catch { return null; }
  }, [requestedOrigin, requirement, requestId]);

  const postResult = (payload: Record<string, unknown>) => {
    if (!window.opener || !/^https?:$/.test(new URL(requestedOrigin).protocol)) return;
    window.opener.postMessage({ type: 'AEGISDID_VERIFY_RESULT', requestId, ...payload }, requestedOrigin);
  };

  const reject = () => { postResult({ valid: false, rejected: true }); window.close(); setResult('Request rejected. You may close this window.'); setIsOpen(false); };
  const verify = async (presentation: VerifiablePresentation) => {
    const response = await fetch('/api/public/verify-presentation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(presentation) });
    const verification = await response.json();
    if (!response.ok || verification.valid !== true) throw new Error(verification.error || 'Server verification failed');
    postResult({ valid: true, holderDid: verification.holderDid, revealedClaims: verification.revealedClaims, presentation });
    setResult('Verified. This window can now close.');
    setIsOpen(false);
    window.close();
  };

  if (!request || !requestId || !requestedOrigin) return <main className="flex min-h-screen items-center justify-center bg-[#071018] p-6 text-rose-200">Invalid verification request.</main>;
  return <main className="min-h-screen bg-[#071018] p-4 text-slate-100"><div className="mx-auto max-w-xl"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-300" /><h1 className="aegis-display text-xl font-semibold">External verification request</h1></div><button onClick={reject} aria-label="Reject request" className="text-slate-400 hover:text-white"><XCircle className="h-5 w-5" /></button></div><p className="mb-4 text-xs text-slate-400">{request.dappName} requested only the credentials and predicates shown below. Nothing is approved automatically.</p>{result && <p className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-200">{result}</p>}<VerifiablePresentationModal isOpen={isOpen} onClose={reject} dappRequest={request} userDid={userDid} userPrivateKey={userPrivateKey} userPublicKeyJwk={userPublicKeyJwk} credentials={credentials} onVerifyComplete={verify} /></div></main>;
};
