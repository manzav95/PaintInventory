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
  Button,
  IconButton,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import DateField from "./DateField";
import TimeField from "./TimeField";
import { BOOTH_OPTIONS } from "../services/materialUsageService";
import { space, radius } from "../theme/tokens";

const PANEL_WIDTH = 380;

/** Capitalize the first letter of each whitespace-separated word. */
function titleCaseWords(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Bell/settings-style caret popup for editing a material-usage log row.
 */
export default function MaterialUsageEditPopover({
  visible,
  row = null,
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
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [booth, setBooth] = useState(BOOTH_OPTIONS[0].value);
  const [cupGun, setCupGun] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !row) return;
    setEntryDate(row.entry_date || "");
    setEntryTime(row.entry_time || "");
    setJobName(row.job_name || "");
    setMaterial(row.color_name || "");
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
  }, [visible, row]);

  const jobOptional = booth === "Booth 2";
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(300, windowWidth - 24));

  const panelPos = useMemo(() => {
    const gap = 10;
    const caretSize = 10;
    const margin = 8;
    const x = Number(anchor?.pageX) || windowWidth / 2;
    const y = Number(anchor?.pageY) || 80;
    const maxH = Math.min(520, windowHeight - 24);
    let top = y + gap;
    if (top + Math.min(360, maxH) > windowHeight - margin) {
      top = Math.max(margin + caretSize, y - gap - 280);
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
    const mat = titleCaseWords(material || "");
    if (!mat) {
      setError("Enter a material / color name.");
      return;
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
    // Exact gallons as entered (no 0.25 snap)
    setError("");
    onSave?.({
      entry_date: entryDate,
      entry_time: entryTime,
      job_name: job,
      color_name: mat,
      item_id: row?.item_id != null ? String(row.item_id) : "",
      material_type: row?.material_type || null,
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
          pointerEvents="box-none"
          style={[
            styles.panelAnchor,
            {
              top: panelPos.top,
              left: panelPos.left,
              width: panelWidth,
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
              {row.user_name || "Unknown"} · {row.color_name || "Material"}
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
                  <Button
                    key={opt.value}
                    mode={booth === opt.value ? "contained" : "outlined"}
                    onPress={() => setBooth(opt.value)}
                    compact
                    style={styles.boothBtn}
                    disabled={saving}
                  >
                    {opt.label}
                  </Button>
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

              <TextInput
                label="Material"
                value={material}
                onChangeText={setMaterial}
                mode="outlined"
                dense
                style={styles.input}
                disabled={saving}
              />

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
              <Button mode="outlined" onPress={close} disabled={saving} compact>
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                compact
                icon="content-save"
              >
                Save
              </Button>
            </View>
            {saving ? (
              <View style={styles.savingOverlay} pointerEvents="none">
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
    maxHeight: 360,
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
