import { Card } from "@/components/ui/Card";
import type { NotificationEntry, NotificationPreferences } from "@/lib/types";
import { PauseAutomationsButton } from "./PauseAutomationsButton";
import { NotificationPreferencesForm } from "./NotificationPreferencesForm";

export function NotificationHistorySection({
  notifications,
  pausedUntil,
  isPaused,
  preferences,
}: {
  notifications: NotificationEntry[];
  pausedUntil: string | null;
  /** Computed server-side (dashboard/page.tsx) rather than comparing
   * against Date.now() during render — React's purity rule flags
   * impure calls like Date.now() inside a component body. */
  isPaused: boolean;
  preferences: NotificationPreferences;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Notifications</h2>
        <PauseAutomationsButton isPaused={isPaused} />
      </div>

      {isPaused && pausedUntil && (
        <Card className="bg-surface-raised">
          <p className="text-sm text-ink-secondary">Automations are paused until {new Date(pausedUntil).toLocaleString()}.</p>
        </Card>
      )}

      <NotificationPreferencesForm preferences={preferences} />

      {notifications.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-secondary">No notifications yet — every automation outcome shows up here with why it happened.</p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-3">
            {notifications.map((n) => (
              <div key={n.id} className="flex flex-col gap-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <span className="text-xs text-ink-muted">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-ink-secondary">{n.body}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
