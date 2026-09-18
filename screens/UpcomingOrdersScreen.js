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
  useTheme,
  IconButton,
  TextInput,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import DateField from "../components/DateField";
import PageHeader from "../components/PageHeader";
import MetricStrip from "../components/MetricStrip";
import ToolbarCard from "../components/ToolbarCard";
import OrderService from "../services/orderService";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { nestedSurfaceColor } from "../utils/themeColors";
import {
  getItemApMixingFlags,
  itemLeadTimePrefers7Days,
} from "../utils/poItemLabels";
import {
  allowsHalfGallon,
  normalizeStoredGallons,
  parseGallonQuantity,
  sanitizeGallonInput,
  formatGallonQuantity,
} from "../utils/gallonQuantity";
import ScrollFrame from "../components/ScrollFrame";
import { colors, space, radius } from "../theme/tokens";
import { AppBadge, AppEmptyState } from "../components/ui";
import {
  getMaterialTypeColor,
  getMaterialTypeLabel,
} from "../utils/materialTypes";

const LINE_RECEIVE_HIGHLIGHT = {
  complete: {
    soft: "rgba(46,125,50,0.14)",
    accent: colors.semantic.success,
  },
  partial: {
    soft: "rgba(249,168,37,0.16)",
    accent: colors.semantic.partial,
  },
};

function lineReceiveHighlight(line) {
  const ordered = lineGallonQty(line, "ordered");
  const received = lineGallonQty(line, "received");
  if (ordered > 0 && received >= ordered) return LINE_RECEIVE_HIGHLIGHT.complete;
  if (received > 0 && received < ordered) return LINE_RECEIVE_HIGHLIGHT.partial;
  return null;
}

function lineGallonQty(line, field = "ordered") {
  const raw =
    field === "received"
      ? line.received_quantity ?? line.receivedQuantity
      : line.quantity ?? line.qty;
  return normalizeStoredGallons(raw);
}

const MAX_AUTOCOMPLETE = 20;
const CUSTOM_ORDER_TYPES = ["custom_paint", "custom_stain"];

function isCustomColorInventoryItem(invItem) {
  const t = (invItem?.type || "").toLowerCase();
  return CUSTOM_ORDER_TYPES.includes(t);
}

// Filter button colors (match order badge colors)
const FILTER_COLORS = {
  all: null,
  existing: colors.semantic.open,
  back_orders: colors.semantic.recycleBannerText,
  late_orders: colors.semantic.recycleDueDate,
  completed: colors.semantic.success,
};

function categoryBadgeTone(label) {
  if (label === "AP") return "warning";
  if (label === "MIXING") return "info";
  return "default";
}

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
  const someReceived = lines.some((l) => lineGallonQty(l, "received") > 0);
  const someRemaining = lines.some(
    (l) =>
      lineGallonQty(l, "received") < lineGallonQty(l, "ordered"),
  );
  return someReceived && someRemaining;
}

function isExistingOrder(order) {
  if (order.status !== "open") return false;
  const lines = order.lines || [];
  return lines.every((l) => lineGallonQty(l, "received") === 0);
}

/** Placed date ms for sorting (most recent first). */
function getPlacedTime(order) {
  const placed = placedAtToDate(order.placed_at);
  if (!placed || Number.isNaN(placed.getTime())) return null;
  return placed.getTime();
}

