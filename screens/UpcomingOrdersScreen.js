import React, { useState, useEffect } from "react";
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
  const itemIds = (lines || []).map((l) => (l.itemId || "").trim()).filter(Boolean);
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
  d.setDate(d.getDate() + (parseInt(leadTimeDays, 10) || 5));
  return d;
}

function isBackOrder(order) {
  if (order.status !== "open") return false;
  const lines = order.lines || [];
  const someReceived = lines.some((l) => (parseInt(l.received_quantity, 10) || 0) > 0);
  const someRemaining = lines.some((l) => (parseInt(l.received_quantity, 10) || 0) < (parseInt(l.quantity, 10) || 0));
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
  const days = parseInt(order.lead_time_days, 10) || 5;
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
  const [leadTimeDays, setLeadTimeDays] = useState("5");
  const [lines, setLines] = useState([{ itemId: "", quantity: "", searchQuery: "" }]);
  const [focusedLineIndex, setFocusedLineIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [orderFilter, setOrderFilter] = useState(initialFilter || "existing");
  const [editingReceivedOrder, setEditingReceivedOrder] = useState(null);
  const [receivedLineQtys, setReceivedLineQtys] = useState({});

  useEffect(() => {
    if (initialFilter) setOrderFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    if (editingOrder) return;
    const defaultDays = getDefaultLeadTimeDays(lines, inventory);
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
    setLines((prev) => [...prev, { itemId: "", quantity: "", searchQuery: "" }]);
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    if (focusedLineIndex === index) setFocusedLineIndex(null);
    else if (focusedLineIndex != null && focusedLineIndex > index) setFocusedLineIndex(focusedLineIndex - 1);
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
      next[index] = { ...next[index], itemId: item.id, searchQuery: item.name || item.id };
      return next;
    });
  };

  const handleSaveOrder = async () => {
    const po = (poNumber || "").trim();
    if (!po) {
      Alert.alert("Invalid", "PO number is required.");
      return;
    }
    const days = parseInt(leadTimeDays, 10);
    if (isNaN(days) || days < 0) {
      Alert.alert("Invalid", "Lead time days must be 0 or greater.");
      return;
    }
    let placedAt = null;
    if (placedDate.trim()) {
      const d = new Date(placedDate.trim());
      if (Number.isNaN(d.getTime())) {
        Alert.alert("Invalid", "Placed date must be a valid date (e.g. YYYY-MM-DD).");
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
        const created = await OrderService.createOrder(po, days, validLines, userName, placedAt);
        // Optimistically show the new order so it appears even if the next load fails
        if (created && (created.id != null || created.po_number != null)) {
          setOrders((prev) => [created, ...prev]);
        }
      }
      setPoNumber("");
      setPlacedDate("");
      setLeadTimeDays("5");
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
      const received = Math.max(0, Math.min(ordered, parseInt(receivedLineQtys[itemId], 10) || 0));
      return { itemId: l.itemId, received_quantity: received };
    });
    setSaving(true);
    try {
      await OrderService.updateOrderReceivedLines(editingReceivedOrder.id, lines);
      setEditingReceivedOrder(null);
      setReceivedLineQtys({});
      await loadOrders();
      onOrdersChanged?.();
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update received quantities.");
    } finally {
      setSaving(false);
    }
  };

  const getItemName = (itemId) => {
    const item = inventory.find((i) => String(i.id) === String(itemId));
    return item ? item.name || itemId : itemId;
  };

  const filteredOrders = orders.filter((order) => {
    if (orderFilter === "existing") return isExistingOrder(order);
    if (orderFilter === "back_orders") return isBackOrder(order);
    if (orderFilter === "late_orders") return isLateOrder(order);
    if (orderFilter === "completed") return order.status === "received";
    return true;
  });

  const formatReceivedDate = (line) => {
    const at = line.received_at;
    if (!at) return null;
    try {
      return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return at;
    }
  };

  const getSingleReceivedDate = (order) => {
    const lines = order.lines || [];
    const dates = [...new Set(lines.map((l) => l.received_at).filter(Boolean))];
    if (dates.length !== 1) return null;
    try {
      return new Date(dates[0]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return dates[0];
    }
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
    setLeadTimeDays("5");
    setLines([{ itemId: "", quantity: "", searchQuery: "" }]);
    setFocusedLineIndex(null);
    setShowForm(true);
  };

  const openEditOrder = (order) => {
    setEditingOrder(order);
    setPoNumber(order.po_number || "");
    setPlacedDate(formatPlacedForInput(order.placed_at));
    setLeadTimeDays(String(order.lead_time_days ?? 5));
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
          String(i.id || "").toLowerCase().includes(q),
      )
      .slice(0, MAX_AUTOCOMPLETE);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={onBack}
          iconColor={theme.colors.primary}
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
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentWeb]}
      >
        {showForm && (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Title style={styles.cardTitle}>
                {editingOrder ? "Edit Order" : "New Order"}
              </Title>
              <TextInput
                label="PO number"
                value={poNumber}
                onChangeText={setPoNumber}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. PO-2024-001"
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
                placeholder="5 (default)"
              />
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>
                Line items
              </Text>
              {lines.map((line, index) => (
                <View key={index} style={styles.lineRow}>
                  <View
                    style={[
                      styles.lineItemIdWrap,
                      focusedLineIndex === index && styles.lineItemIdWrapFocused,
                    ]}
                  >
                    <TextInput
                      label="Item (type to search by name)"
                      value={line.searchQuery}
                      onChangeText={(v) => updateLine(index, "searchQuery", v)}
                      onFocus={() => setFocusedLineIndex(index)}
                      onBlur={() => setTimeout(() => setFocusedLineIndex(null), 200)}
                      mode="outlined"
                      style={[styles.input, styles.lineItemId]}
                      placeholder="e.g. Red Paint or H66AAA00001"
                    />
                    {focusedLineIndex === index && (
                      <View
                        style={[
                          styles.dropdown,
                          {
                            backgroundColor:
                              theme.colors.surface ||
                              (theme.dark ? "#1e1e1e" : "#ffffff"),
                            borderColor: theme.colors.outline,
                          },
                        ]}
                        collapsable={false}
                      >
                        <ScrollView
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled
                          style={styles.dropdownScroll}
                        >
                          {getFilteredInventory(line.searchQuery).length === 0 ? (
                            <Text
                              style={[
                                styles.dropdownItem,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              No matches
                            </Text>
                          ) : (
                            getFilteredInventory(line.searchQuery).map((invItem) => (
                              <Pressable
                                key={invItem.id}
                                onPress={() => {
                                  setLineItemSelection(index, invItem);
                                  setFocusedLineIndex(null);
                                  Keyboard.dismiss();
                                }}
                                style={({ pressed }) => [
                                  styles.dropdownItemWrap,
                                  pressed && { backgroundColor: theme.colors.surfaceVariant },
                                ]}
                              >
                                <Text
                                  style={[styles.dropdownItem, { color: theme.colors.onSurface }]}
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
                            ))
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
              <Button mode="outlined" onPress={addLine} style={styles.addLineBtn}>
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
                mode={orderFilter === "existing" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("existing")}
                style={styles.filterBtn}
              >
                Existing POs
              </Button>
              <Button
                mode={orderFilter === "back_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("back_orders")}
                style={styles.filterBtn}
              >
                Back Orders
              </Button>
              <Button
                mode={orderFilter === "late_orders" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("late_orders")}
                style={styles.filterBtn}
              >
                Late Orders
              </Button>
              <Button
                mode={orderFilter === "completed" ? "contained" : "outlined"}
                compact
                onPress={() => setOrderFilter("completed")}
                style={styles.filterBtn}
              >
                Completed POs
              </Button>
            </View>
            {filteredOrders.length === 0 ? (
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    {orderFilter === "existing" && "No open POs with no deliveries yet."}
                    {orderFilter === "back_orders" && "No back orders (partial deliveries)."}
                    {orderFilter === "completed" && "No completed POs yet."}
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              filteredOrders.map((order) => {
            const placed = order.placed_at ? new Date(order.placed_at) : null;
            const expected = placed
              ? expectedDate(order.placed_at, order.lead_time_days)
              : null;
            const isOpen = order.status === "open";
            const singleReceivedDate = getSingleReceivedDate(order);
            return (
              <Card
                key={order.id}
                style={[styles.card, styles.orderCard, { backgroundColor: theme.colors.surface }]}
              >
                <Card.Content>
                  {singleReceivedDate && !isOpen && (
                    <Text style={[styles.receivedDateBanner, { color: theme.colors.onSurfaceVariant }]}>
                      Received {singleReceivedDate}
                    </Text>
                  )}
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={[styles.poNumber, { color: theme.colors.onSurface }]}>
                        PO #{order.po_number}
                      </Text>
                      <Text style={[styles.orderMeta, { color: theme.colors.onSurfaceVariant }]}>
                        Placed {placed ? placed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} · Lead time {order.lead_time_days ?? 5} days
                        {expected && isOpen
                          ? ` · Expected ~${expected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.orderBadge}>
                      <Text
                        style={[
                          styles.badgeText,
                          { color: isOpen ? "#1976d2" : "#2e7d32" },
                        ]}
                      >
                        {isOpen ? "Open" : "Received"}
                      </Text>
                    </View>
                  </View>
                  {(order.lines || []).length > 0 && (
                    <View style={styles.linesList}>
                      {order.lines.map((line, idx) => {
                        const received = parseInt(line.received_quantity, 10) || 0;
                        const ordered = parseInt(line.quantity, 10) || 0;
                        const lineReceivedDate = formatReceivedDate(line);
                        const showLineDate = !singleReceivedDate && lineReceivedDate;
                        return (
                          <View key={idx} style={styles.lineItem}>
                            <View style={styles.lineItemLeft}>
                              <Text
                                style={[styles.lineItemName, { color: theme.colors.onSurface }]}
                                numberOfLines={1}
                              >
                                {getItemName(line.itemId)}
                              </Text>
                              {showLineDate && (
                                <Text style={[styles.lineItemReceived, { color: theme.colors.onSurfaceVariant }]}>
                                  Received {lineReceivedDate}
                                </Text>
                              )}
                            </View>
                            <Text style={[styles.lineItemQty, { color: theme.colors.onSurfaceVariant }]}>
                              {received > 0 ? `${received}/${ordered}` : ordered} gal
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {!singleReceivedDate && (order.lines || []).some((l) => formatReceivedDate(l)) && (
                    <Text style={[styles.receivedDateFooter, { color: theme.colors.onSurfaceVariant }]}>
                      Received: {(order.lines || []).map((l) => formatReceivedDate(l)).filter(Boolean).join(", ")}
                    </Text>
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
                        Edit / Bring items back to expecting
                      </Button>
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
              })
            )}
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
            style={[styles.receivedModalBox, { backgroundColor: theme.colors.surface }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <Title style={[styles.receivedModalTitle, { color: theme.colors.onSurface }]}>
              Adjust received quantities
            </Title>
            <Text style={[styles.receivedModalSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              Reduce received to bring items back to expecting. Save reopens the PO if any line has remaining.
            </Text>
            <ScrollView style={styles.receivedModalScroll} keyboardShouldPersistTaps="handled">
            {editingReceivedOrder && (editingReceivedOrder.lines || []).map((line, idx) => {
              const itemId = String(line.itemId);
              const ordered = parseInt(line.quantity, 10) || 0;
              const receivedVal = receivedLineQtys[itemId] ?? String(parseInt(line.received_quantity, 10) || 0);
              return (
                <View key={idx} style={styles.receivedModalRow}>
                  <Text style={[styles.receivedModalRowName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {getItemName(line.itemId)}
                  </Text>
                  <Text style={[styles.receivedModalRowOrdered, { color: theme.colors.onSurfaceVariant }]}>
                    Ordered: {ordered} gal
                  </Text>
                  <TextInput
                    label="Received (gal)"
                    value={receivedVal}
                    onChangeText={(v) => setReceivedQtyForLine(line.itemId, v)}
                    mode="outlined"
                    keyboardType="number-pad"
                    style={styles.receivedModalInput}
                  />
                </View>
              );
            })}
            </ScrollView>
            <View style={styles.receivedModalActions}>
              <Button mode="outlined" onPress={() => setEditingReceivedOrder(null)}>
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
  lineItemIdWrap: {
    flex: 1,
    position: "relative",
  },
  lineItemIdWrapFocused: {
    zIndex: 1000,
  },
  lineItemId: {
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
    marginTop: -8,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 220,
    zIndex: 1000,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 216,
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterBtn: {},
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
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  poNumber: {
    fontSize: 17,
    fontWeight: "700",
  },
  orderMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
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
