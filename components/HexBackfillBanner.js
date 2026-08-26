import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Text, ProgressBar, IconButton, useTheme } from "react-native-paper";
import { space } from "../theme/tokens";

/**
 * Top-of-app progress strip for the admin "fill missing hex" background job.
 */
export default function HexBackfillBanner({ job, onDismiss }) {
  const theme = useTheme();
  if (!job) return null;

  const total = Math.max(1, Number(job.total) || 1);
  const done = Math.min(total, Number(job.done) || 0);
  const progress = done / total;
  const running = job.status === "running";
  const failed = job.status === "error";

  const title = running
    ? `Looking up hex colors… ${done}/${total}`
    : failed
      ? "Hex lookup stopped"
      : `Hex lookup complete · ${job.updated || 0} updated`;

  const detail = running
    ? job.current
      ? `Searching: ${job.current}`
      : "You can keep using the app."
    : failed
      ? job.message || "Something went wrong."
      : `${job.failed || 0} not found · ${job.skipped || 0} skipped`;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.primaryContainer,
          borderBottomColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text
            style={[styles.title, { color: theme.colors.onPrimaryContainer }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.detail,
              { color: theme.colors.onPrimaryContainer },
            ]}
            numberOfLines={1}
          >
            {detail}
          </Text>
        </View>
        {!running ? (
          <IconButton
            icon="close"
            size={18}
            onPress={onDismiss}
            iconColor={theme.colors.onPrimaryContainer}
            accessibilityLabel="Dismiss"
            style={styles.close}
          />
        ) : null}
      </View>
      {running ? (
        <ProgressBar
          progress={progress}
          color={theme.colors.primary}
          style={styles.bar}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
  },
  detail: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.9,
  },
  close: {
    margin: 0,
  },
  bar: {
    marginTop: 8,
    height: 4,
    borderRadius: 2,
  },
});
