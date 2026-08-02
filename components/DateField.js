import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
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

/**
 * Outlined date field that matches Paper TextInput chrome on every platform.
 * Web uses a hidden native date input (avoids type=date overflow / missing right border).
 */
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
  const hiddenRef = useRef(null);

  const nativeDate = useMemo(() => parseYmd(value) || new Date(), [value]);
  const display = formatMdy(value);

  const openWebPicker = () => {
    if (disabled) return;
    const el = hiddenRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch (_) {
      /* fall through */
    }
    el.focus();
    el.click();
  };

  const openNativePicker = () => {
    if (!disabled) setShow(true);
  };

  const open = isWeb ? openWebPicker : openNativePicker;

  return (
    <View style={[styles.wrap, style]}>
      {isWeb ? (
        <input
          ref={hiddenRef}
          type="date"
          value={String(value ?? "")}
          disabled={disabled}
          min={min}
          max={max}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onChange?.(e.target.value)}
          style={styles.hiddenNative}
        />
      ) : null}

      <Pressable
        onPress={open}
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
            outlineColor={theme.colors?.outlineVariant ?? theme.colors?.outline}
            activeOutlineColor={theme.colors?.primary}
            textColor={theme.colors?.onSurface}
            placeholder="MM/DD/YYYY"
            right={<TextInput.Icon icon="calendar" disabled={disabled} />}
          />
        </View>
      </Pressable>

      {!isWeb && show ? (
        <DateTimePicker
          value={nativeDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant={theme.dark ? "dark" : "light"}
          minimumDate={min ? parseYmd(min) || undefined : undefined}
          maximumDate={max ? parseYmd(max) || undefined : undefined}
          onChange={(_, selectedDate) => {
            if (Platform.OS !== "ios") setShow(false);
            if (selectedDate) onChange?.(toYmd(selectedDate));
          }}
        />
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
    backgroundColor: "transparent",
  },
  hiddenNative: {
    position: "absolute",
    opacity: 0.01,
    width: 1,
    height: 1,
    left: 0,
    top: 0,
    zIndex: -1,
    border: "none",
    padding: 0,
    margin: 0,
  },
});
