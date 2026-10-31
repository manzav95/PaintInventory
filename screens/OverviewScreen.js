import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Card, Text, useTheme, ActivityIndicator, SegmentedButtons } from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import MetricStrip from "../components/MetricStrip";
import SimpleLineChart from "../components/SimpleLineChart";
import { AppEmptyState, AppText } from "../components/ui";
import OverviewService from "../services/overviewService";
import showToast from "../utils/showToast";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { colors, space, radius } from "../theme/tokens";
import { getMaterialTypeColor } from "../utils/materialTypes";

function gal(n) {
  const v = Number(n) || 0;
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function signedGal(n) {
  const v = Number(n) || 0;
  const abs = gal(Math.abs(v));
  if (v > 0) return `+${abs}`;
  if (v < 0) return `−${abs}`;
  return abs;
}

function pickCsvFile() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,text/plain";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          filename: file.name || "schedule.csv",
          text: String(reader.result || ""),
        });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

const TALK_GROUPS = [
  { key: "high", title: "Priority", kicker: "Needs attention" },
  { key: "medium", title: "Look into", kicker: "Bring it up" },
  { key: "info", title: "Stats", kicker: "This week" },
];

function groupTalkingPoints(points) {
  const buckets = { high: [], medium: [], info: [] };
  for (const point of points || []) {
    const key =
      point.severity === "high"
        ? "high"
        : point.severity === "medium"
          ? "medium"
          : "info";
    buckets[key].push(point);
  }
  return TALK_GROUPS.map((group) => ({
    ...group,
    items: buckets[group.key],
  })).filter((group) => group.items.length > 0);
}

