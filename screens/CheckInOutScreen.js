import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  useWindowDimensions,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { Card, Text, Button, TextInput, useTheme } from "react-native-paper";
import OrderService from "../services/orderService";
import { getContrastingTextColors } from "../utils/colorUtils";

function getValidHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const s = hex.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s;
  if (/^[0-9A-Fa-f]{3}$/.test(s)) return "#" + s.split("").map((c) => c + c).join("");
  return null;
}

export default function CheckInOutScreen({
  item,
  onCheckIn,
  onCheckOut,
  onCancel,
  onOrderSummary = {},
  onReceiveDelivery,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const [quantity, setQuantity] = useState("");
  const [action, setAction] = useState(null); // 'in' | 'out'
  const [orders, setOrders] = useState([]);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  const hasUpcomingOrder = item && (onOrderSummary[item.id]?.quantity > 0);
  const openOrdersWithItem = (orders || []).filter(
    (o) => o.status === "open" && (o.lines || []).some((l) => String(l.itemId) === String(item?.id)),
  );

  useEffect(() => {
    if (!item || !hasUpcomingOrder) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await OrderService.getOrders(100);
        if (!cancelled) setOrders(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) console.error("CheckInOutScreen load orders:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [item?.id, hasUpcomingOrder]);

  const showAlert = (title, message) => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSubmit = () => {
    const qty = parseFloat(quantity);
    const currentQty = Number(item.quantity) || 0;

    if (isNaN(qty) || qty <= 0) {
      showAlert("Invalid Quantity", "Please enter a valid quantity greater than 0.");
      return;
    }

    if (action === "out") {
      if (currentQty <= 0) {
        showAlert("Cannot check out", "This item currently has 0 gallons available to check out.");
        return;
      }
      if (qty > currentQty) {
        showAlert(
          "Cannot check out",
          `Only ${currentQty} gallon${currentQty !== 1 ? "s" : ""} available. You cannot check out ${qty} gallons.`,
        );
        return;
      }
    }

    if (action === "in") {
      onCheckIn(qty);
    } else if (action === "out") {
      onCheckOut(qty);
    }
  };

  const openReceiveModal = () => {
    setSelectedOrder(null);
    setReceiveQty("");
    setShowReceiveModal(true);
  };

  const getLineForItem = (order) => (order.lines || []).find((l) => String(l.itemId) === String(item?.id));
  const remainingQty = selectedOrder ? (() => {
    const line = getLineForItem(selectedOrder);
    if (!line) return 0;
    const ordered = parseInt(line.quantity, 10) || 0;
    const received = parseInt(line.received_quantity, 10) || 0;
    return Math.max(0, ordered - received);
  })() : 0;

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    const line = getLineForItem(order);
    const ordered = parseInt(line?.quantity, 10) || 0;
    const received = parseInt(line?.received_quantity, 10) || 0;
    setReceiveQty(String(Math.max(0, ordered - received)));
  };

  const handleReceiveSubmit = async () => {
    const qty = parseInt(receiveQty, 10);
    if (!selectedOrder || isNaN(qty) || qty <= 0) {
      showAlert("Invalid", "Select a PO and enter a valid quantity.");
      return;
    }
    if (qty > remainingQty) {
      showAlert("Invalid", `Remaining to receive for this line is ${remainingQty} gal.`);
      return;
    }
    setReceiveSubmitting(true);
    try {
      await onReceiveDelivery(selectedOrder.id, qty);
      setShowReceiveModal(false);
      setSelectedOrder(null);
      setReceiveQty("");
    } catch (e) {
      showAlert("Error", e.message || "Failed to record delivery.");
    } finally {
      setReceiveSubmitting(false);
    }
  };

  if (!item) {
    return null;
  }

  const hexColor = getValidHex(item.hex_color);
  const sectionBg = hexColor || theme.colors.surfaceVariant;
  const textOnHex = hexColor ? getContrastingTextColors(hexColor) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.centeredBlock}>
        <View
          style={[
            styles.hexSection,
            isDesktop && styles.webWrapper,
            { backgroundColor: sectionBg },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: textOnHex ? textOnHex.primary : theme.colors.onSurface },
            ]}
          >
            {item.name || "Paint Item"}
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: textOnHex ? textOnHex.secondary : theme.colors.onSurfaceVariant },
            ]}
          >
            ID: {item.id}
          </Text>
          <Text
            style={[
              styles.currentQty,
              { color: textOnHex ? textOnHex.secondary : theme.colors.onSurfaceVariant },
            ]}
          >
            Current Quantity: {item.quantity || 0} gallons
          </Text>
        </View>

        <View style={isDesktop && styles.webWrapper}>
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }, isDesktop && styles.webCard]}>
          <Card.Content>
            <View style={styles.buttonRow}>
              <Button
                mode={action === "in" ? "contained" : "outlined"}
                onPress={() => setAction("in")}
                style={[styles.actionButton, action === "in" && styles.selectedButton]}
                icon="arrow-down"
              >
                Check In
              </Button>
              <Button
                mode={action === "out" ? "contained" : "outlined"}
                onPress={() => setAction("out")}
                style={[styles.actionButton, action === "out" && styles.selectedButton]}
                icon="arrow-up"
              >
                Check Out
              </Button>
              {openOrdersWithItem.length > 0 && onReceiveDelivery && (
                <Button
                  mode="contained"
                  onPress={openReceiveModal}
                  style={styles.actionButton}
                  icon="truck-delivery"
                  buttonColor="#1565c0"
                  textColor="#fff"
                >
                  Receiving Delivery
                </Button>
              )}
            </View>

            {action && (
              <>
                <TextInput
                  label={`Quantity to ${action === "in" ? "add" : "remove"} (gallons)`}
                  value={quantity}
                  onChangeText={setQuantity}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  style={styles.input}
                  right={<TextInput.Affix text="gal" />}
                  autoFocus
                />
                <View style={styles.submitRow}>
                  <Button mode="outlined" onPress={onCancel} style={styles.button}>
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    style={styles.button}
                    disabled={!quantity || parseFloat(quantity) <= 0}
                  >
                    Submit
                  </Button>
                </View>
              </>
            )}

            {!action && (
              <Button mode="outlined" onPress={onCancel} style={styles.cancelButton}>
                Cancel
              </Button>
            )}
            </Card.Content>
          </Card>
        </View>
      </View>

      <Modal visible={showReceiveModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowReceiveModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>Receiving Delivery</Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.onSurfaceVariant }]}>
              Select an upcoming PO that includes this item. Quantity will default to remaining; you can change it for partial shipments.
            </Text>
            <ScrollView style={styles.poList} keyboardShouldPersistTaps="handled">
              {openOrdersWithItem.map((order) => {
                const line = getLineForItem(order);
                const ordered = parseInt(line?.quantity, 10) || 0;
                const received = parseInt(line?.received_quantity, 10) || 0;
                const remaining = Math.max(0, ordered - received);
                const isSelected = selectedOrder?.id === order.id;
                return (
                  <Pressable
                    key={order.id}
                    onPress={() => handleSelectOrder(order)}
                    style={[
                      styles.poRow,
                      { borderColor: theme.colors.outline },
                      isSelected && { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <Text style={[styles.poNumber, { color: theme.colors.onSurface }]}>{order.po_number && String(order.po_number).trim() ? `PO #${order.po_number}` : "No PO"}</Text>
                    <Text style={[styles.poMeta, { color: theme.colors.onSurfaceVariant }]}>
                      {remaining} of {ordered} gal remaining
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selectedOrder && (
              <>
                <TextInput
                  label="Quantity to receive (gal)"
                  value={receiveQty}
                  onChangeText={setReceiveQty}
                  mode="outlined"
                  keyboardType="number-pad"
                  style={styles.input}
                />
                <View style={styles.modalActions}>
                  <Button mode="outlined" onPress={() => setShowReceiveModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleReceiveSubmit}
                    loading={receiveSubmitting}
                    disabled={receiveSubmitting || !receiveQty || parseInt(receiveQty, 10) <= 0}
                  >
                    Receive
                  </Button>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centeredBlock: {
    flex: 1,
    justifyContent: "center",
  },
  hexSection: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
    fontFamily: "monospace",
  },
  currentQty: {
    fontSize: 14,
    textAlign: "center",
  },
  card: {
    width: "100%",
    minWidth: 280,
    elevation: 4,
  },
  webCard: {
    width: "100%",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    minWidth: 120,
  },
  selectedButton: {},
  input: {
    marginBottom: 20,
  },
  submitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    flex: 1,
  },
  cancelButton: {
    marginTop: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  poList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  poRow: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  poNumber: {
    fontSize: 16,
    fontWeight: "600",
  },
  poMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
});
