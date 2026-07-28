import React, { useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { TextInput, useTheme } from "react-native-paper";

function focusDomInput(anchorId) {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  const host = document.querySelector(`[data-search-anchor="${anchorId}"]`);
  const input =
    host?.querySelector?.("input") ||
    document.getElementById(anchorId) ||
    null;
  if (!input || typeof input.focus !== "function") return false;
  input.focus();
  if (typeof input.select === "function") {
    try {
      input.select();
    } catch (_) {
      /* ignore */
    }
  }
  return true;
}

/**
 * Outlined search field without left/right icon slots (avoids Searchbar magnify + clear dot).
 * Exposes a reliable .focus() for web (Paper modal often steals focus otherwise).
 */
const OutlinedSearchInput = React.forwardRef(function OutlinedSearchInput(
  {
    value,
    onChangeText,
    placeholder,
    style,
    dense = true,
    inputDomId = "outlined-search-input",
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const innerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      try {
        innerRef.current?.focus?.();
      } catch (_) {
        /* ignore */
      }
      focusDomInput(inputDomId);
    },
    blur: () => {
      try {
        innerRef.current?.blur?.();
      } catch (_) {
        /* ignore */
      }
    },
  }));

  return (
    <View
      style={styles.wrap}
      // RN Web → data-search-anchor="…"
      {...(Platform.OS === "web"
        ? { dataSet: { searchAnchor: inputDomId } }
        : { nativeID: inputDomId })}
    >
      <TextInput
        ref={innerRef}
        mode="outlined"
        dense={dense}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        textAlign="left"
        style={[styles.root, style]}
        contentStyle={styles.inputContent}
        outlineColor={theme.colors.outlineVariant}
        activeOutlineColor={theme.colors.primary}
        {...rest}
      />
    </View>
  );
});

export default OutlinedSearchInput;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  root: {
    backgroundColor: "transparent",
    width: "100%",
    alignSelf: "stretch",
  },
  inputContent: {
    textAlign: "left",
    ...(Platform.OS === "web" && {
      textAlign: "left",
    }),
    ...(Platform.OS === "android" && {
      textAlignVertical: "center",
    }),
  },
});
