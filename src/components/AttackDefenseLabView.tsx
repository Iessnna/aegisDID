import React, { useState } from 'react';
import { 
  FlaskConical, ShieldAlert, Bot, RefreshCw, AlertTriangle, 
  CheckCircle2, Terminal, Cpu, Sparkles, Zap, Bug, ArrowRight, ShieldCheck
} from 'lucide-react';
import { BehavioralTelemetry, FraudAnalysisResult, VerifiableCredential } from '../types';
import { globalBehavioralCollector } from '../lib/behavioralBiometrics';

interface AttackDefenseLabViewProps {
  onRunAttackSimulation: (attackType: string) => Promise<FraudAnalysisResult | null>;
  isAiLoading: boolean;
}

export const AttackDefenseLabView: React.FC<AttackDefenseLabViewProps> = ({
  onRunAttackSimulation,
  isAiLoading,
}) => {
  const [selectedAttack, setSelectedAttack] = useState<'linear_bot' | 'sybil_ring' | 'replay_attack' | 'stolen_keys'>('linear_bot');
  const [attackResult, setAttackResult] = useState<FraudAnalysisResult | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  const attackScenarios = [
    {
      id: 'linear_bot',
      title: 'Scripted Headless Bot Attack (Puppeteer/Selenium)',
      description: 'Automated script executing form fills with 0ms key dwell time and 100% straight-line mathematical cursor trajectories.',
      targetVulnerability: 'Traditional CAPTCHA bypasses / High-speed farming',
      defenseMechanism: 'Micro-tremor jitter variance & Trajectory Curvature Entropy',
      icon: '🤖',
      severity: 'HIGH',
    },
    {
      id: 'sybil_ring',
      title: 'Sybil Farm Collusion Syndicate (30 Fake DIDs)',
      description: 'Coordinated bot cluster mutually vouching for each other in circular loops to inflate trust score for airdrop drain.',
      targetVulnerability: 'Decentralized Web-of-Trust Sybil attacks',
      defenseMechanism: 'EigenTrust Power-Iteration & Topology Cluster Isolation',
      icon: '🕸️',
      severity: 'CRITICAL',
    },
    {
      id: 'replay_attack',
      title: 'Cryptographic Nonce Replay / Man-in-the-Middle',
      description: 'Attacker intercepts a valid signed Verifiable Presentation from another dApp and attempts to replay it on a new service.',
      targetVulnerability: 'Credential re-use across decentralized applications',
      defenseMechanism: 'One-Time Cryptographic Nonce & Audience Challenge Binding',
      icon: '🔁',
      severity: 'CRITICAL',
    },
    {
      id: 'stolen_keys',
      title: 'Stolen Credential with Behavioral Mismatch',
      description: 'Attacker obtains private key & valid ZK credential, but attacker lacks organic human typing cadence and biometric rhythm.',
      targetVulnerability: 'Stolen private keys / Credential stuffing',
      defenseMechanism: 'Continuous 2-Factor AI Behavioral Biometrics',
      icon: '🕵️',
      severity: 'HIGH',
    },
  ] as const;

  const handleLaunchAttack = async () => {
    setConsoleLogs([
      `[${new Date().toLocaleTimeString()}] INITIATING ADVERSARIAL SIMULATION: ${selectedAttack.toUpperCase()}...`,
      `[${new Date().toLocaleTimeString()}] Injecting synthetic anomaly vectors into telemetry pipeline...`,
    ]);

    const result = await onRunAttackSimulation(selectedAttack);
    if (result) {
      setAttackResult(result);
      setConsoleLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] AI DEFENSE RESULT: ${result.decision}`,
        `[${new Date().toLocaleTimeString()}] Humanity Score: ${result.humanityScore}/100 | Bot Risk: ${result.botProbability}%`,
        `[${new Date().toLocaleTimeString()}] Anomalies Flagged: ${result.anomaliesDetected.length} detected`,
        `[${new Date().toLocaleTimeString()}] Audit Signature: ${result.auditSignature}`,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-rose-500/20 text-rose-400">
              <FlaskConical className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-white">Adversarial Attack & Defense Simulation Lab</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Test the resilience of the AegisDID ecosystem against modern fraud vectors: Headless automated scripts, Sybil farm collusion rings, credential replay attacks, and compromised keys.
          </p>
        </div>

        <button
          onClick={handleLaunchAttack}
          disabled={isAiLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-400 hover:to-amber-500 text-white text-xs font-bold shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
        >
          {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          <span>Launch Selected Attack Vector</span>
        </button>
      </div>

      {/* Scenarios Selector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {attackScenarios.map(sc => {
          const isSelected = selectedAttack === sc.id;
          return (
            <div
              key={sc.id}
              onClick={() => setSelectedAttack(sc.id)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                isSelected
                  ? 'bg-slate-900 border-rose-500/80 shadow-lg shadow-rose-500/10 ring-1 ring-rose-500/50'
                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xl">
                    {sc.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {sc.title}
                    </h4>
                    <span className="text-[10px] font-mono text-rose-400 uppercase font-bold">
                      Severity: {sc.severity}
                    </span>
                  </div>
                </div>

                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'border-rose-400 bg-rose-500' : 'border-slate-700'
                }`}>
                  {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{sc.description}</p>

              <div className="space-y-1 py-2 border-t border-slate-800/80 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Target Vulnerability:</span>
                  <span className="text-slate-300 font-mono">{sc.targetVulnerability}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Active Defense:</span>
                  <span className="text-cyan-400 font-mono font-medium">{sc.defenseMechanism}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Defense Results & Telemetry Output */}
      {attackResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-in fade-in">
          {/* Defense Verdict Card */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>AI Defense Verdict</span>
              </h3>
              <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
                attackResult.decision === 'VERIFIED_HUMAN'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}>
                {attackResult.decision}
              </span>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Bot Probability:</span>
                <span className="text-rose-400 font-bold text-sm">{attackResult.botProbability}%</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Humanity Score:</span>
                <span className="text-cyan-400 font-bold text-sm">{attackResult.humanityScore}/100</span>
              </div>
              <div className="flex justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Sybil Collusion Risk:</span>
                <span className="text-amber-400 font-bold text-sm">{attackResult.sybilCollusionRisk}%</span>
              </div>
            </div>

            {/* AI Explanation Summary */}
            <div className="p-3 rounded-xl bg-slate-950 border border-cyan-950 text-xs text-slate-300 leading-relaxed font-sans">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Neural Reasoning</span>
              </div>
              {attackResult.explainableSummary}
            </div>
          </div>

          {/* Anomaly Evidence Log */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-white">Anomalies Detected ({attackResult.anomaliesDetected.length})</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Real-time Forensic Evidence
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {attackResult.anomaliesDetected.map((anom, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-rose-900/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-300 font-mono">{anom.type}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800 font-mono uppercase font-bold">
                      Severity: {anom.severity}
                    </span>
                  </div>
                  <p className="text-slate-300">{anom.description}</p>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Evidence: <span className="text-amber-400">{anom.evidence}</span>
                  </div>
                </div>
              ))}

              {attackResult.anomaliesDetected.length === 0 && (
                <div className="p-4 text-center text-slate-500 font-mono">
                  No critical anomalies detected in current execution vector.
                </div>
              )}
            </div>

            {/* Live Terminal Log Stream */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300/80 space-y-1">
              <span className="text-slate-500 block text-[10px] border-b border-slate-900 pb-1 mb-1">
                SYSTEM EXECUTION TERMINAL:
              </span>
              {consoleLogs.map((log, idx) => (
                <div key={idx} className="leading-tight">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
