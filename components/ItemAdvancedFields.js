import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";
import {
  CATALYST_PERCENT_PAINT,
  CATALYST_PERCENT_CLEAR,
  defaultCatalystPercentForType,
} from "../utils/catalyst";

/**
 * Collapsible advanced item fields: custom unit label + catalyst %.
 */
export default function ItemAdvancedFields({
  visible,
  unitLabel,
  onUnitLabelChange,
  catalystPercent,
  onCatalystPercentChange,
  materialType,
  dense = false,
  style,
}) {
  const theme = useTheme();
  if (!visible) return null;
  const typeDefault = defaultCatalystPercentForType(materialType);
  const hintDefault =
    typeDefault != null
      ? `Type default: ${typeDefault}% (paint ${CATALYST_PERCENT_PAINT}%, clear/primer ${CATALYST_PERCENT_CLEAR}%)`
      : "This type does not use catalyst by default. Set a % here only if needed.";

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: theme.colors.outlineVariant,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>
        Advanced
      </Text>
      <Text
        style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
      >
        Optional. Leave blank to use normal gallons and type catalyst ratios.
      </Text>
      <TextInput
        label="Unit of measure"
        value={unitLabel}
        onChangeText={onUnitLabelChange}
        mode="outlined"
        dense={dense}
        style={styles.input}
        placeholder="e.g. gallons, drums, pails"
        autoCapitalize="none"
      />
      <TextInput
        label="Catalyst %"
        value={catalystPercent}
        onChangeText={onCatalystPercentChange}
        mode="outlined"
        dense={dense}
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder={
          typeDefault != null ? `Blank → ${typeDefault}%` : "Optional"
        }
        right={<TextInput.Affix text="%" />}
      />
      <Text
        style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
      >
        {hintDefault}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    marginBottom: 4,
  },
});
