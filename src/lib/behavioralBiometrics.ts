/**
 * Real-time Behavioral Biometrics & Human Entropy Engine
 * Captures typing cadence, mouse curvature entropy, micro-tremors, and timing distributions.
 */

import { BehavioralTelemetry, KeystrokeMetric, MouseTrajectoryPoint } from '../types';

export class BehavioralBiometricsCollector {
  private keystrokeBuffer: KeystrokeMetric[] = [];
  private keyDownTimes: Map<string, number> = new Map();
  private lastKeyUpTime: number = 0;
  private mousePoints: MouseTrajectoryPoint[] = [];
  private startTime: number = Date.now();
  private isListening: boolean = false;

  private onMouseMoveHandler = (e: MouseEvent) => this.recordMouseMove(e);
  private onKeyDownHandler = (e: KeyboardEvent) => this.recordKeyDown(e);
  private onKeyUpHandler = (e: KeyboardEvent) => this.recordKeyUp(e);

  constructor() {
    this.startTime = Date.now();
  }

  public startListening() {
    if (this.isListening || typeof window === 'undefined') return;
    this.isListening = true;
    this.reset();

    window.addEventListener('mousemove', this.onMouseMoveHandler, { passive: true });
    window.addEventListener('keydown', this.onKeyDownHandler, { passive: true });
    window.addEventListener('keyup', this.onKeyUpHandler, { passive: true });
  }

  public stopListening() {
    if (!this.isListening || typeof window === 'undefined') return;
    this.isListening = false;
    window.removeEventListener('mousemove', this.onMouseMoveHandler);
    window.removeEventListener('keydown', this.onKeyDownHandler);
    window.removeEventListener('keyup', this.onKeyUpHandler);
  }

  public reset() {
    this.keystrokeBuffer = [];
    this.keyDownTimes.clear();
    this.lastKeyUpTime = 0;
    this.mousePoints = [];
    this.startTime = Date.now();
  }

  public recordKeyDown(e: KeyboardEvent) {
    if (!this.keyDownTimes.has(e.code)) {
      this.keyDownTimes.set(e.code, performance.now());
    }
  }

  public recordKeyUp(e: KeyboardEvent) {
    const upTime = performance.now();
    const downTime = this.keyDownTimes.get(e.code) || (upTime - 80);
    this.keyDownTimes.delete(e.code);

    const dwellTime = Math.max(1, upTime - downTime);
    const flightTime = this.lastKeyUpTime > 0 ? Math.max(0, downTime - this.lastKeyUpTime) : 0;
    this.lastKeyUpTime = upTime;

    // Keep up to 100 recent keystrokes
    if (this.keystrokeBuffer.length > 100) {
      this.keystrokeBuffer.shift();
    }

    this.keystrokeBuffer.push({
      key: e.key.length === 1 ? '*' : e.key, // Mask characters for privacy!
      downTime,
      upTime,
      dwellTime,
      flightTime,
    });
  }

  public recordMouseMove(e: MouseEvent) {
    const timestamp = performance.now();
    const x = e.clientX;
    const y = e.clientY;

    if (this.mousePoints.length === 0) {
      this.mousePoints.push({
        x,
        y,
        timestamp,
        velocity: 0,
        acceleration: 0,
        angle: 0,
      });
      return;
    }

    const prev = this.mousePoints[this.mousePoints.length - 1];
    const dt = Math.max(1, timestamp - prev.timestamp);
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.hypot(dx, dy);
    const velocity = dist / dt; // pixels per ms
    const acceleration = (velocity - prev.velocity) / dt;
    const angle = Math.atan2(dy, dx);

    // Rate-limit buffer size to 200 points
    if (this.mousePoints.length > 200) {
      this.mousePoints.shift();
    }

    this.mousePoints.push({
      x,
      y,
      timestamp,
      velocity,
      acceleration,
      angle,
    });
  }

  // Inject synthetic bot telemetry for the Attack Lab
  public injectBotTelemetry(type: 'linear_bot' | 'instant_replay' | 'headless_puppeteer') {
    this.reset();
    const now = performance.now();

    if (type === 'linear_bot') {
      // Perfectly straight line from (100, 100) to (500, 500) with uniform speed
      for (let i = 0; i <= 40; i++) {
        const ratio = i / 40;
        this.mousePoints.push({
          x: 100 + ratio * 400,
          y: 100 + ratio * 400,
          timestamp: now + i * 16,
          velocity: 0.707,
          acceleration: 0,
          angle: Math.PI / 4,
        });
      }
      // Zero-dwell keystrokes (robotic 0-1ms dwell)
      for (let i = 0; i < 15; i++) {
        this.keystrokeBuffer.push({
          key: '*',
          downTime: now + i * 20,
          upTime: now + i * 20 + 2, // 2ms dwell time!
          dwellTime: 2,
          flightTime: 18,
        });
      }
    } else if (type === 'instant_replay') {
      // Jump cursor instantly across screen (teleportation)
      this.mousePoints.push(
        { x: 50, y: 50, timestamp: now, velocity: 0, acceleration: 0, angle: 0 },
        { x: 800, y: 600, timestamp: now + 5, velocity: 190, acceleration: 38, angle: 0.6 }
      );
      // Synchronous DOM keystroke injection (0ms flight time)
      for (let i = 0; i < 20; i++) {
        this.keystrokeBuffer.push({
          key: '*',
          downTime: now + 10,
          upTime: now + 11,
          dwellTime: 1,
          flightTime: 0,
        });
      }
    }
  }

