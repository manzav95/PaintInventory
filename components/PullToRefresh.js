import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
  PanResponder,
} from "react-native";
import { useTheme } from "react-native-paper";

const THRESHOLD = 72;
const MAX_PULL = 118;
const HANG = 56;
const RESISTANCE = 0.4;
const isWeb = Platform.OS === "web";

function isScrollTreeAtTop(rootEl) {
  if (!rootEl || typeof document === "undefined") return true;
  if (typeof rootEl.scrollTop === "number" && rootEl.scrollTop > 2) {
    return false;
  }
  const all = rootEl.querySelectorAll?.("*") || [];
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i];
    if (!el || el.nodeType !== 1) continue;
    const style = window.getComputedStyle?.(el);
    if (!style) continue;
    const oy = style.overflowY;
    const scrollable = oy === "auto" || oy === "scroll" || oy === "overlay";
    if (
      scrollable &&
      el.scrollHeight > el.clientHeight + 1 &&
      el.scrollTop > 2
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Instagram-style pull to refresh.
 * Soft pull rubber-bands back; past threshold snaps to a hang + spinner.
 */
export default function PullToRefresh({
  refreshing = false,
  onRefresh,
  disabled = false,
  /** When set, overrides DOM scroll-top detection (e.g. FlatList onScroll). */
  atTop,
  children,
  style,
  contentStyle,
}) {
  const theme = useTheme();
  const pull = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const pullValueRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  const atTopRef = useRef(atTop);
  const armedRef = useRef(false);

  refreshingRef.current = refreshing;
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;
  atTopRef.current = atTop;

  useEffect(() => {
    const id = pull.addListener(({ value }) => {
      pullValueRef.current = value;
      setProgress(Math.min(1, value / THRESHOLD));
    });
    return () => pull.removeListener(id);
  }, [pull]);

  useEffect(() => {
    if (disabled) {
      if (pullValueRef.current > 0 || armedRef.current) {
        armedRef.current = false;
        pull.setValue(0);
      }
      return;
    }
    if (refreshing) {
      armedRef.current = true;
      Animated.spring(pull, {
        toValue: HANG,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
      return;
    }
    if (armedRef.current || pullValueRef.current > 0) {
      armedRef.current = false;
      Animated.spring(pull, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 16,
      }).start();
    }
  }, [refreshing, pull, disabled]);

  const finishPull = (distance) => {
    if (distance >= THRESHOLD && !refreshingRef.current) {
      armedRef.current = true;
      Animated.spring(pull, {
        toValue: HANG,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
      onRefreshRef.current?.();
      return;
    }
    Animated.spring(pull, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 8,
      speed: 18,
    }).start();
  };
  const finishPullRef = useRef(finishPull);
  finishPullRef.current = finishPull;

  // Web: capture touch/mouse so nested scroll views still work
  useEffect(() => {
    if (!isWeb || typeof document === "undefined") return undefined;
    const node = containerRef.current;
    const scrollNode = scrollRef.current || node;
    if (!node) return undefined;

    let tracking = false;
    let startY = 0;
    let lastPull = 0;

    const atTop = () => {
      if (typeof atTopRef.current === "boolean") return atTopRef.current;
      return isScrollTreeAtTop(scrollNode);
    };

    const canStart = () =>
      !disabledRef.current && !refreshingRef.current && atTop();

    const applyPull = (dy) => {
      const next = Math.min(MAX_PULL, Math.max(0, dy * RESISTANCE));
      lastPull = next;
      pull.setValue(next);
    };

    const onTouchStart = (e) => {
      if (!canStart() || !e.touches?.[0]) return;
      tracking = true;
      startY = e.touches[0].clientY;
      lastPull = 0;
    };

    const onTouchMove = (e) => {
      if (!tracking || refreshingRef.current) return;
      const y = e.touches?.[0]?.clientY;
      if (y == null) return;
      const dy = y - startY;
      if (dy <= 0 && lastPull <= 0) {
        tracking = false;
        return;
      }
      if (!atTop() && lastPull <= 0) {
        tracking = false;
        return;
      }
      if (dy > 0) {
        if (e.cancelable) e.preventDefault();
        applyPull(dy);
      }
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      finishPullRef.current(lastPull);
      lastPull = 0;
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", onTouchEnd);

    // Trackpad / mouse wheel overscroll at top (desktop)
    let wheelAcc = 0;
    let wheelTimer = null;
    const onWheel = (e) => {
      if (disabledRef.current || refreshingRef.current) return;
      if (!atTop() && wheelAcc <= 0) return;
      if (e.deltaY < 0 || wheelAcc > 0) {
        if (e.deltaY < 0 && !atTop() && wheelAcc <= 0) return;
        if (e.cancelable && (e.deltaY < 0 || wheelAcc > 0)) {
          // Only claim the gesture while rubber-banding
          if (wheelAcc > 0 || (atTop() && e.deltaY < 0)) {
            e.preventDefault();
          }
        }
        if (e.deltaY < 0) {
          wheelAcc = Math.min(MAX_PULL, wheelAcc + -e.deltaY * 0.28);
        } else {
          wheelAcc = Math.max(0, wheelAcc - e.deltaY * 0.28);
        }
        pull.setValue(wheelAcc);
        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          finishPullRef.current(wheelAcc);
          wheelAcc = 0;
          wheelTimer = null;
        }, 140);
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
      node.removeEventListener("wheel", onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [pull]);

  // Native: PanResponder (best-effort when no nested scroll steals the gesture)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (isWeb || disabledRef.current || refreshingRef.current) return false;
        if (typeof atTopRef.current === "boolean" && !atTopRef.current) {
          return false;
        }
        return g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
      },
      onPanResponderMove: (_, g) => {
        if (g.dy <= 0) {
          pull.setValue(0);
          return;
        }
        pull.setValue(Math.min(MAX_PULL, g.dy * RESISTANCE));
      },
      onPanResponderRelease: (_, g) => {
        finishPullRef.current(
          Math.min(MAX_PULL, Math.max(0, g.dy * RESISTANCE)),
        );
      },
      onPanResponderTerminate: () => {
        Animated.spring(pull, {
          toValue: refreshingRef.current ? HANG : 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const label = progress >= 1 ? "Release to refresh" : "Pull to refresh";

  const labelOpacity = pull.interpolate({
    inputRange: [0, 4, 18, THRESHOLD],
    outputRange: [0, 0.15, 0.7, 1],
    extrapolate: "clamp",
  });
  const labelScale = pull.interpolate({
    inputRange: [0, THRESHOLD, MAX_PULL],
    outputRange: [1, 1.06, 1.1],
    extrapolate: "clamp",
  });

  // Only the shaft stretches; the arrow head keeps a fixed size/shape.
  const STEM_BASE = 8;
  // Compact at rest, grows to ~2.5× the prior short curve through the pull.
  const stemLens = [3, 5, 12, 30, 50];
  const stemScales = stemLens.map((len) => len / STEM_BASE);
  const stemShifts = stemLens.map((len) => (len - STEM_BASE) / 2);
  const headTravels = stemLens.map((len) => Math.max(0, len - 1));
  const stretchInput = [0, 6, 16, THRESHOLD, MAX_PULL];

  const stemScaleY = pull.interpolate({
    inputRange: stretchInput,
    outputRange: stemScales,
    extrapolate: "clamp",
  });
  const stemShiftY = pull.interpolate({
    inputRange: stretchInput,
    outputRange: stemShifts,
    extrapolate: "clamp",
  });
  const headTravelY = pull.interpolate({
    inputRange: stretchInput,
    outputRange: headTravels,
    extrapolate: "clamp",
  });

  return (
    <View
      ref={containerRef}
      style={[styles.root, style]}
      {...(!isWeb ? panResponder.panHandlers : null)}
    >
      <View
        style={[
          styles.indicatorSlot,
          refreshing && !disabled && styles.indicatorSlotRefreshing,
        ]}
        pointerEvents="none"
      >
        {disabled ? null : refreshing ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <View style={styles.indicatorStack}>
            <Animated.Text
              style={[
                styles.indicatorText,
                {
                  color: theme.colors.onSurfaceVariant,
                  opacity: labelOpacity,
                  transform: [{ scale: labelScale }],
                },
              ]}
            >
              {label}
            </Animated.Text>
            <Animated.View
              style={[styles.arrowExtend, { opacity: labelOpacity }]}
            >
              <Animated.View
                style={[
                  styles.arrowStem,
                  {
                    height: STEM_BASE,
                    backgroundColor: theme.colors.onSurfaceVariant,
                    transform: [
                      { translateY: stemShiftY },
                      { scaleY: stemScaleY },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.arrowHeadWrap,
                  { transform: [{ translateY: headTravelY }] },
                ]}
              >
                <View
                  style={[
                    styles.arrowHead,
                    { borderTopColor: theme.colors.onSurfaceVariant },
                  ]}
                />
              </Animated.View>
            </Animated.View>
          </View>
        )}
      </View>
      <Animated.View
        style={[
          styles.content,
          {
            backgroundColor: theme.colors.background,
            transform: [{ translateY: pull }],
          },
        ]}
      >
        <View ref={scrollRef} style={[styles.scrollHost, contentStyle]}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    ...(isWeb ? { touchAction: "pan-y" } : null),
  },
  indicatorSlot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: MAX_PULL,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
    overflow: "hidden",
    zIndex: 0,
  },
  indicatorSlotRefreshing: {
    height: HANG,
    justifyContent: "center",
    paddingTop: 0,
  },
  indicatorStack: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  indicatorText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  arrowExtend: {
    width: 20,
    height: 20,
    alignItems: "center",
    marginTop: 2,
  },
  arrowStem: {
    position: "absolute",
    top: 0,
    width: 2,
    borderRadius: 1,
  },
  arrowHeadWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  arrowHead: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  content: {
    flex: 1,
    minHeight: 0,
    zIndex: 1,
  },
  scrollHost: {
    flex: 1,
    minHeight: 0,
  },
});
