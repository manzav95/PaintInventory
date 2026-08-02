import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet } from "react-native";

const DURATION = Platform.OS === "web" ? 220 : 260;
const useNative = Platform.OS !== "web";

/**
 * Keeps a screen mounted while hidden; fades in when shown again.
 */
export default function KeepAlivePane({ active, children, style }) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (!active) {
      opacity.setValue(0);
      return undefined;
    }
    opacity.setValue(0);
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: DURATION,
      useNativeDriver: useNative,
    });
    anim.start();
    return () => anim.stop();
  }, [active, opacity]);

  return (
    <Animated.View
      style={[
        styles.root,
        style,
        active ? { opacity } : styles.hidden,
      ]}
      pointerEvents={active ? "auto" : "none"}
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
  },
  hidden: {
    display: "none",
    opacity: 0,
  },
});
