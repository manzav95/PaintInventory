import React, { useState, useEffect, useMemo } from "react";
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
import PageHeader from "../components/PageHeader";
import { getContrastingTextColors } from "../utils/colorUtils";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function lineItemId(line) {
  return line?.itemId ?? line?.item_id;
}

function lineOrderedQty(line) {
  const q = line?.quantity ?? line?.qty;
  const n = Number(q);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function lineReceivedQty(line) {
  const q = line?.received_quantity ?? line?.receivedQuantity;
  if (q === undefined || q === null || q === "") return 0;
  const n = Number(q);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function lineRemainingQty(line) {
  return Math.max(0, lineOrderedQty(line) - lineReceivedQty(line));
}

function getLineForItemId(order, itemIdStr) {
  return (order?.lines || []).find((l) => String(lineItemId(l)) === itemIdStr);
}

function orderHasReceivableLineForItem(order, itemIdStr) {
  if (order?.status !== "open" || !itemIdStr) return false;
  const line = getLineForItemId(order, itemIdStr);
  return line != null && lineRemainingQty(line) > 0;
}

function getValidHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const s = hex.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s;
  if (/^[0-9A-Fa-f]{3}$/.test(s))
    return (
      "#" +
      s
        .split("")
        .map((c) => c + c)
        .join("")
    );
  return null;
}

export default function CheckInOutScreen({
  item,
  onCheckIn,
  onCheckOut,
  onCancel,
  onOrderSummary = {},
  onReceiveDelivery,
  receiveOrdersList = [],
  receiveOrdersLoaded = false,
  receiveOrdersLoading = false,
  onRefreshReceiveOrders,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const [quantity, setQuantity] = useState("");
  const [action, setAction] = useState(null); // 'in' | 'out'
  const [showDeliveryPrompt, setShowDeliveryPrompt] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  const quickQtyEnabledTypes = new Set([
    "paint",
    "stain",
    "dye",
    "clear",
    "primer",
    "catalyst",
  ]);
  const itemType = String(item?.type || "")
    .toLowerCase()
    .trim();
  const showQuickQty = action && quickQtyEnabledTypes.has(itemType);
  const quickQtyOptions = [5, 10, 15, 20];

  const itemIdStr = item?.id != null ? String(item.id) : "";
  const hasUpcomingOrder =
    !!itemIdStr &&
    (onOrderSummary[item.id]?.quantity > 0 ||
      onOrderSummary[itemIdStr]?.quantity > 0);

  const openOrdersWithItem = useMemo(() => {
    if (!itemIdStr) return [];
    return (receiveOrdersList || []).filter((o) =>
      orderHasReceivableLineForItem(o, itemIdStr),
    );
  }, [receiveOrdersList, itemIdStr]);

  const showReceivingButton =
    !!onReceiveDelivery &&
    (openOrdersWithItem.length > 0 ||
      (hasUpcomingOrder && !receiveOrdersLoaded));

  useEffect(() => {
    if (!itemIdStr || !hasUpcomingOrder || receiveOrdersLoaded) return;
    onRefreshReceiveOrders?.(false);
  }, [
    itemIdStr,
    hasUpcomingOrder,
    receiveOrdersLoaded,
    onRefreshReceiveOrders,
  ]);

  const showAlert = (title, message) => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.alert
    ) {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSubmit = () => {
    const qty = parseFloat(quantity);
    const currentQty = Number(item.quantity) || 0;

    if (isNaN(qty) || qty <= 0) {
      showAlert(
        "Invalid Quantity",
        "Please enter a valid quantity greater than 0.",
      );
      return;
    }

    if (action === "out") {
      if (currentQty <= 0) {
        showAlert(
          "Cannot check out",
          "This item currently has 0 gallons available to check out.",
        );
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
    if (openOrdersWithItem.length === 0 && hasUpcomingOrder) {
      onRefreshReceiveOrders?.(true);
    }
  };

  const handleCheckInPress = () => {
    const hasReceivablePOs = openOrdersWithItem.length > 0;
    const mayHavePOs =
      hasUpcomingOrder && (!receiveOrdersLoaded || receiveOrdersLoading);

    if (onReceiveDelivery && (hasReceivablePOs || mayHavePOs)) {
      if (mayHavePOs && !hasReceivablePOs) {
        onRefreshReceiveOrders?.(true);
      }
      setShowDeliveryPrompt(true);
      return;
    }
    setAction("in");
  };

  const handleDeliveryPromptYes = () => {
    setShowDeliveryPrompt(false);
    openReceiveModal();
  };

  const handleDeliveryPromptNo = () => {
    setShowDeliveryPrompt(false);
    setAction("in");
  };

  const getLineForItem = (order) => getLineForItemId(order, itemIdStr);
  const remainingQty = selectedOrder
    ? lineRemainingQty(getLineForItem(selectedOrder) || {})
    : 0;

  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    const line = getLineForItem(order);
    setReceiveQty(String(line ? lineRemainingQty(line) : 0));
  };

  const handleReceiveSubmit = async () => {
    const qty = parseInt(receiveQty, 10);
    if (!selectedOrder || isNaN(qty) || qty <= 0) {
      showAlert("Invalid", "Select a PO and enter a valid quantity.");
      return;
    }
    if (qty > remainingQty) {
      showAlert(
        "Invalid",
        `Remaining to receive for this line is ${remainingQty} gal.`,
      );
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

  const cardBg = theme.colors.surfaceContainerHighest;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {embeddedInShell && (
        <PageHeader
          title="Check In / Check Out"
          onBack={onCancel}
          embeddedInShell={embeddedInShell}
        />
      )}
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
              {
                color: textOnHex
                  ? textOnHex.secondary
                  : theme.colors.onSurfaceVariant,
              },
            ]}
          >
            ID: {item.id}
          </Text>
          <Text
            style={[
              styles.currentQty,
              {
                color: textOnHex
                  ? textOnHex.secondary
                  : theme.colors.onSurfaceVariant,
              },
            ]}
          >
            Current Quantity: {item.quantity || 0} gallons
          </Text>
        </View>

        <View style={isDesktop && styles.webWrapper}>
          <Card
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                borderColor: theme.colors.outlineVariant,
                borderWidth: 1,
              },
              isDesktop && styles.webCard,
            ]}
          >
            <Card.Content>
              <View style={styles.buttonRow}>
                <Button
                  mode={action === "in" ? "contained" : "outlined"}
                  onPress={handleCheckInPress}
                  style={[
                    styles.actionButton,
                    action === "in" && styles.selectedButton,
                  ]}
                  icon="arrow-down"
                >
                  Check In
                </Button>
                <Button
                  mode={action === "out" ? "contained" : "outlined"}
                  onPress={() => setAction("out")}
                  style={[
                    styles.actionButton,
                    action === "out" && styles.selectedButton,
                  ]}
                  icon="arrow-up"
                >
                  Check Out
                </Button>
                {showReceivingButton && (
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
                  {showQuickQty && (
                    <View style={styles.quickQtyWrap}>
                      <Text
                        style={[
                          styles.quickQtyLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Quick quantity (gal)
                      </Text>
                      <View style={styles.quickQtyRow}>
                        {quickQtyOptions.map((v) => (
                          <Button
                            key={String(v)}
                            mode="outlined"
                            compact
                            onPress={() => setQuantity(String(v))}
                            style={styles.quickQtyButton}
                          >
                            {v}
                          </Button>
                        ))}
                      </View>
                    </View>
                  )}
                  <TextInput
                    label={`Quantity to ${action === "in" ? "add" : "remove"} (gallons)`}
                    value={quantity}
                    onChangeText={setQuantity}
                    mode="outlined"
                    keyboardType="decimal-pad"
                    style={styles.input}
                    right={<TextInput.Affix text="gal" />}
                  />
                  <View style={styles.submitRow}>
                    <Button
                      mode="outlined"
                      onPress={onCancel}
                      style={styles.button}
                    >
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
                <Button
                  mode="outlined"
                  onPress={onCancel}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
              )}
            </Card.Content>
          </Card>
        </View>
      </View>

      <Modal visible={showDeliveryPrompt} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDeliveryPrompt(false)}
        >
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={[styles.modalTitle, { color: theme.colors.onSurface }]}
            >
              Receiving a delivery?
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {item.name || "This item"} has an open purchase order
              {openOrdersWithItem.length === 1 ? "" : "s"} waiting to receive.
              <br />
              Are you receiving a delivery?
            </Text>
            {receiveOrdersLoading && openOrdersWithItem.length === 0 ? (
              <Text
                style={[
                  styles.poMeta,
                  {
                    color: theme.colors.onSurfaceVariant,
                    textAlign: "center",
                    marginBottom: 12,
                  },
                ]}
              >
                Loading purchase orders…
              </Text>
            ) : openOrdersWithItem.length > 0 ? (
              <Text
                style={[
                  styles.poMeta,
                  { color: theme.colors.onSurfaceVariant, marginBottom: 12 },
                ]}
              >
                {openOrdersWithItem.length} PO
                {openOrdersWithItem.length === 1 ? "" : "s"} include this item.
              </Text>
            ) : null}
            <View style={styles.promptActions}>
              <Button
                mode="contained"
                onPress={handleDeliveryPromptYes}
                icon="truck-delivery"
                style={styles.promptPrimaryBtn}
              >
                Yes — select PO
              </Button>
              <Button mode="outlined" onPress={handleDeliveryPromptNo}>
                No — regular check-in
              </Button>
              <Button mode="text" onPress={() => setShowDeliveryPrompt(false)}>
                Cancel
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showReceiveModal} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowReceiveModal(false)}
        >
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={[styles.modalTitle, { color: theme.colors.onSurface }]}
            >
              Receiving Delivery
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Select the PO # for {item.name || "this item"} (ID: {itemIdStr}).
              Quantity defaults to remaining; change it for partial shipments.
            </Text>
            <ScrollView
              style={styles.poList}
              keyboardShouldPersistTaps="handled"
            >
              {receiveOrdersLoading && openOrdersWithItem.length === 0 ? (
                <Text
                  style={[
                    styles.poMeta,
                    {
                      color: theme.colors.onSurfaceVariant,
                      textAlign: "center",
                      paddingVertical: 16,
                    },
                  ]}
                >
                  Loading purchase orders…
                </Text>
              ) : null}
              {openOrdersWithItem.map((order) => {
                const line = getLineForItem(order);
                const ordered = lineOrderedQty(line);
                const remaining = lineRemainingQty(line);
                const isSelected = selectedOrder?.id === order.id;
                return (
                  <Pressable
                    key={order.id}
                    onPress={() => handleSelectOrder(order)}
                    style={[
                      styles.poRow,
                      { borderColor: theme.colors.outline },
                      isSelected && {
                        backgroundColor: theme.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.poNumber,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {order.po_number && String(order.po_number).trim()
                        ? `PO #${order.po_number}`
                        : "No PO"}
                    </Text>
                    <Text
                      style={[
                        styles.poMeta,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
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
                  <Button
                    mode="outlined"
                    onPress={() => setShowReceiveModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleReceiveSubmit}
                    loading={receiveSubmitting}
                    disabled={
                      receiveSubmitting ||
                      !receiveQty ||
                      parseInt(receiveQty, 10) <= 0
                    }
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
  quickQtyWrap: {
    marginBottom: 12,
  },
  quickQtyLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  quickQtyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  quickQtyButton: {
    flexGrow: 1,
    flexBasis: "24%",
    minWidth: 92,
    marginBottom: 10,
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
  promptActions: {
    gap: 10,
    marginTop: 4,
  },
  promptPrimaryBtn: {
    marginBottom: 4,
  },
});
