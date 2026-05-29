import React from "react";
import { Platform, StyleSheet } from "react-native";
import { TextInput, useTheme } from "react-native-paper";

/**
 * Outlined search field without left/right icon slots (avoids Searchbar magnify + clear dot).
 */
export default function OutlinedSearchInput({
  value,
  onChangeText,
  placeholder,
  style,
  dense = true,
  ...rest
}) {
  const theme = useTheme();

  return (
    <TextInput
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
  );
}

const styles = StyleSheet.create({
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
