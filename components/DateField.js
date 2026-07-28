import React, { useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { TextInput, useTheme } from "react-native-paper";

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
  const theme = useTheme();

  const nativeDate = useMemo(() => parseYmd(value) || new Date(), [value]);

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
            type="date"
            value={String(value ?? "")}
            disabled={disabled}
            min={min}
            max={max}
            onChange={(e) => onChange?.(e.target.value)}
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
        value={formatMdy(value)}
        mode={mode}
        editable={false}
        disabled={disabled}
        style={styles.nativeInput}
        outlineColor={theme.colors?.outline}
        activeOutlineColor={theme.colors?.primary}
        textColor={theme.colors?.onSurface}
        right={<TextInput.Icon icon="calendar" onPress={() => setShow(true)} />}
        onPressIn={() => !disabled && setShow(true)}
      />
      {show && (
        <DateTimePicker
          value={nativeDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={theme.dark ? "dark" : "light"}
          onChange={(_, selectedDate) => {
            if (Platform.OS !== "ios") setShow(false);
            if (selectedDate) onChange?.(toYmd(selectedDate));
          }}
        />
      )}
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
});
