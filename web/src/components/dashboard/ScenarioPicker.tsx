import clsx from 'clsx';
import { scenarioProfiles, type ScenarioId } from '../../health/scenarios';
import { useAppStore } from '../../store/useAppStore';

const scenarioOrder: ScenarioId[] = [
  'baseline',
  'stress',
  'workout',
  'recovery',
  'windDown',
  'asleep',
  'mindful',
  'lowEnergy',
];

export function ScenarioPicker() {
  const activeScenario = useAppStore((s) => s.activeScenario);
  const setScenario = useAppStore((s) => s.setScenario);

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">Demo: simulate a moment</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {scenarioOrder.map((id) => {
          const profile = scenarioProfiles[id];
          const isActive = activeScenario === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setScenario(id)}
              title={profile.description}
              className={clsx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'border-line-strong bg-surface-raised text-ink'
                  : 'border-line text-ink-secondary hover:text-ink',
              )}
            >
              {profile.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
