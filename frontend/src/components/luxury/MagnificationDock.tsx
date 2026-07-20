"use client";

/**
 * MagnificationDock — ported from the reference macOS-style dock
 * component (see the design-integration request this was adopted
 * from). Same spring-physics magnification and tooltip behavior as the
 * original; two real changes for this codebase:
 *   1. Imports from `motion/react` (already a project dependency,
 *      matching ElasticSlider.tsx's convention) instead of adding a
 *      second, redundant `framer-motion` dependency — `motion` is the
 *      same library under a new package name, API-compatible.
 *   2. Styled with MoodSync's `--lux-*`/`--brand` design tokens instead
 *      of the reference's shadcn `bg-card`/`border-border`/`text-foreground`
 *      classes, which don't exist in this app's Tailwind setup.
 */

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  AnimatePresence,
} from "motion/react";
import React, { Children, cloneElement, useEffect, useRef, useState } from "react";

export type DockItemData = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  active?: boolean;
};

export type DockProps = {
  items: DockItemData[];
  className?: string;
  distance?: number;
  panelHeight?: number;
  baseItemSize?: number;
  magnification?: number;
  spring?: SpringOptions;
};

type DockItemProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  mouseX: MotionValue<number>;
  spring: SpringOptions;
  distance: number;
  baseItemSize: number;
  magnification: number;
  active?: boolean;
};

function DockItem({
  children,
  className = "",
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
  active,
}: DockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseItemSize };
    return val - rect.x - baseItemSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
  const size = useSpring(targetSize, spring);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size,
        background: active ? "var(--lux-sage)" : "var(--lux-bg-card-2)",
        border: `1px solid ${active ? "transparent" : "var(--lux-hairline)"}`,
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-full shadow-lg cursor-pointer ${className}`}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) =>
        React.isValidElement(child)
          ? cloneElement(child as React.ReactElement<{ isHovered?: MotionValue<number>; active?: boolean }>, {
              isHovered,
              active,
            })
          : child,
      )}
    </motion.div>
  );
}

type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
};

function DockLabel({ children, className = "", isHovered }: DockLabelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on("change", (latest) => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`${className} absolute -top-8 left-1/2 w-fit whitespace-pre rounded-md px-2 py-1 text-xs shadow-sm`}
          style={{
            border: "1px solid var(--lux-hairline)",
            background: "var(--lux-bg-card-2)",
            color: "var(--lux-ink)",
            x: "-50%",
          }}
          role="tooltip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type DockIconProps = {
  className?: string;
  children: React.ReactNode;
  isHovered?: MotionValue<number>;
  active?: boolean;
};

function DockIcon({ children, className = "", active }: DockIconProps) {
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ color: active ? "#1a241e" : "var(--lux-muted)" }}>
      {children}
    </div>
  );
}

export function MagnificationDock({
  items,
  className = "",
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 70,
  distance = 150,
  panelHeight = 60,
  baseItemSize = 46,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);

  // The reference dock sprung this container's own height from
  // panelHeight up to a taller "hovered" height, so the row could grow
  // to fit magnified icons. Inside a `sticky bottom-0` footer that
  // reads as the whole bar jumping upward whenever it's touched — and
  // on a touchscreen it was pure cost: `onTouchStart` triggered the
  // growth, but touch never sets mouseX, so no icon actually magnified.
  // The container is now a fixed height and magnified icons simply
  // overflow upward out of the panel (which is what the macOS dock this
  // is modelled on does anyway), so the bar itself never moves.
  return (
    <div style={{ height: panelHeight }} className={`flex max-w-full items-end justify-center ${className}`}>
      <motion.div
        onMouseMove={({ pageX }) => mouseX.set(pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex w-fit items-end gap-2.5 rounded-[28px] px-3 pb-2 shadow-xl backdrop-blur-md"
        style={{
          height: panelHeight,
          background: "rgba(33, 27, 40, 0.85)",
          border: "1px solid var(--lux-hairline)",
        }}
        role="toolbar"
        aria-label="Application dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
            active={item.active}
          >
            <DockIcon>{item.icon}</DockIcon>
            <DockLabel>{item.label}</DockLabel>
          </DockItem>
        ))}
      </motion.div>
    </div>
  );
}

export default MagnificationDock;
