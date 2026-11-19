import React, { useCallback, useEffect, useState } from "react";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet from "./ui/AppSheet";
import UserMessageService from "../services/userMessageService";
import { displayUserName } from "../utils/displayUserName";

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

  const heading =
    current?.title ||
    (current?.kind === "reminder" ? "Reminder" : "Message");
  const from = displayUserName(current?.fromUser, "Admin");
  const kindLabel = current?.kind === "reminder" ? "Reminder" : "Message";

  return (
    <AppSheet
      visible={!!current && !paused}
      dismissable={false}
      title={heading}
      subtitle={`${kindLabel} from ${from}${
        current?.createdAt ? ` · ${formatWhen(current.createdAt)}` : ""
      }${queue.length > 1 ? ` · ${queue.length} waiting` : ""}`}
      footer={
        <AppButton mode="contained" onPress={ack} loading={busy} disabled={busy}>
          Got it
        </AppButton>
      }
    >
      <Text style={{ color: theme.colors.onSurface, fontSize: 16, lineHeight: 22 }}>
        {current?.body}
      </Text>
    </AppSheet>
  );
}
