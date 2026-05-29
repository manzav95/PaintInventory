import React from "react";
import { View, StyleSheet } from "react-native";
import { Card, useTheme } from "react-native-paper";

export default function ToolbarCard({ children, style, contentStyle }) {
  const theme = useTheme();

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: theme.colors.outlineVariant,
        },
        style,
      ]}
      mode="outlined"
    >
      <Card.Content style={[styles.content, contentStyle]}>
        {children}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderWidth: 1,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
});
