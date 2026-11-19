import React from "react";
import { Platform, View, StyleSheet } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import useKeyboardBottomInset from "../utils/useKeyboardBottomInset";

/**
 * Lifts screen content above the keyboard.
 * Native: react-native-keyboard-controller.
 * Web: Visual Viewport padding (Controller is a stub on web).
 */
export default function KeyboardScreen({
  children,
  style,
  offset = 0,
  fill = true,
}) {
  const webInset = useKeyboardBottomInset();
  const fillStyle = fill ? styles.fill : null;

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          fillStyle,
          style,
          webInset ? { paddingBottom: webInset + offset } : null,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[fillStyle, style]}
      behavior="padding"
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 0,
  },
});
