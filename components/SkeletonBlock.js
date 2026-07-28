import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import { MOTION } from "../utils/motionSprings";

const useNative = Platform.OS !== "web";

/**
 * Soft pulsing skeleton block for loading placeholders.
 */
export default function SkeletonBlock({
  height = 16,
  width = "100%",
  borderRadius = 6,
  style,
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: MOTION.skeletonPulse / 2,
          useNativeDriver: useNative,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: MOTION.skeletonPulse / 2,
          useNativeDriver: useNative,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        {
          height,
          width,
          borderRadius,
          opacity,
          backgroundColor: theme.dark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.08)",
        },
        style,
      ]}
    />
  );
}

export function SkeletonStack({ lines = 3, gap = 10, style }) {
  return (
    <View style={[styles.stack, { gap }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          height={i === 0 ? 18 : 14}
          width={i === lines - 1 ? "62%" : "100%"}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {},
  stack: {
    width: "100%",
  },
});
