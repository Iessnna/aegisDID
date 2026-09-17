import React from 'react';
import { Shield, Fingerprint, Network, Cpu, FlaskConical, Wallet, Bell, Copy, Check, Menu, X, ExternalLink, LogOut, Files } from 'lucide-react';
import { mstChain } from '../lib/wallet';

interface NavbarProps {
  activeTab: 'wallet' | 'documents' | 'behavioral' | 'network' | 'dapps' | 'lab' | 'transactions' | 'notifications' | 'admin';
  setActiveTab: (tab: 'wallet' | 'documents' | 'behavioral' | 'network' | 'dapps' | 'lab' | 'transactions' | 'notifications' | 'admin') => void;
  userDid: string;
  humanityScore: number;
  isAiConnected: boolean;
  walletAddress: string | null;
  walletNetwork: string | null;
  walletError: string | null;
  isWrongNetwork: boolean;
  isConnectingWallet: boolean;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  onSwitchNetwork: () => void;
  nativeBalance: string | null;
  hasInsufficientBalance: boolean;
  walletConfigurationError: string | null;
  faucetUrl: string;
  userRole?: 'user' | 'admin';
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userDid,
  humanityScore,
  isAiConnected,
  walletAddress,
  walletNetwork,
  walletError,
  isWrongNetwork,
  isConnectingWallet,
  onConnectWallet,
  onDisconnectWallet,
  onSwitchNetwork,
  nativeBalance,
  hasInsufficientBalance,
  walletConfigurationError,
  faucetUrl,
  userRole,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleCopyDid = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(userDid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const selectTab = (tab: NavbarProps['activeTab']) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  const navItems = [
    { id: 'wallet', label: 'Identity', icon: Wallet, badge: 'Self-Sovereign' },
    { id: 'documents', label: 'Document Vault', icon: Files, badge: 'Private proofs' },
    { id: 'behavioral', label: 'Human Verification', icon: Fingerprint, badge: 'Real-time' },
    { id: 'network', label: 'Trust Graph', icon: Network, badge: 'EigenTrust' },
    { id: 'dapps', label: 'Zero-Knowledge Apps', icon: Shield, badge: 'Verifier Gateway' },
    { id: 'lab', label: 'Attack Lab', icon: FlaskConical, badge: 'Simulation' },
    { id: 'transactions', label: 'My Transactions', icon: Wallet, badge: 'On-chain history' },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: 'System updates' },
    ...(userRole === 'admin' ? [{ id: 'admin', label: 'Admin Portal', icon: Shield, badge: 'Restricted' }] : []),
  ] as const;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#071018]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-16 gap-3 py-3">
          {/* Logo & Identity branding */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-[#b8ef78] shadow-lg shadow-lime-300/10 border border-lime-100/30">
              <Shield className="w-5 h-5 text-[#071018]" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-cyan-400 border-2 border-[#071018] rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="aegis-display text-lg font-bold tracking-tight text-white">
                  Aegis<span className="text-[#b8ef78]">DID</span>
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
            {walletAddress ? <div className="flex items-center gap-2 rounded-lg border border-[#b8ef78]/20 bg-[#b8ef78]/5 px-2.5 py-1.5 text-xs"><span className="font-mono text-[#b8ef78]">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span><span className="hidden lg:inline text-slate-500">{walletNetwork || 'Wallet'}</span><button onClick={onDisconnectWallet} title="Disconnect wallet" className="text-slate-400 hover:text-white"><LogOut className="h-3.5 w-3.5" /></button></div> : <button onClick={onConnectWallet} disabled={isConnectingWallet} className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-60"><Wallet className="h-3.5 w-3.5" />{isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}</button>}
            <button
              onClick={handleCopyDid}
              title="Click to copy your Self-Sovereign Decentralized Identifier"
              className="group hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.08] transition-all text-xs text-slate-300"
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

            <button
              onClick={() => setIsMenuOpen(prev => !prev)}
              className="flex sm:hidden items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-white/[0.04] text-slate-300"
              aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>

            {/* AI Engine Status */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border ${
                isAiConnected
                  ? 'bg-blue-950/40 border-blue-800/50 text-blue-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isAiConnected ? 'LangChain AI online' : 'Local engine'}</span>
            </div>
          </div>
        </div>
        {walletError && <div className="border-t border-white/[0.06] py-2 text-xs text-amber-300">{walletError === 'NO_WALLET' ? <><a className="inline-flex items-center gap-1 underline" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Install MetaMask <ExternalLink className="h-3 w-3" /></a> to connect an EIP-1193 wallet.</> : walletError}</div>}
        {walletConfigurationError && <div className="border-t border-white/[0.06] py-2 text-xs text-rose-300">{walletConfigurationError}</div>}
        {isWrongNetwork && <div className="border-t border-white/[0.06] py-2 text-xs text-amber-300"><button onClick={onSwitchNetwork} className="underline">Switch to {mstChainName()}</button> to sign MST transactions.</div>}
        {walletAddress && nativeBalance !== null && <div className={`border-t border-white/[0.06] py-2 text-xs ${hasInsufficientBalance ? 'text-amber-300' : 'text-slate-400'}`}>MST balance: {Number(nativeBalance).toFixed(4)} MST{hasInsufficientBalance && <>. Add testnet MST before signing. {faucetUrl ? <a className="underline" href={faucetUrl} target="_blank" rel="noreferrer">Open faucet</a> : 'No faucet is configured.'}</>}</div>}

        {/* Navigation Tabs */}
        <nav className={`${isMenuOpen ? 'grid' : 'hidden'} sm:flex grid-cols-2 gap-1.5 sm:space-x-2 overflow-x-auto py-2 border-t border-slate-900`}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectTab(item.id as NavbarProps['activeTab'])}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
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

function mstChainName() { return mstChain.chainName; }