/** Compare POs: most recently placed first; higher id wins ties. */
function compareOrdersMostRecentFirst(a, b) {
  const placedA = getPlacedTime(a) ?? 0;
  const placedB = getPlacedTime(b) ?? 0;
  if (placedB !== placedA) return placedB - placedA;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
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
  orders: ordersFromApp = [],
  ordersLoaded = true,
  ordersLoading = false,
  onRefreshOrders,
  onOrdersChanged,
  initialFilter = null,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const isWideLayout = isDesktop || embeddedInShell;
  const isCompactLayout = width < DESKTOP_BREAKPOINT;

  const orders = ordersFromApp;
  const showBlockingLoad = !ordersLoaded;
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

  useEffect(() => {
    if (!ordersLoaded && onRefreshOrders) {
      onRefreshOrders();
    }
  }, [ordersLoaded, onRefreshOrders]);

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
            "Placed date must be a valid date.",
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
        const parsed = parseGallonQuantity(l.quantity, invItem?.type);
        return {
          itemId,
          quantity: parsed.ok ? parsed.value : NaN,
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
      }
      setPoNumber("");
      setPlacedDate("");
      setLeadTimeDays("7");
      setLines([{ itemId: "", quantity: "", searchQuery: "", jobName: "" }]);
      setEditingOrder(null);
      setShowForm(false);
      setFocusedLineIndex(null);
      await onOrdersChanged?.();
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
      await onOrdersChanged?.();
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
        await onOrdersChanged?.();
      } catch (e) {
        Alert.alert("Error", e.message || "Failed to delete order.");
      } finally {
        setDeletingId(null);
      }
    };

    // RN Web's Alert often breaks multi-button + destructive; use native confirm on web.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const ok = window.confirm(`Delete purchase order?\n\n${detail}`);
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
      qtys[id] = String(lineGallonQty(l, "received"));
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
      const ordered = lineGallonQty(l, "ordered");
      const invItem = (inventory || []).find(
        (i) => String(i.id) === itemId,
      );
      const parsed = parseGallonQuantity(
        receivedLineQtys[itemId],
        invItem?.type,
        { allowZero: true },
      );
      if (!parsed.ok) {
        throw new Error(
          `${getItemName(line.itemId)}: ${parsed.error || "Invalid quantity"}`,
        );
      }
      const received = Math.max(0, Math.min(ordered, parsed.value));
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
      await onOrdersChanged?.();
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

  const orderCounts = useMemo(() => {
    const list = orders || [];
    return {
      all: list.length,
      existing: list.filter(isExistingOrder).length,
      back: list.filter(isBackOrder).length,
      late: list.filter(isLateOrder).length,
      completed: list.filter((o) => o.status === "received").length,
    };
  }, [orders]);

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
        const qty = lineGallonQty(line, "ordered");
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

  const formatGroupSummary = (orders, totalsByType) => {
    const count = Array.isArray(orders) ? orders.length : 0;
    const poPart = `${count} PO${count === 1 ? "" : "s"}`;
    return `${poPart} · ${formatTotalsByType(totalsByType)}`;
  };

  /** All POs sorted most recent placed_at first. Search filter applied. */
  const ordersSortedByEta = useMemo(() => {
    const list = dateViewMode != null ? orders || [] : filteredOrders;
    const afterSearch = list.filter((o) =>
      orderMatchesSearch(o, poSearchQuery, inventory),
    );
    return [...afterSearch].sort(compareOrdersMostRecentFirst);
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
      g.orders.sort(compareOrdersMostRecentFirst);
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
      g.orders.sort(compareOrdersMostRecentFirst);
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
    const typeChips = (() => {
      const seen = new Map();
      for (const line of order.lines || []) {
        const invItem = inventory.find(
          (i) => String(i.id) === String(line.itemId),
        );
        const t = String(invItem?.type || "").toLowerCase().trim();
        if (!t || seen.has(t)) continue;
        seen.set(t, {
          key: t,
          label: getMaterialTypeLabel(t),
          color: getMaterialTypeColor(t, theme),
        });
      }
      return Array.from(seen.values());
    })();
    const primaryTypeColor =
      typeChips[0]?.color ||
      (isOpen ? colors.brand.accent : colors.semantic.success);
    const jobs = (() => {
      const set = new Set();
      for (const line of order.lines || []) {
        const j = (line.job_name || "").trim();
        if (j) set.add(j);
      }
      return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
    })();
    return (
      <Card
        key={order.id}
        style={[
          styles.card,
          styles.orderCard,
          {
            backgroundColor: theme.colors.surfaceContainerHighest,
            borderColor: theme.colors.outlineVariant,
            borderBottomWidth: 3,
            borderBottomColor: primaryTypeColor,
          },
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
                    : "No PO Yet"}
                </Text>
                {categoryLabel != null && (
                  <AppBadge tone={categoryBadgeTone(categoryLabel)}>
                    {categoryLabel}
                  </AppBadge>
                )}
              </View>
              {typeChips.length > 0 ? (
                <View style={styles.typeChipRow}>
                  {typeChips.map((chip) => (
                    <View
                      key={chip.key}
                      style={[
                        styles.typeChip,
                        {
                          borderColor: chip.color,
                          backgroundColor: theme.dark
                            ? `${chip.color}33`
                            : `${chip.color}18`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.typeChipDot,
                          { backgroundColor: chip.color },
                        ]}
                      />
                      <Text
                        style={[styles.typeChipText, { color: chip.color }]}
                      >
                        {chip.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
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
                {jobs.length > 0 && (
                  <Text
                    style={[
                      styles.orderMetaExpected,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                    numberOfLines={1}
                  >
                    Jobs: {jobs.slice(0, 6).join(", ")}
                    {jobs.length > 6 ? ` +${jobs.length - 6}` : ""}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.orderBadgeRow}>
              {!isOpen ? (
                <AppBadge tone="success">Received</AppBadge>
              ) : (
                <>
                  <AppBadge tone="primary">Open</AppBadge>
                  {orderIsLate && <AppBadge tone="late">Late</AppBadge>}
                  {orderIsBackOrder && (
                    <AppBadge tone="backOrder">Back ordered</AppBadge>
                  )}
                </>
              )}
            </View>
          </View>
          {(order.lines || []).length > 0 && (
            <View style={styles.linesList}>
              {(order.lines || []).map((line, idx) => {
                const received = lineGallonQty(line, "received");
                const ordered = lineGallonQty(line, "ordered");
                const highlight = lineReceiveHighlight(line);
                const lineReceivedDate = formatReceivedDate(line);
                const showLineDate = !singleReceivedDate && lineReceivedDate;
                const invItem = inventory.find(
                  (i) => String(i.id) === String(line.itemId),
                );
                const typeKey = String(invItem?.type || "")
                  .toLowerCase()
                  .trim();
                const typeColor = typeKey
                  ? getMaterialTypeColor(typeKey, theme)
                  : theme.colors.outlineVariant;
                const typeLabel = typeKey
                  ? getMaterialTypeLabel(typeKey)
                  : "";
                return (
                  <View
                    key={idx}
                    style={[
                      styles.lineItem,
                      {
                        backgroundColor: highlight
                          ? highlight.soft
                          : nestedSurfaceColor(theme),
                        borderColor: highlight
                          ? highlight.accent
                          : theme.colors.outlineVariant,
                        borderLeftWidth: 4,
                        borderLeftColor: highlight
                          ? highlight.accent
                          : typeColor,
                      },
                    ]}
                  >
                    <View style={styles.lineItemLeft}>
                      <View style={styles.lineItemNameRow}>
                        <Text
                          style={[
                            styles.lineItemName,
                            { color: theme.colors.onSurface, flex: 1 },
                          ]}
                          numberOfLines={1}
                        >
                          {getItemName(line.itemId)}
                        </Text>
                        {typeLabel ? (
                          <Text
                            style={[
                              styles.lineTypeLabel,
                              { color: typeColor },
                            ]}
                            numberOfLines={1}
                          >
                            {typeLabel}
                          </Text>
                        ) : null}
                      </View>
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
                        {
                          color: highlight
                            ? highlight.accent
                            : theme.colors.onSurfaceVariant,
                          fontWeight: highlight ? "700" : "400",
                        },
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
              <AppButton
                mode="outlined"
                onPress={() => openEditOrder(order)}
                style={styles.orderActionBtn}
                contentStyle={styles.orderActionBtnContent}
                labelStyle={styles.orderActionBtnLabel}
                icon="pencil"
                compact
                disabled={deletingId === Number(order.id)}
              >
                Edit
              </AppButton>
              <AppButton
                mode="outlined"
                onPress={() => handleMarkReceived(order.id)}
                disabled={
                  markingId === order.id || deletingId === Number(order.id)
                }
                loading={markingId === order.id}
                style={styles.orderActionBtn}
                contentStyle={styles.orderActionBtnContent}
                labelStyle={styles.orderActionBtnLabel}
                compact
              >
                Mark Received
              </AppButton>
              <AppButton
                mode="outlined"
                onPress={() => confirmDeleteOrder(order)}
                disabled={
                  deletingId === Number(order.id) || markingId === order.id
                }
                loading={deletingId === Number(order.id)}
                style={styles.orderActionBtn}
                contentStyle={styles.orderActionBtnContent}
                labelStyle={styles.orderActionBtnLabel}
                icon="delete-outline"
                textColor={theme.colors.error}
                compact
              >
                Delete
              </AppButton>
            </View>
          )}
          {!isOpen && (
            <>
              {getReceivedDateLine(order) ? (
                <Text
                  style={[
                    styles.receivedDateFooter,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {getReceivedDateLine(order)}
                </Text>
              ) : null}
              <View style={styles.orderActions}>
                <AppButton
                  mode="outlined"
                  onPress={() => openEditReceived(order)}
                  style={styles.orderActionBtn}
                  contentStyle={styles.orderActionBtnContent}
                  labelStyle={styles.orderActionBtnLabel}
                  icon="pencil"
                  compact
                  disabled={deletingId === Number(order.id)}
                >
                  Edit
                </AppButton>
                <AppButton
                  mode="outlined"
                  onPress={() => confirmDeleteOrder(order)}
                  disabled={deletingId === Number(order.id)}
                  loading={deletingId === Number(order.id)}
                  style={styles.orderActionBtn}
                  contentStyle={styles.orderActionBtnContent}
                  labelStyle={styles.orderActionBtnLabel}
                  icon="delete-outline"
                  textColor={theme.colors.error}
                  compact
                >
                  Delete
                </AppButton>
              </View>
            </>
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
  const primaryColor = theme?.colors?.primary ?? colors.brand.primary;

  const dateViewLocksFilters =
    dateViewMode === "week" || dateViewMode === "month";

  const metricItems = useMemo(
    () => {
      const pickFilter = (filter) =>
        dateViewLocksFilters ? undefined : () => setOrderFilter(filter);
      return [
        {
          id: "all",
          label: "All POs",
          value: orderCounts.all,
          color: theme?.colors?.primary,
          active: orderFilter === "all",
          onPress: pickFilter("all"),
        },
        {
          id: "existing",
          label: "Open POs",
          value: orderCounts.existing,
          // semantic.open is navy — readable on light, invisible on dark chrome
          color: theme?.dark
            ? colors.brand.primaryOnDark
            : FILTER_COLORS.existing,
          active: orderFilter === "existing",
          onPress: pickFilter("existing"),
        },
        {
          id: "back",
          label: "Back orders",
          value: orderCounts.back,
          color: FILTER_COLORS.back_orders,
          active: orderFilter === "back_orders",
          onPress: pickFilter("back_orders"),
        },
        {
          id: "late",
          label: "Late",
          value: orderCounts.late,
          color: FILTER_COLORS.late_orders,
          active: orderFilter === "late_orders",
          onPress: pickFilter("late_orders"),
        },
        {
          id: "completed",
          label: "Completed",
          value: orderCounts.completed,
          color: FILTER_COLORS.completed,
          active: orderFilter === "completed",
          onPress: pickFilter("completed"),
        },
      ];
    },
    [orderCounts, orderFilter, theme?.colors?.primary, theme?.dark, dateViewLocksFilters],
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isWideLayout && styles.scrollContentWeb,
        ]}
      >
        <PageHeader
          title="Purchase Orders"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
          actions={
            !showForm && !isCompactLayout ? (
              <AppButton mode="contained" onPress={openNewOrder} icon="plus" compact>
                Add Order
              </AppButton>
            ) : showForm && !isCompactLayout ? (
              <AppButton mode="outlined" onPress={closeForm} compact>
                Cancel
              </AppButton>
            ) : undefined
          }
        />

        {!showForm && (
          <>
            <MetricStrip items={metricItems} />
            {isCompactLayout ? (
              <AppButton
                mode="contained"
                onPress={openNewOrder}
                icon="plus"
                style={styles.addOrderFullWidth}
                contentStyle={styles.addOrderFullWidthContent}
              >
                Add Order
              </AppButton>
            ) : null}
            <ToolbarCard>
              <TextInput
                mode="outlined"
                placeholder="Search by PO, job, name, ID, or external code"
                value={poSearchQuery}
                onChangeText={setPoSearchQuery}
                style={styles.searchInput}
              />
              <Text
                style={[
                  styles.dateViewLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                By date
              </Text>
              <View
                style={[
                  styles.dateTabBar,
                  {
                    borderColor: theme.colors.outlineVariant,
                    backgroundColor: theme.dark
                      ? theme.colors.surfaceContainerHighest
                      : theme.colors.surfaceContainerHigh ??
                        theme.colors.surface,
                  },
                ]}
              >
                {(
                  [
                    {
                      key: null,
                      label: "List",
                      accent: theme.dark
                        ? colors.brand.primaryOnDark
                        : colors.brand.accent,
                    },
                    {
                      key: "week",
                      label: "Week",
                      accent: colors.brand.accent,
                    },
                    {
                      key: "month",
                      label: "Month",
                      accent: colors.action.materialUsage,
                    },
                  ]
                ).map(({ key, label, accent }, i) => {
                  const selected = dateViewMode === key;
                  const selBg = selected
                    ? theme.dark
                      ? `${accent}33`
                      : `${accent}18`
                    : "transparent";
                  return (
                    <Pressable
                      key={label}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        if (key == null) {
                          setDateViewMode(null);
                          return;
                        }
                        setDateViewMode(key);
                        setOrderFilter("all");
                        setExpandedGroupKeys([]);
                      }}
                      style={({ pressed }) => [
                        styles.dateTabCell,
                        i > 0 && {
                          borderLeftWidth: StyleSheet.hairlineWidth,
                          borderLeftColor: theme.colors.outlineVariant,
                        },
                        {
                          backgroundColor: selBg,
                          borderBottomWidth: 3,
                          borderBottomColor: selected
                            ? accent
                            : "transparent",
                        },
                        pressed && { opacity: 0.92 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dateTabLabel,
                          {
                            color: selected
                              ? accent
                              : theme.colors.onSurfaceVariant,
                            fontWeight: selected ? "800" : "600",
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ToolbarCard>
          </>
        )}
        {showForm && isCompactLayout && (
          <View
            style={[
              styles.filterRow,
              { justifyContent: "flex-end", marginBottom: 8 },
            ]}
          >
            <AppButton mode="outlined" onPress={closeForm} compact>
              Cancel
            </AppButton>
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
              <DateField
                label="Date placed (optional)"
                value={placedDate}
                onChange={setPlacedDate}
                style={styles.input}
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
                  inventory.find((i) => String(i.id) === String(line.itemId));
                const showJobLine =
                  selInv && isCustomColorInventoryItem(selInv);
                const isFocused = focusedLineIndex === index;
                const lineInvItem = (inventory || []).find(
                  (i) => String(i.id) === String(line.itemId),
                );
                const lineHalfOk = allowsHalfGallon(lineInvItem?.type);
                return (
                  <View
                    key={index}
                    style={[
                      styles.lineBlock,
                      isFocused && styles.lineBlockDropdownOpen,
                    ]}
                  >
                    <View
                      style={[
                        styles.lineRow,
                        isFocused && styles.lineRowDropdownOpen,
                      ]}
                    >
                      <View style={styles.lineItemIdWrap}>
                        <TextInput
                          label="Item"
                          value={line.searchQuery}
                          onChangeText={(v) =>
                            updateLine(index, "searchQuery", v)
                          }
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
                          <ScrollFrame
                            maxHeight={200}
                            style={[
                              styles.dropdown,
                              {
                                backgroundColor:
                                  theme.colors.surfaceContainerHighest,
                              },
                            ]}
                            nested={false}
                            fadeColor={theme.colors.surfaceContainerHighest}
                          >
                              {getFilteredInventory(line.searchQuery).length ===
                              0 ? (
                                <AppEmptyState
                                  title="No matches"
                                  style={styles.dropdownEmpty}
                                />
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
                                            ? theme.colors.surfaceContainerHighest
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
                                          {
                                            color:
                                              theme.colors.onSurfaceVariant,
                                          },
                                        ]}
                                      >
                                        {invItem.id}
                                      </Text>
                                    </Pressable>
                                  ),
                                )
                              )}
                          </ScrollFrame>
                        )}
                      </View>
                      <TextInput
                        label={lineHalfOk ? "Qty (0.5 ok)" : "Qty"}
                        value={line.quantity}
                        onChangeText={(v) =>
                          updateLine(
                            index,
                            "quantity",
                            sanitizeGallonInput(v, lineHalfOk),
                          )
                        }
                        mode="outlined"
                        keyboardType={lineHalfOk ? "decimal-pad" : "number-pad"}
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
                          onChangeText={(v) => updateLine(index, "jobName", v)}
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
              <AppButton
                mode="outlined"
                onPress={addLine}
                style={styles.addLineBtn}
              >
                Add Line
              </AppButton>
              <AppButton
                mode="contained"
                onPress={handleSaveOrder}
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
                icon="content-save"
              >
                {editingOrder ? "Update Order" : "Save Order"}
              </AppButton>
            </Card.Content>
          </Card>
        )}

        {showBlockingLoad ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            {ordersLoading && (
              <Text
                style={[
                  styles.loadingHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Loading purchase orders…
              </Text>
            )}
          </View>
        ) : !showForm ? (
          <>
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
                let emptyTitle = "No POs on order";
                if (hasSearchFilter) {
                  emptyTitle = "No POs match your search.";
                } else if (dateViewMode === null) {
                  if (orderFilter === "existing") emptyTitle = "No open POs";
                  else if (orderFilter === "back_orders")
                    emptyTitle = "No back orders (partial deliveries).";
                  else if (orderFilter === "late_orders")
                    emptyTitle = "No late orders";
                  else if (orderFilter === "completed")
                    emptyTitle = "No completed POs yet";
                }
                return (
                  <AppEmptyState
                    title={emptyTitle}
                    style={styles.emptyState}
                  />
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
                                theme.colors.surfaceContainerHigh,
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
                            {formatGroupSummary(group.orders, group.totalsByType)}
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
                                theme.colors.surfaceContainerHigh,
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
                            {formatGroupSummary(group.orders, group.totalsByType)}
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
            <ScrollFrame maxHeight={320}>
              {editingReceivedOrder &&
                (editingReceivedOrder.lines || []).map((line, idx) => {
                  const itemId = String(line.itemId);
                  const ordered = lineGallonQty(line, "ordered");
                  const invItem = (inventory || []).find(
                    (i) => String(i.id) === itemId,
                  );
                  const halfOk = allowsHalfGallon(invItem?.type);
                  const receivedVal =
                    receivedLineQtys[itemId] ??
                    String(lineGallonQty(line, "received"));
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
                        Ordered: {formatGallonQuantity(ordered)} gal
                      </Text>
                      <TextInput
                        label="Received (gal)"
                        value={receivedVal}
                        onChangeText={(v) =>
                          setReceivedQtyForLine(
                            line.itemId,
                            sanitizeGallonInput(v, halfOk),
                          )
                        }
                        mode="outlined"
                        keyboardType={halfOk ? "decimal-pad" : "number-pad"}
                        style={styles.receivedModalInput}
                      />
                    </View>
                  );
                })}
            </ScrollFrame>
            <View style={styles.receivedModalActions}>
              <AppButton
                mode="outlined"
                onPress={() => setEditingReceivedOrder(null)}
              >
                Cancel
              </AppButton>
              <AppButton
                mode="contained"
                onPress={handleSaveReceivedLines}
                loading={saving}
                disabled={saving}
              >
                Save
              </AppButton>
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
    borderBottomColor: "transparent",
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
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  card: {
    marginBottom: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: "transparent",
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
  lineBlockDropdownOpen: {
    position: "relative",
    zIndex: 10000,
    elevation: 10000,
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
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  orderActionBtn: {
    flex: 1,
    minWidth: 0,
    margin: 0,
  },
  orderActionBtnContent: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 6,
  },
  orderActionBtnLabel: {
    fontSize: 12,
    marginVertical: 0,
  },
  addOrderFullWidth: {
    marginTop: space[3],
    marginBottom: space[2],
    borderRadius: radius.md,
  },
  addOrderFullWidthContent: {
    height: 44,
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
    gap: 12,
  },
  loadingHint: {
    fontSize: 14,
    marginTop: 8,
  },
  emptyState: {
    flex: 0,
    paddingVertical: space[10],
  },
  dropdownEmpty: {
    flex: 0,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  dateViewLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  dateTabBar: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateTabCell: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  dateTabLabel: {
    fontSize: 14,
    letterSpacing: 0.2,
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
    paddingVertical: space[4],
    paddingHorizontal: space[6],
    marginBottom: space[4],
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.semantic.open,
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
  typeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  lineItemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lineTypeLabel: {
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 0,
  },
  poNumber: {
    fontSize: 17,
    fontWeight: "700",
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
  linesList: {
    marginBottom: 12,
    gap: 8,
  },
  lineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
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
  receivedModalOverlay: {
    flex: 1,
    backgroundColor: colors.semantic.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: space[9],
  },
  receivedModalBox: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.lg,
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
