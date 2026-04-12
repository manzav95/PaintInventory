import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
  Pressable,
  Keyboard,
  Modal,
} from "react-native";
import {
  Card,
  Title,
  Text,
  Button,
  useTheme,
  IconButton,
  TextInput,
  ActivityIndicator,
} from "react-native-paper";
import OrderService from "../services/orderService";
import {
  getItemApMixingFlags,
  itemLeadTimePrefers7Days,
} from "../utils/poItemLabels";

const MAX_AUTOCOMPLETE = 20;
const CUSTOM_ORDER_TYPES = ["custom_paint", "custom_stain"];

function isCustomColorInventoryItem(invItem) {
  const t = (invItem?.type || "").toLowerCase();
  return CUSTOM_ORDER_TYPES.includes(t);
}

// Filter button colors (match order badge colors)
const FILTER_COLORS = {
  all: null,
  existing: "#1976d2",
  back_orders: "#e65100",
  late_orders: "#c62828",
  completed: "#2e7d32",
};

/** PO card labels use per-item AP / mixing flags (Item Details), with legacy fallback to material type. */
function getOrderCategoryLabel(order, inventory) {
  if (!order?.lines?.length || !inventory?.length) return null;
  let hasAp = false;
  let hasMixing = false;
  for (const line of order.lines) {
    const invItem = inventory.find((i) => String(i.id) === String(line.itemId));
    const { hasAp: a, hasMixing: m } = getItemApMixingFlags(invItem);
    if (a) hasAp = true;
    if (m) hasMixing = true;
  }
  if (hasAp && hasMixing) return "AP · MIXING";
  if (hasAp) return "AP";
  if (hasMixing) return "MIXING";
  return null;
}

function getDefaultLeadTimeDays(lines, inventory) {
  const itemIds = (lines || [])
    .map((l) => (l.itemId || "").trim())
    .filter(Boolean);
  if (itemIds.length === 0) return 5;
  let has7Day = false;
  let all3Day = true;
  for (const id of itemIds) {
    const invItem = inventory.find((i) => String(i.id) === String(id));
    const seven = itemLeadTimePrefers7Days(invItem);
    if (seven) has7Day = true;
    if (seven) all3Day = false;
  }
  if (has7Day) return 7;
  if (all3Day && itemIds.length > 0) return 3;
  return 7;
}

function expectedDate(placedAt, leadTimeDays) {
  const d = placedAtToDate(placedAt) || new Date(placedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (parseInt(leadTimeDays, 10) || 7));
  return d;
}

function getWeekStart(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - daysToMonday);
  return date;
}

