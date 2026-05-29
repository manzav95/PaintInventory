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
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 84);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

  const totals = summary?.totals || {};
  const metricItems = useMemo(
    () => [
      {
        id: "checkout",
        label: "Checked out (gal)",
        value: Math.round(totals.checkoutGallons || 0).toLocaleString(),
        color: theme.colors.primary,
      },
      {
        id: "receiving",
        label: "Received (gal)",
        value: Math.round(totals.receivingGallons || 0).toLocaleString(),
        color: "#64b5f6",
      },
      {
        id: "orderQty",
        label: "Ordered (qty)",
        value: Math.round(totals.orderQuantity || 0).toLocaleString(),
        color: "#81c784",
      },
      {
        id: "orderVal",
        label: "Est. order value",
        value: `$${Math.round(totals.orderValue || 0).toLocaleString()}`,
        color: "#ffb74d",
      },
      {
        id: "usage",
        label: "Material usage (gal)",
        value: Math.round(totals.materialUsageGallons || 0).toLocaleString(),
        color: "#ce93d8",
      },
    ],
    [totals, theme.colors.primary],
  );

  const chartLabels = summary?.buckets || [];

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
        </ToolbarCard>

        {loading && !summary ? (
          <ActivityIndicator style={styles.loader} />
        ) : error ? (
          <Text style={{ color: theme.colors.error }}>{error}</Text>
        ) : (
          <>
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
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <SimpleLineChart
                    title="Gallons checked out"
                    data={summary?.checkoutGallons || []}
                    labels={chartLabels}
                    color={theme.colors.primary}
                  />
                </Card.Content>
              </Card>
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <SimpleLineChart
                    title="Gallons received"
                    data={summary?.receivingGallons || []}
                    labels={chartLabels}
                    color="#64b5f6"
                  />
                </Card.Content>
              </Card>
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <SimpleLineChart
                    title="Order quantity"
                    data={summary?.orderQuantity || []}
                    labels={chartLabels}
                    color="#81c784"
                  />
                </Card.Content>
              </Card>
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <SimpleLineChart
                    title="Est. order value ($)"
                    data={summary?.orderValue || []}
                    labels={chartLabels}
                    color="#ffb74d"
                  />
                </Card.Content>
              </Card>
              <Card
                style={[
                  styles.chartCard,
                  isWide && styles.chartCardWide,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content>
                  <SimpleLineChart
                    title="Material usage (gallons)"
                    data={summary?.materialUsageGallons || []}
                    labels={chartLabels}
                    color="#ce93d8"
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
  dateField: { flex: 1, minWidth: 140 },
  dateLabel: { fontSize: 12, marginBottom: 4 },
  loader: { marginTop: 24 },
  estimateNote: { fontSize: 12, marginBottom: 12 },
  chartGrid: { gap: 12 },
  chartGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chartCard: {
    borderWidth: 1,
    flex: 1,
    minWidth: 280,
  },
  chartCardWide: { minWidth: "48%" },
});
