import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  RefreshControl,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  Text,
  TextInput,
  Card,
  useTheme,
  SegmentedButtons,
  ActivityIndicator,
  Checkbox,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import ShakeView from "../components/ShakeView";
import FormHelp from "../components/FormHelp";
import ScrollFrame from "../components/ScrollFrame";
import { SkeletonStack } from "../components/SkeletonBlock";
import { AppEmptyState, AppText } from "../components/ui";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import { LINEUP_FORM_HELP } from "../constants/formHelpContent";
import LineupService, {
  LINEUP_PIECE_TYPE_OPTIONS,
  parseLineupPieceTypes,
  formatLineupPieceTypesLabel,
} from "../services/lineupService";
import {
  resolveLineupMaterialType,
  findLineupColorSuggestions,
  formatLineupColorLabel,
  getLineupMaterialAccent,
  getLineupMaterialSoftBg,
  getLineupMaterialBorder,
  formatLineupMaterialLabel,
  isCustomStainId,
  normalizeLineupMaterialType,
} from "../utils/lineupMaterial";
import { nestedSurfaceColor } from "../utils/themeColors";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function sameUser(a, b) {
  return (
    String(a || "")
      .trim()
      .toLowerCase() ===
    String(b || "")
      .trim()
      .toLowerCase()
  );
}

