/** Minimal inline stroke icons for DashboardDock.tsx — the project has
 * no icon library dependency (React Bits' own usage example uses
 * react-icons, which isn't in this component's actual dependency list,
 * just its demo), so these are hand-written rather than pulling in a
 * new package for five glyphs. */

function iconProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function LinkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)} aria-hidden="true">
      <path d="M9 15 15 9" />
      <path d="M11 6l1.5-1.5a3.54 3.54 0 0 1 5 5L16 11" />
      <path d="M13 18l-1.5 1.5a3.54 3.54 0 0 1-5-5L8 13" />
    </svg>
  );
}

export function PulseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)} aria-hidden="true">
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}

export function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function BoltIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)} aria-hidden="true">
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" />
    </svg>
  );
}

export function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)} aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
