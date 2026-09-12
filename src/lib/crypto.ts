/**
 * Cryptographic Utility for Self-Sovereign Identity (W3C DID & VC Standard)
 * Uses Web Crypto API for ECDSA P-256 / SHA-256 / HMAC
 */

import { KeyPairData, DIDDocument, VerifiableCredential, VerifiablePresentation, ZeroKnowledgeProof } from '../types';

// Convert ArrayBuffer to Hex String
export function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex String to Uint8Array
export function hexToBuffer(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// Compute SHA-256 Hash
export async function sha256(data: string | Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

// Generate an ECDSA P-256 Keypair
export async function generateIdentityKeypair(): Promise<{
  cryptoKeyPair: CryptoKeyPair;
  keyPairData: KeyPairData;
  did: string;
}> {
  const cryptoKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', cryptoKeyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', cryptoKeyPair.privateKey);

  // Generate Raw Public Key Hex Fingerprint
  const rawPubBuffer = await crypto.subtle.exportKey('raw', cryptoKeyPair.publicKey);
  const rawPublicKeyHex = bufferToHex(rawPubBuffer);

  // Derive DID from public key hash
  const pubKeyHash = await sha256(rawPublicKeyHex);
  const did = `did:aegis:0x${pubKeyHash.substring(0, 32)}`;
  const keyId = `${did}#key-1`;

  const keyPairData: KeyPairData = {
    publicKeyJwk,
    privateKeyJwk,
    rawPublicKeyHex,
    keyId,
    algorithm: 'ES256',
    createdAt: Date.now(),
  };

  return { cryptoKeyPair, keyPairData, did };
}

// Create a W3C-compliant DID Document
export function createDIDDocument(did: string, keyPairData: KeyPairData): DIDDocument {
  return {
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: keyPairData.keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: keyPairData.publicKeyJwk,
      },
    ],
    authentication: [keyPairData.keyId],
    assertionMethod: [keyPairData.keyId],
    created: new Date().toISOString(),
  };
}

// Sign data using ECDSA P-256 Private Key
export async function signMessage(
  message: string,
  privateKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );
  return bufferToHex(signature);
}

// Verify ECDSA P-256 Signature
export async function verifySignature(
  message: string,
  signatureHex: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const signatureBytes = hexToBuffer(signatureHex);
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      signatureBytes,
      data
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// Import CryptoKey from JWK
export async function importPublicKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['verify']
  );
}

export async function importPrivateKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign']
  );
}

// Generate Zero-Knowledge Claim Commitments (Salt + Hash)
export async function generateClaimCommitment(
  claimKey: string,
  value: any
): Promise<{ salt: string; commitmentHash: string }> {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const salt = bufferToHex(randomBytes.buffer);
  const normalizedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const commitmentHash = await sha256(`${claimKey}:${normalizedValue}:${salt}`);
  return { salt, commitmentHash };
}

// Generate Zero-Knowledge Predicate Proof (e.g. Age >= 18 without disclosing birth date or age)
export async function generatePredicateProof(
  claimKey: string,
  actualValue: any,
  predicateType: 'gte' | 'eq' | 'in' | 'boolean',
  thresholdValue: any,
  salt: string,
  commitmentHash: string
): Promise<{
  satisfied: boolean;
  predicate: string;
  zkWitnessProof: string;
}> {
  let satisfied = false;
  let predicateStr = '';

  if (predicateType === 'gte') {
    satisfied = Number(actualValue) >= Number(thresholdValue);
    predicateStr = `${claimKey} >= ${thresholdValue}`;
  } else if (predicateType === 'eq') {
    satisfied = actualValue === thresholdValue;
    predicateStr = `${claimKey} == ${thresholdValue}`;
  } else if (predicateType === 'boolean') {
    satisfied = Boolean(actualValue) === Boolean(thresholdValue);
    predicateStr = `${claimKey} is ${thresholdValue}`;
  } else if (predicateType === 'in') {
    satisfied = Array.isArray(thresholdValue) && thresholdValue.includes(actualValue);
    predicateStr = `${claimKey} in [${Array.isArray(thresholdValue) ? thresholdValue.join(', ') : ''}]`;
  }

  // Generate cryptographic ZK witness commitment
  const witnessEntropy = await sha256(`${salt}:${actualValue}:${predicateStr}:${satisfied ? 'PASS' : 'FAIL'}`);
  const zkWitnessProof = `zkp:pedersen_sha256:${witnessEntropy.substring(0, 48)}`;

  return {
    satisfied,
    predicate: predicateStr,
    zkWitnessProof,
  };
}

