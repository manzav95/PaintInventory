import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { layout, motion, radius, space, type } from "../../theme/tokens";
import { useAppLayout } from "../../utils/layout";
import { popupSurfaceColor } from "../../utils/themeColors";
import KeyboardScreen from "../KeyboardScreen";

const OPEN_MS = motion.dialogMs || 220;
const CLOSE_MS = motion.overlayOutMs || 150;
const EASE_OUT = Easing.out(Easing.cubic);

/**
 * Bottom sheet on mobile portrait only.
 * Landscape, iPad, and desktop use a centered dialog.
 */
export default function AppSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
  keyboard = false,
  size = "auto",
  scroll = true,
  snap = false,
  stacked = false,
  tall = false,
}) {
  const theme = useTheme();
  const { width, height, isMobilePortrait } = useAppLayout();
  const [mounted, setMounted] = useState(!!visible);
  const translateY = useRef(new Animated.Value(height)).current;
  const dialogScale = useRef(new Animated.Value(visible ? 1 : 0.96)).current;
  const backdrop = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetH = useRef(Math.min(height, 480));
  const dismissing = useRef(false);
  const sheetMode = useRef(isMobilePortrait);
  sheetMode.current = isMobilePortrait;
  const tyNow = useRef(height);
  const startTy = useRef(0);

  const expandH = Math.round(height * 0.88);
  const compactH = Math.round(height * 0.46);
  const compactTy = Math.max(0, expandH - compactH);
  const snapOn = !!(snap && isMobilePortrait);
  const snapOnRef = useRef(snapOn);
  snapOnRef.current = snapOn;
  const compactTyRef = useRef(compactTy);
  compactTyRef.current = compactTy;
  const expandHRef = useRef(expandH);
  expandHRef.current = expandH;

  const maxWidth = isMobilePortrait
    ? width
    : size === "large" || snap
      ? Math.min(width - 48, 560)
      : Math.min(width - 48, layout.modalMaxWidthLg);
  const stackedH = Math.round(height * 0.78);
  const maxHeight = snapOn
    ? expandH
    : stacked && isMobilePortrait
      ? stackedH
      : Math.round(height * (size === "large" ? 0.92 : 0.86));

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      tyNow.current = value;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const animateOpen = () => {
    dismissing.current = false;
    if (sheetMode.current) {
      if (snapOnRef.current) sheetH.current = expandHRef.current;
      translateY.setValue(sheetH.current || height);
      dialogScale.setValue(1);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: OPEN_MS,
          easing: EASE_OUT,
          useNativeDriver: false,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: OPEN_MS,
          easing: EASE_OUT,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }
    translateY.setValue(0);
    dialogScale.setValue(0.96);
    Animated.parallel([
      Animated.timing(dialogScale, {
        toValue: 1,
        duration: OPEN_MS,
        easing: EASE_OUT,
        useNativeDriver: false,
      }),
      Animated.timing(backdrop, {
        toValue: 1,
        duration: OPEN_MS,
        easing: EASE_OUT,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const animateClose = (after) => {
    if (dismissing.current) return;
    dismissing.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: sheetMode.current ? sheetH.current || height : 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(dialogScale, {
        toValue: sheetMode.current ? 1 : 0.96,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: CLOSE_MS,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      dismissing.current = false;
      if (finished) {
        setMounted(false);
        after?.();
      }
    });
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(animateOpen);
      return undefined;
    }
    if (mounted) animateClose();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  const requestDismiss = () => {
    if (!dismissableRef.current) return;
    onDismissRef.current?.();
  };

  const snapTo = (to) => {
    Animated.spring(translateY, {
      toValue: to,
      useNativeDriver: false,
      speed: 18,
      bounciness: 0,
    }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => {
          if (!sheetMode.current || !dismissableRef.current) return false;
          if (Math.abs(g.dy) < 6 || Math.abs(g.dy) <= Math.abs(g.dx)) {
            return false;
          }
          if (snapOnRef.current) return true;
          return g.dy > 0;
        },
        onPanResponderGrant: () => {
          startTy.current = tyNow.current;
        },
        onPanResponderMove: (_, g) => {
          if (!sheetMode.current) return;
          if (snapOnRef.current) {
            const next = Math.max(
              0,
              Math.min(expandHRef.current, startTy.current + g.dy),
            );
            translateY.setValue(next);
            return;
          }
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (!sheetMode.current) return;
          if (snapOnRef.current) {
            const ty = Math.max(
              0,
              Math.min(expandHRef.current, startTy.current + g.dy),
            );
            const compact = compactTyRef.current;
            const tall = expandHRef.current;
            const dismissAt = compact + Math.min(72, (tall - compact) * 0.35);
            if (ty >= dismissAt) {
              onDismissRef.current?.();
              return;
            }
            snapTo(ty < compact / 2 ? 0 : compact);
            return;
          }
          if (g.dy > 72 || g.vy > 1.1) {
            onDismissRef.current?.();
            return;
          }
          snapTo(0);
        },
      }),
    [translateY],
  );

  if (!mounted) return null;

  const fill = popupSurfaceColor(theme);
  const headerDrag = isMobilePortrait ? pan.panHandlers : null;
  const body = (
    <View style={[styles.body, snapOn && styles.bodyFill]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={[styles.scroll, snapOn && styles.scrollFill]}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? requestDismiss : () => {}}
    >
      <View
        style={[
          styles.root,
          isMobilePortrait ? styles.rootSheet : styles.rootDialog,
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? requestDismiss : undefined}
          accessibilityLabel="Dismiss"
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scrim,
              stacked && styles.scrimStacked,
              {
                opacity: backdrop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
        </Pressable>
        <Animated.View
          onLayout={(e) => {
            if (snapOnRef.current) {
              sheetH.current = expandHRef.current;
              return;
            }
            sheetH.current = e.nativeEvent.layout.height || sheetH.current;
          }}
          style={[
            isMobilePortrait ? styles.sheet : styles.dialog,
            snapOn && styles.sheetSnap,
            stacked && isMobilePortrait && styles.sheetStacked,
            {
              backgroundColor: fill,
              borderColor: theme.colors.outlineVariant,
              maxWidth,
              maxHeight,
              ...(snapOn ? { height: expandH } : null),
              ...(stacked && isMobilePortrait ? { height: stackedH } : null),
              ...(tall && isMobilePortrait && !stacked
                ? { height: maxHeight }
                : null),
              paddingBottom: isMobilePortrait
                ? Platform.OS === "web"
                  ? 18
                  : 28
                : space[4],
              opacity: isMobilePortrait
                ? 1
                : backdrop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
              transform: isMobilePortrait
                ? [{ translateY }]
                : [{ scale: dialogScale }],
            },
          ]}
        >
          <View {...(headerDrag || {})}>
            {isMobilePortrait ? (
              <View style={styles.handleHit}>
                <View
                  style={[
                    styles.handle,
                    { backgroundColor: theme.colors.onSurfaceVariant },
                  ]}
                />
              </View>
            ) : (
              <View style={styles.dialogSpacer} />
            )}
            {title || subtitle ? (
              <View style={styles.header}>
                <View style={styles.headerText}>
                  {title ? (
                    <Text
                      style={[styles.title, { color: theme.colors.onSurface }]}
                      numberOfLines={2}
                    >
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text
                      style={[
                        styles.subtitle,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                      numberOfLines={3}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {dismissable ? (
                  <IconButton
                    icon="close"
                    size={18}
                    onPress={requestDismiss}
                    accessibilityLabel="Close"
                    style={styles.closeBtn}
                  />
                ) : (
                  <View style={styles.closeBtn} />
                )}
              </View>
            ) : null}
          </View>
          {keyboard ? <KeyboardScreen fill={false}>{body}</KeyboardScreen> : body}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SheetAction({ title, detail, onPress, trailing, destructive }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && {
          backgroundColor: theme.dark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.04)",
        },
      ]}
    >
      <View style={styles.actionText}>
        <Text
          style={[
            styles.actionTitle,
            {
              color: destructive ? theme.colors.error : theme.colors.onSurface,
            },
          ]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.actionDetail,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Side-by-side sheet options with a faint vertical rule between them. */
export function SheetChoiceRow({ items = [], theme }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <View style={styles.choiceRow}>
      {list.map((item, idx) => (
        <React.Fragment key={item.key || item.title || idx}>
          {idx > 0 ? (
            <View
              style={[
                styles.choiceRule,
                { backgroundColor: theme.colors.outline },
              ]}
            />
          ) : null}
          <Pressable
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={({ pressed }) => [
              styles.choiceCell,
              pressed && {
                backgroundColor: theme.dark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
              },
            ]}
          >
            {item.trailing ? (
              <View style={styles.choiceTrailing}>{item.trailing}</View>
            ) : null}
            <Text
              style={[styles.choiceTitle, { color: theme.colors.onSurface }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {item.detail ? (
              <Text
                style={[
                  styles.choiceDetail,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={2}
              >
                {item.detail}
              </Text>
            ) : null}
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
  },
  rootSheet: {
    justifyContent: "flex-end",
  },
  rootDialog: {
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  scrimStacked: {
    backgroundColor: "rgba(11, 14, 26, 0.32)",
  },
  sheet: {
    width: "100%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -8px 28px rgba(0,0,0,0.28)" }
      : null),
  },
  sheetStacked: {
    zIndex: 2,
    overflow: "visible",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -14px 40px rgba(0,0,0,0.5)" }
      : {
          elevation: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.42,
          shadowRadius: 22,
        }),
  },
  dialog: {
    width: "100%",
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 12px 40px rgba(0,0,0,0.32)" }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 16,
        }),
  },
  sheetSnap: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
  },
  handleHit: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  dialogSpacer: {
    height: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.45,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: space[4],
    paddingBottom: 8,
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 6,
  },
  title: {
    ...type.sectionTitle,
  },
  subtitle: {
    ...type.body,
    marginTop: 4,
  },
  closeBtn: {
    margin: 0,
    width: 36,
    height: 36,
  },
  body: {
    minHeight: 0,
  },
  bodyFill: {
    flex: 1,
  },
  scroll: {
    maxHeight: 520,
  },
  scrollFill: {
    maxHeight: "100%",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space[4],
    paddingBottom: space[4],
    gap: 0,
  },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  action: {
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    ...type.bodyEmphasis,
  },
  actionDetail: {
    ...type.caption,
    marginTop: 2,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: -space[2],
  },
  choiceRule: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 10,
  },
  choiceCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 4,
  },
  choiceTrailing: {
    marginBottom: 2,
  },
  choiceTitle: {
    ...type.bodyEmphasis,
    textAlign: "center",
  },
  choiceDetail: {
    ...type.caption,
    textAlign: "center",
  },
});
