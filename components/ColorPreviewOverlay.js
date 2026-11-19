import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import { fontFamily, layout as layoutTokens, radius } from "../theme/tokens";
import { popupSurfaceColor } from "../utils/themeColors";
import { useAppLayout } from "../utils/layout";
import StainGrain, { isStainType } from "./ui/StainGrain";

const FLY_IN_MS = 360;
const FLY_OUT_MS = 220;
const FADE_MS = 200;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const DEST = 280;
const NAME_H = 58;
const STAIN_NAME_H = 78;

function prefersReducedMotion() {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function hostNode(node) {
  if (!node) return null;
  if (typeof node.getBoundingClientRect === "function") return node;
  if (typeof node.getNode === "function") {
    try {
      const n = node.getNode();
      if (n && typeof n.getBoundingClientRect === "function") return n;
    } catch {
      /* ignore */
    }
  }
  return node._nativeNode || node;
}

export function measureColorOrigin(node) {
  try {
    const el = hostNode(node);
    if (el && typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect();
      if (!(r.width > 1 && r.height > 1)) return null;
      let corner = 8;
      if (typeof getComputedStyle === "function") {
        const raw = parseFloat(getComputedStyle(el).borderTopLeftRadius);
        if (Number.isFinite(raw)) corner = raw;
      }
      return {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        radius: corner,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function clearLegacyBlurStyles() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.getElementById("cure-color-preview-motion")?.remove();
}

export default function ColorPreviewOverlay({ item, origin, onClose }) {
  const theme = useTheme();
  const windowSize = useWindowDimensions();
  const { showPersistentSidebar, isNarrowDesktop } = useAppLayout();
  const winW =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.innerWidth
      : windowSize.width;
  const winH =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.innerHeight
      : windowSize.height;
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const [veilOn, setVeilOn] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    clearLegacyBlurStyles();
  }, []);

  useEffect(() => {
    closing.current = false;
    if (!item) {
      setVeilOn(false);
      return undefined;
    }
    if (reduced || !origin) {
      progress.setValue(1);
      setVeilOn(true);
      return undefined;
    }
    progress.setValue(0);
    setVeilOn(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setVeilOn(true);
        Animated.timing(progress, {
          toValue: 1,
          duration: FLY_IN_MS,
          easing: EASE_OUT,
          useNativeDriver: false,
        }).start();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [item, origin, progress, reduced]);

  useEffect(() => {
    if (Platform.OS !== "web" || !item) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const requestClose = () => {
    if (!item || closing.current) return;
    closing.current = true;
    setVeilOn(false);
    const finish = () => {
      closing.current = false;
      onClose?.();
    };
    if (reduced || !origin) {
      setTimeout(finish, FADE_MS);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: FLY_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setTimeout(finish, 16);
    });
  };

  if (!item) return null;

  const bgHex = item.hex_color || "#e0e0e0";
  const name = item.name || "Unnamed";
  const isStain = isStainType(item.type);
  const fill = popupSurfaceColor(theme);
  const sidebarW = showPersistentSidebar
    ? isNarrowDesktop
      ? layoutTokens.sidebarNarrowWidth
      : layoutTokens.sidebarWidth
    : 0;
  const destSize = Math.min(DEST, Math.round((winW - sidebarW) * 0.86));
  const destX = Math.round(sidebarW + (winW - sidebarW - destSize) / 2);
  const destY = Math.round((winH - destSize) / 2);
  const nameH = isStain ? STAIN_NAME_H : NAME_H;
  const from = origin && origin.width > 1
    ? origin
    : {
        x: destX,
        y: destY,
        width: destSize,
        height: destSize,
        radius: radius.lg,
      };
  const startRadius = from.radius != null ? from.radius : 8;

  const cardStyle = {
    position: "absolute",
    left: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [from.x, destX],
    }),
    top: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [from.y, destY],
    }),
    width: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [from.width, destSize],
    }),
    height: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [from.height, destSize],
    }),
    borderRadius: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [startRadius, radius.lg],
    }),
    backgroundColor: fill,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
  };

  const chromeOpacity = progress.interpolate({
    inputRange: [0.52, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const nameHeight = progress.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0, nameH],
    extrapolate: "clamp",
  });

  const card = (
    <Animated.View
      style={[styles.card, cardStyle]}
      accessibilityLabel="Color chip"
    >
      <View style={[styles.swatch, { backgroundColor: bgHex }]}>
        {isStain ? <StainGrain /> : null}
      </View>
      <Animated.View
        style={[
          styles.nameRow,
          {
            height: nameHeight,
            opacity: chromeOpacity,
            borderTopColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <Text
          style={[styles.name, { color: theme.colors.onSurface }]}
          numberOfLines={2}
        >
          {name}
        </Text>
        <Text
          style={[styles.id, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={1}
        >
          ID: {item.id != null ? String(item.id) : "—"}
        </Text>
        {isStain ? (
          <Text
            style={[styles.stainNote, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            Approximate stain color · varies on wood
          </Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );

  if (Platform.OS === "web" && typeof document !== "undefined") {
    return createPortal(
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 22, 36, 0.42)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            opacity: veilOn ? 1 : 0,
            transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            pointerEvents: "none",
          }}
        />
        <div
          aria-label="Dismiss color preview"
          onMouseDown={(e) => {
            e.preventDefault();
            requestClose();
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            outline: "none",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          }}
        />
        {card}
      </div>,
      document.body,
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={requestClose}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          accessibilityLabel="Dismiss color preview"
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.backdrop,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
        </Pressable>
        {card}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fixedRoot: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
  },
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor:
      Platform.OS === "web" ? "rgba(15, 22, 36, 0.16)" : "rgba(15, 22, 36, 0.42)",
  },
  card: {
    borderWidth: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }),
  },
  swatch: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  nameRow: {
    overflow: "hidden",
    paddingHorizontal: 16,
    justifyContent: "center",
    borderTopWidth: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
  },
  id: {
    fontSize: 13,
    fontFamily: fontFamily.mono,
    marginTop: 2,
  },
  stainNote: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
  },
});
