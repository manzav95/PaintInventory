import React from "react";
import { Modal, View, StyleSheet, Platform } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import { reloadAppToLatest } from "../utils/appVersion";
import { space, radius } from "../theme/tokens";

/**
 * Blocking prompt when the running client is behind the deployed app build.
 * Cannot be dismissed except by reloading the page.
 */
export default function UpdateRequiredModal({ visible }) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {}}
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
            New updates available
          </Text>
          <Text
            style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
          >
            Refresh to update to the latest version. You need to refresh before
            you can keep using the app.
          </Text>
          <AppButton
            mode="contained"
            icon="refresh"
            onPress={reloadAppToLatest}
          >
            Refresh
          </AppButton>
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
    maxWidth: 400,
    borderRadius: radius.lg || 12,
    borderWidth: 1,
    padding: 22,
    gap: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
