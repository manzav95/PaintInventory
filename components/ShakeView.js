import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { MOTION } from "../utils/motionSprings";

const useNative = Platform.OS !== "web";

/**
 * Horizontal shake when `trigger` changes to a truthy / new value.
 * Clipped by default so the animation cannot spill outside the parent card;
 * pass `clip={false}` when children need to overflow (e.g. dropdowns).
 */
export default function ShakeView({ children, trigger, style, clip = true }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const last = useRef(trigger);

  useEffect(() => {
    if (trigger == null || trigger === false || trigger === 0) return undefined;
    if (trigger === last.current) return undefined;
    last.current = trigger;
    translateX.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(translateX, {
        toValue: -6,
        duration: 45,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateX, {
        toValue: 6,
        duration: 55,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateX, {
        toValue: -4,
        duration: 50,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateX, {
        toValue: 4,
        duration: 50,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: MOTION.shake * 0.2,
        useNativeDriver: useNative,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [trigger, translateX]);

  return (
    <View style={[clip ? styles.clip : styles.noClip, style]}>
      <Animated.View style={{ transform: [{ translateX }], width: "100%" }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  noClip: {
    width: "100%",
    maxWidth: "100%",
    overflow: "visible",
  },
});
