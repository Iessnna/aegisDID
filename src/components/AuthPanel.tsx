import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, LogIn, LogOut, ShieldCheck, UserPlus } from 'lucide-react';

interface ApiKeyMetadata {
  id: string;
  name: string;
  createdAt: string;
}

interface AuthUser {
  id: string;
  email: string;
  role?: 'user' | 'admin';
}

interface AuthPanelProps {
  onAuthChange?: (authenticated: boolean) => void;
  onApiKeyChange?: (apiKey: string, enabled: boolean) => void;
  onUserChange?: (user: AuthUser | null) => void;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthChange, onApiKeyChange, onUserChange }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyMetadata[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keyName, setKeyName] = useState('Hackathon demo integration');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualApiKey, setManualApiKey] = useState('');
  const [useApiKey, setUseApiKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const applyAuth = (nextUser: AuthUser | null, nextKeys: ApiKeyMetadata[] = []) => {
    setUser(nextUser);
    setApiKeys(nextKeys);
    onAuthChange?.(Boolean(nextUser));
    onUserChange?.(nextUser);
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then(response => response.json())
      .then(data => applyAuth(data.authenticated ? data.user : null, data.apiKeys || []))
      .catch(() => setError('Account service unavailable'))
      .finally(() => setIsLoading(false));
  }, []);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }
      applyAuth(data.user, data.apiKeys || []);
      setPassword('');
      setNotice(isRegistering ? 'Account created and signed in.' : 'Welcome back.');
    } catch {
      setError('Account service unavailable');
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setNotice('Signing out...');
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setNewApiKey(null);
    applyAuth(null);
    setNotice('Signed out.');
  };

  const createApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const response = await fetch('/api/auth/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: keyName }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Only an authenticated user can create an API key');
      return;
    }
    setNewApiKey(data.apiKey);
    setApiKeys(previous => [...previous, data.metadata]);
    setNotice('API key created. Copy it now; it will not be shown again.');
  };

  const revokeApiKey = async (keyId: string) => {
    const response = await fetch(`/api/auth/api-keys/${keyId}`, { method: 'DELETE', credentials: 'include' });
    if (response.ok) {
      setApiKeys(previous => previous.filter(key => key.id !== keyId));
      setNotice('API key revoked.');
    }
  };

  const copyApiKey = async () => {
    if (!newApiKey) return;
    await navigator.clipboard.writeText(newApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return null;

  return (
    <section className="aegis-panel mx-auto mt-4 w-full max-w-7xl rounded-2xl p-4 sm:p-5">
      {!user ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-sm font-semibold text-white">{isAdminLogin ? 'Administrator sign-in' : 'Authorize integrations'}</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">{isAdminLogin ? 'Use the seeded ADMIN_EMAIL and ADMIN_PASSWORD account. Successful login unlocks the Admin Portal automatically.' : 'Sign in to create an AegisDID API key. AI provider credentials remain server-only and are never generated or exposed here.'}</p>
            </div>
          </div>
          <form onSubmit={submitAuth} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60" />
            <input required minLength={10} type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="10+ character password" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60" />
            <button disabled={isSubmitting} type="submit" className="flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-[#071018] hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Working...' : <>{isRegistering ? <UserPlus className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}{isRegistering ? 'Create account' : 'Sign in'}</>}</button>
            {!isAdminLogin && <button type="button" onClick={() => setIsRegistering(previous => !previous)} className="px-2 py-2 text-xs text-slate-400 hover:text-white">{isRegistering ? 'I have an account' : 'Create account'}</button>}
            <button type="button" onClick={() => { setIsAdminLogin(previous => !previous); setIsRegistering(false); setError(null); }} className="px-2 py-2 text-xs text-amber-300 hover:text-amber-200">{isAdminLogin ? 'User sign-in' : 'Admin sign-in'}</button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-[#b8ef78]/20 bg-[#b8ef78]/10 p-2 text-[#b8ef78]"><KeyRound className="h-5 w-5" /></div>
            <div><p className="text-sm font-semibold text-white">Authorized account</p><p className="mt-1 text-xs text-slate-400">{user.email} · {apiKeys.length} active API key{apiKeys.length === 1 ? '' : 's'}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={createApiKey} className="flex gap-2"><input value={keyName} onChange={event => setKeyName(event.target.value)} aria-label="API key name" className="w-48 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60" /><button type="submit" className="flex items-center gap-2 rounded-lg bg-[#b8ef78] px-3 py-2 text-xs font-bold text-[#071018] hover:bg-lime-200"><KeyRound className="h-3.5 w-3.5" />Generate key</button></form>
            <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"><LogOut className="h-3.5 w-3.5" />Sign out</button>
          </div>
        </div>
      )}

      {newApiKey && <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-amber-200">Copy this key now. It will not be shown again.</p><p className="mt-1 break-all font-mono text-[11px] text-amber-100">{newApiKey}</p></div><button onClick={copyApiKey} className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-300/30 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/10">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy key'}</button></div>}
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3 sm:flex-row sm:items-center"><label htmlFor="manual-api-key" className="text-xs font-semibold text-slate-300">API key mode</label><select aria-label="API authentication mode" value={useApiKey ? 'api-key' : 'session'} onChange={event => { const enabled = event.target.value === 'api-key'; setUseApiKey(enabled); onApiKeyChange?.(manualApiKey, enabled); }} className="rounded-lg border border-white/10 bg-[#071018] px-2 py-2 text-xs text-white"><option value="session">Use session cookie</option><option value="api-key">Use API key</option></select><input id="manual-api-key" type="password" value={manualApiKey} onChange={event => { const value = event.target.value; const looksLikeApiKey = value.startsWith('aegis_live_'); setManualApiKey(value); if (looksLikeApiKey && !useApiKey) setUseApiKey(true); onApiKeyChange?.(value, looksLikeApiKey || useApiKey); }} placeholder="Paste an aegis_live_ key" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/60"/><span className={`text-[11px] ${useApiKey ? 'text-[#b8ef78]' : 'text-slate-500'}`}>{useApiKey ? 'Bearer API key selected' : 'Paste a key or choose Use API key.'}</span></div>
      {apiKeys.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{apiKeys.map(key => <div key={key.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-300"><span>{key.name}</span><span className="font-mono text-slate-600">{new Date(key.createdAt).toLocaleDateString()}</span><button onClick={() => revokeApiKey(key.id)} className="text-rose-300 hover:text-rose-200">Revoke</button></div>)}</div>}
      {notice && <p role="status" aria-live="polite" className="mt-3 text-xs text-[#b8ef78]">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
  );
};
