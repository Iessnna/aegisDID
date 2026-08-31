import React, { useState, useEffect } from 'react';
import { 
  Network, ShieldAlert, CheckCircle2, User, Bot, Award, 
  Sparkles, Search, RefreshCw, Cpu, ZoomIn, ZoomOut, Info, AlertTriangle 
} from 'lucide-react';
import { IdentityNode, TrustEdge } from '../types';
import { GraphDataset, computeEigenTrust } from '../lib/networkGraph';

interface NetworkGraphViewProps {
  graphData: GraphDataset;
  userDid: string;
  onAuditNetwork: () => Promise<void>;
  networkAuditSummary: string | null;
  isAuditing: boolean;
}

export const NetworkGraphView: React.FC<NetworkGraphViewProps> = ({
  graphData,
  userDid,
  onAuditNetwork,
  networkAuditSummary,
  isAuditing,
}) => {
  const [selectedNode, setSelectedNode] = useState<IdentityNode | null>(null);
  const [highlightSybilOnly, setHighlightSybilOnly] = useState(false);
  const [eigenTrustMap, setEigenTrustMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const ranks = computeEigenTrust(graphData.nodes, graphData.edges);
    setEigenTrustMap(ranks);
    // Select user node by default
    const userNode = graphData.nodes.find(n => n.id === userDid);
    if (userNode) setSelectedNode(userNode);
  }, [graphData, userDid]);

  const sybilCount = graphData.nodes.filter(n => n.isSybilSuspect).length;
  const humanCount = graphData.nodes.filter(n => n.type === 'human' || n.type === 'current_user').length;
  const issuerCount = graphData.nodes.filter(n => n.type === 'issuer').length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
              <Network className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-white">Decentralized Web-of-Trust & Sybil Graph Intelligence</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Graph neural topology analysis using EigenTrust & SybilRank. Isolates circular bot-farm endorsement rings and validates human social distance from cryptographically anchored seeds without centralized database tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHighlightSybilOnly(!highlightSybilOnly)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              highlightSybilOnly
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>{highlightSybilOnly ? 'Showing Sybils Only' : 'Highlight Sybil Rings'}</span>
          </button>

          <button
            onClick={onAuditNetwork}
            disabled={isAuditing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            {isAuditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            <span>Run AI Topology Audit</span>
          </button>
        </div>
      </div>

      {/* Network Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Total Identity Nodes</span>
          <span className="text-lg font-bold text-white font-mono">{graphData.nodes.length}</span>
          <span className="text-[10px] text-slate-500 block">W3C DIDs registered</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Trusted Issuance Anchors</span>
          <span className="text-lg font-bold text-emerald-400 font-mono">{issuerCount}</span>
          <span className="text-[10px] text-emerald-400/70 block">Root verification seeds</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Verified Humans</span>
          <span className="text-lg font-bold text-cyan-400 font-mono">{humanCount}</span>
          <span className="text-[10px] text-cyan-400/70 block">High EigenTrust</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Isolated Sybil Colluders</span>
          <span className="text-lg font-bold text-rose-400 font-mono">{sybilCount}</span>
          <span className="text-[10px] text-rose-400/70 block">0.04 EigenTrust (Neutralized)</span>
        </div>
      </div>

      {/* Interactive SVG Network Graph & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Graph Canvas Area */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs">
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              <Network className="w-4 h-4 text-cyan-400" />
              <span>Identity Mesh & Collusion Cluster Topology</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Click any node to inspect trust metrics
            </span>
          </div>

          {/* SVG Canvas */}
          <div className="relative w-full h-[380px] bg-slate-950 rounded-xl border border-slate-800/80 overflow-hidden cyber-grid">
            <svg className="w-full h-full" viewBox="0 0 900 560">
              <defs>
                <linearGradient id="edge-human" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
                </linearGradient>
                <linearGradient id="edge-sybil" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {/* Draw Edges */}
              {graphData.edges.map(edge => {
                const sourceNode = graphData.nodes.find(n => n.id === edge.source);
                const targetNode = graphData.nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return null;

                const isSybil = edge.isCollusionSuspect;
                const isFaded = highlightSybilOnly && !isSybil;

                return (
                  <line
                    key={edge.id}
                    x1={sourceNode.x || 400}
                    y1={sourceNode.y || 250}
                    x2={targetNode.x || 400}
                    y2={targetNode.y || 250}
                    stroke={isSybil ? 'url(#edge-sybil)' : 'url(#edge-human)'}
                    strokeWidth={isSybil ? 2 : 1.5}
                    strokeDasharray={isSybil ? '4,4' : undefined}
                    opacity={isFaded ? 0.1 : 0.8}
                  />
                );
              })}

              {/* Sybil Cluster Highlight Region */}
              <circle
                cx={750}
                cy={320}
                r={130}
                fill="rgba(244, 63, 94, 0.04)"
                stroke="rgba(244, 63, 94, 0.25)"
                strokeDasharray="6,6"
              />
              <text x={750} y={175} fill="#f43f5e" fontSize="11" textAnchor="middle" fontFamily="monospace">
                ⚠️ Isolated Sybil Attack Syndicate
              </text>

              {/* Draw Nodes */}
              {graphData.nodes.map(node => {
                const isSelected = selectedNode?.id === node.id;
                const isUser = node.type === 'current_user';
                const isIssuer = node.type === 'issuer';
                const isSybil = node.isSybilSuspect;
                const isFaded = highlightSybilOnly && !isSybil;

                let nodeColor = '#38bdf8'; // Cyan
                if (isUser) nodeColor = '#06b6d4';
                if (isIssuer) nodeColor = '#10b981'; // Emerald
                if (isSybil) nodeColor = '#f43f5e'; // Rose

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x || 400}, ${node.y || 250})`}
                    onClick={() => setSelectedNode(node)}
                    className="cursor-pointer transition-all hover:scale-110"
                    opacity={isFaded ? 0.15 : 1}
                  >
                    {/* Pulsing ring for current user */}
                    {isUser && (
                      <circle r={24} fill="none" stroke="#38bdf8" strokeWidth={1.5} opacity={0.5} className="animate-ping" />
                    )}

                    {/* Node Circle */}
                    <circle
                      r={isUser ? 18 : isIssuer ? 16 : isSybil ? 12 : 14}
                      fill="#0f172a"
                      stroke={nodeColor}
                      strokeWidth={isSelected ? 3 : 2}
                      filter={isSelected ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.6))' : undefined}
                    />

                    {/* Inner icon/indicator */}
                    <circle r={isUser ? 7 : isIssuer ? 6 : 4} fill={nodeColor} />

                    {/* Label */}
                    <text
                      y={26}
                      fill={isSybil ? '#fca5a5' : '#e2e8f0'}
                      fontSize="9.5"
                      fontWeight="500"
                      textAnchor="middle"
                      fontFamily="sans-serif"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-2 left-3 flex flex-wrap items-center gap-3 p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> You (Root DID)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Trusted Issuer
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> Human Peer
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Sybil Bot Ring
              </span>
            </div>
          </div>
        </div>

        {/* Node Inspector Side Panel */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" />
              <span>Identity Node Inspector</span>
            </h3>

            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Node Designation</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      selectedNode.isSybilSuspect
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    }`}>
                      {selectedNode.isSybilSuspect ? 'SYBIL SUSPECT' : 'VERIFIED HUMAN'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{selectedNode.label}</h4>
                  <p className="font-mono text-[10px] text-slate-400 break-all">{selectedNode.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">EigenTrust Score</span>
                    <span className="font-mono text-cyan-300 font-bold text-sm">
                      {selectedNode.eigenTrust}
                    </span>
                    <span className="text-[9px] text-slate-500 block">Target: &gt;0.50</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Trust Index</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">
                      {selectedNode.trustScore}%
                    </span>
                    <span className="text-[9px] text-slate-500 block">Base Attestation</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">In-Degree (Vouched)</span>
                    <span className="font-mono text-slate-200 font-bold">
                      {selectedNode.inDegree} Links
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block">Cluster ID</span>
                    <span className="font-mono text-slate-200 font-bold">
                      {selectedNode.clusterId === 99 ? 'Ring #99 (Bot)' : `Cluster #${selectedNode.clusterId}`}
                    </span>
                  </div>
                </div>

                {selectedNode.isSybilSuspect && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>Sybil Defense Mitigation</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-300/90">
                      Even if this bot farm generates 1,000 internal endorsements, its EigenTrust remains clamped near zero (&lt;0.04) because it has no path from trusted root anchors.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Select any node on the graph to inspect metrics.</p>
            )}
          </div>

          {/* AI Network Topology Audit Assessment */}
          {networkAuditSummary && (
            <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-900/50 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
                <Sparkles className="w-4 h-4" />
                <span>Gemini 3.7 Topology Audit</span>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                {networkAuditSummary}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
