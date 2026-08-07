import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
} from "react-native";
import { Text, Avatar, useTheme } from "react-native-paper";
import { colors, space, radius } from "../theme/tokens";

/**
 * Circular user avatar that opens a small menu: Settings / Sign out.
 */
export default function UserMenuAvatar({
  userName,
  onOpenSettings,
  onSignOut,
  isAdmin = false,
  previewStandardView = false,
  onTogglePreviewStandardView,
  size = 28,
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const btnRef = useRef(null);

  const initial = (userName || "?").trim().charAt(0).toUpperCase() || "?";
  const displayName = (userName || "").trim() || "User";

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
    const node = btnRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, w, h) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  const menuTop = anchor.y + anchor.h + 6;
  const menuRight =
    Platform.OS === "web" && typeof window !== "undefined"
      ? Math.max(8, window.innerWidth - (anchor.x + anchor.w))
      : 12;

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
          labelStyle={{ color: theme.colors.onPrimaryContainer }}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              {
                top: menuTop,
                right: menuRight,
                backgroundColor: theme.dark
                  ? colors.dark.elevated
                  : theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
            onStartShouldSetResponder={() => true}
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
                labelStyle={{ color: theme.colors.onPrimaryContainer }}
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
                (hovered || pressed) && {
                  backgroundColor: theme.dark
                    ? colors.semantic.activeTintDark
                    : colors.semantic.activeTintLight,
                },
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
            {isAdmin && onTogglePreviewStandardView ? (
              <Pressable
                style={({ hovered, pressed }) => [
                  styles.item,
                  (hovered || pressed) && {
                    backgroundColor: theme.dark
                      ? colors.semantic.activeTintDark
                      : colors.semantic.activeTintLight,
                  },
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
                (hovered || pressed) && {
                  backgroundColor: theme.dark
                    ? colors.semantic.activeTintDark
                    : colors.semantic.activeTintLight,
                },
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
        </Pressable>
      </Modal>
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
  scrim: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 200,
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
