import { HeartPulse } from 'lucide-react';
import { Card } from '../ui/Card';
import type { BiometricSample } from '../../types/domain';

export function HeartRatePulse({ sample }: { sample: BiometricSample | null }) {
  const bpm = sample?.heartRate ?? 0;
  const beatDuration = bpm > 0 ? 60 / bpm : 1;

  return (
    <Card raised className="relative flex flex-col items-center overflow-hidden py-8">
      <div className="relative flex h-28 w-28 items-center justify-center">
        {sample && (
          <span
            className="absolute inset-0 rounded-full border border-state-relax/50"
            style={{ animation: `pulseRing ${beatDuration * 2}s cubic-bezier(0.2,0.6,0.4,1) infinite` }}
            aria-hidden="true"
          />
        )}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-state-relax/10">
          <HeartPulse
            className="h-8 w-8 text-state-relax"
            style={sample ? { animation: `heartbeat ${beatDuration}s ease-in-out infinite` } : undefined}
            aria-hidden="true"
          />
        </div>
      </div>

      <p className="mt-5 text-5xl font-semibold tabular-nums tracking-tight">{sample ? Math.round(bpm) : '--'}</p>
      <p className="mt-1 text-sm text-ink-secondary">beats per minute</p>

      <dl className="mt-6 grid w-full grid-cols-3 gap-2 border-t border-line pt-5 text-center">
        <Metric label="HRV" value={sample?.hrv} unit="ms" />
        <Metric label="Resp." value={sample?.respiratoryRate} unit="/min" />
        <Metric label="Resting" value={sample?.restingHeartRate} unit="bpm" />
      </dl>

      <style>{`
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          20% { transform: scale(1.15); }
          40% { transform: scale(1); }
        }
      `}</style>
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: number | undefined; unit: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink">
        {value !== undefined ? `${value}${unit}` : '—'}
      </dd>
    </div>
  );
}
