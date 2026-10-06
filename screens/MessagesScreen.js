import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import {
  Text,
  useTheme,
  ActivityIndicator,
  SegmentedButtons,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import { listFeedback, updateFeedbackStatus, subscribeFeedbackChanged } from "../utils/feedback";
import showToast from "../utils/showToast";
import { radius } from "../theme/tokens";

function formatWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Admin inbox for in-app feedback / bugs / issues.
 */
export default function MessagesScreen({
  userName = "Admin",
  embeddedInShell = false,
  onBack,
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await listFeedback({
        isAdmin: true,
        status: filter === "all" ? null : filter,
        limit: 300,
      });
      setRows(data.messages || []);
    } catch (e) {
      setRows([]);
      showToast({
        type: "error",
        title: "Could not load messages",
        message: e?.message || "Try refresh.",
      });
    }
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    return subscribeFeedbackChanged(() => {
      load();
    });
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.userName} ${r.message} ${r.category} ${r.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const setStatus = async (row, status) => {
    if (!row?.id) return;
    setBusyId(row.id);
    try {
      await updateFeedbackStatus(row.id, {
        status,
        closedBy: userName || "Admin",
      });
      await load();
      showToast({
        title: status === "closed" ? "Marked complete" : "Reopened",
        message:
          status === "closed"
            ? "User will see this as closed."
            : "Back to pending.",
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Update failed",
        message: e?.message || "Try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!embeddedInShell ? (
        <PageHeader title="Messages" onBack={onBack} />
      ) : null}
      <View style={styles.inner}>
        <Text style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}>
          Feedback, bugs, and issues from users. Mark complete when done.
        </Text>
        <SegmentedButtons
          value={filter}
          onValueChange={setFilter}
          style={styles.tabs}
          buttons={[
            { value: "pending", label: "Pending" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <OutlinedSearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search user or message"
          style={styles.search}
        />
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.scroll}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            keyboardShouldPersistTaps="handled"
          >
            {filtered.length === 0 ? (
              <Text
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 32,
                }}
              >
                No messages here.
              </Text>
            ) : (
              filtered.map((row) => {
                const closed =
                  String(row.status || "").toLowerCase() === "closed";
                return (
                  <View
                    key={row.id}
                    style={[
                      styles.card,
                      {
                        borderColor: theme.colors.outlineVariant,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <Text
                        style={[
                          styles.user,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {row.userName || "Anonymous"}
                      </Text>
                      <Text
                        style={{
                          color: closed
                            ? theme.colors.onSurfaceVariant
                            : theme.colors.primary,
                          fontWeight: "700",
                          fontSize: 12,
                          textTransform: "uppercase",
                        }}
                      >
                        {closed ? "Closed" : "Pending"}
                        {row.category ? ` · ${row.category}` : ""}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.msg,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {row.message}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        fontSize: 12,
                        marginTop: 6,
                      }}
                    >
                      {formatWhen(row.createdAt)}
                      {closed && row.closedBy
                        ? ` · closed by ${row.closedBy}`
                        : ""}
                    </Text>
                    <View style={styles.actions}>
                      {closed ? (
                        <AppButton
                          mode="outlined"
                          compact
                          loading={busyId === row.id}
                          disabled={busyId === row.id}
                          onPress={() => setStatus(row, "pending")}
                        >
                          Reopen
                        </AppButton>
                      ) : (
                        <AppButton
                          mode="contained"
                          compact
                          loading={busyId === row.id}
                          disabled={busyId === row.id}
                          onPress={() => setStatus(row, "closed")}
                          icon="check"
                        >
                          Mark complete
                        </AppButton>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "web" ? 8 : 4,
    maxWidth: 800,
    width: "100%",
    alignSelf: "center",
  },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  tabs: { marginBottom: 12 },
  search: {
    marginBottom: 12,
    flexGrow: 0,
    flexShrink: 0,
  },
  list: { flex: 1, minHeight: 0 },
  scroll: { paddingBottom: 40, flexGrow: 0 },
  card: {
    borderWidth: 1,
    borderRadius: radius.md || 8,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  user: { fontSize: 15, fontWeight: "700", flex: 1 },
  msg: { fontSize: 14, lineHeight: 20 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
});
