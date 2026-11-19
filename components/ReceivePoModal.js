import React, { useState, useEffect, memo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  TextInput,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet from "./ui/AppSheet";
import { allowsHalfGallon, sanitizeGallonInput } from "../utils/gallonQuantity";
import { nestedSurfaceColor, popupSurfaceColor } from "../utils/themeColors";
import ScrollFrame from "./ScrollFrame";
import { colors, fontFamily, space, radius } from "../theme/tokens";
import { AppBadge, AppEmptyState } from "./ui";
import { useAppLayout } from "../utils/layout";
import {
  CUSTOM_STACK_OPTIONS,
  isCustomType,
  stackLetterFromLocation,
} from "../utils/customStacks";
import {
  getMaterialTypeColor,
  getMaterialTypeLabel,
} from "../utils/materialTypes";

const PANEL_VIEWPORT_RATIO = 0.7;

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

/** pending | partial | complete */
function lineReceiveStatus(line) {
  const ordered = lineOrderedQty(line);
  const received = lineReceivedQty(line);
  const remaining = lineRemainingQty(line);
  if (ordered > 0 && remaining <= 0) return "complete";
  if (received > 0 && remaining > 0) return "partial";
  return "pending";
}

function sortLinesForReceive(lines) {
  const rank = { pending: 0, partial: 1, complete: 2 };
  return [...(lines || [])].sort((a, b) => {
    const diff = rank[lineReceiveStatus(a)] - rank[lineReceiveStatus(b)];
    if (diff !== 0) return diff;
    const aId = String(a?.itemId ?? a?.item_id ?? "");
    const bId = String(b?.itemId ?? b?.item_id ?? "");
    return aId.localeCompare(bId);
  });
}

function formatGal(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "0";
  const rounded = Math.round(x * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function orderReceiveProgress(order) {
  let ordered = 0;
  let received = 0;
  let openLines = 0;
  const lines = order?.lines || [];
  for (const line of lines) {
    ordered += lineOrderedQty(line);
    received += lineReceivedQty(line);
    if (lineRemainingQty(line) > 0) openLines += 1;
  }
  const remaining = Math.max(0, ordered - received);
  const ratio = ordered > 0 ? Math.min(1, received / ordered) : 0;
  return {
    ordered,
    received,
    remaining,
    openLines,
    totalLines: lines.length,
    ratio,
  };
}

const STATUS_COLORS = {
  complete: {
    accent: colors.semantic.success,
    soft: "rgba(46,125,50,0.14)",
    label: "Complete",
    badgeTone: "success",
  },
  partial: {
    accent: colors.semantic.partial,
    soft: "rgba(249,168,37,0.16)",
    label: "Partial",
    badgeTone: "warning",
  },
  pending: {
    accent: colors.brand.navy,
    soft: "rgba(15, 22, 36, 0.08)",
    label: "Not received",
    badgeTone: "primary",
  },
};

function getOrderExpectedLabel(order) {
  const placed = order?.placed_at;
  const days = parseInt(order?.lead_time_days, 10) || 5;
  if (!placed) return null;
  const d = new Date(placed);
  if (isNaN(d.getTime())) return null;
  const exp = new Date(d);
  exp.setDate(exp.getDate() + days);
  return exp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderTypeChips(order, getItemTypeForOrder, theme) {
  const seen = new Map();
  for (const line of order?.lines || []) {
    const itemId = String(line.itemId ?? line.item_id ?? "").trim();
    const t = String(getItemTypeForOrder?.(itemId) || "")
      .toLowerCase()
      .trim();
    if (!t || seen.has(t)) continue;
    seen.set(t, {
      key: t,
      label: getMaterialTypeLabel(t),
      color: getMaterialTypeColor(t, theme),
    });
  }
  return Array.from(seen.values());
}

const ReceiveLineQtyInput = memo(function ReceiveLineQtyInput({
  itemId,
  initialQty,
  remaining,
  allowHalf,
  onQtyChange,
}) {
  const [value, setValue] = useState(initialQty);

  useEffect(() => {
    setValue(initialQty);
  }, [itemId, initialQty]);

  const handleChange = (text) => {
    const cleaned = sanitizeGallonInput(text, allowHalf).slice(0, 5);
    setValue(cleaned);
    onQtyChange(itemId, cleaned);
  };

  return (
    <TextInput
      label="Receive qty (gal)"
      value={value}
      onChangeText={handleChange}
      mode="outlined"
      dense
      placeholder={String(remaining)}
      keyboardType={
        allowHalf
          ? Platform.OS === "ios"
            ? "decimal-pad"
            : "numeric"
          : Platform.OS === "ios"
            ? "number-pad"
            : "numeric"
      }
      style={styles.receiveQtyInput}
    />
  );
});

const ReceiveLineStackPicker = memo(function ReceiveLineStackPicker({
  itemId,
  initialValue,
  onChange,
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    setValue(initialValue || "");
  }, [itemId, initialValue]);

  const letter = value ? stackLetterFromLocation(value) : "";

  const pick = (next) => {
    setValue(next);
    onChange(itemId, next);
    setOpen(false);
  };

  return (
    <View style={styles.stackField}>
      <Text
        style={[styles.stackLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        Place in stack (A–Z)
      </Text>
      <AppButton
        mode="outlined"
        compact
        onPress={() => setOpen(true)}
        icon="chevron-down"
        contentStyle={styles.stackButtonContent}
      >
        {letter || "None"}
      </AppButton>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.stackModalRoot}>
          <Pressable
            style={styles.stackModalBackdrop}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close stack picker"
          />
          <View
            style={[
              styles.stackModalPanel,
              {
                borderColor: theme.colors.outlineVariant,
                backgroundColor: theme.colors.surfaceContainerHighest,
              },
            ]}
          >
            <Text
              style={[styles.stackModalTitle, { color: theme.colors.onSurface }]}
            >
              Place in stack
            </Text>
            <View style={styles.stackGrid}>
              <Pressable
                onPress={() => pick("")}
                style={[
                  styles.stackNoneCell,
                  !value && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.stackCellText,
                    {
                      color: !value
                        ? theme.colors.onPrimary
                        : theme.colors.onSurface,
                    },
                  ]}
                >
                  None
                </Text>
              </Pressable>
              {CUSTOM_STACK_OPTIONS.map((o) => {
                const selected = value === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => pick(o.value)}
                    style={[
                      styles.stackCell,
                      selected && {
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stackCellText,
                        {
                          color: selected
                            ? theme.colors.onPrimary
                            : theme.colors.onSurface,
                        },
                      ]}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              mode="outlined"
              onPress={() => setOpen(false)}
              style={styles.stackModalCancel}
            >
              Cancel
            </AppButton>
          </View>
        </View>
      </Modal>
    </View>
  );
});

function ReceivePoChrome({
  sheet,
  visible,
  onClose,
  receiveSubmitting,
  title,
  subtitle,
  footer,
  keyboard,
  panelPos,
  panelWidth,
  panelHeight,
  panelMaxHeight,
  theme,
  children,
}) {
  if (sheet) {
    return (
      <AppSheet
        visible={visible}
        onDismiss={() => {
          if (!receiveSubmitting) onClose();
        }}
        title={title}
        subtitle={subtitle}
        size="large"
        scroll={false}
        keyboard={keyboard}
        dismissable={!receiveSubmitting}
        footer={footer}
      >
        {children}
      </AppSheet>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => !receiveSubmitting && onClose()}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={() => !receiveSubmitting && onClose()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.panelAnchor,
            {
              top: panelPos.top,
              left: panelPos.left,
              width: panelWidth,
              height: panelHeight,
              pointerEvents: "box-none",
            },
          ]}
        >
          <View
            style={[
              styles.panel,
              {
                height: panelHeight,
                maxHeight: panelMaxHeight,
                backgroundColor: popupSurfaceColor(theme),
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ReceivePoModal({
  visible,
  actorName,
  step,
  onClose,
  onBackToList,
  onSelectOrder,
  onSubmit,
  receiveSubmitting,
  receiveOrdersList,
  receiveOrdersLoaded,
  receiveOrdersLoading,
  onRefreshReceiveOrders,
  selectedReceiveOrder,
  lineReceiveQtysRef,
  lineReceiveLocationsRef,
  detailResetKey,
  getItemNameForOrder,
  getItemCodeForOrder,
  getItemTypeForOrder,
  formatOrderColorsPreview,
  anchorRef,
}) {
  const theme = useTheme();
  const { isMobilePortrait } = useAppLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const margin = 10;
  const panelWidth = Math.max(
    280,
    Math.min(
      Math.round(windowWidth * PANEL_VIEWPORT_RATIO),
      windowWidth - margin * 2,
    ),
  );
  const panelHeight = Math.max(
    320,
    Math.min(
      Math.round(windowHeight * PANEL_VIEWPORT_RATIO),
      windowHeight - margin * 2,
    ),
  );
  const [panelPos, setPanelPos] = useState({
    top: margin,
    left: margin,
    caretTop: 24,
  });

  const placePanel = useCallback(
    (x, y, width, height) => {
      const gap = 10;
      // Prefer opening to the LEFT of the Receive button.
      let left = x - gap - panelWidth;
      if (left < margin) {
        // Not enough room on the left — try right of the button.
        left = x + width + gap;
        if (left + panelWidth > windowWidth - margin) {
          left = Math.max(margin, Math.round((windowWidth - panelWidth) / 2));
        }
      }
      left = Math.max(
        margin,
        Math.min(left, windowWidth - panelWidth - margin),
      );

      // Vertically center on the button, then clamp into the viewport.
      let top = Math.round(y + height / 2 - panelHeight / 2);
      top = Math.max(
        margin,
        Math.min(top, windowHeight - panelHeight - margin),
      );

      const buttonCenterY = y + height / 2;
      const caretTop = Math.max(
        18,
        Math.min(buttonCenterY - top - 8, panelHeight - 36),
      );
      setPanelPos({ top, left, caretTop });
    },
    [margin, panelHeight, panelWidth, windowHeight, windowWidth],
  );

  useEffect(() => {
    if (!visible || isMobilePortrait) return undefined;
    const node = anchorRef?.current;

    const runMeasure = () => {
      if (node && typeof node.measureInWindow === "function") {
        node.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            placePanel(x, y, width, height);
            return;
          }
          setPanelPos({
            top: Math.max(margin, Math.round((windowHeight - panelHeight) / 2)),
            left: Math.max(margin, Math.round((windowWidth - panelWidth) / 2)),
            caretTop: 24,
          });
        });
        return;
      }
      setPanelPos({
        top: Math.max(margin, Math.round((windowHeight - panelHeight) / 2)),
        left: Math.max(margin, Math.round((windowWidth - panelWidth) / 2)),
        caretTop: 24,
      });
    };

    runMeasure();
    const t =
      Platform.OS === "web" ? requestAnimationFrame(runMeasure) : null;
    return () => {
      if (t != null) cancelAnimationFrame(t);
    };
  }, [
    visible,
    isMobilePortrait,
    step,
    placePanel,
    anchorRef,
    panelWidth,
    panelHeight,
    margin,
    windowHeight,
    windowWidth,
  ]);

  if (!actorName) return null;

  const isOpen = (o) =>
    String(o?.status ?? "")
      .toLowerCase()
      .trim() === "open";
  const openOrders = (receiveOrdersList || []).filter(isOpen);
  const expLabel = selectedReceiveOrder
    ? getOrderExpectedLabel(selectedReceiveOrder)
    : null;

  const handleQtyChange = (itemId, cleaned) => {
    lineReceiveQtysRef.current[itemId] = cleaned;
  };

  const handleLocationChange = (itemId, loc) => {
    if (lineReceiveLocationsRef?.current) {
      lineReceiveLocationsRef.current[itemId] = loc;
    }
  };

  const panelMaxHeight = panelHeight;
  const listScrollMax = Math.max(
    180,
    isMobilePortrait
      ? Math.round(windowHeight * 0.55)
      : panelMaxHeight - 200,
  );
  const detailScrollMax = Math.max(
    200,
    isMobilePortrait
      ? Math.round(windowHeight * 0.42)
      : panelMaxHeight - 220,
  );

  const receiveProgress = selectedReceiveOrder
    ? orderReceiveProgress(selectedReceiveOrder)
    : null;
  const sheetTitle =
    step === "detail"
      ? selectedReceiveOrder
        ? `PO ${selectedReceiveOrder.po_number || selectedReceiveOrder.id}`
        : "Receive lines"
      : "Receive from PO";
  const sheetSubtitle =
    step === "list"
      ? "Pick an open order to log delivery"
      : expLabel
        ? `Expected ~${expLabel}`
        : "Gallons per line";

  const listFooter =
    receiveOrdersLoaded && openOrders.length === 0 ? (
      <AppButton
        mode="outlined"
        onPress={() => onRefreshReceiveOrders?.(true)}
        disabled={receiveOrdersLoading}
      >
        Reload
      </AppButton>
    ) : null;
  const detailFooter = (
    <AppButton
      mode="contained"
      onPress={onSubmit}
      loading={receiveSubmitting}
      disabled={receiveSubmitting}
    >
      Receive
    </AppButton>
  );

  const listBody = (
              <>
                <View style={styles.listIntro}>
                  <View
                    style={[
                      styles.openCountPill,
                      {
                        backgroundColor: theme.dark
                          ? "rgba(201, 151, 46, 0.22)"
                          : colors.brand.accentSoft,
                        borderColor: colors.brand.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.openCountValue,
                        { color: colors.brand.accent },
                      ]}
                    >
                      {openOrders.length}
                    </Text>
                    <Text
                      style={[
                        styles.openCountLabel,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      open PO{openOrders.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.help,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Gallons per line. Custom colors: stack A-Z.
                  </Text>
                </View>
                {receiveOrdersLoading && !receiveOrdersLoaded ? (
                  <ActivityIndicator style={{ marginVertical: 24 }} />
                ) : openOrders.length === 0 ? (
                  <>
                    <AppEmptyState
                      title="No open purchase orders detected."
                      style={styles.emptyOrders}
                    />
                    {!isMobilePortrait ? (
                    <View style={styles.actions}>
                      <AppButton
                        mode="outlined"
                        onPress={() => onRefreshReceiveOrders?.(true)}
                        disabled={receiveOrdersLoading}
                      >
                        Reload
                      </AppButton>
                    </View>
                    ) : null}
                  </>
                ) : (
                  <ScrollFrame
                    bordered={false}
                    maxHeight={listScrollMax}
                    style={{ marginBottom: 8 }}
                  >
                    {openOrders.map((order) => {
                      const placed = order.placed_at
                        ? new Date(order.placed_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        : "";
                      const exp = getOrderExpectedLabel(order);
                      const lineCount = (order.lines || []).length;
                      const typeChips = getOrderTypeChips(
                        order,
                        getItemTypeForOrder,
                        theme,
                      );
                      const primaryTypeColor =
                        typeChips[0]?.color || colors.brand.accent;
                      return (
                        <Pressable
                          key={String(order.id)}
                          onPress={() => onSelectOrder(order)}
                          style={({ pressed }) => [
                            styles.orderRow,
                            {
                              borderColor: theme.dark
                                ? `${primaryTypeColor}55`
                                : `${primaryTypeColor}66`,
                              borderBottomWidth: 3,
                              borderBottomColor: primaryTypeColor,
                              backgroundColor: pressed
                                ? theme.colors.surface
                                : nestedSurfaceColor(theme),
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.orderAccent,
                              { backgroundColor: primaryTypeColor },
                            ]}
                          />
                          <View style={styles.orderRowBody}>
                            <View style={styles.orderPoRow}>
                              <Text
                                style={[
                                  styles.orderPo,
                                  { color: theme.colors.onSurface },
                                ]}
                              >
                                PO {order.po_number || order.id}
                              </Text>
                              {exp ? (
                                <View
                                  style={[
                                    styles.expectedPill,
                                    {
                                      backgroundColor: theme.dark
                                        ? "rgba(38,166,154,0.2)"
                                        : "rgba(38,166,154,0.12)",
                                      borderColor: colors.action.materialUsage,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.expectedPillText,
                                      {
                                        color: theme.dark
                                          ? "#80CBC4"
                                          : "#00897B",
                                      },
                                    ]}
                                  >
                                    ~{exp}
                                  </Text>
                                </View>
                              ) : null}
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
                                      style={[
                                        styles.typeChipText,
                                        { color: chip.color },
                                      ]}
                                    >
                                      {chip.label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            {placed ? (
                              <Text
                                style={[
                                  styles.orderMeta,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                Placed {placed}
                                {lineCount
                                  ? ` · ${lineCount} line${lineCount === 1 ? "" : "s"}`
                                  : ""}
                              </Text>
                            ) : null}
                            <Text
                              style={[
                                styles.orderPreview,
                                { color: theme.colors.onSurface },
                              ]}
                              numberOfLines={2}
                            >
                              {formatOrderColorsPreview(order)}
                            </Text>
                            {(() => {
                              const jobs = [
                                ...new Set(
                                  (order.lines || [])
                                    .map((l) => (l.job_name || "").trim())
                                    .filter(Boolean),
                                ),
                              ];
                              if (jobs.length === 0) return null;
                              return (
                                <Text
                                  style={[
                                    styles.orderMeta,
                                    {
                                      color: theme.colors.onSurfaceVariant,
                                      marginTop: 4,
                                    },
                                  ]}
                                  numberOfLines={2}
                                >
                                  Job{jobs.length > 1 ? "s" : ""}:{" "}
                                  {jobs.join(", ")}
                                </Text>
                              );
                            })()}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollFrame>
                )}
              </>
  );

  const detailBody = !selectedReceiveOrder ? null : (
              <>
                {!isMobilePortrait ? (
                <View
                  style={[
                    styles.detailHeader,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(201, 151, 46, 0.16)"
                        : "rgba(201, 151, 46, 0.12)",
                      borderColor: theme.dark
                        ? "rgba(201, 151, 46, 0.4)"
                        : "rgba(201, 151, 46, 0.35)",
                    },
                  ]}
                >
                  <IconButton
                    icon="arrow-left"
                    size={22}
                    onPress={onBackToList}
                    disabled={receiveSubmitting}
                    style={styles.backBtn}
                  />
                  <View style={[styles.detailHeaderCenter, { pointerEvents: "none" }]}>
                    <Text
                      style={[
                        styles.detailPo,
                        { color: theme.colors.onSurface },
                      ]}
                      numberOfLines={1}
                    >
                      PO{" "}
                      {selectedReceiveOrder.po_number || selectedReceiveOrder.id}
                    </Text>
                    {expLabel ? (
                      <Text
                        style={[
                          styles.detailExpected,
                          { color: colors.brand.accentBright },
                        ]}
                        numberOfLines={1}
                      >
                        Expected ~{expLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
                ) : null}

                {receiveProgress ? (
                  <View style={styles.progressBlock}>
                    <View style={styles.progressRow}>
                      <View style={styles.progressHero}>
                        <Text
                          style={[
                            styles.progressValue,
                            { color: colors.brand.accentBright },
                          ]}
                        >
                          {receiveProgress.remaining > 0
                            ? `${formatGal(receiveProgress.remaining)} gal`
                            : "All in"}
                        </Text>
                        <Text
                          style={[
                            styles.progressLabel,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {receiveProgress.remaining > 0
                            ? "still to receive"
                            : "nothing left on this PO"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.progressLogged,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {formatGal(receiveProgress.received)} /{" "}
                        {formatGal(receiveProgress.ordered)} gal logged
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.progressTrack,
                        {
                          backgroundColor: theme.dark
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(15,22,36,0.1)",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.round(receiveProgress.ratio * 100)}%`,
                            backgroundColor: colors.brand.accent,
                          },
                        ]}
                      />
                    </View>
                    {receiveProgress.totalLines > 0 ? (
                      <Text
                        style={[
                          styles.progressLines,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        {receiveProgress.openLines === 0
                          ? `${receiveProgress.totalLines} line${
                              receiveProgress.totalLines === 1 ? "" : "s"
                            } logged`
                          : `${receiveProgress.openLines} of ${
                              receiveProgress.totalLines
                            } line${
                              receiveProgress.totalLines === 1 ? "" : "s"
                            } still need gallons`}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                  <ScrollFrame
                    bordered={false}
                    key={String(detailResetKey)}
                    maxHeight={detailScrollMax}
                    contentContainerStyle={{ paddingBottom: 12 }}
                    scrollProps={{ keyboardDismissMode: "on-drag" }}
                  >
                  {sortLinesForReceive(selectedReceiveOrder.lines).map(
                    (line, idx) => {
                      const itemId = String(
                        line.itemId ?? line.item_id ?? "",
                      ).trim();
                      const ordered = lineOrderedQty(line);
                      const received = lineReceivedQty(line);
                      const remaining = lineRemainingQty(line);
                      const status = lineReceiveStatus(line);
                      const statusColors = STATUS_COLORS[status];
                      const name = getItemNameForOrder(itemId);
                      const code = getItemCodeForOrder
                        ? getItemCodeForOrder(itemId)
                        : itemId;
                      const typeKey = String(
                        getItemTypeForOrder?.(itemId) || "",
                      )
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
                          key={`${detailResetKey}-${itemId}-${idx}`}
                          style={[
                            styles.lineCard,
                            {
                              borderColor: theme.colors.outlineVariant,
                              backgroundColor: nestedSurfaceColor(theme),
                              borderLeftWidth: 4,
                              borderLeftColor: typeColor,
                            },
                          ]}
                        >
                          <View style={styles.lineTitleRow}>
                            <Text
                              style={[
                                styles.lineName,
                                { color: theme.colors.onSurface, flex: 1 },
                              ]}
                              numberOfLines={2}
                            >
                              {name}
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
                            <AppBadge tone={statusColors.badgeTone}>
                              {statusColors.label}
                            </AppBadge>
                          </View>
                          {code ? (
                            <Text
                              style={[
                                styles.lineCode,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                              numberOfLines={1}
                            >
                              {code}
                            </Text>
                          ) : null}
                          {(line.job_name || "").trim() ? (
                            <Text
                              style={[
                                styles.lineJob,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              Job: {(line.job_name || "").trim()}
                            </Text>
                          ) : null}
                          <View style={styles.qtyRow}>
                            <View
                              style={[
                                styles.qtyChip,
                                {
                                  backgroundColor: theme.dark
                                    ? "rgba(255,255,255,0.08)"
                                    : "rgba(15,22,36,0.06)",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.qtyChipLabel,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                Ordered
                              </Text>
                              <Text
                                style={[
                                  styles.qtyChipValue,
                                  { color: theme.colors.onSurface },
                                ]}
                              >
                                {ordered}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.qtyChip,
                                {
                                  backgroundColor: theme.dark
                                    ? "rgba(201,151,46,0.18)"
                                    : "rgba(201,151,46,0.14)",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.qtyChipLabel,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                Received
                              </Text>
                              <Text
                                style={[
                                  styles.qtyChipValue,
                                  { color: theme.colors.onSurface },
                                ]}
                              >
                                {received}
                              </Text>
                            </View>
                          </View>
                          {remaining > 0 ? (
                            <ReceiveLineQtyInput
                              itemId={itemId}
                              initialQty={String(
                                lineReceiveQtysRef.current[itemId] ?? remaining,
                              )}
                              remaining={remaining}
                              allowHalf={allowsHalfGallon(
                                getItemTypeForOrder?.(itemId),
                              )}
                              onQtyChange={handleQtyChange}
                            />
                          ) : null}
                          {remaining > 0 &&
                          isCustomType(getItemTypeForOrder?.(itemId)) ? (
                            <ReceiveLineStackPicker
                              itemId={itemId}
                              initialValue={
                                lineReceiveLocationsRef?.current?.[itemId] ||
                                ""
                              }
                              onChange={handleLocationChange}
                            />
                          ) : null}
                        </View>
                      );
                    },
                  )}
                </ScrollFrame>

                {!isMobilePortrait ? (
                <View style={styles.actions}>
                  <AppButton
                    mode="outlined"
                    onPress={onBackToList}
                    disabled={receiveSubmitting}
                  >
                    Back
                  </AppButton>
                  <AppButton
                    mode="contained"
                    onPress={onSubmit}
                    loading={receiveSubmitting}
                    disabled={receiveSubmitting}
                  >
                    Receive
                  </AppButton>
                </View>
                ) : null}
              </>
  );

  if (isMobilePortrait) {
    return (
      <>
        <AppSheet
          visible={visible}
          onDismiss={() => {
            if (!receiveSubmitting) onClose();
          }}
          title="Receive from PO"
          subtitle="Pick an open order to log delivery"
          size="large"
          tall
          scroll={false}
          dismissable={!receiveSubmitting}
          footer={listFooter}
        >
          {listBody}
        </AppSheet>
        <AppSheet
          visible={visible && step === "detail" && !!selectedReceiveOrder}
          onDismiss={() => {
            if (!receiveSubmitting) onBackToList();
          }}
          title={
            selectedReceiveOrder
              ? `PO ${selectedReceiveOrder.po_number || selectedReceiveOrder.id}`
              : "Receive lines"
          }
          subtitle={expLabel ? `Expected ~${expLabel}` : "Gallons per line"}
          stacked
          scroll={false}
          keyboard
          dismissable={!receiveSubmitting}
          footer={detailFooter}
        >
          {detailBody}
        </AppSheet>
      </>
    );
  }

  return (
    <ReceivePoChrome
      sheet={false}
      visible={visible}
      onClose={onClose}
      receiveSubmitting={receiveSubmitting}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      footer={null}
      keyboard={false}
      panelPos={panelPos}
      panelWidth={panelWidth}
      panelHeight={panelHeight}
      panelMaxHeight={panelMaxHeight}
      theme={theme}
    >
      <View
        style={[
          styles.panelHeader,
          {
            borderBottomColor: theme.colors.outlineVariant,
            backgroundColor: theme.dark
              ? "rgba(201, 151, 46, 0.12)"
              : "rgba(201, 151, 46, 0.1)",
          },
        ]}
      >
        <View
          style={[
            styles.panelHeaderAccent,
            { backgroundColor: colors.brand.accent },
          ]}
        />
        <View style={styles.panelHeaderText}>
          <Text
            style={[styles.panelTitle, { color: theme.colors.onSurface }]}
          >
            {step === "detail" ? "Receive lines" : "Receive from PO"}
          </Text>
          {step === "list" ? (
            <Text
              style={[
                styles.panelSubtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Pick an open order to log delivery
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="close"
          size={18}
          onPress={onClose}
          disabled={receiveSubmitting}
          style={styles.closeBtn}
          accessibilityLabel="Close receive PO"
        />
      </View>
      {step === "list" ? listBody : null}
      {step === "detail" ? detailBody : null}
    </ReceivePoChrome>
  );
}

const styles = StyleSheet.create({
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
  panel: {
    borderRadius: radius.md + 2,
    borderWidth: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: space[4],
    width: "100%",
    overflow: "hidden",
    flexDirection: "column",
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
    marginBottom: space[3],
    minHeight: 52,
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  panelHeaderAccent: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
    marginVertical: 2,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  panelSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  closeBtn: {
    margin: 0,
  },
  listIntro: {
    paddingHorizontal: space[5],
    marginBottom: space[2],
    gap: space[2],
  },
  openCountPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  openCountValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  openCountLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  help: {
    fontSize: 13,
    lineHeight: 18,
  },
  orderRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: space[2],
    marginHorizontal: space[5],
    overflow: "hidden",
    flexDirection: "row",
  },
  orderAccent: {
    width: 4,
  },
  orderRowBody: {
    flex: 1,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
  },
  orderPoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: space[1],
  },
  orderPo: {
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
    minWidth: 0,
  },
  expectedPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  expectedPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  orderMeta: {
    fontSize: 12,
    marginBottom: space[1],
  },
  orderPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    fontWeight: "500",
  },
  typeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  progressBlock: {
    paddingHorizontal: space[5],
    marginBottom: space[3],
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  progressHero: {
    flex: 1,
    minWidth: 0,
  },
  progressValue: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  progressLogged: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressLines: {
    fontSize: 12,
    fontWeight: "500",
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
  lineTypeLabel: {
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 0,
    marginRight: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[4],
    flexWrap: "wrap",
    marginTop: space[2],
    paddingHorizontal: space[5],
  },
  detailHeader: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space[3],
    marginHorizontal: space[5],
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingRight: space[2],
  },
  backBtn: {
    margin: 0,
    zIndex: 1,
  },
  detailHeaderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
  },
  detailPo: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  detailExpected: {
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
    fontWeight: "600",
  },
  lineCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    marginBottom: space[3],
    marginHorizontal: space[5],
    gap: space[1],
  },
  lineTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    marginBottom: 2,
  },
  lineName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 0,
  },
  lineCode: {
    fontSize: 13,
    fontFamily: fontFamily.mono,
    marginBottom: space[1],
  },
  emptyOrders: {
    flex: 0,
    paddingVertical: space[4],
    paddingHorizontal: space[5],
  },
  lineJob: {
    fontSize: 12,
    marginBottom: space[1],
  },
  qtyRow: {
    flexDirection: "row",
    gap: space[2],
    marginTop: space[2],
    marginBottom: space[2],
  },
  qtyChip: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  qtyChipLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  qtyChipValue: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 26,
    marginTop: 2,
  },
  receiveQtyInput: {
    marginTop: space[2],
  },
  stackField: {
    marginTop: space[2],
    gap: space[1],
  },
  stackLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  stackButtonContent: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  stackModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space[5],
  },
  stackModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  stackModalPanel: {
    borderWidth: 1,
    borderRadius: radius.md + 2,
    padding: space[4],
    zIndex: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 8px 24px rgba(0,0,0,0.28)" }
      : {
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
        }),
  },
  stackModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: space[3],
  },
  stackModalCancel: {
    marginTop: space[3],
  },
  stackGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  stackCell: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stackCellText: {
    fontSize: 13,
    fontWeight: "700",
  },
  stackNoneCell: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
