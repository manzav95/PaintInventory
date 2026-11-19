import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet, { SheetAction } from "./ui/AppSheet";
import UserService from "../services/userService";
import UserMessageService from "../services/userMessageService";
import { displayUserName } from "../utils/displayUserName";
import showToast from "../utils/showToast";

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
  const [picking, setPicking] = useState(false);
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
    setPicking(false);
    let cancelled = false;
    UserService.getAll()
      .then((rows) => {
        if (!cancelled) setUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, initialToUser]);

  const selectedLabel =
    toUser === EVERYONE ? "Everyone on the floor" : displayUserName(toUser);

  const send = async () => {
    const text = String(body || "").trim();
    if (!text) {
      showToast({
        type: "error",
        title: "Message needed",
        message: "Type the on-screen message first.",
      });
      return;
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

  const pickerUsers = useMemo(
    () =>
      users.filter((row) => String(row.user_name || "").trim()),
    [users],
  );

  return (
    <AppSheet
      visible={visible}
      onDismiss={busy ? undefined : onDismiss}
      title={picking ? "Send to" : "Send on-screen message"}
      subtitle={
        picking
          ? null
          : "They will see this over the app until they tap Got it."
      }
      keyboard={!picking}
      footer={
        picking ? null : (
          <View style={{ gap: 8 }}>
            <AppButton
              mode="contained"
              onPress={send}
              loading={busy}
              disabled={busy}
            >
              Send
            </AppButton>
            <AppButton mode="outlined" onPress={onDismiss} disabled={busy}>
              Cancel
            </AppButton>
          </View>
        )
      }
    >
      {picking ? (
        <>
          <SheetAction
            title="Everyone on the floor"
            onPress={() => {
              setToUser(EVERYONE);
              setPicking(false);
            }}
          />
          {pickerUsers.map((row) => (
            <SheetAction
              key={row.id || row.user_name}
              title={displayUserName(row.user_name)}
              onPress={() => {
                setToUser(row.user_name);
                setPicking(false);
              }}
            />
          ))}
        </>
      ) : (
        <>
          {lockedToUser ? (
            <Text
              style={{
                color: theme.colors.onSurface,
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              To {selectedLabel}
            </Text>
          ) : (
            <AppButton
              mode="outlined"
              icon="account"
              onPress={() => setPicking(true)}
              style={{ marginBottom: 8, alignSelf: "flex-start" }}
            >
              {selectedLabel}
            </AppButton>
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
        </>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
});
