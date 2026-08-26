import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import {
  Text,
  TextInput,
  IconButton,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "./ui/AppButton";
import DateField from "./DateField";
import TimeField from "./TimeField";
import ScrollFrame from "./ScrollFrame";
import { AppEmptyState } from "./ui";
import { BOOTH_OPTIONS } from "../services/materialUsageService";
import { getMaterialTypeColor } from "../utils/materialTypes";
import { space, radius } from "../theme/tokens";

const PANEL_WIDTH = 380;

const MATERIAL_USAGE_COLOR_TYPES = [
  "paint",
  "custom_paint",
  "clear",
  "primer",
  "stain",
  "custom_stain",
];

const MATERIAL_USAGE_EXCLUDE_NAME_RE =
  /^(acetone|catalyst|slow\s*reducer)$/i;

function titleCaseWords(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function isMaterialUsageEligibleItem(item) {
  const type = String(item?.type || "").toLowerCase();
  if (!MATERIAL_USAGE_COLOR_TYPES.includes(type)) return false;
  const name = String(item?.name || "").trim();
  const id = String(item?.id || "").trim();
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(name)) return false;
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(id)) return false;
  return true;
}

function formatMaterialPickerLabel(item) {
  const name = String(item?.name || item?.id || "").trim();
  if (!name) return "";
  const type = String(item?.type || "").toLowerCase();
  if (
    (type === "stain" || type === "custom_stain") &&
    !/\bstain\b/i.test(name)
  ) {
    return `${name} stain`;
  }
  return name;
}

function parseCustomMaterialInput(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "no_keyword" };
  }
  const raw = text.trim();
  const t = raw.toLowerCase();
  if (/^\d{4}$/.test(raw) || /^#\d+$/.test(raw)) {
    return { ok: true, type: "paint" };
  }
  const hasDye = t.includes("dye");
  const hasStain = t.includes("stain");
  const hasToner = t.includes("toner");
  const count = [hasDye, hasStain, hasToner].filter(Boolean).length;
  if (count === 0) return { ok: false, error: "no_keyword" };
  if (count > 1) return { ok: false, error: "multiple_keywords" };
  if (hasDye) return { ok: true, type: "dye" };
  if (hasStain) return { ok: true, type: "stain" };
  return { ok: true, type: "clear" };
}

function deriveCustomCategory(text) {
  const result = parseCustomMaterialInput(text);
  return result.ok ? result.type : "";
}

function getMaterialInputAccent(type, theme) {
  const t = String(type || "").toLowerCase();
  if (!t) return null;
  if (t === "primer") {
    return theme?.dark ? "#eceff1" : "#8A8478";
  }
  return getMaterialTypeColor(t, theme);
}

/**
 * Bell/settings-style caret popup for editing a material-usage log row.
 */
