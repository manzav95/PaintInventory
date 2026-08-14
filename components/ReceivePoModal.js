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
import { allowsHalfGallon, sanitizeGallonInput } from "../utils/gallonQuantity";
import { nestedSurfaceColor } from "../utils/themeColors";
import ScrollFrame from "./ScrollFrame";
import { colors, fontFamily, space, radius } from "../theme/tokens";
import { AppBadge, AppEmptyState } from "./ui";
import {
  CUSTOM_STACK_OPTIONS,
  isCustomType,
  stackLetterFromLocation,
} from "../utils/customStacks";

const PANEL_WIDTH = 460;
const PANEL_MAX_HEIGHT = 520;

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
        onPress={() => setOpen((v) => !v)}
        icon={open ? "chevron-up" : "chevron-down"}
        contentStyle={styles.stackButtonContent}
      >
        {letter || "None"}
      </AppButton>
      {open ? (
        <View
          style={[
            styles.stackGrid,
            {
              borderColor: theme.colors.outlineVariant,
              backgroundColor: nestedSurfaceColor(theme),
            },
          ]}
        >
          <Pressable
            onPress={() => {
              setValue("");
              onChange(itemId, "");
              setOpen(false);
            }}
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
                onPress={() => {
                  setValue(o.value);
                  onChange(itemId, o.value);
                  setOpen(false);
                }}
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
      ) : null}
    </View>
  );
});

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const margin = 8;
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(200, windowWidth - margin * 2));
  const [panelPos, setPanelPos] = useState({
    top: 56,
    right: margin,
    caretLeft: panelWidth - 28,
  });

  const placePanel = useCallback(
    (x, y, width, height) => {
      const gap = 8;
      const caretSize = 10;
      const top = Math.max(
        margin,
        Math.min(y + height + gap, windowHeight - 160),
      );
      // Receive PO sits on the right — align panel to the button's right edge,
      // then clamp so the panel never leaves the viewport.
      const buttonRight = x + width;
      let right = windowWidth - buttonRight;
      const maxRight = Math.max(margin, windowWidth - panelWidth - margin);
      right = Math.max(margin, Math.min(right, maxRight));
      const left = windowWidth - right - panelWidth;
      const anchorCenterX = x + width / 2;
      const rawCaret = anchorCenterX - left - caretSize;
      const caretLeft = Math.max(
        14,
        Math.min(rawCaret, panelWidth - caretSize * 2 - 14),
      );
      setPanelPos({ top, right, caretLeft });
    },
    [margin, panelWidth, windowHeight, windowWidth],
  );

  useEffect(() => {
    if (!visible) return undefined;
    const node = anchorRef?.current;

    const runMeasure = () => {
      if (node && typeof node.measureInWindow === "function") {
        node.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            placePanel(x, y, width, height);
            return;
          }
          setPanelPos({
            top: 56,
            right: margin,
            caretLeft: panelWidth - 28,
          });
        });
        return;
      }
      setPanelPos({
        top: 56,
        right: margin,
        caretLeft: panelWidth - 28,
      });
    };

    runMeasure();
    // Web layouts (sidebar / centered shell) can settle a frame later.
    const t =
      Platform.OS === "web" ? requestAnimationFrame(runMeasure) : null;
    return () => {
      if (t != null) cancelAnimationFrame(t);
    };
  }, [visible, step, placePanel, anchorRef, panelWidth, margin]);

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

  const panelMaxHeight = Math.min(
    PANEL_MAX_HEIGHT,
    Math.max(220, windowHeight - panelPos.top - 12),
  );
  const listScrollMax = Math.min(280, Math.max(140, panelMaxHeight - 160));
  const detailScrollMax = Math.min(320, Math.max(140, panelMaxHeight - 140));

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
              right: panelPos.right,
              width: panelWidth,
              pointerEvents: "box-none",
            },
          ]}
        >
          <View
            style={[
              styles.caret,
              {
                left: panelPos.caretLeft,
                borderBottomColor: theme.colors.outlineVariant,
              },
            ]}
          />
          <View
            style={[
              styles.caretInner,
              {
                left: panelPos.caretLeft + 1,
                borderBottomColor: theme.colors.surfaceContainerHighest,
              },
            ]}
          />
          <View
            style={[
              styles.panel,
              {
                maxHeight: panelMaxHeight,
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text
                style={[styles.panelTitle, { color: theme.colors.onSurface }]}
              >
                {step === "detail" ? "Receive lines" : "Receive from PO"}
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={onClose}
                disabled={receiveSubmitting}
                style={styles.closeBtn}
                accessibilityLabel="Close receive PO"
              />
            </View>

            {step === "list" && (
              <>
                <Text
                  style={[
                    styles.help,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Choose an open order, then enter how many gallons you are
                  receiving on each line (defaults to full remaining).
                </Text>
                <Text
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  Open POs: {openOrders.length}
                </Text>
                {receiveOrdersLoading && !receiveOrdersLoaded ? (
                  <ActivityIndicator style={{ marginVertical: 24 }} />
                ) : openOrders.length === 0 ? (
                  <>
                    <AppEmptyState
                      title="No open purchase orders detected."
                      style={styles.emptyOrders}
                    />
                    <View style={styles.actions}>
                      <AppButton
                        mode="outlined"
                        onPress={() => onRefreshReceiveOrders?.(true)}
                        disabled={receiveOrdersLoading}
                      >
                        Reload
                      </AppButton>
                    </View>
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
                      return (
                        <Pressable
                          key={String(order.id)}
                          onPress={() => onSelectOrder(order)}
                          style={({ pressed }) => [
                            styles.orderRow,
                            {
                              borderColor: theme.colors.outlineVariant,
                              backgroundColor: pressed
                                ? theme.colors.surface
                                : nestedSurfaceColor(theme),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderPo,
                              { color: theme.colors.primary },
                            ]}
                          >
                            PO {order.po_number || order.id}
                          </Text>
                          {placed ? (
                            <Text
                              style={[
                                styles.orderMeta,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                            >
                              Placed {placed}
                              {exp ? ` · Expected ~${exp}` : ""}
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
                                Job{jobs.length > 1 ? "s" : ""}: {jobs.join(", ")}
                              </Text>
                            );
                          })()}
                        </Pressable>
                      );
                    })}
                  </ScrollFrame>
                )}
              </>
            )}

            {step === "detail" && selectedReceiveOrder && (
              <>
                <View style={styles.detailHeader}>
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
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                        numberOfLines={1}
                      >
                        Expected ~{expLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>

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
                      return (
                        <View
                          key={`${detailResetKey}-${itemId}-${idx}`}
                          style={[
                            styles.lineCard,
                            {
                              borderColor: statusColors.accent,
                              backgroundColor: nestedSurfaceColor(theme),
                              borderLeftWidth: 4,
                              borderLeftColor: statusColors.accent,
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
                          <Text
                            style={[
                              styles.qtyMeta,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            Ordered {ordered} · Received {received} · Remaining{" "}
                            {remaining} gal
                          </Text>
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
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
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
  caret: {
    position: "absolute",
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  caretInner: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  panel: {
    borderRadius: radius.md + 2,
    borderWidth: 1,
    paddingHorizontal: space[5],
    paddingTop: space[2],
    paddingBottom: space[4],
    width: "100%",
    overflow: "hidden",
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
    marginBottom: space[1],
    marginRight: -4,
    minHeight: 36,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    paddingRight: space[2],
  },
  closeBtn: {
    margin: 0,
  },
  help: {
    fontSize: 13,
    marginBottom: space[3],
    lineHeight: 18,
    paddingRight: space[1],
  },
  orderRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    marginBottom: space[2],
  },
  orderPo: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: space[1],
  },
  orderMeta: {
    fontSize: 12,
    marginBottom: space[1],
  },
  orderPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[4],
    flexWrap: "wrap",
    marginTop: space[2],
  },
  detailHeader: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space[3],
    minHeight: 44,
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
    fontWeight: "600",
    textAlign: "center",
  },
  detailExpected: {
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  lineCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[4],
    marginBottom: space[3],
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
    paddingHorizontal: 0,
  },
  lineJob: {
    fontSize: 12,
    marginBottom: space[1],
  },
  qtyMeta: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: space[2],
    marginTop: space[1],
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
  stackGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 6,
    gap: 4,
  },
  stackCell: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stackCellText: {
    fontSize: 13,
    fontWeight: "700",
  },
  stackNoneCell: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
