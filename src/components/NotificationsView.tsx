import React, { useEffect, useState } from 'react';
import { Bell, Check, RefreshCw } from 'lucide-react';

interface NotificationRecord { id: string; userId: string | null; type: 'info' | 'error' | 'admin'; title: string; message: string; createdAt: string; readAt: string | null; }

export const NotificationsView: React.FC = () => {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications', { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load notifications');
      setItems(data.notifications || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
    setItems(previous => previous.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
  };
  return <section className="aegis-panel rounded-2xl p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#b8ef78]">ACCOUNT UPDATES</p><h2 className="aegis-display mt-1 text-2xl font-semibold text-white">Notifications</h2></div><button onClick={() => void load()} aria-label="Refresh notifications" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06]"><RefreshCw className="h-4 w-4" /></button></div>{loading ? <p className="text-sm text-slate-400">Loading notifications...</p> : error ? <p className="text-sm text-rose-300">{error}</p> : items.length === 0 ? <div className="flex items-center gap-3 py-8 text-sm text-slate-400"><Bell className="h-5 w-5" />You are all caught up.</div> : <div className="space-y-2">{items.map(item => <article key={item.id} className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${item.readAt ? 'border-white/[0.06] bg-white/[0.02]' : 'border-cyan-400/30 bg-cyan-400/[0.06]'}`}><div><div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${item.type === 'error' ? 'bg-rose-400/15 text-rose-300' : item.type === 'admin' ? 'bg-amber-400/15 text-amber-300' : 'bg-cyan-400/15 text-cyan-300'}`}>{item.type}</span><h3 className="text-sm font-semibold text-white">{item.title}</h3></div><p className="mt-2 text-xs leading-relaxed text-slate-300">{item.message}</p><time className="mt-2 block text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</time></div>{!item.readAt && <button onClick={() => void markRead(item.id)} title="Mark as read" className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06]"><Check className="h-4 w-4" /></button>}</article>)}</div>}</section>;
};
