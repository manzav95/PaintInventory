import React from "react";
import { StyleSheet } from "react-native";
import { Card, useTheme } from "react-native-paper";
import { space, radius, elevation } from "../../theme/tokens";

/**
 * Outlined elevated surface — same chrome as Inventory table / ToolbarCard.
 * @param {'flat'|'raised'} elevationLevel
 */
export default function AppSurface({
  children,
  style,
  contentStyle,
  elevationLevel = "flat",
  mode = "outlined",
  ...rest
}) {
  const theme = useTheme();

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: theme.colors.outlineVariant,
          elevation: elevationLevel === "raised" ? elevation.card : 0,
          borderRadius: radius.lg,
        },
        style,
      ]}
      mode={mode}
      {...rest}
    >
      {children != null ? (
        <Card.Content style={[styles.content, contentStyle]}>{children}</Card.Content>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    marginBottom: space[4],
  },
  content: {
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    gap: space[3],
  },
});
