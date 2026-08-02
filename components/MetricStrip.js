import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, useTheme } from "react-native-paper";
import BumpText from "./BumpText";
import { AppText } from "./ui";
import { space, layout, type } from "../theme/tokens";

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
            <AppText variant="label" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.label}
            </AppText>
            <BumpText
              value={item.value}
              bumpKey={`${item.id || item.label}:${item.value}`}
            >
              <AppText
                variant="metricValue"
                tone="inherit"
                style={[
                  styles.value,
                  { color: item.color || theme.colors.primary },
                ]}
              >
                {item.value}
              </AppText>
            </BumpText>
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
    gap: space[3],
    marginBottom: space[4],
  },
  cardWrap: {
    minWidth: layout.metricCardMinWidth,
    flex: 1,
    maxWidth: layout.metricCardMaxWidth,
  },
  card: {
    borderWidth: 1,
  },
  cardActive: {
    borderWidth: 2,
  },
  cardContent: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    minHeight: 72,
  },
  value: {
    ...type.metricValue,
    minHeight: type.metricValue.lineHeight,
  },
});
