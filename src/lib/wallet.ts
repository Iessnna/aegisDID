import { BrowserProvider, Contract, formatEther, type Eip1193Provider } from 'ethers';

const mstDefaults = {
  chainId: '0x5752035',
  chainName: 'MST Testnet',
  rpcUrl: 'https://testnetrpc.mstblockchain.com',
  explorerUrl: 'https://testnet.mstscan.com',
  registryAddress: '0x8ea34e36670557A552c25F37A81b895Ca0535F6c',
  faucetUrl: '',
  minNativeBalance: '0.001',
};

const env = (typeof import.meta !== 'undefined' ? import.meta.env : {}) as Record<string, string | undefined>;
const resolvedMstConfig = {
  chainId: env['VITE_MST_CHAIN_ID'] || env['MST_CHAIN_ID'] || mstDefaults.chainId,
  chainName: env['VITE_MST_NETWORK_NAME'] || env['MST_NETWORK'] || mstDefaults.chainName,
  rpcUrl: env['VITE_MST_RPC_URL'] || env['MST_RPC_URL'] || mstDefaults.rpcUrl,
  explorerUrl: env['VITE_MST_EXPLORER_URL'] || env['MST_EXPLORER_URL'] || mstDefaults.explorerUrl,
  registryAddress: env['VITE_MST_CREDENTIAL_REGISTRY_ADDRESS'] || env['MST_CREDENTIAL_REGISTRY_ADDRESS'] || mstDefaults.registryAddress,
  faucetUrl: env['VITE_MST_FAUCET_URL'] || env['MST_FAUCET_URL'] || mstDefaults.faucetUrl,
  minNativeBalance: env['VITE_MST_MIN_NATIVE_BALANCE'] || env['MST_MIN_NATIVE_BALANCE'] || mstDefaults.minNativeBalance,
};

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
  chainId: resolvedMstConfig.chainId,
  chainName: resolvedMstConfig.chainName,
  nativeCurrency: { name: 'MST', symbol: 'MST', decimals: 18 },
  rpcUrls: [resolvedMstConfig.rpcUrl],
  blockExplorerUrls: [resolvedMstConfig.explorerUrl],
};

export const mstFaucetUrl = resolvedMstConfig.faucetUrl;
export const minimumNativeBalance = resolvedMstConfig.minNativeBalance;

export function walletConfigurationError(): string | null {
  const required = [
    ['VITE_MST_CHAIN_ID', resolvedMstConfig.chainId],
    ['VITE_MST_RPC_URL', resolvedMstConfig.rpcUrl],
  ].find(([, value]) => !value);
  if (required) return `MST wallet configuration is incomplete: ${required[0]} is missing. Add it to the build environment and redeploy.`;
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
  const registryAddress = resolvedMstConfig.registryAddress;
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