import React, { useEffect, useRef } from "react";
import { Animated, Platform, Text as RNText } from "react-native";
import { MOTION, SOFT_SPRING_EASING } from "../utils/motionSprings";

const useNative = Platform.OS !== "web";

/**
 * Bumps (scale + slight lift) whenever `value` changes.
 */
export default function BumpText({
  value,
  style,
  children,
  bumpKey,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const prev = useRef(bumpKey ?? value);

  useEffect(() => {
    const key = bumpKey ?? value;
    if (prev.current === key) return undefined;
    prev.current = key;
    scale.setValue(1);
    translateY.setValue(0);
    const anim = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.04,
          duration: MOTION.bump * 0.4,
          easing: SOFT_SPRING_EASING,
          useNativeDriver: useNative,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: MOTION.bump * 0.6,
          easing: SOFT_SPRING_EASING,
          useNativeDriver: useNative,
        }),
      ]),
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -1,
          duration: MOTION.bump * 0.4,
          easing: SOFT_SPRING_EASING,
          useNativeDriver: useNative,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: MOTION.bump * 0.6,
          easing: SOFT_SPRING_EASING,
          useNativeDriver: useNative,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [bumpKey, scale, translateY, value]);

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
      {children != null ? (
        children
      ) : (
        <RNText style={style}>{value}</RNText>
      )}
    </Animated.View>
  );
}
