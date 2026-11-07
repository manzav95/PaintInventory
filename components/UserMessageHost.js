import React, { useCallback, useEffect, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import UserMessageService from "../services/userMessageService";
import { displayUserName } from "../utils/displayUserName";
import { radius, space } from "../theme/tokens";

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UserMessageHost({ userName, paused = false, onCountChange }) {
  const theme = useTheme();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userName || paused) return;
    try {
      const data = await UserMessageService.unread();
      setQueue(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      /* badge is best-effort */
    }
  }, [userName, paused]);

  useEffect(() => {
    if (!userName || paused) {
      setQueue([]);
      return undefined;
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [userName, paused, load]);

  useEffect(() => {
    onCountChange?.(queue.length);
  }, [queue, onCountChange]);

  const current = queue[0] || null;

  const ack = async () => {
    if (!current?.id || busy) return;
    setBusy(true);
    try {
      const data = await UserMessageService.markRead(current.id);
      setQueue(Array.isArray(data.messages) ? data.messages : queue.slice(1));
    } catch {
      setQueue((rows) => rows.slice(1));
    } finally {
      setBusy(false);
    }
  };

  if (!current || paused) return null;

  const heading =
    current.title ||
    (current.kind === "reminder" ? "Reminder" : "Message");
  const from = displayUserName(current.fromUser, "Admin");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.scrim}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.kicker, { color: theme.colors.primary }]}>
            {current.kind === "reminder" ? "Reminder" : "Message"} · from {from}
          </Text>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {heading}
          </Text>
          <Text style={[styles.body, { color: theme.colors.onSurface }]}>
            {current.body}
          </Text>
          {current.createdAt ? (
            <Text style={[styles.when, { color: theme.colors.onSurfaceVariant }]}>
              {formatWhen(current.createdAt)}
              {queue.length > 1 ? ` · ${queue.length} waiting` : ""}
            </Text>
          ) : null}
          <AppButton mode="contained" onPress={ack} loading={busy} disabled={busy}>
            Got it
          </AppButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.lg || 12,
    padding: space[5] || 20,
    gap: 10,
  },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 22 },
  when: { fontSize: 12, marginBottom: 4 },
});
