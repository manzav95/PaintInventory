import React from "react";
import { Platform } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { type, fontFamily, colors } from "../../theme/tokens";

const VARIANTS = {
  pageTitle: type.pageTitle,
  pageTitleLg: type.pageTitleLg,
  sectionTitle: type.sectionTitle,
  itemName: type.itemName,
  body: type.body,
  bodyStrong: type.bodyStrong,
  bodyEmphasis: type.bodyEmphasis,
  quantity: type.quantity,
  metricValue: type.metricValue,
  analyticsValue: type.analyticsValue,
  label: type.label,
  badge: type.badge,
  mono: type.mono,
  caption: type.caption,
  empty: type.empty,
  emptySub: type.emptySub,
};

/**
 * Typed text from the Inventory kit type scale.
 * @param {'pageTitle'|'pageTitleLg'|'sectionTitle'|'itemName'|'body'|'bodyStrong'|'bodyEmphasis'|'quantity'|'metricValue'|'analyticsValue'|'label'|'badge'|'mono'|'caption'|'empty'|'emptySub'} variant
 * @param {'default'|'muted'|'dim'|'primary'|'accent'|'danger'|'inherit'} tone
 */
export default function AppText({
  variant = "body",
  tone = "default",
  children,
  style,
  ...rest
}) {
  const theme = useTheme();
  const base = VARIANTS[variant] || type.body;
  const isMono = variant === "mono";

  let color = theme.colors.onSurface;
  let weightBoost = null;
  if (tone === "muted") {
    color = theme.dark ? colors.dark.textMuted : colors.light.textMuted;
  } else if (tone === "dim") {
    color = theme.dark ? colors.dark.textDim : colors.light.textDim;
  } else if (tone === "primary") {
    color = theme.colors.primary;
  } else if (tone === "accent") {
    // Logo gold — always bold so it stays readable
    color = theme.dark ? colors.brand.accentBright : colors.brand.accent;
    weightBoost = "700";
  } else if (tone === "danger") {
    color = colors.semantic.lowStockText;
  } else if (tone === "inherit") {
    color = undefined;
  } else if (variant === "pageTitle" || variant === "pageTitleLg") {
    color = theme.colors.onBackground;
  } else if (variant === "label" || variant === "caption") {
    color = theme.colors.onSurfaceVariant;
  }

  return (
    <Text
      style={[
        base,
        {
          fontFamily: isMono ? fontFamily.mono : fontFamily.sans,
          ...(color ? { color } : null),
          ...(weightBoost ? { fontWeight: weightBoost } : null),
        },
        style,
      ]}
      {...(Platform.OS === "web" && isMono
        ? { dataSet: { mono: "true" } }
        : null)}
      {...rest}
    >
      {children}
    </Text>
  );
}
