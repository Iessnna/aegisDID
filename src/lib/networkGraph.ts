/**
 * Decentralized Identity Network & Sybil Graph Analysis Engine
 * Calculates EigenTrust, PageRank, Sybil clusters, and anomaly topologies.
 */

import { IdentityNode, TrustEdge } from '../types';

export interface GraphDataset {
  nodes: IdentityNode[];
  edges: TrustEdge[];
}

export function generateEmptyIdentityGraph(userDid: string): GraphDataset {
  return {
    nodes: [{ id: userDid, label: 'You (Self-Sovereign Identity)', avatarSeed: userDid, trustScore: 0, type: 'current_user', createdAt: new Date().toISOString(), credentialCount: 0, inDegree: 0, outDegree: 0, eigenTrust: 0, clusterId: 0, isSybilSuspect: false, x: 400, y: 280 }],
    edges: [],
  };
}

export function generateInitialIdentityGraph(userDid: string): GraphDataset {
  const nodes: IdentityNode[] = [];
  const edges: TrustEdge[] = [];

  // 1. Current User Node (Root Subject)
  nodes.push({
    id: userDid,
    label: 'You (Self-Sovereign Identity)',
    avatarSeed: 'user-did-root',
    trustScore: 94,
    type: 'current_user',
    createdAt: '2026-02-14',
    credentialCount: 4,
    inDegree: 5,
    outDegree: 3,
    eigenTrust: 0.88,
    clusterId: 1,
    isSybilSuspect: false,
    x: 400,
    y: 300,
  });

  // 2. Trusted Issuer Nodes
  const issuers = [
    { id: 'did:aegis:issuer:gov-eu', label: 'Estonia e-Residency DID Gateway', trust: 99, x: 220, y: 150 },
    { id: 'did:aegis:issuer:stanford-id', label: 'Stanford Cryptography Lab', trust: 97, x: 580, y: 140 },
    { id: 'did:aegis:issuer:proof-humanity', label: 'Humanity Council Biometric DAO', trust: 95, x: 240, y: 440 },
    { id: 'did:aegis:issuer:gitcoin-passport', label: 'Gitcoin Web3 Trust Oracle', trust: 92, x: 560, y: 460 },
  ];

  issuers.forEach((iss, idx) => {
    nodes.push({
      id: iss.id,
      label: iss.label,
      avatarSeed: `issuer-${idx}`,
      trustScore: iss.trust,
      type: 'issuer',
      createdAt: '2025-01-10',
      credentialCount: 1250,
      inDegree: 42,
      outDegree: 850,
      eigenTrust: 0.98,
      clusterId: 0,
      isSybilSuspect: false,
      x: iss.x,
      y: iss.y,
    });

    // Link issuer to user
    edges.push({
      id: `edge-iss-${idx}`,
      source: iss.id,
      target: userDid,
      type: 'credential_issued',
      weight: 0.9,
      timestamp: '2026-02-15',
      isCollusionSuspect: false,
    });
  });

  // 3. Legitimate Peer Humans in Web of Trust
  const peers = [
    { id: 'did:aegis:0x4f81c9a0...33b1', label: 'Alice (ZK Dev)', trust: 89, x: 380, y: 180 },
    { id: 'did:aegis:0x7e22ba81...190c', label: 'Bob (Validator #4)', trust: 86, x: 490, y: 260 },
    { id: 'did:aegis:0x119a00cd...88ef', label: 'Elena (Security Auditor)', trust: 91, x: 320, y: 320 },
    { id: 'did:aegis:0xbb639201...ff4a', label: 'David (DAO Steward)', trust: 88, x: 440, y: 410 },
  ];

  peers.forEach((p, idx) => {
    nodes.push({
      id: p.id,
      label: p.label,
      avatarSeed: `peer-${idx}`,
      trustScore: p.trust,
      type: 'human',
      createdAt: '2025-08-20',
      credentialCount: 5,
      inDegree: 14,
      outDegree: 11,
      eigenTrust: 0.82,
      clusterId: 1,
      isSybilSuspect: false,
      x: p.x,
      y: p.y,
    });

    // Bidirectional social endorsement with user or other peers
    edges.push({
      id: `edge-peer-user-${idx}`,
      source: p.id,
      target: userDid,
      type: 'peer_attestation',
      weight: 0.75,
      timestamp: '2026-02-18',
      isCollusionSuspect: false,
    });
  });

  // Link peers together in dense organic mesh
  edges.push(
    { id: 'edge-p1-p2', source: peers[0].id, target: peers[1].id, type: 'social_endorsement', weight: 0.8, timestamp: '2026-01-10', isCollusionSuspect: false },
    { id: 'edge-p2-p3', source: peers[1].id, target: peers[2].id, type: 'social_endorsement', weight: 0.8, timestamp: '2026-01-15', isCollusionSuspect: false },
    { id: 'edge-p3-p0', source: peers[2].id, target: peers[0].id, type: 'social_endorsement', weight: 0.85, timestamp: '2026-01-20', isCollusionSuspect: false }
  );

  // 4. Isolated Collusion Sybil Farm Cluster (Simulated Bot Syndicate)
  const sybilCenter = { x: 740, y: 320 };
  const sybils = [
    { id: 'did:aegis:0xbot9910a...001', label: 'Sybil Agent #841', x: 700, y: 250 },
    { id: 'did:aegis:0xbot9910b...002', label: 'Sybil Agent #842', x: 780, y: 240 },
    { id: 'did:aegis:0xbot9910c...003', label: 'Sybil Agent #843', x: 820, y: 330 },
    { id: 'did:aegis:0xbot9910d...004', label: 'Sybil Agent #844', x: 770, y: 400 },
    { id: 'did:aegis:0xbot9910e...005', label: 'Sybil Agent #845', x: 690, y: 380 },
    { id: 'did:aegis:0xbot9910f...006', label: 'Sybil Hub Controller', x: 740, y: 320 },
  ];

  sybils.forEach((s, idx) => {
    const isHub = idx === sybils.length - 1;
    nodes.push({
      id: s.id,
      label: s.label,
      avatarSeed: `sybil-${idx}`,
      trustScore: isHub ? 28 : 12,
      type: 'sybil_bot',
      createdAt: '2026-08-30', // Brand new rapid creation!
      credentialCount: 1,
      inDegree: 8,
      outDegree: 8,
      eigenTrust: 0.04, // Very low EigenTrust due to lack of connection to trusted seed
      clusterId: 99, // Sybil Ring Cluster
      isSybilSuspect: true,
      x: s.x,
      y: s.y,
    });
  });

  // Circular high-frequency endorsements among Sybils (closed loop attack pattern)
  for (let i = 0; i < sybils.length - 1; i++) {
    const next = (i + 1) % (sybils.length - 1);
    edges.push({
      id: `edge-sybil-loop-${i}`,
      source: sybils[i].id,
      target: sybils[next].id,
      type: 'suspicious_link',
      weight: 0.95,
      timestamp: '2026-08-30',
      isCollusionSuspect: true,
    });
    // Sybil links to Sybil Hub
    edges.push({
      id: `edge-sybil-hub-${i}`,
      source: sybils[i].id,
      target: sybils[sybils.length - 1].id,
      type: 'suspicious_link',
      weight: 0.9,
      timestamp: '2026-08-30',
      isCollusionSuspect: true,
    });
  }

  return { nodes, edges };
}

