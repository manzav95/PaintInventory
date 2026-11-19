import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet from "./ui/AppSheet";
import { reloadAppToLatest, markReleaseSeen } from "../utils/appVersion";
import { space, type } from "../theme/tokens";

/**
 * Version popup as a bottom sheet.
 * Blocking when a newer production build is deployed (must refresh).
 */
export default function UpdateRequiredModal({
  visible,
  build = 0,
  changes = [],
  blocking = true,
  onDismiss,
}) {
  const theme = useTheme();
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
    <AppSheet
      visible={!!visible}
      dismissable={!blocking}
      onDismiss={blocking ? undefined : handleDismiss}
      title={blocking ? "New updates available" : "What's new"}
      subtitle={versionLabel}
      footer={
        blocking ? (
          <AppButton mode="contained" icon="refresh" onPress={handleRefresh}>
            Refresh
          </AppButton>
        ) : (
          <AppButton mode="contained" onPress={handleDismiss}>
            Got it
          </AppButton>
        )
      }
    >
      {notes.length > 0 ? (
        <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
          {notes.map((line) => (
            <Text key={line} style={[styles.note, { color: theme.colors.onSurface }]}>
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
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    ...type.body,
    marginTop: space[2],
  },
  notes: {
    maxHeight: 240,
  },
  notesContent: {
    gap: 8,
  },
  note: {
    ...type.body,
  },
});
