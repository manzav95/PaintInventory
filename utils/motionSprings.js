import { Easing } from "react-native";

/** Kinetics-style spring curves approximated as cubic-beziers for RN Animated.timing */
export const SPRING_EASING = Easing.bezier(0.34, 1.56, 0.64, 1);
export const SOFT_SPRING_EASING = Easing.bezier(0.22, 1.2, 0.36, 1);

export const MOTION = {
  toastIn: 480,
  toastOut: 220,
  bump: 260,
  shake: 420,
  staggerStep: 45,
  staggerMax: 10,
  skeletonPulse: 1100,
};
