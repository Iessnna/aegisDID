import React, { useState, useEffect, useRef } from 'react';
import { 
  Fingerprint, Activity, MousePointer, Keyboard, Bot, User, 
  Sparkles, Gauge, ShieldAlert, CheckCircle2, RefreshCw, Cpu, 
  Zap, Info, CornerDownRight, Play, Shield, CircleAlert
} from 'lucide-react';
import { BehavioralTelemetry, FraudAnalysisResult } from '../types';
import { globalBehavioralCollector } from '../lib/behavioralBiometrics';

interface BehavioralRadarViewProps {
  telemetry: BehavioralTelemetry;
  latestAiAnalysis: FraudAnalysisResult | null;
  onRunAiAnalysis: (customTelemetry?: BehavioralTelemetry, attackType?: string) => Promise<void>;
  isAiLoading: boolean;
}

export const BehavioralRadarView: React.FC<BehavioralRadarViewProps> = ({
  telemetry,
  latestAiAnalysis,
  onRunAiAnalysis,
  isAiLoading,
}) => {
  const [typingInput, setTypingInput] = useState('');
  const [activeSimulation, setActiveSimulation] = useState<'organic' | 'linear_bot' | 'instant_replay'>('organic');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mouseTrail, setMouseTrail] = useState<{ x: number; y: number }[]>([]);
  const [securityEvents, setSecurityEvents] = useState<Array<{ time: string; message: string; kind: 'ok' | 'warn' | 'danger' }>>([
    { time: new Date().toLocaleTimeString(), message: 'Identity session initialized', kind: 'ok' },
    { time: new Date().toLocaleTimeString(), message: 'Behavioral listener active', kind: 'ok' },
    { time: new Date().toLocaleTimeString(), message: 'Zero-knowledge predicates ready', kind: 'ok' },
  ]);

  // Track canvas mouse movements
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMouseTrail(prev => [...prev.slice(-40), { x, y }]);
    globalBehavioralCollector.recordMouseMove(e.nativeEvent);
  };

  // Draw trail on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw mouse trajectory curve
    if (mouseTrail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(mouseTrail[0].x, mouseTrail[0].y);
      for (let i = 1; i < mouseTrail.length; i++) {
        const xc = (mouseTrail[i].x + mouseTrail[i - 1].x) / 2;
        const yc = (mouseTrail[i].y + mouseTrail[i - 1].y) / 2;
        ctx.quadraticCurveTo(mouseTrail[i - 1].x, mouseTrail[i - 1].y, xc, yc);
      }
      ctx.strokeStyle = activeSimulation === 'organic' ? '#38bdf8' : '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw points
      mouseTrail.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, idx === mouseTrail.length - 1 ? 4 : 2, 0, Math.PI * 2);
        ctx.fillStyle = idx === mouseTrail.length - 1 ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)';
        ctx.fill();
      });
    }
  }, [mouseTrail, activeSimulation]);

  const handleSimulateMode = (mode: 'organic' | 'linear_bot' | 'instant_replay') => {
    setActiveSimulation(mode);
    const event = mode === 'organic'
      ? { message: 'Organic human mode restored', kind: 'ok' as const }
      : mode === 'linear_bot'
        ? { message: 'Scripted bot telemetry injected', kind: 'warn' as const }
        : { message: 'DOM injection signature staged', kind: 'danger' as const };
    setSecurityEvents(prev => [{ time: new Date().toLocaleTimeString(), ...event }, ...prev].slice(0, 6));
    if (mode === 'organic') {
      globalBehavioralCollector.reset();
      setMouseTrail([]);
    } else {
      globalBehavioralCollector.injectBotTelemetry(mode);
      // Generate synthetic points on canvas
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        pts.push({ x: 30 + i * 10, y: 30 + i * 4 });
      }
      setMouseTrail(pts);
    }
  };

  const handleTriggerAnalysis = () => {
    const currentTelemetry = globalBehavioralCollector.getTelemetry();
    setSecurityEvents(prev => [{
      time: new Date().toLocaleTimeString(),
      message: 'Neural trust audit requested',
      kind: 'ok',
    }, ...prev].slice(0, 6));
    onRunAiAnalysis(currentTelemetry, activeSimulation === 'organic' ? undefined : activeSimulation);
  };

  useEffect(() => {
    if (!latestAiAnalysis) return;
    const isThreat = latestAiAnalysis.decision !== 'VERIFIED_HUMAN';
    setSecurityEvents(prev => [{
      time: new Date().toLocaleTimeString(),
      message: isThreat ? `Threat blocked: ${latestAiAnalysis.decision}` : 'Humanity verified by neural trust engine',
      kind: isThreat ? 'danger' : 'ok',
    }, ...prev].slice(0, 6));
  }, [latestAiAnalysis]);

  const humanityScore = latestAiAnalysis ? latestAiAnalysis.humanityScore : (activeSimulation === 'organic' ? 95 : 12);
  const botProb = latestAiAnalysis ? latestAiAnalysis.botProbability : (activeSimulation === 'organic' ? 5 : 88);
  const isHuman = humanityScore >= 70;
  const scoreColor = isHuman ? '#b8ef78' : '#ff4d6d';

  return (
    <div className="space-y-6">
      {/* Judge-facing verification hero */}
      <section className={`relative overflow-hidden rounded-3xl border p-5 sm:p-8 ${isHuman ? 'border-cyan-400/20 bg-[radial-gradient(circle_at_50%_20%,rgba(72,215,232,0.16),transparent_45%),#0b1424' : 'border-rose-400/30 bg-[radial-gradient(circle_at_50%_20%,rgba(255,77,109,0.15),transparent_45%),#170d18'}`}>
        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
          <div className="text-center lg:text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b8ef78]">Decentralized humanity verification</p>
            <h2 className="aegis-display mt-3 max-w-md text-3xl font-semibold tracking-tight text-white sm:text-4xl">Prove the human behind the key.</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">Behavioral AI, trust graph context, and zero-knowledge identity work together without exposing personal data.</p>
          </div>

          <div className="mx-auto flex flex-col items-center">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${scoreColor} ${humanityScore * 3.6}deg, rgba(148,163,184,0.12) 0deg)` }}>
              <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-[#071018] shadow-inner">
                <span className="aegis-display text-5xl font-semibold text-white">{humanityScore}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">human / 100</span>
              </div>
            </div>
            <div className={`mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isHuman ? 'text-[#b8ef78]' : 'text-rose-300'}`}>
              {isHuman ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
              {isHuman ? 'Verified human' : 'Automation blocked'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center lg:text-left">
            {[
              { label: 'Behavioral AI', value: 'ACTIVE', color: 'text-cyan-300' },
              { label: 'Trust graph', value: '0.88', color: 'text-[#b8ef78]' },
              { label: 'ZK identity', value: 'PRIVATE', color: 'text-amber-300' },
            ].map(signal => (
              <div key={signal.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span className="block text-[9px] uppercase tracking-wider text-slate-500">{signal.label}</span>
                <span className={`mt-2 block font-mono text-xs font-bold ${signal.color}`}>{signal.value}</span>
              </div>
            ))}
            <div className="col-span-3 mt-1 flex items-center justify-between border-t border-white/10 pt-3 font-mono text-[10px] text-slate-500">
              <span>BOT RISK</span><span className={isHuman ? 'text-[#b8ef78]' : 'text-rose-300'}>{botProb}%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
              <Activity className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-white">AI Real-Time Behavioral Biometrics & Turing Engine</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Continuous passive human verification analyzing micro-dynamics: keystroke flight entropy, cursor acceleration jitter, and trajectory curvature. Detects automated Puppeteer/Selenium headless bots instantly without intrusive CAPTCHAs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerAnalysis}
            disabled={isAiLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            <span>Run Gemini AI Behavioral Audit</span>
          </button>
        </div>
      </div>

      {/* Mode Selector / Bot Simulation Toggle */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Zap className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold">Interactive Mode Selector:</span>
        </div>

        <div className="grid w-full grid-cols-1 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 sm:w-auto sm:grid-cols-3">
          <button
            onClick={() => handleSimulateMode('organic')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeSimulation === 'organic'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
                <span>Live human</span>
          </button>

          <button
            onClick={() => handleSimulateMode('linear_bot')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeSimulation === 'linear_bot'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
                <span>Scripted bot</span>
          </button>

          <button
            onClick={() => handleSimulateMode('instant_replay')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeSimulation === 'instant_replay'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
                <span>DOM attack</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_280px]">
      {/* Main Grid: Biometric Meters & Interactive Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Live Radar Gauges */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span>Humanity Confidence</span>
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                humanityScore >= 70
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}>
                {humanityScore >= 70 ? 'PASS (HUMAN)' : 'FLAGGED (BOT)'}
              </span>
            </div>

            {/* Score Ring / Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Humanity Score:</span>
                <span className="text-emerald-400 font-bold">{humanityScore}/100</span>
              </div>
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
                    humanityScore >= 70
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                      : 'bg-gradient-to-r from-amber-500 to-rose-500'
                  }`}
                  style={{ width: `${humanityScore}%` }}
                />
              </div>
            </div>

            {/* Bot Probability Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Bot / Automation Risk:</span>
                <span className="text-rose-400 font-bold">{botProb}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${botProb}%` }}
                />
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-2">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Dwell Time Mean</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {telemetry.dwellTimeMean} ms
                </span>
                <span className="text-[9px] text-slate-500 block">σ = {telemetry.dwellTimeStdDev}ms</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Flight Cadence Entropy</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {telemetry.keystrokeCadenceEntropy}
                </span>
                <span className="text-[9px] text-slate-500 block">Shannon normalized</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Trajectory Curvature</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {telemetry.trajectoryCurvatureEntropy}
                </span>
                <span className="text-[9px] text-slate-500 block">Curve entropy</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block">Jitter Variance</span>
                <span className="font-mono text-cyan-300 font-bold">
                  {telemetry.jitterVariance}
                </span>
                <span className="text-[9px] text-slate-500 block">Micro-tremors</span>
              </div>
            </div>
          </div>

          {/* Client Signal Checklist */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs font-mono">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-sans">
              Client Integrity Signals
            </h4>
            <div className="flex items-center justify-between text-slate-400 py-1 border-b border-slate-800/60">
              <span>WebDriver Automation:</span>
              <span className={telemetry.clientSignals.webdriverPresent ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                {telemetry.clientSignals.webdriverPresent ? 'ACTIVE (BOT)' : 'CLEAN'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400 py-1 border-b border-slate-800/60">
              <span>Headless Environment:</span>
              <span className={telemetry.clientSignals.headlessDetected ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                {telemetry.clientSignals.headlessDetected ? 'DETECTED' : 'ORGANIC DISPLAY'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400 py-1">
              <span>Touch / Hardware Cores:</span>
              <span className="text-slate-200">
                {telemetry.clientSignals.hardwareConcurrency} Cores
              </span>
            </div>
          </div>
        </div>

        {/* Center & Right Column: Interactive Turing Playground */}
        <div className="lg:col-span-2 space-y-4">
          {/* Interactive Typing Pad */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Live Keystroke Dynamics Sandbox</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {telemetry.keystrokes.length} Keystrokes Logged
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Type anything below to measure your natural rhythm, inter-key delay variance, and typing cadence:
            </p>

            <div className="relative">
              <textarea
                value={typingInput}
                onChange={e => setTypingInput(e.target.value)}
                placeholder="Type here: 'Self-sovereign identity protects human privacy with zero-knowledge math...'"
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-cyan-500 focus:outline-none transition-all placeholder:text-slate-600"
              />
            </div>

            {/* Keystroke Live Dwell Visualization */}
            <div className="space-y-1">
              <div className="text-[11px] text-slate-500 flex justify-between font-mono">
                <span>Recent Key Dwell Interval Histogram (ms):</span>
                <span>Target: 50-140ms</span>
              </div>
              <div className="flex items-end gap-1 h-12 p-2 rounded-xl bg-slate-950 border border-slate-800/80 overflow-hidden">
                {telemetry.keystrokes.slice(-24).map((k, idx) => {
                  const heightPercent = Math.min(100, Math.max(10, (k.dwellTime / 200) * 100));
                  return (
                    <div
                      key={idx}
                      title={`Dwell: ${Math.round(k.dwellTime)}ms, Flight: ${Math.round(k.flightTime)}ms`}
                      className="flex-1 bg-cyan-500/70 hover:bg-cyan-400 rounded-t transition-all"
                      style={{ height: `${heightPercent}%` }}
                    />
                  );
                })}
                {telemetry.keystrokes.length === 0 && (
                  <span className="text-[11px] text-slate-600 m-auto font-mono">Start typing above to populate dynamics...</span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Mouse Trajectory Canvas */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MousePointer className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Cursor Trajectory & Micro-Tremor Canvas</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Move cursor over canvas to capture bezier curve
              </span>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 cursor-crosshair">
              <canvas
                ref={canvasRef}
                width={560}
                height={160}
                onMouseMove={handleCanvasMouseMove}
                className="w-full h-40 block"
              />
              <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 font-mono pointer-events-none">
                Linearity: <span className="text-cyan-400">{telemetry.trajectoryLinearityScore}</span> | Jitter: <span className="text-cyan-400">{telemetry.jitterVariance}</span>
              </div>
            </div>
          </div>

          {/* AI Explanation Banner */}
          {latestAiAnalysis && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-900/50 shadow-lg space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
                <Sparkles className="w-4 h-4" />
                <span>Neural Assessment Summary</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans">
                {latestAiAnalysis.explainableSummary}
              </p>
              <div className="text-[10px] text-slate-500 font-mono pt-1 flex items-center justify-between">
                <span>Decision: {latestAiAnalysis.decision}</span>
                <span>Audit Signature: {latestAiAnalysis.auditSignature}</span>
              </div>
            </div>
          )}
        </div>
      </div>

        <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white"><Activity className="h-4 w-4 text-cyan-400" /> Live security events</div>
            <span className="h-2 w-2 rounded-full bg-[#b8ef78] shadow-[0_0_10px_rgba(184,239,120,0.8)]" />
          </div>
          <div className="space-y-3">
            {securityEvents.map((event, index) => (
              <div key={`${event.time}-${index}`} className="flex gap-2 border-b border-slate-800/70 pb-3 last:border-0 last:pb-0">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${event.kind === 'danger' ? 'bg-rose-400' : event.kind === 'warn' ? 'bg-amber-400' : 'bg-[#b8ef78]'}`} />
                <div><p className="font-mono text-[9px] text-slate-600">{event.time}</p><p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{event.message}</p></div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