function BulletList({ items, color, theme }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, idx) => (
        <View key={item.key || item.title || idx} style={styles.bulletRow}>
          <Text style={[styles.bulletMark, { color }]}>–</Text>
          <View style={styles.bulletBody}>
            {item.title ? (
              <Text
                style={[styles.bulletTitle, { color: theme.colors.onSurface }]}
              >
                {item.title}
              </Text>
            ) : null}
            <Text
              style={[
                styles.bulletText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {item.body || item.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function wastePct(waste, mixed) {
  const m = Number(mixed) || 0;
  const w = Number(waste) || 0;
  if (m <= 0) return w > 0 ? 100 : 0;
  return Math.round((w / m) * 1000) / 10;
}

function MixWasteChart({
  weekUsage,
  weekWaste,
  monthUsage,
  monthWaste,
  weekLabel = "Week",
  theme,
}) {
  const rows = [
    { key: "paint", label: "Paint" },
    { key: "primer", label: "Primer" },
    { key: "clear", label: "Clear" },
  ];
  const mixColor = theme.colors.primary;
  const wasteColor = theme.colors.error;
  return (
    <View style={styles.mixGrid}>
      {rows.map((row) => {
        const weekMix = Number(weekUsage?.[row.key]) || 0;
        const weekW = Number(weekWaste?.[row.key]) || 0;
        const monthMix = Number(monthUsage?.[row.key]) || 0;
        const monthW = Number(monthWaste?.[row.key]) || 0;
        const typeColor = getMaterialTypeColor(row.key, theme);
        return (
          <View key={row.key} style={styles.mixItem}>
            <Text style={[styles.mixItemTitle, { color: typeColor }]}>
              {row.label}
            </Text>
            <MixWastePeriod
              label={weekLabel}
              mixed={weekMix}
              waste={weekW}
              mixColor={mixColor}
              wasteColor={wasteColor}
              theme={theme}
            />
            <MixWastePeriod
              label="Month"
              mixed={monthMix}
              waste={monthW}
              mixColor={mixColor}
              wasteColor={wasteColor}
              theme={theme}
            />
          </View>
        );
      })}
    </View>
  );
}

function MixWastePeriod({
  label,
  mixed,
  waste,
  mixColor,
  wasteColor,
  theme,
}) {
  const max = Math.max(mixed, waste, 0.1);
  const mixW = mixed > 0 ? Math.max(4, (mixed / max) * 100) : 0;
  const wasteW = waste > 0 ? Math.max(4, (waste / max) * 100) : 0;
  const pct = wastePct(waste, mixed);
  return (
    <View style={styles.mixPeriod}>
      <Text style={[styles.mixPeriodLabel, { color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
      <View style={styles.mixBarRow}>
        <View
          style={[
            styles.mixBarTrack,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <View
            style={[
              styles.mixBarFill,
              { width: `${mixW}%`, backgroundColor: mixColor },
            ]}
          />
        </View>
        <Text style={[styles.mixBarValue, { color: theme.colors.onSurface }]}>
          {gal(mixed)} mixed
        </Text>
      </View>
      <View style={styles.mixBarRow}>
        <View
          style={[
            styles.mixBarTrack,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
        >
          <View
            style={[
              styles.mixBarFill,
              { width: `${wasteW}%`, backgroundColor: wasteColor },
            ]}
          />
        </View>
        <Text style={[styles.mixBarValue, { color: wasteColor }]}>
          {gal(waste)} waste · {pct}%
        </Text>
      </View>
    </View>
  );
}

function OutlineCard({ title, kicker, accent, theme, children, style }) {
  return (
    <Card
      mode="outlined"
      style={[
        styles.sectionCard,
        {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: accent || theme.colors.outlineVariant,
        },
        style,
      ]}
    >
      {accent ? (
        <View style={[styles.sectionBar, { backgroundColor: accent }]} />
      ) : null}
      <Card.Content style={styles.sectionContent}>
        {kicker ? (
          <Text style={[styles.sectionKicker, { color: accent || theme.colors.primary }]}>
            {kicker}
          </Text>
        ) : null}
        {title ? (
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
        ) : null}
        {children}
      </Card.Content>
    </Card>
  );
}

export default function OverviewScreen({
  onBack,
  embeddedInShell = false,
  isAdmin = false,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [weekTab, setWeekTab] = useState("this");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const next = await OverviewService.get();
      setData(next);
    } catch (e) {
      setError(e?.message || "Could not load overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async () => {
    const file = await pickCsvFile();
    if (!file?.text) return;
    setUploading(true);
    try {
      const saved = await OverviewService.uploadSchedule({
        csvText: file.text,
        filename: file.filename,
      });
      if (saved?.overview) setData(saved.overview);
      else await load();
      showToast({
        title: "Schedule uploaded",
        message: `${file.filename} is now part of this week’s overview.`,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Upload failed",
        message: e?.message || "Could not read that CSV.",
      });
    } finally {
      setUploading(false);
    }
  };

  const weeks = data?.weeks || [];
  const thisWeek = data?.thisWeek;
  const lastWeek = data?.lastWeek;
  const priorAvg = data?.priorAvg;
  const viewingLast = weekTab === "last";
  const selectedWeek = viewingLast ? lastWeek : thisWeek;
  const comparePrev = viewingLast ? data?.weekBeforeLast : lastWeek;
  const compareAvg = viewingLast ? data?.lastWeekPriorAvg : priorAvg;
  const selectedAdjustments = viewingLast
    ? data?.adjustmentsLast
    : data?.adjustmentsThis;
  const nowLabel = viewingLast ? "last week" : "this week";
  const prevLabel = viewingLast ? "the week before" : "last week";
  const weekRangeLabel = viewingLast
    ? data?.lastWeekLabel || lastWeek?.label
    : data?.weekLabel;
  const chartLabels = weeks.map((w) => w.label.replace(/ – .*/, "") || w.monday);
  const chartHeight = isWide ? 200 : 168;
  const talkGroups = useMemo(
    () =>
      groupTalkingPoints(
        viewingLast ? data?.lastWeekTalkingPoints : data?.talkingPoints,
      ),
    [viewingLast, data?.talkingPoints, data?.lastWeekTalkingPoints],
  );

  const metrics = useMemo(() => {
    if (!selectedWeek) return [];
    const mixedCoat =
      (Number(selectedWeek.usage?.paint) || 0) +
      (Number(selectedWeek.usage?.primer) || 0) +
      (Number(selectedWeek.usage?.clear) || 0);
    const notSprayedPct = wastePct(selectedWeek.waste?.total, mixedCoat);
    return [
      {
        id: "usage",
        label: viewingLast ? "Mixed last week" : "Mixed this week",
        value: `${gal(selectedWeek.usage?.total)} gal`,
        color: theme.colors.primary,
      },
      {
        id: "waste",
        label: "Not sprayed",
        value: `${gal(selectedWeek.waste?.total)} gal`,
        color: theme.colors.error,
      },
      {
        id: "wastePct",
        label: "Not sprayed %",
        value: `${notSprayedPct}%`,
        color: theme.colors.error,
      },
      {
        id: "countoff",
        label: viewingLast ? "Count-off last week" : "Count-off this week",
        value: String(selectedAdjustments?.count || 0),
        color: colors.semantic.lowStockValue || "#ff9800",
      },
    ];
  }, [selectedWeek, selectedAdjustments?.count, theme, viewingLast]);

  const compareItems = [
    ["Paint", "paint", "usage"],
    ["Stain", "stain", "usage"],
    ["Dye", "dye", "usage"],
    ["Primer", "primer", "usage"],
    ["Clear", "clear", "usage"],
    ["Waste (not sprayed)", "total", "waste"],
  ].map(([label, key, group]) => {
    const now = Number(selectedWeek?.[group]?.[key]) || 0;
    const last = Number(comparePrev?.[group]?.[key]) || 0;
    const avg = Number(compareAvg?.[group]?.[key]) || 0;
    return {
      title: label,
      body: `${gal(now)} ${nowLabel} · ${gal(last)} ${prevLabel} · ${gal(avg)} 4-wk avg`,
    };
  });

  const countOffItems = useMemo(() => {
    const items = [
      {
        title: viewingLast ? "Last week" : "This week",
        body: `${selectedAdjustments?.count || 0} corrections, ${gal(selectedAdjustments?.absGallons)} gal moved (net ${signedGal(selectedAdjustments?.netGallons)})`,
      },
      {
        title: "All-time",
        body: `${data?.adjustmentsAll?.count || 0} corrections, ${gal(data?.adjustmentsAll?.absGallons)} gal moved`,
      },
    ];
    for (const item of selectedAdjustments?.items || []) {
      items.push({
        title: item.name,
        body: `${signedGal(item.delta)} gal · ${item.count} ${item.count === 1 ? "correction" : "corrections"} · ${item.itemId || ""}`,
      });
    }
    return items;
  }, [data?.adjustmentsAll, selectedAdjustments, viewingLast]);

  const scheduleItems = useMemo(() => {
    const items = [];
    if (selectedWeek?.schedule?.jobs) {
      items.push({
        title: viewingLast ? "Last week" : "This week",
        body: `${selectedWeek.schedule.jobs} jobs — paint ${selectedWeek.schedule.paint}, stain ${selectedWeek.schedule.stain}, dye ${selectedWeek.schedule.dye}, primer ${selectedWeek.schedule.primer}, clear ${selectedWeek.schedule.clear}`,
      });
    } else {
      items.push({
        title: viewingLast ? "Last week" : "This week",
        body: viewingLast
          ? "No schedule loaded for last week."
          : "No schedule loaded yet. Upload a CSV to explain paint vs stain swings.",
      });
    }
    for (const file of (data?.scheduleFiles || []).slice(0, 5)) {
      items.push({ title: file.filename, body: "Uploaded schedule" });
    }
    return items;
  }, [selectedWeek, data?.scheduleFiles, viewingLast]);

  const wasteColor = theme.colors.error;
  const charts = [
    {
      title: "Paint (gal)",
      series: [
        {
          key: "mixed",
          label: "Mixed",
          data: weeks.map((w) => Number(w.usage?.paint) || 0),
          color: getMaterialTypeColor("paint", theme),
        },
        {
          key: "waste",
          label: "Waste",
          data: weeks.map((w) => Number(w.waste?.paint) || 0),
          color: wasteColor,
        },
      ],
    },
    {
      title: "Primer (gal)",
      series: [
        {
          key: "mixed",
          label: "Mixed",
          data: weeks.map((w) => Number(w.usage?.primer) || 0),
          color: getMaterialTypeColor("primer", theme),
        },
        {
          key: "waste",
          label: "Waste",
          data: weeks.map((w) => Number(w.waste?.primer) || 0),
          color: wasteColor,
        },
      ],
    },
    {
      title: "Clear (gal)",
      series: [
        {
          key: "mixed",
          label: "Mixed",
          data: weeks.map((w) => Number(w.usage?.clear) || 0),
          color: getMaterialTypeColor("clear", theme),
        },
        {
          key: "waste",
          label: "Waste",
          data: weeks.map((w) => Number(w.waste?.clear) || 0),
          color: wasteColor,
        },
      ],
    },
    {
      title: "Stain mixed (gal)",
      data: weeks.map((w) => Number(w.usage?.stain) || 0),
      color: getMaterialTypeColor("stain", theme),
    },
    {
      title: "Dye mixed (gal)",
      data: weeks.map((w) => Number(w.usage?.dye) || 0),
      color: getMaterialTypeColor("dye", theme),
    },
  ];

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <PageHeader
          title="Overview"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />
        <AppEmptyState title="Admin only" subtitle="Overview is for the admin desktop." />
      </View>
    );
  }

  const errorAccent = theme.colors.error;
  const lookAccent = colors.semantic.lowStockValue || "#ff9800";
  const groupAccent = {
    high: errorAccent,
    medium: lookAccent,
    info: theme.colors.primary,
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
      >
        <PageHeader
          title="Overview"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
          actions={
            <AppButton
              mode="contained"
              icon="file-delimited"
              compact
              loading={uploading}
              onPress={handleUpload}
            >
              Upload schedule CSV
            </AppButton>
          }
        />

        <SegmentedButtons
          value={weekTab}
          onValueChange={setWeekTab}
          style={styles.weekTabs}
          buttons={[
            { value: "this", label: "This week" },
            { value: "last", label: "Last week" },
          ]}
        />
        <AppText variant="sectionTitle" style={{ color: theme.colors.onSurface }}>
          {viewingLast ? "Last week" : "This week"} · {weekRangeLabel || "—"}
        </AppText>
        <AppText variant="caption" tone="muted" style={styles.weekHint}>
          Compared with {prevLabel} and the average of the previous 4 weeks.
          Mixed is what went into the booths. Waste (not sprayed) is paint,
          primer, and clear only — acetone is left out.
        </AppText>

        {loading && !data ? (
          <View style={styles.statusRow}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              Building this week’s picture…
            </Text>
          </View>
        ) : error && !data ? (
          <AppEmptyState title="Could not load overview" subtitle={error} />
        ) : (
          <>
            <MetricStrip items={metrics} />

            <AppText
              variant="sectionTitle"
              style={[styles.blockTitle, { color: theme.colors.onSurface }]}
            >
              Talk with the team
            </AppText>
            <View style={styles.stack}>
              {talkGroups.map((group) => {
                const accent = groupAccent[group.key];
                return (
                  <OutlineCard
                    key={group.key}
                    title={group.title}
                    kicker={
                      group.key === "info"
                        ? viewingLast
                          ? "Last week"
                          : "This week"
                        : group.kicker
                    }
                    accent={accent}
                    theme={theme}
                  >
                    <BulletList
                      items={group.items}
                      color={accent}
                      theme={theme}
                    />
                  </OutlineCard>
                );
              })}
            </View>

            <OutlineCard
              title="Mixed vs waste"
              kicker="Paint, primer, clear"
              theme={theme}
            >
              <MixWasteChart
                weekUsage={selectedWeek?.usage}
                weekWaste={selectedWeek?.waste}
                monthUsage={data?.thisMonth?.usage}
                monthWaste={data?.thisMonth?.waste}
                weekLabel={viewingLast ? "Last week" : "Week"}
                theme={theme}
              />
            </OutlineCard>

            <OutlineCard
              title="Trends"
              kicker="Mixed vs waste"
              theme={theme}
            >
              <View style={styles.chartStack}>
                {charts.map((chart) => (
                  <View key={chart.title} style={styles.chartSlot}>
                    <SimpleLineChart
                      title={chart.title}
                      data={chart.data || []}
                      series={chart.series}
                      labels={chartLabels}
                      color={chart.color}
                      valueSuffix=""
                      height={chartHeight}
                    />
                  </View>
                ))}
              </View>
            </OutlineCard>

            <OutlineCard
              title={
                viewingLast
                  ? "Last week vs recent weeks (mixed)"
                  : "This week vs recent weeks (mixed)"
              }
              theme={theme}
            >
              <BulletList
                items={compareItems}
                color={theme.colors.primary}
                theme={theme}
              />
            </OutlineCard>

            <OutlineCard
              title="Count was off"
              kicker="ADMIN qty changes"
              accent={
                (selectedAdjustments?.count || 0) > 0 ? lookAccent : undefined
              }
              theme={theme}
            >
              <BulletList
                items={countOffItems}
                color={
                  (selectedAdjustments?.count || 0) > 0
                    ? lookAccent
                    : theme.colors.primary
                }
                theme={theme}
              />
            </OutlineCard>

            <OutlineCard title="Production schedule" theme={theme}>
              <BulletList
                items={scheduleItems}
                color={theme.colors.primary}
                theme={theme}
              />
              <AppButton
                mode="outlined"
                icon="file-delimited"
                onPress={handleUpload}
                loading={uploading}
                style={styles.uploadBtn}
              >
                Upload CSV
              </AppButton>
            </OutlineCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
    width: "100%",
  },
  scrollWide: { maxWidth: 900, alignSelf: "center" },
  weekTabs: { marginBottom: 4 },
  weekHint: { marginBottom: space[2] },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  blockTitle: { marginTop: space[2] },
  stack: {
    gap: 10,
    width: "100%",
  },
  sectionCard: {
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
    borderRadius: radius.lg,
  },
  sectionBar: { height: 4 },
  sectionContent: {
    gap: 8,
    paddingVertical: 12,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletMark: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
    width: 12,
  },
  bulletBody: {
    flex: 1,
    minWidth: 0,
  },
  bulletTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 18,
  },
  mixGrid: {
    gap: 14,
    width: "100%",
  },
  mixItem: {
    gap: 6,
    width: "100%",
  },
  mixItemTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  mixPeriod: {
    gap: 4,
    marginTop: 4,
  },
  mixPeriodLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  mixBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mixBarTrack: {
    flex: 1,
    minWidth: 0,
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  mixBarFill: {
    height: 10,
    borderRadius: 5,
  },
  mixBarValue: {
    width: 128,
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  chartStack: {
    gap: 16,
    width: "100%",
  },
  chartSlot: {
    width: "100%",
    overflow: "hidden",
  },
  uploadBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
});
