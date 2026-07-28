"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, DoorOpen, ShieldAlert, Flame, Droplets, RectangleHorizontal, Bell, Plug, Lightbulb, Thermometer, HelpCircle, Star, Play } from "lucide-react";
import type { HomeSnapshotEntry, HomeAccessoryEntry, HomeAccessoryCategory, HomeSceneEntry, RoomWellnessEntry, HomeScoreEntry } from "@/lib/types";

const CATEGORY_ICON: Record<HomeAccessoryCategory, typeof Lock> = {
  LOCK: Lock,
  GARAGE_DOOR: DoorOpen,
  ALARM_SYSTEM: ShieldAlert,
  SMOKE_DETECTOR: Flame,
  LEAK_SENSOR: Droplets,
  WINDOW_COVERING: RectangleHorizontal,
  DOORBELL: Bell,
  OUTLET_OR_SWITCH: Plug,
  LIGHT: Lightbulb,
  THERMOSTAT_OR_SENSOR: Thermometer,
  OTHER: HelpCircle,
};

const SAFETY_CATEGORIES: HomeAccessoryCategory[] = [
  "LOCK",
  "GARAGE_DOOR",
  "ALARM_SYSTEM",
  "SMOKE_DETECTOR",
  "LEAK_SENSOR",
  "WINDOW_COVERING",
  "DOORBELL",
];

// Deterministic gradient per scene name — HomeKit doesn't expose scene
// artwork/icons to third-party apps, so this is MoodSync's own
// presentation, not a claim about real Apple Home metadata.
const SCENE_GRADIENTS = [
  "linear-gradient(135deg, rgba(255,145,110,0.35), rgba(217,168,200,0.15))",
  "linear-gradient(135deg, rgba(95,184,120,0.35), rgba(95,184,120,0.05))",
  "linear-gradient(135deg, rgba(212,175,120,0.35), rgba(212,175,120,0.05))",
  "linear-gradient(135deg, rgba(139,157,255,0.35), rgba(139,157,255,0.05))",
];

function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SCENE_GRADIENTS[hash % SCENE_GRADIENTS.length]!;
}

function statusFor(accessory: HomeAccessoryEntry): { label: string; color: string } {
  if (!accessory.reachable) return { label: "Offline", color: "var(--lux-muted)" };
  if (accessory.batteryLevelPct !== null && accessory.batteryLevelPct < 20) {
    return { label: `Battery ${accessory.batteryLevelPct}%`, color: "var(--lux-rose)" };
  }
  if (accessory.isSecurityAccessory && accessory.statusValue === null) {
    return { label: "Needs attention", color: "var(--lux-rose)" };
  }
  return { label: accessory.statusValue ?? "Safe", color: "var(--lux-sage)" };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[24px] p-6 ${className}`}
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      {children}
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-luxury-display mb-4 px-1 text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
      {children}
    </h2>
  );
}

function SceneCard({ scene, onChanged }: { scene: HomeSceneEntry; onChanged: () => void }) {
  const [busy, setBusy] = useState<"run" | "favorite" | null>(null);

  async function run() {
    setBusy("run");
    await fetch(`/api/home/scenes/${scene.sceneId}/run`, { method: "POST" });
    setBusy(null);
    onChanged();
  }

  async function toggleFavorite() {
    setBusy("favorite");
    await fetch(`/api/home/scenes/${scene.sceneId}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !scene.isFavorite }),
    });
    setBusy(null);
    onChanged();
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: gradientFor(scene.name), border: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            {scene.name}
          </h3>
          <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
            {scene.accessoryIds.length} device{scene.accessoryIds.length === 1 ? "" : "s"} ·{" "}
            {scene.lastRunAt ? `Last run ${new Date(scene.lastRunAt).toLocaleDateString()}` : "Never run"} · {scene.runCount} run{scene.runCount === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={toggleFavorite} disabled={busy !== null} aria-label="Toggle favorite">
          <Star size={18} fill={scene.isFavorite ? "var(--lux-gold)" : "none"} style={{ color: "var(--lux-gold)" }} />
        </button>
      </div>
      <button
        onClick={run}
        disabled={busy !== null}
        className="flex items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium"
        style={{ background: "var(--lux-sage)", color: "#1a241e" }}
      >
        <Play size={14} aria-hidden="true" />
        {busy === "run" ? "Running…" : "Run Scene"}
      </button>
    </div>
  );
}

