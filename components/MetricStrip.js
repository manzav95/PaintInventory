import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Title, useTheme } from "react-native-paper";

/**
 * @param {Array<{ id?: string, label: string, value: string|number, color?: string, onPress?: () => void, active?: boolean }>} items
 */
export default function MetricStrip({ items = [], style }) {
  const theme = useTheme();

  if (!items.length) return null;

  return (
    <View style={[styles.row, style]}>
      {items.map((item, index) => {
        const content = (
          <Card.Content style={styles.cardContent}>
            <Text
              style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
            >
              {item.label}
            </Text>
            <Title
              style={[
                styles.value,
                { color: item.color || theme.colors.primary },
              ]}
            >
              {item.value}
            </Title>
          </Card.Content>
        );

        const cardStyle = [
          styles.card,
          {
            backgroundColor: theme.colors.surfaceContainerHighest,
            borderColor: item.active
              ? theme.colors.primary
              : theme.colors.outlineVariant,
          },
          item.active && styles.cardActive,
        ];

        if (item.onPress) {
          return (
            <Pressable
              key={item.id || item.label || index}
              style={styles.cardWrap}
              onPress={item.onPress}
            >
              <Card style={cardStyle} mode="outlined">
                {content}
              </Card>
            </Pressable>
          );
        }

        return (
          <View key={item.id || item.label || index} style={styles.cardWrap}>
            <Card style={cardStyle} mode="outlined">
              {content}
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  cardWrap: {
    minWidth: 120,
    flex: 1,
    maxWidth: 220,
  },
  card: {
    borderWidth: 1,
  },
  cardActive: {
    borderWidth: 2,
  },
  cardContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    lineHeight: 28,
  },
});
