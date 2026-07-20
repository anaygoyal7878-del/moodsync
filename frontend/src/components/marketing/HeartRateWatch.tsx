"use client";

import Image from "next/image";
import { motion } from "motion/react";

/** User-supplied AI-generated illustration (not real product photography
 * of any specific vendor's hardware — generic watch faces/band, not a
 * claim that this is a WHOOP/Fitbit/Apple Watch screenshot) showing three
 * wearables, supplied pre-cut with a real alpha channel (no background
 * layer at all) — no local background-removal pass needed for this
 * version. See frontend/public/images/watch-lineup.png. */
export function HeartRateWatch() {
  return (
    <motion.div
      className="relative mx-auto w-full max-w-[420px]"
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="absolute inset-0 -z-10 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, rgba(255,120,180,0.4), transparent 70%)" }}
        aria-hidden="true"
      />
      <Image
        src="/images/watch-lineup.png"
        alt="Three wearable devices — the kind of watch and fitness band MoodSync reads real biometric signals from"
        width={912}
        height={1170}
        className="h-auto w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
        priority
      />
    </motion.div>
  );
}
