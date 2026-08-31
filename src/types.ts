/**
 * Decentralized Identity & AI Behavioral Fraud Detection Types
 */

export interface KeyPairData {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk?: JsonWebKey;
  rawPublicKeyHex: string;
  keyId: string;
  algorithm: string;
  createdAt: number;
}

export interface DIDDocument {
  id: string; // e.g. did:aegis:0x892a4f...
  controller: string;
  verificationMethod: {
    id: string;
    type: string;
    controller: string;
    publicKeyJwk: JsonWebKey;
  }[];
  authentication: string[];
  assertionMethod: string[];
  created: string;
}

export interface CredentialSubject {
  id: string; // Holder DID
  [key: string]: any;
}

export interface CredentialProof {
  type: string; // "JsonWebSignature2020" | "EcdsaSecp256r1Signature2019"
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
  signatureValue: string;
  nonce?: string;
  claimHashes?: Record<string, string>;
}

export interface VerifiableCredential {
  id: string;
  type: string[]; // ["VerifiableCredential", "ProofOfHumanityCredential"]
  issuer: {
    id: string;
    name: string;
    icon?: string;
    trustScore: number;
  };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject;
  proof: CredentialProof;
  zkDisclosableClaims: {
    claimKey: string;
    label: string;
    value: any;
    predicateType?: 'gte' | 'eq' | 'in' | 'boolean' | 'hash';
    predicateDescription?: string;
    salt: string;
    commitmentHash: string;
  }[];
}

export interface ZeroKnowledgeProof {
  revealedClaims: Record<string, any>;
  predicateProofs: {
    claimKey: string;
    predicate: string; // e.g., "age >= 18"
    satisfied: boolean;
    commitmentHash: string;
    zkWitnessProof: string;
  }[];
  blindedSubjectId: string;
}

export interface VerifiablePresentation {
  id: string;
  type: string[];
  verifiableCredential: VerifiableCredential[];
  holder: string; // Holder DID
  presentationNonce: string; // Verifier's one-time challenge
  audience: string; // Verifier's dApp ID / domain
  zkProofs: ZeroKnowledgeProof;
  proof: {
    type: string;
    created: string;
    challenge: string;
    domain: string;
    signatureValue: string;
  };
}

export interface KeystrokeMetric {
  key: string;
  downTime: number;
  upTime: number;
  dwellTime: number; // Duration key was held (ms)
  flightTime: number; // Time between previous key up and current key down (ms)
}

export interface MouseTrajectoryPoint {
  x: number;
  y: number;
  timestamp: number;
  velocity: number;
  acceleration: number;
  angle: number;
}

export interface BehavioralTelemetry {
  keystrokes: KeystrokeMetric[];
  mousePoints: MouseTrajectoryPoint[];
  dwellTimeMean: number;
  dwellTimeStdDev: number;
  flightTimeMean: number;
  flightTimeStdDev: number;
  trajectoryCurvatureEntropy: number; // Shannon entropy of path direction changes
  trajectoryLinearityScore: number; // 1.0 = perfectly straight line (bot), 0.2-0.7 = natural human curve
  jitterVariance: number; // Natural micro-movements
  timingRandomnessScore: number; // 0-100
  keystrokeCadenceEntropy: number;
  interactionDurationMs: number;
  eventsCount: number;
  clientSignals: {
    userAgent: string;
    touchSupported: boolean;
    hardwareConcurrency: number;
    screenResolution: string;
    deviceMemory?: number;
    webdriverPresent: boolean;
    headlessDetected: boolean;
    automatedFlags: boolean;
  };
}

export interface FraudAnalysisResult {
  humanityScore: number; // 0 to 100
  confidenceScore: number; // 0 to 100
  botProbability: number; // 0 to 100
  sybilCollusionRisk: number; // 0 to 100
  credentialReplayRisk: number; // 0 to 100
  decision: 'VERIFIED_HUMAN' | 'CHALLENGE_REQUIRED' | 'FLAGGED_BOT' | 'SYBIL_DETECTED' | 'INVALID_CREDENTIAL';
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasons: string[];
  anomaliesDetected: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    evidence: string;
  }[];
  biometricConfidence: {
    keystrokeScore: number;
    cursorMovementScore: number;
    timingEntropyScore: number;
    fingerprintIntegrityScore: number;
  };
  networkCentralityScore: number;
  explainableSummary: string;
  aiTimestamp: string;
  auditSignature: string;
}

export interface IdentityNode {
  id: string; // DID
  label: string;
  avatarSeed: string;
  trustScore: number;
  type: 'human' | 'sybil_bot' | 'issuer' | 'flagged' | 'current_user';
  createdAt: string;
  credentialCount: number;
  inDegree: number;
  outDegree: number;
  eigenTrust: number;
  clusterId: number;
  isSybilSuspect: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface TrustEdge {
  id: string;
  source: string; // DID
  target: string; // DID
  type: 'credential_issued' | 'peer_attestation' | 'social_endorsement' | 'suspicious_link';
  weight: number;
  timestamp: string;
  isCollusionSuspect: boolean;
}

export interface DAppVerificationRequest {
  dappId: string;
  dappName: string;
  dappCategory: string;
  dappIcon: string;
  requiredCredentials: {
    type: string;
    name: string;
    requiredPredicates: {
      claimKey: string;
      predicate: string; // "age >= 21"
      description: string;
    }[];
  }[];
  minimumHumanityScore: number;
  maximumSybilRisk: number;
  nonce: string;
  rewardDescription?: string;
}

export interface VerificationLog {
  id: string;
  timestamp: string;
  dappName: string;
  holderDid: string;
  decision: 'PASSED' | 'FAILED' | 'CHALLENGED';
  humanityScore: number;
  botProbability: number;
  revealedClaimsSummary: string[];
  zkProofsVerified: number;
  attackDetected?: string;
}
