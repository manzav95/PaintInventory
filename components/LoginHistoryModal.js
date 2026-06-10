import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  Button,
  useTheme,
  ActivityIndicator,
  IconButton,
} from "react-native-paper";
import LoginLogService from "../services/loginLogService";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function formatLoginTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayUserName(userName) {
  const n = String(userName ?? "").trim();
  return n === "admin123" ? "Admin" : n || "Unknown";
}

export default function LoginHistoryModal({ visible, onDismiss }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= DESKTOP_BREAKPOINT;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await LoginLogService.list(1000);
      setLogs(rows);
    } catch (e) {
      setError(e?.message || "Failed to load login history");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable
          style={[
            styles.card,
            isWide && styles.cardWide,
            { backgroundColor: theme.colors.surfaceContainerHighest },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              User login history
            </Text>
            <IconButton icon="close" size={20} onPress={onDismiss} />
          </View>
          <Text
            style={[
              styles.hint,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Each sign-in is recorded with a timestamp (newest first).
          </Text>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator />
              <Text
                style={[
                  styles.loadingText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Loading…
              </Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: theme.colors.error }]}>
                {error}
              </Text>
              <Button mode="outlined" onPress={load} style={styles.retryBtn}>
                Retry
              </Button>
            </View>
          ) : logs.length === 0 ? (
            <Text
              style={[
                styles.emptyText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              No logins recorded yet.
            </Text>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator>
              {logs.map((row) => (
                <View
                  key={row.id}
                  style={[
                    styles.row,
                    { borderBottomColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[styles.userName, { color: theme.colors.onSurface }]}
                  >
                    {displayUserName(row.user_name)}
                  </Text>
                  <Text
                    style={[
                      styles.timestamp,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {formatLoginTime(row.logged_in_at)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Button mode="outlined" onPress={onDismiss} style={styles.closeBtn}>
            Close
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    maxHeight: "85%",
    width: "100%",
    alignSelf: "center",
  },
  cardWide: {
    maxWidth: 560,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
  hint: {
    fontSize: 13,
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 420,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 13,
    marginTop: 2,
  },
  centered: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
  closeBtn: {
    marginTop: 4,
  },
});
