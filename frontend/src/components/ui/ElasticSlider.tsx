"use client";

import { type ReactNode, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { Minus, Plus } from "lucide-react";

import "./ElasticSlider.css";

const MAX_OVERFLOW = 50;

interface ElasticSliderProps {
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Accessible name for the slider (screen readers, since there's no
   * visible <label>). Defaults to "Value". */
  ariaLabel?: string;
  /** Formats the live readout below the track and the `aria-valuetext`.
   * Defaults to a bare rounded number. */
  formatValue?: (value: number) => string;
  /** Fires on every drag frame with the live value. */
  onChange?: (value: number) => void;
  /** Fires once, with the settled value, when the drag ends — the right
   * place to hang a network call so dragging doesn't spam the API. */
  onChangeCommitted?: (value: number) => void;
}

/** Ported from React Bits' ElasticSlider (JS + CSS variant). The original
 * defaults to Chakra UI volume icons; this project doesn't depend on
 * Chakra, so the defaults use lucide-react (already a dependency, same
 * icon set the rest of the dashboard uses) instead. Also adds
 * onChange/onChangeCommitted, absent from the original, so callers can
 * distinguish "still dragging" from "user let go" — needed for any
 * real device control where every intermediate value shouldn't become
 * its own network request. */
export default function ElasticSlider({
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = "",
  isStepped = false,
  stepSize = 1,
  leftIcon = <Minus size={14} aria-hidden="true" />,
  rightIcon = <Plus size={14} aria-hidden="true" />,
  ariaLabel = "Value",
  formatValue,
  onChange,
  onChangeCommitted,
}: ElasticSliderProps) {
  return (
    <div className={`elastic-slider-container ${className}`}>
      <Slider
        defaultValue={defaultValue}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        ariaLabel={ariaLabel}
        formatValue={formatValue}
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
      />
    </div>
  );
}

interface SliderProps {
  defaultValue: number;
  startingValue: number;
  maxValue: number;
  isStepped: boolean;
  stepSize: number;
  leftIcon: ReactNode;
  rightIcon: ReactNode;
  ariaLabel: string;
  formatValue?: (value: number) => string;
  onChange?: (value: number) => void;
  onChangeCommitted?: (value: number) => void;
}

function Slider({
  defaultValue,
  startingValue,
  maxValue,
  isStepped,
  stepSize,
  leftIcon,
  rightIcon,
  ariaLabel,
  formatValue = (v) => `${Math.round(v)}`,
  onChange,
  onChangeCommitted,
}: SliderProps) {
  const [value, setValue] = useState(defaultValue);
  // Re-syncs `value` when the caller passes a new `defaultValue` (e.g.
  // swapping which device a shared slider controls) — a render-time
  // adjustment rather than an effect, so it doesn't cost an extra
  // commit (see https://react.dev/learn/you-might-not-need-an-effect).
  const [trackedDefault, setTrackedDefault] = useState(defaultValue);
  if (defaultValue !== trackedDefault) {
    setTrackedDefault(defaultValue);
    setValue(defaultValue);
  }
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useMotionValueEvent(clientX, "change", (latest) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;

      if (latest < left) {
        setRegion("left");
        newValue = left - latest;
      } else if (latest > right) {
        setRegion("right");
        newValue = latest - right;
      } else {
        setRegion("middle");
        newValue = 0;
      }

      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0 && sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);

      if (isStepped) {
        newValue = Math.round(newValue / stepSize) * stepSize;
      }

      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      setValue(newValue);
      onChange?.(newValue);
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: "spring", bounce: 0.5 });
    onChangeCommitted?.(value);
  };

  // Keyboard equivalent of dragging — this is a custom widget (a <div>,
  // not a native <input type="range">) so without this the control is
  // unreachable by keyboard/screen-reader users entirely.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = isStepped ? stepSize : (maxValue - startingValue) / 100;
    let newValue: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        newValue = value + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        newValue = value - step;
        break;
      case "PageUp":
        newValue = value + step * 10;
        break;
      case "PageDown":
        newValue = value - step * 10;
        break;
      case "Home":
        newValue = startingValue;
        break;
      case "End":
        newValue = maxValue;
        break;
      default:
        return;
    }
    e.preventDefault();
    newValue = Math.min(Math.max(newValue, startingValue), maxValue);
    setValue(newValue);
    onChange?.(newValue);
    onChangeCommitted?.(newValue);
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;

    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <>
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{
          scale,
          opacity: useTransform(scale, [1, 1.2], [0.7, 1]),
        }}
        className="elastic-slider-wrapper"
      >
        <motion.div
          animate={{
            scale: region === "left" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() => (region === "left" ? -overflow.get() / scale.get() : 0)),
          }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="elastic-slider-root"
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={startingValue}
          aria-valuemax={maxValue}
          aria-valuenow={value}
          aria-valuetext={formatValue(value)}
          onKeyDown={handleKeyDown}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  return 1 + overflow.get() / width;
                }
                return 1;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? "right" : "left";
                }
                return "left";
              }),
              height: useTransform(scale, [1, 1.2], [6, 12]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3]),
            }}
            className="elastic-slider-track-wrapper"
          >
            <div className="elastic-slider-track">
              <div className="elastic-slider-range" style={{ width: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: region === "right" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() => (region === "right" ? overflow.get() / scale.get() : 0)),
          }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>
      <p className="elastic-slider-value">{formatValue(value)}</p>
    </>
  );
}

function decay(value: number, max: number): number {
  if (max === 0) {
    return 0;
  }

  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);

  return sigmoid * max;
}
