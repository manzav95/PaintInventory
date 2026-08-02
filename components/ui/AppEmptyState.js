import React from "react";
import { View, StyleSheet } from "react-native";
import AppText from "./AppText";
import { space } from "../../theme/tokens";

/** Empty list / no-results block matching Inventory empty state. */
export default function AppEmptyState({ title, subtitle, style }) {
  return (
    <View style={[styles.wrap, style]}>
      <AppText variant="empty" tone="muted" style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="emptySub" tone="dim" style={styles.sub}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: space[10],
  },
  title: {
    marginBottom: space[2],
    textAlign: "center",
  },
  sub: {
    textAlign: "center",
  },
});
