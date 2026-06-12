import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  Modal,
} from "react-native";
import {
  Card,
  Text,
  Button,
  useTheme,
  IconButton,
  TextInput,
} from "react-native-paper";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import OrderService from "../services/orderService";
import { openEmailWithOrderSpreadsheet } from "../utils/orderSpreadsheet";
import {
  getItemApMixingFlags,
  itemLeadTimePrefers7Days,
} from "../utils/poItemLabels";
import PageHeader from "../components/PageHeader";
import { DESKTOP_BREAKPOINT, useAppLayout } from "../utils/layout";
import {
  allowsHalfGallon,
  parseGallonQuantity,
  sanitizeGallonInput,
} from "../utils/gallonQuantity";
import {
  getMaterialTypeLabel,
  getMaterialTypeColor,
} from "../utils/materialTypes";

const PAGE_MAX_WIDTH = 1200;
const GRID_GAP = 12;
const SHELL_SIDEBAR_WIDE = 280;
const SHELL_SIDEBAR_NARROW = 240;

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];

function isCustomColorItem(item) {
  const t = (item?.type || "").toLowerCase();
  return CUSTOM_TYPES.includes(t);
}

function itemMatchesApMixingFilter(item, filter) {
  if (filter === "all") return true;
  const { hasAp, hasMixing } = getItemApMixingFlags(item);
  if (filter === "ap") return hasAp && !hasMixing;
  if (filter === "mixing") return hasMixing;
  return true;
}

/** AP-only vs mixing must not share one PO — same rule as AP / Mixing tabs. */
function lineIsApOnly(item) {
  const { hasAp, hasMixing } = getItemApMixingFlags(item);
  return hasAp && !hasMixing;
}

function lineIsMixing(item) {
  const { hasMixing } = getItemApMixingFlags(item);
  return hasMixing;
}

function getDefaultLeadTimeDays(lineItems, inventory) {
  const itemIds = (lineItems || [])
    .map((l) => String(l.itemId || "").trim())
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

function getMaterialTypeLabelAndColor(item, theme) {
  const t = item.type ? String(item.type).toLowerCase() : "";
  return {
    label: getMaterialTypeLabel(t),
    color: getMaterialTypeColor(t, theme),
  };
}

/** Column count from actual content width (main pane when sidebar is open). */
function gridColumnCount(contentWidth, isDesktop) {
  if (isDesktop) return contentWidth >= 360 ? 3 : 1;
  if (contentWidth >= 680) return 3;
  if (contentWidth >= 420) return 2;
  return 1;
}

function getContentWidth(windowWidth, embeddedInShell, isNarrowDesktop) {
  const scrollPad = 32;
  if (embeddedInShell) {
    const sidebar = isNarrowDesktop ? SHELL_SIDEBAR_NARROW : SHELL_SIDEBAR_WIDE;
    const shellChrome = 40 + sidebar + 20 + scrollPad;
    return Math.max(280, windowWidth - shellChrome);
  }
  return Math.max(280, Math.min(PAGE_MAX_WIDTH, windowWidth) - scrollPad);
}

/** Web desktop uses container % so three cards fit with even gaps. */
function getGridCellWidthStyle(numCols, colW) {
  if (Platform.OS === "web" && numCols > 1) {
    const gapTotal = GRID_GAP * (numCols - 1);
    return { width: `calc((100% - ${gapTotal}px) / ${numCols})` };
  }
  return { width: colW };
}

/** Non-AP bundles: paint with paint, stain with stain, etc. */
const TYPE_BUNDLE_ORDER = [
  "dye",
  "paint",
  "precat",
  "custom_paint",
  "stain",
  "custom_stain",
  "primer",
  "clear",
  "catalyst",
];

const TYPE_BUNDLE_TITLE = {
  paint: "Paint",
  precat: "PreCat",
  custom_paint: "Custom Paint",
  custom_stain: "Custom Stain",
  stain: "Stain",
  dye: "Dye",
  primer: "Primer",
  clear: "Clear",
  catalyst: "Catalyst",
  other: "Other",
};

function isApOnlyItem(item) {
  const { hasAp, hasMixing } = getItemApMixingFlags(item);
  return hasAp && !hasMixing;
}

function typeBundleKey(item) {
  const t = (item.type || "").toLowerCase().trim();
  return t || "other";
}

function titleForTypeKey(key) {
  if (TYPE_BUNDLE_TITLE[key]) return TYPE_BUNDLE_TITLE[key];
  return key
    .split("_")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ""))
    .join(" ");
}

