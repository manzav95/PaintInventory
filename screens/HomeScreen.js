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
import OrderService from "../services/orderService";
import version from "../version";

function formatAction(action, details) {
  if (action === "update" && details?._actionType === "check_in")
    return "Checked In";
  if (action === "update" && details?._actionType === "check_out")
    return "Checked Out";
  if (action === "add") return "New Entry";
  if (action === "check_in") return "Checked In";
  if (action === "check_out") return "Checked Out";
  if (action === "update" && details?._actionType === "receiving")
    return "Receiving";
  if (action === "receiving") return "Receiving";
  if (action === "update") return "Manual Adjustment";
  if (action === "delete") return "Deleted";
  if (action === "change_id") return "ID Changed";
  return action;
}

function getActionColor(action, details) {
  if (action === "update" && details?._actionType === "check_in")
    return "#81c784";
  if (action === "update" && details?._actionType === "check_out")
    return "#e57373";
  if (action === "check_in") return "#81c784";
  if (action === "check_out") return "#e57373";
  if (action === "update" && details?._actionType === "receiving")
    return "#64b5f6";
  if (action === "receiving") return "#64b5f6";
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
    action === "receiving" ||
    (action === "update" &&
      details._actionType &&
      (details._actionType === "check_in" ||
        details._actionType === "check_out" ||
        details._actionType === "receiving"));
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

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];
function isRecycleDue(item) {
  const t = (item.type || "").toLowerCase();
  if (!CUSTOM_TYPES.includes(t)) return false;
  const qty = item.quantity || 0;
  if (qty <= 0) return false;
  const rd = item.recycle_date;
  if (!rd) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recycleDate = new Date(rd);
  recycleDate.setHours(0, 0, 0, 0);
  return recycleDate.getTime() <= today.getTime();
}

