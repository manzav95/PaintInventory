import React, { useMemo, useState, useRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text, TextInput, useTheme } from "react-native-paper";

import AppButton from "./ui/AppButton";
/** Parse "3:00 PM" / "15:00" into hours+minutes. */
function parseTimeParts(value) {
  const s = String(value ?? "").trim();
  const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
  }
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
  }
  return null;
}

function toDateWithTime(value) {
  const parts = parseTimeParts(value);
  const d = new Date();
  if (!parts) return d;
  d.setHours(parts.h, parts.m, 0, 0);
  return d;
}

function format12h(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function toHtmlTimeValue(value) {
  const parts = parseTimeParts(value);
  if (!parts) return "";
  return `${String(parts.h).padStart(2, "0")}:${String(parts.m).padStart(2, "0")}`;
}

function fromHtmlTimeValue(hhmm) {
  const parts = parseTimeParts(hhmm);
  if (!parts) return "";
  const d = new Date();
  d.setHours(parts.h, parts.m, 0, 0);
  return format12h(d);
}

/**
 * Time field: native picker on iOS/Android; transparent overlay input on web
 * so the user taps the real control (required on mobile browsers).
 * Value format: "3:00 PM"
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
  pointerEvents: "auto",
};

export default function TimeField({
  label = "Time",
  value,
  onChange,
  style,
  disabled = false,
  mode = "outlined",
}) {
  const isWeb = Platform.OS === "web";
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(() => toDateWithTime(value));
  const theme = useTheme();
  const webInputRef = useRef(null);

  const displayValue = useMemo(() => {
    const parts = parseTimeParts(value);
    if (!parts) return String(value ?? "");
    const d = new Date();
    d.setHours(parts.h, parts.m, 0, 0);
    return format12h(d);
  }, [value]);

  const openPicker = () => {
    if (disabled) return;
    setDraft(toDateWithTime(value));
    setShow(true);
  };

  const confirm = () => {
    onChange?.(format12h(draft));
    setShow(false);
  };

  const field = (
    <TextInput
      label={label}
      value={displayValue}
      mode={mode}
      editable={false}
      disabled={disabled}
      style={styles.nativeInput}
      outlineColor={theme.colors?.outlineVariant ?? theme.colors?.outline}
      activeOutlineColor={theme.colors?.primary}
      textColor={theme.colors?.onSurface}
      right={<TextInput.Icon icon="clock-outline" disabled={disabled} />}
    />
  );

  if (isWeb) {
    return (
      <View style={[styles.wrap, style]}>
        <View pointerEvents="none">{field}</View>
        <input
          ref={webInputRef}
          type="time"
          value={toHtmlTimeValue(value)}
          disabled={disabled}
          aria-label={label || "Choose time"}
          onChange={(e) => {
            const next = fromHtmlTimeValue(e.target.value);
            if (next) onChange?.(next);
          }}
          style={webOverlayInputStyle}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label || "Choose time"}
      >
        <View pointerEvents="none">{field}</View>
      </Pressable>
      {Platform.OS === "android" && show ? (
        <DateTimePicker
          value={draft}
          mode="time"
          display="default"
          is24Hour={false}
          themeVariant={theme.dark ? "dark" : "light"}
          onChange={(event, selectedDate) => {
            if (event?.type === "dismissed") {
              setShow(false);
              return;
            }
            setShow(false);
            if (selectedDate) onChange?.(format12h(selectedDate));
          }}
        />
      ) : null}
      {Platform.OS === "ios" ? (
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
                  {label}
                </Text>
                <AppButton mode="text" compact onPress={() => setShow(false)}>
                  Cancel
                </AppButton>
              </View>
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                is24Hour={false}
                locale="en-US"
                themeVariant={theme.dark ? "dark" : "light"}
                style={styles.spinner}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setDraft(selectedDate);
                }}
              />
              <AppButton mode="contained" onPress={confirm} style={styles.doneBtn}>
                Done
              </AppButton>
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
  },
  nativeInput: {
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