function getWeekEnd(d) {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getMonthStart(d) {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMonthEnd(d) {
  const date = new Date(d);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Parse placed_at (YYYY-MM-DD or ISO) to a Date for display so calendar day doesn't shift by timezone */
function placedAtToDate(placedAt) {
  if (!placedAt) return null;
  const s = typeof placedAt === "string" ? placedAt.trim() : "";
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dateOnly = s.slice(0, 10);
    return new Date(dateOnly + "T12:00:00.000Z");
  }
  const d = new Date(placedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateWithWeekday(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekRange(weekStart) {
  const end = getWeekEnd(weekStart);
  return `${formatShortDate(weekStart)} – ${formatShortDate(end)}`;
}

function formatMonthRange(monthStart) {
  const end = getMonthEnd(monthStart);
  return `${formatShortDate(monthStart)} – ${formatShortDate(end)}`;
}

function isBackOrder(order) {
  if (order.status !== "open") return false;
  const lines = order.lines || [];
  const someReceived = lines.some(
    (l) => (parseInt(l.received_quantity, 10) || 0) > 0,
  );
  const someRemaining = lines.some(
    (l) =>
      (parseInt(l.received_quantity, 10) || 0) <
      (parseInt(l.quantity, 10) || 0),
  );
  return someReceived && someRemaining;
}

function isExistingOrder(order) {
  if (order.status !== "open") return false;
  const lines = order.lines || [];
  return lines.every((l) => (parseInt(l.received_quantity, 10) || 0) === 0);
}

/** ETA = placed_at + lead_time_days. Used for sorting (earliest first). */
function getExpectedTime(order) {
  const placed = placedAtToDate(order.placed_at);
  if (!placed || Number.isNaN(placed.getTime())) return null;
  const expected = expectedDate(order.placed_at, order.lead_time_days);
  return expected ? expected.getTime() : null;
}

/**
 * Late = today (UTC) is on or after the day after expected (UTC).
 * Matches server getLateOrderCount so home badge and deliveries tab stay in sync.
 */
function isLateOrder(order) {
  if (order.status !== "open") return false;
  const placed = placedAtToDate(order.placed_at);
  if (!placed || Number.isNaN(placed.getTime())) return false;
  const days = parseInt(order.lead_time_days, 10) || 7;
  const expected = new Date(placed);
  expected.setUTCDate(expected.getUTCDate() + days);
  const dayAfterExpectedUtc = Date.UTC(
    expected.getUTCFullYear(),
    expected.getUTCMonth(),
    expected.getUTCDate() + 1,
  );
  const todayUtc = new Date();
  const todayUtcDay = Date.UTC(
    todayUtc.getUTCFullYear(),
    todayUtc.getUTCMonth(),
    todayUtc.getUTCDate(),
  );
  return todayUtcDay >= dayAfterExpectedUtc;
}

export default function UpcomingOrdersScreen({
  onBack,
  inventory = [],
  userName,
  onOrdersChanged,
  initialFilter = null,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 700;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [poNumber, setPoNumber] = useState("");
  const [placedDate, setPlacedDate] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [lines, setLines] = useState([
    { itemId: "", quantity: "", searchQuery: "", jobName: "" },
  ]);
  const [focusedLineIndex, setFocusedLineIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [orderFilter, setOrderFilter] = useState(initialFilter || "existing");
  const [dateViewMode, setDateViewMode] = useState(null); // null | "week" | "month"
  const [editingReceivedOrder, setEditingReceivedOrder] = useState(null);
  const [receivedLineQtys, setReceivedLineQtys] = useState({});
  // track which week/month groups are expanded; default will be top group only
  const [expandedGroupKeys, setExpandedGroupKeys] = useState([]);
  const [poSearchQuery, setPoSearchQuery] = useState("");

  useEffect(() => {
    if (initialFilter) setOrderFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (editingOrder) return;
    const defaultDays = getDefaultLeadTimeDays(lines, inventory || []);
    setLeadTimeDays(String(defaultDays));
  }, [lines, inventory, editingOrder]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const list = await OrderService.getOrders();
      setOrders(list);
    } catch (e) {
      console.error(e);
      // Keep existing orders on failure so we don't wipe the list (e.g. after a successful create)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { itemId: "", quantity: "", searchQuery: "", jobName: "" },
    ]);
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    if (focusedLineIndex === index) setFocusedLineIndex(null);
    else if (focusedLineIndex != null && focusedLineIndex > index)
      setFocusedLineIndex(focusedLineIndex - 1);
  };

  const updateLine = (index, field, value) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "searchQuery") {
        next[index].itemId = "";
        next[index].jobName = "";
      }
      return next;
    });
  };

  // Set both itemId and searchQuery in one update when selecting from dropdown (so we don't clear itemId)
  const setLineItemSelection = (index, item) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        itemId: item.id,
        searchQuery: item.name || item.id,
        jobName: "",
      };
      return next;
    });
  };

  const handleSaveOrder = async () => {
    const po = (poNumber || "").trim();
    const days = parseInt(leadTimeDays, 10);
    if (isNaN(days) || days < 0) {
      Alert.alert("Invalid", "Lead time days must be 0 or greater.");
      return;
    }
    let placedAt = null;
    const rawPlaced = placedDate.trim();
    if (rawPlaced) {
      // If user entered a clean YYYY-MM-DD, trust it as-is to avoid timezone shifting
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawPlaced)) {
        placedAt = rawPlaced;
      } else {
        const d = new Date(rawPlaced);
        if (Number.isNaN(d.getTime())) {
          Alert.alert(
            "Invalid",
            "Placed date must be a valid date (e.g. YYYY-MM-DD).",
          );
          return;
        }
        // Fallback: convert to UTC date-only string
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        placedAt = `${y}-${m}-${day}`;
      }
    }
    const validLines = lines
      .map((l) => {
        const itemId = (l.itemId || "").trim();
        const invItem = (inventory || []).find(
          (i) => String(i.id) === String(itemId),
        );
        const jobTrim = (l.jobName || "").trim();
        return {
          itemId,
          quantity: parseInt(String(l.quantity).trim(), 10),
          job_name:
            invItem && isCustomColorInventoryItem(invItem) && jobTrim
              ? jobTrim
              : "",
        };
      })
      .filter((l) => l.itemId && !isNaN(l.quantity) && l.quantity > 0);
    if (validLines.length === 0) {
      Alert.alert("Invalid", "Add at least one line (item + quantity).");
      return;
    }
    setSaving(true);
    try {
      if (editingOrder) {
        const orderId = Number(editingOrder.id);
        if (!Number.isInteger(orderId)) {
          Alert.alert("Error", "Invalid order.");
          return;
        }
        await OrderService.updateOrder(orderId, po, days, validLines, placedAt);
      } else {
        const created = await OrderService.createOrder(
          po,
          days,
          validLines,
          userName,
          placedAt,
        );
        // Optimistically show the new order so it appears even if the next load fails
        if (created && (created.id != null || created.po_number != null)) {
          setOrders((prev) => [created, ...prev]);
        }
      }
      setPoNumber("");
      setPlacedDate("");
      setLeadTimeDays("7");
      setLines([{ itemId: "", quantity: "", searchQuery: "", jobName: "" }]);
      setEditingOrder(null);
      setShowForm(false);
      setFocusedLineIndex(null);
      await loadOrders();
      onOrdersChanged?.();
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReceived = async (orderId) => {
    setMarkingId(orderId);
    try {
      await OrderService.markOrderReceived(orderId);
      await loadOrders();
      onOrdersChanged?.();
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to mark order received.");
    } finally {
      setMarkingId(null);
    }
  };

  const confirmDeleteOrder = (order) => {
    const id = Number(order.id);
    if (!Number.isFinite(id) || id < 1) {
      Alert.alert("Error", "Invalid order — cannot delete.");
      return;
    }
    const poLabel =
      order.po_number && String(order.po_number).trim()
        ? `PO #${order.po_number}`
        : `Order #${id}`;
    const statusLabel = order.status === "open" ? "Open" : "Received";
    const detail = `${poLabel} (${statusLabel}). This cannot be undone. On-order totals will update.`;

    const runDelete = async () => {
      setDeletingId(id);
      try {
        await OrderService.deleteOrder(id);
        if (editingOrder && Number(editingOrder.id) === id) {
          setShowForm(false);
          setEditingOrder(null);
          setPoNumber("");
          setPlacedDate("");
          setLeadTimeDays("7");
          setLines([
            {
              itemId: "",
              quantity: "",
              searchQuery: "",
              jobName: "",
            },
          ]);
          setFocusedLineIndex(null);
        }
        if (editingReceivedOrder && Number(editingReceivedOrder.id) === id) {
          setEditingReceivedOrder(null);
          setReceivedLineQtys({});
        }
        setOrders((prev) => prev.filter((o) => Number(o.id) !== id));
        await loadOrders();
        onOrdersChanged?.();
      } catch (e) {
        Alert.alert("Error", e.message || "Failed to delete order.");
      } finally {
        setDeletingId(null);
      }
    };

    // RN Web's Alert often breaks multi-button + destructive; use native confirm on web.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const ok = window.confirm(
        `Delete purchase order?\n\n${detail}`,
      );
      if (ok) void runDelete();
      return;
    }

    Alert.alert("Delete purchase order?", detail, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void runDelete();
        },
      },
    ]);
  };

  const openEditReceived = (order) => {
    setEditingReceivedOrder(order);
    const qtys = {};
    (order.lines || []).forEach((l) => {
      const id = String(l.itemId);
      qtys[id] = String(parseInt(l.received_quantity, 10) || 0);
    });
    setReceivedLineQtys(qtys);
  };

  const setReceivedQtyForLine = (itemId, value) => {
    setReceivedLineQtys((prev) => ({ ...prev, [String(itemId)]: value }));
  };

  const handleSaveReceivedLines = async () => {
    if (!editingReceivedOrder) return;
    const orderLines = editingReceivedOrder.lines || [];
    const lines = orderLines.map((l) => {
      const itemId = String(l.itemId);
      const ordered = parseInt(l.quantity, 10) || 0;
      const received = Math.max(
        0,
        Math.min(ordered, parseInt(receivedLineQtys[itemId], 10) || 0),
      );
      return { itemId: l.itemId, received_quantity: received };
    });
    setSaving(true);
    try {
      await OrderService.updateOrderReceivedLines(
        editingReceivedOrder.id,
        lines,
      );
      setEditingReceivedOrder(null);
      setReceivedLineQtys({});
      await loadOrders();
      onOrdersChanged?.();
    } catch (e) {
      Alert.alert(
        "Error",
        e.message || "Failed to update received quantities.",
      );
    } finally {
      setSaving(false);
    }
  };

  const getItemName = (itemId) => {
    const item = inventory.find((i) => String(i.id) === String(itemId));
    return item ? item.name || itemId : itemId;
  };

  const orderMatchesSearch = (order, query, inv) => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return true;
    // Order type: query as prefix of "ap" or "mixing" matches those orders (e.g. "m", "mi", "mix" → Mixing; "a", "ap" → AP)
    const label = getOrderCategoryLabel(order, inv);
    if (label === "AP" && "ap".startsWith(q)) return true;
    if (label === "MIXING" && "mixing".startsWith(q)) return true;
    const po = (order.po_number || "").trim().toLowerCase();
    if (po && po.includes(q)) return true;
    for (const line of order.lines || []) {
      const itemId = String(line.itemId || line.item_id || "");
      const jn = (line.job_name || "").trim().toLowerCase();
      if (jn && jn.includes(q)) return true;
      const item = (inv || []).find((i) => String(i.id) === itemId);
      if (!item) {
        if (itemId.toLowerCase().includes(q)) return true;
        continue;
      }
      const name = (item.name || "").toLowerCase();
      const id = String(item.id || "").toLowerCase();
      const ext = (item.external_code || "").trim().toLowerCase();
      if (name && name.includes(q)) return true;
      if (id && id.includes(q)) return true;
      if (ext && ext.includes(q)) return true;
    }
    return false;
  };

  const filteredOrders = (orders || []).filter((order) => {
    if (!order) return false;
    if (orderFilter === "all") return true;
    if (orderFilter === "existing") return isExistingOrder(order);
    if (orderFilter === "back_orders") return isBackOrder(order);
    if (orderFilter === "late_orders") return isLateOrder(order);
    if (orderFilter === "completed") return order.status === "received";
    return true;
  });

  const getTotalsByType = (orderList) => {
    const byType = {};
    for (const order of orderList) {
      for (const line of order.lines || []) {
        const itemId = line.itemId;
        const item = (inventory || []).find(
          (i) => String(i.id) === String(itemId),
        );
        const type =
          item && item.type ? String(item.type).toLowerCase() : "other";
        const qty = parseInt(line.quantity, 10) || 0;
        byType[type] = (byType[type] || 0) + qty;
      }
    }
    return byType;
  };

  const formatTotalsByType = (totalsByType) => {
    if (!totalsByType || Object.keys(totalsByType).length === 0)
      return "No line items";
    const parts = Object.entries(totalsByType)
      .filter(([, qty]) => qty > 0)
      .map(([type, qty]) => {
        const label =
          type === "other"
            ? "Other"
            : type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
        return `${label}: ${qty} gal`;
      });
    return parts.join(" · ");
  };

  /** All POs sorted by ETA ascending: earliest ETA at top, latest at bottom. Search filter applied. */
  const ordersSortedByEta = useMemo(() => {
    const list = dateViewMode != null ? orders || [] : filteredOrders;
    const afterSearch = list.filter((o) =>
      orderMatchesSearch(o, poSearchQuery, inventory),
    );
    return [...afterSearch].sort((a, b) => {
      const etaA = getExpectedTime(a) ?? Number.MAX_SAFE_INTEGER;
      const etaB = getExpectedTime(b) ?? Number.MAX_SAFE_INTEGER;
      return etaA - etaB;
    });
  }, [dateViewMode, orders, filteredOrders, poSearchQuery, inventory]);

  const groupedByWeek = useMemo(() => {
    if (dateViewMode !== "week") return [];
    const groups = new Map();
    for (const order of ordersSortedByEta) {
      const placed = placedAtToDate(order.placed_at);
      if (!placed || Number.isNaN(placed.getTime())) continue;
      const weekStart = getWeekStart(placed);
      const key = weekStart.getTime();
      if (!groups.has(key)) {
        groups.set(key, { weekStart, orders: [] });
      }
      groups.get(key).orders.push(order);
    }
    const arr = Array.from(groups.entries())
      .map(([_, v]) => v)
      .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
    arr.forEach((g) => {
      g.orders.sort(
        (a, b) => (getExpectedTime(a) ?? 0) - (getExpectedTime(b) ?? 0),
      );
      g.totalsByType = getTotalsByType(g.orders);
    });
    return arr;
  }, [dateViewMode, ordersSortedByEta, inventory]);

  const groupedByMonth = useMemo(() => {
    if (dateViewMode !== "month") return [];
    const groups = new Map();
    for (const order of ordersSortedByEta) {
      const placed = placedAtToDate(order.placed_at);
      if (!placed || Number.isNaN(placed.getTime())) continue;
      const monthStart = getMonthStart(placed);
      const key = `${monthStart.getFullYear()}-${String(
        monthStart.getMonth() + 1,
      ).padStart(2, "0")}`;
      if (!groups.has(key)) {
        groups.set(key, { monthStart, orders: [] });
      }
      groups.get(key).orders.push(order);
    }
    const arr = Array.from(groups.entries())
      .map(([_, v]) => v)
      .sort((a, b) => b.monthStart.getTime() - a.monthStart.getTime());
    arr.forEach((g) => {
      g.orders.sort(
        (a, b) => (getExpectedTime(a) ?? 0) - (getExpectedTime(b) ?? 0),
      );
      g.totalsByType = getTotalsByType(g.orders);
    });
    return arr;
  }, [dateViewMode, ordersSortedByEta, inventory]);

  const renderOrderCard = (order) => {
    const placed = placedAtToDate(order.placed_at);
    const expected = placed
      ? expectedDate(order.placed_at, order.lead_time_days)
      : null;
    const isOpen = order.status === "open";
    const orderIsLate = isLateOrder(order);
    const orderIsBackOrder = isBackOrder(order);
    const singleReceivedDate = getSingleReceivedDate(order);
    const categoryLabel = getOrderCategoryLabel(order, inventory);
    return (
      <Card
        key={order.id}
        style={[
          styles.card,
          styles.orderCard,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <Card.Content>
          <View style={styles.orderHeader}>
            <View style={styles.orderHeaderLeft}>
              <View style={styles.poNumberRow}>
                <Text
                  style={[styles.poNumber, { color: theme.colors.onSurface }]}
                >
                  {order.po_number && String(order.po_number).trim()
                    ? `PO #${order.po_number}`
                    : "No PO (add in edit)"}
                </Text>
                {categoryLabel != null && (
                  <View
                    style={[
                      styles.categoryBadge,
                      {
                        backgroundColor:
                          theme.colors.surfaceVariant || "#e0e0e0",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryBadgeText,
                        { color: theme.colors.onSurfaceVariant || "#555" },
                      ]}
                    >
                      {categoryLabel}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.orderMetaBlock}>
                <Text
                  style={[
                    styles.orderMeta,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Placed on {placed ? formatDateWithWeekday(placed) : "—"} ·
                  Lead time {order.lead_time_days ?? 7} days
                </Text>
                {expected && isOpen && (
                  <Text
                    style={[
                      styles.orderMetaExpected,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Expected {formatDateWithWeekday(expected)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.orderBadgeRow}>
              {!isOpen ? (
                <View style={styles.orderBadge}>
                  <Text style={[styles.badgeText, { color: "#2e7d32" }]}>
                    Received
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.orderBadge}>
                    <Text style={[styles.badgeText, { color: "#1976d2" }]}>
                      Open
                    </Text>
                  </View>
                  {orderIsLate && (
                    <View style={[styles.orderBadge, styles.orderBadgeLate]}>
                      <Text style={[styles.badgeText, { color: "#c62828" }]}>
                        Late
                      </Text>
                    </View>
                  )}
                  {orderIsBackOrder && (
                    <View
                      style={[styles.orderBadge, styles.orderBadgeBackOrder]}
                    >
                      <Text style={[styles.badgeText, { color: "#e65100" }]}>
                        Back ordered
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
          {(order.lines || []).length > 0 && (
            <View style={styles.linesList}>
              {(order.lines || []).map((line, idx) => {
                const received = parseInt(line.received_quantity, 10) || 0;
                const ordered = parseInt(line.quantity, 10) || 0;
                const lineReceivedDate = formatReceivedDate(line);
                const showLineDate = !singleReceivedDate && lineReceivedDate;
                return (
                  <View key={idx} style={styles.lineItem}>
                    <View style={styles.lineItemLeft}>
                      <Text
                        style={[
                          styles.lineItemName,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {getItemName(line.itemId)}
                      </Text>
                      {(line.job_name || "").trim() ? (
                        <Text
                          style={[
                            styles.lineItemJob,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          Job: {(line.job_name || "").trim()}
                        </Text>
                      ) : null}
                      {showLineDate && (
                        <Text
                          style={[
                            styles.lineItemReceived,
                            {
                              color: theme.colors.onSurfaceVariant,
                            },
                          ]}
                        >
                          Received {lineReceivedDate}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.lineItemQty,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {received > 0 ? `${received}/${ordered}` : ordered} gal
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          {isOpen && (
            <View style={styles.orderActions}>
              <Button
                mode="outlined"
                onPress={() => openEditOrder(order)}
                style={styles.editOrderBtn}
                icon="pencil"
                disabled={deletingId === Number(order.id)}
              >
                Edit
              </Button>
              <Button
                mode="outlined"
                onPress={() => handleMarkReceived(order.id)}
                disabled={
                  markingId === order.id ||
                  deletingId === Number(order.id)
                }
                loading={markingId === order.id}
                style={styles.markReceivedBtn}
              >
                Mark Received
              </Button>
              <Button
                mode="outlined"
                onPress={() => confirmDeleteOrder(order)}
                disabled={
                  deletingId === Number(order.id) ||
                  markingId === order.id
                }
                loading={deletingId === Number(order.id)}
                style={styles.deleteOrderBtn}
                icon="delete-outline"
                textColor={theme.colors.error}
              >
                Delete
              </Button>
            </View>
          )}
          {!isOpen && (
            <View style={styles.orderActions}>
              <Button
                mode="outlined"
                onPress={() => openEditReceived(order)}
                style={styles.editOrderBtn}
                icon="pencil"
                disabled={deletingId === Number(order.id)}
              >
                Edit
              </Button>
              {getReceivedDateLine(order) ? (
                <Text
                  style={[
                    styles.receivedDateInline,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {getReceivedDateLine(order)}
                </Text>
              ) : null}
              <Button
                mode="outlined"
                onPress={() => confirmDeleteOrder(order)}
                disabled={deletingId === Number(order.id)}
                loading={deletingId === Number(order.id)}
                style={styles.deleteOrderBtn}
                icon="delete-outline"
                textColor={theme.colors.error}
              >
                Delete
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const formatReceivedDate = (line) => {
    const at = line.received_at;
    if (!at) return null;
    try {
      return formatDateWithWeekday(new Date(at));
    } catch (e) {
      return at;
    }
  };

  const getSingleReceivedDate = (order) => {
    const lines = order.lines || [];
    const dates = [...new Set(lines.map((l) => l.received_at).filter(Boolean))];
    if (dates.length !== 1) return null;
    try {
      return formatDateWithWeekday(new Date(dates[0]));
    } catch (e) {
      return dates[0];
    }
  };

  const getReceivedDateLine = (order) => {
    const single = getSingleReceivedDate(order);
    if (single) return `Received ${single}`;
    const lines = order.lines || [];
    const parts = [
      ...new Set(lines.map((l) => formatReceivedDate(l)).filter(Boolean)),
    ];
    if (parts.length === 0) return null;
    return `Received: ${parts.join(", ")}`;
  };

  const formatPlacedForInput = (placedAt) => {
    if (!placedAt) return "";
    const s = typeof placedAt === "string" ? placedAt.trim() : "";
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      const d = new Date(placedAt);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    } catch (e) {
      return "";
    }
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    setPoNumber("");
    // Default placed date to today's local calendar date (YYYY-MM-DD)
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    setPlacedDate(`${y}-${m}-${d}`);
    setLeadTimeDays("7");
    setLines([{ itemId: "", quantity: "", searchQuery: "", jobName: "" }]);
    setFocusedLineIndex(null);
    setShowForm(true);
  };

  const openEditOrder = (order) => {
    setEditingOrder(order);
    setPoNumber(order.po_number || "");
    setPlacedDate(formatPlacedForInput(order.placed_at));
    setLeadTimeDays(String(order.lead_time_days ?? 7));
    setLines(
      (order.lines || []).map((l) => ({
        itemId: l.itemId || "",
        quantity: String(l.quantity ?? ""),
        searchQuery: getItemName(l.itemId) || "",
        jobName: l.job_name != null ? String(l.job_name) : "",
      })),
    );
    setFocusedLineIndex(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOrder(null);
    setFocusedLineIndex(null);
  };

  const getFilteredInventory = (searchQuery) => {
    const q = (searchQuery || "").toLowerCase().trim();
    if (!q) return inventory.slice(0, MAX_AUTOCOMPLETE);
    return inventory
      .filter(
        (i) =>
          (i.name || "").toLowerCase().includes(q) ||
          String(i.id || "")
            .toLowerCase()
            .includes(q),
      )
      .slice(0, MAX_AUTOCOMPLETE);
  };

  const bgColor = theme?.colors?.background ?? "#fff";
  const primaryColor = theme?.colors?.primary ?? "#6f95ab";

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={onBack}
          iconColor={primaryColor}
        />
        <Title style={[styles.title, isDesktop && styles.titleCentered]}>
          Purchase Orders
        </Title>
        {!isDesktop && (
          <View style={styles.headerRight}>
            {!showForm ? (
              <Button mode="contained" onPress={openNewOrder} icon="plus">
                Add Order
              </Button>
            ) : (
              <Button mode="outlined" onPress={closeForm}>
                Cancel
              </Button>
            )}
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentWeb,
        ]}
      >
        {!showForm && (
          <>
            <TextInput
              mode="outlined"
              placeholder="Search by PO, job, name, ID, or external code"
              value={poSearchQuery}
              onChangeText={setPoSearchQuery}
              style={styles.searchInput}
              left={<TextInput.Icon icon="magnify" />}
            />
            <Text
              style={[
                styles.dateViewLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              By date
            </Text>
            <View style={styles.filterRow}>
              <Button
                mode={dateViewMode === null ? "contained" : "outlined"}
                compact
                onPress={() => setDateViewMode(null)}
                style={styles.filterBtn}
              >
                List
              </Button>
              <Button
                mode={dateViewMode === "week" ? "contained" : "outlined"}
                compact
                onPress={() => {
                  setDateViewMode("week");
                  setOrderFilter("all");
                  setExpandedGroupKeys([]);
                }}
                style={styles.filterBtn}
              >
                Week
              </Button>
              <Button
                mode={dateViewMode === "month" ? "contained" : "outlined"}
                compact
                onPress={() => {
                  setDateViewMode("month");
                  setOrderFilter("all");
                  setExpandedGroupKeys([]);
                }}
                style={styles.filterBtn}
              >
                Month
              </Button>
              {isDesktop && (
                <View style={{ marginLeft: "auto" }}>
                  <Button
                    mode="outlined"
                    onPress={openNewOrder}
                    icon="plus"
                    compact
                  >
                    Add Order
                  </Button>
                </View>
              )}
            </View>
          </>
        )}
        {isDesktop && showForm && (
          <View
            style={[
              styles.filterRow,
              { justifyContent: "flex-end", marginBottom: 8 },
            ]}
          >
            <Button mode="outlined" onPress={closeForm} compact>
              Cancel
            </Button>
          </View>
        )}
        {showForm && (
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content>
              <Title style={styles.cardTitle}>
                {editingOrder ? "Edit Order" : "New Order"}
              </Title>
              <TextInput
                label="PO number (optional)"
                value={poNumber}
                onChangeText={setPoNumber}
                mode="outlined"
                style={styles.input}
                placeholder="Add when you have it – e.g. PO-2024-001"
              />
              <TextInput
                label="Date placed (optional)"
                value={placedDate}
                onChangeText={setPlacedDate}
                mode="outlined"
                style={styles.input}
                placeholder="YYYY-MM-DD (default: today)"
              />
              <TextInput
                label="Lead time (days)"
                value={leadTimeDays}
                onChangeText={setLeadTimeDays}
                mode="outlined"
                keyboardType="number-pad"
                style={styles.input}
                placeholder="7 (default)"
              />
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Line items
              </Text>
              {lines.map((line, index) => {
                const selInv =
                  line.itemId &&
                  inventory.find(
                    (i) => String(i.id) === String(line.itemId),
                  );
                const showJobLine =
                  selInv && isCustomColorInventoryItem(selInv);
                return (
                  <View key={index} style={styles.lineBlock}>
                    <View
                      style={[
                        styles.lineRow,
                        focusedLineIndex === index && styles.lineRowDropdownOpen,
                      ]}
                    >
                  <View style={styles.lineItemIdWrap}>
                    <TextInput
                      label="Item"
                      value={line.searchQuery}
                      onChangeText={(v) => updateLine(index, "searchQuery", v)}
                      onFocus={() => setFocusedLineIndex(index)}
                      onBlur={() =>
                        setTimeout(() => setFocusedLineIndex(null), 180)
                      }
                      mode="outlined"
                      style={[styles.input, styles.lineItemId]}
                      placeholder="Type to search..."
                      right={<TextInput.Icon icon="menu-down" />}
                    />
                    {focusedLineIndex === index && (
                      <View
                        style={[
                          styles.dropdown,
                          {
                            backgroundColor:
                              theme && theme.dark ? "#2d2d2d" : "#ffffff",
                            borderColor: theme && theme.dark ? "#444" : "#ccc",
                          },
                        ]}
                        collapsable={false}
                      >
                        <ScrollView
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                          style={styles.dropdownScroll}
                        >
                          {getFilteredInventory(line.searchQuery).length ===
                          0 ? (
                            <Text
                              style={[
                                styles.dropdownItem,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              No matches
                            </Text>
                          ) : (
                            getFilteredInventory(line.searchQuery).map(
                              (invItem) => (
                                <Pressable
                                  key={invItem.id}
                                  onPress={() => {
                                    setLineItemSelection(index, invItem);
                                    setFocusedLineIndex(null);
                                    Keyboard.dismiss();
                                  }}
                                  style={({ pressed }) => [
                                    styles.dropdownItemWrap,
                                    {
                                      backgroundColor: pressed
                                        ? theme && theme.dark
                                          ? "#3d3d3d"
                                          : "#eee"
                                        : "transparent",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownItem,
                                      { color: theme.colors.onSurface },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {invItem.name || invItem.id}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.dropdownItemId,
                                      { color: theme.colors.onSurfaceVariant },
                                    ]}
                                  >
                                    {invItem.id}
                                  </Text>
                                </Pressable>
                              ),
                            )
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <TextInput
                    label="Qty"
                    value={line.quantity}
                    onChangeText={(v) => updateLine(index, "quantity", v)}
                    mode="outlined"
                    keyboardType="number-pad"
                    style={[styles.input, styles.lineQty]}
                  />
                  {lines.length > 1 ? (
                    <IconButton
                      icon="delete-outline"
                      size={22}
                      onPress={() => removeLine(index)}
                      iconColor={theme.colors.error}
                    />
                  ) : null}
                    </View>
                    {showJobLine ? (
                      <>
                        <TextInput
                          label="Job (optional)"
                          value={line.jobName}
                          onChangeText={(v) =>
                            updateLine(index, "jobName", v)
                          }
                          mode="outlined"
                          style={styles.input}
                          placeholder="e.g. 12345"
                        />
                        <Text
                          style={[
                            styles.jobLineHint,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Optional — link this custom color to a job for search.
                        </Text>
                      </>
                    ) : null}
                  </View>
                );
              })}
              <Button
                mode="outlined"
                onPress={addLine}
                style={styles.addLineBtn}
              >
                Add Line
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveOrder}
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
                icon="content-save"
              >
                {editingOrder ? "Update Order" : "Save Order"}
              </Button>
            </Card.Content>
          </Card>
        )}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : !showForm ? (
          <>
            <View style={styles.filterRow}>
              <Button
                mode={orderFilter === "all" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("all")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
                buttonColor={
                  orderFilter === "all" ? theme.colors.primary : undefined
                }
                textColor={orderFilter === "all" ? "#fff" : undefined}
              >
                All
              </Button>
              <Button
                mode={orderFilter === "existing" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("existing")}
                style={[
                  styles.filterBtn,
                  orderFilter !== "existing" &&
                    FILTER_COLORS.existing && {
                      borderColor: FILTER_COLORS.existing,
                    },
                ]}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
                buttonColor={
                  orderFilter === "existing"
                    ? FILTER_COLORS.existing
                    : undefined
                }
                textColor={
                  orderFilter === "existing"
                    ? "#fff"
                    : orderFilter !== "existing" && FILTER_COLORS.existing
                      ? FILTER_COLORS.existing
                      : undefined
                }
              >
                Open POs
              </Button>
              <Button
                mode={orderFilter === "back_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("back_orders")}
                style={[
                  styles.filterBtn,
                  orderFilter !== "back_orders" &&
                    FILTER_COLORS.back_orders && {
                      borderColor: FILTER_COLORS.back_orders,
                    },
                ]}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
                buttonColor={
                  orderFilter === "back_orders"
                    ? FILTER_COLORS.back_orders
                    : undefined
                }
                textColor={
                  orderFilter === "back_orders"
                    ? "#fff"
                    : orderFilter !== "back_orders" && FILTER_COLORS.back_orders
                      ? FILTER_COLORS.back_orders
                      : undefined
                }
              >
                Back Orders
              </Button>
              <Button
                mode={orderFilter === "late_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("late_orders")}
                style={[
                  styles.filterBtn,
                  orderFilter !== "late_orders" &&
                    FILTER_COLORS.late_orders && {
                      borderColor: FILTER_COLORS.late_orders,
                    },
                ]}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
                buttonColor={
                  orderFilter === "late_orders"
                    ? FILTER_COLORS.late_orders
                    : undefined
                }
                textColor={
                  orderFilter === "late_orders"
                    ? "#fff"
                    : orderFilter !== "late_orders" && FILTER_COLORS.late_orders
                      ? FILTER_COLORS.late_orders
                      : undefined
                }
              >
                Late Orders
              </Button>
              <Button
                mode={orderFilter === "completed" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("completed")}
                style={[
                  styles.filterBtn,
                  orderFilter !== "completed" &&
                    FILTER_COLORS.completed && {
                      borderColor: FILTER_COLORS.completed,
                    },
                ]}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
                buttonColor={
                  orderFilter === "completed"
                    ? FILTER_COLORS.completed
                    : undefined
                }
                textColor={
                  orderFilter === "completed"
                    ? "#fff"
                    : orderFilter !== "completed" && FILTER_COLORS.completed
                      ? FILTER_COLORS.completed
                      : undefined
                }
              >
                Completed POs
              </Button>
            </View>
            {(() => {
              const emptyCount =
                dateViewMode === "week"
                  ? groupedByWeek.length
                  : dateViewMode === "month"
                    ? groupedByMonth.length
                    : ordersSortedByEta.length;
              const isEmpty = emptyCount === 0;
              const hasSearchFilter = (poSearchQuery || "").trim() !== "";
              if (isEmpty) {
                return (
                  <Card
                    style={[
                      styles.card,
                      { backgroundColor: theme.colors.surface },
                    ]}
                  >
                    <Card.Content>
                      <Text
                        style={[
                          styles.emptyText,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        {hasSearchFilter && "No POs match your search."}
                        {!hasSearchFilter &&
                          dateViewMode != null &&
                          "No POs yet."}
                        {!hasSearchFilter &&
                          dateViewMode === null &&
                          orderFilter === "all" &&
                          "No POs yet."}
                        {!hasSearchFilter &&
                          dateViewMode === null &&
                          orderFilter === "existing" &&
                          "No open POs yet."}
                        {!hasSearchFilter &&
                          dateViewMode === null &&
                          orderFilter === "back_orders" &&
                          "No back orders (partial deliveries)."}
                        {!hasSearchFilter &&
                          dateViewMode === null &&
                          orderFilter === "late_orders" &&
                          "No late orders."}
                        {!hasSearchFilter &&
                          dateViewMode === null &&
                          orderFilter === "completed" &&
                          "No completed POs yet."}
                      </Text>
                    </Card.Content>
                  </Card>
                );
              }
              if (dateViewMode === "week") {
                return groupedByWeek.map((group, index) => {
                  const key = `week-${group.weekStart.getTime()}`;
                  const isExpanded = expandedGroupKeys.includes(key);
                  return (
                    <View
                      key={group.weekStart.getTime()}
                      style={styles.dateGroupBlock}
                    >
                      <Pressable
                        onPress={() =>
                          setExpandedGroupKeys((prev) =>
                            prev.includes(key)
                              ? prev.filter((k) => k !== key)
                              : [...prev, key],
                          )
                        }
                      >
                        <View
                          style={[
                            styles.dateGroupHeader,
                            {
                              backgroundColor:
                                theme.colors.surfaceVariant || "#e0e0e0",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dateGroupTitle,
                              { color: theme.colors.onSurface },
                            ]}
                          >
                            {formatWeekRange(group.weekStart)}
                          </Text>
                          <Text
                            style={[
                              styles.dateGroupTotals,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {formatTotalsByType(group.totalsByType)}
                          </Text>
                          <Text
                            style={[
                              styles.dateGroupToggle,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {isExpanded ? "Tap to collapse" : "Tap to expand"}
                          </Text>
                        </View>
                      </Pressable>
                      {isExpanded &&
                        group.orders.map((order) => renderOrderCard(order))}
                    </View>
                  );
                });
              }
              if (dateViewMode === "month") {
                return groupedByMonth.map((group, index) => {
                  const key = `month-${group.monthStart.getTime()}`;
                  const isExpanded = expandedGroupKeys.includes(key);
                  return (
                    <View
                      key={group.monthStart.getTime()}
                      style={styles.dateGroupBlock}
                    >
                      <Pressable
                        onPress={() =>
                          setExpandedGroupKeys((prev) =>
                            prev.includes(key)
                              ? prev.filter((k) => k !== key)
                              : [...prev, key],
                          )
                        }
                      >
                        <View
                          style={[
                            styles.dateGroupHeader,
                            {
                              backgroundColor:
                                theme.colors.surfaceVariant || "#e0e0e0",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dateGroupTitle,
                              { color: theme.colors.onSurface },
                            ]}
                          >
                            {formatMonthRange(group.monthStart)}
                          </Text>
                          <Text
                            style={[
                              styles.dateGroupTotals,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {formatTotalsByType(group.totalsByType)}
                          </Text>
                          <Text
                            style={[
                              styles.dateGroupToggle,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {isExpanded ? "Tap to collapse" : "Tap to expand"}
                          </Text>
                        </View>
                      </Pressable>
                      {isExpanded &&
                        group.orders.map((order) => renderOrderCard(order))}
                    </View>
                  );
                });
              }
              return ordersSortedByEta.map((order) => renderOrderCard(order));
            })()}
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={!!editingReceivedOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingReceivedOrder(null)}
      >
        <Pressable
          style={styles.receivedModalOverlay}
          onPress={() => setEditingReceivedOrder(null)}
        >
          <Pressable
            style={[
              styles.receivedModalBox,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <Title
              style={[
                styles.receivedModalTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              Adjust received quantities
            </Title>
            <Text
              style={[
                styles.receivedModalSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Reduce received to bring items back to expecting. Save reopens the
              PO if any line has remaining.
            </Text>
            <ScrollView
              style={styles.receivedModalScroll}
              keyboardShouldPersistTaps="handled"
            >
              {editingReceivedOrder &&
                (editingReceivedOrder.lines || []).map((line, idx) => {
                  const itemId = String(line.itemId);
                  const ordered = parseInt(line.quantity, 10) || 0;
                  const receivedVal =
                    receivedLineQtys[itemId] ??
                    String(parseInt(line.received_quantity, 10) || 0);
                  return (
                    <View key={idx} style={styles.receivedModalRow}>
                      <Text
                        style={[
                          styles.receivedModalRowName,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {getItemName(line.itemId)}
                      </Text>
                      <Text
                        style={[
                          styles.receivedModalRowOrdered,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Ordered: {ordered} gal
                      </Text>
                      <TextInput
                        label="Received (gal)"
                        value={receivedVal}
                        onChangeText={(v) =>
                          setReceivedQtyForLine(line.itemId, v)
                        }
                        mode="outlined"
                        keyboardType="number-pad"
                        style={styles.receivedModalInput}
                      />
                    </View>
                  );
                })}
            </ScrollView>
            <View style={styles.receivedModalActions}>
              <Button
                mode="outlined"
                onPress={() => setEditingReceivedOrder(null)}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveReceivedLines}
                loading={saving}
                disabled={saving}
              >
                Save
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    flex: 1,
  },
  titleCentered: {
    textAlign: "center",
  },
  headerRight: {
    marginLeft: "auto",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  scrollContentWeb: {
    maxWidth: 760,
    alignSelf: "center",
    width: "100%",
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 8,
  },
  lineBlock: {
    marginBottom: 8,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 8,
  },
  jobLineHint: {
    fontSize: 11,
    marginBottom: 4,
    marginTop: -4,
  },
  lineRowDropdownOpen: {
    position: "relative",
    zIndex: 10000,
    elevation: 10000,
  },
  lineItemIdWrap: {
    flex: 1,
    position: "relative",
  },
  lineItemId: {
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 10001,
    elevation: 10001,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 2px 8px rgba(0,0,0,0.2)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        }),
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 196,
  },
  dropdownItemWrap: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  dropdownItem: {
    fontSize: 14,
  },
  dropdownItemId: {
    fontSize: 12,
    marginTop: 2,
  },
  lineQty: {
    width: 80,
  },
  orderActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  editOrderBtn: {
    alignSelf: "flex-start",
  },
  addLineBtn: {
    marginTop: 4,
    marginBottom: 16,
  },
  saveBtn: {
    marginTop: 4,
  },
  centered: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  dateViewLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  searchInput: {
    marginBottom: 12,
    backgroundColor: "transparent",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {
    minWidth: 108,
  },
  dateGroupBlock: {
    marginBottom: 24,
  },
  dateGroupHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#1976d2",
  },
  dateGroupTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  dateGroupTotals: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 4,
  },
  dateGroupToggle: {
    fontSize: 11,
    marginTop: 6,
  },
  orderCard: {
    marginBottom: 12,
  },
  receivedDateBanner: {
    fontSize: 12,
    marginBottom: 8,
  },
  receivedDateFooter: {
    fontSize: 12,
    marginTop: 8,
    alignSelf: "flex-end",
    textAlign: "right",
  },
  receivedDateInline: {
    fontSize: 12,
    marginLeft: "auto",
    alignSelf: "center",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  orderHeaderLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  poNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  poNumber: {
    fontSize: 17,
    fontWeight: "700",
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  orderMetaBlock: {
    marginBottom: 4,
  },
  orderMeta: {
    fontSize: 13,
  },
  orderMetaExpected: {
    fontSize: 13,
    marginTop: 2,
  },
  orderBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  orderBadgeLate: {
    backgroundColor: "rgba(198, 40, 40, 0.12)",
  },
  orderBadgeBackOrder: {
    backgroundColor: "rgba(230, 81, 0, 0.12)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  linesList: {
    marginBottom: 12,
    paddingLeft: 4,
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  lineItemLeft: {
    flex: 1,
  },
  lineItemName: {
    fontSize: 14,
  },
  lineItemJob: {
    fontSize: 12,
    marginTop: 2,
  },
  lineItemReceived: {
    fontSize: 12,
    marginTop: 2,
  },
  lineItemQty: {
    fontSize: 14,
  },
  markReceivedBtn: {
    alignSelf: "flex-start",
  },
  deleteOrderBtn: {
    alignSelf: "flex-start",
  },
  receivedModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  receivedModalBox: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    padding: 20,
    maxHeight: "85%",
  },
  receivedModalTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  receivedModalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  receivedModalScroll: {
    maxHeight: 320,
  },
  receivedModalRow: {
    marginBottom: 16,
  },
  receivedModalRowName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  receivedModalRowOrdered: {
    fontSize: 13,
    marginBottom: 6,
  },
  receivedModalInput: {
    backgroundColor: "transparent",
  },
  receivedModalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 20,
  },
});