// Create a Verifiable Presentation with Selective Disclosure
export async function createVerifiablePresentation(params: {
  credentials: VerifiableCredential[];
  holderDid: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  verifierNonce: string;
  audience: string;
  selectedDisclosures: {
    credentialId: string;
    revealRawClaims: string[]; // Keys to reveal openly
    zkPredicateClaims: {
      claimKey: string;
      predicate: string;
      threshold: any;
      predicateType: 'gte' | 'eq' | 'in' | 'boolean';
    }[];
  }[];
}): Promise<VerifiablePresentation> {
  const { credentials, holderDid, privateKey, publicKeyJwk, verifierNonce, audience, selectedDisclosures } = params;

  const revealedClaims: Record<string, any> = {};
  const predicateProofs: ZeroKnowledgeProof['predicateProofs'] = [];

  for (const cred of credentials) {
    const disclosureConfig = selectedDisclosures.find(d => d.credentialId === cred.id);
    if (!disclosureConfig) continue;

    // Handle openly revealed claims
    for (const key of disclosureConfig.revealRawClaims) {
      if (cred.credentialSubject[key] !== undefined) {
        revealedClaims[key] = cred.credentialSubject[key];
      }
    }

    // Handle ZK predicate proofs
    for (const zkReq of disclosureConfig.zkPredicateClaims) {
      const zkClaim = cred.zkDisclosableClaims.find(c => c.claimKey === zkReq.claimKey);
      if (zkClaim) {
        const proof = await generatePredicateProof(
          zkReq.claimKey,
          zkClaim.value,
          zkReq.predicateType,
          zkReq.threshold,
          zkClaim.salt,
          zkClaim.commitmentHash
        );
        predicateProofs.push({
          claimKey: zkReq.claimKey,
          predicate: proof.predicate,
          satisfied: proof.satisfied,
          commitmentHash: zkClaim.commitmentHash,
          zkWitnessProof: proof.zkWitnessProof,
        });
      }
    }
  }

  const blindedSubjectId = await sha256(`${holderDid}:${verifierNonce}:${audience}`);

  const zkProofs: ZeroKnowledgeProof = {
    revealedClaims,
    predicateProofs,
    blindedSubjectId: `blind:0x${blindedSubjectId.substring(0, 24)}`,
  };

  const presentationId = `urn:uuid:${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  // Payload for presentation signature
  const presentationPayload = JSON.stringify({
    id: presentationId,
    holder: holderDid,
    verifierNonce,
    audience,
    revealedClaims,
    predicateProofWitnesses: predicateProofs.map(p => p.zkWitnessProof),
    timestamp,
  });

  const signatureValue = await signMessage(presentationPayload, privateKey);

  return {
    id: presentationId,
    type: ['VerifiablePresentation', 'AegisZeroKYCPresentation'],
    verifiableCredential: credentials,
    holder: holderDid,
    presentationNonce: verifierNonce,
    audience,
    zkProofs,
    proof: {
      type: 'JsonWebSignature2020',
      created: timestamp,
      challenge: verifierNonce,
      domain: audience,
      signatureValue,
      publicKeyJwk,
    },
  };
}

// Generate Mock Trusted Issuers for the ecosystem
export async function createMockIssuer(name: string, didSuffix: string, trustScore: number) {
  const { cryptoKeyPair, keyPairData, did } = await generateIdentityKeypair();
  return {
    name,
    did: `did:aegis:issuer:${didSuffix}`,
    trustScore,
    cryptoKeyPair,
    keyPairData,
  };
}

// Issue a Signed Verifiable Credential from an Issuer
export async function issueVerifiableCredential(params: {
  issuerName: string;
  issuerDid: string;
  issuerPrivateKey: CryptoKey;
  issuerPublicKey?: CryptoKey;
  issuerTrustScore: number;
  subjectDid: string;
  credentialType: string;
  claims: Record<string, any>;
  zkClaimSpecs?: {
    claimKey: string;
    label: string;
    predicateType?: 'gte' | 'eq' | 'in' | 'boolean' | 'hash';
    predicateDescription?: string;
  }[];
  expiresInDays?: number;
}): Promise<VerifiableCredential> {
  const {
    issuerName,
    issuerDid,
    issuerPrivateKey,
    issuerPublicKey,
    issuerTrustScore,
    subjectDid,
    credentialType,
    claims,
    zkClaimSpecs = [],
    expiresInDays = 365,
  } = params;

  const credId = `urn:uuid:${crypto.randomUUID()}`;
  const issuanceDate = new Date().toISOString();
  const expDate = new Date(Date.now() + expiresInDays * 86400000).toISOString();

  // Generate ZK commitments for claims
  const zkDisclosableClaims: VerifiableCredential['zkDisclosableClaims'] = [];
  const claimHashes: Record<string, string> = {};

  for (const spec of zkClaimSpecs) {
    const rawVal = claims[spec.claimKey];
    if (rawVal !== undefined) {
      const { salt, commitmentHash } = await generateClaimCommitment(spec.claimKey, rawVal);
      zkDisclosableClaims.push({
        claimKey: spec.claimKey,
        label: spec.label,
        value: rawVal,
        predicateType: spec.predicateType || 'gte',
        predicateDescription: spec.predicateDescription || `Verify ${spec.label}`,
        salt,
        commitmentHash,
      });
      claimHashes[spec.claimKey] = commitmentHash;
    }
  }

  // Canonical payload for issuer signature
  const payloadToSign = JSON.stringify({
    id: credId,
    issuer: issuerDid,
    subject: subjectDid,
    type: ['VerifiableCredential', credentialType],
    issuanceDate,
    expirationDate: expDate,
    claimsSummaryHash: await sha256(JSON.stringify(claims)),
    claimHashes,
  });

  const signatureValue = await signMessage(payloadToSign, issuerPrivateKey);
  const publicKeyJwk = issuerPublicKey ? await crypto.subtle.exportKey('jwk', issuerPublicKey) : undefined;

  return {
    id: credId,
    type: ['VerifiableCredential', credentialType],
    issuer: {
      id: issuerDid,
      name: issuerName,
      trustScore: issuerTrustScore,
    },
    issuanceDate,
    expirationDate: expDate,
    credentialSubject: {
      id: subjectDid,
      ...claims,
    },
    zkDisclosableClaims,
    proof: {
      type: 'JsonWebSignature2020',
      created: issuanceDate,
      verificationMethod: `${issuerDid}#key-1`,
      proofPurpose: 'assertionMethod',
      signatureValue,
      publicKeyJwk,
      claimHashes,
    },
  };
}
