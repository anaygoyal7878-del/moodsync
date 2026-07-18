"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import type { NotificationPreferences } from "@/lib/types";

/** Wires up `UserPreferences.notificationsEnabled`/`quietHoursStart`/
 * `quietHoursEnd` — modeled in the schema since before the Decision
 * Engine round but never previously read or written by any code. Only
 * the notification is suppressed during quiet hours (see
 * ai/src/notificationExecutor.ts's `shouldNotify`) — automation history
 * always still records what happened, so this is purely about what
 * interrupts you, not what gets logged. */
export function NotificationPreferencesForm({ preferences }: { preferences: NotificationPreferences }) {
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState(preferences.notificationsEnabled);
  const [quietHoursOn, setQuietHoursOn] = useState(preferences.quietHoursStart !== null);
  const [quietHoursStart, setQuietHoursStart] = useState(preferences.quietHoursStart ?? "22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState(preferences.quietHoursEnd ?? "07:00");
  const [digestOn, setDigestOn] = useState(preferences.notificationDigestMode === "HOURLY");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/preferences/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationsEnabled,
        quietHoursStart: quietHoursOn ? quietHoursStart : null,
        quietHoursEnd: quietHoursOn ? quietHoursEnd : null,
        notificationDigestMode: digestOn ? "HOURLY" : "IMMEDIATE",
      }),
    });
    router.refresh();
    setSaving(false);
    setSaved(true);
  }

  return (
    <Card className="flex flex-col gap-3">
      <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} label="Enable automation notifications" />

      <Switch
        checked={quietHoursOn}
        onCheckedChange={setQuietHoursOn}
        label="Quiet hours (suppress notifications, not automations, during a window)"
      />

      {quietHoursOn && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
          <span>Between</span>
          <Input type="time" className="w-auto" value={quietHoursStart} onChange={(e) => setQuietHoursStart(e.target.value)} />
          <span>and</span>
          <Input type="time" className="w-auto" value={quietHoursEnd} onChange={(e) => setQuietHoursEnd(e.target.value)} />
        </div>
      )}

      <Switch
        checked={digestOn}
        onCheckedChange={setDigestOn}
        label="Bundle notifications into an hourly digest instead of sending each one immediately"
      />

      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save notification preferences"}
        </Button>
        {saved && !saving && <span className="text-xs text-ink-muted">Saved.</span>}
      </div>
    </Card>
  );
}
