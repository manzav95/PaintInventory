import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, useTheme } from "react-native-paper";
import BumpText from "./BumpText";
import { AppText } from "./ui";
import { space, layout, type, radius } from "../theme/tokens";

/**
 * @param {Array<{ id?: string, label: string, value: string|number, color?: string, onPress?: () => void, active?: boolean }>} items
 */
export default function MetricStrip({ items = [], style }) {
  const theme = useTheme();

  if (!items.length) return null;

  return (
    <View style={[styles.row, style]}>
      {items.map((item, index) => {
        const accent = item.color || theme.colors.primary;
        const content = (
          <Card.Content style={styles.cardContent}>
            <AppText
              variant="label"
              style={{
                color: item.active
                  ? accent
                  : theme.colors.onSurfaceVariant,
                fontWeight: item.active ? "700" : undefined,
              }}
            >
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
                  { color: accent },
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
            backgroundColor: item.active
              ? theme.dark
                ? `${accent}22`
                : `${accent}14`
              : theme.colors.surfaceContainerHighest,
            borderColor: item.active ? accent : theme.colors.outlineVariant,
          },
          item.active && styles.cardActive,
        ];

        const underline = item.active ? (
          <View style={[styles.activeUnderline, { backgroundColor: accent }]} />
        ) : null;

        if (item.onPress) {
          return (
            <Pressable
              key={item.id || item.label || index}
              style={styles.cardWrap}
              onPress={item.onPress}
            >
              <Card style={cardStyle} mode="outlined">
                {content}
                {underline}
              </Card>
            </Pressable>
          );
        }

        return (
          <View key={item.id || item.label || index} style={styles.cardWrap}>
            <Card style={cardStyle} mode="outlined">
              {content}
              {underline}
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
    overflow: "hidden",
    borderRadius: radius.md,
  },
  cardActive: {
    borderWidth: 2,
  },
  activeUnderline: {
    height: 3,
    width: "100%",
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