function isReworkJob(job) {
  return /^rework$/i.test(String(job || "").trim());
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCars(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

function resolveRowMaterialType(row, inventory) {
  const stored = normalizeLineupMaterialType(row.material_type);
  if (stored) return stored;
  if (row.item_id && inventory?.length) {
    const item = inventory.find(
      (i) => String(i.id) === String(row.item_id),
    );
    if (item?.type) return normalizeLineupMaterialType(item.type);
  }
  return resolveLineupMaterialType(row.color_name, inventory).materialType;
}

export default function LineupScreen({
  userName = "",
  inventory = [],
  isAdmin = false,
  embeddedInShell = false,
  formRefreshKey = 0,
  onBack,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;

  const [jobName, setJobName] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [materialType, setMaterialType] = useState("");
  const [colorFocused, setColorFocused] = useState(false);
  const [pieceTypes, setPieceTypes] = useState(["cabs"]);
  const [carsQty, setCarsQty] = useState("");
  const [laps, setLaps] = useState("1");
  const [cartNumber, setCartNumber] = useState("");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingMixedId, setTogglingMixedId] = useState(null);
  const [shakeTick, setShakeTick] = useState(0);
  const [mobilePane, setMobilePane] = useState("form");

  const surfaceCardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: theme.colors.outlineVariant,
    },
  ];

  const colorFieldValue = selectedItem
    ? formatLineupColorLabel(selectedItem)
    : colorName || colorQuery;

  const effectiveMaterialType = useMemo(() => {
    if (selectedItem) {
      return normalizeLineupMaterialType(selectedItem.type);
    }
    const text = (colorName || colorQuery || "").trim();
    if (!text) return materialType || "";
    return resolveLineupMaterialType(text, inventory).materialType;
  }, [selectedItem, colorName, colorQuery, materialType, inventory]);

  const colorInputAccent = useMemo(
    () => getLineupMaterialAccent(effectiveMaterialType, theme),
    [effectiveMaterialType, theme],
  );

  const colorSuggestions = useMemo(() => {
    if (selectedItem) return [];
    const q = (colorQuery || colorName || "").trim();
    return findLineupColorSuggestions(inventory, q, { limit: 8 });
  }, [inventory, colorQuery, colorName, selectedItem]);

  const showColorSuggestions =
    colorFocused && !selectedItem && colorSuggestions.length > 0;

  const loadEntries = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await LineupService.list(100, userName);
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("Lineup load:", e);
      showToast({
        type: "error",
        title: "Could not load lineup",
        message: e?.message || "Try again.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userName]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!formRefreshKey) return;
    loadEntries(true);
  }, [formRefreshKey, loadEntries]);

  const handleJobChange = (text) => {
    setJobName(text);
    if (isReworkJob(text)) setLaps("1");
  };

  const handleColorChange = (text) => {
    setColorQuery(text);
    setColorName(text);
    setSelectedItem(null);
    const resolved = resolveLineupMaterialType(text, inventory);
    setMaterialType(resolved.materialType);
  };

  const selectInventoryColor = (item) => {
    setSelectedItem(item);
    setColorName(item.name || item.id || "");
    setColorQuery("");
    setMaterialType(normalizeLineupMaterialType(item.type));
    setColorFocused(false);
  };

  const clearColorSelection = () => {
    setSelectedItem(null);
    setColorName("");
    setColorQuery("");
    setMaterialType("");
  };

  const togglePieceType = (value) => {
    setPieceTypes((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((v) => v !== value);
        return next.length ? next : prev;
      }
      return [...prev, value];
    });
  };

  const clearForm = () => {
    setJobName("");
    clearColorSelection();
    setPieceTypes(["cabs"]);
    setCarsQty("");
    setLaps("1");
    setCartNumber("");
    setEditingId(null);
  };

  const startEdit = (row) => {
    if (!sameUser(row.user_name, userName) && !isAdmin) return;
    setEditingId(row.id);
    setJobName(row.job_name || "");
    const color = row.color_name || "";
    setColorName(color);
    setColorQuery(color);
    setMaterialType(resolveRowMaterialType(row, inventory));
    if (row.item_id && inventory?.length) {
      const item = inventory.find(
        (i) => String(i.id) === String(row.item_id),
      );
      setSelectedItem(item || null);
    } else {
      setSelectedItem(null);
    }
    const pieces = parseLineupPieceTypes(row.item_type);
    setPieceTypes(pieces.length ? pieces : ["cabs"]);
    setCarsQty(
      row.cars_qty != null && row.cars_qty !== ""
        ? String(row.cars_qty)
        : "",
    );
    setLaps(String(row.laps === 2 ? 2 : 1));
    setCartNumber(row.cart_number || "");
    setMobilePane("form");
  };

  const handleSubmit = async () => {
    const job = String(jobName || "").trim();
    const color = String(colorName || colorQuery || "").trim();
    const cart = String(cartNumber || "").trim();
    const cars = parseFloat(String(carsQty).replace(/,/g, ""), 10);
    let lapVal = laps === "2" ? 2 : 1;
    if (isReworkJob(job)) lapVal = 1;

    const resolved = selectedItem
      ? {
          materialType: normalizeLineupMaterialType(selectedItem.type),
          itemId: selectedItem.id,
        }
      : resolveLineupMaterialType(color, inventory);

    if (
      !job ||
      !color ||
      !pieceTypes.length ||
      !cart ||
      !Number.isFinite(cars) ||
      cars <= 0
    ) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Missing fields",
        message:
          "Enter job, color, at least one item type, cars qty, laps, and starting cart.",
      });
      return;
    }
    if (!userName) {
      showToast({
        type: "error",
        title: "Not signed in",
        message: "Sign in to submit a lineup.",
      });
      return;
    }

    const payload = {
      job_name: job,
      color_name: color,
      material_type: resolved.materialType || effectiveMaterialType || "",
      item_id: resolved.itemId || selectedItem?.id || null,
      item_type: pieceTypes.join(","),
      cars_qty: cars,
      laps: lapVal,
      cart_number: cart,
      user_name: userName,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await LineupService.update(editingId, payload);
        showToast({
          title: "Lineup updated",
          message: `${color} · Job ${job}`,
        });
      } else {
        await LineupService.create(payload);
        showToast({
          title: "Lineup posted",
          message: "Everyone will get an alert to view the lineup.",
        });
      }
      clearForm();
      await loadEntries();
      if (!isDesktop) setMobilePane("board");
    } catch (e) {
      showToast({
        type: "error",
        title: editingId ? "Update failed" : "Could not post lineup",
        message: e?.message || "Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    const canDelete =
      row?.id && (sameUser(row.user_name, userName) || isAdmin);
    if (!canDelete) return;
    const ok = await confirmAction(
      "Delete lineup entry?",
      `Remove ${row.color_name || "this"} · Job ${row.job_name || "—"}?`,
      { confirmLabel: "Delete", destructive: true },
    );
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await LineupService.delete(row.id, userName);
      if (editingId === row.id) clearForm();
      await loadEntries();
      showToast({ title: "Deleted", message: "Lineup entry removed." });
    } catch (e) {
      showToast({
        type: "error",
        title: "Delete failed",
        message: e?.message || "Could not delete.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleMixed = async (row) => {
    if (!userName || !row?.id) return;
    const next = !row.mixed_by_me;
    setTogglingMixedId(row.id);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === row.id ? { ...e, mixed_by_me: next } : e,
      ),
    );
    try {
      await LineupService.setMixed(row.id, userName, next);
    } catch (e) {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === row.id
            ? { ...entry, mixed_by_me: !next }
            : entry,
        ),
      );
      showToast({
        type: "error",
        title: "Could not update",
        message: e?.message || "Try again.",
      });
    } finally {
      setTogglingMixedId(null);
    }
  };

  const myEntries = useMemo(
    () => entries.filter((e) => sameUser(e.user_name, userName)),
    [entries, userName],
  );

  const formCard = (
    <Card style={surfaceCardStyle} mode="outlined">
      <ShakeView trigger={shakeTick}>
        <Card.Content style={styles.form}>
          <View style={styles.formHeaderRow}>
            <Text
              style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
            >
              {editingId ? "Edit lineup" : "Post lineup"}
            </Text>
            <FormHelp content={LINEUP_FORM_HELP} />
          </View>
          <AppText variant="caption" tone="muted" style={styles.hint}>
            Rough estimate of what’s loading on the line — helps mixers grab
            colors ahead of time.
          </AppText>

          <TextInput
            label="Job number"
            value={jobName}
            onChangeText={handleJobChange}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. 12345 or Rework"
            autoCapitalize="words"
          />

          <TextInput
            label="Color / material"
            value={colorFieldValue}
            onChangeText={handleColorChange}
            onFocus={() => setColorFocused(true)}
            onBlur={() => {
              setTimeout(() => setColorFocused(false), 150);
            }}
            mode="outlined"
            style={styles.input}
            placeholder="Search inventory or type color"
            outlineColor={
              colorInputAccent ||
              theme.colors?.outlineVariant ||
              theme.colors?.outline
            }
            activeOutlineColor={colorInputAccent || theme.colors?.primary}
            textColor={colorInputAccent || theme.colors?.onSurface}
            right={
              colorFieldValue ? (
                <TextInput.Icon icon="close" onPress={clearColorSelection} />
              ) : null
            }
          />
          {effectiveMaterialType ? (
            <AppText
              variant="caption"
              style={[
                styles.materialHint,
                { color: colorInputAccent || theme.colors.onSurfaceVariant },
              ]}
            >
              {formatLineupMaterialLabel(effectiveMaterialType)}
              {isCustomStainId(colorName || colorQuery)
                ? " · custom stain ID"
                : ""}
            </AppText>
          ) : null}
          {showColorSuggestions ? (
            <ScrollFrame maxHeight={220} style={styles.suggestBox}>
              {colorSuggestions.map(({ item }) => {
                const type = normalizeLineupMaterialType(item.type);
                const rowColor = getLineupMaterialAccent(type, theme);
                const label = formatLineupColorLabel(item);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => selectInventoryColor(item)}
                    style={({ pressed }) => [
                      styles.colorRow,
                      pressed && styles.colorRowPressed,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.colorRowText,
                        rowColor ? { color: rowColor } : null,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollFrame>
          ) : null}

          <Text
            style={[
              styles.fieldLabel,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Type of items (select one or more)
          </Text>
          <View style={styles.chipRow}>
            {LINEUP_PIECE_TYPE_OPTIONS.map((opt) => (
              <AppButton
                key={opt.value}
                mode={pieceTypes.includes(opt.value) ? "contained" : "outlined"}
                compact
                onPress={() => togglePieceType(opt.value)}
                style={styles.chipBtn}
              >
                {opt.label}
              </AppButton>
            ))}
          </View>

          <View style={styles.row}>
            <TextInput
              label="Qty of cars"
              value={carsQty}
              onChangeText={setCarsQty}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.half}
            />
            <TextInput
              label="Start cart #"
              value={cartNumber}
              onChangeText={setCartNumber}
              mode="outlined"
              style={styles.half}
              placeholder="Cart number"
            />
          </View>

          <Text
            style={[
              styles.fieldLabel,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Laps {isReworkJob(jobName) ? "(Rework → 1 lap)" : ""}
          </Text>
          <View style={styles.chipRow}>
            {[
              { value: "1", label: "1 lap" },
              { value: "2", label: "2 laps", disabled: isReworkJob(jobName) },
            ].map(({ value, label, disabled }) => (
              <AppButton
                key={value}
                mode={laps === value ? "contained" : "outlined"}
                compact
                disabled={disabled}
                onPress={() => {
                  if (isReworkJob(jobName)) {
                    setLaps("1");
                    return;
                  }
                  setLaps(value);
                }}
                style={styles.chipBtn}
              >
                {label}
              </AppButton>
            ))}
          </View>

          <View style={styles.actions}>
            {editingId ? (
              <AppButton
                mode="outlined"
                onPress={clearForm}
                disabled={submitting}
                compact
              >
                Cancel edit
              </AppButton>
            ) : null}
            <AppButton
              mode="contained"
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting}
              compact
              icon={editingId ? "content-save" : "send"}
            >
              {editingId ? "Save changes" : "Post lineup"}
            </AppButton>
          </View>
        </Card.Content>
      </ShakeView>
    </Card>
  );

  const boardCard = (
    <Card style={surfaceCardStyle} mode="outlined">
      <Card.Content style={styles.form}>
        <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>
          Current lineup
        </Text>
        <AppText variant="caption" tone="muted" style={styles.hint}>
          {isAdmin
            ? "Everyone can view. You can edit or delete any entry as admin."
            : "Everyone can view. Only you can edit or delete entries you posted"}{" "}
          ({myEntries.length} of yours). Check off items you’ve mixed — only you
          see your checkmarks.
        </AppText>

        {loading ? (
          <SkeletonStack lines={4} style={{ marginTop: 8 }} />
        ) : entries.length === 0 ? (
          <AppEmptyState title="No lineup yet" style={styles.empty} />
        ) : (
          <View style={styles.list}>
            {entries.map((row) => {
              const mine = sameUser(row.user_name, userName);
              const rowMaterial = resolveRowMaterialType(row, inventory);
              const accent = getLineupMaterialAccent(rowMaterial, theme);
              const softBg = getLineupMaterialSoftBg(rowMaterial);
              const borderColor =
                getLineupMaterialBorder(rowMaterial) ||
                theme.colors.outlineVariant;
              const mixed = !!row.mixed_by_me;
              const pieceLabel = formatLineupPieceTypesLabel(row.item_type);

              return (
                <View
                  key={row.id}
                  style={[
                    styles.entry,
                    {
                      backgroundColor:
                        softBg || nestedSurfaceColor(theme),
                      borderColor,
                      borderLeftWidth: 4,
                      opacity: mixed ? 0.52 : 1,
                    },
                    mixed && styles.entryMixed,
                  ]}
                >
                  <View style={styles.entryTop}>
                    <View style={styles.entryTitleBlock}>
                      <Text
                        style={[
                          styles.entryTitle,
                          { color: accent || theme.colors.onSurface },
                        ]}
                        numberOfLines={2}
                      >
                        {row.color_name || "—"}
                      </Text>
                      {rowMaterial ? (
                        <Text
                          style={[
                            styles.entryMaterialTag,
                            { color: accent || theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {formatLineupMaterialLabel(rowMaterial)}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.entryMeta,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {formatWhen(row.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.entryLine,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Job {row.job_name || "—"} · {pieceLabel} ·{" "}
                    {formatCars(row.cars_qty)} car
                    {Number(row.cars_qty) === 1 ? "" : "s"}
                  </Text>
                  <Text
                    style={[
                      styles.entryLine,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {row.laps === 2 ? "2 laps" : "1 lap"} · Start cart{" "}
                    {row.cart_number || "—"} · {row.user_name || "Unknown"}
                  </Text>

                  {userName ? (
                    <Pressable
                      onPress={() => handleToggleMixed(row)}
                      disabled={togglingMixedId === row.id}
                      style={styles.mixedRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: mixed }}
                    >
                      <Checkbox
                        status={mixed ? "checked" : "unchecked"}
                        onPress={() => handleToggleMixed(row)}
                        disabled={togglingMixedId === row.id}
                        color={accent || theme.colors.primary}
                      />
                      <Text
                        style={[
                          styles.mixedLabel,
                          {
                            color: mixed
                              ? theme.colors.onSurfaceVariant
                              : theme.colors.onSurface,
                          },
                        ]}
                      >
                        {mixed ? "Mixed" : "Mark as mixed"}
                      </Text>
                    </Pressable>
                  ) : null}

                  {mine || isAdmin ? (
                    <View style={styles.entryActions}>
                      <AppButton
                        mode="text"
                        compact
                        onPress={() => startEdit(row)}
                        disabled={deletingId != null || submitting}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        mode="text"
                        compact
                        textColor={theme.colors.error}
                        onPress={() => handleDelete(row)}
                        loading={deletingId === row.id}
                        disabled={deletingId != null || submitting}
                      >
                        Delete
                      </AppButton>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const pageHeader = (
    <PageHeader
      title="Lineup"
      onBack={onBack}
      embeddedInShell={embeddedInShell}
    />
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => loadEntries(true)}
      tintColor={theme.colors.primary}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {isDesktop ? (
        <>
          <View style={styles.pageTop}>{pageHeader}</View>
          <View style={styles.splitRow}>
            <ScrollView
              style={styles.splitPane}
              contentContainerStyle={styles.splitPaneContent}
              keyboardShouldPersistTaps="handled"
            >
              {formCard}
            </ScrollView>
            <ScrollView
              style={styles.splitPane}
              contentContainerStyle={styles.splitPaneContent}
              refreshControl={refreshControl}
            >
              {boardCard}
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
          <SegmentedButtons
            value={mobilePane}
            onValueChange={setMobilePane}
            style={styles.mobileTabs}
            buttons={[
              {
                value: "form",
                label: "Post",
                icon: "clipboard-edit-outline",
              },
              {
                value: "board",
                label: "Board",
                icon: "format-list-bulleted",
              },
            ]}
          />
          {mobilePane === "form" ? formCard : boardCard}
        </ScrollView>
      )}
      {submitting ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : null}
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
  splitPane: { flex: 1, minWidth: 0, minHeight: 0 },
  splitPaneContent: { paddingBottom: 48 },
  scroll: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    gap: 16,
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  mobileTabs: { marginTop: 4, marginBottom: 12 },
  card: {
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  form: {
    gap: 12,
    paddingTop: 16,
    paddingBottom: 16,
  },
  formHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  hint: { marginTop: -4, marginBottom: 4 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: -4,
  },
  materialHint: { marginTop: -6, fontWeight: "600" },
  input: { backgroundColor: "transparent" },
  suggestBox: { marginTop: -4, maxWidth: "100%" },
  colorRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  colorRowPressed: { backgroundColor: "rgba(0,0,0,0.05)" },
  colorRowText: { fontSize: 15 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1, minWidth: 0, backgroundColor: "transparent" },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chipBtn: { margin: 0 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  list: { gap: 10, marginTop: 4 },
  entry: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  entryMixed: {
    ...(Platform.OS === "web"
      ? { filter: "grayscale(0.35)" }
      : null),
  },
  entryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "flex-start",
  },
  entryTitleBlock: { flex: 1, gap: 2 },
  entryTitle: { fontSize: 20, fontWeight: "800", lineHeight: 26 },
  entryMaterialTag: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  entryMeta: { fontSize: 12, flexShrink: 0 },
  entryLine: { fontSize: 13, lineHeight: 18 },
  mixedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 2,
  },
  mixedLabel: { fontSize: 13, fontWeight: "600" },
  entryActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  empty: { flex: 0, paddingVertical: 24 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
