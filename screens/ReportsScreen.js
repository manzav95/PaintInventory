import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
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
import SimpleLineChart from "../components/SimpleLineChart";
import DateField from "../components/DateField";
import ReportService from "../services/reportService";
import CustomColorsReportModal from "../components/CustomColorsReportModal";
import MaterialUsageReportModal from "../components/MaterialUsageReportModal";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 84);
  return d.toISOString().slice(0, 10);
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

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await ReportService.getSummary({
        from: fromDate,
        to: toDate,
        groupBy,
      });
      setSummary(data);
    } catch (e) {
      setError(e?.message || "Failed to load reports");
      setSummary(null);
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
              onPress={() => setGroupBy("week")}
            >
              Week
            </Button>
            <Button
              mode={groupBy === "month" ? "contained" : "outlined"}
              compact
              onPress={() => setGroupBy("month")}
            >
              Month
            </Button>
          </View>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>From</Text>
              <DateField value={fromDate} onChange={setFromDate} />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <DateField value={toDate} onChange={setToDate} />
            </View>
            <Button mode="outlined" onPress={() => load()} compact>
              Apply
            </Button>
          </View>
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
              Tap any chart point to view that period's totals. Week and month
              groupings show different period values.
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