export function LuxuryHome({
  snapshot,
  securityControlEnabled,
  roomWellness = [],
  overallWellness,
}: {
  snapshot: HomeSnapshotEntry | null;
  securityControlEnabled: boolean;
  roomWellness?: RoomWellnessEntry[];
  overallWellness?: HomeScoreEntry;
}) {
  const router = useRouter();
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityEnabled, setSecurityEnabled] = useState(securityControlEnabled);

  function refresh() {
    router.refresh();
  }

  async function toggleSecurityControl() {
    setSecurityBusy(true);
    const next = !securityEnabled;
    await fetch("/api/preferences/security-control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setSecurityEnabled(next);
    setSecurityBusy(false);
  }

  if (!snapshot) {
    return (
      <Card>
        <p className="text-[13px]" style={{ color: "var(--lux-ink)" }}>
          No Apple Home connected yet
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--lux-muted)" }}>
          Open the MoodSync companion app on your iPhone with Home app access granted, and sync once — your Home,
          Rooms, Accessories, and Scenes will appear here.
        </p>
      </Card>
    );
  }

  const onlineCount = snapshot.accessories.filter((a) => a.reachable).length;
  const offlineCount = snapshot.accessories.length - onlineCount;
  const batteryAlerts = snapshot.accessories.filter((a) => a.batteryLevelPct !== null && a.batteryLevelPct < 20);
  const favoriteScenes = snapshot.scenes.filter((s) => s.isFavorite);
  const safetyAccessories = snapshot.accessories.filter((a) => SAFETY_CATEGORIES.includes(a.category));

  return (
    <div className="flex flex-col gap-5">
      {/* Home Dashboard overview */}
      <Card className="lux-stagger-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] tracking-wide" style={{ color: "var(--lux-muted)" }}>
              Current Home
            </p>
            <p className="font-luxury-display text-[20px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              {snapshot.homeName}
            </p>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "rgba(95,184,120,0.12)", color: "var(--lux-sage)" }}>
            Synced {new Date(snapshot.pushedAt).toLocaleString()}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Rooms", value: snapshot.rooms.length },
            { label: "Accessories", value: snapshot.accessories.length },
            { label: "Online", value: onlineCount },
            { label: "Offline", value: offlineCount },
            ...(overallWellness?.value !== null && overallWellness?.value !== undefined
              ? [{ label: "Home Wellness", value: overallWellness.value }]
              : []),
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: "var(--lux-bg-card-2)" }}>
              <p className="tabular font-luxury-display text-[22px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                {stat.value}
              </p>
              <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        {batteryAlerts.length > 0 && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--lux-rose)" }}>
            {batteryAlerts.length} accessor{batteryAlerts.length === 1 ? "y" : "ies"} low on battery: {batteryAlerts.map((a) => a.name).join(", ")}
          </p>
        )}
      </Card>

      {/* Favorite Scenes quick actions */}
      {favoriteScenes.length > 0 && (
        <div className="lux-stagger-2 flex flex-col gap-3">
          <SectionHeading>Favorite Scenes</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {favoriteScenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} onChanged={refresh} />
            ))}
          </div>
        </div>
      )}

      {/* Scene Manager */}
      <div className="lux-stagger-3 flex flex-col gap-3">
        <SectionHeading>Scene Manager</SectionHeading>
        {snapshot.scenes.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
              No scenes found. Create scenes in Apple&rsquo;s Home app — MoodSync recommends and runs them, it
              doesn&rsquo;t create HomeKit scenes remotely.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {snapshot.scenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* Room View */}
      <div className="lux-stagger-4 flex flex-col gap-3">
        <SectionHeading>Rooms</SectionHeading>
        {snapshot.rooms.length === 0 ? (
          <Card>
            <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
              No rooms found in your Apple Home.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {snapshot.rooms.map((room) => {
              const devicesInRoom = snapshot.accessories.filter((a) => a.roomId === room.roomId);
              const wellness = roomWellness.find((w) => w.roomId === room.roomId);
              return (
                <div key={room.id} className="rounded-2xl p-4" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                      {room.name}
                    </h3>
                    {wellness?.overallScore.value !== null && wellness?.overallScore.value !== undefined && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: "rgba(95,184,120,0.12)", color: "var(--lux-sage)" }}
                      >
                        {wellness.overallScore.value}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: "var(--lux-muted)" }}>
                    <span>{room.temperatureC !== null ? `${Math.round(room.temperatureC)}°C` : "No temp sensor"}</span>
                    <span>{room.humidityPct !== null ? `${Math.round(room.humidityPct)}% humidity` : "No humidity sensor"}</span>
                    <span>{room.airQuality ?? "No air quality sensor"}</span>
                  </div>
                  <p className="mt-2 text-[11px]" style={{ color: "var(--lux-muted)" }}>
                    {devicesInRoom.length} device{devicesInRoom.length === 1 ? "" : "s"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Home Safety */}
      <Card className="lux-stagger-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionHeading>Home Safety</SectionHeading>
          <button
            onClick={toggleSecurityControl}
            disabled={securityBusy}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: securityEnabled ? "rgba(95,184,120,0.15)" : "var(--lux-bg-card-2)",
              color: securityEnabled ? "var(--lux-sage)" : "var(--lux-muted)",
              border: "1px solid var(--lux-hairline)",
            }}
          >
            {securityEnabled ? "Security control: On" : "Security control: Off (safe default)"}
          </button>
        </div>
        <p className="mb-4 text-[11px]" style={{ color: "var(--lux-muted)" }}>
          MoodSync never automatically controls locks, garage doors, or alarms unless you explicitly turn this on.
          With it off, this section is status-only.
        </p>
        {safetyAccessories.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
            No safety-related accessories found.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {safetyAccessories.map((accessory) => {
              const Icon = CATEGORY_ICON[accessory.category];
              const status = statusFor(accessory);
              return (
                <div key={accessory.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "var(--lux-bg-card-2)" }}>
                  <div className="flex items-center gap-3">
                    <Icon size={16} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
                    <span className="text-[13px]" style={{ color: "var(--lux-ink)" }}>
                      {accessory.name}
                    </span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: `${status.color}1a`, color: status.color }}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Device Management — browse-only */}
      <div className="flex flex-col gap-3">
        <SectionHeading>Devices</SectionHeading>
        <p className="-mt-2 px-1 text-[11px]" style={{ color: "var(--lux-muted)" }}>
          Browse your accessories here — MoodSync encourages scene-based automation over individual device control.
        </p>
        <Card>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--lux-hairline)" }}>
            {snapshot.accessories.map((accessory) => {
              const Icon = CATEGORY_ICON[accessory.category];
              return (
                <div key={accessory.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Icon size={16} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
                    <div>
                      <p className="text-[13px]" style={{ color: "var(--lux-ink)" }}>
                        {accessory.name}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
                        {[accessory.manufacturer, accessory.model, accessory.firmwareVersion ? `fw ${accessory.firmwareVersion}` : null]
                          .filter(Boolean)
                          .join(" · ") || "No metadata"}
                      </p>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={{
                      background: accessory.reachable ? "rgba(95,184,120,0.12)" : "rgba(217,168,200,0.12)",
                      color: accessory.reachable ? "var(--lux-sage)" : "var(--lux-rose)",
                    }}
                  >
                    {accessory.reachable ? "Online" : "Offline"}
                    {accessory.batteryLevelPct !== null ? ` · ${accessory.batteryLevelPct}%` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
