import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  useWindowDimensions,
  Platform,
} from "react-native";
import {
  IconButton,
  Text,
  Divider,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "./ui/AppButton";
import OrderService from "../services/orderService";
import NotificationService from "../services/notificationService";
import WasteTrackingService from "../services/wasteTrackingService";
import { NOTIFICATION_BADGE_RED } from "../utils/themeColors";
import { isRecycleDue, getLowStockItems } from "../utils/inventoryAlerts";
import { colors, space } from "../theme/tokens";
import {
  getDismissedIdsToday,
  dismissAlertsForToday,
} from "../utils/notificationDismissals";
import ScrollFrame from "./ScrollFrame";

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 420;
const LIST_MAX_HEIGHT = 260;

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
  onOpenWasteTracking,
  iconSize = 22,
}) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const bellRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [panelPos, setPanelPos] = useState({
    top: 56,
    left: 12,
    caretLeft: PANEL_WIDTH - 28,
  });
  const [dismissedIds, setDismissedIds] = useState([]);
  const [backOrderCount, setBackOrderCount] = useState(0);
  const [lateOrderCount, setLateOrderCount] = useState(0);
  const [wasteUnreadCount, setWasteUnreadCount] = useState(0);
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
      setWasteUnreadCount(0);
      return;
    }
    let cancelled = false;
    setOrderCountsLoading(true);
    Promise.all([
      OrderService.getBackOrderCount().catch(() => 0),
      OrderService.getLateOrderCount().catch(() => 0),
      WasteTrackingService.getUnreadCount().catch(() => 0),
    ])
      .then(([back, late, waste]) => {
        if (!cancelled) {
          setBackOrderCount(back);
          setLateOrderCount(late);
          setWasteUnreadCount(waste);
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
    () =>
      (Array.isArray(inventory) ? inventory : []).filter(isRecycleDue).length,
    [inventory],
  );

  const lowStockItems = useMemo(
    () => getLowStockItems(inventory, minQuantity),
    [inventory, minQuantity],
  );

  const allNotifications = useMemo(() => {
    const items = [];
    if (isAdmin && wasteUnreadCount > 0 && onOpenWasteTracking) {
      items.push({
        id: "waste",
        title: "Waste Tracking",
        count: wasteUnreadCount,
        color: theme.colors.primary,
        detail:
          wasteUnreadCount === 1
            ? "1 new waste entry submitted"
            : `${wasteUnreadCount} new waste entries submitted`,
        onPress: () => {
          setVisible(false);
          WasteTrackingService.markSeen()
            .then(() => setWasteUnreadCount(0))
            .catch(() => {});
          onOpenWasteTracking();
        },
      });
    }
    if (isAdmin && recycleDueCount > 0 && onOpenRecycleDue) {
      items.push({
        id: "recycle",
        title: "Paint Need to Recycle",
        count: recycleDueCount,
        color: colors.semantic.recycleBannerText,
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
        color: colors.semantic.lowStockValue,
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
    wasteUnreadCount,
    recycleDueCount,
    backOrderCount,
    lateOrderCount,
    lowStockItems.length,
    isAdmin,
    minQuantity,
    onOpenWasteTracking,
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

  const panelWidth = Math.min(PANEL_WIDTH, Math.max(260, windowWidth - 16));

  const openPanel = () => {
    const node = bellRef.current;
    const place = (x, y, width, height) => {
      const gap = 8;
      const caretSize = 10;
      const margin = 8;
      const top = Math.max(
        margin,
        Math.min(y + height + gap, windowHeight - 140),
      );
      // Center under bell, then clamp fully on-screen
      const preferredLeft = x + width / 2 - panelWidth / 2;
      const left = Math.max(
        margin,
        Math.min(preferredLeft, windowWidth - panelWidth - margin),
      );
      const bellCenterX = x + width / 2;
      const rawCaret = bellCenterX - left - caretSize;
      const caretLeft = Math.max(
        14,
        Math.min(rawCaret, panelWidth - caretSize * 2 - 14),
      );
      setPanelPos({ top, left, caretLeft });
      setVisible(true);
    };

    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, width, height) => {
        place(x, y, width, height);
      });
      return;
    }
    setPanelPos({
      top: 56,
      left: Math.max(8, windowWidth - panelWidth - 8),
      caretLeft: panelWidth - 28,
    });
    setVisible(true);
  };

  const handleDismissToday = async () => {
    const ids = allNotifications.map((n) => n.id);
    if (ids.includes("waste")) {
      try {
        await WasteTrackingService.markSeen();
        setWasteUnreadCount(0);
      } catch {
        /* ignore */
      }
    }
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
      <View ref={bellRef} collapsable={false} style={styles.bellWrap}>
        <IconButton
          icon="bell-outline"
          size={iconSize}
          onPress={openPanel}
          iconColor={theme.colors.primary}
          accessibilityLabel="Notifications"
          style={styles.bellBtn}
        />
        {inventoryLoaded && badgeCount > 0 && (
          <View
            style={[styles.badge, { backgroundColor: NOTIFICATION_BADGE_RED }]}
          >
            <Text style={styles.badgeText}>{badgeCount}</Text>
          </View>
        )}
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setVisible(false)}
            accessibilityLabel="Dismiss notifications"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.panelAnchor,
              {
                top: panelPos.top,
                left: panelPos.left,
                width: panelWidth,
              },
            ]}
          >
            <View
              style={[
                styles.caret,
                {
                  left: panelPos.caretLeft,
                  borderBottomColor: theme.colors.outlineVariant,
                },
              ]}
            />
            <View
              style={[
                styles.caretInner,
                {
                  left: panelPos.caretLeft + 1,
                  borderBottomColor: theme.colors.surfaceContainerHighest,
                },
              ]}
            />
            <View
              style={[
                styles.panel,
                {
                  maxHeight: Math.min(
                    PANEL_MAX_HEIGHT,
                    windowHeight - panelPos.top - 12,
                  ),
                  backgroundColor: theme.colors.surfaceContainerHighest,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
            <View style={styles.panelHeader}>
              <Text
                style={[styles.modalTitle, { color: theme.colors.onSurface }]}
              >
                Notifications
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={() => setVisible(false)}
                style={styles.closeBtn}
                accessibilityLabel="Close notifications"
              />
            </View>
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
              <ScrollFrame
                bordered={false}
                maxHeight={LIST_MAX_HEIGHT}
                contentContainerStyle={styles.listContent}
              >
                {activeNotifications.map((n, index) => (
                  <React.Fragment key={n.id}>
                    {index > 0 && <Divider style={styles.divider} />}
                    <Pressable
                      onPress={n.onPress}
                      disabled={!n.onPress}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && {
                          backgroundColor: theme.dark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.04)",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.countPill,
                          { backgroundColor: n.color },
                        ]}
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
                          <AppButton
                            mode="contained"
                            compact
                            icon="email-outline"
                            loading={emailSending}
                            disabled={emailSending}
                            onPress={handleEmailLowStock}
                            style={styles.emailBtn}
                          >
                            Email low stock list
                          </AppButton>
                        ) : null}
                        {n.onPress ? (
                          <Text
                            style={[
                              styles.rowAction,
                              { color: theme.colors.primary },
                            ]}
                          >
                            Tap to view
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  </React.Fragment>
                ))}
              </ScrollFrame>
            )}

            <View style={styles.modalActions}>
              {hasUnderlyingAlerts && activeNotifications.length > 0 && (
                <AppButton mode="outlined" onPress={handleDismissToday} compact>
                  Clear for today
                </AppButton>
              )}
              <AppButton mode="text" onPress={() => setVisible(false)} compact>
                Close
              </AppButton>
            </View>
          </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: {
    position: "relative",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBtn: {
    margin: 0,
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
    zIndex: 1,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  panelAnchor: {
    position: "absolute",
  },
  caret: {
    position: "absolute",
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  caretInner: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  panel: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: space[5],
    paddingTop: space[2],
    paddingBottom: space[4],
    width: "100%",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxSizing: "border-box",
          boxShadow: "0px 8px 24px rgba(0,0,0,0.28)",
        }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 10,
        }),
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[1],
    marginRight: -4,
    minHeight: 36,
  },
  closeBtn: {
    margin: 0,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: space[4],
    lineHeight: 16,
    paddingRight: space[2],
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
  },
  clearedMsg: {
    fontSize: 13,
    paddingVertical: 16,
    lineHeight: 18,
  },
  emptyMsg: {
    fontSize: 13,
    paddingVertical: 16,
  },
  listContent: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  divider: {
    marginVertical: 2,
    marginHorizontal: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 10,
  },
  countPill: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowAction: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  emailBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
});
