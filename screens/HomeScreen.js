import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  Card,
  Button,
  Text,
  useTheme,
  IconButton,
  ActivityIndicator,
  Chip,
} from "react-native-paper";
import AuditService from "../services/auditService";
import NotificationsBell from "../components/NotificationsBell";
import version from "../version";
import { formatDayHeader } from "../utils/transactionDayUtils";
import { logMatchesShift, SHIFT_LABELS } from "../utils/shiftUtils";
import { nestedSurfaceColor } from "../utils/themeColors";
import {
  colors,
  fontFamily,
  mutedTextColor,
  dimTextColor,
} from "../theme/tokens";
import { AppText, AppEmptyState } from "../components/ui";
import { getActionColor } from "../utils/actionColors";

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
  if (action === "update" && details?._actionType === "recycled")
    return "Recycled";
  if (action === "recycled") return "Recycled";
  if (action === "update") return "Manual Adjustment";
  if (action === "delete") return "Deleted";
  if (action === "change_id") return "ID Changed";
  return action;
}

function getQuantityDisplay(action, details) {
  if (!details) return "-";
  const isCheckInOut =
    action === "check_in" ||
    action === "check_out" ||
    action === "receiving" ||
    action === "recycled" ||
    (action === "update" &&
      details._actionType &&
      (details._actionType === "check_in" ||
        details._actionType === "check_out" ||
        details._actionType === "receiving" ||
        details._actionType === "recycled"));
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
  onOpenPlaceOrder,
  onOpenUpcomingOrders,
  onOpenBackOrders,
  onOpenLateOrders,
  onOpenLowStock,
  onOpenMaterialUsage,
  onOpenWasteTracking,
  onOpenReports,
  onItemSelect,
  auditLogs: auditLogsFromApp,
  auditLogsLoaded: auditLogsLoadedFromApp = false,
  onRefreshAuditLogs,
  isWeb = false,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024;
  const [auditLogsLocal, setAuditLogsLocal] = useState([]);
  const useCachedAudit = auditLogsLoadedFromApp;
  const auditLogs = useCachedAudit ? auditLogsFromApp : auditLogsLocal;
  const [auditLogsLoading, setAuditLogsLoading] = useState(
    !isDesktop && !useCachedAudit,
  );
  const auditLogsLoaded = useCachedAudit || auditLogsLocal.length > 0;
  // Admin only: 'all' = full transaction history, 'reduced' = what standard users see
  const [transactionHistoryView, setTransactionHistoryView] = useState("all");
  const [userFilter, setUserFilter] = useState(null);
  const [shiftFilter, setShiftFilter] = useState(null);
  /** Admin: start with ~2 weeks; "Show more" adds another 2. */
  const [historyWeeksShown, setHistoryWeeksShown] = useState(2);

  const loadAuditLogs = async () => {
    if (onRefreshAuditLogs) {
      setAuditLogsLoading(true);
      try {
        await onRefreshAuditLogs();
      } finally {
        setAuditLogsLoading(false);
      }
      return;
    }
    setAuditLogsLoading(true);
    try {
      const logs = await AuditService.list(200);
      setAuditLogsLocal(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error("HomeScreen audit load:", e);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  useEffect(() => {
    // Parent cache may arrive while local loading is still true — clear it so
    // we don't stay on placeholders until remount (common on mobile first open).
    if (useCachedAudit) {
      setAuditLogsLoading(false);
      return;
    }
    loadAuditLogs();
  }, [useCachedAudit]);

  const historyCutoffMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - historyWeeksShown * 7);
    return d.getTime();
  }, [historyWeeksShown]);

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
        a === "recycled" ||
        a === "delete"
      )
        return true;
      if (
        a === "update" &&
        d?._actionType &&
        (d._actionType === "check_in" ||
          d._actionType === "check_out" ||
          d._actionType === "receiving" ||
          d._actionType === "recycled")
      )
        return true;
      return false;
    });

  const recentTransactionLogs = useMemo(() => {
    const timeCutoff = isAdmin ? historyCutoffMs : todayStart;
    const timeFiltered = auditLogs.filter((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t >= timeCutoff;
    });
    if (!isAdmin) return filterToStandardUserVisible(timeFiltered);
    if (transactionHistoryView === "reduced")
      return filterToStandardUserVisible(timeFiltered);
    return timeFiltered;
  }, [
    auditLogs,
    historyCutoffMs,
    todayStart,
    isAdmin,
    transactionHistoryView,
  ]);

  const hasMoreHistory = useMemo(() => {
    if (!isAdmin) return false;
    const pool =
      transactionHistoryView === "reduced"
        ? filterToStandardUserVisible(auditLogs)
        : auditLogs;
    return pool.some((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t > 0 && t < historyCutoffMs;
    });
  }, [auditLogs, isAdmin, historyCutoffMs, transactionHistoryView]);

  const logsForDisplay = useMemo(() => {
    let rows = recentTransactionLogs;
    if (isAdmin && shiftFilter) {
      rows = rows.filter((log) => logMatchesShift(log.timestamp, shiftFilter));
    }
    if (isAdmin && userFilter) {
      const target = String(userFilter).trim().toLowerCase();
      rows = rows.filter((log) => {
        const u = (log.userName || "").trim().toLowerCase();
        const display = (() => {
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
                log.details?._actionType === "receiving" ||
                log.details?._actionType === "recycled"
              ));
          return adminOnly ? "Admin" : log.userName || "Unknown";
        })();
        return String(display).trim().toLowerCase() === target;
      });
    }
    return rows;
  }, [recentTransactionLogs, isAdmin, shiftFilter, userFilter]);

  const transactionLogsByDay = useMemo(() => {
    const byDay = {};
    logsForDisplay.forEach((log) => {
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
      .map((group) => ({
        ...group,
        dateLabel: formatDayHeader(group.logs[0]?.timestamp),
      }));
  }, [logsForDisplay]);

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
          log.details?._actionType === "receiving" ||
          log.details?._actionType === "recycled"
        ));
    return adminOnly ? "Admin" : log.userName || "Unknown";
  };

  const handleUserPress = (log) => {
    if (!isAdmin) return;
    const display = getDisplayUserName(log);
    if (!display || display === "Unknown") return;
    setUserFilter((prev) =>
      prev && prev.toLowerCase() === display.toLowerCase() ? null : display,
    );
  };

  const handleItemPress = (log) => {
    if (!isAdmin || !onItemSelect) return;
    const id = log.itemId != null ? String(log.itemId).trim() : "";
    if (!id) return;
    const item = inventory.find((i) => String(i.id) === id);
    if (item) onItemSelect(item);
  };

  const handleRefresh = async () => {
    await onRefresh?.();
    if (onRefreshAuditLogs) {
      await onRefreshAuditLogs();
    } else {
      await loadAuditLogs();
    }
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
          {isAdmin ? "Transaction history" : "Today's transactions"}
        </Text>
        {isAdmin && userFilter ? (
          <View style={styles.userFilterRow}>
            <Chip
              icon="account"
              onClose={() => setUserFilter(null)}
              style={styles.userFilterChip}
            >
              {userFilter}
            </Chip>
          </View>
        ) : null}
        {isAdmin && (
          <View style={styles.transactionToggleRow}>
            <Button
              mode={shiftFilter === "day" ? "contained" : "outlined"}
              compact
              onPress={() =>
                setShiftFilter((f) => (f === "day" ? null : "day"))
              }
              style={styles.transactionToggleBtn}
            >
              {SHIFT_LABELS.day}
            </Button>
            <Button
              mode={shiftFilter === "swing" ? "contained" : "outlined"}
              compact
              onPress={() =>
                setShiftFilter((f) => (f === "swing" ? null : "swing"))
              }
              style={styles.transactionToggleBtn}
            >
              {SHIFT_LABELS.swing}
            </Button>
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
        {(!useCachedAudit && (!auditLogsLoaded || auditLogsLoading)) ? (
          [0, 1, 2, 3].map((i) => (
            <View
              key={`placeholder-${i}`}
              style={[
                styles.transactionRow,
                {
                  backgroundColor: nestedSurfaceColor(theme),
                  borderColor: theme.colors.outlineVariant,
                },
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
          <>
            <AppEmptyState
              title={
                isAdmin
                  ? "No transactions in this period"
                  : "No transactions today"
              }
              style={styles.emptyLogs}
            />
            {isAdmin && hasMoreHistory ? (
              <Pressable
                onPress={() => setHistoryWeeksShown((w) => w + 2)}
                hitSlop={8}
                style={styles.showMoreHistoryLink}
              >
                <Text
                  style={[
                    styles.showMoreHistoryLinkText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Show more
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            {transactionLogsByDay.map((dayGroup) => (
            <View key={dayGroup.key} style={styles.transactionDayBlock}>
              <View style={styles.dayDividerWrap}>
                <Text
                  style={[
                    styles.dayDividerText,
                    {
                      color: mutedTextColor(theme),
                    },
                  ]}
                >
                  {dayGroup.dateLabel}
                </Text>
                <View
                  style={[
                    styles.dayDividerLine,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(0,0,0,0.12)",
                    },
                  ]}
                />
              </View>
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
                      {
                        backgroundColor: nestedSurfaceColor(theme),
                        borderColor: theme.colors.outlineVariant,
                      },
                    ]}
                  >
                    <View style={styles.transactionLeftCol}>
                      <Text
                        style={[
                          styles.transactionDateTime,
                          { color: mutedTextColor(theme) },
                        ]}
                        numberOfLines={1}
                      >
                        {dateTimeStr}
                      </Text>
                      {isAdmin ? (
                        <Pressable onPress={() => handleUserPress(log)} hitSlop={6}>
                          <Text
                            style={[
                              styles.transactionUser,
                              styles.clickableText,
                              { color: dimTextColor(theme) },
                            ]}
                            numberOfLines={1}
                          >
                            {getDisplayUserName(log)}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text
                          style={[
                            styles.transactionUser,
                            { color: dimTextColor(theme) },
                          ]}
                          numberOfLines={1}
                        >
                          {getDisplayUserName(log)}
                        </Text>
                      )}
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
                    {isAdmin && onItemSelect ? (
                      <Pressable
                        onPress={() => handleItemPress(log)}
                        hitSlop={6}
                        style={styles.transactionColor}
                      >
                        <Text
                          style={[
                            styles.clickableText,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={2}
                        >
                          {itemName}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text
                        style={[
                          styles.transactionColor,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={2}
                      >
                        {itemName}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
            {isAdmin && hasMoreHistory ? (
              <Pressable
                onPress={() => setHistoryWeeksShown((w) => w + 2)}
                hitSlop={8}
                style={styles.showMoreHistoryLink}
              >
                <Text
                  style={[
                    styles.showMoreHistoryLinkText,
                    { color: theme.colors.primary },
                  ]}
                >
                  Show more
                </Text>
              </Pressable>
            ) : null}
          </>
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
      {!isDesktop && (
        <Button
          mode="contained"
          onPress={onScanQR}
          style={styles.button}
          icon="qrcode-scan"
        >
          {qrButtonText}
        </Button>
      )}
      <Button
        mode="outlined"
        onPress={onViewInventory}
        style={styles.button}
        icon="format-list-bulleted"
      >
        View Inventory
      </Button>
      {isAdmin && onOpenPlaceOrder && (
        <Button
          mode="contained"
          onPress={onOpenPlaceOrder}
          style={styles.button}
          icon="cart-plus"
        >
          Place Order
        </Button>
      )}
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
      {onOpenWasteTracking && (
        <Button
          mode="outlined"
          onPress={onOpenWasteTracking}
          style={styles.button}
          icon="delete-variant"
        >
          Waste Tracking
        </Button>
      )}
      {onOpenReports && (
        <Button
          mode="outlined"
          onPress={onOpenReports}
          style={styles.button}
          icon="chart-line"
        >
          Reports
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
          <AppText variant="pageTitleLg" style={styles.title}>
            Paint Inventory
          </AppText>
          <View style={styles.headerButtons}>
            <NotificationsBell
              inventory={inventory}
              inventoryLoaded={inventoryLoaded}
              minQuantity={minQuantity}
              isAdmin={isAdmin}
              userName={userName}
              onOpenRecycleDue={onOpenRecycleDue}
              onOpenBackOrders={onOpenBackOrders}
              onOpenLateOrders={onOpenLateOrders}
              onOpenLowStock={onOpenLowStock}
              onOpenWasteTracking={onOpenWasteTracking}
              iconSize={24}
            />
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
          <AppText variant="pageTitle">Paint Inventory</AppText>
          <View style={styles.webHeaderButtons}>
            <NotificationsBell
              inventory={inventory}
              inventoryLoaded={inventoryLoaded}
              minQuantity={minQuantity}
              isAdmin={isAdmin}
              userName={userName}
              onOpenRecycleDue={onOpenRecycleDue}
              onOpenBackOrders={onOpenBackOrders}
              onOpenLateOrders={onOpenLateOrders}
              onOpenLowStock={onOpenLowStock}
              onOpenWasteTracking={onOpenWasteTracking}
            />
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
          {!inventoryLoaded && (
            <View style={styles.alertsLoadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text
                style={[
                  styles.alertsLoadingText,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Loading inventory…
              </Text>
            </View>
          )}
          {isDesktop ? (
            <>{actionButtons}</>
          ) : (
            <>
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
    borderBottomColor: "transparent",
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
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.light.textMuted,
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  card: {
    marginBottom: 30,
    elevation: 4,
  },
  alertsLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  alertsLoadingText: {
    fontSize: 14,
  },
  statValueSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  statLoadingText: {
    fontSize: 14,
    color: colors.dark.textDim,
  },
  statLabel: {
    fontSize: 14,
    color: colors.light.textMuted,
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
    color: colors.brand.primary,
  },
  statHint: {
    fontSize: 12,
    color: colors.dark.textDim,
    textAlign: "center",
    marginTop: 4,
  },
  lowStockItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  lowStockName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.semantic.lowStockText,
    flex: 1,
  },
  lowStockQty: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.semantic.lowStockText,
  },
  actionButtonsWrapMobile: {
    paddingTop: 15,
  },
  button: {
    marginBottom: 15,
    paddingVertical: 8,
  },
  warning: {
    color: colors.semantic.lowStockText,
    textAlign: "center",
    marginBottom: 15,
    fontSize: 12,
  },
  footer: {
    alignItems: "center",
    paddingTop: 10,
  },
  footerText: {
    color: colors.light.textMuted,
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 12,
    color: colors.light.textMuted,
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
    color: colors.light.textMuted,
    fontWeight: "600",
  },
  mono: {
    fontFamily: fontFamily.mono,
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
  showMoreHistoryLink: {
    paddingVertical: 14,
    alignItems: "center",
  },
  showMoreHistoryLinkText: {
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  dayDividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
    marginBottom: 4,
  },
  dayDividerText: {
    fontSize: 13,
    fontWeight: "800",
    marginRight: 12,
  },
  dayDividerLine: {
    height: 2,
    flex: 1,
    borderRadius: 1,
  },
  emptyLogs: {
    paddingVertical: 16,
    paddingHorizontal: 0,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
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
  clickableText: {
    fontWeight: "700",
  },
  userFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  userFilterChip: {
    alignSelf: "flex-start",
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
    borderBottomColor: "transparent",
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
