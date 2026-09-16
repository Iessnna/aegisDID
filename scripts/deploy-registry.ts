import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import { ContractFactory, JsonRpcProvider, Wallet } from 'ethers';

const rpcUrl = process.env.MST_RPC_URL;
const rawPrivateKey = process.env.MST_PRIVATE_KEY;
if (!rpcUrl || !rawPrivateKey) throw new Error('MST_RPC_URL and MST_PRIVATE_KEY are required');
const privateKey = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error('MST_PRIVATE_KEY must contain 32 bytes');

const source = await readFile(path.resolve('contracts/AegisCredentialRegistry.sol'), 'utf8');
const input = { language: 'Solidity', sources: { 'AegisCredentialRegistry.sol': { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (compiled.errors || []).filter((error: { severity: string }) => error.severity === 'error');
if (errors.length) throw new Error(errors.map((error: { formattedMessage: string }) => error.formattedMessage).join('\n'));
const artifact = compiled.contracts['AegisCredentialRegistry.sol'].AegisCredentialRegistry;
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();
console.log(`Deploying from ${wallet.address} on chain ${network.chainId}...`);
const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, wallet);
const contract = await factory.deploy();
await contract.waitForDeployment();
console.log(`AegisCredentialRegistry deployed at ${await contract.getAddress()}`);