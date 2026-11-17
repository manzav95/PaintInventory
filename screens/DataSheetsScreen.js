import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Text, useTheme } from "react-native-paper";
import PageHeader from "../components/PageHeader";
import SafetyDocsPanel from "../components/SafetyDocsPanel";
import ItemDocService from "../services/itemDocService";
import { SAFETY_DOC_TYPE_OPTIONS } from "../utils/materialTypes";
import { nestedSurfaceColor } from "../utils/themeColors";
import { space, radius } from "../theme/tokens";

const GRID_GAP = 8;
const MIN_BOX = 112;

function countLine(counts, type) {
  const row = counts?.[type] || {};
  const parts = ["pds", "sds", "tds"]
    .filter((k) => Number(row[k]) > 0)
    .map((k) => `${k.toUpperCase()} ${row[k]}`);
  return parts.length ? parts.join(" · ") : "None yet";
}

export default function DataSheetsScreen({
  isAdmin = false,
  embeddedInShell = false,
  onBack,
}) {
  const theme = useTheme();
  const [type, setType] = useState("paint");
  const [counts, setCounts] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [gridW, setGridW] = useState(0);

  const cols = Math.max(
    1,
    Math.floor((gridW + GRID_GAP) / (MIN_BOX + GRID_GAP)) || 1,
  );
  const boxW =
    gridW > 0 ? (gridW - GRID_GAP * (cols - 1)) / cols : MIN_BOX;

  const loadSummary = useCallback(async () => {
    try {
      const data = await ItemDocService.summary();
      setCounts(data.counts || {});
    } catch {
      setCounts({});
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <PageHeader
          title="Data sheets"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />
        <View
          style={styles.chipWrap}
          onLayout={(e) => {
            const next = Math.round(e.nativeEvent.layout.width);
            if (next && next !== gridW) setGridW(next);
          }}
        >
          {SAFETY_DOC_TYPE_OPTIONS.map((option) => {
            const active = type === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setType(option.value)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  {
                    width: boxW,
                    backgroundColor: active
                      ? theme.colors.primaryContainer
                      : nestedSurfaceColor(theme),
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.outlineVariant,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    {
                      color: active
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurface,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.chipMeta,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  {countLine(counts, option.value)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SafetyDocsPanel
          scope="type"
          itemType={type}
          isAdmin={isAdmin}
          hideTitle
          hideTypePicker
          kindCounts={counts[type]}
          onChanged={loadSummary}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: space[4],
    paddingBottom: 48,
    gap: space[3],
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    width: "100%",
    alignSelf: "stretch",
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 64,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  chipMeta: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
});