export default function MaterialUsageEditPopover({
  visible,
  row = null,
  inventory = [],
  anchor = { pageX: 0, pageY: 0 },
  onClose,
  onSave,
  saving = false,
}) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [entryDate, setEntryDate] = useState("");
  const [entryTime, setEntryTime] = useState("");
  const [jobName, setJobName] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [customColor, setCustomColor] = useState("");
  const [materialFocused, setMaterialFocused] = useState(false);
  const [qty, setQty] = useState("");
  const [booth, setBooth] = useState(BOOTH_OPTIONS[0].value);
  const [cupGun, setCupGun] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !row) return;
    setEntryDate(row.entry_date || "");
    setEntryTime(row.entry_time || "");
    setJobName(row.job_name || "");
    setBooth(row.booth || BOOTH_OPTIONS[0].value);
    const isCup = !!row.cup_gun;
    setCupGun(isCup);
    const gal = Number(row.qty_gallons) || 0;
    setQty(
      isCup
        ? String(Math.round(gal * 128 * 100) / 100)
        : String(gal),
    );
    setError("");
    setMaterialFocused(false);

    const itemId = row.item_id != null ? String(row.item_id).trim() : "";
    const match =
      itemId && Array.isArray(inventory)
        ? inventory.find((i) => String(i.id) === itemId)
        : null;
    if (match) {
      setSelectedItem(match);
      setCustomColor("");
      setColorQuery("");
    } else {
      setSelectedItem(null);
      setCustomColor(row.color_name || "");
      setColorQuery("");
    }
  }, [visible, row, inventory]);

  const jobOptional = booth === "Booth 2";
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(300, windowWidth - 24));

  const effectiveMaterialType = useMemo(() => {
    if (selectedItem) return (selectedItem.type || "").toLowerCase() || null;
    const custom = (customColor || colorQuery || "").trim();
    return custom ? deriveCustomCategory(custom) || null : null;
  }, [selectedItem, customColor, colorQuery]);

  const materialInputAccent = useMemo(
    () => getMaterialInputAccent(effectiveMaterialType, theme),
    [effectiveMaterialType, theme],
  );

  const materialFieldValue = selectedItem
    ? formatMaterialPickerLabel(selectedItem)
    : customColor || colorQuery;

  const materialSuggestions = useMemo(() => {
    if (selectedItem) return [];
    const eligible = (inventory || []).filter(isMaterialUsageEligibleItem);
    const q = (colorQuery || "").trim().toLowerCase();
    const filtered = q
      ? eligible.filter(
          (i) =>
            (i.name || "").toLowerCase().includes(q) ||
            (i.id || "").toLowerCase().includes(q) ||
            String(i.color_label || "")
              .toLowerCase()
              .includes(q),
        )
      : eligible;
    return filtered
      .sort((a, b) => {
        const aName = (a.name || a.id || "").toLowerCase();
        const bName = (b.name || b.id || "").toLowerCase();
        if (q) {
          const aStarts = aName.startsWith(q) ? 0 : 1;
          const bStarts = bName.startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        return aName.localeCompare(bName);
      })
      .slice(0, 12);
  }, [inventory, colorQuery, selectedItem]);

  const showMaterialSuggestions = materialFocused && !selectedItem;

  const panelPos = useMemo(() => {
    const gap = 10;
    const caretSize = 10;
    const margin = 8;
    const x = Number(anchor?.pageX) || windowWidth / 2;
    const y = Number(anchor?.pageY) || 80;
    const maxH = Math.min(560, windowHeight - 24);
    let top = y + gap;
    if (top + Math.min(400, maxH) > windowHeight - margin) {
      top = Math.max(margin + caretSize, y - gap - 320);
    }
    top = Math.max(margin + caretSize, Math.min(top, windowHeight - 200));
    const preferredLeft = x - panelWidth / 2;
    const left = Math.max(
      margin,
      Math.min(preferredLeft, windowWidth - panelWidth - margin),
    );
    const caretLeft = Math.max(
      12,
      Math.min(x - left - caretSize, panelWidth - 24),
    );
    return { top, left, caretLeft, maxH };
  }, [anchor?.pageX, anchor?.pageY, panelWidth, windowWidth, windowHeight]);

  const close = () => {
    if (saving) return;
    onClose?.();
  };

  const handleSave = () => {
    const job = titleCaseWords(jobName || "");
    if (!job && !jobOptional) {
      setError("Job number is required for this booth.");
      return;
    }
    const customTrim = titleCaseWords(customColor || colorQuery || "");
    if (!selectedItem && !customTrim) {
      setError("Select or enter a material.");
      return;
    }
    if (customTrim && !selectedItem) {
      const parsed = parseCustomMaterialInput(customTrim);
      if (!parsed.ok) {
        setError(
          parsed.error === "multiple_keywords"
            ? "Custom material needs exactly one of: dye, stain, or toner."
            : "Custom material needs dye, stain, toner, or a 4-digit paint ID.",
        );
        return;
      }
    }
    if (!entryDate) {
      setError("Date is required.");
      return;
    }
    if (!entryTime) {
      setError("Time is required.");
      return;
    }
    const rawQty = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(rawQty) || rawQty <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    let qtyGallons = rawQty;
    if (cupGun) {
      qtyGallons = rawQty / 128;
    }

    const colorName = selectedItem
      ? formatMaterialPickerLabel(selectedItem)
      : customTrim;
    const materialType = selectedItem
      ? (selectedItem.type || "").toLowerCase() || null
      : parseCustomMaterialInput(customTrim).type || null;
    const itemId = selectedItem ? String(selectedItem.id) : "";

    setError("");
    onSave?.({
      entry_date: entryDate,
      entry_time: entryTime,
      job_name: job,
      color_name: colorName,
      item_id: itemId,
      material_type: materialType,
      qty_gallons: qtyGallons,
      catalyst_oz: row?.catalyst_oz,
      catalyzed_confirmed: row?.catalyzed_confirmed !== false,
      booth,
      user_name: row?.user_name || "unknown",
      cup_gun: cupGun,
    });
  };

  if (!visible || !row) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.panelAnchor,
            {
              top: panelPos.top,
              left: panelPos.left,
              width: panelWidth,
              pointerEvents: "box-none",
            },
          ]}
        >
          <View
            style={[
              styles.caret,
              {
                left: panelPos.caretLeft,
                borderBottomColor: theme.colors.outlineVariant,
              },
            ]}
          />
          <View
            style={[
              styles.caretInner,
              {
                left: panelPos.caretLeft + 1,
                borderBottomColor: theme.colors.surfaceContainerHighest,
              },
            ]}
          />
          <View
            style={[
              styles.panel,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
                maxHeight: panelPos.maxH,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text
                style={[styles.title, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                Edit entry
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={close}
                disabled={saving}
                style={styles.closeBtn}
                accessibilityLabel="Close"
              />
            </View>
            <Text
              style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {row.user_name || "Unknown"}
              {effectiveMaterialType
                ? ` · ${String(effectiveMaterialType).replace(/_/g, " ")}`
                : ""}
            </Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <View style={styles.row}>
                <DateField
                  label="Date"
                  value={entryDate}
                  onChange={setEntryDate}
                  style={styles.half}
                />
                <TimeField
                  label="Time"
                  value={entryTime}
                  onChange={setEntryTime}
                  style={styles.half}
                />
              </View>

              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Booth
              </Text>
              <View style={styles.boothRow}>
                {BOOTH_OPTIONS.map((opt) => (
                  <AppButton
                    key={opt.value}
                    mode={booth === opt.value ? "contained" : "outlined"}
                    onPress={() => setBooth(opt.value)}
                    compact
                    style={styles.boothBtn}
                    disabled={saving}
                  >
                    {opt.label}
                  </AppButton>
                ))}
              </View>

              <TextInput
                label={
                  jobOptional
                    ? "Job Number (optional)"
                    : "Job Number (required)"
                }
                value={jobName}
                onChangeText={setJobName}
                mode="outlined"
                dense
                style={styles.input}
                disabled={saving}
              />

              <View style={styles.colorSection}>
                <TextInput
                  label="Material"
                  value={materialFieldValue}
                  onChangeText={(t) => {
                    setColorQuery(t);
                    setCustomColor("");
                    if (selectedItem) setSelectedItem(null);
                  }}
                  onFocus={() => setMaterialFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setMaterialFocused(false), 150);
                  }}
                  mode="outlined"
                  dense
                  style={styles.input}
                  disabled={saving}
                  placeholder="Search inventory or type custom dye/toner"
                  outlineColor={
                    materialInputAccent ||
                    theme.colors?.outlineVariant ||
                    theme.colors?.outline
                  }
                  activeOutlineColor={
                    materialInputAccent || theme.colors?.primary
                  }
                  textColor={
                    materialInputAccent || theme.colors?.onSurface
                  }
                  right={
                    selectedItem || customColor || colorQuery ? (
                      <TextInput.Icon
                        icon="close"
                        disabled={saving}
                        onPress={() => {
                          setSelectedItem(null);
                          setCustomColor("");
                          setColorQuery("");
                        }}
                      />
                    ) : null
                  }
                />
                {showMaterialSuggestions ? (
                  <ScrollFrame maxHeight={180} style={styles.suggestBox}>
                    {materialSuggestions.map((item) => {
                      const type = String(item.type || "").toLowerCase();
                      const rowColor = getMaterialInputAccent(type, theme);
                      const label = formatMaterialPickerLabel(item);
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            setSelectedItem(item);
                            setCustomColor("");
                            setColorQuery("");
                            setMaterialFocused(false);
                          }}
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
                    {(colorQuery || "").trim() ? (
                      <Pressable
                        onPress={() => {
                          setCustomColor((colorQuery || "").trim());
                          setSelectedItem(null);
                          setMaterialFocused(false);
                        }}
                        style={({ pressed }) => [
                          styles.colorRow,
                          styles.colorRowCustom,
                          pressed && styles.colorRowPressed,
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.colorRowText,
                            {
                              fontStyle: "italic",
                              ...(materialInputAccent
                                ? { color: materialInputAccent }
                                : null),
                            },
                          ]}
                        >
                          Use custom: {(colorQuery || "").trim()}
                        </Text>
                      </Pressable>
                    ) : null}
                    {materialSuggestions.length === 0 &&
                    !(colorQuery || "").trim() ? (
                      <AppEmptyState
                        title="No eligible materials"
                        style={styles.emptyList}
                      />
                    ) : null}
                    {materialSuggestions.length === 0 &&
                    (colorQuery || "").trim() ? (
                      <AppEmptyState
                        title="No matches — use custom above"
                        style={styles.emptyList}
                      />
                    ) : null}
                  </ScrollFrame>
                ) : null}
              </View>

              <TextInput
                label={cupGun ? "Qty (oz)" : "Qty (gal)"}
                value={qty}
                onChangeText={setQty}
                mode="outlined"
                dense
                keyboardType="decimal-pad"
                style={styles.input}
                disabled={saving}
              />

              {error ? (
                <Text style={[styles.error, { color: theme.colors.error }]}>
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.actions}>
              <AppButton mode="outlined" onPress={close} disabled={saving} compact>
                Cancel
              </AppButton>
              <AppButton
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                compact
                icon="content-save"
              >
                Save
              </AppButton>
            </View>
            {saving ? (
              <View style={[styles.savingOverlay, { pointerEvents: "none" }]}>
                <ActivityIndicator />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panelAnchor: {
    position: "absolute",
    zIndex: 2,
  },
  caret: {
    position: "absolute",
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  caretInner: {
    position: "absolute",
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  panel: {
    borderRadius: radius.md + 2,
    borderWidth: 1,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 8px 24px rgba(0,0,0,0.28)" }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space[5],
    paddingRight: 2,
    paddingTop: space[2],
    minHeight: 36,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  closeBtn: {
    margin: 0,
  },
  hint: {
    fontSize: 12,
    paddingHorizontal: space[5],
    marginBottom: space[2],
    lineHeight: 16,
  },
  scroll: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingHorizontal: space[5],
    paddingBottom: space[2],
    gap: space[3],
  },
  row: {
    flexDirection: "row",
    gap: space[2],
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  boothRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  boothBtn: {
    marginRight: 0,
  },
  input: {
    backgroundColor: "transparent",
  },
  colorSection: {
    gap: 4,
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.35)",
    borderRadius: 8,
    overflow: "hidden",
  },
  colorRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  colorRowCustom: {
    backgroundColor: "rgba(128,128,128,0.08)",
  },
  colorRowPressed: {
    opacity: 0.7,
  },
  colorRowText: {
    fontSize: 14,
  },
  emptyList: {
    flex: 0,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  error: {
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[2],
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.3)",
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});
