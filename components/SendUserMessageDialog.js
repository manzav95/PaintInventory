import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Dialog,
  Menu,
  Portal,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import AppButton from "./ui/AppButton";
import UserService from "../services/userService";
import UserMessageService from "../services/userMessageService";
import { displayUserName } from "../utils/displayUserName";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";

const EVERYONE = "*";

export default function SendUserMessageDialog({
  visible,
  onDismiss,
  initialToUser = "",
  lockedToUser = false,
}) {
  const theme = useTheme();
  const [users, setUsers] = useState([]);
  const [toUser, setToUser] = useState(initialToUser || EVERYONE);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("reminder");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    setToUser(initialToUser || EVERYONE);
    setTitle("");
    setBody("");
    setKind("reminder");
    let cancel = false;
    UserService.list()
      .then((rows) => {
        if (!cancel) setUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancel) setUsers([]);
      });
    return () => {
      cancel = true;
    };
  }, [visible, initialToUser]);

  const selectedLabel = useMemo(() => {
    if (toUser === EVERYONE) return "Everyone on the floor";
    const row = users.find(
      (item) =>
        String(item.user_name || "").toLowerCase() ===
        String(toUser || "").toLowerCase(),
    );
    return displayUserName(row?.user_name || toUser);
  }, [toUser, users]);

  const send = async () => {
    const text = body.trim();
    if (!text) {
      showToast({ type: "error", title: "Type a message", message: "Reminders need a note." });
      return;
    }
    if (toUser === EVERYONE) {
      const ok = await confirmAction(
        "Send to everyone?",
        "Everyone signed in will see this on screen until they tap Got it.",
        { confirmLabel: "Send to everyone" },
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await UserMessageService.send({
        toUser,
        title: title.trim(),
        body: text,
        kind,
      });
      showToast({
        title: "Sent",
        message:
          toUser === EVERYONE
            ? "Everyone will see this on screen."
            : `${selectedLabel} will see this on screen.`,
      });
      onDismiss?.();
    } catch (error) {
      showToast({
        type: "error",
        title: "Could not send",
        message: error.message || "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={busy ? undefined : onDismiss}
        style={{ backgroundColor: theme.colors.surfaceContainerHighest }}
      >
        <Dialog.Title>Send on-screen message</Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 10 }}>
            They will see this over the app until they tap Got it.
          </Text>
          {lockedToUser ? (
            <Text style={{ color: theme.colors.onSurface, fontWeight: "700", marginBottom: 8 }}>
              To {selectedLabel}
            </Text>
          ) : (
            <Menu
              visible={pickerOpen}
              onDismiss={() => setPickerOpen(false)}
              anchor={
                <AppButton
                  mode="outlined"
                  icon="account"
                  onPress={() => setPickerOpen(true)}
                  style={{ marginBottom: 8, alignSelf: "flex-start" }}
                >
                  {selectedLabel}
                </AppButton>
              }
            >
              <Menu.Item
                title="Everyone on the floor"
                onPress={() => {
                  setToUser(EVERYONE);
                  setPickerOpen(false);
                }}
              />
              {users.map((row) => (
                <Menu.Item
                  key={row.id || row.user_name}
                  title={displayUserName(row.user_name)}
                  onPress={() => {
                    setToUser(row.user_name);
                    setPickerOpen(false);
                  }}
                />
              ))}
            </Menu>
          )}
          <View style={styles.kindRow}>
            <AppButton
              compact
              mode={kind === "reminder" ? "contained" : "outlined"}
              onPress={() => setKind("reminder")}
            >
              Reminder
            </AppButton>
            <AppButton
              compact
              mode={kind === "info" ? "contained" : "outlined"}
              onPress={() => setKind("info")}
            >
              Info
            </AppButton>
          </View>
          <TextInput
            mode="outlined"
            label="Title (optional)"
            value={title}
            onChangeText={setTitle}
            style={{ marginTop: 8 }}
          />
          <TextInput
            mode="outlined"
            label="Message"
            value={body}
            onChangeText={setBody}
            multiline
            style={{ marginTop: 8 }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <AppButton mode="text" onPress={onDismiss} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton mode="contained" onPress={send} loading={busy} disabled={busy}>
            Send
          </AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
});
