/** Atlas's character — a diffused, glowing aurora-light sphere with a
 * calm geometric face, per the design reference this was adopted from
 * (floating head only, cyan/violet/blue gradients, foggy edges, white
 * vector-line features: curved eyebrows, dot eyes, "L"-shaped nose,
 * neutral expression). Built directly in CSS/SVG rather than as a
 * static image — animated (atlas-float/atlas-glow, see globals.css),
 * theme-native (uses the dashboard's own dark-luxury canvas instead of
 * the reference's light off-white one, since it sits behind
 * AtlasChat.tsx's message text), and reduced-motion-aware. Purely
 * decorative: `aria-hidden`, positioned behind the chat UI, pointer-events
 * disabled so it never intercepts clicks. */
export function AtlasBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="atlas-orb atlas-orb-glow absolute top-[8%] left-1/2 h-[340px] w-[340px] -translate-x-1/2 sm:top-[6%]">
        {/* Diffused aurora glow — three overlapping radial blurs instead
         * of one flat gradient, so the edge reads as "foggy" rather than
         * a hard-edged circle. */}
        <div
          className="absolute -inset-6 rounded-full blur-[70px]"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, rgba(88,220,255,0.5), transparent 58%), radial-gradient(circle at 68% 38%, rgba(168,120,255,0.45), transparent 58%), radial-gradient(circle at 50% 72%, rgba(120,170,255,0.4), transparent 62%)",
          }}
        />
        <div
          className="absolute inset-[10%] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle at 40% 35%, rgba(120,220,255,0.55), transparent 52%), radial-gradient(circle at 62% 62%, rgba(180,130,255,0.45), transparent 58%)",
          }}
        />

        {/* Geometric face — clean white vector lines over the glow,
         * matching the reference's Notion-style curved eyebrows, dot
         * eyes, and "L"-shaped nose. viewBox is a simple 200x200 head
         * region centered on the orb. */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" fill="none">
          {/* eyebrows — high, curved */}
          <path d="M62 78 Q78 62 96 76" stroke="white" strokeWidth="3.5" strokeLinecap="round" opacity="0.92" />
          <path d="M104 76 Q122 62 138 78" stroke="white" strokeWidth="3.5" strokeLinecap="round" opacity="0.92" />
          {/* eyes — simple dots */}
          <circle cx="78" cy="98" r="4.5" fill="white" opacity="0.95" />
          <circle cx="122" cy="98" r="4.5" fill="white" opacity="0.95" />
          {/* nose — "L" shaped line */}
          <path d="M100 104 L100 122 L112 122" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        </svg>
      </div>
    </div>
  );
}
