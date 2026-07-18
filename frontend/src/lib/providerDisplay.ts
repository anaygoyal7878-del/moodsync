import { HeartPulse, Apple, Watch, Lightbulb, Music, Mic } from "lucide-react";

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
  HUE: "Philips Hue",
  SPOTIFY: "Spotify",
  ECOBEE: "Ecobee",
  ALEXA: "Amazon Alexa",
};

/** Neutral category pictograms, not brand marks — lucide has no literal
 * WHOOP/Fitbit/Hue/etc. logos. */
export const PROVIDER_ICONS: Record<string, typeof HeartPulse> = {
  WHOOP: HeartPulse,
  GOOGLE_HEALTH: HeartPulse,
  APPLE_HEALTH: Apple,
  AMAZFIT: Watch,
  HUE: Lightbulb,
  SPOTIFY: Music,
  ALEXA: Mic,
};
