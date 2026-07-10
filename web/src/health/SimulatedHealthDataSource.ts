import type { BiometricSample } from '../types/domain';
import type { ConnectionStatus, HealthDataSource } from './HealthDataSource';
import { demoScenarioLoop, scenarioProfiles, type ScenarioId } from './scenarios';

const TICK_MS = 1500;
const AUTO_ADVANCE_MS = 16000;
/** How quickly readings drift toward the active scenario's target, 0-1 per tick. */
const SMOOTHING = 0.22;

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function jitter(value: number, magnitude: number): number {
  return value + (Math.random() - 0.5) * magnitude;
}

/**
 * Simulates a live Apple Health feed. This is the only place in the app
 * that invents data — everything downstream (engine, store, UI) consumes
 * `BiometricSample` the same way it would from a real HealthKit bridge.
 * See HEALTHKIT_MIGRATION.md for what changes when this is replaced.
 */
export class SimulatedHealthDataSource implements HealthDataSource {
  private status: ConnectionStatus = 'disconnected';
  private listeners = new Set<(sample: BiometricSample) => void>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  private loopIndex = 0;
  private activeScenario: ScenarioId = 'baseline';

  private current = { ...scenarioProfiles.baseline };

  async connect(): Promise<void> {
    this.status = 'connecting';
    // A real HealthKit bridge would request authorization here; the
    // simulator just adds a believable pause so the UI's connecting state
    // is exercised the same way it will be in production.
    await new Promise((resolve) => setTimeout(resolve, 900));
    this.status = 'connected';
    this.startTicking();
    this.scheduleAutoAdvance();
  }

  disconnect(): void {
    this.status = 'disconnected';
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.tickTimer = null;
    this.autoAdvanceTimer = null;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  subscribe(listener: (sample: BiometricSample) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Lets the UI jump straight to a scenario for demo purposes, pausing
   * auto-advance for a while so it doesn't fight the manual choice. */
  setScenario(id: ScenarioId): void {
    this.activeScenario = id;
    this.scheduleAutoAdvance();
  }

  getActiveScenario(): ScenarioId {
    return this.activeScenario;
  }

  private scheduleAutoAdvance(): void {
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = setTimeout(() => {
      this.loopIndex = (this.loopIndex + 1) % demoScenarioLoop.length;
      this.activeScenario = demoScenarioLoop[this.loopIndex];
      this.scheduleAutoAdvance();
    }, AUTO_ADVANCE_MS);
  }

  private startTicking(): void {
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const target = scenarioProfiles[this.activeScenario];

    this.current.heartRate = lerp(this.current.heartRate, target.heartRate, SMOOTHING);
    this.current.hrv = lerp(this.current.hrv, target.hrv, SMOOTHING);
    this.current.respiratoryRate = lerp(this.current.respiratoryRate, target.respiratoryRate, SMOOTHING);
    this.current.restingHeartRate = lerp(this.current.restingHeartRate, target.restingHeartRate, 0.05);

    const sample: BiometricSample = {
      timestamp: Date.now(),
      heartRate: Math.round(jitter(this.current.heartRate, 3)),
      hrv: Math.round(jitter(this.current.hrv, 2)),
      respiratoryRate: Math.round(jitter(this.current.respiratoryRate, 1) * 10) / 10,
      restingHeartRate: Math.round(this.current.restingHeartRate),
      sleepStage: target.sleepStage,
      isMindfulSessionActive: target.isMindfulSessionActive ?? false,
      steps: Math.max(0, Math.round(jitter(target.stepRate, target.stepRate * 0.3))),
    };

    this.listeners.forEach((listener) => listener(sample));
  }
}
