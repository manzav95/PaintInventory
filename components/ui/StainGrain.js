import React from "react";
import { Platform, StyleSheet, View } from "react-native";

const WEB_GRAIN = [
  "repeating-linear-gradient(8deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0) 6px, rgba(0,0,0,0) 16px)",
  "repeating-linear-gradient(6deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0) 32px, rgba(255,255,255,0) 58px)",
  "repeating-linear-gradient(11deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0.08) 40px, rgba(0,0,0,0) 56px, rgba(0,0,0,0) 96px)",
].join(",");

/**
 * Quiet wood-grain wash so a stain chip reads as wood, not a paint swatch.
 * Not a photo of the stain — the hex is still only a guide.
 */
export default function StainGrain() {
  if (Platform.OS === "web") {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.clip]}
      >
        {React.createElement("div", {
          style: {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundImage: WEB_GRAIN,
          },
        })}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {[0.14, 0.3, 0.48, 0.66, 0.84].map((top, i) => (
        <View
          key={i}
          style={[
            styles.nativeLine,
            {
              top: `${top * 100}%`,
              backgroundColor:
                i % 2 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)",
              transform: [{ rotate: i % 2 ? "1.4deg" : "-1.1deg" }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export function isStainType(type) {
  const t = String(type || "").toLowerCase();
  return t === "stain" || t === "custom_stain";
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  nativeLine: {
    position: "absolute",
    left: -8,
    right: -8,
    height: 2,
  },
});
