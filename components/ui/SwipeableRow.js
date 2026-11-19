import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import { colors, radius, type } from "../../theme/tokens";
import { useAppLayout } from "../../utils/layout";

const ACTION_WIDTH = 76;
const COMMIT_THRESHOLD = ACTION_WIDTH;
const RESISTANCE = 0.4;
const MAX_OVERDRAG = 40;
const SCALE_MIN = 0.3;
const SCALE_POP = 1.22;

const exclusive = { id: null, close: null };

function claimExclusive(id, closeFn) {
  if (exclusive.id && exclusive.id !== id) {
    const prev = exclusive.close;
    exclusive.id = null;
    exclusive.close = null;
    prev?.();
  }
  exclusive.id = id;
  exclusive.close = closeFn;
}

function releaseExclusive(id) {
  if (exclusive.id === id) {
    exclusive.id = null;
    exclusive.close = null;
  }
}

function rubber(raw, limit) {
  if (limit === 0) return 0;
  if (raw >= 0 && limit > 0) {
    if (raw <= limit) return raw;
    return limit + Math.min(MAX_OVERDRAG, (raw - limit) * RESISTANCE);
  }
  if (raw <= 0 && limit < 0) {
    if (raw >= limit) return raw;
    return limit - Math.min(MAX_OVERDRAG, (limit - raw) * RESISTANCE);
  }
  return 0;
}

function actionFill(action, theme) {
  if (action?.tone === "danger") return theme.colors.error;
  if (action?.tone === "gold") return colors.brand.accent;
  return theme.dark ? "#3E4F68" : "#5E5A52";
}

function actionFg(action) {
  return action?.tone === "gold" ? colors.brand.navy : "#FFFFFF";
}

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

function scaleForDistance(dist) {
  const t = Math.min(1, Math.max(0, dist / ACTION_WIDTH));
  return SCALE_MIN + t * (1 - SCALE_MIN);
}

/**
 * Portrait inventory swipe: one row at a time.
 * Swipe left → Sheets. Swipe right (admin) → Edit.
 * Label grows with the drag. At full size it pops — release then fires.
 * Release before the pop and the row slides home.
 */
