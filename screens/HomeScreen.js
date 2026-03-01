import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Card,
  Button,
  Text,
  Title,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import AuditService from "../services/auditService";

function formatAction(action, details) {
  if (action === "update" && details?._actionType === "check_in") return "Checked In";
  if (action === "update" && details?._actionType === "check_out") return "Checked Out";
  if (action === "add") return "New Entry";
  if (action === "check_in") return "Checked In";
  if (action === "check_out") return "Checked Out";
  if (action === "update") return "Manual Adjustment";
  if (action === "delete") return "Deleted";
  if (action === "change_id") return "ID Changed";
  return action;
}

function getActionColor(action, details) {
  if (action === "update" && details?._actionType === "check_in") return "#81c784";
  if (action === "update" && details?._actionType === "check_out") return "#e57373";
  if (action === "check_in") return "#81c784";
  if (action === "check_out") return "#e57373";
  if (action === "add") return "#64b5f6";
  if (action === "delete") return "#f44336";
  if (action === "update") return "#ba68c8";
  return "#757575";
}

function getQuantityDisplay(action, details) {
  if (!details) return "-";
  const isCheckInOut =
    action === "check_in" ||
    action === "check_out" ||
    (action === "update" &&
      details._actionType &&
      (details._actionType === "check_in" || details._actionType === "check_out"));
  if (isCheckInOut && typeof details.quantityChange === "number") {
    return String(details.quantityChange);
  }
  if (action === "update" && typeof details.quantityChange === "number") {
    return String(details.quantityChange);
  }
  if (action === "add" && typeof details.quantity === "number") {
    return String(details.quantity);
  }
  return "-";
}

