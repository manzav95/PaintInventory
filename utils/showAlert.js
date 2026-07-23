import { Alert, Platform } from "react-native";

/**
 * Visible alert on web and native.
 * RN Web's Alert.alert is often a no-op, so we use window.alert there.
 */
export default function showAlert(title, message, buttons) {
  const body = message != null && String(message).trim() !== ""
    ? String(message)
    : "";
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.alert === "function"
  ) {
    window.alert(body ? `${title}\n\n${body}` : String(title || ""));
    const ok = Array.isArray(buttons)
      ? buttons.find((b) => b?.style !== "cancel") || buttons[buttons.length - 1]
      : null;
    if (ok && typeof ok.onPress === "function") {
      try {
        ok.onPress();
      } catch (_) {
        /* ignore */
      }
    }
    return;
  }
  if (Array.isArray(buttons) && buttons.length > 0) {
    Alert.alert(title, body || undefined, buttons);
  } else {
    Alert.alert(title, body || undefined);
  }
}
