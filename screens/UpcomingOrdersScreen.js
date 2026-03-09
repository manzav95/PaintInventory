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

const MAX_AUTOCOMPLETE = 20;

// Lead time defaults by item type: clear, primer, catalyst, wiping stain base = 3 days; paint, spray dye base (and custom) = 7 days
const LEAD_TIME_3_DAY_TYPES = ["clear", "primer", "catalyst", "stain"];
const LEAD_TIME_7_DAY_TYPES = ["paint", "dye", "custom_paint", "custom_stain"];

function getDefaultLeadTimeDays(lines, inventory) {
  const itemIds = (lines || [])
    .map((l) => (l.itemId || "").trim())
    .filter(Boolean);
  if (itemIds.length === 0) return 5;
  let has7Day = false;
  let all3Day = true;
  for (const id of itemIds) {
    const item = inventory.find((i) => String(i.id) === String(id));
    const t = item?.type ? String(item.type).toLowerCase() : "";
    if (LEAD_TIME_7_DAY_TYPES.includes(t)) has7Day = true;
    if (t && !LEAD_TIME_3_DAY_TYPES.includes(t)) all3Day = false;
  }
  if (has7Day) return 7;
  if (all3Day && itemIds.length > 0) return 3;
  return 7;
}

function expectedDate(placedAt, leadTimeDays) {
  const d = new Date(placedAt);
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

function isLateOrder(order) {
  if (order.status !== "open") return false;
  const placed = order.placed_at ? new Date(order.placed_at) : null;
  if (!placed || Number.isNaN(placed.getTime())) return false;
  const days = parseInt(order.lead_time_days, 10) || 7;
  const expected = new Date(placed);
  expected.setDate(expected.getDate() + days);
  const dayAfterExpected = new Date(expected);
  dayAfterExpected.setDate(dayAfterExpected.getDate() + 1);
  dayAfterExpected.setHours(23, 59, 59, 999);
  return Date.now() > dayAfterExpected.getTime();
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
    { itemId: "", quantity: "", searchQuery: "" },
  ]);
  const [focusedLineIndex, setFocusedLineIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [orderFilter, setOrderFilter] = useState(initialFilter || "existing");
  const [dateViewMode, setDateViewMode] = useState(null); // null | "week" | "month"
  const [editingReceivedOrder, setEditingReceivedOrder] = useState(null);
  const [receivedLineQtys, setReceivedLineQtys] = useState({});

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
      { itemId: "", quantity: "", searchQuery: "" },
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
      if (field === "searchQuery") next[index].itemId = "";
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
    if (placedDate.trim()) {
      const d = new Date(placedDate.trim());
      if (Number.isNaN(d.getTime())) {
        Alert.alert(
          "Invalid",
          "Placed date must be a valid date (e.g. YYYY-MM-DD).",
        );
        return;
      }
      placedAt = d.toISOString();
    }
    const validLines = lines
      .map((l) => ({
        itemId: (l.itemId || "").trim(),
        quantity: parseInt(String(l.quantity).trim(), 10),
      }))
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
      setLines([{ itemId: "", quantity: "", searchQuery: "" }]);
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

  const ordersSortedByPlaced = useMemo(() => {
    const list = dateViewMode != null ? orders || [] : filteredOrders;
    return [...list].sort((a, b) => {
      const pa = a.placed_at ? new Date(a.placed_at).getTime() : 0;
      const pb = b.placed_at ? new Date(b.placed_at).getTime() : 0;
      return pb - pa;
    });
  }, [dateViewMode, orders, filteredOrders]);

  const groupedByWeek = useMemo(() => {
    if (dateViewMode !== "week") return [];
    const groups = new Map();
    for (const order of ordersSortedByPlaced) {
      const placed = order.placed_at ? new Date(order.placed_at) : null;
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
      g.totalsByType = getTotalsByType(g.orders);
    });
    return arr;
  }, [dateViewMode, ordersSortedByPlaced, inventory]);

  const groupedByMonth = useMemo(() => {
    if (dateViewMode !== "month") return [];
    const groups = new Map();
    for (const order of ordersSortedByPlaced) {
      const placed = order.placed_at ? new Date(order.placed_at) : null;
      if (!placed || Number.isNaN(placed.getTime())) continue;
      const monthStart = getMonthStart(placed);
      const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) {
        groups.set(key, { monthStart, orders: [] });
      }
      groups.get(key).orders.push(order);
    }
    const arr = Array.from(groups.entries())
      .map(([_, v]) => v)
      .sort((a, b) => b.monthStart.getTime() - a.monthStart.getTime());
    arr.forEach((g) => {
      g.totalsByType = getTotalsByType(g.orders);
    });
    return arr;
  }, [dateViewMode, ordersSortedByPlaced, inventory]);

  const renderOrderCard = (order) => {
    const placed = order.placed_at ? new Date(order.placed_at) : null;
    const expected = placed
      ? expectedDate(order.placed_at, order.lead_time_days)
      : null;
    const isOpen = order.status === "open";
    const orderIsLate = isLateOrder(order);
    const orderIsBackOrder = isBackOrder(order);
    const singleReceivedDate = getSingleReceivedDate(order);
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
              <Text
                style={[styles.poNumber, { color: theme.colors.onSurface }]}
              >
                {order.po_number && String(order.po_number).trim()
                  ? `PO #${order.po_number}`
                  : "No PO (add in edit)"}
              </Text>
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
              >
                Edit
              </Button>
              <Button
                mode="outlined"
                onPress={() => handleMarkReceived(order.id)}
                disabled={markingId === order.id}
                loading={markingId === order.id}
                style={styles.markReceivedBtn}
              >
                Mark Received
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
    setPlacedDate(formatPlacedForInput(new Date().toISOString()));
    setLeadTimeDays("7");
    setLines([{ itemId: "", quantity: "", searchQuery: "" }]);
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
        <Title style={styles.title}>Upcoming Deliveries</Title>
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
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentWeb,
        ]}
      >
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
              {lines.map((line, index) => (
                <View
                  key={index}
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
              ))}
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
                }}
                style={styles.filterBtn}
              >
                Month
              </Button>
            </View>
            <View style={styles.filterRow}>
              <Button
                mode={orderFilter === "all" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("all")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
              >
                All
              </Button>
              <Button
                mode={orderFilter === "existing" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("existing")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
              >
                Open POs
              </Button>
              <Button
                mode={orderFilter === "back_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("back_orders")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
              >
                Back Orders
              </Button>
              <Button
                mode={orderFilter === "late_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("late_orders")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
              >
                Late Orders
              </Button>
              <Button
                mode={orderFilter === "completed" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("completed")}
                style={styles.filterBtn}
                disabled={dateViewMode === "week" || dateViewMode === "month"}
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
                    : ordersSortedByPlaced.length;
              const isEmpty = emptyCount === 0;
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
                        {dateViewMode != null && "No POs yet."}
                        {dateViewMode === null &&
                          orderFilter === "all" &&
                          "No POs yet."}
                        {dateViewMode === null &&
                          orderFilter === "existing" &&
                          "No open POs yet."}
                        {dateViewMode === null &&
                          orderFilter === "back_orders" &&
                          "No back orders (partial deliveries)."}
                        {dateViewMode === null &&
                          orderFilter === "late_orders" &&
                          "No late orders."}
                        {dateViewMode === null &&
                          orderFilter === "completed" &&
                          "No completed POs yet."}
                      </Text>
                    </Card.Content>
                  </Card>
                );
              }
              if (dateViewMode === "week") {
                return groupedByWeek.map((group) => (
                  <View
                    key={group.weekStart.getTime()}
                    style={styles.dateGroupBlock}
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
                    </View>
                    {group.orders.map((order) => renderOrderCard(order))}
                  </View>
                ));
              }
              if (dateViewMode === "month") {
                return groupedByMonth.map((group) => (
                  <View
                    key={group.monthStart.getTime()}
                    style={styles.dateGroupBlock}
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
                    </View>
                    {group.orders.map((order) => renderOrderCard(order))}
                  </View>
                ));
              }
              return ordersSortedByPlaced.map((order) =>
                renderOrderCard(order),
              );
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
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    flex: 1,
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
    maxWidth: 640,
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
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 8,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
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
    marginBottom: 4,
  },
  dateGroupTotals: {
    fontSize: 13,
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
  poNumber: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
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