// Compute Simple Power Iteration for EigenTrust Score
export function computeEigenTrust(nodes: IdentityNode[], edges: TrustEdge[]): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();

  const nodeMap = new Map<string, number>();
  nodes.forEach((node, i) => nodeMap.set(node.id, i));

  // Build Adjacency Matrix
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const edge of edges) {
    const u = nodeMap.get(edge.source);
    const v = nodeMap.get(edge.target);
    if (u !== undefined && v !== undefined) {
      M[u][v] = edge.weight;
    }
  }

  // Normalize row stochastic
  for (let i = 0; i < n; i++) {
    const rowSum = M[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) {
      for (let j = 0; j < n; j++) {
        M[i][j] /= rowSum;
      }
    } else {
      for (let j = 0; j < n; j++) {
        M[i][j] = 1 / n;
      }
    }
  }

  // Power Iteration with Trust Seed (Issuers have high seed weight)
  let p: number[] = nodes.map(node => (node.type === 'issuer' ? 0.4 : 0.6 / n));
  const pSum = p.reduce((a, b) => a + b, 0);
  p = p.map(x => x / pSum);

  let rank = [...p];
  const alpha = 0.85;

  for (let iter = 0; iter < 20; iter++) {
    const newRank = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        newRank[j] += rank[i] * M[i][j];
      }
    }
    for (let j = 0; j < n; j++) {
      rank[j] = alpha * newRank[j] + (1 - alpha) * p[j];
    }
  }

  const result = new Map<string, number>();
  nodes.forEach((node, i) => {
    result.set(node.id, Math.min(1.0, Number((rank[i] * n * 0.5).toFixed(3))));
  });

  return result;
}
