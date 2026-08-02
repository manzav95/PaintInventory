import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet } from "react-native";

const DURATION = Platform.OS === "web" ? 220 : 260;
const useNative = Platform.OS !== "web";

/**
 * Soft fade + slight rise when `screenKey` changes (e.g. currentScreen).
 */
export default function ScreenTransition({ screenKey, children, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: DURATION,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: DURATION,
        useNativeDriver: useNative,
      }),
    ]).start();
  }, [screenKey, opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.root,
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
  },
});