export default function HomeScreen({
  onScanQR,
  onAddManual,
  onViewInventory,
  inventory,
  minQuantity = 30,
  userName,
  isAdmin,
  onSwitchUser,
  nextIdNumber,
  onSetNextIdNumber,
  isDarkMode,
  onToggleDarkMode,
  onRefresh,
  isRefreshing = false,
  onOpenSettings,
  isWeb = false,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024;
  const [auditLogs, setAuditLogs] = useState([]);

  const lowStockItems = useMemo(
    () =>
      inventory.filter(
        (item) =>
          (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30),
      ),
    [inventory, minQuantity],
  );

  const loadAuditLogs = async () => {
    try {
      const logs = await AuditService.list(200);
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error("HomeScreen audit load:", e);
    }
  };

  useEffect(() => {
    if (!isDesktop) loadAuditLogs();
  }, [isDesktop]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const mobileTransactionLogs = useMemo(() => {
    if (isDesktop) return [];
    const todayLogs = auditLogs.filter((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t >= todayStart && t <= todayEnd;
    });
    if (isAdmin) return todayLogs;
    return todayLogs.filter((log) => {
      const a = log.action;
      const d = log.details;
      if (a === "check_in" || a === "check_out" || a === "delete") return true;
      if (a === "update" && d?._actionType && (d._actionType === "check_in" || d._actionType === "check_out")) return true;
      return false;
    });
  }, [auditLogs, isDesktop, todayStart, todayEnd, isAdmin]);

  const getDisplayUserName = (log) => {
    const u = (log.userName || "").trim().toLowerCase();
    if (u && u !== "unknown") return log.userName;
    const adminOnly =
      ["add", "change_id", "set_next_id", "set_min_quantity", "delete"].includes(log.action) ||
      (log.action === "update" && !(log.details?._actionType === "check_in" || log.details?._actionType === "check_out"));
    return adminOnly ? "Admin" : (log.userName || "Unknown");
  };

  const handleRefresh = async () => {
    await onRefresh?.();
    if (!isDesktop) await loadAuditLogs();
  };

  const qrButtonText = isDesktop ? "Manual Entry" : "QR Scan or Text Input";
  const getItemName = (itemId) =>
    inventory.find((i) => i.id === itemId)?.name || itemId || "Unknown";

  const actionButtons = (
    <>
      {isAdmin && (
        <Button
          mode="contained"
          onPress={onAddManual}
          style={styles.button}
          icon="plus-circle"
        >
          Add Item Manually
        </Button>
      )}
      <Button
        mode="contained"
        onPress={onScanQR}
        style={styles.button}
        icon={isDesktop ? "keyboard" : "qrcode-scan"}
      >
        {qrButtonText}
      </Button>
      <Button
        mode="outlined"
        onPress={onViewInventory}
        style={styles.button}
        icon="format-list-bulleted"
      >
        View Inventory
      </Button>
    </>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
        isWeb && styles.webContainer,
      ]}
    >
      {!isWeb && (
        <View style={styles.headerBar}>
          <Title style={styles.title}>Paint Inventory</Title>
          <View style={styles.headerButtons}>
            <IconButton
              icon="refresh"
              size={24}
              onPress={handleRefresh}
              disabled={isRefreshing}
              iconColor={theme.colors.primary}
            />
            {isRefreshing && (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={styles.refreshIndicator}
              />
            )}
            <IconButton
              icon="cog"
              size={24}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
          </View>
        </View>
      )}
      {isWeb && (
        <View style={styles.webHeader}>
          <Title style={styles.webTitle}>Paint Inventory</Title>
          <View style={styles.webHeaderButtons}>
            <IconButton
              icon="refresh"
              size={20}
              onPress={handleRefresh}
              disabled={isRefreshing}
              iconColor={theme.colors.primary}
            />
            <IconButton
              icon="cog"
              size={20}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
          </View>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && styles.webScrollContent,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          !isWeb ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.content}>
          {isDesktop ? (
            <>
              {lowStockItems.length > 0 ? (
                <Card style={styles.card}>
                  <Card.Content>
                    <Text style={styles.statLabel}>
                      Low Stock ({"< 30"} gallons)
                    </Text>
                    {lowStockItems.map((item) => (
                      <View key={item.id} style={styles.lowStockItem}>
                        <Text style={styles.lowStockName}>
                          {item.name || "Unnamed"}
                        </Text>
                        <Text style={styles.lowStockQty}>
                          {item.quantity || 0} gal
                        </Text>
                      </View>
                    ))}
                  </Card.Content>
                </Card>
              ) : (
                <Card style={styles.card}>
                  <Card.Content>
                    <Text style={styles.statLabel}>All paints in stock</Text>
                    <Text style={styles.statValue}>✓</Text>
                  </Card.Content>
                </Card>
              )}
              {actionButtons}
            </>
          ) : (
            <>
              {actionButtons}
              <Card style={styles.card}>
                <Card.Content>
                  <Text style={styles.sectionTitle}>Today's transactions</Text>
                  {mobileTransactionLogs.length === 0 ? (
                    <Text style={styles.emptyLogs}>No transactions today</Text>
                  ) : (
                    mobileTransactionLogs.map((log, index) => {
                      const actionText = formatAction(log.action, log.details);
                      const color = getActionColor(log.action, log.details);
                      const itemName = getItemName(log.itemId);
                      const qtyStr = getQuantityDisplay(log.action, log.details);
                      const d = log.timestamp ? new Date(log.timestamp) : null;
                      const dateTimeStr = d
                        ? `${d.toLocaleString("en-US", { month: "short", day: "numeric" })} @ ${d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s/g, "")}`
                        : "";
                      return (
                        <View
                          key={`${log.timestamp}-${log.itemId}-${index}`}
                          style={[
                            styles.transactionRow,
                            index < mobileTransactionLogs.length - 1 && styles.transactionRowBorder,
                          ]}
                        >
                          <View style={styles.transactionLeftCol}>
                            <Text
                              style={[
                                styles.transactionDateTime,
                                { color: theme.dark ? "#aaa" : "#666" },
                              ]}
                              numberOfLines={1}
                            >
                              {dateTimeStr}
                            </Text>
                            <Text
                              style={[
                                styles.transactionUser,
                                { color: theme.dark ? "#999" : "#888" },
                              ]}
                              numberOfLines={1}
                            >
                              {getDisplayUserName(log)}
                            </Text>
                          </View>
                          <View style={[styles.transactionActionCol, { backgroundColor: color + "22" }]}>
                            <Text
                              style={[styles.transactionActionText, { color }]}
                              numberOfLines={2}
                            >
                              {actionText}
                            </Text>
                          </View>
                          <View style={styles.transactionQtyCol}>
                            <Text
                              style={[
                                styles.transactionQty,
                                { color: theme.colors.onSurface },
                              ]}
                              numberOfLines={1}
                            >
                              {qtyStr !== "-" ? `${qtyStr} gal` : "-"}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.transactionColor,
                              { color: theme.colors.onSurface },
                            ]}
                            numberOfLines={2}
                          >
                            {itemName}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </Card.Content>
              </Card>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Logged in as{" "}
              <Text style={styles.mono}>{isAdmin ? "Admin" : userName}</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 6,
    paddingBottom: 48,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "transparent",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  header: {
    marginTop: 30,
    marginBottom: 30,
    alignItems: "center",
  },
  refreshIndicator: {
    marginLeft: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  card: {
    marginBottom: 30,
    elevation: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
    color: "#6f95ab",
  },
  lowStockItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  lowStockName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff6b6b",
    flex: 1,
  },
  lowStockQty: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff6b6b",
  },
  button: {
    marginBottom: 15,
    paddingVertical: 8,
  },
  warning: {
    color: "#ff6b6b",
    textAlign: "center",
    marginBottom: 15,
    fontSize: 12,
  },
  footer: {
    alignItems: "center",
    paddingTop: 10,
  },
  footerText: {
    color: "#666",
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 6,
  },
  toggleLabel: {
    color: "#666",
    fontWeight: "600",
  },
  mono: {
    fontFamily: "monospace",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  emptyLogs: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 16,
  },
  transactionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  transactionLeftCol: {
    width: 88,
    flexShrink: 0,
  },
  transactionDateTime: {
    fontSize: 11,
    fontWeight: "500",
  },
  transactionUser: {
    fontSize: 10,
    marginTop: 1,
  },
  transactionActionCol: {
    width: 78,
    flexShrink: 0,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    minHeight: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  transactionActionText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
  },
  transactionQtyCol: {
    width: 38,
    flexShrink: 0,
  },
  transactionQty: {
    fontSize: 11,
  },
  transactionColor: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    minWidth: 0,
  },
  webContainer: {
    paddingTop: 8,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  webHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  webScrollContent: {
    padding: 0,
    paddingTop: 0,
    paddingBottom: 20,
  },
});