function sortItemsAlphabetical(items) {
  return [...items].sort((a, b) => {
    const na = (a.name || String(a.id || "")).trim().toLowerCase();
    const nb = (b.name || String(b.id || "")).trim().toLowerCase();
    const c = na.localeCompare(nb);
    if (c !== 0) return c;
    return String(a.id || "").localeCompare(String(b.id || ""), undefined, {
      numeric: true,
    });
  });
}

function sortTypeBundleMap(byType) {
  const keys = [...byType.keys()];
  keys.sort((a, b) => {
    const ia = TYPE_BUNDLE_ORDER.indexOf(a);
    const ib = TYPE_BUNDLE_ORDER.indexOf(b);
    const aUn = ia === -1;
    const bUn = ib === -1;
    if (!aUn && !bUn) return ia - ib;
    if (!aUn && bUn) return -1;
    if (aUn && !bUn) return 1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({
    key: k,
    title: titleForTypeKey(k),
    items: sortItemsAlphabetical(byType.get(k)),
  }));
}

function buildGroupedBundles(filteredItems, filterTab) {
  if (!filteredItems.length) return [];

  if (filterTab === "ap") {
    return [
      {
        key: "__ap__",
        title: "AP",
        items: sortItemsAlphabetical(filteredItems),
      },
    ];
  }

  if (filterTab === "mixing") {
    const byType = new Map();
    for (const item of filteredItems) {
      const k = typeBundleKey(item);
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k).push(item);
    }
    return sortTypeBundleMap(byType);
  }

  const apItems = [];
  const byType = new Map();
  for (const item of filteredItems) {
    if (isApOnlyItem(item)) {
      apItems.push(item);
    } else {
      const k = typeBundleKey(item);
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k).push(item);
    }
  }
  const bundles = [];
  if (apItems.length) {
    bundles.push({
      key: "__ap__",
      title: "AP",
      items: sortItemsAlphabetical(apItems),
    });
  }
  bundles.push(...sortTypeBundleMap(byType));
  return bundles;
}

