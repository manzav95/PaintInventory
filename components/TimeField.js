import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Text, TextInput, useTheme } from "react-native-paper";

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
 * Time field: scrollable hour / minute / AM·PM wheels on mobile;
 * native time input on web.
 * Value format: "3:00 PM"
 */
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

  if (isWeb) {
    const border = theme.colors?.outline ?? "#ccc";
    const bg = disabled
      ? theme.colors?.surfaceDisabled ?? "#f1f1f1"
      : theme.colors?.surfaceContainerHighest ??
        theme.colors?.surface ??
        "#fff";
    const fg = theme.colors?.onSurface ?? "#111";
    const labelColor = theme.colors?.onSurfaceVariant ?? fg;
    return (
      <View style={[styles.wrap, style]}>
        <label style={styles.webLabel}>
          <div style={{ marginBottom: 6, fontSize: 12, color: labelColor }}>
            {label}
          </div>
          <input
            type="time"
            value={toHtmlTimeValue(value)}
            disabled={disabled}
            onChange={(e) => {
              const next = fromHtmlTimeValue(e.target.value);
              if (next) onChange?.(next);
            }}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              WebkitMinLogicalWidth: 0,
              boxSizing: "border-box",
              padding: 12,
              fontSize: 16,
              borderRadius: 4,
              border: `1px solid ${border}`,
              background: bg,
              color: fg,
              colorScheme: theme.dark ? "dark" : "light",
            }}
          />
        </label>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        label={label}
        value={displayValue}
        mode={mode}
        editable={false}
        disabled={disabled}
        style={styles.nativeInput}
        outlineColor={theme.colors?.outline}
        activeOutlineColor={theme.colors?.primary}
        textColor={theme.colors?.onSurface}
        right={
          <TextInput.Icon icon="clock-outline" onPress={openPicker} />
        }
        onPressIn={openPicker}
      />
      {Platform.OS === "android" && show ? (
        <DateTimePicker
          value={draft}
          mode="time"
          display="spinner"
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
                <Button mode="text" compact onPress={() => setShow(false)}>
                  Cancel
                </Button>
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
              <Button mode="contained" onPress={confirm} style={styles.doneBtn}>
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
    overflow: "hidden",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  webLabel: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
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
