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
  Divider,
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

function typeLabel(type) {
  const t = String(type || "").toLowerCase();
  if (t === "custom_stain") return "Custom stain";
  return "Custom paint";
}

export default function CustomColorsReportModal({
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
      const data = await ReportService.getCustomColorsOverview({
        from: fromDate,
        to: toDate,
        groupBy,
      });
      setReport(data);
    } catch (e) {
      setError(e?.message || "Failed to load custom colors report");
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

  const selectedBucket = useMemo(() => {
    if (selectedBucketIndex == null || !report?.bucketDetails) return null;
    return report.bucketDetails[selectedBucketIndex] || null;
  }, [report, selectedBucketIndex]);

  const periodLabel =
    selectedBucket?.label ||
    (selectedBucketIndex != null && report?.buckets?.[selectedBucketIndex]) ||
    "All periods";

  const periodTotals = useMemo(() => {
    if (selectedBucket) {
      return {
        totalQuantity: selectedBucket.totalQuantity || 0,
        colorCount: (selectedBucket.colors || []).length,
        jobCount: (selectedBucket.jobs || []).length,
      };
    }
    return report?.totals || {};
  }, [selectedBucket, report?.totals]);

  const metricRow = useMemo(
    () => [
      {
        label: "Ordered (gal)",
        value: `${periodTotals.totalQuantity || 0} gal`,
      },
      {
        label: "Colors",
        value: String(
          periodTotals.colorCount ?? report?.totals?.colorCount ?? 0,
        ),
      },
      {
        label: "Jobs",
        value: String(periodTotals.jobCount ?? report?.totals?.jobCount ?? 0),
      },
      {
        label: "Period",
        value: periodLabel.length > 18 ? `${periodLabel.slice(0, 16)}…` : periodLabel,
      },
    ],
    [periodTotals, periodLabel, report?.totals],
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
              Custom colors overview
            </Text>
            <IconButton icon="close" onPress={onDismiss} />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.toggleRow}>
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
                <Text style={[styles.dateLabel, { color: theme.colors.onSurfaceVariant }]}>
                  From
                </Text>
                <DateField value={fromDate} onChange={setFromDate} />
              </View>
              <View style={styles.dateField}>
                <Text style={[styles.dateLabel, { color: theme.colors.onSurfaceVariant }]}>
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
                        style={[
                          styles.metricValue,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {m.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {(report.buckets || []).length > 0 && (
                  <>
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
                            styles.periodBanner,
                            { color: theme.colors.onSurface },
                          ]}
                        >
                          {periodLabel}
                        </Text>
                        <SimpleLineChart
                          title={`Custom colors ordered per ${groupBy}`}
                          data={report.bucketTotals || []}
                          labels={report.buckets || []}
                          color="#7e57c2"
                          height={240}
                          interactive
                          selectedIndex={selectedBucketIndex}
                          onPointSelect={setSelectedBucketIndex}
                        />
                      </Card.Content>
                    </Card>

                    {selectedBucket && (
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
                            Jobs for {selectedBucket.label}
                          </Text>
                          {(selectedBucket.jobs || []).length === 0 ? (
                            <Text style={{ color: theme.colors.onSurfaceVariant }}>
                              No jobs in this period.
                            </Text>
                          ) : (
                            selectedBucket.jobs.map((job, idx) => (
                              <View key={job.jobName}>
                                {idx > 0 && <Divider style={styles.divider} />}
                                <View style={styles.jobHeader}>
                                  <Text
                                    style={[
                                      styles.jobName,
                                      { color: theme.colors.onSurface },
                                    ]}
                                  >
                                    {job.jobName}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.jobTotal,
                                      { color: theme.colors.primary },
                                    ]}
                                  >
                                    {job.quantity} gal
                                  </Text>
                                </View>
                              </View>
                            ))
                          )}
                          <Divider style={styles.divider} />
                          <Text
                            style={[
                              styles.sectionTitle,
                              { color: theme.colors.onSurface, marginTop: 4 },
                            ]}
                          >
                            Colors in this period
                          </Text>
                          {(selectedBucket.colors || []).map((c) => (
                            <View
                              key={`${selectedBucket.label}-${c.itemId}`}
                              style={styles.subRow}
                            >
                              <Text
                                style={[
                                  styles.subName,
                                  { color: theme.colors.onSurface },
                                ]}
                                numberOfLines={1}
                              >
                                {c.itemName}
                              </Text>
                              <Text
                                style={[
                                  styles.subMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {c.quantity} gal
                              </Text>
                            </View>
                          ))}
                        </Card.Content>
                      </Card>
                    )}
                  </>
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
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      By job
                    </Text>
                    {(report.byJob || []).length === 0 ? (
                      <Text style={{ color: theme.colors.onSurfaceVariant }}>
                        No custom color orders in this range.
                      </Text>
                    ) : (
                      report.byJob.map((job, idx) => (
                        <View key={job.jobName}>
                          {idx > 0 && <Divider style={styles.divider} />}
                          <View style={styles.jobHeader}>
                            <Text
                              style={[styles.jobName, { color: theme.colors.onSurface }]}
                            >
                              {job.jobName}
                            </Text>
                            <Text
                              style={[
                                styles.jobTotal,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {job.totalQuantity} gal
                            </Text>
                          </View>
                          {(job.colors || []).map((c) => (
                            <View key={`${job.jobName}-${c.itemId}`} style={styles.subRow}>
                              <Text
                                style={[
                                  styles.subName,
                                  { color: theme.colors.onSurface },
                                ]}
                                numberOfLines={1}
                              >
                                {c.itemName}
                              </Text>
                              <Text
                                style={[
                                  styles.subMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {typeLabel(c.type)} · {c.quantity} gal
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </Card.Content>
                </Card>

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
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      By custom color
                    </Text>
                    {(report.byColor || []).length === 0 ? (
                      <Text style={{ color: theme.colors.onSurfaceVariant }}>
                        No custom colors in this range.
                      </Text>
                    ) : (
                      report.byColor.map((color, idx) => (
                        <View key={color.itemId}>
                          {idx > 0 && <Divider style={styles.divider} />}
                          <View style={styles.jobHeader}>
                            <View style={styles.colorTitleWrap}>
                              <Text
                                style={[styles.jobName, { color: theme.colors.onSurface }]}
                                numberOfLines={1}
                              >
                                {color.itemName}
                              </Text>
                              <Text
                                style={[
                                  styles.subMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {color.itemId} · {typeLabel(color.type)}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.jobTotal,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {color.totalQuantity} gal
                            </Text>
                          </View>
                          {(color.jobs || []).map((j) => (
                            <View key={`${color.itemId}-${j.jobName}`} style={styles.subRow}>
                              <Text
                                style={[
                                  styles.subName,
                                  { color: theme.colors.onSurface },
                                ]}
                              >
                                {j.jobName}
                              </Text>
                              <Text
                                style={[
                                  styles.subMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {j.quantity} gal
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </Card.Content>
                </Card>

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
                    <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                      Per {groupBy}
                    </Text>
                    {(report.bucketDetails || []).length === 0 ? (
                      <Text style={{ color: theme.colors.onSurfaceVariant }}>
                        No orders in this range.
                      </Text>
                    ) : (
                      report.bucketDetails.map((bucket, idx) => (
                        <View key={bucket.label}>
                          {idx > 0 && <Divider style={styles.divider} />}
                          <View style={styles.jobHeader}>
                            <Text
                              style={[styles.jobName, { color: theme.colors.onSurface }]}
                            >
                              {bucket.label}
                            </Text>
                            <Text
                              style={[
                                styles.jobTotal,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {bucket.totalQuantity} gal
                            </Text>
                          </View>
                          {(bucket.colors || []).map((c) => (
                            <View key={`${bucket.label}-${c.itemId}`} style={styles.subRow}>
                              <Text
                                style={[
                                  styles.subName,
                                  { color: theme.colors.onSurface },
                                ]}
                                numberOfLines={1}
                              >
                                {c.itemName}
                              </Text>
                              <Text
                                style={[
                                  styles.subMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {c.quantity} gal
                              </Text>
                            </View>
                          ))}
                        </View>
                      ))
                    )}
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
  metrics: { gap: 8, marginBottom: 12 },
  metricsWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minWidth: 140,
    flex: 1,
  },
  metricLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  metricValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  periodBanner: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  divider: { marginVertical: 10 },
  jobHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  jobName: { fontSize: 15, fontWeight: "600", flex: 1 },
  jobTotal: { fontSize: 15, fontWeight: "700" },
  colorTitleWrap: { flex: 1 },
  subRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 12,
    paddingTop: 6,
    gap: 8,
  },
  subName: { fontSize: 13, flex: 1 },
  subMeta: { fontSize: 12 },
});
