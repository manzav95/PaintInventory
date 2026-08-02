import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import AppText from "./AppText";
import { colors, radius, space } from "../../theme/tokens";

const TONES = {
  default: {
    bg: colors.semantic.badgeBg,
    border: colors.semantic.badgeBorder,
    text: undefined,
  },
  late: {
    bg: colors.semantic.lateBadgeBg,
    border: colors.semantic.lateBadgeBorder,
    text: colors.semantic.recycleDueDate,
  },
  backOrder: {
    bg: colors.semantic.backOrderBadgeBg,
    border: colors.semantic.backOrderBadgeBorder,
    text: colors.semantic.lowStockValue,
  },
  danger: {
    bg: "rgba(244, 67, 54, 0.12)",
    border: "rgba(244, 67, 54, 0.35)",
    text: colors.semantic.outOfStockValue,
  },
  warning: {
    bg: colors.semantic.recycleBannerBg,
    border: "rgba(255, 152, 0, 0.35)",
    text: colors.semantic.recycleBannerText,
  },
  primary: {
    bg: "rgba(111, 149, 171, 0.15)",
    border: "rgba(111, 149, 171, 0.4)",
    text: colors.brand.primary,
  },
  success: {
    bg: "rgba(46, 125, 50, 0.12)",
    border: "rgba(46, 125, 50, 0.35)",
    text: colors.semantic.success,
  },
  info: {
    bg: "rgba(25, 118, 210, 0.12)",
    border: "rgba(25, 118, 210, 0.35)",
    text: colors.semantic.info,
  },
};

/**
 * Compact status chip from Inventory badge patterns.
 * @param {'default'|'late'|'backOrder'|'danger'|'warning'|'primary'|'success'|'info'} tone
 */
export default function AppBadge({ children, tone = "default", style, textStyle }) {
  const theme = useTheme();
  const t = TONES[tone] || TONES.default;
  const textColor =
    t.text || (theme.dark ? colors.dark.onSecondaryContainer : theme.colors.onSurface);

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <AppText variant="badge" tone="inherit" style={[{ color: textColor }, textStyle]}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
