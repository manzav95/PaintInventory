import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  Card,
  Text,
  Button,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import PageHeader from "../components/PageHeader";
import MetricStrip from "../components/MetricStrip";
import ToolbarCard from "../components/ToolbarCard";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import SimpleLineChart from "../components/SimpleLineChart";
import DateField from "../components/DateField";
import ReportService from "../services/reportService";
import CustomColorsReportModal from "../components/CustomColorsReportModal";
import MaterialUsageReportModal from "../components/MaterialUsageReportModal";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import {
  CUSTOM_COLORS_EARLIEST,
  clampCustomColorsFrom,
  resolveCustomColorsRange,
} from "../utils/reportBuckets";
import { itemMatchesSearch } from "../utils/reportSearch";
import {
  getMaterialTypeLabel,
  getMaterialTypeColor,
} from "../utils/materialTypes";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 84);
  const rolling = d.toISOString().slice(0, 10);
  return rolling < CUSTOM_COLORS_EARLIEST ? CUSTOM_COLORS_EARLIEST : rolling;
}

function groupByChartLabel(groupBy) {
  if (groupBy === "month") return "month";
  if (groupBy === "year") return "year";
  if (groupBy === "lifetime") return "lifetime";
  return "week";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function bucketAt(summary, index) {
  if (!summary || index == null || index < 0) return null;
  const details = summary.bucketDetails;
  if (Array.isArray(details) && details[index]) {
    const d = details[index];
    return {
      label: d.label,
      checkoutGallons: d.checkoutGallons,
      receivingGallons: d.receivingGallons,
      orderQuantity: d.orderQuantity,
      orderValue: d.orderValue,
    };
  }
  return {
    label: summary.buckets?.[index] || "—",
    checkoutGallons: summary.checkoutGallons?.[index] ?? 0,
    receivingGallons: summary.receivingGallons?.[index] ?? 0,
    orderQuantity: summary.orderQuantity?.[index] ?? 0,
    orderValue: summary.orderValue?.[index] ?? 0,
  };
}

function formatGal(n) {
  const v = Number(n) || 0;
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : String(Math.round(v * 10) / 10);
}

export default function ReportsScreen({ onBack, embeddedInShell = false }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isWide = isWeb && width >= DESKTOP_BREAKPOINT;

  const [groupBy, setGroupBy] = useState("week");
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(todayIso());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [customColorsOpen, setCustomColorsOpen] = useState(false);
  const [materialUsageOpen, setMaterialUsageOpen] = useState(false);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [itemActivity, setItemActivity] = useState([]);
  const [selectedSearchItemId, setSelectedSearchItemId] = useState(null);
  const [itemTimeline, setItemTimeline] = useState(null);
  const [itemTimelineLoading, setItemTimelineLoading] = useState(false);
  const [selectedItemBucketIndex, setSelectedItemBucketIndex] = useState(null);

  const selectGroupBy = (next) => {
    setGroupBy(next);
    if (next === "lifetime" || next === "year") {
      setFromDate(CUSTOM_COLORS_EARLIEST);
      setToDate(todayIso());
    } else {
      setFromDate(defaultFromDate());
      setToDate(todayIso());
    }
  };

  const handleFromDateChange = (value) => {
    setFromDate(clampCustomColorsFrom(value, groupBy));
  };

  const reportRange = useMemo(
    () => resolveCustomColorsRange(fromDate, toDate, groupBy),
    [fromDate, toDate, groupBy],
  );

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const range = resolveCustomColorsRange(fromDate, toDate, groupBy);
      const [data, items] = await Promise.all([
        ReportService.getSummary({
          from: range.from,
          to: range.to,
          groupBy,
        }),
        ReportService.getItemActivity({ from: range.from, to: range.to }),
      ]);
      setSummary(data);
      setItemActivity(Array.isArray(items) ? items : []);
    } catch (e) {
      setError(e?.message || "Failed to load reports");
      setSummary(null);
      setItemActivity([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, groupBy]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const len = summary?.buckets?.length || 0;
    if (len > 0) {
      setSelectedBucketIndex(len - 1);
    } else {
      setSelectedBucketIndex(null);
    }
  }, [summary, groupBy]);

  const periodStats = useMemo(() => {
    if (selectedBucketIndex != null) {
      const b = bucketAt(summary, selectedBucketIndex);
      if (b) return b;
    }
    return summary?.totals || {};
  }, [summary, selectedBucketIndex]);

  const periodLabel =
    selectedBucketIndex != null && summary?.buckets?.[selectedBucketIndex]
      ? summary.buckets[selectedBucketIndex]
      : "All periods";

  const metricItems = useMemo(
    () => [
      {
        id: "checkout",
        label: "Checked out (gal)",
        value: Math.round(periodStats.checkoutGallons || 0).toLocaleString(),
        color: theme.colors.primary,
      },
      {
        id: "receiving",
        label: "Received (gal)",
        value: Math.round(periodStats.receivingGallons || 0).toLocaleString(),
        color: "#64b5f6",
      },
      {
        id: "orderQty",
        label: "Ordered (qty)",
        value: Math.round(periodStats.orderQuantity || 0).toLocaleString(),
        color: "#81c784",
      },
      {
        id: "orderVal",
        label: "Est. order value",
        value: `$${Math.round(periodStats.orderValue || 0).toLocaleString()}`,
        color: "#ffb74d",
      },
    ],
    [periodStats, theme.colors.primary],
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return itemActivity
      .filter((item) => itemMatchesSearch(item, q))
      .slice(0, 50);
  }, [itemActivity, searchQuery]);

  useEffect(() => {
    setSelectedSearchItemId(null);
    setItemTimeline(null);
  }, [searchQuery]);

  useEffect(() => {
    if (searchResults.length === 1) {
      setSelectedSearchItemId(searchResults[0].itemId);
    }
  }, [searchResults]);

  useEffect(() => {
    if (!selectedSearchItemId) {
      setItemTimeline(null);
      setSelectedItemBucketIndex(null);
      return undefined;
    }
    let cancelled = false;
    setItemTimelineLoading(true);
    ReportService.getItemTimeline({
      itemId: selectedSearchItemId,
      from: reportRange.from,
      to: reportRange.to,
      groupBy,
    })
      .then((data) => {
        if (!cancelled) {
          setItemTimeline(data);
          const len = data?.buckets?.length || 0;
          setSelectedItemBucketIndex(len > 0 ? len - 1 : null);
        }
      })
      .catch(() => {
        if (!cancelled) setItemTimeline(null);
      })
      .finally(() => {
        if (!cancelled) setItemTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSearchItemId, reportRange.from, reportRange.to, groupBy]);

  const itemPeriodStats = useMemo(() => {
    if (!itemTimeline) return null;
    if (
      selectedItemBucketIndex != null &&
      selectedItemBucketIndex >= 0
    ) {
      return {
        label: itemTimeline.buckets?.[selectedItemBucketIndex] || "—",
        checkoutGallons:
          itemTimeline.checkoutGallons?.[selectedItemBucketIndex] ?? 0,
        receivingGallons:
          itemTimeline.receivingGallons?.[selectedItemBucketIndex] ?? 0,
        orderQuantity:
          itemTimeline.orderQuantity?.[selectedItemBucketIndex] ?? 0,
        usageGallons:
          itemTimeline.usageGallons?.[selectedItemBucketIndex] ?? 0,
      };
    }
    return { label: "All periods", ...(itemTimeline.totals || {}) };
  }, [itemTimeline, selectedItemBucketIndex]);

  const itemChartProps = {
    labels: itemTimeline?.buckets || [],
    interactive: true,
    selectedIndex: selectedItemBucketIndex,
    onPointSelect: setSelectedItemBucketIndex,
    height: isWide ? 200 : 180,
  };

  const chartLabels = summary?.buckets || [];
  const chartCardStyle = [
    styles.chartCard,
    isWide && styles.chartCardWide,
    {
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: theme.colors.outlineVariant,
    },
  ];

  const chartProps = {
    labels: chartLabels,
    interactive: true,
    selectedIndex: selectedBucketIndex,
    onPointSelect: setSelectedBucketIndex,
    height: isWide ? 240 : 220,
  };

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isWide && styles.scrollWide,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
      >
        <PageHeader
          title="Reports"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />

        <ToolbarCard>
          <View style={styles.toolbarRow}>
            <Button
              mode={groupBy === "week" ? "contained" : "outlined"}
              compact
              onPress={() => selectGroupBy("week")}
            >
              Week
            </Button>
            <Button
              mode={groupBy === "month" ? "contained" : "outlined"}
              compact
              onPress={() => selectGroupBy("month")}
            >
              Month
            </Button>
            <Button
              mode={groupBy === "year" ? "contained" : "outlined"}
              compact
              onPress={() => selectGroupBy("year")}
            >
              Year
            </Button>
            <Button
              mode={groupBy === "lifetime" ? "contained" : "outlined"}
              compact
              onPress={() => selectGroupBy("lifetime")}
            >
              Lifetime
            </Button>
          </View>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>From</Text>
              <DateField
                value={fromDate}
                onChange={handleFromDateChange}
                min={
                  groupBy === "year" || groupBy === "lifetime"
                    ? CUSTOM_COLORS_EARLIEST
                    : undefined
                }
                disabled={groupBy === "year" || groupBy === "lifetime"}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <DateField value={toDate} onChange={setToDate} />
            </View>
            <Button mode="outlined" onPress={() => load()} compact>
              Apply
            </Button>
          </View>
          <OutlinedSearchInput
            placeholder="Search by color name, ID, or external code…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.reportButtons}>
            <Button
              mode="contained"
              icon="palette"
              onPress={() => setCustomColorsOpen(true)}
              compact
            >
              Custom colors
            </Button>
            <Button
              mode="contained"
              icon="spray-bottle"
              onPress={() => setMaterialUsageOpen(true)}
              compact
            >
              Material usage
            </Button>
          </View>
        </ToolbarCard>

        <CustomColorsReportModal
          visible={customColorsOpen}
          onDismiss={() => setCustomColorsOpen(false)}
          initialFrom={fromDate}
          initialTo={toDate}
          initialGroupBy={groupBy}
        />

        <MaterialUsageReportModal
          visible={materialUsageOpen}
          onDismiss={() => setMaterialUsageOpen(false)}
          initialFrom={fromDate}
          initialTo={toDate}
          initialGroupBy={groupBy}
        />

        {loading && !summary ? (
          <ActivityIndicator style={styles.loader} />
        ) : error ? (
          <Text style={{ color: theme.colors.error }}>{error}</Text>
        ) : (
          <>
            {searchQuery.trim() ? (
              <Card
                style={[
                  styles.searchCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <Text
                    style={[
                      styles.searchTitle,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Color search · {reportRange.from} to {reportRange.to}
                  </Text>
                  {searchResults.length === 0 ? (
                    <Text
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      No items match "{searchQuery.trim()}".
                    </Text>
                  ) : (
                    searchResults.map((item, idx) => {
                      const typeLabel = getMaterialTypeLabel(item.type);
                      const typeColor = getMaterialTypeColor(item.type, theme);
                      const selected =
                        selectedSearchItemId === item.itemId;
                      return (
                        <Pressable
                          key={item.itemId}
                          onPress={() => setSelectedSearchItemId(item.itemId)}
                          style={({ pressed }) => [
                            styles.searchRow,
                            idx > 0 && {
                              borderTopWidth: 1,
                              borderTopColor: theme.colors.outlineVariant,
                            },
                            selected && {
                              backgroundColor: theme.colors.primaryContainer,
                            },
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <View style={styles.searchRowMain}>
                            <Text
                              style={[
                                styles.searchItemName,
                                { color: theme.colors.onSurface },
                              ]}
                              numberOfLines={1}
                            >
                              {item.name || item.itemId}
                            </Text>
                            <Text
                              style={[
                                styles.searchItemMeta,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                              numberOfLines={1}
                            >
                              {item.itemId}
                              {item.external_code
                                ? ` · ${item.external_code}`
                                : ""}
                              {typeLabel ? (
                                <Text style={{ color: typeColor }}>
                                  {" "}
                                  · {typeLabel}
                                </Text>
                              ) : null}
                            </Text>
                          </View>
                          <View style={styles.searchStats}>
                            <Text
                              style={[
                                styles.searchStat,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              Out {formatGal(item.checkoutGallons)} gal
                            </Text>
                            <Text
                              style={[
                                styles.searchStat,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              In {formatGal(item.receivingGallons)} gal
                            </Text>
                            <Text
                              style={[
                                styles.searchStat,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              Ord {formatGal(item.orderQuantity)} gal
                            </Text>
                            <Text
                              style={[
                                styles.searchStat,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              Use {formatGal(item.usageGallons)} gal
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                  {selectedSearchItemId && itemTimelineLoading ? (
                    <ActivityIndicator style={styles.itemTimelineLoader} />
                  ) : null}
                  {selectedSearchItemId && itemTimeline && !itemTimelineLoading ? (
                    <View style={styles.itemTimelineSection}>
                      <Text
                        style={[
                          styles.itemTimelineTitle,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {itemTimeline.name} · per {groupByChartLabel(groupBy)}
                      </Text>
                      {itemPeriodStats ? (
                        <Text
                          style={[
                            styles.itemTimelinePeriod,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {itemPeriodStats.label}: Out{" "}
                          {formatGal(itemPeriodStats.checkoutGallons)} gal · In{" "}
                          {formatGal(itemPeriodStats.receivingGallons)} gal · Ord{" "}
                          {formatGal(itemPeriodStats.orderQuantity)} gal · Use{" "}
                          {formatGal(itemPeriodStats.usageGallons)} gal
                        </Text>
                      ) : null}
                      <View
                        style={[
                          styles.chartGrid,
                          isWide && styles.chartGridWide,
                        ]}
                      >
                        <SimpleLineChart
                          title="Checked out (gal)"
                          data={itemTimeline.checkoutGallons || []}
                          color={theme.colors.primary}
                          {...itemChartProps}
                        />
                        <SimpleLineChart
                          title="Received (gal)"
                          data={itemTimeline.receivingGallons || []}
                          color="#64b5f6"
                          {...itemChartProps}
                        />
                        <SimpleLineChart
                          title="Ordered (qty)"
                          data={itemTimeline.orderQuantity || []}
                          color="#81c784"
                          {...itemChartProps}
                        />
                        <SimpleLineChart
                          title="Material usage (gal)"
                          data={itemTimeline.usageGallons || []}
                          color="#ba68c8"
                          {...itemChartProps}
                        />
                      </View>
                    </View>
                  ) : null}
                </Card.Content>
              </Card>
            ) : null}

            <Text
              style={[
                styles.periodBanner,
                { color: theme.colors.onSurface },
              ]}
            >
              Stats for: {periodLabel}
            </Text>
            <Text
              style={[
                styles.periodHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Tap any chart point to view that period's totals. Week, month,
              year, and lifetime groupings show different period values.
            </Text>
            <MetricStrip items={metricItems} />
            <Text
              style={[
                styles.estimateNote,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Order value is estimated from current item prices × line quantities.
            </Text>
            <View style={[styles.chartGrid, isWide && styles.chartGridWide]}>
              <Card style={chartCardStyle} mode="outlined">
                <Card.Content style={styles.chartCardContent}>
                  <SimpleLineChart
                    title="Gallons checked out"
                    data={summary?.checkoutGallons || []}
                    color={theme.colors.primary}
                    {...chartProps}
                  />
                </Card.Content>
              </Card>
              <Card style={chartCardStyle} mode="outlined">
                <Card.Content style={styles.chartCardContent}>
                  <SimpleLineChart
                    title="Gallons received"
                    data={summary?.receivingGallons || []}
                    color="#64b5f6"
                    {...chartProps}
                  />
                </Card.Content>
              </Card>
              <Card style={chartCardStyle} mode="outlined">
                <Card.Content style={styles.chartCardContent}>
                  <SimpleLineChart
                    title="Order quantity"
                    data={summary?.orderQuantity || []}
                    color="#81c784"
                    {...chartProps}
                  />
                </Card.Content>
              </Card>
              <Card style={chartCardStyle} mode="outlined">
                <Card.Content style={styles.chartCardContent}>
                  <SimpleLineChart
                    title="Est. order value ($)"
                    data={summary?.orderValue || []}
                    color="#ffb74d"
                    currency
                    {...chartProps}
                  />
                </Card.Content>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  scrollWide: { maxWidth: 1200, alignSelf: "center", width: "100%" },
  toolbarRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
  },
  reportButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dateField: { flex: 1, minWidth: 140 },
  dateLabel: { fontSize: 12, marginBottom: 4 },
  searchCard: {
    borderWidth: 1,
    marginBottom: 16,
  },
  searchTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
  },
  searchRowMain: {
    flex: 1,
    minWidth: 160,
  },
  searchItemName: {
    fontSize: 15,
    fontWeight: "600",
  },
  searchItemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  searchStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    maxWidth: "100%",
  },
  searchStat: {
    fontSize: 12,
    fontWeight: "500",
  },
  itemTimelineLoader: { marginTop: 16 },
  itemTimelineSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.25)",
  },
  itemTimelineTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  itemTimelinePeriod: {
    fontSize: 12,
    marginBottom: 12,
  },
  loader: { marginTop: 24 },
  periodBanner: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  periodHint: {
    fontSize: 12,
    marginBottom: 10,
  },
  estimateNote: { fontSize: 12, marginBottom: 12 },
  chartGrid: { gap: 12 },
  chartGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  chartCard: {
    borderWidth: 1,
    flex: 1,
    minWidth: 280,
  },
  chartCardWide: {
    minWidth: "48%",
    flexBasis: "48%",
  },
  chartCardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    flex: 1,
  },
});
