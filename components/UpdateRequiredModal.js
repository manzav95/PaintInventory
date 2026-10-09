import React from "react";
import { Modal, View, StyleSheet, Platform, ScrollView } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import { reloadAppToLatest, markReleaseSeen } from "../utils/appVersion";
import { space, radius } from "../theme/tokens";

/**
 * Version popup.
 * Blocking when a newer production build is deployed (must refresh).
 * Dismissible after load so people see what changed in this version once.
 */
export default function UpdateRequiredModal({
  visible,
  build = 0,
  changes = [],
  blocking = true,
  onDismiss,
}) {
  const theme = useTheme();
  if (!visible) return null;

  const versionLabel = build > 0 ? `v1.${build}` : "the latest version";
  const notes = Array.isArray(changes) ? changes.filter(Boolean) : [];

  const handleRefresh = async () => {
    if (build > 0) await markReleaseSeen(build);
    reloadAppToLatest();
  };

  const handleDismiss = async () => {
    if (build > 0) await markReleaseSeen(build);
    if (typeof onDismiss === "function") onDismiss();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={blocking ? () => {} : handleDismiss}
    >
      <View style={styles.scrim}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {blocking ? "New updates available" : "What's new"}
          </Text>
          <Text style={[styles.version, { color: theme.colors.primary }]}>
            {versionLabel}
          </Text>
          {notes.length > 0 ? (
            <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
              {notes.map((line) => (
                <Text
                  key={line}
                  style={[styles.note, { color: theme.colors.onSurface }]}
                >
                  • {line}
                </Text>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
              Refresh to update to {versionLabel}.
            </Text>
          )}
          {blocking ? (
            <Text style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
              Refresh before you keep using the app.
            </Text>
          ) : null}
          {blocking ? (
            <AppButton mode="contained" icon="refresh" onPress={handleRefresh}>
              Refresh
            </AppButton>
          ) : (
            <AppButton mode="contained" onPress={handleDismiss}>
              Got it
            </AppButton>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: space[6] || 24,
    ...(Platform.OS === "web" ? { pointerEvents: "auto" } : null),
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radius.lg || 12,
    borderWidth: 1,
    padding: 22,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  version: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  notes: {
    maxHeight: 240,
  },
  notesContent: {
    gap: 8,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
  },
});
