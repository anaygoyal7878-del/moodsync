"use client";

import Image from "next/image";
import { motion } from "motion/react";

/** Real product photo (not a CSS/SVG reconstruction) — user-supplied
 * screenshot of Apple's own "Apple Watch" pairing screen, showing all
 * three watches from that lineup, background-keyed to transparent so
 * it sits directly on the page's own dark canvas instead of a visible
 * black rectangle. Background removal used a soft luminance threshold
 * (near-black -> transparent, with a short ramp for anti-aliased
 * edges) rather than a hard cutout, to avoid a jagged edge around the
 * watch cases. See frontend/public/images/apple-watch-lineup.png.
 *
 * This is Apple's own marketing photography, not MoodSync's — using it
 * here is the same "we show what we integrate with" pattern as the
 * WHOOP/Fitbit/Hue logos elsewhere on this page, not a claim that
 * MoodSync made this hardware or this UI. */
export function HeartRateWatch() {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[640px]"
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="absolute inset-0 -z-10 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, rgba(255,120,180,0.4), transparent 70%)" }}
        aria-hidden="true"
      />
      <Image
        src="/images/apple-watch-lineup.png"
        alt="Apple Watch lineup — one of the wearables MoodSync reads real biometric signals from"
        width={1014}
        height={646}
        className="h-auto w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
        priority
      />
    </motion.div>
  );
}
