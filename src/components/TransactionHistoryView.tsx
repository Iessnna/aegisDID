import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

export interface TransactionRecord {
  id: string;
  type: string;
  txHash: string;
  walletAddress: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: string;
  error?: string;
}

interface Props { adminUserId?: string; }

export const TransactionHistoryView: React.FC<Props> = ({ adminUserId }) => {
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const query = adminUserId ? `?userId=${encodeURIComponent(adminUserId)}` : '';
    try {
      const response = await fetch(`/api/transactions${query}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load transactions');
      setRecords(data.transactions || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load transactions'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [adminUserId]);

  return <section className="aegis-panel rounded-2xl p-5">
    <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#b8ef78]">LEDGER ACTIVITY</p><h2 className="aegis-display mt-1 text-2xl font-semibold text-white">{adminUserId ? 'User transactions' : 'My Transactions'}</h2></div><button onClick={() => void load()} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06]" aria-label="Refresh transactions"><RefreshCw className="h-4 w-4" /></button></div>
    {loading ? <p className="text-sm text-slate-400">Loading transaction history...</p> : error ? <p className="text-sm text-rose-300">{error}</p> : records.length === 0 ? <p className="text-sm text-slate-400">No wallet transactions have been recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="pb-3">Type</th><th className="pb-3">Transaction</th><th className="pb-3">Status</th><th className="pb-3">Timestamp</th><th className="pb-3">Explorer</th><th className="pb-3">Gas</th></tr></thead><tbody>{records.map(record => { const explorerUrl = import.meta.env.VITE_MST_EXPLORER_URL; return <tr key={record.id} className="border-t border-white/[0.06] text-slate-300"><td className="py-3">{record.type}</td><td className="py-3 font-mono">{record.txHash ? <a className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" href={explorerUrl ? `${explorerUrl}/tx/${record.txHash}` : undefined} target="_blank" rel="noreferrer">{record.txHash.slice(0, 10)}...<ExternalLink className="h-3 w-3" /></a> : 'Awaiting hash'}</td><td className={`py-3 capitalize ${record.status === 'confirmed' ? 'text-emerald-300' : record.status === 'failed' ? 'text-rose-300' : 'text-amber-300'}`}>{record.status}{record.error ? `: ${record.error}` : ''}</td><td className="py-3">{new Date(record.timestamp).toLocaleString()}</td><td className="py-3">{record.txHash && explorerUrl ? <a className="inline-flex items-center gap-1 rounded-lg bg-cyan-400 px-2.5 py-1.5 font-semibold text-[#071018] hover:bg-cyan-300" href={`${explorerUrl}/tx/${record.txHash}`} target="_blank" rel="noreferrer">View on block explorer <ExternalLink className="h-3 w-3" /></a> : <span className="text-slate-600">Unavailable</span>}</td><td className="py-3 font-mono">{record.gasUsed || '-'}</td></tr>; })}</tbody></table></div>}
  </section>;
};