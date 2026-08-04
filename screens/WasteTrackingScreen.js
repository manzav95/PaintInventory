import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  SegmentedButtons,
} from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import DateField from "../components/DateField";
import PageHeader from "../components/PageHeader";
import StaggerItem from "../components/StaggerItem";
import ShakeView from "../components/ShakeView";
import FormHelp from "../components/FormHelp";
import { SkeletonStack } from "../components/SkeletonBlock";
import showToast from "../utils/showToast";
import { WASTE_FORM_HELP } from "../constants/formHelpContent";
import WasteTrackingService from "../services/wasteTrackingService";
import { nestedSurfaceColor } from "../utils/themeColors";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import {
  WASTE_MATERIALS,
  inchesToGallons,
  formatGallonsTenths,
  roundGallonsTenths,
  formatRecordGallonsForExcel,
  formatWeekGallonsGridForExcel,
  buildConversionChart,
  GALLONS_PER_INCH,
  todayPacificIso,
  formatMonthDayYear,
  weekMondayIso,
  bundleWasteByWeek,
  computeWasteSummary,
  buildWasteAlerts,
  formatTotalsBreakdown,
  formatMonthLabel,
} from "../utils/wasteDrumConversion";
import { colors } from "../theme/tokens";
import { AppEmptyState } from "../components/ui";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatRecordDateParts(dateStr) {
  const key = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return { weekday: "—", dateLine: formatMonthDayYear(dateStr) };
  }
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { weekday: "—", dateLine: formatMonthDayYear(dateStr) };
  }
  return {
    weekday: WEEKDAY_SHORT[d.getDay()] || "—",
    dateLine: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  };
}
function parseInches(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function confirmAction(title, message, { confirmLabel = "Confirm", destructive = false } = {}) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

export default function WasteTrackingScreen({
  userName = "",
  isAdmin = false,
  embeddedInShell = false,
  formRefreshKey = 0,
  onBack,
}) {
  const theme = useTheme();
  const inputRefs = useRef({});
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;

  const [entryDate, setEntryDate] = useState(todayPacificIso());
  const [name, setName] = useState(userName || "");
  const [inches, setInches] = useState({
    paint: "",
    clear_toner: "",
    primer: "",
    acetone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copiedWeek, setCopiedWeek] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const weeksSeededRef = useRef(false);
  /** Mobile: 'form' | 'totals' */
  const [mobilePane, setMobilePane] = useState("form");

  useEffect(() => {
    if (userName && !name) setName(userName);
  }, [userName]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    WasteTrackingService.markSeen().catch(() => {});
    return undefined;
  }, [isAdmin]);

  const gallons = useMemo(
    () => ({
      paint: inchesToGallons(inches.paint),
      clear_toner: inchesToGallons(inches.clear_toner),
      primer: inchesToGallons(inches.primer),
      acetone: inchesToGallons(inches.acetone),
    }),
    [inches],
  );

  const totalGal = useMemo(
    () =>
      roundGallonsTenths(
        gallons.paint +
          gallons.clear_toner +
          gallons.primer +
          gallons.acetone,
      ),
    [gallons],
  );

  const chart = useMemo(() => buildConversionChart(15), []);

  const summary = useMemo(
    () => computeWasteSummary(records, todayPacificIso()),
    [records],
  );
  const alerts = useMemo(() => buildWasteAlerts(summary), [summary]);
  const weeks = useMemo(() => bundleWasteByWeek(records), [records]);
  const thisWeekMonday = useMemo(
    () => weekMondayIso(todayPacificIso()),
    [],
  );

  useEffect(() => {
    if (!weeks.length || weeksSeededRef.current) return;
    weeksSeededRef.current = true;
    // This week expanded; all others collapsed
    setExpandedWeeks(
      new Set(
        weeks.some((w) => w.monday === thisWeekMonday) ? [thisWeekMonday] : [],
      ),
    );
  }, [weeks, thisWeekMonday]);
  const loadRecords = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // Enough history for YTD / month / week comparisons
      const rows = await WasteTrackingService.list(2000);
      setRecords(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const setInchField = (key, value) => {
    const cleaned = String(value || "").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const safe =
      parts.length > 2
        ? `${parts[0]}.${parts.slice(1).join("")}`
        : cleaned;
    setInches((prev) => ({ ...prev, [key]: safe }));
  };

  const focusNext = (currentKey) => {
    const keys = WASTE_MATERIALS.map((m) => m.key);
    const idx = keys.indexOf(currentKey);
    if (idx < 0 || idx >= keys.length - 1) return;
    const next = keys[idx + 1];
    inputRefs.current[next]?.focus?.();
  };

  const handleCopyRecord = async (row) => {
    if (!isAdmin || !row) return;
    const tsv = formatRecordGallonsForExcel(row);
    try {
      await Clipboard.setStringAsync(tsv);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
      showToast({
        title: "Copied",
        message: "Paste into Excel — Paint, Clear, Primer, Acetone.",
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Copy failed",
        message: e?.message || "Could not copy.",
      });
    }
  };

  const handleCopyWeek = async (week) => {
    if (!isAdmin || !week) return;
    const tsv = formatWeekGallonsGridForExcel(week.rows, week.monday);
    try {
      await Clipboard.setStringAsync(tsv);
      setCopiedWeek(week.monday);
      setTimeout(() => setCopiedWeek(null), 2000);
      showToast({
        title: "Week copied",
        message: "Paste into Excel — 4 columns × 5 rows (Mon–Fri).",
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Copy failed",
        message: e?.message || "Could not copy.",
      });
    }
  };

  const toggleWeek = (monday) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      setShakeTick((n) => n + 1);
      showToast({ type: "error", title: "Required", message: "Enter a name." });
      return;
    }
    if (!entryDate) {
      setShakeTick((n) => n + 1);
      showToast({ type: "error", title: "Required", message: "Enter a date." });
      return;
    }
    if (totalGal <= 0) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Required",
        message: "Enter at least one inches value.",
      });
      return;
    }

    const summaryLines = [
      `Date: ${formatMonthDayYear(entryDate)}`,
      `Name: ${trimmedName}`,
      `Paint: ${formatGallonsTenths(gallons.paint)} gal`,
      `Clear: ${formatGallonsTenths(gallons.clear_toner)} gal`,
      `Primer: ${formatGallonsTenths(gallons.primer)} gal`,
      `Acetone: ${formatGallonsTenths(gallons.acetone)} gal`,
      `Total: ${formatGallonsTenths(totalGal)} gal`,
    ].join("\n");

    const ok = await confirmAction(
      editingId ? "Update waste entry?" : "Save waste entry?",
      `${summaryLines}\n\n${editingId ? "Save these changes?" : "Save this waste record?"}`,
      { confirmLabel: editingId ? "Save changes" : "Save" },
    );
    if (!ok) return;

    const payload = {
      entry_date: entryDate,
      user_name: trimmedName,
      paint_inches: parseInches(inches.paint),
      clear_toner_inches: parseInches(inches.clear_toner),
      primer_inches: parseInches(inches.primer),
      acetone_inches: parseInches(inches.acetone),
      paint_gallons: gallons.paint,
      clear_toner_gallons: gallons.clear_toner,
      primer_gallons: gallons.primer,
      acetone_gallons: gallons.acetone,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await WasteTrackingService.update(editingId, payload);
        showToast({ title: "Updated", message: "Waste record updated." });
        setEditingId(null);
      } else {
        await WasteTrackingService.create(payload);
        showToast({ title: "Saved", message: "Waste record saved." });
      }

      setInches({
        paint: "",
        clear_toner: "",
        primer: "",
        acetone: "",
      });
      setEntryDate(todayPacificIso());
      await loadRecords();
    } catch (e) {
      showToast({
        type: "error",
        title: "Error",
        message: e?.message || "Failed to save.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (row) => {
    if (!isAdmin || !row?.id) return;
    setEditingId(row.id);
    setEntryDate(row.entry_date || todayPacificIso());
    setName(row.user_name || "");
    setInches({
      paint:
        row.paint_inches != null && row.paint_inches !== ""
          ? String(row.paint_inches)
          : "",
      clear_toner:
        row.clear_toner_inches != null && row.clear_toner_inches !== ""
          ? String(row.clear_toner_inches)
          : "",
      primer:
        row.primer_inches != null && row.primer_inches !== ""
          ? String(row.primer_inches)
          : "",
      acetone:
        row.acetone_inches != null && row.acetone_inches !== ""
          ? String(row.acetone_inches)
          : "",
    });
    showToast({
      title: "Editing entry",
      message: "Update the form and tap Save changes.",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInches({
      paint: "",
      clear_toner: "",
      primer: "",
      acetone: "",
    });
    setEntryDate(todayPacificIso());
    if (userName) setName(userName);
  };

  const handleRefresh = () => {
    if (!editingId) setEntryDate(todayPacificIso());
    loadRecords(true);
  };

  // Header / shell pull-to-refresh — reset date to today (when not editing).
  useEffect(() => {
    if (!formRefreshKey) return;
    if (!editingId) setEntryDate(todayPacificIso());
    loadRecords(true);
    // editingId intentionally omitted — only react to shell refresh ticks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formRefreshKey]);

  const handleDelete = async (row) => {
    if (!isAdmin || !row?.id) return;
    const total = roundGallonsTenths(
      (Number(row.paint_gallons) || 0) +
        (Number(row.clear_toner_gallons) || 0) +
        (Number(row.primer_gallons) || 0) +
        (Number(row.acetone_gallons) || 0),
    );
    const ok = await confirmAction(
      "Delete waste record?",
      `${formatMonthDayYear(row.entry_date)} · ${row.user_name || "—"}\nTotal ${formatGallonsTenths(total)} gal\n\nThis cannot be undone.`,
      { confirmLabel: "Delete", destructive: true },
    );
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await WasteTrackingService.delete(row.id);
      if (editingId === row.id) cancelEdit();
      await loadRecords();
    } catch (e) {
      showToast({
        type: "error",
        title: "Error",
        message: e?.message || "Failed to delete.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const surfaceCardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: theme.colors.outlineVariant,
    },
  ];

  const formCard = (
    <Card style={surfaceCardStyle} mode="outlined">
      <ShakeView trigger={shakeTick} style={styles.shakePad}>
        <Card.Content style={styles.form}>
          <View style={styles.formHeaderRow}>
            <Text
              style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
            >
              {editingId ? "Edit waste" : "Log waste"}
            </Text>
            <FormHelp content={WASTE_FORM_HELP} />
          </View>
          <DateField
            label="Date"
            value={entryDate}
            onChange={setEntryDate}
            style={styles.input}
          />
          <TextInput
            label="Name"
            value={name}
            onChangeText={setName}
            mode="outlined"
            autoCorrect={false}
            style={styles.input}
          />

          <Text
            style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
          >
            Stick measure (inches)
          </Text>
          <Text
            style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
          >
            Enter inches → auto converts to gal ({GALLONS_PER_INCH} gal/in).
            Enter moves to the next field.
          </Text>

          <View style={styles.inchGrid}>
            {Array.from(
              { length: Math.ceil(WASTE_MATERIALS.length / 2) },
              (_, rowIdx) => {
                const pair = WASTE_MATERIALS.slice(rowIdx * 2, rowIdx * 2 + 2);
                return (
                  <View key={`inch-row-${rowIdx}`} style={styles.inchRow}>
                    {pair.map((m) => {
                      const idx = WASTE_MATERIALS.findIndex(
                        (x) => x.key === m.key,
                      );
                      const isLast = idx === WASTE_MATERIALS.length - 1;
                      return (
                        <View key={m.key} style={styles.inchField}>
                          <TextInput
                            ref={(r) => {
                              inputRefs.current[m.key] = r;
                            }}
                            label={m.label}
                            value={inches[m.key]}
                            onChangeText={(v) => setInchField(m.key, v)}
                            mode="outlined"
                            keyboardType={
                              Platform.OS === "ios" ? "decimal-pad" : "numeric"
                            }
                            inputMode="decimal"
                            returnKeyType={isLast ? "done" : "next"}
                            blurOnSubmit={isLast}
                            onSubmitEditing={() => {
                              if (!isLast) focusNext(m.key);
                            }}
                            style={styles.input}
                            dense
                          />
                          <Text
                            style={[
                              styles.galOut,
                              { color: theme.colors.primary },
                            ]}
                          >
                            {formatGallonsTenths(gallons[m.key])} gal
                          </Text>
                        </View>
                      );
                    })}
                    {pair.length === 1 ? (
                      <View style={styles.inchField} />
                    ) : null}
                  </View>
                );
              },
            )}
          </View>

          <Text style={[styles.total, { color: theme.colors.onSurface }]}>
            Total: {formatGallonsTenths(totalGal)} gal
          </Text>

          <View style={styles.actions}>
            {editingId ? (
              <Button
                mode="outlined"
                onPress={cancelEdit}
                disabled={submitting}
                compact
              >
                Cancel
              </Button>
            ) : null}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              compact
              {...(editingId ? { icon: "content-save" } : null)}
            >
              {editingId ? "Save changes" : "Save"}
            </Button>
          </View>
        </Card.Content>
      </ShakeView>
    </Card>
  );

  const chartCard = isAdmin ? (
    <Card style={surfaceCardStyle} mode="outlined">
      <Card.Content>
        <Text
          style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
        >
          Conversion chart (5-gal bucket)
        </Text>
        <View style={styles.chartGrid}>
          {chart.map((row) => (
            <View key={row.inches} style={styles.chartCell}>
              <Text
                style={[
                  styles.chartText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {row.inches}" = {formatGallonsTenths(row.gallons)} gal
              </Text>
            </View>
          ))}
        </View>
      </Card.Content>
    </Card>
  ) : null;

  const summaryCard = (
    <Card style={surfaceCardStyle} mode="outlined">
      <Card.Content style={styles.form}>
        <Text
          style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
        >
          Waste totals
        </Text>
        {loading && records.length === 0 ? (
          <SkeletonStack lines={3} />
        ) : (
          <>
            <View style={styles.statBlock}>
              <Text
                style={[styles.statTitle, { color: theme.colors.onSurface }]}
              >
                YTD {summary.today.slice(0, 4)} ·{" "}
                {formatGallonsTenths(summary.ytd.total)} gal
              </Text>
              <Text
                style={[
                  styles.statMeta,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {formatTotalsBreakdown(summary.ytd)}
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text
                style={[styles.statTitle, { color: theme.colors.onSurface }]}
              >
                This month ({formatMonthLabel(summary.month)}) ·{" "}
                {formatGallonsTenths(summary.thisMonth.total)} gal
              </Text>
              <Text
                style={[
                  styles.statMeta,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {formatTotalsBreakdown(summary.thisMonth)}
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text
                style={[styles.statTitle, { color: theme.colors.onSurface }]}
              >
                This week · {formatGallonsTenths(summary.thisWeek.total)} gal
              </Text>
              <Text
                style={[
                  styles.statMeta,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {formatTotalsBreakdown(summary.thisWeek)}
              </Text>
            </View>
            {summary.months.length > 0 ? (
              <View style={styles.monthList}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  By month
                </Text>
                {summary.months.map((m) => (
                  <Text
                    key={m.key}
                    style={[
                      styles.monthRow,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {m.label}: {formatGallonsTenths(m.totals.total)} gal
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Card.Content>
    </Card>
  );

  const alertsCard =
    alerts.length > 0 ? (
      <Card
        style={[
          styles.card,
          {
            backgroundColor: colors.semantic.recycleBannerBg,
            borderColor: theme.dark
              ? colors.semantic.warning
              : colors.semantic.recycleBannerText,
          },
        ]}
        mode="outlined"
      >
        <Card.Content style={styles.form}>
          <Text
            style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
          >
            Data alerts
          </Text>
          <Text
            style={[
              styles.hint,
              { color: theme.colors.onSurfaceVariant, marginTop: 0 },
            ]}
          >
            Unusual increase vs the previous week or month (≥50% and +0.8
            gal).
          </Text>
          {alerts.map((a) => (
            <Text
              key={a.id}
              style={[styles.alertLine, { color: theme.colors.onSurface }]}
            >
              · {a.message}
            </Text>
          ))}
        </Card.Content>
      </Card>
    ) : null;

  const recordsSection = (
    <View style={styles.recordsSection}>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>
        Waste records by week (gal)
      </Text>
      <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
        Copy week pastes Mon–Fri into a 4×5 Excel grid (Paint, Clear,
        Primer, Acetone).
      </Text>
      {loading && records.length === 0 ? (
        <SkeletonStack lines={4} style={{ marginTop: 8 }} />
      ) : weeks.length === 0 ? (
        <AppEmptyState title="No records yet." style={styles.emptyRecords} />
      ) : (
        weeks.map((week, wIdx) => {
          const open = expandedWeeks.has(week.monday);
          const isThisWeek = week.monday === thisWeekMonday;
          const recordSurface = nestedSurfaceColor(theme);
          return (
            <StaggerItem key={week.monday} index={wIdx}>
              <Card
                style={[
                  styles.card,
                  styles.weekCard,
                  {
                    backgroundColor: theme.colors.surfaceContainerHighest,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                mode="outlined"
              >
                <Card.Content style={styles.weekCardContent}>
                  <View style={styles.weekHeader}>
                    <Pressable
                      onPress={() => toggleWeek(week.monday)}
                      style={styles.weekTogglePress}
                    >
                      <Text
                        style={[
                          styles.weekToggleLabel,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {open ? "▾ " : "▸ "}
                        {week.label}
                        {isThisWeek ? " · This week" : ""}
                      </Text>
                    </Pressable>
                    <View style={styles.weekHeaderRight}>
                      <Text
                        style={[
                          styles.weekTotal,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {formatGallonsTenths(week.totals.total)} gal
                      </Text>
                      {isAdmin ? (
                        <Button
                          mode="outlined"
                          compact
                          icon={
                            copiedWeek === week.monday
                              ? "check"
                              : "content-copy"
                          }
                          onPress={() => handleCopyWeek(week)}
                          style={styles.weekCopyBtn}
                        >
                          {copiedWeek === week.monday ? "Copied" : "Copy week"}
                        </Button>
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.statMeta,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {formatTotalsBreakdown(week.totals)}
                  </Text>
                  {open ? (
                    <View style={styles.recordList}>
                      {week.rows.map((r) => {
                        const paint = formatGallonsTenths(r.paint_gallons);
                        const clear = formatGallonsTenths(
                          r.clear_toner_gallons,
                        );
                        const primer = formatGallonsTenths(r.primer_gallons);
                        const acetone = formatGallonsTenths(
                          r.acetone_gallons,
                        );
                        const total = formatGallonsTenths(
                          roundGallonsTenths(
                            (Number(r.paint_gallons) || 0) +
                              (Number(r.clear_toner_gallons) || 0) +
                              (Number(r.primer_gallons) || 0) +
                              (Number(r.acetone_gallons) || 0),
                          ),
                        );
                        const dateParts = formatRecordDateParts(r.entry_date);
                        return (
                          <View
                            key={r.id}
                            style={[
                              styles.recordCard,
                              {
                                backgroundColor: recordSurface,
                                borderColor: theme.colors.outlineVariant,
                              },
                            ]}
                          >
                            <View style={styles.recordCardInner}>
                              <View style={styles.recordDateCol}>
                                <Text
                                  style={[
                                    styles.recordWeekday,
                                    { color: theme.colors.primary },
                                  ]}
                                >
                                  {dateParts.weekday}
                                </Text>
                                <Text
                                  style={[
                                    styles.recordDateLine,
                                    {
                                      color: theme.colors.onSurfaceVariant,
                                    },
                                  ]}
                                >
                                  {dateParts.dateLine}
                                </Text>
                              </View>
                              <View style={styles.recordMain}>
                                <Text
                                  style={[
                                    styles.recordTitle,
                                    { color: theme.colors.onSurface },
                                  ]}
                                >
                                  {r.user_name || "—"}
                                </Text>
                                <Text
                                  style={[
                                    styles.recordMeta,
                                    {
                                      color: theme.colors.onSurfaceVariant,
                                    },
                                  ]}
                                >
                                  Paint {paint} · Clear {clear} · Primer{" "}
                                  {primer} · Acetone {acetone}
                                </Text>
                                <Text
                                  style={[
                                    styles.recordTotal,
                                    { color: theme.colors.onSurface },
                                  ]}
                                >
                                  Total {total} gal
                                </Text>
                                {isAdmin ? (
                                  <View style={styles.recordActions}>
                                    <Button
                                      mode="outlined"
                                      compact
                                      icon={
                                        copiedId === r.id
                                          ? "check"
                                          : "content-copy"
                                      }
                                      onPress={() => handleCopyRecord(r)}
                                    >
                                      {copiedId === r.id ? "Copied" : "Copy"}
                                    </Button>
                                    <Button
                                      mode="outlined"
                                      compact
                                      onPress={() => startEdit(r)}
                                      disabled={
                                        deletingId != null || submitting
                                      }
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      mode="outlined"
                                      compact
                                      textColor={theme.colors.error}
                                      onPress={() => handleDelete(r)}
                                      loading={deletingId === r.id}
                                      disabled={
                                        deletingId != null || submitting
                                      }
                                    >
                                      Delete
                                    </Button>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Card.Content>
              </Card>
            </StaggerItem>
          );
        })
      )}
    </View>
  );

  const pageHeader = (
    <PageHeader
      title="Waste Tracking"
      onBack={onBack}
      embeddedInShell={embeddedInShell}
    />
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
  );

  const leftColumn = (
    <>
      {formCard}
      {chartCard}
      {summaryCard}
      {alertsCard}
    </>
  );

  const formPane = (
    <>
      {formCard}
      {chartCard}
    </>
  );

  const totalsPane = (
    <>
      {summaryCard}
      {alertsCard}
      {recordsSection}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {isDesktop && isAdmin ? (
        <>
          <View style={styles.pageTop}>{pageHeader}</View>
          <View style={styles.splitRow}>
            <ScrollView
              style={styles.splitPane}
              contentContainerStyle={styles.splitPaneContent}
              keyboardShouldPersistTaps="handled"
            >
              {leftColumn}
            </ScrollView>
            <ScrollView
              style={styles.splitPane}
              contentContainerStyle={styles.splitPaneContent}
              refreshControl={refreshControl}
            >
              {recordsSection}
            </ScrollView>
          </View>
        </>
      ) : (
        <ScrollView
          style={{ width: "100%", maxWidth: "100%" }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {pageHeader}
          {!isDesktop ? (
            <>
              <SegmentedButtons
                value={mobilePane}
                onValueChange={setMobilePane}
                style={styles.mobileTabs}
                buttons={[
                  {
                    value: "form",
                    label: "Log form",
                    icon: "clipboard-edit-outline",
                  },
                  {
                    value: "totals",
                    label: "Totals & records",
                    icon: "chart-box-outline",
                  },
                ]}
              />
              {mobilePane === "form" ? formPane : totalsPane}
            </>
          ) : (
            <>
              {leftColumn}
              {recordsSection}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
  pageTop: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    maxWidth: "100%",
  },
  splitRow: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 0,
  },
  splitPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  splitPaneContent: {
    paddingBottom: 48,
  },
  scroll: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  mobileTabs: {
    marginTop: 4,
    marginBottom: 12,
  },
  card: {
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  shakePad: {
    paddingTop: 4,
    paddingBottom: 4,
    maxWidth: "100%",
  },
  form: {
    gap: 14,
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  formHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: -4,
  },
  input: {
    alignSelf: "stretch",
    maxWidth: "100%",
    minWidth: 0,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 0,
    flex: 1,
    flexShrink: 1,
  },
  hint: {
    fontSize: 12,
    marginTop: -2,
    marginBottom: 4,
    flexShrink: 1,
    lineHeight: 18,
    maxWidth: "100%",
  },
  inchGrid: {
    gap: 14,
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  inchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  inchField: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  galOut: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
    marginLeft: 4,
  },
  total: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 8,
    marginBottom: 4,
  },
  chartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  chartCell: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 120,
    maxWidth: "100%",
  },
  chartText: { fontSize: 11 },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statBlock: {
    gap: 4,
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  statMeta: {
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
  monthList: {
    marginTop: 6,
    gap: 4,
  },
  monthRow: {
    fontSize: 12,
  },
  alertLine: {
    fontSize: 13,
    lineHeight: 20,
  },
  recordsSection: {
    marginTop: 2,
    gap: 10,
    width: "100%",
    maxWidth: "100%",
  },
  emptyRecords: {
    flex: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    alignItems: "flex-start",
  },
  weekCard: {
    marginBottom: 4,
  },
  weekCardContent: {
    gap: 10,
    paddingVertical: 12,
  },
  weekHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  weekTogglePress: {
    alignSelf: "stretch",
    paddingVertical: 2,
  },
  weekToggleLabel: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  weekHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  weekCopyBtn: {
    flexShrink: 0,
  },
  weekTotal: {
    fontSize: 14,
    fontWeight: "700",
  },
  recordList: {
    gap: 10,
    marginTop: 4,
    width: "100%",
  },
  recordCard: {
    marginLeft: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    width: "auto",
    maxWidth: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 4px rgba(0,0,0,0.08)" }
      : {
          elevation: 1,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        }),
  },
  recordCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },
  recordDateCol: {
    width: 52,
    flexShrink: 0,
    paddingTop: 1,
  },
  recordWeekday: {
    fontSize: 14,
    fontWeight: "700",
  },
  recordDateLine: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  recordMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  recordActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
  },
  recordTitle: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  recordMeta: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  recordTotal: { fontSize: 13, fontWeight: "700", marginTop: 2 },
});
