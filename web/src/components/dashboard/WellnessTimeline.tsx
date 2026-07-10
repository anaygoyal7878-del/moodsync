import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import { wellnessStateMeta, wellnessStateOrder } from '../../data/wellnessStates';
import { stateHexColor } from '../../data/stateStyles';
import type { TimelineEntry } from '../../types/domain';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function CustomDot(props: { cx?: number; cy?: number; payload?: TimelineEntry }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  return <circle cx={cx} cy={cy} r={3} fill={stateHexColor[payload.state]} stroke="none" />;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimelineEntry }[] }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  const meta = wellnessStateMeta[entry.state];
  return (
    <div className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-xs shadow-card">
      <p className="font-medium text-ink">{formatTime(entry.timestamp)}</p>
      <p className="mt-0.5 text-ink-secondary">
        {entry.heartRate} bpm &middot; {meta.label}
      </p>
    </div>
  );
}

export function WellnessTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Wellness timeline</p>
        <p className="text-xs text-ink-muted">Heart rate, colored by inferred state</p>
      </div>

      <div className="mt-4 h-48 w-full">
        {entries.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={entries} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                stroke="transparent"
                tick={{ fill: '#6B6E78', fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis stroke="transparent" tick={{ fill: '#6B6E78', fontSize: 11 }} width={32} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="heartRate"
                stroke="#FF7A59"
                strokeWidth={1.5}
                dot={<CustomDot />}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            Collecting data — the timeline fills in as readings arrive
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
        {wellnessStateOrder.map((id) => (
          <div key={id} className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stateHexColor[id] }} aria-hidden="true" />
            {wellnessStateMeta[id].label}
          </div>
        ))}
      </div>
    </Card>
  );
}
