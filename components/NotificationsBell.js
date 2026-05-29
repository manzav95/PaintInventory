import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import {
  IconButton,
  Text,
  Modal,
  Portal,
  Button,
  Divider,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import OrderService from "../services/orderService";
import NotificationService from "../services/notificationService";
import {
  isRecycleDue,
  getLowStockItems,
} from "../utils/inventoryAlerts";
import {
  getDismissedIdsToday,
  dismissAlertsForToday,
} from "../utils/notificationDismissals";

export default function NotificationsBell({
  inventory = [],
  inventoryLoaded = true,
  minQuantity = 30,
  isAdmin = false,
  userName = "",
  onOpenRecycleDue,
  onOpenBackOrders,
  onOpenLateOrders,
  onOpenLowStock,
  iconSize = 20,
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [backOrderCount, setBackOrderCount] = useState(0);
  const [lateOrderCount, setLateOrderCount] = useState(0);
  const [orderCountsLoading, setOrderCountsLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const refreshDismissed = useCallback(async () => {
    const ids = await getDismissedIdsToday(userName);
    setDismissedIds(ids);
  }, [userName]);

  useEffect(() => {
    refreshDismissed();
  }, [refreshDismissed, visible, userName]);

  useEffect(() => {
    if (!isAdmin) {
      setBackOrderCount(0);
      setLateOrderCount(0);
      return;
    }
    let cancelled = false;
    setOrderCountsLoading(true);
    Promise.all([
      OrderService.getBackOrderCount().catch(() => 0),
      OrderService.getLateOrderCount().catch(() => 0),
    ])
      .then(([back, late]) => {
        if (!cancelled) {
          setBackOrderCount(back);
          setLateOrderCount(late);
        }
      })
      .finally(() => {
        if (!cancelled) setOrderCountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, visible]);

  const recycleDueCount = useMemo(
    () => (Array.isArray(inventory) ? inventory : []).filter(isRecycleDue).length,
    [inventory],
  );

  const lowStockItems = useMemo(
    () => getLowStockItems(inventory, minQuantity),
    [inventory, minQuantity],
  );

  const allNotifications = useMemo(() => {
    const items = [];
    if (isAdmin && recycleDueCount > 0 && onOpenRecycleDue) {
      items.push({
        id: "recycle",
        title: "Paint Need to Recycle",
        count: recycleDueCount,
        color: "#e65100",
        detail: "Custom paint or stain at or past recycle due date",
        onPress: () => {
          setVisible(false);
          onOpenRecycleDue();
        },
      });
    }
    if (isAdmin && backOrderCount > 0 && onOpenBackOrders) {
      items.push({
        id: "back_orders",
        title: "Back Orders",
        count: backOrderCount,
        color: "#ff9800",
        detail: "Purchase orders with partial deliveries",
        onPress: () => {
          setVisible(false);
          onOpenBackOrders();
        },
      });
    }
    if (isAdmin && lateOrderCount > 0 && onOpenLateOrders) {
      items.push({
        id: "late_orders",
        title: "Late Orders",
        count: lateOrderCount,
        color: "#d32f2f",
        detail: "Purchase orders past expected arrival",
        onPress: () => {
          setVisible(false);
          onOpenLateOrders();
        },
      });
    }
    if (lowStockItems.length > 0) {
      items.push({
        id: "low_stock",
        title: "Low Stock",
        count: lowStockItems.length,
        color: theme.colors.primary,
        detail: isAdmin
          ? `Below ${minQuantity} gal (or item minimum)`
          : `Paint below ${minQuantity} gal — notify purchasing`,
        onPress:
          isAdmin && onOpenLowStock
            ? () => {
                setVisible(false);
                onOpenLowStock();
              }
            : undefined,
        showEmailAction: !isAdmin,
      });
    }
    return items;
  }, [
    recycleDueCount,
    backOrderCount,
    lateOrderCount,
    lowStockItems.length,
    isAdmin,
    minQuantity,
    onOpenRecycleDue,
    onOpenBackOrders,
    onOpenLateOrders,
    onOpenLowStock,
    theme.colors.primary,
  ]);

  const activeNotifications = useMemo(
    () => allNotifications.filter((n) => !dismissedIds.includes(n.id)),
    [allNotifications, dismissedIds],
  );

  const badgeCount = activeNotifications.length;
  const hasUnderlyingAlerts = allNotifications.length > 0;
  const allVisibleDismissed =
    hasUnderlyingAlerts && activeNotifications.length === 0;

  const handleDismissToday = async () => {
    const ids = allNotifications.map((n) => n.id);
    await dismissAlertsForToday(userName, ids);
    setDismissedIds(ids);
  };

  const handleEmailLowStock = async () => {
    setEmailSending(true);
    try {
      const payload = lowStockItems.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity ?? 0,
        minQuantity: it.minQuantity ?? minQuantity,
      }));
      const result = await NotificationService.sendLowStockAlert({
        items: payload,
        requestedBy: userName || "unknown",
      });
      if (result.success) {
        Alert.alert(
          "Alert sent",
          result.message ||
            "Low stock list was sent to manuelzavala@precisioncabinets.com.",
        );
      } else {
        Alert.alert(
          "Could not send",
          result.error || "Try again or contact your administrator.",
        );
      }
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <>
      <View style={styles.bellWrap}>
        <IconButton
          icon="bell-outline"
          size={iconSize}
          onPress={() => setVisible(true)}
          iconColor={theme.colors.primary}
          accessibilityLabel="Notifications"
        />
        {inventoryLoaded && badgeCount > 0 && (
          <View
            style={[styles.badge, { backgroundColor: theme.colors.error }]}
          >
            <Text style={styles.badgeText}>{badgeCount}</Text>
          </View>
        )}
      </View>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.colors.surfaceContainerHighest },
          ]}
        >
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            Notifications
          </Text>
          <Text
            style={[
              styles.modalSubtitle,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {isAdmin
              ? "Clears your admin alerts for today on this device only."
              : "Clears your alerts for today on this device. Admin alerts are not affected."}
          </Text>

          {!inventoryLoaded || (isAdmin && orderCountsLoading) ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" />
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                Loading…
              </Text>
            </View>
          ) : allVisibleDismissed ? (
            <Text
              style={[
                styles.clearedMsg,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Cleared for today. Open again tomorrow if issues remain.
            </Text>
          ) : activeNotifications.length === 0 ? (
            <Text
              style={[
                styles.emptyMsg,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {hasUnderlyingAlerts
                ? "No active alerts."
                : "Nothing needs attention right now."}
            </Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {activeNotifications.map((n, index) => (
                <React.Fragment key={n.id}>
                  {index > 0 && <Divider style={styles.divider} />}
                  <View style={styles.row}>
                    <View
                      style={[styles.countPill, { backgroundColor: n.color }]}
                    >
                      <Text style={styles.countPillText}>{n.count}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text
                        style={[
                          styles.rowTitle,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {n.title}
                      </Text>
                      <Text
                        style={[
                          styles.rowDetail,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        {n.detail}
                      </Text>
                      {n.showEmailAction ? (
                        <Button
                          mode="contained"
                          compact
                          icon="email-outline"
                          loading={emailSending}
                          disabled={emailSending}
                          onPress={handleEmailLowStock}
                          style={styles.emailBtn}
                        >
                          Email low stock list
                        </Button>
                      ) : null}
                      {n.onPress ? (
                        <Pressable onPress={n.onPress}>
                          <Text
                            style={[
                              styles.rowAction,
                              { color: theme.colors.primary },
                            ]}
                          >
                            Tap to view
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </ScrollView>
          )}

          <View style={styles.modalActions}>
            {hasUnderlyingAlerts && activeNotifications.length > 0 && (
              <Button mode="outlined" onPress={handleDismissToday} compact>
                Clear for today
              </Button>
            )}
            <Button mode="text" onPress={() => setVisible(false)} compact>
              Close
            </Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  modal: {
    marginHorizontal: 20,
    maxWidth: 420,
    width: "92%",
    alignSelf: "center",
    borderRadius: 12,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
  },
  clearedMsg: {
    fontSize: 14,
    paddingVertical: 20,
    lineHeight: 20,
  },
  emptyMsg: {
    fontSize: 14,
    paddingVertical: 20,
  },
  list: {
    maxHeight: 320,
  },
  divider: {
    marginVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  countPill: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowAction: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: "600",
  },
  emailBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
});
