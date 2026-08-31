import React from 'react';
import { Shield, Fingerprint, Network, Cpu, FlaskConical, Wallet, CheckCircle2, Copy, Check, Terminal } from 'lucide-react';

interface NavbarProps {
  activeTab: 'wallet' | 'behavioral' | 'network' | 'dapps' | 'lab';
  setActiveTab: (tab: 'wallet' | 'behavioral' | 'network' | 'dapps' | 'lab') => void;
  userDid: string;
  humanityScore: number;
  isAiConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userDid,
  humanityScore,
  isAiConnected,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyDid = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(userDid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const navItems = [
    { id: 'wallet', label: 'DID & ZK Wallet', icon: Wallet, badge: 'Self-Sovereign' },
    { id: 'behavioral', label: 'Behavioral Biometrics', icon: Fingerprint, badge: 'Real-time' },
    { id: 'network', label: 'Trust Graph & Sybil', icon: Network, badge: 'EigenTrust' },
    { id: 'dapps', label: 'Zero-KYC dApps', icon: Shield, badge: 'Verifier Gateway' },
    { id: 'lab', label: 'Attack & Defense Lab', icon: FlaskConical, badge: 'Simulation' },
  ] as const;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Identity branding */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
              <Shield className="w-5 h-5 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white font-mono">
                  Aegis<span className="text-cyan-400">DID</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase tracking-wider">
                  Zero-KYC AI Shield
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Verifiable Credentials + Behavioral & Graph AI
              </p>
            </div>
          </div>

          {/* User DID Pill */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleCopyDid}
              title="Click to copy your Self-Sovereign Decentralized Identifier"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all text-xs text-slate-300"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-[11px] text-slate-400 group-hover:text-slate-200">
                {userDid ? `${userDid.substring(0, 14)}...${userDid.substring(userDid.length - 6)}` : 'Generating DID...'}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400" />
              )}
            </button>

            {/* Humanity Trust Score Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs font-mono">
              <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold">{humanityScore}</span>
              <span className="text-[10px] text-emerald-400/70">/100</span>
            </div>

            {/* AI Engine Status */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border ${
                isAiConnected
                  ? 'bg-blue-950/40 border-blue-800/50 text-blue-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Gemini 3.7 AI</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none border-t border-slate-900">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
