import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Pressable,
  Modal,
} from "react-native";
import {
  Card,
  Text,
  Title,
  Paragraph,
  Button,
  Searchbar,
  useTheme,
  DataTable,
  Chip,
  ActivityIndicator,
} from "react-native-paper";
import AuditService from "../services/auditService";

function getDayKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeader(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const md = d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
  });
  return `${weekday} ${md}`;
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

export default function DashboardScreen({
  inventory,
  inventoryLoaded = true,
  minQuantity = 30,
  onRefresh,
  isRefreshing = false,
  showTransactionTable = true,
  isAdmin = false,
  onOpenRecycleDue,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoaded, setAuditLogsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reducedHistory, setReducedHistory] = useState(false);
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);
  const [galPeriodWeek, setGalPeriodWeek] = useState(true);
  const [staleDays, setStaleDays] = useState(30);
  const [staleListOpen, setStaleListOpen] = useState(false);
  const [checkedOutListOpen, setCheckedOutListOpen] = useState(false);
  const [checkedOutListIsWeek, setCheckedOutListIsWeek] = useState(true);
  const [totalValueListOpen, setTotalValueListOpen] = useState(false);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    try {
      const logs = await AuditService.list(1000);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Error loading audit logs:", error);
    } finally {
      setAuditLogsLoaded(true);
    }
  };

  // Current week (Sun–Sat) and current month date ranges + labels
  const periodRange = useMemo(() => {
    const now = new Date();
    if (mostUsedByWeek) {
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - now.getDay());
      sunday.setHours(0, 0, 0, 0);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      saturday.setHours(23, 59, 59, 999);
      const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
      return {
        start: sunday.getTime(),
        end: saturday.getTime(),
        label: `${fmt(sunday)}–${fmt(saturday)}`,
      };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const monthLabel = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return {
      start: first.getTime(),
      end: last.getTime(),
      label: monthLabel,
    };
  }, [mostUsedByWeek]);

  // This week (Sun–Sat) range for "gallons used this week"
  const thisWeekRange = useMemo(() => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      start: sunday.getTime(),
      end: saturday.getTime(),
      label: `${fmt(sunday)}–${fmt(saturday)}`,
    };
  }, []);

  const thisMonthRange = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const label = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return {
      start: first.getTime(),
      end: last.getTime(),
      label,
    };
  }, []);

  const gallonsUsedThisWeek = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      total += getQty(log);
    });
    return total;
  }, [auditLogs, thisWeekRange]);

  const gallonsUsedThisMonth = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisMonthRange.start || t > thisMonthRange.end) return;
      total += getQty(log);
    });
    return total;
  }, [auditLogs, thisMonthRange]);

  const notScannedCount = useMemo(() => {
    const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    return inventory.filter((item) => {
      if (!item.lastScanned) return true;
      return new Date(item.lastScanned).getTime() < cutoff;
    }).length;
  }, [inventory, staleDays]);

  const notScannedItems = useMemo(() => {
    const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    return inventory
      .filter((item) => {
        if (!item.lastScanned) return true;
        return new Date(item.lastScanned).getTime() < cutoff;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        lastScanned: item.lastScanned || null,
        lastScannedMs: item.lastScanned
          ? new Date(item.lastScanned).getTime()
          : 0,
        quantity: item.quantity ?? 0,
      }))
      .sort((a, b) => {
        // Oldest scanned (or never scanned) first
        if (!a.lastScanned && !b.lastScanned)
          return String(a.id).localeCompare(String(b.id));
        if (!a.lastScanned) return -1;
        if (!b.lastScanned) return 1;
        return a.lastScannedMs - b.lastScannedMs;
      });
  }, [inventory, staleDays]);

  const getItemName = (itemId) => {
    const item = inventory.find((i) => i.id === itemId);
    return item?.name || itemId || "Unknown";
  };

  const checkedOutByItemWeek = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const totals = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      const qty = getQty(log);
      if (qty <= 0) return;
      totals[log.itemId] = (totals[log.itemId] || 0) + qty;
    });
    return Object.entries(totals)
      .map(([itemId, qty]) => ({
        itemId,
        name: getItemName(itemId),
        qty,
      }))
      .sort(
        (a, b) =>
          b.qty - a.qty || String(a.itemId).localeCompare(String(b.itemId)),
      );
  }, [auditLogs, thisWeekRange, inventory]);

  const checkedOutByItemMonth = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const totals = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisMonthRange.start || t > thisMonthRange.end) return;
      const qty = getQty(log);
      if (qty <= 0) return;
      totals[log.itemId] = (totals[log.itemId] || 0) + qty;
    });
    return Object.entries(totals)
      .map(([itemId, qty]) => ({
        itemId,
        name: getItemName(itemId),
        qty,
      }))
      .sort(
        (a, b) =>
          b.qty - a.qty || String(a.itemId).localeCompare(String(b.itemId)),
      );
  }, [auditLogs, thisMonthRange, inventory]);

  const recycleDueCount = useMemo(
    () => inventory.filter((item) => isRecycleDue(item)).length,
    [inventory],
  );

  const totalValue = useMemo(() => {
    return inventory.reduce((sum, item) => {
      const qty = item.quantity ?? 0;
      const price =
        item.price != null && !isNaN(Number(item.price))
          ? Number(item.price)
          : 0;
      return sum + qty * price;
    }, 0);
  }, [inventory]);

  const totalValueItems = useMemo(() => {
    return inventory
      .map((item) => {
        const qty = Number(item?.quantity ?? 0) || 0;
        const price =
          item?.price != null && !isNaN(Number(item.price))
            ? Number(item.price)
            : 0;
        const value = qty * price;
        return {
          id: item?.id,
          name: item?.name,
          qty,
          price,
          value,
        };
      })
      .filter((x) => x.id != null)
      .sort(
        (a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)),
      );
  }, [inventory]);

  // Most used = color with largest qty checked out in the selected period (week or month)
  const mostUsedColor = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getCheckOutQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const { start, end } = periodRange;

    const galByItemId = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < start || t > end) return;
      const qty = getCheckOutQty(log);
      if (qty <= 0) return;
      galByItemId[log.itemId] = (galByItemId[log.itemId] || 0) + qty;
    });

    let bestItemId = null;
    let bestGal = 0;
    Object.entries(galByItemId).forEach(([id, gal]) => {
      if (gal > bestGal) {
        bestGal = gal;
        bestItemId = id;
      }
    });
    if (!bestItemId) return null;
    const item = inventory.find((i) => i.id === bestItemId);
    return {
      name: item?.name || bestItemId,
      totalGal: bestGal,
      periodLabel: periodRange.label,
      isWeek: mostUsedByWeek,
    };
  }, [auditLogs, inventory, mostUsedByWeek, periodRange]);

  const isStandardUserVisibleAction = (log) => {
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
  };

  const logsByRole = useMemo(() => {
    if (!isAdmin) return auditLogs.filter(isStandardUserVisibleAction);
    return reducedHistory
      ? auditLogs.filter(isStandardUserVisibleAction)
      : auditLogs;
  }, [auditLogs, isAdmin, reducedHistory]);

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

  // Filter audit logs by search
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logsByRole;
    const query = searchQuery.toLowerCase();
    return logsByRole.filter((log) => {
      const item = inventory.find((i) => i.id === log.itemId);
      const itemName = item?.name?.toLowerCase() || "";
      const userName = (log.userName || "").toLowerCase();
      const action = log.action?.toLowerCase() || "";
      const itemId = log.itemId?.toLowerCase() || "";

      return (
        itemName.includes(query) ||
        userName.includes(query) ||
        action.includes(query) ||
        itemId.includes(query)
      );
    });
  }, [logsByRole, searchQuery, inventory]);

  const getActionColor = (action, details) => {
    // Handle old records with _actionType in details (for backward compatibility)
    if (action === "update" && details && details._actionType) {
      if (details._actionType === "check_in") {
        return "#81c784"; // Subtle green
      } else if (details._actionType === "check_out") {
        return "#e57373"; // Subtle red
      } else if (details._actionType === "receiving") {
        return "#64b5f6"; // Blue for receiving
      }
    }

    switch (action) {
      case "check_in":
        return "#81c784"; // Subtle green
      case "check_out":
        return "#e57373"; // Subtle red
      case "receiving":
        return "#64b5f6"; // Blue for receiving
      case "add":
        return "#64b5f6"; // Subtle blue
      case "delete":
        return "#f44336";
      case "update":
        return "#ba68c8"; // Subtle purple
      case "change_id":
        return "#ff5722";
      default:
        return "#757575";
    }
  };

  const formatAction = (action, details, itemId) => {
    // Check if this is an old record with _actionType in details (for backward compatibility)
    if (action === "update" && details && details._actionType) {
      if (details._actionType === "check_in") {
        return "Checked In";
      } else if (details._actionType === "check_out") {
        return "Checked Out";
      } else if (details._actionType === "receiving") {
        return "Receiving";
      }
    }

    // Map action types to display text
    if (action === "add") {
      return "New Entry";
    } else if (action === "check_in") {
      return "Checked In";
    } else if (action === "check_out") {
      return "Checked Out";
    } else if (action === "receiving") {
      return "Receiving";
    } else if (action === "update") {
      // If it's an update with quantity change, it's a manual adjustment
      // (check_in/check_out are now logged separately)
      return "Manual Adjustment";
    } else if (action === "delete") {
      return "Deleted";
    } else if (action === "change_id") {
      return "ID Changed";
    } else if (action === "set_next_id") {
      return "Next ID Set";
    }
    return action;
  };

  const getQuantity = (action, details, itemId) => {
    // Return the amount of gallons that were manipulated (changed)
    if (details) {
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        action === "receiving" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out" ||
            details._actionType === "receiving"));

      if (isCheckInOut) {
        // For check_in and check_out, show the quantity change amount
        if (typeof details.quantityChange === "number") {
          return Math.abs(details.quantityChange);
        } else if (typeof details._quantityChange === "number") {
          // Old records might have _quantityChange
          return Math.abs(details._quantityChange);
        }
      }

      // For manual adjustment (update), show the quantity change
      if (action === "update" && typeof details.quantityChange === "number") {
        return Math.abs(details.quantityChange);
      }

      // For add, show the initial quantity added
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    return "-";
  };

  const getTotalQuantity = (action, details, itemId) => {
    // Get the total quantity of the item AT THE TIME OF THIS TRANSACTION
    // This is stored in the audit log details as newQuantity or quantity
    if (details) {
      // First check for newQuantity (the total after the transaction) - new format
      if (typeof details.newQuantity === "number") {
        return details.newQuantity;
      }

      // For old records: check_in/check_out/update actions, the quantity field contains the new total
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        action === "receiving" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out" ||
            details._actionType === "receiving"));

      if (isCheckInOut && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For manual adjustment (update without _actionType), quantity is the new total
      if (action === "update" && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For add actions, use the quantity field (initial quantity)
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    // For delete actions, show 0 (after deletion, quantity is 0)
    if (action === "delete") {
      return 0;
    }

    return "-";
  };

  const content = (
    <View
      style={[
        styles.dashboardContainer,
        isWeb && showTransactionTable && styles.dashboardContainerWeb,
      ]}
    >
      {/* Not scanned list modal */}
      <Modal
        visible={staleListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStaleListOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setStaleListOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderRow}>
              <Title style={styles.modalTitle}>
                Not scanned in {staleDays} days
              </Title>
              <Button onPress={() => setStaleListOpen(false)}>Close</Button>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {notScannedItems.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  None.
                </Text>
              ) : (
                notScannedItems.map((it) => (
                  <View key={String(it.id)} style={styles.modalRow}>
                    <View style={styles.modalRowTop}>
                      <View style={styles.modalRowTopLeft}>
                        <Text style={styles.modalRowTitle} numberOfLines={1}>
                          {it.name || it.id}
                        </Text>
                        <Text
                          style={[
                            styles.modalRowMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {it.id}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.modalBadge,
                          {
                            backgroundColor: theme.dark
                              ? "rgba(198,40,40,0.22)"
                              : "rgba(198,40,40,0.12)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalBadgeText,
                            { color: theme.dark ? "#ffb4ab" : "#c62828" },
                          ]}
                        >
                          {it.lastScanned
                            ? `${Math.max(
                                0,
                                Math.floor(
                                  (Date.now() - (it.lastScannedMs || 0)) /
                                    (24 * 60 * 60 * 1000),
                                ),
                              )} days`
                            : "Never"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modalRowBottom}>
                      <Text
                        style={[
                          styles.modalRowSub,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Qty:{" "}
                        <Text style={styles.modalRowSubStrong}>
                          {it.quantity}
                        </Text>
                      </Text>
                      <Text
                        style={[
                          styles.modalRowSub,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Last scanned:{" "}
                        <Text style={styles.modalRowSubStrong}>
                          {it.lastScanned
                            ? new Date(it.lastScanned).toLocaleString()
                            : "never"}
                        </Text>
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Total value list modal */}
      <Modal
        visible={totalValueListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTotalValueListOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setTotalValueListOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderRow}>
              <Title style={styles.modalTitle}>Total value</Title>
              <Button onPress={() => setTotalValueListOpen(false)}>
                Close
              </Button>
            </View>
            <Text
              style={[
                styles.modalHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              $
              {totalValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {totalValueItems.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  No items.
                </Text>
              ) : (
                totalValueItems.map((it) => (
                  <View key={String(it.id)} style={styles.modalRow}>
                    <View style={styles.modalRowTop}>
                      <View style={styles.modalRowTopLeft}>
                        <Text style={styles.modalRowTitle} numberOfLines={1}>
                          {it.name || it.id}
                        </Text>
                        <Text
                          style={[
                            styles.modalRowMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {it.id}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.modalBadge,
                          {
                            backgroundColor: theme.dark
                              ? "rgba(25,118,210,0.22)"
                              : "rgba(25,118,210,0.12)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalBadgeText,
                            { color: theme.dark ? "#b3d5ff" : "#1976d2" },
                          ]}
                        >
                          $
                          {it.value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modalRowBottom}>
                      <Text
                        style={[
                          styles.modalRowSub,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Qty:{" "}
                        <Text style={styles.modalRowSubStrong}>{it.qty}</Text>
                      </Text>
                      <Text
                        style={[
                          styles.modalRowSub,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Price:{" "}
                        <Text style={styles.modalRowSubStrong}>
                          ${it.price.toFixed(2)}
                        </Text>
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Checked out list modal */}
      <Modal
        visible={checkedOutListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckedOutListOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCheckedOutListOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderRow}>
              <Title style={styles.modalTitle}>
                Checked out this {checkedOutListIsWeek ? "week" : "month"}
              </Title>
              <Button onPress={() => setCheckedOutListOpen(false)}>
                Close
              </Button>
            </View>
            <Text
              style={[
                styles.modalHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {checkedOutListIsWeek
                ? thisWeekRange.label
                : thisMonthRange.label}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {(checkedOutListIsWeek
                ? checkedOutByItemWeek
                : checkedOutByItemMonth
              ).length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  None.
                </Text>
              ) : (
                (checkedOutListIsWeek
                  ? checkedOutByItemWeek
                  : checkedOutByItemMonth
                ).map((it) => (
                  <View key={String(it.itemId)} style={styles.modalRow}>
                    <View style={styles.modalRowTop}>
                      <View style={styles.modalRowTopLeft}>
                        <Text style={styles.modalRowTitle} numberOfLines={1}>
                          {it.name}
                        </Text>
                        <Text
                          style={[
                            styles.modalRowMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {it.itemId}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.modalBadge,
                          {
                            backgroundColor: theme.dark
                              ? "rgba(46,125,50,0.22)"
                              : "rgba(46,125,50,0.12)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalBadgeText,
                            { color: theme.dark ? "#b9f6ca" : "#2e7d32" },
                          ]}
                        >
                          {it.qty} gal
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        {isAdmin && (
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total value</Text>
              {inventoryLoaded ? (
                <Pressable
                  onPress={() => setTotalValueListOpen(true)}
                  style={styles.statNumberPressable}
                >
                  <Title style={styles.statValue}>
                    $
                    {totalValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Title>
                </Pressable>
              ) : (
                <View style={styles.statLoadingRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.statLoadingLabel}>Loading…</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={styles.statLabel}>Total Gallons</Text>
            {inventoryLoaded ? (
              <Title style={styles.statValue}>
                {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
              </Title>
            ) : (
              <View style={styles.statLoadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.statLoadingLabel}>Loading…</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {isAdmin && (
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total items</Text>
              {inventoryLoaded ? (
                <>
                  <Title style={styles.statValue}>{inventory.length}</Title>
                  <Text style={styles.statSubtext}>
                    {(() => {
                      const typeOf = (i) => String(i?.type ?? "").toLowerCase();
                      const paintCount = inventory.filter((i) =>
                        ["paint", "custom_paint"].includes(typeOf(i)),
                      ).length;
                      const stainCount = inventory.filter((i) =>
                        ["stain", "custom_stain"].includes(typeOf(i)),
                      ).length;
                      const primerCount = inventory.filter(
                        (i) => typeOf(i) === "primer",
                      ).length;
                      return `${paintCount} paint · ${stainCount} stain · ${primerCount} primer`;
                    })()}
                  </Text>
                </>
              ) : (
                <View style={styles.statLoadingRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.statLoadingLabel}>Loading…</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        <Card
          style={[styles.statCard, styles.statCardClickable]}
          onPress={() => setGalPeriodWeek((prev) => !prev)}
        >
          <Card.Content>
            <Text style={styles.statLabel}>
              Checked out this {galPeriodWeek ? "week" : "month"}
            </Text>
            {auditLogsLoaded ? (
              <>
                <Pressable
                  onPress={() => {
                    setCheckedOutListIsWeek(galPeriodWeek);
                    setCheckedOutListOpen(true);
                  }}
                  style={styles.statNumberPressable}
                >
                  <Title style={styles.statValue}>
                    {galPeriodWeek ? gallonsUsedThisWeek : gallonsUsedThisMonth}
                    <Text style={styles.statValueUnit}> gal</Text>
                  </Title>
                </Pressable>
                <Text style={styles.statSubtext}>
                  {galPeriodWeek ? thisWeekRange.label : thisMonthRange.label}
                </Text>
              </>
            ) : (
              <View style={styles.statLoadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.statLoadingLabel}>Loading…</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {isAdmin && (
          <Card
            style={[styles.statCard, styles.statCardClickable]}
            onPress={() =>
              setStaleDays((d) => (d === 30 ? 60 : d === 60 ? 90 : 30))
            }
          >
            <Card.Content>
              <Text style={styles.statLabel}>
                Not scanned in{" "}
                <Text style={styles.staleDaysInline}>{staleDays}</Text> days
              </Text>
              <Pressable
                onPress={() => setStaleListOpen(true)}
                style={styles.statNumberPressable}
              >
                <Title style={styles.statValue}>{notScannedCount}</Title>
              </Pressable>
            </Card.Content>
          </Card>
        )}

        {recycleDueCount > 0 && onOpenRecycleDue && (
          <Card
            style={[styles.statCard, styles.statCardClickable]}
            onPress={onOpenRecycleDue}
          >
            <Card.Content>
              <Text style={styles.statLabel}>Paint Need to Recycle</Text>
              <Title style={[styles.statValue, { color: "#e65100" }]}>
                {recycleDueCount}
              </Title>
              <Text style={styles.statSubtextHint}>Tap to View List</Text>
            </Card.Content>
          </Card>
        )}

        {(!auditLogsLoaded || mostUsedColor) && (
          <Card
            style={[styles.statCard, styles.statCardClickable]}
            onPress={
              auditLogsLoaded
                ? () => setMostUsedByWeek((prev) => !prev)
                : undefined
            }
          >
            <Card.Content>
              <Text style={styles.statLabel}>Color most checked out</Text>
              {auditLogsLoaded && mostUsedColor ? (
                <>
                  <Title
                    style={[styles.statValue, { fontSize: 18 }]}
                    numberOfLines={1}
                  >
                    {mostUsedColor.name}
                  </Title>
                  <Text style={styles.statSubtext}>
                    {mostUsedColor.totalGal} gal —{" "}
                    {mostUsedColor.isWeek
                      ? `week of ${mostUsedColor.periodLabel}`
                      : mostUsedColor.periodLabel}
                  </Text>
                </>
              ) : (
                <View style={styles.statLoadingRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.statLoadingLabel}>Loading…</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      </View>

      {showTransactionTable && (
        <>
          {/* Transaction History */}
          <Card style={[styles.historyCard, isWeb && styles.historyCardWeb]}>
            <Card.Content
              style={isWeb ? styles.historyCardContentWeb : undefined}
            >
              <View style={styles.historyHeader}>
                <Title style={styles.historyTitle}>Transaction History</Title>
                {isAdmin && isWeb && (
                  <Button
                    // Keep mode constant to avoid layout shift between outlined/contained
                    mode="outlined"
                    compact
                    onPress={() => setReducedHistory((p) => !p)}
                    style={[
                      styles.reducedToggle,
                      reducedHistory && {
                        backgroundColor: theme.dark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.06)",
                      },
                    ]}
                    contentStyle={styles.reducedToggleContent}
                  >
                    {reducedHistory ? "Reduced" : "Standard"}
                  </Button>
                )}
                <Searchbar
                  placeholder="Search transactions..."
                  onChangeText={setSearchQuery}
                  value={searchQuery}
                  style={styles.searchbar}
                  inputStyle={styles.searchbarInput}
                />
              </View>

              {!auditLogsLoaded ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator
                    size="small"
                    style={styles.transactionsLoadingSpinner}
                  />
                  <Text style={styles.transactionsLoadingText}>
                    Loading transactions…
                  </Text>
                </View>
              ) : filteredLogs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No transactions found</Text>
                </View>
              ) : (
                <ScrollView
                  style={[
                    styles.tableScrollOuter,
                    isWeb && styles.tableScrollOuterWeb,
                  ]}
                  contentContainerStyle={styles.tableScrollOuterContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                >
                  <ScrollView
                    horizontal
                    style={styles.tableScrollHorizontal}
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.tableScrollHorizontalContent}
                  >
                    <DataTable style={styles.dataTable}>
                      <DataTable.Header>
                        <DataTable.Title style={styles.timeCell}>
                          Time
                        </DataTable.Title>
                        <DataTable.Title style={styles.userCell}>
                          User
                        </DataTable.Title>
                        <DataTable.Title style={styles.qtyCell} numeric>
                          Qty (gal)
                        </DataTable.Title>
                        <DataTable.Title style={styles.actionCell}>
                          Action
                        </DataTable.Title>
                        <DataTable.Title style={styles.colorCell}>
                          Color
                        </DataTable.Title>
                        <DataTable.Title style={styles.totalCell} numeric>
                          Total (gal)
                        </DataTable.Title>
                      </DataTable.Header>

                      {filteredLogs.slice(0, 500).map((log, index) => {
                        const showDayDividers = isWeb && isAdmin;
                        const dayKey = showDayDividers
                          ? getDayKey(log.timestamp)
                          : null;
                        const prevKey =
                          showDayDividers && index > 0
                            ? getDayKey(filteredLogs[index - 1]?.timestamp)
                            : null;
                        const startsNewDay =
                          showDayDividers && dayKey && dayKey !== prevKey;
                        const actionText = formatAction(
                          log.action,
                          log.details,
                          log.itemId,
                        );
                        const quantity = getQuantity(
                          log.action,
                          log.details,
                          log.itemId,
                        );
                        const colorName = getItemName(log.itemId);
                        const totalQuantity = getTotalQuantity(
                          log.action,
                          log.details,
                          log.itemId,
                        );

                        return (
                          <React.Fragment key={index}>
                            {startsNewDay && (
                              <DataTable.Row style={styles.dayDividerRow}>
                                <DataTable.Cell style={styles.dayDividerCell}>
                                  <View style={styles.dayDividerWrap}>
                                    <Text style={styles.dayDividerText}>
                                      {formatDayHeader(log.timestamp)}
                                    </Text>
                                    <View style={styles.dayDividerLine} />
                                  </View>
                                </DataTable.Cell>
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                              </DataTable.Row>
                            )}
                            <DataTable.Row>
                              <DataTable.Cell style={styles.timeCell}>
                                <Text style={styles.timeText}>
                                  {new Date(log.timestamp).toLocaleString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.userCell}>
                                <Text
                                  style={[
                                    styles.userText,
                                    { color: theme.dark ? "#fff" : "#666" },
                                  ]}
                                >
                                  {getDisplayUserName(log)}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.qtyCell} numeric>
                                <Text
                                  style={[
                                    styles.quantityText,
                                    { color: theme.dark ? "#fff" : "#000" },
                                  ]}
                                >
                                  {quantity !== "-" ? `${quantity}` : "-"}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.actionCell}>
                                <Chip
                                  style={{
                                    backgroundColor:
                                      getActionColor(log.action, log.details) +
                                      "20",
                                  }}
                                  textStyle={{
                                    color: getActionColor(
                                      log.action,
                                      log.details,
                                    ),
                                    fontSize: 11,
                                  }}
                                >
                                  {actionText}
                                </Chip>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.colorCell}>
                                <Text
                                  style={[
                                    styles.itemNameText,
                                    { color: theme.dark ? "#fff" : undefined },
                                  ]}
                                >
                                  {colorName}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.totalCell} numeric>
                                <Text
                                  style={[
                                    styles.totalText,
                                    { color: theme.dark ? "#fff" : "#000" },
                                  ]}
                                >
                                  {totalQuantity !== "-"
                                    ? `${totalQuantity}`
                                    : "-"}
                                </Text>
                              </DataTable.Cell>
                            </DataTable.Row>
                          </React.Fragment>
                        );
                      })}
                    </DataTable>
                  </ScrollView>
                </ScrollView>
              )}
            </Card.Content>
          </Card>
        </>
      )}
    </View>
  );

  if (isWeb) {
    if (!showTransactionTable) {
      return (
        <ScrollView
          style={[
            styles.container,
            styles.containerWeb,
            { backgroundColor: theme.colors.background },
          ]}
          contentContainerStyle={styles.scrollContentStatsOnly}
          showsVerticalScrollIndicator={true}
        >
          {content}
        </ScrollView>
      );
    }
    return (
      <View
        style={[
          styles.container,
          styles.containerWeb,
          { backgroundColor: theme.colors.background },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web" && { overflow: "hidden" }),
  },
  containerWeb: {
    padding: 20,
    paddingTop: 8,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  scrollContentStatsOnly: {
    padding: 20,
    paddingTop: 8,
  },
  dashboardContainer: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
  },
  dashboardContainerWeb: {
    flex: 1,
    minHeight: 0,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: 200,
    elevation: 2,
  },
  statCardClickable: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statLoadingLabel: {
    fontSize: 14,
    color: "#888",
  },
  statValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#6f95ab",
  },
  statValueUnit: {
    fontSize: 18,
    color: "#666",
  },
  statSubtext: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  statSubtextHint: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
    fontStyle: "italic",
  },
  statNumberPressable: {
    alignSelf: "flex-start",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderRadius: 12,
    padding: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    flex: 1,
  },
  modalHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  modalRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  modalRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalRowTopLeft: {
    flex: 1,
    minWidth: 0,
  },
  modalRowTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalRowMeta: {
    fontSize: 12,
    fontFamily: Platform.OS === "web" ? "monospace" : "monospace",
    marginTop: 2,
  },
  modalRowBottom: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
    marginTop: 6,
  },
  modalRowSub: {
    fontSize: 12,
    opacity: 0.9,
  },
  modalRowSubStrong: {
    fontWeight: "800",
  },
  modalBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  modalBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  staleDaysInline: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#444",
  },
  historyCard: {
    elevation: 2,
  },
  historyCardWeb: {
    flex: 1,
    minHeight: 0,
  },
  historyCardContentWeb: {
    flex: 1,
    minHeight: 0,
  },
  historyHeader: {
    marginBottom: 16,
  },
  reducedToggle: {
    alignSelf: "flex-start",
    marginBottom: 10,
    minWidth: 110,
  },
  reducedToggleContent: {
    height: 36,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  searchbar: {
    marginBottom: 0,
    elevation: 0,
  },
  searchbarInput: {
    fontSize: 14,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  transactionsLoadingSpinner: {
    marginBottom: 8,
  },
  transactionsLoadingText: {
    color: "#888",
    fontSize: 14,
  },
  tableScrollOuter: {
    maxHeight: 520,
    overflow: "hidden",
    ...(Platform.OS === "web" && {
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
    }),
  },
  tableScrollOuterWeb: {
    flex: 1,
    minHeight: 0,
    maxHeight: undefined,
  },
  tableScrollOuterContent: {
    flexGrow: 1,
  },
  tableScrollHorizontal: {
    flexGrow: 0,
  },
  tableScrollHorizontalContent: {
    flexGrow: 0,
  },
  dataTable: {
    minWidth: 900,
  },
  dayDividerRow: {
    borderBottomWidth: 0,
  },
  dayDividerCell: {
    paddingVertical: 0,
    paddingHorizontal: 12,
  },
  dayDividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
  },
  dayDividerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#c0c4cc",
    marginRight: 12,
  },
  dayDividerLine: {
    height: 2,
    flex: 1,
    // Subtle neutral line; avoid theme access inside StyleSheet.
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 1,
  },
  // Fixed width cells based on content needs
  timeCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 120, // "Dec 25, 2:30 PM"
  },
  userCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 70, // User names are typically short
  },
  qtyCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 90, // "5 gal" or numbers
  },
  actionCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 140, // "Checked In", "Manual Adjustment", etc.
  },
  colorCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 250, // Paint color names can be longer - increased to show full text
    flexShrink: 0, // Prevent shrinking
  },
  totalCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 100, // Total quantity numbers
  },
  timeText: {
    fontSize: 12,
    color: "#666",
  },
  itemNameText: {
    fontSize: 13,
    fontWeight: "500",
  },
  userText: {
    fontSize: 12,
    // Color is set inline based on theme
  },
  quantityText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
  totalText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
});
