import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";

const useNative = Platform.OS !== "web";

/**
 * Fades an absolute overlay in/out instead of hard mount/unmount.
 */
export default function FadeOverlay({
  visible,
  children,
  style,
  pointerEvents = "auto",
}) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(!!visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: useNative,
      }).start();
      return undefined;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: useNative,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [visible, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.root,
        style,
        { opacity, pointerEvents: visible ? pointerEvents : "none" },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
});
