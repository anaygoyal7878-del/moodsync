import type { BiometricSample } from '../types/domain';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * The single seam between "where biometric data comes from" and everything
 * else in the app. `SimulatedHealthDataSource` implements this today; a real
 * deployment swaps in a source backed by Apple HealthKit without touching
 * the engine, store, or UI. See HEALTHKIT_MIGRATION.md for exactly what that
 * swap looks like.
 */
export interface HealthDataSource {
  connect(): Promise<void>;
  disconnect(): void;
  getStatus(): ConnectionStatus;
  /** Fires on every new sample once connected. Returns an unsubscribe fn. */
  subscribe(listener: (sample: BiometricSample) => void): () => void;
}
