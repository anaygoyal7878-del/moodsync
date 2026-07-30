import { toneColor } from "./CompanionPrimitives";

/**
 * A diverging bar for a signed heart-rate change, centred on zero.
 *
 * Diverging rather than a plain magnitude bar because the *direction*
 * carries the meaning and it isn't the same meaning in every mode — a
 * drop is the win for Relax and the wrong way for Workout. Colour comes
 * from `helped`, which the server already resolved per mode, so this
 * component never has to know the rules.
 */
export function EffectBar({
  delta,
  helped,
  maxMagnitude,
}: {
  delta: number;
  helped: boolean;
  /** Largest magnitude in the set, so bars across a list stay
   * comparable to each other rather than each self-scaling. */
  maxMagnitude: number;
}) {
  const scale = Math.max(maxMagnitude, 1);
  const widthPct = Math.min(50, (Math.abs(delta) / scale) * 50);
  const color = helped ? toneColor("positive") : toneColor("caution");
  const goesLeft = delta < 0;

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--lux-bg-card-2)" }}
      role="img"
      aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} beats per minute, ${helped ? "the intended direction" : "against the intended direction"}`}
    >
      {/* Centre tick */}
      <span
        className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2"
        style={{ background: "var(--lux-hairline)" }}
        aria-hidden="true"
      />
      <span
        className="absolute top-0 bottom-0 rounded-full transition-[width]"
        style={{
          width: `${widthPct}%`,
          background: color,
          ...(goesLeft ? { right: "50%" } : { left: "50%" }),
        }}
        aria-hidden="true"
      />
    </div>
  );
}
