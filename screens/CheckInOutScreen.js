import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  useWindowDimensions,
  Modal,
  Pressable,
} from "react-native";
import { Card, Text, TextInput, useTheme, Menu } from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import { getContrastingTextColors } from "../utils/colorUtils";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { nestedSurfaceColor } from "../utils/themeColors";
import {
  allowsHalfGallon,
  parseGallonQuantity,
  formatGallonQuantity,
} from "../utils/gallonQuantity";
import ScrollFrame from "../components/ScrollFrame";
import { colors, fontFamily } from "../theme/tokens";
import showAlertUtil from "../utils/showAlert";
import showToast from "../utils/showToast";
import {
  CUSTOM_STACK_OPTIONS,
  resolveCustomStackLocation,
  stackLetterFromLocation,
  formatCustomStackDisplay,
} from "../utils/customStacks";

const CUSTOM_COLOR_TYPES = new Set(["custom_paint", "custom_stain"]);

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
  isAdmin = false,
  onCheckIn,
  onCheckOut,
  onRecyclePaint,
  onChangeLocation,
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
  const [action, setAction] = useState(null); // 'in' | 'out' | 'recycle' | 'location'
  const [showDeliveryPrompt, setShowDeliveryPrompt] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [stackLocation, setStackLocation] = useState(() => {
    const loc = String(item?.location || "").trim();
    return loc ? resolveCustomStackLocation(loc) : "";
  });
  const [stackMenuOpen, setStackMenuOpen] = useState(false);
  const [receiveStackMenuOpen, setReceiveStackMenuOpen] = useState(false);

  useEffect(() => {
    const loc = String(item?.location || "").trim();
    setStackLocation(loc ? resolveCustomStackLocation(loc) : "");
  }, [item?.id, item?.location]);

  const quickQtyEnabledTypes = new Set([
    "paint",
    "precat",
    "stain",
    "dye",
    "clear",
    "primer",
    "catalyst",
    "custom_paint",
    "custom_stain",
  ]);
  const itemType = String(item?.type || "")
    .toLowerCase()
    .trim();
  const unitWord =
    (item?.unit_label && String(item.unit_label).trim()) || "gallons";
  const unitAffix =
    (item?.unit_label && String(item.unit_label).trim()) || "gal";
  const currentStock = Number(item?.quantity) || 0;
  const isCustomColor = CUSTOM_COLOR_TYPES.has(itemType);
  const colorLabel = String(item?.color_label || "").trim();
  const itemName = String(item?.name || "").trim();
  const itemIdStr = item?.id != null ? String(item.id).trim() : "";
  const externalCodeStr = String(item?.external_code || "").trim();
  /** Custom: #1234 on top. Standard: color name (e.g. Acier) on top. */
  const heroTitle = isCustomColor
    ? (() => {
        if (/^\d{1,5}$/.test(itemIdStr)) {
          return `#${itemIdStr.padStart(4, "0")}`;
        }
        const fromName = itemName.match(/^#?(\d{1,5})\b/);
        if (fromName) return `#${fromName[1].padStart(4, "0")}`;
        if (/^\d{1,5}$/.test(externalCodeStr)) {
          return `#${externalCodeStr.padStart(4, "0")}`;
        }
        if (itemIdStr)
          return itemIdStr.startsWith("#") ? itemIdStr : `#${itemIdStr}`;
        return "—";
      })()
    : itemName || colorLabel || "—";
  /** Custom: barcode/id under qty. Standard: H66 (or full item id) under qty. */
  const footerId = isCustomColor
    ? (() => {
        const codeDigits = String(heroTitle).replace(/^#/, "");
        if (
          /^\d{1,5}$/.test(itemIdStr) &&
          itemIdStr.padStart(4, "0") === codeDigits.padStart(4, "0")
        ) {
          return externalCodeStr || itemIdStr;
        }
        return itemIdStr || externalCodeStr;
      })()
    : itemIdStr || externalCodeStr;
  /** Small confirm line: custom color_label; standard only if label differs from hero name. */
  const confirmName = isCustomColor
    ? colorLabel || (itemName && itemName !== heroTitle ? itemName : "")
    : colorLabel && colorLabel !== heroTitle
      ? colorLabel
      : "";
  const hasLocation =
    item?.location != null && String(item.location).trim() !== "";
  const showStoredLocation = isCustomColor && currentStock > 0 && hasLocation;
  const showRecycleButton = isAdmin && onRecyclePaint && isCustomColor;
  const showLocationOnlyButton = isCustomColor && !!onChangeLocation;
  const showQuickQty =
    action && action !== "location" && quickQtyEnabledTypes.has(itemType);
  const halfGallonItem = allowsHalfGallon(itemType);
  const quickQtyOptions = isCustomColor
    ? [0.5, 1, 2, 3, 4, 5]
    : halfGallonItem
      ? [0.5, 1, 5, 10]
      : [5, 10, 15, 20];

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

  useEffect(() => {
    if (action === "recycle" && !showRecycleButton) {
      setAction(null);
      setQuantity("");
    }
  }, [action, showRecycleButton]);

  const showAlert = (title, message) => {
    showAlertUtil(title, message);
    showToast({
      type: "error",
      title: String(title || "Error"),
      message: String(message || ""),
      duration: 4500,
    });
  };

  const handleSubmit = () => {
    if (action === "location") {
      if (!onChangeLocation) {
        showAlert("Unavailable", "Location change is not available.");
        return;
      }
      if (!String(stackLocation || "").trim()) {
        showAlert("Missing location", "Choose a stack location (A–Z).");
        return;
      }
      onChangeLocation(resolveCustomStackLocation(stackLocation));
      return;
    }

    const parsed = parseGallonQuantity(quantity, itemType);
    if (!parsed.ok) {
      showAlert("Invalid Quantity", parsed.error);
      return;
    }
    const qty = parsed.value;
    const currentQty = Number(item.quantity) || 0;

    if (action === "out" || action === "recycle") {
      const label = action === "recycle" ? "recycle" : "check out";
      if (currentQty <= 0) {
        showAlert(
          `Cannot ${label}`,
          `This item currently has 0 gallons available to ${label}.`,
        );
        return;
      }
      if (qty > currentQty) {
        showAlert(
          `Cannot ${label}`,
          `Only ${formatGallonQuantity(currentQty)} gallon${currentQty !== 1 ? "s" : ""} available. You cannot ${label} ${formatGallonQuantity(qty)} gallons.`,
        );
        return;
      }
    }

    if (action === "in") {
      if (isCustomColor && !String(stackLocation || "").trim()) {
        showAlert("Missing location", "Choose a stack location (A–Z).");
        return;
      }
      onCheckIn(
        qty,
        isCustomColor
          ? { location: resolveCustomStackLocation(stackLocation) }
          : undefined,
      );
    } else if (action === "out") {
      onCheckOut(qty);
    } else if (action === "recycle") {
      onRecyclePaint?.(qty);
    } else {
      showAlert(
        "Choose an action",
        "Select Check In or Check Out before submitting.",
      );
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
    const parsed = parseGallonQuantity(receiveQty, itemType);
    if (!selectedOrder || !parsed.ok) {
      showAlert(
        "Invalid",
        parsed.error || "Select a PO and enter a valid quantity.",
      );
      return;
    }
    const qty = parsed.value;
    if (qty > remainingQty) {
      showAlert(
        "Invalid",
        `Remaining to receive for this line is ${remainingQty} gal.`,
      );
      return;
    }
    if (isCustomColor && !String(stackLocation || "").trim()) {
      showAlert("Missing location", "Choose a stack location (A–Z).");
      return;
    }
    setReceiveSubmitting(true);
    try {
      await onReceiveDelivery(
        selectedOrder.id,
        qty,
        isCustomColor
          ? { location: resolveCustomStackLocation(stackLocation) }
          : undefined,
      );
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
  const lightPaint = Boolean(textOnHex && textOnHex.primary === "#1a1a1a");
  const metaFill = textOnHex
    ? lightPaint
      ? "rgba(0,0,0,0.08)"
      : "rgba(255,255,255,0.14)"
    : nestedSurfaceColor(theme);
  const metaLine = textOnHex
    ? lightPaint
      ? "rgba(0,0,0,0.14)"
      : "rgba(255,255,255,0.22)"
    : theme.colors.outlineVariant;
  const metaRule = textOnHex
    ? lightPaint
      ? "rgba(0,0,0,0.16)"
      : "rgba(255,255,255,0.28)"
    : theme.colors.outlineVariant;

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
              isCustomColor ? styles.heroId : styles.heroName,
              {
                color: textOnHex ? textOnHex.primary : theme.colors.onSurface,
              },
            ]}
            numberOfLines={2}
          >
            {heroTitle}
          </Text>
          <View
            style={[
              styles.heroMetaPanel,
              {
                backgroundColor: metaFill,
                borderColor: metaLine,
              },
            ]}
          >
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaBlock}>
                <Text
                  style={[
                    styles.heroMetaLabel,
                    {
                      color: textOnHex
                        ? textOnHex.secondary
                        : theme.colors.onSurfaceVariant,
                    },
                  ]}
                >
                  Qty
                </Text>
                <Text
                  style={[
                    styles.heroMetaValue,
                    {
                      color: textOnHex
                        ? textOnHex.primary
                        : theme.colors.onSurface,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {formatGallonQuantity(item.quantity || 0)} {unitAffix}
                </Text>
              </View>
              <View
                style={[styles.heroMetaDivider, { backgroundColor: metaRule }]}
              />
              <View style={styles.heroMetaBlock}>
                <Text
                  style={[
                    styles.heroMetaLabel,
                    {
                      color: textOnHex
                        ? textOnHex.secondary
                        : theme.colors.onSurfaceVariant,
                    },
                  ]}
                >
                  Location
                </Text>
                <Text
                  style={[
                    styles.heroMetaValue,
                    {
                      color: textOnHex
                        ? textOnHex.primary
                        : theme.colors.onSurface,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {isCustomColor
                    ? showStoredLocation
                      ? formatCustomStackDisplay(item.location)
                      : "—"
                    : item.location && String(item.location).trim()
                      ? String(item.location).trim()
                      : "—"}
                </Text>
              </View>
            </View>
            {footerId ? (
              <View
                style={[styles.heroIdFooter, { borderTopColor: metaLine }]}
              >
                <Text
                  style={[
                    styles.itemIdLine,
                    {
                      color: textOnHex
                        ? textOnHex.secondary
                        : theme.colors.onSurfaceVariant,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {footerId}
                </Text>
              </View>
            ) : null}
          </View>
          {confirmName ? (
            <Text
              style={[
                styles.colorConfirm,
                {
                  color: textOnHex
                    ? textOnHex.secondary
                    : theme.colors.onSurfaceVariant,
                },
              ]}
              numberOfLines={2}
            >
              {confirmName}
            </Text>
          ) : null}
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
                <AppButton
                  mode={action === "in" ? "contained" : "outlined"}
                  onPress={handleCheckInPress}
                  style={[
                    styles.actionButton,
                    { borderColor: colors.action.checkIn },
                    action === "in" && styles.selectedButton,
                  ]}
                  buttonColor={
                    action === "in" ? colors.action.checkIn : undefined
                  }
                  textColor={
                    action === "in" ? "#1b5e20" : colors.action.checkIn
                  }
                  icon="arrow-up"
                >
                  Check In
                </AppButton>
                <AppButton
                  mode={action === "out" ? "contained" : "outlined"}
                  onPress={() => {
                    if (currentStock <= 0) {
                      showAlert(
                        "Cannot check out",
                        `This item currently has 0 ${unitWord} available to check out.`,
                      );
                      return;
                    }
                    setAction("out");
                  }}
                  style={[
                    styles.actionButton,
                    { borderColor: colors.action.checkOut },
                    action === "out" && styles.selectedButton,
                  ]}
                  buttonColor={
                    action === "out" ? colors.action.checkOut : undefined
                  }
                  textColor={
                    action === "out" ? "#b71c1c" : colors.action.checkOut
                  }
                  icon="arrow-down"
                >
                  Check Out
                </AppButton>
                {showReceivingButton && (
                  <AppButton
                    mode="contained"
                    onPress={openReceiveModal}
                    style={styles.actionButton}
                    icon="truck-delivery"
                    buttonColor={colors.materialType.paint}
                    textColor="#fff"
                  >
                    Receiving Delivery
                  </AppButton>
                )}
                {showRecycleButton ? (
                  <AppButton
                    mode={action === "recycle" ? "contained" : "outlined"}
                    onPress={() => setAction("recycle")}
                    style={[
                      styles.actionButton,
                      action === "recycle" && styles.selectedButton,
                    ]}
                    icon="recycle"
                    buttonColor={
                      action === "recycle" ? colors.action.receive : undefined
                    }
                    textColor={action === "recycle" ? "#fff" : undefined}
                  >
                    Recycle
                  </AppButton>
                ) : null}
                {showLocationOnlyButton ? (
                  <AppButton
                    mode={action === "location" ? "contained" : "outlined"}
                    onPress={() => setAction("location")}
                    style={[
                      styles.actionButton,
                      action === "location" && styles.selectedButton,
                    ]}
                    icon="map-marker"
                  >
                    Change Location
                  </AppButton>
                ) : null}
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
                          <View key={String(v)} style={styles.quickQtyCell}>
                            <AppButton
                              mode="outlined"
                              compact
                              onPress={() => setQuantity(String(v))}
                              style={styles.quickQtyButton}
                              contentStyle={styles.quickQtyButtonContent}
                            >
                              {v}
                            </AppButton>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {action !== "location" ? (
                    <TextInput
                      label={
                        action === "in"
                          ? "Quantity to add (gallons)"
                          : action === "recycle"
                            ? "Quantity to recycle (gallons)"
                            : "Quantity to remove (gallons)"
                      }
                      value={quantity}
                      onChangeText={setQuantity}
                      mode="outlined"
                      keyboardType="decimal-pad"
                      style={styles.input}
                      right={<TextInput.Affix text={unitAffix} />}
                    />
                  ) : null}
                  {(action === "in" || action === "location") &&
                  isCustomColor ? (
                    <View style={styles.stackField}>
                      <Text
                        style={[
                          styles.stackLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Stack location (A–Z)
                      </Text>
                      <Menu
                        visible={stackMenuOpen}
                        onDismiss={() => setStackMenuOpen(false)}
                        anchor={
                          <AppButton
                            mode="outlined"
                            onPress={() => setStackMenuOpen(true)}
                            icon="chevron-down"
                            contentStyle={styles.stackButtonContent}
                            style={styles.input}
                          >
                            {String(stackLocation || "").trim()
                              ? stackLetterFromLocation(stackLocation)
                              : "Select…"}
                          </AppButton>
                        }
                      >
                        {CUSTOM_STACK_OPTIONS.map((o) => (
                          <Menu.Item
                            key={o.value}
                            onPress={() => {
                              setStackLocation(o.value);
                              setStackMenuOpen(false);
                            }}
                            title={o.label}
                          />
                        ))}
                      </Menu>
                    </View>
                  ) : null}
                  {(action === "out" || action === "recycle") &&
                  currentStock <= 0 ? (
                    <Text
                      style={[
                        styles.stockWarning,
                        { color: theme.colors.error },
                      ]}
                    >
                      No {unitWord} available to{" "}
                      {action === "recycle" ? "recycle" : "check out"}.
                    </Text>
                  ) : null}
                  <View style={styles.submitRow}>
                    <AppButton
                      mode="outlined"
                      onPress={onCancel}
                      style={styles.button}
                    >
                      Cancel
                    </AppButton>
                    <AppButton
                      mode="contained"
                      onPress={handleSubmit}
                      style={styles.button}
                      disabled={
                        action === "location"
                          ? !stackLocation
                          : !quantity ||
                            parseFloat(quantity) <= 0 ||
                            (action === "in" &&
                              isCustomColor &&
                              !stackLocation) ||
                            ((action === "out" || action === "recycle") &&
                              currentStock <= 0)
                      }
                      buttonColor={
                        action === "recycle" ? colors.action.receive : undefined
                      }
                    >
                      {action === "recycle"
                        ? "Confirm Recycle"
                        : action === "location"
                          ? "Save Location"
                          : "Submit"}
                    </AppButton>
                  </View>
                </>
              )}

              {!action && (
                <AppButton
                  mode="outlined"
                  onPress={onCancel}
                  style={styles.cancelButton}
                >
                  Cancel
                </AppButton>
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
              <AppButton
                mode="contained"
                onPress={handleDeliveryPromptYes}
                icon="truck-delivery"
                style={styles.promptPrimaryBtn}
              >
                Yes — select PO
              </AppButton>
              <AppButton mode="outlined" onPress={handleDeliveryPromptNo}>
                No — regular check-in
              </AppButton>
              <AppButton mode="text" onPress={() => setShowDeliveryPrompt(false)}>
                Cancel
              </AppButton>
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
            </Text>
            <ScrollFrame maxHeight={200}>
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
                      {
                        borderColor: theme.colors.outlineVariant,
                        backgroundColor: isSelected
                          ? theme.colors.surfaceContainerHighest
                          : nestedSurfaceColor(theme),
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
            </ScrollFrame>
            {selectedOrder && (
              <>
                <TextInput
                  label="Quantity to receive (gal)"
                  value={receiveQty}
                  onChangeText={setReceiveQty}
                  mode="outlined"
                  keyboardType="number-pad"
                  style={styles.receiveInput}
                />
                {isCustomColor ? (
                  <View style={styles.stackField}>
                    <Text
                      style={[
                        styles.stackLabel,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Stack location (A–Z)
                    </Text>
                    <Menu
                      visible={receiveStackMenuOpen}
                      onDismiss={() => setReceiveStackMenuOpen(false)}
                      anchor={
                        <AppButton
                          mode="outlined"
                          onPress={() => setReceiveStackMenuOpen(true)}
                          icon="chevron-down"
                          contentStyle={styles.stackButtonContent}
                          style={styles.receiveInput}
                        >
                          {String(stackLocation || "").trim()
                            ? stackLetterFromLocation(stackLocation)
                            : "Select…"}
                        </AppButton>
                      }
                    >
                      {CUSTOM_STACK_OPTIONS.map((o) => (
                        <Menu.Item
                          key={o.value}
                          onPress={() => {
                            setStackLocation(o.value);
                            setReceiveStackMenuOpen(false);
                          }}
                          title={o.label}
                        />
                      ))}
                    </Menu>
                  </View>
                ) : null}
                <View style={styles.modalActions}>
                  <AppButton
                    mode="outlined"
                    onPress={() => setShowReceiveModal(false)}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
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
                  </AppButton>
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
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  heroId: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 16,
    fontFamily: fontFamily.mono,
  },
  heroName: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  heroMetaPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroMetaDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 10,
  },
  heroMetaBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  heroMetaLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
    textAlign: "center",
  },
  heroMetaValue: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  heroIdFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  itemIdLine: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    fontFamily: fontFamily.mono,
    letterSpacing: 0.4,
  },
  colorConfirm: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    opacity: 0.85,
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  colorLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
    fontFamily: fontFamily.mono,
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
  stockWarning: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
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
    alignItems: "stretch",
    gap: 10,
  },
  quickQtyCell: {
    flex: 1,
    minWidth: 0,
  },
  quickQtyButton: {
    width: "100%",
  },
  quickQtyButtonContent: {
    width: "100%",
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    maxHeight: "80%",
    gap: 0,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  poList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  poRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
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
    marginTop: 8,
  },
  promptActions: {
    gap: 10,
    marginTop: 4,
  },
  promptPrimaryBtn: {
    marginBottom: 4,
  },
  receiveInput: {
    marginBottom: 12,
    marginTop: 4,
  },
  stackField: {
    marginBottom: 8,
  },
  stackLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  stackButtonContent: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
});
