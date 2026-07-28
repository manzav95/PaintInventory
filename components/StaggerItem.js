import React from "react";
import FadeIn from "./FadeIn";
import { MOTION } from "../utils/motionSprings";

/**
 * Staggered entrance for list rows. Caps delay so long lists stay snappy.
 */
export default function StaggerItem({
  index = 0,
  children,
  style,
  fromY = 8,
  duration = 280,
  disabled = false,
}) {
  const delay =
    Math.min(Math.max(0, index), MOTION.staggerMax) * MOTION.staggerStep;
  return (
    <FadeIn
      delay={delay}
      duration={duration}
      fromY={fromY}
      style={style}
      disabled={disabled}
    >
      {children}
    </FadeIn>
  );
}