export default function SwipeableRow({
  children,
  leftAction = null,
  rightAction = null,
  disabled = false,
  style,
  cornerRadius = radius.lg,
}) {
  const theme = useTheme();
  const { isMobilePortrait } = useAppLayout();
  const idRef = useRef(`swipe-${Math.random().toString(36).slice(2, 9)}`);
  const swipeOff = disabled || !isMobilePortrait;
  const canLeft = !!(leftAction && !leftAction.hidden);
  const canRight = !!(rightAction && !rightAction.hidden);
  const leftRef = useRef(leftAction);
  const rightRef = useRef(rightAction);
  leftRef.current = leftAction;
  rightRef.current = rightAction;

  const x = useRef(new Animated.Value(0)).current;
  const labelScale = useRef(new Animated.Value(SCALE_MIN)).current;
  const current = useRef(0);
  const lastX = useRef(0);
  const armed = useRef(false);
  const popping = useRef(false);
  const popAnim = useRef(null);
  const reduced = prefersReducedMotion();

  const stopPop = () => {
    popAnim.current?.stop?.();
    popAnim.current = null;
    popping.current = false;
  };

  const growLabel = (dist) => {
    if (popping.current) return;
    labelScale.setValue(scaleForDistance(dist));
  };

  const playPop = () => {
    if (armed.current || popping.current) return;
    armed.current = true;
    if (reduced) {
      labelScale.setValue(1);
      return;
    }
    popping.current = true;
    const anim = Animated.sequence([
      Animated.timing(labelScale, {
        toValue: SCALE_POP,
        duration: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.spring(labelScale, {
        toValue: 1,
        speed: 26,
        bounciness: 6,
        useNativeDriver: false,
      }),
    ]);
    popAnim.current = anim;
    anim.start(({ finished }) => {
      popping.current = false;
      popAnim.current = null;
      if (finished) labelScale.setValue(1);
    });
  };

  const snapTo = (to) => {
    stopPop();
    armed.current = false;
    Animated.parallel([
      Animated.spring(x, {
        toValue: to,
        useNativeDriver: false,
        speed: 20,
        bounciness: to === 0 ? 8 : 0,
      }),
      Animated.spring(labelScale, {
        toValue: to === 0 ? SCALE_MIN : 1,
        useNativeDriver: false,
        speed: 22,
        bounciness: 0,
      }),
    ]).start();
    current.current = to;
    lastX.current = to;
    if (to === 0) releaseExclusive(idRef.current);
    else claimExclusive(idRef.current, () => snapToRef.current(0));
  };
  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;
  const playPopRef = useRef(playPop);
  playPopRef.current = playPop;
  const growLabelRef = useRef(growLabel);
  growLabelRef.current = growLabel;
  const stopPopRef = useRef(stopPop);
  stopPopRef.current = stopPop;

  useEffect(
    () => () => {
      stopPop();
      releaseExclusive(idRef.current);
    },
    [],
  );

  const fire = (action) => {
    snapTo(0);
    action?.onPress?.();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => {
          if (swipeOff || (!canLeft && !canRight)) return false;
          if (Math.abs(g.dx) <= 8 || Math.abs(g.dx) <= Math.abs(g.dy) * 1.15) {
            return false;
          }
          if (current.current < -8 && g.dx > 0) return true;
          if (current.current > 8 && g.dx < 0) return true;
          if (g.dx < 0) return canRight;
          if (g.dx > 0) return canLeft;
          return false;
        },
        onPanResponderGrant: () => {
          claimExclusive(idRef.current, () => snapToRef.current(0));
          stopPopRef.current();
          armed.current = false;
          x.stopAnimation((v) => {
            current.current = v;
            lastX.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = current.current + g.dx;
          const maxRight = canLeft ? ACTION_WIDTH : 0;
          const maxLeft = canRight ? -ACTION_WIDTH : 0;
          let clamped = next;
          if (next > 0) clamped = rubber(next, maxRight);
          else if (next < 0) clamped = rubber(next, maxLeft);
          else clamped = 0;
          lastX.current = clamped;
          x.setValue(clamped);
          const dist = Math.abs(clamped);
          if (dist >= COMMIT_THRESHOLD) {
            playPopRef.current();
          } else {
            if (armed.current) {
              stopPopRef.current();
              armed.current = false;
            }
            growLabelRef.current(dist);
          }
        },
        onPanResponderRelease: () => {
          const next = lastX.current;
          const snap = (to) => snapToRef.current(to);
          const willFire = armed.current || Math.abs(next) >= COMMIT_THRESHOLD;
          if (next < 0 && canRight && willFire) {
            snap(0);
            rightRef.current?.onPress?.();
            return;
          }
          if (next > 0 && canLeft && willFire) {
            snap(0);
            leftRef.current?.onPress?.();
            return;
          }
          snap(0);
        },
        onPanResponderTerminate: () => snapToRef.current(0),
      }),
    [swipeOff, canLeft, canRight, x],
  );

  if ((!canLeft && !canRight) || swipeOff) {
    return <View style={style}>{children}</View>;
  }

  const fill = theme.colors.elevation?.level1 || theme.colors.surface;
  const leftWidth = x.interpolate({
    inputRange: [0, ACTION_WIDTH],
    outputRange: [0, ACTION_WIDTH],
    extrapolate: "clamp",
  });
  const rightWidth = x.interpolate({
    inputRange: [-ACTION_WIDTH, 0],
    outputRange: [ACTION_WIDTH, 0],
    extrapolate: "clamp",
  });
  const leftOpacity = x.interpolate({
    inputRange: [0, 8],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const rightOpacity = x.interpolate({
    inputRange: [-8, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const renderAction = (action, side, opacity, width) => {
    if (!action) return null;
    return (
      <Animated.View
        style={[
          styles.actionSlot,
          side === "left" ? styles.actionLeft : styles.actionRight,
          { opacity, width, backgroundColor: actionFill(action, theme) },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => fire(action)}
          style={styles.actionHit}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Animated.View style={{ transform: [{ scale: labelScale }] }}>
            <Text
              style={[styles.actionLabel, { color: actionFg(action) }]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View
      style={[
        styles.wrap,
        { borderRadius: cornerRadius, backgroundColor: fill },
        style,
      ]}
    >
      {renderAction(leftAction, "left", leftOpacity, leftWidth)}
      {renderAction(rightAction, "right", rightOpacity, rightWidth)}
      <Animated.View
        {...pan.panHandlers}
        style={[
          styles.front,
          { backgroundColor: fill, borderRadius: cornerRadius },
          { transform: [{ translateX: x }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    overflow: "hidden",
  },
  actionSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  actionLeft: {
    left: 0,
  },
  actionRight: {
    right: 0,
  },
  actionHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  actionLabel: {
    ...type.label,
    textAlign: "center",
    fontWeight: "700",
  },
  front: {
    overflow: "hidden",
  },
});
