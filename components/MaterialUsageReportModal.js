import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  Button,
  Card,
  useTheme,
  ActivityIndicator,
  IconButton,
} from "react-native-paper";
import DateField from "./DateField";
import SimpleLineChart from "./SimpleLineChart";
import ReportService from "../services/reportService";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 84);
  return d.toISOString().slice(0, 10);
}

const TYPE_META = [
  { key: "paint", label: "Paint", color: "#1565c0" },
  { key: "primer", label: "Primer", color: "#5d4037" },
  { key: "clear", label: "Clear", color: "#e65100" },
  { key: "stain", label: "Stain", color: "#2e7d32" },
];

function usageForBucket(summary, index) {
  if (!summary || index == null || index < 0) return null;
  const detail = summary.bucketDetails?.[index];
  if (detail) {
    return {
      label: detail.label,
      gallons: detail.materialUsageGallons || 0,
      byType: detail.materialUsageByType || {},
      count: detail.materialUsageCount || 0,
    };
  }
  return {
    label: summary.buckets?.[index] || "—",
    gallons: summary.materialUsageGallons?.[index] ?? 0,
    byType: {},
    count: summary.materialUsageCount?.[index] ?? 0,
  };
}

export default function MaterialUsageReportModal({
  visible,
  onDismiss,
  initialFrom,
  initialTo,
  initialGroupBy = "week",
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= DESKTOP_BREAKPOINT;

  const [groupBy, setGroupBy] = useState(initialGroupBy);
  const [fromDate, setFromDate] = useState(initialFrom || defaultFromDate());
  const [toDate, setToDate] = useState(initialTo || todayIso());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setFromDate(initialFrom || defaultFromDate());
    setToDate(initialTo || todayIso());
    setGroupBy(initialGroupBy || "week");
  }, [visible, initialFrom, initialTo, initialGroupBy]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ReportService.getSummary({
        from: fromDate,
        to: toDate,
        groupBy,
      });
      setReport(data);
    } catch (e) {
      setError(e?.message || "Failed to load material usage report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, groupBy]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  useEffect(() => {
    const len = report?.buckets?.length || 0;
    setSelectedBucketIndex(len > 0 ? len - 1 : null);
  }, [report, groupBy]);

  const periodUsage = useMemo(() => {
    if (selectedBucketIndex != null) {
      const b = usageForBucket(report, selectedBucketIndex);
      if (b) return b;
    }
    return {
      label: "All periods",
      gallons: report?.totals?.materialUsageGallons || 0,
      byType: report?.totals?.materialUsageByType || {},
      count: report?.totals?.materialUsageCount || 0,
    };
  }, [report, selectedBucketIndex]);

  const metricRow = useMemo(
    () => [
      {
        label: "Total (gal)",
        value: `${Math.round(periodUsage.gallons * 10) / 10}`,
        color: "#ce93d8",
      },
      ...TYPE_META.map((t) => ({
        label: t.label,
        value: `${periodUsage.byType?.[t.key] || 0}`,
        color: t.color,
      })),
    ],
    [periodUsage],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable
          style={[
            styles.sheet,
            isWide && styles.sheetWide,
            { backgroundColor: theme.colors.background },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              Material usage
            </Text>
            <IconButton icon="close" onPress={onDismiss} />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.toggleRow}>
              <Button
                mode={groupBy === "day" ? "contained" : "outlined"}
                compact
                onPress={() => setGroupBy("day")}
              >
                Day
              </Button>
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
                <Text
                  style={[
                    styles.dateLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  From
                </Text>
                <DateField value={fromDate} onChange={setFromDate} />
              </View>
              <View style={styles.dateField}>
                <Text
                  style={[
                    styles.dateLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  To
                </Text>
                <DateField value={toDate} onChange={setToDate} />
              </View>
              <Button mode="contained" onPress={load} compact loading={loading}>
                Apply
              </Button>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {loading && !report ? (
              <ActivityIndicator style={styles.loader} />
            ) : error ? (
              <Text style={{ color: theme.colors.error }}>{error}</Text>
            ) : !report ? (
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                No data for this range.
              </Text>
            ) : (
              <>
                <Text
                  style={[
                    styles.periodBanner,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {periodUsage.label}
                  {periodUsage.count > 0
                    ? ` · ${periodUsage.count} entries`
                    : ""}
                </Text>
                <Text
                  style={[
                    styles.hint,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Tap a chart point to view gallons by type for that period.
                </Text>

                <View style={[styles.metrics, isWide && styles.metricsWide]}>
                  {metricRow.map((m) => (
                    <View
                      key={m.label}
                      style={[
                        styles.metricCard,
                        {
                          backgroundColor: theme.colors.surfaceContainerHighest,
                          borderColor: theme.colors.outlineVariant,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.metricLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        {m.label}
                      </Text>
                      <Text
                        style={[styles.metricValue, { color: m.color }]}
                      >
                        {m.value} gal
                      </Text>
                    </View>
                  ))}
                </View>

                {(report.buckets || []).length > 0 && (
                  <Card
                    style={[
                      styles.card,
                      {
                        backgroundColor: theme.colors.surfaceContainerHighest,
                        borderColor: theme.colors.outlineVariant,
                      },
                    ]}
                    mode="outlined"
                  >
                    <Card.Content>
                      <SimpleLineChart
                        title={`Material usage per ${groupBy}`}
                        data={report.materialUsageGallons || []}
                        labels={report.buckets || []}
                        color="#ce93d8"
                        height={240}
                        interactive
                        selectedIndex={selectedBucketIndex}
                        onPointSelect={setSelectedBucketIndex}
                      />
                    </Card.Content>
                  </Card>
                )}

                <Card
                  style={[
                    styles.card,
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
                        styles.sectionTitle,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      By type — {periodUsage.label}
                    </Text>
                    {TYPE_META.map((t) => (
                      <View key={t.key} style={styles.typeRow}>
                        <Text
                          style={[styles.typeLabel, { color: t.color }]}
                        >
                          {t.label}
                        </Text>
                        <Text
                          style={[
                            styles.typeValue,
                            { color: theme.colors.onSurface },
                          ]}
                        >
                          {periodUsage.byType?.[t.key] || 0} gal
                        </Text>
                      </View>
                    ))}
                  </Card.Content>
                </Card>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    maxHeight: "92%",
    borderRadius: 12,
    overflow: "hidden",
  },
  sheetWide: {
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 4,
    paddingTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
  toolbar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  dateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 12,
  },
  dateField: { flex: 1, minWidth: 130 },
  dateLabel: { fontSize: 12, marginBottom: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 0, paddingBottom: 32 },
  loader: { marginTop: 24 },
  periodBanner: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    marginBottom: 12,
  },
  metrics: { gap: 8, marginBottom: 12 },
  metricsWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minWidth: 120,
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  card: {
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  typeLabel: { fontSize: 15, fontWeight: "600" },
  typeValue: { fontSize: 15, fontWeight: "700" },
});
