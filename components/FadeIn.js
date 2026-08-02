import React, { useEffect, useRef } from "react";
import { Animated, Platform, View } from "react-native";

const useNative = Platform.OS !== "web";

/**
 * One-shot fade (and optional rise) on mount.
 */
export default function FadeIn({
  children,
  style,
  delay = 0,
  duration = 280,
  fromY = 10,
  disabled = false,
}) {
  const opacity = useRef(new Animated.Value(disabled ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(disabled ? 0 : fromY)).current;

  useEffect(() => {
    if (disabled) {
      opacity.setValue(1);
      translateY.setValue(0);
      return undefined;
    }
    opacity.setValue(0);
    translateY.setValue(fromY);
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: useNative,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [disabled, delay, duration, fromY, opacity, translateY]);

  if (disabled) {
    return style ? <View style={style}>{children}</View> : children;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
