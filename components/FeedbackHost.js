import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import {
  Portal,
  Dialog,
  Text,
  TextInput,
  useTheme,
  SegmentedButtons,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "./ui/AppButton";
import {
  subscribeFeedback,
  submitFeedback,
  listFeedback,
} from "../utils/feedback";
import { layout, radius, space } from "../theme/tokens";
import showToast from "../utils/showToast";

function formatWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  return String(status || "").toLowerCase() === "closed" ? "Closed" : "Pending";
}

/**
 * Help & feedback form + user’s own request history.
 */
export default function FeedbackHost() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("feedback");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const resolveRef = useRef(null);

  const loadHistory = useCallback(async (name) => {
    if (!name) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const data = await listFeedback({ userName: name, limit: 50 });
      setHistory(data.messages || []);
    } catch (e) {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    return subscribeFeedback((payload) => {
      if (resolveRef.current) {
        try {
          resolveRef.current(false);
        } catch (_) {
          /* ignore */
        }
      }
      resolveRef.current = payload.resolve;
      const name = payload.userName || "";
      setUserName(name);
      setMessage("");
      setCategory("feedback");
      setBusy(false);
      setOpen(true);
      loadHistory(name);
    });
  }, [loadHistory]);

  const finish = (value) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    setBusy(false);
    setMessage("");
    if (typeof resolve === "function") resolve(value);
  };

  const handleSend = async () => {
    if (busy) return;
    const trimmed = message.trim();
    if (!trimmed) {
      showToast({
        type: "error",
        title: "Message needed",
        message: "Type your feedback, tip, or question first.",
      });
      return;
    }
    setBusy(true);
    const result = await submitFeedback({
      message: trimmed,
      userName,
      category,
    });
    setBusy(false);
    if (result.success) {
      showToast({
        title: "Sent",
        message: "Admin will see your message in the app.",
      });
      setMessage("");
      await loadHistory(userName);
      return;
    }
    showToast({
      type: "error",
      title: "Could not send",
      message: result.error || "Try again.",
      duration: 5000,
    });
  };

  if (!open) return null;

  return (
    <Portal>
      <Dialog
        visible={open}
        onDismiss={() => !busy && finish(false)}
        style={[
          styles.dialog,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: radius.lg,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Dialog.Title style={styles.title}>Help & feedback</Dialog.Title>
          <Dialog.Content style={styles.content}>
            <Text
              style={[
                styles.lead,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Send a tip, bug, or question. Track status below.
            </Text>

            <SegmentedButtons
              value={category}
              onValueChange={setCategory}
              density="medium"
              style={styles.cats}
              buttons={[
                { value: "feedback", label: "Feedback" },
                { value: "bug", label: "Bug" },
                { value: "issue", label: "Issue" },
              ]}
            />

            <TextInput
              mode="outlined"
              label="Your message"
              placeholder="What’s going on, or what would help?"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              style={styles.input}
              contentStyle={styles.inputContent}
              disabled={busy}
            />

            <View
              style={[
                styles.historySection,
                { borderTopColor: theme.colors.outlineVariant },
              ]}
            >
              <View style={styles.historyHead}>
                <Text
                  style={[
                    styles.historyTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  Your requests
                </Text>
                {historyLoading ? <ActivityIndicator size="small" /> : null}
              </View>

              {history.length === 0 && !historyLoading ? (
                <Text
                  style={[
                    styles.empty,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  No previous messages yet.
                </Text>
              ) : (
                <ScrollView
                  style={styles.historyScroll}
                  contentContainerStyle={styles.historyScrollContent}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {history.map((row) => {
                    const closed =
                      String(row.status || "").toLowerCase() === "closed";
                    return (
                      <View
                        key={row.id}
                        style={[
                          styles.histRow,
                          {
                            borderColor: theme.colors.outlineVariant,
                            backgroundColor: closed
                              ? "transparent"
                              : theme.dark
                                ? "rgba(201,151,46,0.1)"
                                : "rgba(201,151,46,0.08)",
                          },
                        ]}
                      >
                        <View style={styles.histTop}>
                          <Text
                            style={{
                              color: closed
                                ? theme.colors.onSurfaceVariant
                                : theme.colors.primary,
                              fontWeight: "700",
                              fontSize: 11,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                            }}
                          >
                            {statusLabel(row.status)}
                            {row.category ? ` · ${row.category}` : ""}
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.onSurfaceVariant,
                              fontSize: 12,
                            }}
                          >
                            {formatWhen(row.createdAt)}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: theme.colors.onSurface,
                            fontSize: 13,
                            lineHeight: 18,
                          }}
                          numberOfLines={3}
                        >
                          {row.message}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </Dialog.Content>

          <Dialog.Actions style={styles.actions}>
            <AppButton
              mode="text"
              onPress={() => finish(false)}
              disabled={busy}
            >
              Close
            </AppButton>
            <AppButton
              mode="contained"
              onPress={handleSend}
              loading={busy}
              disabled={busy || !message.trim()}
              icon="send"
            >
              Send
            </AppButton>
          </Dialog.Actions>
        </KeyboardAvoidingView>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: "center",
    width: layout.modalMaxWidthLg,
    maxWidth: "92%",
    marginHorizontal: 20,
  },
  title: {
    marginBottom: 0,
    paddingBottom: space[2],
  },
  content: {
    paddingTop: space[1],
    paddingBottom: space[2],
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space[5],
  },
  cats: {
    marginBottom: space[5],
  },
  input: {
    marginBottom: space[6],
  },
  inputContent: {
    minHeight: 88,
    paddingTop: space[3],
  },
  historySection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space[5],
  },
  historyHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[3],
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyScroll: {
    maxHeight: 160,
  },
  historyScrollContent: {
    paddingBottom: space[1],
    gap: space[2],
  },
  histRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: 4,
  },
  histTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space[2],
  },
  actions: {
    paddingTop: space[2],
    paddingBottom: space[3],
    paddingHorizontal: space[4],
    gap: space[2],
    justifyContent: "flex-end",
  },
});
