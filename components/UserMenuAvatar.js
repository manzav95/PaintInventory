import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Text, Avatar, useTheme } from "react-native-paper";
import { colors, space, radius } from "../theme/tokens";
import { displayUserName } from "../utils/displayUserName";
import { popupSurfaceColor } from "../utils/themeColors";
import { useAppLayout } from "../utils/layout";
import AppSheet, { SheetAction } from "./ui/AppSheet";

const PANEL_WIDTH = 240;

/** One letter for a single name; first + last initials when there are two+ words. */
function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() || "?";
  }
  const a = parts[0].charAt(0);
  const b = parts[parts.length - 1].charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

/**
 * Circular user avatar that opens a small menu: Settings / Sign out.
 * Caret popup on desktop / landscape; bottom sheet on phone portrait.
 */
export default function UserMenuAvatar({
  userName,
  onOpenSettings,
  onSignOut,
  onFeedback,
  isAdmin = false,
  previewStandardView = false,
  onTogglePreviewStandardView,
  size = 28,
}) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { isMobilePortrait } = useAppLayout();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({
    top: 48,
    left: 8,
    caretLeft: PANEL_WIDTH - 28,
  });
  const btnRef = useRef(null);

  const displayName = displayUserName(userName, "User");
  const initial = initialsFromName(displayName);
  const labelFontSize = initial.length > 1 ? Math.round(size * 0.38) : undefined;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [open]);

  const measureAndOpen = () => {
    if (isMobilePortrait) {
      setOpen(true);
      return;
    }
    const place = (x, y, w, h) => {
      const gap = 8;
      const caretSize = 10;
      const margin = 8;
      const top = Math.max(margin, y + h + gap);
      const preferredLeft = x + w - PANEL_WIDTH;
      const left = Math.max(
        margin,
        Math.min(preferredLeft, windowWidth - PANEL_WIDTH - margin),
      );
      const avatarCenterX = x + w / 2;
      const caretLeft = Math.max(
        14,
        Math.min(
          avatarCenterX - left - caretSize,
          PANEL_WIDTH - caretSize * 2 - 14,
        ),
      );
      setPanelPos({ top, left, caretLeft });
      setOpen(true);
    };
    const node = btnRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, w, h) => {
        place(x, y, w, h);
      });
      return;
    }
    place(windowWidth - 48, 8, 40, 40);
  };

  const panelFill = popupSurfaceColor(theme);
  const hoverBg = theme.dark
    ? colors.semantic.activeTintDark
    : colors.semantic.activeTintLight;

  const sheetActions = (
    <>
      <SheetAction
        title="Settings"
        onPress={() => {
          setOpen(false);
          onOpenSettings?.();
        }}
      />
      {typeof onFeedback === "function" ? (
        <SheetAction
          title="Feedback"
          onPress={() => {
            setOpen(false);
            onFeedback();
          }}
        />
      ) : null}
      {isAdmin && onTogglePreviewStandardView ? (
        <SheetAction
          title={
            previewStandardView
              ? "Exit standard user view"
              : "View as standard user"
          }
          onPress={() => {
            setOpen(false);
            onTogglePreviewStandardView();
          }}
        />
      ) : null}
      <SheetAction
        title="Sign out"
        destructive
        onPress={() => {
          setOpen(false);
          onSignOut?.();
        }}
      />
    </>
  );

  return (
    <View ref={btnRef} collapsable={false} style={styles.avatarWrap}>
      <Pressable
        onPress={measureAndOpen}
        accessibilityLabel="User menu"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.avatarPressable,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Avatar.Text
          size={size}
          label={initial}
          style={{
            backgroundColor: theme.colors.primaryContainer,
          }}
          labelStyle={{
            color: theme.colors.onPrimaryContainer,
            ...(labelFontSize ? { fontSize: labelFontSize } : null),
          }}
        />
      </Pressable>

      {isMobilePortrait ? (
        <AppSheet
          visible={open}
          onDismiss={() => setOpen(false)}
          title={displayName}
          subtitle="Signed in"
        >
          {sheetActions}
        </AppSheet>
      ) : (
        <Modal
          visible={open}
          transparent
          animationType="none"
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.scrim}
              onPress={() => setOpen(false)}
              accessibilityLabel="Dismiss"
            />
            <View
              style={[
                styles.panelAnchor,
                {
                  top: panelPos.top,
                  left: panelPos.left,
                  width: PANEL_WIDTH,
                  pointerEvents: "box-none",
                },
              ]}
            >
              <View
                style={[
                  styles.caret,
                  {
                    left: panelPos.caretLeft,
                    borderBottomColor: theme.colors.outlineVariant,
                  },
                ]}
              />
              <View
                style={[
                  styles.caretInner,
                  {
                    left: panelPos.caretLeft + 1,
                    borderBottomColor: panelFill,
                  },
                ]}
              />
              <View
                style={[
                  styles.menu,
                  {
                    backgroundColor: panelFill,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
              >
                <View
                  style={[
                    styles.userHeader,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                    },
                  ]}
                >
                  <Avatar.Text
                    size={36}
                    label={initial}
                    style={{
                      backgroundColor: theme.colors.primaryContainer,
                    }}
                    labelStyle={{
                      color: theme.colors.onPrimaryContainer,
                      ...(initial.length > 1 ? { fontSize: 14 } : null),
                    }}
                  />
                  <View style={styles.userHeaderText}>
                    <Text
                      style={[
                        styles.signedInLabel,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Signed in as
                    </Text>
                    <Text
                      style={[styles.userName, { color: theme.colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
                <Pressable
                  style={({ hovered, pressed }) => [
                    styles.item,
                    (hovered || pressed) && { backgroundColor: hoverBg },
                  ]}
                  onPress={() => {
                    setOpen(false);
                    onOpenSettings?.();
                  }}
                >
                  <Text
                    style={[styles.itemText, { color: theme.colors.onSurface }]}
                  >
                    Settings
                  </Text>
                </Pressable>
                {typeof onFeedback === "function" ? (
                  <Pressable
                    style={({ hovered, pressed }) => [
                      styles.item,
                      (hovered || pressed) && { backgroundColor: hoverBg },
                    ]}
                    onPress={() => {
                      setOpen(false);
                      onFeedback();
                    }}
                  >
                    <Text
                      style={[styles.itemText, { color: theme.colors.onSurface }]}
                    >
                      Feedback
                    </Text>
                  </Pressable>
                ) : null}
                {isAdmin && onTogglePreviewStandardView ? (
                  <Pressable
                    style={({ hovered, pressed }) => [
                      styles.item,
                      (hovered || pressed) && { backgroundColor: hoverBg },
                    ]}
                    onPress={() => {
                      setOpen(false);
                      onTogglePreviewStandardView();
                    }}
                  >
                    <Text
                      style={[styles.itemText, { color: theme.colors.onSurface }]}
                    >
                      {previewStandardView
                        ? "Exit standard user view"
                        : "View as standard user"}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ hovered, pressed }) => [
                    styles.item,
                    (hovered || pressed) && { backgroundColor: hoverBg },
                  ]}
                  onPress={() => {
                    setOpen(false);
                    onSignOut?.();
                  }}
                >
                  <Text
                    style={[styles.itemText, { color: theme.colors.onSurface }]}
                  >
                    Sign out
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPressable: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  panelAnchor: {
    position: "absolute",
  },
  caret: {
    position: "absolute",
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  caretInner: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  menu: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxSizing: "border-box",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }
      : {
          elevation: 6,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }),
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  userHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  signedInLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
  },
  item: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  itemText: {
    fontSize: 14,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
