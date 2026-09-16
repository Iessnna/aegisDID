import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const registryAbi = [
  'function owner() view returns (address)',
  'function authorizedCallers(address) view returns (bool)',
  'function authorizeCaller(address caller,bool allowed)',
  'function revokeDID(string did)',
  'function revokeCredential(bytes32 credentialHash)',
  'function anchorCredential(bytes32 credentialHash,string holder) returns (bytes32)',
  'function registerDID(string did,bytes publicKey) returns (bytes32)',
  'function logAuditRecord(bytes32 recordHash,string decision,uint256 score) returns (bytes32)',
];

export interface MstAnchorStatus {
  configured: boolean;
  network: string;
  registryAddress: string | null;
  clientWritesSupported: boolean;
  revokeSupported: boolean;
}

class MstAnchorService {
  private readonly provider: JsonRpcProvider | null;
  private readonly registry: Contract | null;
  private readonly signerAddress: string | null;
  private authorizationChecked = false;
  private authorized = false;
  private authorizationWarningLogged = false;
  readonly status: MstAnchorStatus;

  constructor() {
    const rpcUrl = process.env.MST_RPC_URL;
    const privateKey = process.env.MST_PRIVATE_KEY;
    const registryAddress = process.env.MST_CREDENTIAL_REGISTRY_ADDRESS;
    const isPlaceholderAddress = registryAddress === '0x1234567890123456789012345678901234567890';
    this.status = {
      configured: Boolean(rpcUrl && privateKey && registryAddress && !isPlaceholderAddress),
      network: process.env.MST_NETWORK || 'testnet',
      registryAddress: registryAddress || null,
      clientWritesSupported: true,
      revokeSupported: true,
    };

    if (!this.status.configured) {
      this.provider = null;
      this.registry = null;
      this.signerAddress = null;
      return;
    }

    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      const signer = new Wallet(privateKey!, this.provider);
      this.signerAddress = signer.address;
      this.registry = new Contract(registryAddress!, registryAbi, signer);
    } catch (error: any) {
      this.status.configured = false;
      this.provider = null;
      this.registry = null;
      this.signerAddress = null;
      console.warn(`MST server signer disabled: ${error?.shortMessage || error?.message || 'invalid server signer configuration'}`);
    }
  }

  private async isAuthorized(): Promise<boolean> {
    if (!this.registry) return false;
    if (this.authorizationChecked) return this.authorized;

    this.authorizationChecked = true;
    const signerAddress = this.signerAddress;
    const ownerAddress = await this.registry.owner();
    this.authorized = Boolean(signerAddress && ownerAddress && signerAddress.toLowerCase() === ownerAddress.toLowerCase());

    if (!this.authorized && !this.authorizationWarningLogged) {
      this.authorizationWarningLogged = true;
      console.warn(`MST anchoring disabled: registry owner is ${ownerAddress}, but MST_PRIVATE_KEY resolves to ${signerAddress}. Use the deployer key or redeploy the registry with the server wallet.`);
    }
    return this.authorized;
  }

  async anchorCredential(credential: unknown, _issuer: string, holder: string): Promise<string | null> {
    if (!(await this.isAuthorized())) return null;
    const credentialHash = keccak256(toUtf8Bytes(JSON.stringify(credential)));
    const transaction = await this.registry.anchorCredential(credentialHash, holder);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async registerDID(did: string, publicKeyJwk: JsonWebKey): Promise<string | null> {
    if (!(await this.isAuthorized())) return null;
    const publicKey = toUtf8Bytes(JSON.stringify(publicKeyJwk));
    const transaction = await this.registry.registerDID(did, publicKey);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async logAuditRecord(record: { userId: string; decision: string; humanityScore: number }): Promise<string | null> {
    if (!(await this.isAuthorized())) return null;
    const recordHash = keccak256(toUtf8Bytes(JSON.stringify(record)));
    const transaction = await this.registry.logAuditRecord(recordHash, record.decision, record.humanityScore);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async publishSybilRecord(recordHash: string, decision: string, score: number): Promise<string | null> {
    if (!(await this.isAuthorized())) return null;
    const transaction = await this.registry.logAuditRecord(recordHash, decision, score);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async revokeDID(did: string): Promise<string | null> {
    if (!(await this.isAuthorized())) return null;
    const transaction = await this.registry.revokeDID(did);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }
}

export const mstAnchor = new MstAnchorService();
