import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider, formatEther } from 'ethers';
import { getWalletNetwork, getWalletProvider, minimumNativeBalance, mstChain, switchToMstNetwork, type WalletState, walletConfigurationError } from './wallet';

export function useWallet(userDid?: string) {
  const [wallet, setWallet] = useState<WalletState>({ address: null, chainId: null, chainName: null, error: null, nativeBalance: null });
  const [isConnecting, setIsConnecting] = useState(false);
  const refresh = useCallback(async () => {
    const injected = getWalletProvider();
    if (!injected) return setWallet(previous => ({ ...previous, error: null }));
    try {
      const provider = new BrowserProvider(injected);
      const accounts = await provider.send('eth_accounts', []);
      const network = await getWalletNetwork(provider);
      const nativeBalance = accounts[0] ? formatEther(await provider.getBalance(accounts[0])) : null;
      setWallet({ address: accounts[0] || null, chainId: network.chainId, chainName: network.name, error: null, nativeBalance });
    } catch (error) { setWallet(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Unable to read wallet' })); }
  }, []);
  const connect = useCallback(async () => {
    const injected = getWalletProvider();
    if (!injected) return setWallet(previous => ({ ...previous, error: 'NO_WALLET' }));
    setIsConnecting(true);
    try {
      const accounts = await injected.request({ method: 'eth_requestAccounts' }) as string[];
      const provider = new BrowserProvider(injected);
      const network = await getWalletNetwork(provider);
      const nativeBalance = accounts[0] ? formatEther(await provider.getBalance(accounts[0])) : null;
      setWallet({ address: accounts[0] || null, chainId: network.chainId, chainName: network.name, error: null, nativeBalance });
    } catch (error: any) { setWallet(previous => ({ ...previous, error: error?.code === 4001 ? 'Connection request rejected' : error?.message || 'Wallet connection failed' })); }
    finally { setIsConnecting(false); }
  }, []);
  const switchNetwork = useCallback(async () => {
    const injected = getWalletProvider();
    if (!injected) return;
    try { await switchToMstNetwork(injected); await refresh(); }
    catch (error: any) { setWallet(previous => ({ ...previous, error: error?.code === 4001 ? 'Network switch rejected' : error?.message || 'Unable to switch network' })); }
  }, [refresh]);
  const disconnect = useCallback(() => setWallet(previous => ({ ...previous, address: null, error: null })), []);
  useEffect(() => {
    void refresh();
    const injected = getWalletProvider();
    if (!injected?.on) return;
    const onAccountsChanged = () => { void refresh(); };
    const onChainChanged = () => { void refresh(); };
    injected.on('accountsChanged', onAccountsChanged);
    injected.on('chainChanged', onChainChanged);
    return () => { injected.removeListener?.('accountsChanged', onAccountsChanged); injected.removeListener?.('chainChanged', onChainChanged); };
  }, [refresh]);
  useEffect(() => {
    if (!wallet.address) return;
    void fetch('/api/auth/wallet', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: wallet.address, did: userDid }) });
  }, [wallet.address, userDid]);
  const isWrongNetwork = Boolean(wallet.chainId && mstChain.chainId && wallet.chainId.toLowerCase() !== mstChain.chainId.toLowerCase());
  const hasInsufficientBalance = Boolean(wallet.nativeBalance !== null && Number(wallet.nativeBalance) < Number(minimumNativeBalance));
  return { wallet, connect, disconnect, switchNetwork, isConnecting, isWrongNetwork, hasInsufficientBalance, walletConfigurationError: walletConfigurationError() };
}
