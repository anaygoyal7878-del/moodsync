import type { Transition } from "motion/react";

/**
 * Shared motion constants, so every in-flow animation feels like one
 * system rather than each component picking its own timing.
 *
 * The navigation spring is critically-ish damped: it travels to the new
 * item with a hint of settle but no visible bounce. A bouncy indicator
 * reads as playful; this app's register is calm and premium.
 */
export const NAV_INDICATOR_SPRING: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.9,
};
