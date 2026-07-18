import { backendFetch } from "@/lib/api";
import { NotificationHistorySection } from "@/components/dashboard/NotificationHistorySection";
import type { NotificationEntry, NotificationPreferences } from "@/lib/types";

export default async function NotificationsPage() {
  const [notificationsResult, pauseResult, notificationPreferencesResult, resourcePausesResult] = await Promise.all([
    backendFetch<{ notifications: NotificationEntry[] }>("/api/notifications?limit=20"),
    backendFetch<{ pausedUntil: string | null; isPaused: boolean }>("/api/preferences/automation-pause"),
    backendFetch<NotificationPreferences>("/api/preferences/notifications"),
    backendFetch<{ pauses: Record<string, string> }>("/api/preferences/automation-pause/resource"),
  ]);
  const notifications = notificationsResult.ok ? notificationsResult.data.notifications : [];
  const pausedUntil = pauseResult.ok ? pauseResult.data.pausedUntil : null;
  const isAutomationPaused = pauseResult.ok ? pauseResult.data.isPaused : false;
  const notificationPreferences: NotificationPreferences = notificationPreferencesResult.ok
    ? notificationPreferencesResult.data
    : { notificationsEnabled: true, quietHoursStart: null, quietHoursEnd: null, notificationDigestMode: "IMMEDIATE" };
  const resourcePauses = resourcePausesResult.ok ? resourcePausesResult.data.pauses : {};

  return (
    <NotificationHistorySection
      notifications={notifications}
      pausedUntil={pausedUntil}
      isPaused={isAutomationPaused}
      preferences={notificationPreferences}
      resourcePauses={resourcePauses}
    />
  );
}
