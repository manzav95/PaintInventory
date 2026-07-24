import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import DateField from "../components/DateField";
import PageHeader from "../components/PageHeader";
import WasteTrackingService from "../services/wasteTrackingService";
import {
  WASTE_MATERIALS,
  inchesToGallons,
  formatGallonsTenths,
  roundGallonsTenths,
  formatRecordGallonsForExcel,
  buildConversionChart,
  GALLONS_PER_INCH,
  todayPacificIso,
  formatMonthDayYear,
} from "../utils/wasteDrumConversion";

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
  onBack,
}) {
  const theme = useTheme();
  const inputRefs = useRef({});

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
  const [copiedId, setCopiedId] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const loadRecords = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const rows = await WasteTrackingService.list(50);
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
      if (Platform.OS !== "web") {
        Alert.alert(
          "Copied",
          "Paste into Excel — 4 cells in a row (Paint, Clear, Primer, Acetone).",
        );
      }
    } catch (e) {
      Alert.alert("Copy failed", e?.message || "Could not copy.");
    }
  };

  const handleSubmit = async () => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) {
      Alert.alert("Required", "Enter a name.");
      return;
    }
    if (!entryDate) {
      Alert.alert("Required", "Enter a date.");
      return;
    }
    if (totalGal <= 0) {
      Alert.alert("Required", "Enter at least one inches value.");
      return;
    }

    const summary = [
      `Date: ${formatMonthDayYear(entryDate)}`,
      `Name: ${trimmedName}`,
      `Paint: ${formatGallonsTenths(gallons.paint)} gal`,
      `Clear: ${formatGallonsTenths(gallons.clear_toner)} gal`,
      `Primer: ${formatGallonsTenths(gallons.primer)} gal`,
      `Acetone: ${formatGallonsTenths(gallons.acetone)} gal`,
      `Total: ${formatGallonsTenths(totalGal)} gal`,
    ].join("\n");

    const ok = await confirmAction(
      "Save waste entry?",
      `${summary}\n\nSave this waste record?`,
      { confirmLabel: "Save" },
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      await WasteTrackingService.create({
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
      });

      Alert.alert("Saved", "Waste record saved.");

      setInches({
        paint: "",
        clear_toner: "",
        primer: "",
        acetone: "",
      });
      await loadRecords();
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

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
      await loadRecords();
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadRecords(true)}
          />
        }
      >
        <PageHeader
          title="Waste Tracking"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />

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
          <Card.Content style={styles.form}>
            <DateField
              label="Date"
              value={entryDate}
              onChange={setEntryDate}
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
              style={[
                styles.hint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Enter inches → auto converts to gal ({GALLONS_PER_INCH} gal/in).
              Enter moves to the next field.
            </Text>

            <View style={styles.inchGrid}>
              {WASTE_MATERIALS.map((m, idx) => {
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
            </View>

            <Text
              style={[styles.total, { color: theme.colors.onSurface }]}
            >
              Total: {formatGallonsTenths(totalGal)} gal
            </Text>

            <View style={styles.actions}>
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting}
                compact
              >
                Save
              </Button>
            </View>
          </Card.Content>
        </Card>

        {isAdmin ? (
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
        ) : null}

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
              style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
            >
              Waste Records in gal
            </Text>
            {loading && records.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : records.length === 0 ? (
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                No records yet.
              </Text>
            ) : (
              records.map((r) => {
                const paint = formatGallonsTenths(r.paint_gallons);
                const clear = formatGallonsTenths(r.clear_toner_gallons);
                const primer = formatGallonsTenths(r.primer_gallons);
                const acetone = formatGallonsTenths(r.acetone_gallons);
                const total = formatGallonsTenths(
                  roundGallonsTenths(
                    (Number(r.paint_gallons) || 0) +
                      (Number(r.clear_toner_gallons) || 0) +
                      (Number(r.primer_gallons) || 0) +
                      (Number(r.acetone_gallons) || 0),
                  ),
                );
                return (
                  <View
                    key={r.id}
                    style={[
                      styles.recordRow,
                      { borderTopColor: theme.colors.outlineVariant },
                    ]}
                  >
                    <View style={styles.recordMain}>
                      <Text
                        style={[
                          styles.recordTitle,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {formatMonthDayYear(r.entry_date)} · {r.user_name || "—"}
                      </Text>
                      <Text
                        style={[
                          styles.recordMeta,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Paint {paint} · Clear {clear} · Primer {primer} ·
                        Acetone {acetone} · Total {total} gal
                      </Text>
                    </View>
                    {isAdmin ? (
                      <View style={styles.recordActions}>
                        <Button
                          mode="outlined"
                          compact
                          icon={copiedId === r.id ? "check" : "content-copy"}
                          onPress={() => handleCopyRecord(r)}
                        >
                          {copiedId === r.id ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          mode="outlined"
                          compact
                          textColor={theme.colors.error}
                          onPress={() => handleDelete(r)}
                          loading={deletingId === r.id}
                          disabled={deletingId != null}
                        >
                          Delete
                        </Button>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { borderWidth: 1, marginBottom: 12 },
  form: { gap: 10 },
  input: { backgroundColor: "transparent" },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  hint: { fontSize: 12, marginTop: -4 },
  inchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  inchField: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 130,
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
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chartGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chartCell: {
    width: "23%",
    minWidth: 90,
  },
  chartText: { fontSize: 11 },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  recordMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recordActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  recordTitle: { fontSize: 14, fontWeight: "600" },
  recordMeta: { fontSize: 12 },
});
