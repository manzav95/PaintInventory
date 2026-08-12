import { Platform } from "react-native";

/**
 * Cross-platform elevation/shadow. Web prefers boxShadow (RNW deprecates shadow*).
 */
export function elevationShadow({
  offsetX = 0,
  offsetY = 4,
  blur = 10,
  opacity = 0.22,
  color = "#000",
  elevation = 4,
} = {}) {
  if (Platform.OS === "web") {
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${blur}px rgba(0,0,0,${opacity})`,
      elevation,
    };
  }
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: Math.max(1, blur * 0.8),
    elevation,
  };
}

/** Put pointerEvents on style (required on RN web). */
export function pe(value) {
  return { pointerEvents: value };
}
