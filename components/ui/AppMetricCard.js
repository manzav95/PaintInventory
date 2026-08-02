import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTheme } from "react-native-paper";
import AppText from "./AppText";
import AppSurface from "./AppSurface";
import { space, radius, layout, colors } from "../../theme/tokens";

/**
 * Compact metric / analytics tile from Inventory MetricStrip + analytics cards.
 * @param {{ label: string, value: string|number, unit?: string, subtext?: string, color?: string, onPress?: () => void, active?: boolean }} props
 */
export default function AppMetricCard({
  label,
  value,
  unit,
  subtext,
  color,
  onPress,
  active = false,
  style,
  compact = false,
}) {
  const theme = useTheme();
  const valueColor = color || theme.colors.primary;

  const inner = (
    <AppSurface
      elevationLevel="raised"
      style={[
        styles.card,
        compact && styles.cardCompact,
        active && {
          borderWidth: 2,
          borderColor: theme.colors.primary,
          backgroundColor: colors.semantic.filterActive,
        },
        style,
      ]}
      contentStyle={[styles.content, compact && styles.contentCompact]}
    >
      <AppText variant="label" tone="muted" style={compact && styles.labelCompact}>
        {label}
      </AppText>
      <AppText
        variant={compact ? "quantity" : "analyticsValue"}
        tone="inherit"
        style={{ color: valueColor }}
      >
        {value}
        {unit ? (
          <AppText variant="body" tone="muted">
            {" "}
            {unit}
          </AppText>
        ) : null}
      </AppText>
      {subtext ? (
        <AppText variant="caption" tone="dim" style={styles.sub}>
          {subtext}
        </AppText>
      ) : null}
    </AppSurface>
  );

  if (onPress) {
    return (
      <Pressable style={styles.wrap} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }

  return <View style={styles.wrap}>{inner}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: layout.metricCardMinWidth,
    flex: 1,
    maxWidth: layout.metricCardMaxWidth,
  },
  card: {
    marginBottom: 0,
    borderRadius: radius.lg,
  },
  cardCompact: {
    maxWidth: 120,
    minWidth: 72,
  },
  content: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    minHeight: 72,
    gap: 0,
  },
  contentCompact: {
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    minHeight: undefined,
  },
  labelCompact: {
    fontSize: 10,
    letterSpacing: 0.3,
    marginBottom: 0,
  },
  sub: {
    marginTop: 2,
  },
});
