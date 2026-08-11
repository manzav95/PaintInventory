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
    bg: "rgba(15, 22, 36, 0.08)",
    border: "rgba(15, 22, 36, 0.28)",
    text: colors.brand.navy,
  },
  success: {
    bg: "rgba(46, 125, 50, 0.12)",
    border: "rgba(46, 125, 50, 0.35)",
    text: colors.semantic.success,
  },
  info: {
    bg: "rgba(15, 22, 36, 0.08)",
    border: "rgba(15, 22, 36, 0.28)",
    text: colors.brand.navy,
  },
  /** Soft gold chip — gold label is bold for readability */
  accent: {
    bg: colors.brand.accentSoft,
    border: "rgba(201, 151, 46, 0.4)",
    text: colors.brand.accentBright,
    bold: true,
  },
};

/**
 * Compact status chip from Inventory badge patterns.
 * @param {'default'|'late'|'backOrder'|'danger'|'warning'|'primary'|'success'|'info'|'accent'} tone
 */
export default function AppBadge({ children, tone = "default", style, textStyle }) {
  const theme = useTheme();
  const t = TONES[tone] || TONES.default;
  const textColor =
    t.text || (theme.dark ? colors.dark.onSecondaryContainer : theme.colors.onSurface);
  const toneText =
    tone === "accent"
      ? theme.dark
        ? colors.brand.accentBright
        : colors.brand.accent
      : tone === "primary" || tone === "info"
        ? theme.dark
          ? colors.brand.primaryOnDark
          : colors.brand.navy
        : textColor;
  const toneBg =
    tone === "primary" || tone === "info"
      ? theme.dark
        ? "rgba(255, 255, 255, 0.12)"
        : t.bg
      : t.bg;
  const toneBorder =
    tone === "primary" || tone === "info"
      ? theme.dark
        ? "rgba(255, 255, 255, 0.28)"
        : t.border
      : t.border;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: toneBg, borderColor: toneBorder },
        style,
      ]}
    >
      <AppText
        variant="badge"
        tone="inherit"
        style={[
          { color: toneText },
          t.bold ? { fontWeight: "700" } : null,
          textStyle,
        ]}
      >
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
