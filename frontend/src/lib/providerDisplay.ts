import { HeartPulse, Apple, Watch, Music, Music2, Calendar } from "lucide-react";

/** Shared provider label/icon mappings — single source of truth so
 * ConnectionsSection.tsx (desktop connections page) and the luxury
 * Profile page never drift on what a provider is called or which
 * neutral category icon represents it. */
export const WEARABLE_LABELS: Record<string, string> = {
  WHOOP: "WHOOP",
  GOOGLE_HEALTH: "Fitbit",
  GARMIN: "Garmin",
  APPLE_HEALTH: "Apple Health",
  AMAZFIT: "Amazfit",
};

export const SMART_HOME_LABELS: Record<string, string> = {
  SPOTIFY: "Spotify",
  APPLE_MUSIC: "Apple Music",
  GOOGLE_CALENDAR: "Google Calendar",
};

/** Neutral category pictograms, not brand marks — lucide has no literal
 * WHOOP/Fitbit/etc. logos. */
export const PROVIDER_ICONS: Record<string, typeof HeartPulse> = {
  WHOOP: HeartPulse,
  GOOGLE_HEALTH: HeartPulse,
  APPLE_HEALTH: Apple,
  AMAZFIT: Watch,
  SPOTIFY: Music,
  APPLE_MUSIC: Music2,
  GOOGLE_CALENDAR: Calendar,
};
