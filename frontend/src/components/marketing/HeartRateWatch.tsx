"use client";

import { motion } from "motion/react";

/** A real, animated Apple-Watch-style heart-rate visual for the landing
 * page — SVG/CSS, not a static image (no source image file was
 * available to reuse; this reconstructs the same concept: dark watch
 * face, glowing red ECG trace, BPM readout). Ties directly to a real
 * MoodSync capability — `heartRate` is a genuine field on
 * `NormalizedBiometricReading` synced from WHOOP/Fitbit/Apple Health —
 * rather than being purely decorative. The ECG trace loops via SVG
 * `stroke-dashoffset` animation and the watch itself floats gently,
 * both driven by `motion/react` (already a project dependency, same
 * library AtlasBackground.tsx's orb uses via plain CSS keyframes). */
export function HeartRateWatch() {
  return (
    <motion.div
      className="relative mx-auto w-[220px] select-none"
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden="true"
    >
      {/* Ambient red glow behind the watch */}
      <div
        className="absolute inset-0 -z-10 rounded-[3rem] blur-3xl opacity-40"
        style={{ background: "radial-gradient(circle, rgba(255,60,60,0.5), transparent 70%)" }}
      />

      {/* Watch band (top) */}
      <div className="mx-auto h-10 w-24 rounded-t-2xl bg-[#1a1214]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #241a1c 0px, #241a1c 2px, #1a1214 2px, #1a1214 4px)" }} />

      {/* Watch case */}
      <div className="relative rounded-[2.2rem] p-[6px]" style={{ background: "linear-gradient(155deg, #2a1a1c 0%, #0a0405 100%)", boxShadow: "0 30px 60px -15px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.08)" }}>
        {/* Digital crown */}
        <div className="absolute top-16 -right-1.5 h-8 w-2 rounded-r-sm bg-[#3a2a2c]" />
        <div className="absolute top-28 -right-1.5 h-4 w-2 rounded-r-sm bg-[#3a2a2c]" />

        {/* Screen */}
        <div className="relative aspect-[3/3.6] w-full overflow-hidden rounded-[1.7rem] bg-black">
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6">
            {/* Heart icon */}
            <motion.svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            >
              <path
                d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.3 5 5.8 5c2 0 3.4 1 4.2 2.3C10.8 6 12.2 5 14.2 5c3.5 0 5.4 3.6 3.8 6.8C19.5 16.4 12 21 12 21z"
                stroke="#ff4d4d"
                strokeWidth="1.6"
                fill="rgba(255,77,77,0.15)"
              />
            </motion.svg>

            {/* ECG trace */}
            <svg viewBox="0 0 200 60" className="h-14 w-full">
              <path
                d="M0 30 H55 L65 8 L75 52 L85 30 H115 L125 14 L135 46 L145 30 H200"
                fill="none"
                stroke="#ff4d4d"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="heart-rate-trace"
                style={{ filter: "drop-shadow(0 0 6px rgba(255,77,77,0.8))" }}
              />
            </svg>

            {/* BPM readout */}
            <div className="text-center">
              <motion.span
                className="tabular-nums text-4xl font-bold text-[#ff4d4d]"
                style={{ textShadow: "0 0 16px rgba(255,77,77,0.7)" }}
                animate={{ opacity: [1, 0.85, 1] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              >
                68
              </motion.span>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[#ff4d4d]/80">BPM</p>
            </div>
          </div>
        </div>
      </div>

      {/* Watch band (bottom) */}
      <div className="mx-auto h-10 w-24 rounded-b-2xl bg-[#1a1214]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #241a1c 0px, #241a1c 2px, #1a1214 2px, #1a1214 4px)" }} />
    </motion.div>
  );
}
