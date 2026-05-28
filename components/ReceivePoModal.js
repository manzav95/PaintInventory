import React, { useState, useEffect, memo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Modal,
  Pressable,
  TextInput as NativeTextInput,
} from "react-native";
import {
  Text,
  Button,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";

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
  onQtyChange,
}) {
  const theme = useTheme();
  const [value, setValue] = useState(initialQty);

  useEffect(() => {
    setValue(initialQty);
  }, [itemId, initialQty]);

  const handleChange = (text) => {
    const cleaned = String(text ?? "")
      .replace(/[^\d]/g, "")
      .slice(0, 4);
    setValue(cleaned);
    onQtyChange(itemId, cleaned);
  };

  return (
    <View style={styles.receiveQtyWrap}>
      <Text
        style={[styles.receiveQtyLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        Receive now (gal)
      </Text>
      <NativeTextInput
        value={value}
        onChangeText={handleChange}
        placeholder={String(remaining)}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
        inputMode="numeric"
        returnKeyType="done"
        blurOnSubmit={false}
        autoCorrect={false}
        autoComplete="off"
        selectTextOnFocus={false}
        style={[
          styles.receiveQtyInput,
          {
            borderColor: theme.colors.outline,
            color: theme.colors.onSurface,
            backgroundColor: theme.colors.surface,
          },
        ]}
      />
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
  detailResetKey,
  getItemNameForOrder,
  formatOrderColorsPreview,
}) {
  const theme = useTheme();

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => !receiveSubmitting && onClose()}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => !receiveSubmitting && onClose()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.centerWrap,
            step === "detail" && styles.centerWrapDetail,
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[styles.box, { backgroundColor: theme.colors.surface }]}
          >
            <IconButton
              icon="close"
              size={20}
              onPress={onClose}
              disabled={receiveSubmitting}
              style={styles.closeBtn}
            />

            {step === "list" && (
              <>
                <Text
                  variant="titleMedium"
                  style={[styles.title, { color: theme.colors.onSurface }]}
                >
                  Receive from PO
                </Text>
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
                    <Text
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        marginVertical: 12,
                      }}
                    >
                      No open purchase orders detected.
                    </Text>
                    <View style={styles.actions}>
                      <Button
                        mode="outlined"
                        onPress={() => onRefreshReceiveOrders?.(true)}
                        disabled={receiveOrdersLoading}
                      >
                        Reload
                      </Button>
                    </View>
                  </>
                ) : (
                  <ScrollView
                    style={styles.listScroll}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
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
                              borderColor: theme.colors.outline,
                              backgroundColor: pressed
                                ? theme.colors.surfaceVariant
                                : theme.colors.surface,
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
                  </ScrollView>
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
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      variant="titleMedium"
                      style={[
                        styles.title,
                        { color: theme.colors.onSurface, marginBottom: 0 },
                      ]}
                    >
                      PO{" "}
                      {selectedReceiveOrder.po_number || selectedReceiveOrder.id}
                    </Text>
                    {expLabel ? (
                      <Text
                        style={{
                          color: theme.colors.onSurfaceVariant,
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        Expected ~{expLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <ScrollView
                  key={String(detailResetKey)}
                  style={styles.detailScroll}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingBottom: 24 }}
                  showsVerticalScrollIndicator
                >
                  {(selectedReceiveOrder.lines || []).map((line, idx) => {
                    const itemId = String(
                      line.itemId ?? line.item_id ?? "",
                    ).trim();
                    const ordered = lineOrderedQty(line);
                    const received = lineReceivedQty(line);
                    const remaining = lineRemainingQty(line);
                    const name = getItemNameForOrder(itemId);
                    return (
                      <View
                        key={`${detailResetKey}-${itemId}-${idx}`}
                        style={[
                          styles.lineCard,
                          { borderColor: theme.colors.outline },
                        ]}
                      >
                        <Text
                          style={[
                            styles.lineName,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={2}
                        >
                          {name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: theme.colors.onSurfaceVariant,
                            marginBottom: 8,
                          }}
                        >
                          Ordered {ordered} gal · Received {received} gal
                          {remaining > 0
                            ? ` · ${remaining} remaining`
                            : " · Complete"}
                        </Text>
                        {(line.job_name || "").trim() ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.colors.onSurfaceVariant,
                              marginBottom: 8,
                            }}
                          >
                            Job: {(line.job_name || "").trim()}
                          </Text>
                        ) : null}
                        {remaining > 0 ? (
                          <ReceiveLineQtyInput
                            itemId={itemId}
                            initialQty={String(
                              lineReceiveQtysRef.current[itemId] ?? remaining,
                            )}
                            remaining={remaining}
                            onQtyChange={handleQtyChange}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.actions}>
                  <Button
                    mode="outlined"
                    onPress={onBackToList}
                    disabled={receiveSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    mode="contained"
                    onPress={onSubmit}
                    loading={receiveSubmitting}
                    disabled={receiveSubmitting}
                  >
                    Receive
                  </Button>
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
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  centerWrapDetail: {
    justifyContent: "flex-start",
    paddingTop: 32,
    paddingBottom: 24,
  },
  box: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    borderRadius: 12,
    padding: 18,
    elevation: 8,
    zIndex: 1,
  },
  closeBtn: {
    position: "absolute",
    right: 6,
    top: 6,
    zIndex: 2,
  },
  title: {
    fontWeight: "600",
    marginBottom: 8,
  },
  help: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  listScroll: {
    maxHeight: 320,
    marginBottom: 8,
  },
  orderRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  orderPo: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  orderMeta: {
    fontSize: 12,
    marginBottom: 6,
  },
  orderPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 8,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  detailScroll: {
    maxHeight: 360,
    marginBottom: 8,
  },
  lineCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  lineName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  receiveQtyWrap: {
    marginTop: 2,
  },
  receiveQtyLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  receiveQtyInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
    ...(Platform.OS === "web"
      ? { outlineStyle: "none", boxSizing: "border-box" }
      : null),
  },
});
