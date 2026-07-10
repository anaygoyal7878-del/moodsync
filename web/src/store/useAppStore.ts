import { create } from 'zustand';
import type { ConnectionStatus } from '../health/HealthDataSource';
import { SimulatedHealthDataSource } from '../health/SimulatedHealthDataSource';
import type { ScenarioId } from '../health/scenarios';
import { assessWellness, recommendScent } from '../engine';
import type { BiometricSample, ScentRecommendation, TimelineEntry, WellnessAssessment } from '../types/domain';

const TIMELINE_LIMIT = 120;

/** One simulator instance for the app's lifetime — swapped for a real
 * HealthKit-backed source in production. See HEALTHKIT_MIGRATION.md. */
const healthDataSource = new SimulatedHealthDataSource();

interface AppState {
  onboardingComplete: boolean;
  healthStatus: ConnectionStatus;
  latestSample: BiometricSample | null;
  assessment: WellnessAssessment | null;
  recommendation: ScentRecommendation | null;
  timeline: TimelineEntry[];
  activeScenario: ScenarioId;

  completeOnboarding: () => void;
  connectHealth: () => Promise<void>;
  setScenario: (id: ScenarioId) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  onboardingComplete: false,
  healthStatus: 'disconnected',
  latestSample: null,
  assessment: null,
  recommendation: null,
  timeline: [],
  activeScenario: 'baseline',

  completeOnboarding: () => set({ onboardingComplete: true }),

  connectHealth: async () => {
    if (get().healthStatus === 'connected' || get().healthStatus === 'connecting') return;
    set({ healthStatus: 'connecting' });

    healthDataSource.subscribe((sample) => {
      const assessment = assessWellness(sample);
      const recommendation = recommendScent(assessment);

      set((state) => {
        const nextTimeline: TimelineEntry[] = [
          ...state.timeline,
          { timestamp: sample.timestamp, state: assessment.state, heartRate: sample.heartRate, confidence: assessment.confidence },
        ].slice(-TIMELINE_LIMIT);

        return {
          latestSample: sample,
          assessment,
          recommendation,
          timeline: nextTimeline,
        };
      });
    });

    await healthDataSource.connect();
    set({ healthStatus: healthDataSource.getStatus() });
  },

  setScenario: (id: ScenarioId) => {
    healthDataSource.setScenario(id);
    set({ activeScenario: id });
  },
}));
