import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const registryAbi = [
  'function anchorCredential(bytes32 credentialHash,string holder) returns (bytes32)',
  'function registerDID(string did,bytes publicKey) returns (bytes32)',
  'function logAuditRecord(bytes32 recordHash,string decision,uint256 score) returns (bytes32)',
];

export interface MstAnchorStatus {
  configured: boolean;
  network: string;
  registryAddress: string | null;
}

class MstAnchorService {
  private readonly provider: JsonRpcProvider | null;
  private readonly registry: Contract | null;
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
    };

    if (!this.status.configured) {
      this.provider = null;
      this.registry = null;
      return;
    }

    this.provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(privateKey!, this.provider);
    this.registry = new Contract(registryAddress!, registryAbi, signer);
  }

  async anchorCredential(credential: unknown, _issuer: string, holder: string): Promise<string | null> {
    if (!this.registry) return null;
    const credentialHash = keccak256(toUtf8Bytes(JSON.stringify(credential)));
    const transaction = await this.registry.anchorCredential(credentialHash, holder);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async registerDID(did: string, publicKeyJwk: JsonWebKey): Promise<string | null> {
    if (!this.registry) return null;
    const publicKey = toUtf8Bytes(JSON.stringify(publicKeyJwk));
    const transaction = await this.registry.registerDID(did, publicKey);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }

  async logAuditRecord(record: { userId: string; decision: string; humanityScore: number }): Promise<string | null> {
    if (!this.registry) return null;
    const recordHash = keccak256(toUtf8Bytes(JSON.stringify(record)));
    const transaction = await this.registry.logAuditRecord(recordHash, record.decision, record.humanityScore);
    const receipt = await transaction.wait();
    return receipt?.hash || transaction.hash;
  }
}

export const mstAnchor = new MstAnchorService();
