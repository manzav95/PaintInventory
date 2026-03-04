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

function expectedDate(placedAt, leadTimeDays) {
  const d = new Date(placedAt);
  d.setDate(d.getDate() + (parseInt(leadTimeDays, 10) || 5));
  return d;
}

export default function UpcomingOrdersScreen({
  onBack,
  inventory = [],
  userName,
  onOrdersChanged,
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
  const [leadTimeDays, setLeadTimeDays] = useState("5");
  const [lines, setLines] = useState([{ itemId: "", quantity: "", searchQuery: "" }]);
  const [focusedLineIndex, setFocusedLineIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [markingId, setMarkingId] = useState(null);

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
        await OrderService.updateOrder(orderId, po, days, validLines);
      } else {
        const created = await OrderService.createOrder(po, days, validLines, userName);
        // Optimistically show the new order so it appears even if the next load fails
        if (created && (created.id != null || created.po_number != null)) {
          setOrders((prev) => [created, ...prev]);
        }
      }
      setPoNumber("");
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

  const getItemName = (itemId) => {
    const item = inventory.find((i) => String(i.id) === String(itemId));
    return item ? item.name || itemId : itemId;
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    setPoNumber("");
    setLeadTimeDays("5");
    setLines([{ itemId: "", quantity: "", searchQuery: "" }]);
    setFocusedLineIndex(null);
    setShowForm(true);
  };

  const openEditOrder = (order) => {
    setEditingOrder(order);
    setPoNumber(order.po_number || "");
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
        <Title style={styles.title}>Upcoming orders</Title>
        <View style={styles.headerRight}>
          {!showForm ? (
            <Button mode="contained" onPress={openNewOrder} icon="plus">
              Add order
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
                {editingOrder ? "Edit order" : "New order"}
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
                Add line
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveOrder}
                loading={saving}
                disabled={saving}
                style={styles.saveBtn}
                icon="content-save"
              >
                {editingOrder ? "Update order" : "Save order"}
              </Button>
            </Card.Content>
          </Card>
        )}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : orders.length === 0 && !showForm ? (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                No orders yet. Add an order to track upcoming inventory (PO # and items with qtys).
              </Text>
            </Card.Content>
          </Card>
        ) : (
          orders.map((order) => {
            const placed = order.placed_at ? new Date(order.placed_at) : null;
            const expected = placed
              ? expectedDate(order.placed_at, order.lead_time_days)
              : null;
            const isOpen = order.status === "open";
            return (
              <Card
                key={order.id}
                style={[styles.card, styles.orderCard, { backgroundColor: theme.colors.surface }]}
              >
                <Card.Content>
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
                      {order.lines.map((line, idx) => (
                        <View key={idx} style={styles.lineItem}>
                          <Text
                            style={[styles.lineItemName, { color: theme.colors.onSurface }]}
                            numberOfLines={1}
                          >
                            {getItemName(line.itemId)}
                          </Text>
                          <Text style={[styles.lineItemQty, { color: theme.colors.onSurfaceVariant }]}>
                            {line.quantity} gal
                          </Text>
                        </View>
                      ))}
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
                        Mark received
                      </Button>
                    </View>
                  )}
                </Card.Content>
              </Card>
            );
          })
        )}
      </ScrollView>
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
  orderCard: {
    marginBottom: 12,
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
    paddingVertical: 4,
  },
  lineItemName: {
    fontSize: 14,
    flex: 1,
  },
  lineItemQty: {
    fontSize: 14,
  },
  markReceivedBtn: {
    alignSelf: "flex-start",
  },
});