export default function HomeScreen({
  onScanQR,
  onAddManual,
  onViewInventory,
  onOpenRecycleDue,
  inventory,
  inventoryLoaded = true,
  minQuantity = 30,
  userName,
  isAdmin,
  onSwitchUser,
  isDarkMode,
  onToggleDarkMode,
  onRefresh,
  isRefreshing = false,
  onOpenSettings,
  onOpenUpcomingOrders,
  onOpenBackOrders,
  onOpenLateOrders,
  onOpenMaterialUsage,
  isWeb = false,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024;
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(!isDesktop);
  const [auditLogsLoaded, setAuditLogsLoaded] = useState(false);
  const [backOrderCount, setBackOrderCount] = useState(0);
  const [lateOrderCount, setLateOrderCount] = useState(0);
  // Admin only: 'all' = full transaction history, 'reduced' = what standard users see
  const [transactionHistoryView, setTransactionHistoryView] = useState("all");

  const lowStockItems = useMemo(
    () =>
      inventory.filter(
        (item) =>
          (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30),
      ),
    [inventory, minQuantity],
  );

  const recycleDueCount = useMemo(
    () => inventory.filter((item) => isRecycleDue(item)).length,
    [inventory],
  );

  const loadAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const logs = await AuditService.list(200);
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error("HomeScreen audit load:", e);
    } finally {
      setAuditLogsLoading(false);
      setAuditLogsLoaded(true);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const [back, late] = await Promise.all([
          OrderService.getBackOrderCount(),
          OrderService.getLateOrderCount(),
        ]);
        if (!cancelled) {
          setBackOrderCount(back);
          setLateOrderCount(late);
        }
      } catch (e) {
        if (!cancelled) console.error("HomeScreen order counts:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const weekAgoStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const filterToStandardUserVisible = (logs) =>
    logs.filter((log) => {
      const a = log.action;
      const d = log.details;
      if (
        a === "check_in" ||
        a === "check_out" ||
        a === "receiving" ||
        a === "delete"
      )
        return true;
      if (
        a === "update" &&
        d?._actionType &&
        (d._actionType === "check_in" ||
          d._actionType === "check_out" ||
          d._actionType === "receiving")
      )
        return true;
      return false;
    });

  const recentTransactionLogs = useMemo(() => {
    const timeCutoff = isAdmin ? weekAgoStart : todayStart;
    const timeFiltered = auditLogs.filter((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t >= timeCutoff;
    });
    if (!isAdmin) return filterToStandardUserVisible(timeFiltered);
    if (transactionHistoryView === "reduced")
      return filterToStandardUserVisible(timeFiltered);
    return timeFiltered;
  }, [auditLogs, weekAgoStart, todayStart, isAdmin, transactionHistoryView]);

  const transactionLogsByDay = useMemo(() => {
    const byDay = {};
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    recentTransactionLogs.forEach((log) => {
      const t = log.timestamp ? new Date(log.timestamp) : null;
      if (!t) return;
      const dayStart = new Date(
        t.getFullYear(),
        t.getMonth(),
        t.getDate(),
      ).getTime();
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      if (!byDay[key]) byDay[key] = { key, dayStart, logs: [] };
      byDay[key].logs.push(log);
    });
    return Object.values(byDay)
      .sort((a, b) => b.dayStart - a.dayStart)
      .map((group) => {
        let dateLabel;
        if (group.dayStart === todayStart) dateLabel = "Today";
        else if (group.dayStart === yesterdayStart) dateLabel = "Yesterday";
        else {
          const d = new Date(group.dayStart);
          dateLabel = d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
          });
        }
        return { ...group, dateLabel };
      });
  }, [recentTransactionLogs]);

  const getDisplayUserName = (log) => {
    const u = (log.userName || "").trim().toLowerCase();
    if (u && u !== "unknown") return log.userName;
    const adminOnly =
      [
        "add",
        "change_id",
        "set_next_id",
        "set_min_quantity",
        "delete",
      ].includes(log.action) ||
      (log.action === "update" &&
        !(
          log.details?._actionType === "check_in" ||
          log.details?._actionType === "check_out" ||
          log.details?._actionType === "receiving"
        ));
    return adminOnly ? "Admin" : log.userName || "Unknown";
  };

  const handleRefresh = async () => {
    await onRefresh?.();
    await loadAuditLogs();
    if (isAdmin) {
      try {
        const [back, late] = await Promise.all([
          OrderService.getBackOrderCount(),
          OrderService.getLateOrderCount(),
        ]);
        setBackOrderCount(back);
        setLateOrderCount(late);
      } catch (e) {
        console.error("HomeScreen order counts:", e);
      }
    }
  };

  const qrButtonText = "Check In / Check Out";
  const getItemName = (itemId) =>
    inventory.find((i) => i.id === itemId)?.name || itemId || "Unknown";

  const transactionSection = (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.sectionTitle}>
          {isAdmin ? "Past week's transactions" : "Today's transactions"}
        </Text>
        {isAdmin && (
          <View style={styles.transactionToggleRow}>
            <Button
              mode="contained"
              compact
              onPress={() =>
                setTransactionHistoryView((prev) =>
                  prev === "all" ? "reduced" : "all",
                )
              }
              style={styles.transactionToggleBtn}
            >
              {transactionHistoryView === "all" ? "All" : "Reduced"}
            </Button>
          </View>
        )}
        {!auditLogsLoaded || auditLogsLoading ? (
          [0, 1, 2, 3].map((i) => (
            <View
              key={`placeholder-${i}`}
              style={[
                styles.transactionRow,
                i < 3 && styles.transactionRowBorder,
              ]}
            >
              <View style={styles.transactionLeftCol}>
                <Text
                  style={[styles.transactionDateTime, styles.placeholderText]}
                >
                  —
                </Text>
                <Text style={[styles.transactionUser, styles.placeholderText]}>
                  —
                </Text>
              </View>
              <View
                style={[styles.transactionActionCol, styles.placeholderAction]}
              >
                <Text
                  style={[styles.transactionActionText, styles.placeholderText]}
                >
                  —
                </Text>
              </View>
              <View style={styles.transactionQtyCol}>
                <Text style={[styles.transactionQty, styles.placeholderText]}>
                  —
                </Text>
              </View>
              <Text
                style={[styles.transactionColor, styles.placeholderText]}
                numberOfLines={2}
              >
                —
              </Text>
            </View>
          ))
        ) : transactionLogsByDay.length === 0 ? (
          <Text style={styles.emptyLogs}>
            {isAdmin
              ? "No transactions in the past week"
              : "No transactions today"}
          </Text>
        ) : (
          transactionLogsByDay.map((dayGroup) => (
            <View key={dayGroup.key} style={styles.transactionDayBlock}>
              {isAdmin && (
                <Text
                  style={[
                    styles.transactionDayHeader,
                    { color: theme.colors.primary },
                  ]}
                >
                  {dayGroup.dateLabel}
                </Text>
              )}
              {dayGroup.logs.map((log, index) => {
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
                      index < dayGroup.logs.length - 1 &&
                        styles.transactionRowBorder,
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
                    <View
                      style={[
                        styles.transactionActionCol,
                        { backgroundColor: color + "22" },
                      ]}
                    >
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
              })}
            </View>
          ))
        )}
      </Card.Content>
    </Card>
  );

  const actionButtons = (
    <View style={!isWeb ? styles.actionButtonsWrapMobile : undefined}>
      {isAdmin && (
        <Button
          mode="contained"
          onPress={onAddManual}
          style={styles.button}
          icon="plus-circle"
        >
          Add Item
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
      {isAdmin && onOpenUpcomingOrders && (
        <Button
          mode="outlined"
          onPress={onOpenUpcomingOrders}
          style={styles.button}
          icon="truck-delivery"
        >
          Purchase Orders
        </Button>
      )}
      {onOpenMaterialUsage && (
        <Button
          mode="outlined"
          onPress={onOpenMaterialUsage}
          style={styles.button}
          icon="chart-box"
        >
          Material Usage
        </Button>
      )}
    </View>
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
            {onOpenMaterialUsage && (
              <IconButton
                icon="chart-box"
                size={24}
                onPress={onOpenMaterialUsage}
                iconColor={theme.colors.primary}
                style={styles.headerMaterialUsageIcon}
              />
            )}
            <IconButton
              icon="cog"
              size={24}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
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
          </View>
        </View>
      )}
      {isWeb && (
        <View style={styles.webHeader}>
          <Title style={styles.webTitle}>Paint Inventory</Title>
          <View style={styles.webHeaderButtons}>
            {onOpenMaterialUsage && (
              <IconButton
                icon="chart-box"
                size={20}
                onPress={onOpenMaterialUsage}
                iconColor={theme.colors.primary}
                style={styles.headerMaterialUsageIcon}
              />
            )}
            <IconButton
              icon="cog"
              size={20}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
            <IconButton
              icon="refresh"
              size={20}
              onPress={handleRefresh}
              disabled={isRefreshing}
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
              {!inventoryLoaded ? (
                <>
                  <Card style={styles.card}>
                    <Card.Content>
                      <Text style={styles.statLabel}>
                        Paint Need to Recycle
                      </Text>
                      <View style={styles.statValueSkeleton}>
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary}
                        />
                        <Text style={styles.statLoadingText}>Loading…</Text>
                      </View>
                    </Card.Content>
                  </Card>
                  {onOpenBackOrders && (
                    <Card style={styles.card}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Back Orders</Text>
                        <View style={styles.statValueSkeleton}>
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.primary}
                          />
                          <Text style={styles.statLoadingText}>Loading…</Text>
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                  {onOpenLateOrders && (
                    <Card style={styles.card}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Late Orders</Text>
                        <View style={styles.statValueSkeleton}>
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.primary}
                          />
                          <Text style={styles.statLoadingText}>Loading…</Text>
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                  <Card style={styles.card}>
                    <Card.Content>
                      <Text style={styles.statLabel}>Low Stock</Text>
                      <View style={styles.statValueSkeleton}>
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary}
                        />
                        <Text style={styles.statLoadingText}>Loading…</Text>
                      </View>
                    </Card.Content>
                  </Card>
                </>
              ) : (
                <>
                  {recycleDueCount > 0 && onOpenRecycleDue && (
                    <Card style={styles.card} onPress={onOpenRecycleDue}>
                      <Card.Content>
                        <Text style={styles.statLabel}>
                          Paint Need to Recycle
                        </Text>
                        <Title style={[styles.statValue, { color: "#e65100" }]}>
                          {recycleDueCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View List</Text>
                      </Card.Content>
                    </Card>
                  )}
                  {backOrderCount > 0 && onOpenBackOrders && (
                    <Card style={styles.card} onPress={onOpenBackOrders}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Back Orders</Text>
                        <Title style={[styles.statValue, { color: "#ff9800" }]}>
                          {backOrderCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View</Text>
                      </Card.Content>
                    </Card>
                  )}
                  {lateOrderCount > 0 && onOpenLateOrders && (
                    <Card style={styles.card} onPress={onOpenLateOrders}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Late Orders</Text>
                        <Title style={[styles.statValue, { color: "#d32f2f" }]}>
                          {lateOrderCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View</Text>
                      </Card.Content>
                    </Card>
                  )}
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
                        <Text style={styles.statLabel}>
                          All paints in stock
                        </Text>
                        <Text style={styles.statValue}>✓</Text>
                      </Card.Content>
                    </Card>
                  )}
                </>
              )}
              {actionButtons}
            </>
          ) : (
            <>
              {!inventoryLoaded ? (
                <>
                  <Card style={styles.card}>
                    <Card.Content>
                      <Text style={styles.statLabel}>
                        Paint Need to Recycle
                      </Text>
                      <View style={styles.statValueSkeleton}>
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primary}
                        />
                        <Text style={styles.statLoadingText}>Loading…</Text>
                      </View>
                    </Card.Content>
                  </Card>
                  {onOpenBackOrders && (
                    <Card style={styles.card}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Back Orders</Text>
                        <View style={styles.statValueSkeleton}>
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.primary}
                          />
                          <Text style={styles.statLoadingText}>Loading…</Text>
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                  {onOpenLateOrders && (
                    <Card style={styles.card}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Late Orders</Text>
                        <View style={styles.statValueSkeleton}>
                          <ActivityIndicator
                            size="small"
                            color={theme.colors.primary}
                          />
                          <Text style={styles.statLoadingText}>Loading…</Text>
                        </View>
                      </Card.Content>
                    </Card>
                  )}
                </>
              ) : (
                <>
                  {recycleDueCount > 0 && onOpenRecycleDue && (
                    <Card style={styles.card} onPress={onOpenRecycleDue}>
                      <Card.Content>
                        <Text style={styles.statLabel}>
                          Paint Need to Recycle
                        </Text>
                        <Title style={[styles.statValue, { color: "#e65100" }]}>
                          {recycleDueCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View List</Text>
                      </Card.Content>
                    </Card>
                  )}
                  {backOrderCount > 0 && onOpenBackOrders && (
                    <Card style={styles.card} onPress={onOpenBackOrders}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Back Orders</Text>
                        <Title style={[styles.statValue, { color: "#ff9800" }]}>
                          {backOrderCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View</Text>
                      </Card.Content>
                    </Card>
                  )}
                  {lateOrderCount > 0 && onOpenLateOrders && (
                    <Card style={styles.card} onPress={onOpenLateOrders}>
                      <Card.Content>
                        <Text style={styles.statLabel}>Late Orders</Text>
                        <Title style={[styles.statValue, { color: "#d32f2f" }]}>
                          {lateOrderCount}
                        </Title>
                        <Text style={styles.statHint}>Tap to View</Text>
                      </Card.Content>
                    </Card>
                  )}
                </>
              )}
              {actionButtons}
              {transactionSection}
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Logged in as:{" "}
              <Text style={styles.mono}>{isAdmin ? "Admin" : userName}</Text>
            </Text>
            <Text style={styles.footerVersion}>v1.{version?.build ?? "?"}</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerMaterialUsageIcon: {
    marginLeft: 12,
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
  statValueSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  statLoadingText: {
    fontSize: 14,
    color: "#888",
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
  statHint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 4,
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
  actionButtonsWrapMobile: {
    paddingTop: 15,
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
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 12,
    color: "#666",
    opacity: 0.85,
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
  transactionToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  transactionToggleBtn: {
    minWidth: 100,
  },
  transactionToggleHint: {
    fontSize: 12,
    marginLeft: 4,
  },
  transactionDayBlock: {
    marginTop: 16,
  },
  transactionDayHeader: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.12)",
  },
  emptyLogs: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
  },
  placeholderText: {
    color: "transparent",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  placeholderAction: {
    backgroundColor: "rgba(0,0,0,0.06)",
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
