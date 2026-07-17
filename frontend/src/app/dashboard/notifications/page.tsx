import { backendFetch } from "@/lib/api";
import { NotificationHistorySection } from "@/components/dashboard/NotificationHistorySection";
import type { NotificationEntry, NotificationPreferences } from "@/lib/types";

export default async function NotificationsPage() {
  const [notificationsResult, pauseResult, notificationPreferencesResult] = await Promise.all([
    backendFetch<{ notifications: NotificationEntry[] }>("/api/notifications?limit=20"),
    backendFetch<{ pausedUntil: string | null; isPaused: boolean }>("/api/preferences/automation-pause"),
    backendFetch<NotificationPreferences>("/api/preferences/notifications"),
  ]);
  const notifications = notificationsResult.ok ? notificationsResult.data.notifications : [];
  const pausedUntil = pauseResult.ok ? pauseResult.data.pausedUntil : null;
  const isAutomationPaused = pauseResult.ok ? pauseResult.data.isPaused : false;
  const notificationPreferences: NotificationPreferences = notificationPreferencesResult.ok
    ? notificationPreferencesResult.data
    : { notificationsEnabled: true, quietHoursStart: null, quietHoursEnd: null };

  return (
    <NotificationHistorySection
      notifications={notifications}
      pausedUntil={pausedUntil}
      isPaused={isAutomationPaused}
      preferences={notificationPreferences}
    />
  );
}
