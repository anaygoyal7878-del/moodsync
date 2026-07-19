/**
 * Hue's `hue.set_color_temperature` action takes mirek (reciprocal
 * megakelvin: `mirek = 1,000,000 / kelvin`), the CLIP v2 color-temp unit
 * — see integrations/hue/src/client.ts's `colorTemperatureMirek`. The
 * automation builder lets the user think entirely in Kelvin (what every
 * lighting product — Hue's own app included — actually shows), and
 * converts to mirek only at submit time.
 */
export const KELVIN_MIN = 2200;
export const KELVIN_MAX = 6500;

export function kelvinToMirek(kelvin: number): number {
  return Math.round(1_000_000 / kelvin);
}

export function mirekToKelvin(mirek: number): number {
  return Math.round(1_000_000 / mirek);
}

/** Matches the warm-to-cool labels standard in lighting UIs (Apple Home,
 * Hue app) — bucketed for display only, not a value the API defines. */
export function kelvinLabel(kelvin: number): string {
  if (kelvin <= 2500) return "Very Warm";
  if (kelvin <= 3200) return "Warm";
  if (kelvin <= 4500) return "Neutral";
  if (kelvin <= 5500) return "Cool";
  return "Daylight";
}

export function formatKelvin(kelvin: number): string {
  return `${kelvinLabel(kelvin)} · ${kelvin.toLocaleString()} K`;
}