export default function PlaceOrderScreen({
  inventory = [],
  userName,
  onBack,
  onOrderCreated,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width: windowWidth } = useWindowDimensions();
  const { isNarrowDesktop } = useAppLayout();
  const contentWidth = useMemo(
    () => getContentWidth(windowWidth, embeddedInShell, isNarrowDesktop),
    [windowWidth, embeddedInShell, isNarrowDesktop],
  );
  const isDesktop = isWeb && windowWidth >= DESKTOP_BREAKPOINT;
  const numCols = gridColumnCount(contentWidth, isDesktop);

  const [filterTab, setFilterTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  /** itemId -> { qty: string, job: string } */
  const [lineState, setLineState] = useState({});
  /** Stable display order for cart lines */
  const [orderLineIds, setOrderLineIds] = useState([]);
  const [addModalItem, setAddModalItem] = useState(null);
  const [modalQty, setModalQty] = useState("");
  const [modalJob, setModalJob] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inventoryById = useMemo(() => {
    const map = new Map();
    for (const item of inventory || []) {
      if (item?.id != null) map.set(String(item.id), item);
    }
    return map;
  }, [inventory]);

  const removeFromOrder = useCallback((itemId) => {
    const id = String(itemId);
    setLineState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrderLineIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const filteredItems = useMemo(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    return (inventory || []).filter((item) => {
      if (!itemMatchesApMixingFilter(item, filterTab)) return false;
      if (!q) return true;
      const name = (item.name || "").toLowerCase();
      const id = String(item.id || "").toLowerCase();
      const ext = (item.external_code || "").trim().toLowerCase();
      return name.includes(q) || id.includes(q) || (ext && ext.includes(q));
    });
  }, [inventory, filterTab, searchQuery]);

  const groupedBundles = useMemo(
    () => buildGroupedBundles(filteredItems, filterTab),
    [filteredItems, filterTab],
  );

  const orderLines = useMemo(() => {
    return orderLineIds
      .map((id) => {
        const item = inventoryById.get(id);
        const st = lineState[id];
        if (!item || !st) return null;
        const parsed = parseGallonQuantity(st.qty, item.type);
        if (!parsed.ok) return null;
        return { id, item, qty: parsed.value, job: (st.job || "").trim() };
      })
      .filter(Boolean);
  }, [orderLineIds, lineState, inventoryById]);

  const orderTotalGal = useMemo(
    () => orderLines.reduce((sum, l) => sum + l.qty, 0),
    [orderLines],
  );

  const closeAddModal = useCallback(() => {
    setAddModalItem(null);
    setModalQty("");
    setModalJob("");
  }, []);

  const openAddModal = useCallback(
    (item) => {
      if (!item?.id) return;
      const id = String(item.id);
      const st = lineState[id] || {};
      setAddModalItem(item);
      setModalQty(st.qty ? String(st.qty) : "");
      setModalJob(st.job ? String(st.job) : "");
    },
    [lineState],
  );

  const confirmAddModal = useCallback(() => {
    if (!addModalItem?.id) return;
    const parsed = parseGallonQuantity(modalQty, addModalItem.type);
    if (!parsed.ok) {
      Alert.alert("Invalid quantity", parsed.error);
      return;
    }
    const qty = parsed.value;
    const custom = isCustomColorItem(addModalItem);
    const job = modalJob.trim();
    if (custom && !job) {
      Alert.alert("Job required", "Enter a job number for custom colors.");
      return;
    }
    const id = String(addModalItem.id);
    setLineState((prev) => ({
      ...prev,
      [id]: {
        qty: String(qty),
        job: custom ? job : "",
      },
    }));
    setOrderLineIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    closeAddModal();
  }, [addModalItem, modalQty, modalJob, closeAddModal]);

  const handleSubmit = async () => {
    const lines = [];
    for (const item of inventory) {
      const st = lineState[String(item.id)];
      if (!st) continue;
      const parsed = parseGallonQuantity(st.qty, item.type);
      if (!parsed.ok) continue;
      const qty = parsed.value;
      const job = (st.job || "").trim();
      lines.push({
        item,
        itemId: item.id,
        quantity: qty,
        job_name: isCustomColorItem(item) && job ? job : "",
      });
    }
    if (lines.length === 0) {
      Alert.alert(
        "Nothing to order",
        "Enter a quantity for at least one item.",
      );
      return;
    }

    const hasApLine = lines.some((l) => lineIsApOnly(l.item));
    const hasMixingLine = lines.some((l) => lineIsMixing(l.item));
    if (hasApLine && hasMixingLine) {
      const title = "Separate POs required";
      const msg =
        "AP items and mixing items must be on separate purchase orders. " +
        "Clear quantities for one group and submit, then place the other group as a second order—or use the AP and Mixing tabs so only one type is on screen.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`${title}\n\n${msg}`);
      } else {
        Alert.alert(title, msg);
      }
      return;
    }

    const leadDays = getDefaultLeadTimeDays(
      lines.map((l) => ({ itemId: l.itemId })),
      inventory,
    );
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const placedAt = `${y}-${m}-${d}`;

    const apiLines = lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      job_name: l.job_name || "",
    }));

    setSubmitting(true);
    try {
      const created = await OrderService.createOrder(
        "",
        leadDays,
        apiLines,
        userName,
        placedAt,
      );
      const orderId = created?.id ?? created?.order?.id;

      const mailResult = await openEmailWithOrderSpreadsheet({
        orderId,
        lines,
      });

      const orderRef = orderId != null ? `Order #${orderId}` : "Order";
      const MAX_LINES = 25;
      const lineSummaries = lines.map((l) => {
        const name = (l.item.name || l.item.id || "Item").trim();
        return `• ${name} — ${l.quantity} gal`;
      });
      const shown = lineSummaries.slice(0, MAX_LINES);
      const overflow =
        lines.length > MAX_LINES
          ? `\n… and ${lines.length - MAX_LINES} more line(s).`
          : "";
      const linesBlock = shown.join("\n") + overflow;

      let mailHint;
      if (mailResult.mode === "native_attachment") {
        mailHint =
          "Your mail app should open with an Excel workbook attached. Add who to email, then send.";
      } else if (mailResult.mode === "web_share") {
        mailHint =
          "Use the share sheet to send the workbook (e.g. Mail). Add recipients if needed.";
      } else if (mailResult.mode === "web_download_mailto") {
        mailHint =
          "The .xlsx file was downloaded and a mail draft should open. Attach the downloaded file if it is not already included.";
      } else if (
        mailResult.mode === "mailto_fallback" ||
        mailResult.mode === "mailto_no_cache"
      ) {
        mailHint =
          "A mail draft may open without an attachment. Add the order spreadsheet manually if your device did not offer the full mail composer.";
      } else {
        mailHint =
          "If mail did not open, check that a mail app is configured on this device.";
      }

      const successBody = [
        `${orderRef} was saved (no PO number yet).`,
        "",
        linesBlock,
        "",
        mailHint,
      ].join("\n");

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.setTimeout(() => {
          window.alert(`Order placed\n\n${successBody}`);
        }, 400);
      } else {
        Alert.alert("Order placed", successBody);
      }

      setLineState({});
      setOrderLineIds([]);
      closeAddModal();
      setSearchQuery("");
      onOrderCreated?.();
    } catch (e) {
      const errMsg = e.message || "Failed to create order.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`Error\n\n${errMsg}`);
      } else {
        Alert.alert("Error", errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const listBg = theme.colors.background;
  const cardBg = theme.colors.surfaceContainerHighest;

  const colW =
    numCols === 1
      ? contentWidth
      : (contentWidth - GRID_GAP * (numCols - 1)) / numCols;

  return (
    <View
      style={[
        styles.rootMax,
        embeddedInShell && styles.rootShell,
        { backgroundColor: listBg },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardInner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.stickyPanel,
            {
              backgroundColor: listBg,
              borderBottomColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <PageHeader
            title="Place Order"
            onBack={onBack}
            embeddedInShell={embeddedInShell}
          />
          <Text
            style={[styles.intro, { color: theme.colors.onSurfaceVariant }]}
          >
            Tap an item to enter quantity. Your order stays pinned above while
            you browse.
          </Text>

          <OutlinedSearchInput
            placeholder="Search name or code"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.filterSearch}
          />

          <View
            style={[
              styles.orderCart,
              {
                borderColor: theme.colors.outlineVariant,
                backgroundColor: cardBg,
              },
            ]}
          >
            <View style={styles.orderCartHeader}>
              <Text
                style={[styles.orderCartTitle, { color: theme.colors.onSurface }]}
              >
                Current order
              </Text>
              <Text
                style={[
                  styles.orderCartMeta,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {orderLines.length} line{orderLines.length === 1 ? "" : "s"} ·{" "}
                {orderTotalGal} gal
              </Text>
            </View>
            {orderLines.length === 0 ? (
              <Text
                style={[
                  styles.orderCartEmpty,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                No items yet — tap a card below to add.
              </Text>
            ) : (
              <ScrollView
                style={styles.orderCartScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {orderLines.map((line) => (
                  <View
                    key={line.id}
                    style={[
                      styles.orderLineRow,
                      { borderTopColor: theme.colors.outlineVariant },
                    ]}
                  >
                    <View style={styles.orderLineMain}>
                      <Text
                        style={[
                          styles.orderLineName,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {line.item.name || line.id}
                      </Text>
                      <Text
                        style={[
                          styles.orderLineSub,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                        numberOfLines={1}
                      >
                        {line.id}
                        {line.job ? ` · Job ${line.job}` : ""}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.orderLineQty,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {line.qty} gal
                    </Text>
                    <IconButton
                      icon="close"
                      size={18}
                      onPress={() => removeFromOrder(line.id)}
                      style={styles.orderLineRemove}
                    />
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.tabBar,
              {
                borderColor: theme.colors.outlineVariant,
                backgroundColor: theme.dark
                  ? theme.colors.surfaceContainerHighest
                  : theme.colors.surfaceContainerHigh ?? theme.colors.surface,
              },
            ]}
          >
            {(
              [
                { key: "all", label: "All", accent: theme.colors.primary },
                { key: "ap", label: "AP", accent: "#e65100" },
                { key: "mixing", label: "Mixing", accent: "#1565c0" },
              ]
            ).map(({ key, label, accent }, i) => {
              const selected = filterTab === key;
              const selBg =
                key === "all"
                  ? theme.dark
                    ? "rgba(187, 134, 252, 0.22)"
                    : (theme.colors.primaryContainer ?? "rgba(103, 80, 164, 0.16)")
                  : key === "ap"
                    ? theme.dark
                      ? "rgba(255, 152, 0, 0.22)"
                      : "rgba(230, 81, 0, 0.14)"
                    : theme.dark
                      ? "rgba(100, 181, 246, 0.22)"
                      : "rgba(21, 101, 192, 0.12)";
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setFilterTab(key)}
                  style={({ pressed }) => [
                    styles.tabCell,
                    ...(i > 0
                      ? [
                          styles.tabCellBorder,
                          { borderLeftColor: theme.colors.outlineVariant },
                        ]
                      : []),
                    selected && {
                      backgroundColor: selBg,
                      borderBottomWidth: 3,
                      borderBottomColor: accent,
                    },
                    !selected && {
                      borderBottomWidth: 3,
                      borderBottomColor: "transparent",
                    },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: selected ? accent : theme.colors.onSurfaceVariant,
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

          <Text
            style={[styles.browseHint, { color: theme.colors.onSurfaceVariant }]}
          >
            Tap a card to add or update quantity.
          </Text>

          {filteredItems.length === 0 ? (
            <View style={styles.emptyList}>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                No items match this filter/search.
              </Text>
            </View>
          ) : (
            groupedBundles.map((bundle, bundleIndex) => (
              <View
                key={bundle.key}
                style={[
                  styles.bundleSection,
                  bundleIndex > 0 && styles.bundleSectionSpaced,
                ]}
              >
                <Text
                  style={[
                    styles.bundleTitle,
                    {
                      color: theme.colors.onSurface,
                      borderBottomColor: theme.colors.outlineVariant,
                    },
                  ]}
                >
                  {bundle.title}
                </Text>
                <View style={styles.grid}>
                  {bundle.items.map((item) => {
                    const id = String(item.id);
                    const st = lineState[id] || {};
                    const orderQtyParsed = parseGallonQuantity(
                      st.qty,
                      item.type,
                    );
                    const orderQty = orderQtyParsed.ok ? orderQtyParsed.value : 0;
                    const inOrder = orderQty > 0;
                    const { label: typeLabel, color: typeColor } =
                      getMaterialTypeLabelAndColor(item, theme);
                    const onHand = item.quantity ?? 0;
                    return (
                      <Pressable
                        key={`${bundle.key}-${id}`}
                        onPress={() => openAddModal(item)}
                        style={[
                          styles.gridCell,
                          getGridCellWidthStyle(numCols, colW),
                        ]}
                      >
                        <Card
                          style={[
                            styles.itemCard,
                            {
                              backgroundColor: cardBg,
                              borderWidth: inOrder ? 2 : StyleSheet.hairlineWidth,
                              borderColor: inOrder
                                ? theme.colors.primary
                                : theme.colors.outlineVariant,
                            },
                          ]}
                        >
                          <Card.Content style={styles.itemCardContent}>
                            <View style={styles.cardTopRow}>
                              <Text
                                style={[
                                  styles.compactName,
                                  { color: theme.colors.onSurface },
                                ]}
                                numberOfLines={2}
                              >
                                {item.name || "Unnamed Item"}
                              </Text>
                              <View
                                style={[
                                  styles.stockBadge,
                                  {
                                    backgroundColor:
                                      theme.colors.primaryContainer ||
                                      "rgba(111,149,171,0.2)",
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.stockBadgeText,
                                    {
                                      color:
                                        theme.colors.onPrimaryContainer ||
                                        theme.colors.primary,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {onHand} gal
                                </Text>
                                <Text
                                  style={[
                                    styles.stockBadgeSub,
                                    {
                                      color: theme.colors.onSurfaceVariant,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  in stock
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.compactMeta} numberOfLines={1}>
                              <Text
                                style={{
                                  color: theme.colors.onSurfaceVariant,
                                  fontFamily:
                                    Platform.OS === "ios"
                                      ? "Menlo"
                                      : "monospace",
                                  fontSize: 11,
                                }}
                              >
                                ID: {item.id != null ? String(item.id) : "—"}
                              </Text>
                            </Text>
                            <View style={styles.cardFooterRow}>
                              {typeLabel ? (
                                <View
                                  style={[
                                    styles.typeBadge,
                                    {
                                      borderColor: typeColor,
                                      backgroundColor: theme.dark
                                        ? theme.colors.surfaceContainerHighest
                                        : "rgba(0,0,0,0.03)",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.typeBadgeText,
                                      { color: typeColor },
                                    ]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {typeLabel}
                                  </Text>
                                </View>
                              ) : (
                                <View />
                              )}
                              {inOrder ? (
                                <Text
                                  style={[
                                    styles.inOrderBadge,
                                    { color: theme.colors.primary },
                                  ]}
                                >
                                  Order: {orderQty} gal
                                </Text>
                              ) : null}
                            </View>
                          </Card.Content>
                        </Card>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              borderTopColor: theme.colors.outlineVariant,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <View style={styles.submitBtnWrap}>
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={submitting}
              disabled={submitting || orderLines.length === 0}
              icon="email"
              style={styles.submitBtn}
            >
              Submit Order
              {orderLines.length > 0
                ? ` (${orderLines.length} line${orderLines.length === 1 ? "" : "s"})`
                : ""}
            </Button>
          </View>
        </View>

        <Modal
          visible={!!addModalItem}
          transparent
          animationType="fade"
          onRequestClose={closeAddModal}
        >
          <Pressable style={styles.modalOverlay} onPress={closeAddModal}>
            <Pressable
              style={[
                styles.addModalContent,
                { backgroundColor: theme.colors.surface },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              {addModalItem ? (
                <>
                  <Text
                    style={[
                      styles.addModalTitle,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Add to order
                  </Text>
                  <Text
                    style={[
                      styles.addModalName,
                      { color: theme.colors.onSurface },
                    ]}
                    numberOfLines={2}
                  >
                    {addModalItem.name || "Unnamed item"}
                  </Text>
                  <Text
                    style={[
                      styles.addModalId,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    ID: {String(addModalItem.id)}
                  </Text>
                  <TextInput
                    mode="outlined"
                    label={
                      allowsHalfGallon(addModalItem.type)
                        ? "Quantity (gal, 0.5 ok)"
                        : "Quantity (gal)"
                    }
                    value={modalQty}
                    onChangeText={(t) =>
                      setModalQty(
                        sanitizeGallonInput(t, allowsHalfGallon(addModalItem.type)),
                      )
                    }
                    onSubmitEditing={
                      isCustomColorItem(addModalItem)
                        ? undefined
                        : confirmAddModal
                    }
                    keyboardType={
                      allowsHalfGallon(addModalItem.type)
                        ? "decimal-pad"
                        : "number-pad"
                    }
                    maxLength={5}
                    autoFocus
                    style={styles.addModalInput}
                  />
                  {isCustomColorItem(addModalItem) ? (
                    <TextInput
                      mode="outlined"
                      label="Job number"
                      value={modalJob}
                      onChangeText={setModalJob}
                      onSubmitEditing={confirmAddModal}
                      placeholder="#"
                      keyboardType="number-pad"
                      maxLength={10}
                      style={styles.addModalInput}
                    />
                  ) : null}
                  <View style={styles.addModalActions}>
                    <Button mode="outlined" onPress={closeAddModal}>
                      Cancel
                    </Button>
                    <Button mode="contained" onPress={confirmAddModal}>
                      Add to order
                    </Button>
                  </View>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootMax: {
    flex: 1,
    width: "100%",
    maxWidth: PAGE_MAX_WIDTH,
    alignSelf: "center",
  },
  rootShell: {
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  keyboardInner: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "web" ? 8 : 4,
  },
  title: { flex: 1, fontSize: 20 },
  titleCentered: { textAlign: "center" },
  headerRight: { width: 48 },
  stickyPanel: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    ...(Platform.OS === "web" ? { position: "sticky", top: 0 } : {}),
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    paddingTop: 12,
  },
  intro: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  filterSearch: {
    marginBottom: 10,
  },
  orderCart: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 4,
  },
  orderCartHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  orderCartTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  orderCartMeta: {
    fontSize: 12,
  },
  orderCartEmpty: {
    fontSize: 13,
    paddingBottom: 8,
    fontStyle: "italic",
  },
  orderCartScroll: {
    maxHeight: 140,
  },
  orderLineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  orderLineMain: {
    flex: 1,
    minWidth: 0,
  },
  orderLineName: {
    fontSize: 14,
    fontWeight: "600",
  },
  orderLineSub: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  orderLineQty: {
    fontSize: 14,
    fontWeight: "700",
  },
  orderLineRemove: {
    margin: 0,
  },
  browseHint: {
    fontSize: 12,
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 14,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabCell: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  tabCellBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  emptyList: { paddingVertical: 24, alignItems: "center" },
  bundleSection: {},
  bundleSectionSpaced: {
    marginTop: 20,
  },
  bundleTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    justifyContent: "flex-start",
    width: "100%",
    gap: GRID_GAP,
  },
  gridCell: {
    flexGrow: 0,
    flexShrink: 0,
  },
  itemCard: {
    width: "100%",
    elevation: 2,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 3px rgba(0,0,0,0.12)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.12,
          shadowRadius: 2,
        }),
  },
  itemCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  compactName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  stockBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  stockBadgeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  stockBadgeSub: {
    fontSize: 9,
    fontWeight: "500",
    marginTop: -1,
    textTransform: "lowercase",
  },
  compactMeta: {
    marginBottom: 6,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 28,
  },
  typeBadge: {
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "55%",
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inOrderBadge: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /** Half of footer inner width; button fills it so it reads as a wide bar, not a tiny pill. */
  submitBtnWrap: {
    width: "50%",
    alignSelf: "center",
  },
  submitBtn: {
    width: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  addModalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  addModalName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  addModalId: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 16,
  },
  addModalInput: {
    marginBottom: 12,
  },
  addModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
});
