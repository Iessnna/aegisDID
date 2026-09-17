import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, FileCheck2, FileLock2, FileUp, ShieldCheck, Trash2, Upload, XCircle } from 'lucide-react';
import { createDocumentProof, encryptDocumentLocally, sha256, verifyDocumentProof, type DocumentProof } from '../lib/crypto';
import { deleteDocument, loadDocuments, saveDocument, type StoredDocument } from '../lib/identityStorage';
import { submitUserTransaction } from '../lib/wallet';
import { keccak256, toUtf8Bytes } from 'ethers';
import { KeyPairData } from '../types';

interface Props {
  userDid: string;
  keyPairData: KeyPairData | null;
  privateKey: CryptoKey | null;
  walletReady: boolean;
}

const documentTypes = ['Aadhar Card', 'Marks / Results', 'Degree Certificate', 'Employment Letter', 'Government License', 'Other Government Document'];

export const DocumentVaultView: React.FC<Props> = ({ userDid, keyPairData, privateKey, walletReady }) => {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [proofInput, setProofInput] = useState('');
  const [verification, setVerification] = useState<{ valid: boolean; proof?: DocumentProof; onChain?: string } | null>(null);
  const [anchoringId, setAnchoringId] = useState<string | null>(null);
  const [anchoredIds, setAnchoredIds] = useState<Set<string>>(new Set());

  useEffect(() => { void loadDocuments().then(setDocuments); }, []);

  const upload = async () => {
    if (!selectedFile || !privateKey || !keyPairData) return setNotice({ tone: 'error', text: 'Identity keys are still loading, or no file is selected.' });
    setBusy(true); setNotice(null);
    try {
      const bytes = await selectedFile.arrayBuffer();
      const documentHash = await sha256(new Uint8Array(bytes));
      const encrypted = await encryptDocumentLocally(bytes, privateKey);
      const proof = await createDocumentProof({ documentHash, documentType, holderDid: userDid, privateKey, publicKeyJwk: keyPairData.publicKeyJwk });
      const document: StoredDocument = { id: `doc_${crypto.randomUUID()}`, name: selectedFile.name, documentType, documentHash, uploadedAt: new Date().toISOString(), encryptedData: encrypted.ciphertext, iv: encrypted.iv, proof, revoked: false };
      await saveDocument(document);
      setDocuments(current => [document, ...current]);
      setSelectedFile(null);
      setNotice({ tone: 'success', text: 'Stored locally and encrypted. Share the proof, never the document.' });
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Document encryption failed.' }); }
    finally { setBusy(false); }
  };

  const copyProof = async (proof: DocumentProof) => {
    await navigator.clipboard.writeText(JSON.stringify(proof));
    setNotice({ tone: 'success', text: 'Proof copied. It contains no document bytes or personal document fields.' });
  };

  const verify = async () => {
    setVerification(null); setNotice(null);
    try {
      const proof = JSON.parse(proofInput) as DocumentProof;
      const valid = await verifyDocumentProof(proof);
      if (!valid) return setVerification({ valid: false, proof });
      let onChain: string | undefined;
      if (walletReady) {
        onChain = await submitUserTransaction('Audit log', contract => contract.logAuditRecord(keccak256(toUtf8Bytes(JSON.stringify(proof))), 'DOCUMENT_SIGNATURE_VALID_ISSUER_UNVERIFIED', 50));
      }
      setVerification({ valid: true, proof, onChain });
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Paste a valid AegisDID proof JSON.' }); }
  };

  const anchorProof = async (document: StoredDocument) => {
    if (!walletReady) return setNotice({ tone: 'error', text: 'Connect a funded MST wallet before anchoring a proof.' });
    setAnchoringId(document.id); setNotice(null);
    try {
      await submitUserTransaction('Credential anchor', contract => contract.anchorCredential(keccak256(toUtf8Bytes(JSON.stringify(document.proof))), userDid));
      setAnchoredIds(current => new Set(current).add(document.id));
      setNotice({ tone: 'success', text: 'Proof fingerprint anchored on MST. The encrypted file remains local.' });
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Proof anchoring failed.' }); }
    finally { setAnchoringId(null); }
  };

  const remove = async (id: string) => { await deleteDocument(id); setDocuments(current => current.filter(document => document.id !== id)); };

  return (
    <div className="space-y-6">
      <section className="aegis-panel overflow-hidden rounded-2xl border-cyan-400/20">
        <div className="border-b border-white/[0.06] bg-cyan-400/[0.06] p-5">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-400/15 p-2.5 text-cyan-300"><FileLock2 className="h-5 w-5" /></div><div><p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">PRIVATE DOCUMENT VAULT</p><h2 className="aegis-display text-xl font-semibold text-white">Store proof, keep the file</h2></div></div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">Your file is hashed and encrypted in this browser. Only its signed proof can leave the vault. The chain stores an audit fingerprint, never the document. A local upload alone does not prove government issuance.</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Document category<select value={documentType} onChange={event => setDocumentType(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200">{documentTypes.map(type => <option key={type}>{type}</option>)}</select></label>
            <label className="text-xs text-slate-400">Choose file<input type="file" accept=".pdf,image/*" onChange={event => setSelectedFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-lg border border-dashed border-slate-700 bg-slate-950 p-2 text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-400/15 file:px-3 file:py-1.5 file:text-cyan-200" /></label>
          </div>
          <button onClick={() => void upload()} disabled={busy || !selectedFile || !privateKey} className="flex items-center justify-center gap-2 rounded-lg bg-[#b8ef78] px-4 py-2.5 text-sm font-bold text-[#071018] disabled:cursor-not-allowed disabled:opacity-40"><Upload className="h-4 w-4" />{busy ? 'Encrypting...' : 'Upload & encrypt'}</button>
        </div>
      </section>

      {notice && <div className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${notice.tone === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200'}`}>{notice.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{notice.text}</div>}

      <section className="space-y-3"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#b8ef78]">LOCAL INVENTORY</p><h3 className="mt-1 text-lg font-semibold text-white">Your uploaded documents</h3></div><span className="font-mono text-xs text-slate-500">{documents.length.toString().padStart(2, '0')} encrypted</span></div>
        {documents.length === 0 ? <div className="aegis-panel rounded-xl p-8 text-center text-sm text-slate-500">No documents yet. Add a PDF or image to create your first private proof.</div> : <div className="grid gap-3 md:grid-cols-2">{documents.map(document => <article key={document.id} className="aegis-panel rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-lg bg-emerald-400/10 p-2 text-emerald-300"><FileCheck2 className="h-4 w-4" /></div><div><h4 className="text-sm font-semibold text-white">{document.documentType}</h4><p className="mt-0.5 text-xs text-slate-500">{document.name} · {new Date(document.uploadedAt).toLocaleDateString()}</p></div></div><button onClick={() => void remove(document.id)} title="Delete local encrypted document" className="text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div><p className="mt-4 truncate font-mono text-[10px] text-slate-500">SHA-256 {document.documentHash}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void copyProof(document.proof)} className="flex items-center gap-1.5 rounded-md border border-cyan-400/20 px-2.5 py-1.5 text-xs text-cyan-200 hover:bg-cyan-400/10"><Copy className="h-3.5 w-3.5" />Copy proof</button><button onClick={() => void anchorProof(document)} disabled={anchoringId === document.id || anchoredIds.has(document.id)} className="flex items-center gap-1.5 rounded-md border border-[#b8ef78]/30 px-2.5 py-1.5 text-xs text-[#b8ef78] disabled:opacity-50">{anchoredIds.has(document.id) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileLock2 className="h-3.5 w-3.5" />}{anchoredIds.has(document.id) ? 'Anchored on MST' : anchoringId === document.id ? 'Confirming...' : 'Anchor proof'}</button><span className="flex items-center gap-1.5 px-2 text-[10px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Encrypted locally</span></div></article>)}</div>}
      </section>

      <section className="aegis-panel rounded-2xl border-emerald-400/20 p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-400/10 p-2.5 text-emerald-300"><FileUp className="h-5 w-5" /></div><div><p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">TEACHER / HR VERIFIER</p><h3 className="text-lg font-semibold text-white">Verify a student proof</h3></div></div><p className="mt-2 text-xs text-slate-400">Paste the JSON proof shared by the student. Verification checks the signature and DID public key without requesting the file.</p><textarea value={proofInput} onChange={event => setProofInput(event.target.value)} placeholder="Paste proof JSON here" rows={5} className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-400/50" /><button onClick={() => void verify()} disabled={!proofInput.trim()} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#071018] disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Verify proof</button>
        {verification && <div className={`mt-4 rounded-lg border p-4 ${verification.valid ? 'border-amber-400/30 bg-amber-400/10' : 'border-rose-400/30 bg-rose-400/10'}`}><p className={`flex items-center gap-2 font-semibold ${verification.valid ? 'text-amber-300' : 'text-rose-300'}`}>{verification.valid ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}{verification.valid ? 'SIGNATURE VALID · ISSUER UNVERIFIED' : 'NOT VERIFIED'}</p>{verification.valid && verification.proof && <div className="mt-3 grid gap-1 text-xs text-slate-300"><span>Document label: {verification.proof.documentType}</span><span>Holder DID: <span className="font-mono text-[10px]">{verification.proof.holderDid}</span></span><span>Proof issued: {new Date(verification.proof.issuedAt).toLocaleString()}</span><span className="mt-2 text-amber-200">This proves the holder signed this file hash. It does not prove that a government authority issued the document.</span>{verification.onChain && <span className="text-emerald-300">Blockchain audit recorded as signature-valid, issuer-unverified: {verification.onChain}</span>}</div>}</div>}
      </section>
    </div>
  );
};
