import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  Pressable,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import { subscribeToasts } from "../utils/showToast";
import { MOTION, SPRING_EASING } from "../utils/motionSprings";

const useNative = Platform.OS !== "web";

function ToastItem({ toast, onDone }) {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(28)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: MOTION.toastOut,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateY, {
        toValue: 16,
        duration: MOTION.toastOut,
        useNativeDriver: useNative,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone(toast.id);
    });
  }, [onDone, opacity, toast.id, translateY]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: MOTION.toastIn * 0.55,
        useNativeDriver: useNative,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: MOTION.toastIn,
        easing: SPRING_EASING,
        useNativeDriver: useNative,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: MOTION.toastIn,
        easing: SPRING_EASING,
        useNativeDriver: useNative,
      }),
    ]).start();
    const t = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(t);
  }, [dismiss, opacity, scale, toast.duration, translateY]);

  const accent =
    toast.type === "error"
      ? theme.colors.error
      : toast.type === "info"
        ? theme.colors.primary
        : "#2e7d32";
  const mark =
    toast.type === "error" ? "!" : toast.type === "info" ? "i" : "✓";

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: theme.colors.outlineVariant,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Pressable onPress={dismiss} style={styles.toastPress}>
        <View style={[styles.mark, { backgroundColor: accent }]}>
          <Text style={styles.markText}>{mark}</Text>
        </View>
        <View style={styles.copy}>
          {toast.title ? (
            <Text
              style={[styles.title, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {toast.title}
            </Text>
          ) : null}
          <Text
            style={[
              styles.message,
              { color: theme.colors.onSurfaceVariant },
              !toast.title && { color: theme.colors.onSurface, fontWeight: "600" },
            ]}
            numberOfLines={3}
          >
            {toast.message || toast.title}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Mount once near app root. Renders spring overshoot toasts from showToast().
 */
export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((prev) => [...prev.slice(-2), toast]);
    });
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (!toasts.length) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDone={remove} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "web" ? 28 : 40,
    alignItems: "center",
    zIndex: 9999,
    elevation: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  toast: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 28px rgba(0,0,0,0.18)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }),
  },
  toastPress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  message: { fontSize: 14, lineHeight: 18 },
});
