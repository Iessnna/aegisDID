import { BrowserProvider, Contract, formatEther, type Eip1193Provider } from 'ethers';

export interface WalletState {
  address: string | null;
  chainId: string | null;
  chainName: string | null;
  error: string | null;
  nativeBalance: string | null;
}

export interface WalletProvider extends Eip1193Provider {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export const registryAbi = [
  'function anchorCredential(bytes32 credentialHash,string holder) returns (bytes32)',
  'function registerDID(string did,bytes publicKey) returns (bytes32)',
  'function logAuditRecord(bytes32 recordHash,string decision,uint256 score) returns (bytes32)',
];

export const mstChain = {
  chainId: import.meta.env.VITE_MST_CHAIN_ID || null,
  chainName: import.meta.env.VITE_MST_NETWORK_NAME || 'MST Testnet',
  nativeCurrency: { name: 'MST', symbol: 'MST', decimals: 18 },
  rpcUrls: [import.meta.env.VITE_MST_RPC_URL || 'https://testnetrpc.mstblockchain.com'],
  blockExplorerUrls: import.meta.env.VITE_MST_EXPLORER_URL ? [import.meta.env.VITE_MST_EXPLORER_URL] : [],
};

export const mstFaucetUrl = import.meta.env.VITE_MST_FAUCET_URL || '';
export const minimumNativeBalance = import.meta.env.VITE_MST_MIN_NATIVE_BALANCE || '0.001';

export function walletConfigurationError(): string | null {
  if (!mstChain.chainId) return 'MST wallet configuration is incomplete: VITE_MST_CHAIN_ID is missing.';
  if (!import.meta.env.VITE_MST_CREDENTIAL_REGISTRY_ADDRESS) return 'MST wallet configuration is incomplete: VITE_MST_CREDENTIAL_REGISTRY_ADDRESS is missing.';
  return null;
}

export function getWalletProvider(): WalletProvider | null {
  return (window as Window & { ethereum?: WalletProvider }).ethereum || null;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function getWalletNetwork(provider: BrowserProvider): Promise<{ chainId: string; name: string }> {
  const network = await provider.getNetwork();
  return { chainId: `0x${network.chainId.toString(16)}`, name: network.name === 'unknown' ? mstChain.chainName : network.name };
}

export async function switchToMstNetwork(wallet: WalletProvider): Promise<void> {
  if (!mstChain.chainId) throw new Error(walletConfigurationError() || 'MST chain configuration is missing');
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: mstChain.chainId }] });
  } catch (error: any) {
    if (error?.code !== 4902) throw error;
    await wallet.request({ method: 'wallet_addEthereumChain', params: [mstChain] });
  }
}

export function getRegistryContract(provider: BrowserProvider, address: string): Contract {
  return new Contract(address, registryAbi, provider);
}

export async function submitUserTransaction(type: string, action: (contract: any) => Promise<any>): Promise<string> {
  const injected = getWalletProvider();
  const registryAddress = import.meta.env.VITE_MST_CREDENTIAL_REGISTRY_ADDRESS;
  const configurationError = walletConfigurationError();
  if (configurationError) throw new Error(configurationError);
  if (!injected) throw new Error('Connect a wallet before signing a transaction');
  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  const balance = formatEther(await provider.getBalance(await signer.getAddress()));
  if (Number(balance) < Number(minimumNativeBalance)) throw new Error(`Insufficient MST balance (${balance} MST). Add testnet MST before signing.`);
  const contract = getRegistryContract(provider, registryAddress).connect(signer);
  const transaction = await action(contract);
  const receipt = await transaction.wait();
  if (!receipt?.hash || receipt.status !== 1) throw new Error('Transaction reverted on-chain');
  const response = await fetch('/api/transactions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, txHash: receipt.hash }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Transaction was confirmed, but history verification failed'); }
  return receipt.hash;
}