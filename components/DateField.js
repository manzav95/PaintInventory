import React, { useMemo, useState, useRef } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Text, TextInput, useTheme } from "react-native-paper";

function toYmd(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // Use noon local time to avoid timezone day shifting.
  const d = new Date(`${raw}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatMdy(value) {
  const d = parseYmd(value);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

/**
 * Outlined date field that matches Paper TextInput chrome.
 * Web: full-size transparent native date input over the field (direct tap —
 * required for mobile Safari/Chrome; showPicker from a Pressable is blocked).
 * Native: system / modal picker.
 */

const webOverlayInputStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  zIndex: 10,
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontSize: 16,
  color: "transparent",
  backgroundColor: "transparent",
  WebkitAppearance: "none",
  appearance: "none",
  // Ensure the control receives taps on mobile web (RN Pressable must not sit above).
  pointerEvents: "auto",
};

export default function DateField({
  label,
  value,
  onChange,
  style,
  disabled = false,
  mode = "outlined",
  min,
  max,
}) {
  const isWeb = Platform.OS === "web";
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(() => parseYmd(value) || new Date());
  const theme = useTheme();
  const webInputRef = useRef(null);

  const nativeDate = useMemo(() => parseYmd(value) || new Date(), [value]);
  const display = formatMdy(value);

  const openNativePicker = () => {
    if (disabled) return;
    setDraft(nativeDate);
    setShow(true);
  };

  const confirmIos = () => {
    onChange?.(toYmd(draft));
    setShow(false);
  };

  return (
    <View style={[styles.wrap, style]}>
      <View pointerEvents={isWeb ? "none" : "auto"}>
        {isWeb ? (
          <TextInput
            label={label}
            value={display}
            mode={mode}
            editable={false}
            disabled={disabled}
            style={styles.input}
            outlineColor={theme.colors?.outlineVariant ?? theme.colors?.outline}
            activeOutlineColor={theme.colors?.primary}
            textColor={theme.colors?.onSurface}
            placeholder="MM/DD/YYYY"
            right={<TextInput.Icon icon="calendar" disabled={disabled} />}
          />
        ) : (
          <Pressable
            onPress={openNativePicker}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label || "Choose date"}
          >
            <View pointerEvents="none">
              <TextInput
                label={label}
                value={display}
                mode={mode}
                editable={false}
                disabled={disabled}
                style={styles.input}
                outlineColor={
                  theme.colors?.outlineVariant ?? theme.colors?.outline
                }
                activeOutlineColor={theme.colors?.primary}
                textColor={theme.colors?.onSurface}
                placeholder="MM/DD/YYYY"
                right={<TextInput.Icon icon="calendar" disabled={disabled} />}
              />
            </View>
          </Pressable>
        )}
      </View>

      {isWeb ? (
        <input
          ref={webInputRef}
          type="date"
          value={String(value ?? "")}
          disabled={disabled}
          min={min}
          max={max}
          aria-label={label || "Choose date"}
          onChange={(e) => onChange?.(e.target.value)}
          style={webOverlayInputStyle}
        />
      ) : null}

      {!isWeb && Platform.OS === "android" && show ? (
        <DateTimePicker
          value={nativeDate}
          mode="date"
          display="default"
          themeVariant={theme.dark ? "dark" : "light"}
          minimumDate={min ? parseYmd(min) || undefined : undefined}
          maximumDate={max ? parseYmd(max) || undefined : undefined}
          onChange={(event, selectedDate) => {
            setShow(false);
            if (event?.type === "dismissed") return;
            if (selectedDate) onChange?.(toYmd(selectedDate));
          }}
        />
      ) : null}

      {!isWeb && Platform.OS === "ios" ? (
        <Modal
          visible={show}
          transparent
          animationType="slide"
          onRequestClose={() => setShow(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setShow(false)}>
            <Pressable
              style={[
                styles.sheet,
                { backgroundColor: theme.colors.surface },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetHeader}>
                <Text
                  style={[
                    styles.sheetTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {label || "Date"}
                </Text>
                <Button mode="text" compact onPress={() => setShow(false)}>
                  Cancel
                </Button>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                themeVariant={theme.dark ? "dark" : "light"}
                minimumDate={min ? parseYmd(min) || undefined : undefined}
                maximumDate={max ? parseYmd(max) || undefined : undefined}
                style={styles.spinner}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setDraft(selectedDate);
                }}
              />
              <Button
                mode="contained"
                onPress={confirmIos}
                style={styles.doneBtn}
              >
                Done
              </Button>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    maxWidth: "100%",
    minWidth: 0,
    position: "relative",
    overflow: "visible",
  },
  input: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    width: "100%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  spinner: {
    width: "100%",
    alignSelf: "center",
  },
  doneBtn: {
    marginTop: 8,
  },
});
