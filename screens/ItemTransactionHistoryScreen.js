import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import {
  Card,
  Text,
  Title,
  Button,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import AuditService from "../services/auditService";

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;

function getActionColor(action, details) {
  if (action === "update" && details?._actionType) {
    if (details._actionType === "check_in") return "#81c784";
    if (details._actionType === "check_out") return "#e57373";
    if (details._actionType === "receiving") return "#64b5f6";
  }
  switch (action) {
    case "check_in": return "#81c784";
    case "check_out": return "#e57373";
    case "receiving": return "#64b5f6";
    case "add": return "#64b5f6";
    case "delete": return "#f44336";
    case "update": return "#ba68c8";
    case "change_id": return "#ff5722";
    default: return "#757575";
  }
}

function formatAction(action, details) {
  if (action === "update" && details?._actionType) {
    if (details._actionType === "check_in") return "Checked In";
    if (details._actionType === "check_out") return "Checked Out";
    if (details._actionType === "receiving") return "Receiving";
  }
  const map = {
    add: "New Entry",
    check_in: "Checked In",
    check_out: "Checked Out",
    receiving: "Receiving",
    update: "Manual Adjustment",
    delete: "Deleted",
    change_id: "ID Changed",
    set_next_id: "Next ID Set",
  };
  return map[action] ?? action;
}

function getQuantity(action, details) {
  if (!details) return "-";
  const isCheckInOut =
    action === "check_in" ||
    action === "check_out" ||
    action === "receiving" ||
    (action === "update" &&
      details._actionType &&
      (details._actionType === "check_in" || details._actionType === "check_out" || details._actionType === "receiving"));
  if (isCheckInOut) {
    const q = details.quantityChange ?? details._quantityChange;
    if (typeof q === "number") return Math.abs(q);
  }
  if (action === "update" && typeof details.quantityChange === "number") {
    return Math.abs(details.quantityChange);
  }
  if (action === "add" && typeof details.quantity === "number") return details.quantity;
  return "-";
}

function getTotalQuantity(action, details) {
  if (!details) return "-";
  if (typeof details.newQuantity === "number") return details.newQuantity;
  const isCheckInOut =
    action === "check_in" ||
    action === "check_out" ||
    action === "receiving" ||
    (action === "update" && details._actionType && (details._actionType === "check_in" || details._actionType === "check_out" || details._actionType === "receiving"));
  if (isCheckInOut && typeof details.quantity === "number") return details.quantity;
  if (action === "update" && typeof details.quantity === "number") return details.quantity;
  if (action === "add" && typeof details.quantity === "number") return details.quantity;
  if (action === "delete") return 0;
  return "-";
}

function getDisplayUserName(log) {
  const u = (log.userName || "").trim().toLowerCase();
  if (u && u !== "unknown") return log.userName;
  const adminOnly =
    ["add", "change_id", "set_next_id", "set_min_quantity", "delete"].includes(log.action) ||
    (log.action === "update" && !(log.details?._actionType === "check_in" || log.details?._actionType === "check_out" || log.details?._actionType === "receiving"));
  return adminOnly ? "Admin" : (log.userName || "Unknown");
}

export default function ItemTransactionHistoryScreen({ item, onBack }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cutoff = useMemo(() => Date.now() - THREE_MONTHS_MS, []);

  const loadLogs = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const all = await AuditService.list(2000);
      const itemId = item?.id != null ? String(item.id) : "";
      const filtered = (Array.isArray(all) ? all : [])
        .filter((log) => String(log.itemId) === itemId)
        .filter((log) => {
          const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
          return t >= cutoff;
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLogs(filtered);
    } catch (e) {
      console.error("ItemTransactionHistoryScreen load:", e);
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (item) loadLogs();
  }, [item?.id]);

  if (!item) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={onBack}
          iconColor={theme.colors.primary}
        />
        <Title style={styles.title}>Transaction history</Title>
        <View style={styles.placeholder} />
      </View>
      <View style={styles.itemSummary}>
        <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>
          {item.name || "Unnamed"}
        </Text>
        <Text style={[styles.itemId, { color: theme.colors.onSurfaceVariant }]}>
          ID: {item.id} · Last 3 months
        </Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLogs(true)}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.cardContent}>
              {logs.length === 0 ? (
                <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
                  No transactions in the last 3 months
                </Text>
              ) : (
                logs.map((log, index) => {
                  const actionText = formatAction(log.action, log.details);
                  const color = getActionColor(log.action, log.details);
                  const qty = getQuantity(log.action, log.details);
                  const total = getTotalQuantity(log.action, log.details);
                  const dateStr = log.timestamp
                    ? new Date(log.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  return (
                    <View
                      key={`${log.timestamp}-${index}`}
                      style={[
                        styles.row,
                        index < logs.length - 1 && styles.rowBorder,
                        { borderBottomColor: theme.dark ? "#333" : "#eee" },
                      ]}
                    >
                      <View style={styles.rowLeft}>
                        <Text style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>
                          {dateStr}
                        </Text>
                        <Text style={[styles.user, { color: theme.colors.onSurfaceVariant }]}>
                          {getDisplayUserName(log)}
                        </Text>
                      </View>
                      <View style={[styles.actionChip, { backgroundColor: color + "22" }]}>
                        <Text style={[styles.actionText, { color }]}>{actionText}</Text>
                      </View>
                      <Text style={[styles.qty, { color: theme.colors.onSurface }]}>
                        {qty !== "-" ? `${qty}` : "-"}
                      </Text>
                      <Text style={[styles.total, { color: theme.colors.onSurface }]}>
                        {total !== "-" ? `${total} gal` : "-"}
                      </Text>
                    </View>
                  );
                })
              )}
            </Card.Content>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  placeholder: {
    width: 40,
  },
  itemSummary: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "600",
  },
  itemId: {
    fontSize: 13,
    marginTop: 4,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 8,
  },
  empty: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  time: {
    fontSize: 13,
    fontWeight: "500",
  },
  user: {
    fontSize: 12,
    marginTop: 2,
  },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  qty: {
    fontSize: 14,
    fontWeight: "600",
    width: 48,
    textAlign: "right",
  },
  total: {
    fontSize: 14,
    fontWeight: "600",
    width: 56,
    textAlign: "right",
  },
});