  public getTelemetry(): BehavioralTelemetry {
    const interactionDurationMs = Date.now() - this.startTime;

    // Calculate Keystroke Stats
    const dwells = this.keystrokeBuffer.map(k => k.dwellTime);
    const flights = this.keystrokeBuffer.map(k => k.flightTime);

    const dwellMean = dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : 95;
    const dwellVariance = dwells.length > 1
      ? dwells.reduce((a, b) => a + Math.pow(b - dwellMean, 2), 0) / dwells.length
      : 250;
    const dwellStdDev = Math.sqrt(dwellVariance);

    const flightMean = flights.length ? flights.reduce((a, b) => a + b, 0) / flights.length : 140;
    const flightVariance = flights.length > 1
      ? flights.reduce((a, b) => a + Math.pow(b - flightMean, 2), 0) / flights.length
      : 1200;
    const flightStdDev = Math.sqrt(flightVariance);

    // Calculate Keystroke Cadence Entropy (Shannon Entropy)
    const cadenceEntropy = computeShannonEntropy(flights, 10);

    // Mouse Trajectory Curvature Entropy & Linearity
    let curvatureEntropy = 0.5;
    let linearityScore = 0.5;
    let jitterVariance = 12.0;

    if (this.mousePoints.length > 5) {
      const angles = this.mousePoints.map(p => p.angle);
      curvatureEntropy = computeShannonEntropy(angles, 8);

      // Linearity: Pearson correlation or start-end distance vs total path distance
      const start = this.mousePoints[0];
      const end = this.mousePoints[this.mousePoints.length - 1];
      const directDist = Math.hypot(end.x - start.x, end.y - start.y);
      let totalPathDist = 0;
      for (let i = 1; i < this.mousePoints.length; i++) {
        totalPathDist += Math.hypot(
          this.mousePoints[i].x - this.mousePoints[i - 1].x,
          this.mousePoints[i].y - this.mousePoints[i - 1].y
        );
      }
      linearityScore = directDist > 10 && totalPathDist > 0 ? Math.min(1.0, directDist / totalPathDist) : 0.6;

      // Jitter / micro-tremor variance in acceleration
      const accels = this.mousePoints.map(p => Math.abs(p.acceleration));
      const meanAccel = accels.reduce((a, b) => a + b, 0) / accels.length;
      jitterVariance = accels.reduce((a, b) => a + Math.pow(b - meanAccel, 2), 0) / accels.length;
    }

    // Client Signals Check (detect WebDriver / Headless flags)
    const webdriverPresent = typeof navigator !== 'undefined' && Boolean((navigator as any).webdriver);
    const touchSupported = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '1920x1080';
    const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 8;

    // Timing randomness score
    const timingRandomnessScore = Math.min(100, Math.round((cadenceEntropy * 30) + (curvatureEntropy * 35) + Math.min(35, dwellStdDev / 2)));

    return {
      keystrokes: this.keystrokeBuffer.slice(-30),
      mousePoints: this.mousePoints.slice(-60),
      dwellTimeMean: Math.round(dwellMean),
      dwellTimeStdDev: Math.round(dwellStdDev),
      flightTimeMean: Math.round(flightMean),
      flightTimeStdDev: Math.round(flightStdDev),
      trajectoryCurvatureEntropy: Number(curvatureEntropy.toFixed(3)),
      trajectoryLinearityScore: Number(linearityScore.toFixed(3)),
      jitterVariance: Number(jitterVariance.toFixed(3)),
      timingRandomnessScore,
      keystrokeCadenceEntropy: Number(cadenceEntropy.toFixed(3)),
      interactionDurationMs,
      eventsCount: this.keystrokeBuffer.length + this.mousePoints.length,
      clientSignals: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/AIStudio',
        touchSupported,
        hardwareConcurrency,
        screenResolution: screenRes,
        webdriverPresent,
        headlessDetected: webdriverPresent || screenRes === '0x0',
        automatedFlags: webdriverPresent,
      },
    };
  }
}

// Helper: Shannon Entropy for numeric distribution binned into N bins
export function computeShannonEntropy(values: number[], binsCount: number = 8): number {
  if (!values || values.length < 2) return 0.5;

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 0.0;

  const binSize = (max - min) / binsCount;
  const counts = new Array(binsCount).fill(0);

  for (const v of values) {
    let binIdx = Math.floor((v - min) / binSize);
    if (binIdx >= binsCount) binIdx = binsCount - 1;
    counts[binIdx]++;
  }

  let entropy = 0;
  const n = values.length;
  for (const c of counts) {
    if (c > 0) {
      const p = c / n;
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize entropy to [0, 1] relative to max possible entropy log2(binsCount)
  const maxEntropy = Math.log2(binsCount);
  return Math.min(1.0, entropy / maxEntropy);
}

// Global Singleton Collector
export const globalBehavioralCollector = new BehavioralBiometricsCollector();
