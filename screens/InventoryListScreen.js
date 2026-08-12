import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Platform,
  useWindowDimensions,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import ReceivePoModal from "../components/ReceivePoModal";
import PageHeader from "../components/PageHeader";
import MetricStrip from "../components/MetricStrip";
import ToolbarCard from "../components/ToolbarCard";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import PullToRefresh from "../components/PullToRefresh";
import ItemActionPopover from "../components/ItemActionPopover";
import { formatItemLocationDisplay } from "../utils/customStacks";
import {
  Card,
  Text,
  useTheme,
  IconButton,
  ActivityIndicator,
  DataTable,
  Chip,
  Title,
  TextInput,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import AuditService from "../services/auditService";
import OrderService from "../services/orderService";
import InventoryService from "../services/inventoryService";
import { parseGallonQuantity } from "../utils/gallonQuantity";
import {
  getMaterialTypeLabel,
  getMaterialTypeColor,
} from "../utils/materialTypes";
import showToast from "../utils/showToast";
import { nestedSurfaceColor } from "../utils/themeColors";
import ScrollFrame, { EdgeFade } from "../components/ScrollFrame";
import {
  colors as kitColors,
  space,
  radius,
  type as kitType,
  fontFamily,
  mutedTextColor,
  dimTextColor,
} from "../theme/tokens";
import { AppEmptyState, AppBadge } from "../components/ui";

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];
const STANDARD_TYPES = [
  "paint",
  "precat",
  "primer",
  "clear",
  "catalyst",
  "stain",
  "dye",
];

function isCustomType(item) {
  return CUSTOM_TYPES.includes((item.type || "").toLowerCase());
}

function formatRecycleDateDisplay(recycleDate) {
  const raw = recycleDate != null ? String(recycleDate).trim() : "";
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isRecycleDue(item) {
  const rd = item.recycle_date;
  if (!rd || (item.quantity || 0) <= 0) return false;
  if (!isCustomType(item)) return false;
  const d = new Date(rd);
  if (isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

/** Show recycle date on inventory cards only when due within the next month (or overdue). */
function isRecycleWithinOneMonth(item) {
  const rd = item.recycle_date;
  if (!rd || !isCustomType(item)) return false;
  const d = new Date(rd);
  if (isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneMonthOut = new Date(today);
  oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
  return d.getTime() <= oneMonthOut.getTime();
}

function RecycleDateText({ item, style, dueStyle }) {
  if (!isRecycleWithinOneMonth(item)) return null;
  const formatted = formatRecycleDateDisplay(item.recycle_date);
  if (!formatted) return null;
  const overdue = isRecycleDue(item);
  return (
    <Text style={[style, dueStyle]}>
      {overdue ? "Recycle due: " : "Recycle: "}
      {formatted}
    </Text>
  );
}

/** Always-red recycle date under the item name (custom inventory view) — past due only. */
function RecycleDateUnderName({ item, style }) {
  if (!isRecycleDue(item)) return null;
  const formatted = formatRecycleDateDisplay(item.recycle_date);
  if (!formatted) return null;
  return (
    <Text
      style={[
        {
          color: kitColors.semantic.recycleDueDate,
          fontWeight: "600",
        },
        style,
      ]}
      numberOfLines={1}
    >
      Recycle: {formatted}
    </Text>
  );
}

function getItemJobs(item, onOrderSummary) {
  if (!item || !onOrderSummary) return [];
  const orderInfo =
    onOrderSummary[item.id] || onOrderSummary[String(item.id ?? "")];
  return Array.isArray(orderInfo?.jobs) ? orderInfo.jobs : [];
}

function pressAnchorFromEvent(event, fallbackWidth) {
  const ne = event?.nativeEvent || {};
  const pageX =
    ne.pageX ??
    ne.clientX ??
    (typeof fallbackWidth === "number" ? fallbackWidth / 2 : 0);
  const pageY = ne.pageY ?? ne.clientY ?? 120;
  return { pageX, pageY };
}

/** Matches App.js handleScanResult normalization for comparing typed/scanned IDs to inventory. */
function normalizeScanLookupKey(itemId) {
  const raw = String(itemId ?? "")
    .trim()
    .toUpperCase();
  if (!raw) return null;
  if (/^\d{1,4}$/.test(raw)) return raw.padStart(4, "0");
  if (/^H66[A-Z]{3}\d{5}$/.test(raw)) return raw;
  return raw;
}

function inventoryMatchesScanQuery(inventory, query) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return false;
  const key = normalizeScanLookupKey(trimmed);
  const inv = Array.isArray(inventory) ? inventory : [];
  for (const item of inv) {
    const idKey = normalizeScanLookupKey(item.id);
    if (idKey && key && idKey === key) return true;
    const ext =
      item.external_code != null ? String(item.external_code).trim() : "";
    if (ext && ext.toUpperCase() === trimmed.toUpperCase()) return true;
  }
  return false;
}

/** Enter in search: scan/check-in-out only when this looks like a material ID/barcode, not a name search. */
function shouldSubmitSearchAsScan(query, inventory) {
  const t = query.trim();
  if (t.length < 3) return false;
  if (inventoryMatchesScanQuery(inventory, t)) return true;
  if (/^[a-zA-Z]+$/.test(t)) return false;
  return true;
}

/** Parse order line qty from API (snake_case or camelCase, string or number). */
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

export default function InventoryListScreen({
  inventory,
  minQuantity = 30,
  onItemSelect,
  onViewItemHistory,
  onEditItem,
  onBack,
  onRefresh,
  isRefreshing = false,
  isAdmin = false,
  onOrderSummary = {},
  onRefreshOnOrderSummary,
  recycleDueFilter = false,
  onClearRecycleDueFilter,
  initialStockFilter = null,
  onClearStockFilter,
  auditLogs: auditLogsFromApp,
  auditLogsLoaded: auditLogsLoadedFromApp = false,
  onScanCode,
  actorName = null,
  receiveOrdersList = [],
  receiveOrdersLoaded = false,
  receiveOrdersLoading = false,
  onRefreshReceiveOrders,
  onReceivePoCompleted,
  initialViewMode = "inventory",
  initialBookFilter,
  initialScrollOffset = 0,
  onViewStateChange,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const ink = useMemo(
    () => ({
      muted: mutedTextColor(theme),
      dim: dimTextColor(theme),
      primary: theme.colors.primary,
    }),
    [theme],
  );
  const isWeb = Platform.OS === "web";
  const { width, height } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  // Treat "mobile landscape" as tablet-size or larger only, so small phones
  // don't flip layouts when the keyboard changes height.
  const isMobileLandscape = !isDesktop && width > height && width >= 600;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name"); // 'name', 'quantity', 'lastScanned', 'location'
  const [sortOrder, setSortOrder] = useState("asc"); // 'asc', 'desc'
  const [listOrderMode, setListOrderMode] = useState("alphabetical"); // 'alphabetical' | 'trueOrder'
  const [stockFilter, setStockFilter] = useState(null); // null | 'inStock' | 'lowStock' | 'outOfStock'
  const [apOnly, setApOnly] = useState(false);
  /** Admin: when true, inventory list includes custom colors at 0 gal. */
  const [showZeroCustoms, setShowZeroCustoms] = useState(false);
  const [auditLogsLocal, setAuditLogsLocal] = useState([]);
  const useCachedAudit = auditLogsLoadedFromApp;
  const auditLogs = useCachedAudit ? auditLogsFromApp : auditLogsLocal;
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);
  const [galPeriodWeek, setGalPeriodWeek] = useState(true); // true = show week, false = show month (toggle one card)
  const [staleDays, setStaleDays] = useState(30);
  const [staleListOpen, setStaleListOpen] = useState(false);
  const [totalValueListOpen, setTotalValueListOpen] = useState(false);
  const [recycleDueOnly, setRecycleDueOnly] = useState(false);
  const [colorPreviewItem, setColorPreviewItem] = useState(null);
  /** Mobile: item keys that currently show their color_label instead of name. */
  const [revealedColorLabels, setRevealedColorLabels] = useState(() => new Set());
  const [itemActionMenu, setItemActionMenu] = useState(null); // { item, pageX, pageY }
  const [copiedItemId, setCopiedItemId] = useState(null);
  const copiedItemIdTimerRef = useRef(null);
  const [viewMode, setViewMode] = useState(initialViewMode || "inventory"); // 'inventory' | 'colorBook' — default to standard inventory
  const [bookFilter, setBookFilter] = useState(
    initialBookFilter || (recycleDueFilter ? "custom" : "standard"),
  ); // 'standard' | 'custom'
  const [receivePoVisible, setReceivePoVisible] = useState(false);
  const [receivePoStep, setReceivePoStep] = useState("list"); // 'list' | 'detail'
  const [selectedReceiveOrder, setSelectedReceiveOrder] = useState(null);
  // Keep receive quantities out of React state so typing doesn't re-render the whole screen (prevents focus glitches).
  const lineReceiveQtysRef = useRef({});
  const [receiveDetailKey, setReceiveDetailKey] = useState(0);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset || 0);
  const listRef = useRef(null);
  const hasRestoredScrollRef = useRef(false);
  const searchInputRef = useRef(null);
  const receivePoAnchorRef = useRef(null);
  const tableScrollMetricsRef = useRef({ contentH: 0, layoutH: 0 });
  const [tableScrollFades, setTableScrollFades] = useState({
    top: false,
    bottom: false,
  });
  const mobileListMetricsRef = useRef({ contentH: 0, layoutH: 0 });
  const [mobileListFades, setMobileListFades] = useState({
    top: false,
    bottom: false,
  });
  const [listAtTop, setListAtTop] = useState(true);

  const syncScrollFades = (setter, y, contentH, layoutH) => {
    const canScroll = contentH > layoutH + 2;
    setter({
      top: canScroll && y > 2,
      bottom: canScroll && y + layoutH < contentH - 2,
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Keep in sync when shell top-bar controls change view mode / book filter.
  useEffect(() => {
    if (initialViewMode != null) setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    if (initialBookFilter != null) setBookFilter(initialBookFilter);
  }, [initialBookFilter]);

  useEffect(() => {
    return () => {
      if (copiedItemIdTimerRef.current) {
        clearTimeout(copiedItemIdTimerRef.current);
      }
    };
  }, []);

  const notifyViewState = (next = {}) => {
    if (!onViewStateChange) return;
    onViewStateChange({
      viewMode,
      bookFilter,
      scrollOffset,
      ...next,
    });
  };

  const changeViewMode = (next) => {
    setViewMode(next);
    notifyViewState({ viewMode: next });
  };

  const changeBookFilter = (next) => {
    const value =
      typeof next === "function" ? next(bookFilter) : next;
    setBookFilter(value);
    notifyViewState({ bookFilter: value });
  };

  const toggleBookFilter = () => {
    changeBookFilter((prev) =>
      prev === "standard" ? "custom" : "standard",
    );
  };

  const toggleViewMode = () => {
    changeViewMode(viewMode === "colorBook" ? "inventory" : "colorBook");
  };

  const isCustomInventoryView =
    viewMode === "inventory" && bookFilter === "custom";

  const openItemActionMenu = (item, event) => {
    const anchor = pressAnchorFromEvent(event, width);
    setItemActionMenu({
      item,
      showRelatedJobs: isCustomInventoryView,
      ...anchor,
    });
  };

  const handleItemActivate = (item, event) => {
    // Custom view: always use caret popup (jobs + transactions; edit if admin).
    // Standard view: admin gets caret popup (transactions + edit); others go to history.
    if (isCustomInventoryView || isAdmin) {
      openItemActionMenu(item, event);
      return;
    }
    if (onViewItemHistory) onViewItemHistory(item);
    else onItemSelect?.(item);
  };

  const handleSearchSubmit = () => {
    if (!onScanCode) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    if (!shouldSubmitSearchAsScan(trimmed, inventory)) return;
    onScanCode(trimmed);
    setSearchQuery("");
    notifyViewState();
  };

  const getItemNameForOrder = (itemId) => {
    const id = String(itemId ?? "").trim();
    const inv = inventory.find((i) => String(i.id) === id);
    return inv?.name || `ID ${id}`;
  };

  const getItemCodeForOrder = (itemId) => {
    const id = String(itemId ?? "").trim();
    if (!id) return "";
    const inv = inventory.find((i) => String(i.id) === id);
    const ext =
      inv?.external_code != null ? String(inv.external_code).trim() : "";
    if (ext) return `${id} · ${ext}`;
    return id;
  };

  const getItemTypeForOrder = (itemId) => {
    const id = String(itemId ?? "").trim();
    const inv = inventory.find((i) => String(i.id) === id);
    return inv?.type ? String(inv.type).toLowerCase() : "";
  };

  const formatOrderColorsPreview = (order) => {
    const lines = (order?.lines || []).filter((l) => {
      const ordered = Number(l?.quantity ?? l?.qty) || 0;
      const receivedRaw = l?.received_quantity ?? l?.receivedQuantity;
      const received =
        receivedRaw === undefined ||
        receivedRaw === null ||
        receivedRaw === ""
          ? 0
          : Number(receivedRaw) || 0;
      return ordered - received > 0;
    });
    const names = lines.map((l) => getItemNameForOrder(l.itemId ?? l.item_id));
    if (names.length === 0) return "No open lines";
    if (names.length <= 3) return names.join(" · ");
    return `${names.slice(0, 3).join(" · ")} · +${names.length - 3} more`;
  };

  const openReceivePoModal = () => {
    setReceivePoVisible(true);
    setReceivePoStep("list");
    setSelectedReceiveOrder(null);
    lineReceiveQtysRef.current = {};
    setReceiveDetailKey((k) => k + 1);
    onRefreshReceiveOrders?.(false);
  };

  const invBtnContentStyle = styles.viewModeButtonContent;
  const invBtnLabelStyle = styles.viewModeButtonLabel;

  const closeReceivePoModal = () => {
    if (receiveSubmitting) return;
    setReceivePoVisible(false);
    setReceivePoStep("list");
    setSelectedReceiveOrder(null);
    lineReceiveQtysRef.current = {};
    setReceiveDetailKey((k) => k + 1);
  };

  const selectOrderForReceive = (order) => {
    const init = {};
    for (const line of order.lines || []) {
      const itemId = String(line.itemId ?? line.item_id ?? "").trim();
      if (!itemId) continue;
      const remaining = lineRemainingQty(line);
      if (remaining > 0) init[itemId] = String(remaining);
    }
    lineReceiveQtysRef.current = init;
    // Force uncontrolled inputs to re-mount with new defaults.
    setReceiveDetailKey((k) => k + 1);
    setSelectedReceiveOrder(order);
    setReceivePoStep("detail");
  };

  const handleReceivePoSubmit = async () => {
    if (!selectedReceiveOrder || !actorName) return;
    setReceiveSubmitting(true);
    try {
      const pending = [];
      for (const line of selectedReceiveOrder.lines || []) {
        const itemId = String(line.itemId ?? line.item_id ?? "").trim();
        if (!itemId) continue;
        const remaining = lineRemainingQty(line);
        if (remaining <= 0) continue;
        const raw = lineReceiveQtysRef.current[itemId];
        if (raw === undefined || raw === null || String(raw).trim() === "") {
          continue;
        }
        const parsed = parseGallonQuantity(raw, getItemTypeForOrder(itemId), {
          allowZero: true,
        });
        if (!parsed.ok) {
          Alert.alert(
            "Invalid quantity",
            `${getItemNameForOrder(itemId)}: ${parsed.error}`,
          );
          return;
        }
        const qty = parsed.value;
        if (qty <= 0) continue;
        if (qty > remaining) {
          Alert.alert(
            "Invalid quantity",
            `${getItemNameForOrder(itemId)}: you can receive at most ${remaining} gal remaining on this line.`,
          );
          return;
        }
        const currentItem = inventory.find(
          (i) => String(i.id) === String(itemId),
        );
        pending.push({ itemId, qty, currentItem });
      }
      if (pending.length === 0) {
        closeReceivePoModal();
        return;
      }

      const results = await Promise.all(
        pending.map(async ({ itemId, qty, currentItem }) => {
          const receiveResult = await OrderService.receiveOrderLine(
            selectedReceiveOrder.id,
            itemId,
            qty,
          );
          if (!receiveResult.success) {
            throw new Error(
              receiveResult.error ||
                `Failed to record PO receive for ${getItemNameForOrder(itemId)}`,
            );
          }
          const result = await InventoryService.updateQuantity(
            itemId,
            qty,
            actorName,
            "receiving",
            currentItem ? { currentItem } : {},
          );
          if (!result.success) {
            throw new Error(
              result.error ||
                `Failed to update inventory for ${getItemNameForOrder(itemId)}`,
            );
          }
          AuditService.log({
            type: "receiving",
            user: actorName,
            itemId,
            quantity: qty,
            newQuantity: result.item?.quantity,
            orderId: selectedReceiveOrder.id,
          });
          return qty;
        }),
      );

      const totalGal = results.reduce((sum, q) => sum + q, 0);
      const lineCount = results.length;
      const po = selectedReceiveOrder.po_number || selectedReceiveOrder.id;
      closeReceivePoModal();
      // Refresh inventory + warm caches; don't block the success alert.
      Promise.resolve(onRefresh?.()).catch(() => {});
      onReceivePoCompleted?.();
      Alert.alert(
        "Receiving recorded",
        `Received ${totalGal} gal on ${lineCount} line(s) for PO ${po}.`,
      );
    } catch (e) {
      Alert.alert("Error", e?.message || "Failed to receive.");
    } finally {
      setReceiveSubmitting(false);
    }
  };

  // Restore scroll position once when mounting
  useEffect(() => {
    if (
      !hasRestoredScrollRef.current &&
      listRef.current &&
      initialScrollOffset > 0
    ) {
      listRef.current.scrollToOffset({
        offset: initialScrollOffset,
        animated: false,
      });
      hasRestoredScrollRef.current = true;
    }
  }, [initialScrollOffset]);

  useEffect(() => {
    if (useCachedAudit) return;
    let cancelled = false;
    (async () => {
      try {
        const logs = await AuditService.list(1000);
        if (!cancelled) setAuditLogsLocal(logs);
      } catch (e) {
        if (!cancelled) console.error("InventoryListScreen audit load:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useCachedAudit]);

  useEffect(() => {
    if (recycleDueFilter) {
      changeBookFilter("custom");
    }
  }, [recycleDueFilter]);

  useEffect(() => {
    if (initialStockFilter) {
      setStockFilter(initialStockFilter);
    }
  }, [initialStockFilter]);

  const handleBack = () => {
    setRecycleDueOnly(false);
    onClearRecycleDueFilter?.();
    onClearStockFilter?.();
    onBack();
  };

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalGallons = inventory.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
    const lowStockCount = inventory.filter(
      (item) => (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30),
    ).length;
    // Out of stock: standard items only — customs don't matter when empty.
    const outOfStockCount = inventory.filter((item) => {
      const t = (item.type || "").toLowerCase();
      if (CUSTOM_TYPES.includes(t)) return false;
      return (item.quantity || 0) === 0;
    }).length;

    const totalValue = inventory.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return sum + qty * price;
    }, 0);

    const totalValueItems = inventory
      .map((item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        return {
          id: item.id,
          name: item.name,
          qty,
          price,
          value: qty * price,
        };
      })
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);

    const recycleDueItems = inventory.filter(isRecycleDue);
    const recycleDueCount = recycleDueItems.length;

    // Group by location
    const byLocation = {};
    inventory.forEach((item) => {
      const loc =
        formatItemLocationDisplay(item) || item.location || "Unspecified";
      byLocation[loc] = (byLocation[loc] || 0) + 1;
    });
    const topLocations = Object.entries(byLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalGallons,
      lowStockCount,
      outOfStockCount,
      totalValue,
      totalValueItems,
      recycleDueCount,
      recycleDueItems,
      topLocations,
    };
  }, [inventory, minQuantity]);

  const notScannedItems = useMemo(() => {
    const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    return inventory
      .filter((item) => {
        if (!item.lastScanned) return true;
        return new Date(item.lastScanned).getTime() < cutoff;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        lastScanned: item.lastScanned || null,
        lastScannedMs: item.lastScanned
          ? new Date(item.lastScanned).getTime()
          : 0,
        quantity: item.quantity ?? 0,
      }))
      .sort((a, b) => {
        if (!a.lastScanned && !b.lastScanned)
          return String(a.id).localeCompare(String(b.id));
        if (!a.lastScanned) return -1;
        if (!b.lastScanned) return 1;
        return a.lastScannedMs - b.lastScannedMs;
      });
  }, [inventory, staleDays]);

  const notScannedCount = notScannedItems.length;

  const effectiveRecycleDue = recycleDueFilter || recycleDueOnly;

  const thisWeekRange = useMemo(() => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      start: sunday.getTime(),
      end: saturday.getTime(),
      label: `${fmt(sunday)}–${fmt(saturday)}`,
    };
  }, []);

  const thisMonthRange = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const label = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return { start: first.getTime(), end: last.getTime(), label };
  }, []);

  const periodRange = useMemo(() => {
    return mostUsedByWeek ? thisWeekRange : thisMonthRange;
  }, [mostUsedByWeek, thisWeekRange, thisMonthRange]);

  const getCheckOutQty = (log) => {
    if (!log.details) return 0;
    const q = log.details.quantityChange ?? log.details._quantityChange;
    return typeof q === "number" ? Math.abs(q) : 0;
  };
  const isCheckOut = (log) =>
    log.action === "check_out" ||
    (log.action === "update" && log.details?._actionType === "check_out");

  const gallonsUsedThisWeek = useMemo(() => {
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      total += getCheckOutQty(log);
    });
    return total;
  }, [auditLogs, thisWeekRange]);

  const gallonsUsedThisMonth = useMemo(() => {
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisMonthRange.start || t > thisMonthRange.end) return;
      total += getCheckOutQty(log);
    });
    return total;
  }, [auditLogs, thisMonthRange]);

  const mostUsedColor = useMemo(() => {
    const { start, end } = periodRange;
    const galByItemId = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < start || t > end) return;
      const qty = getCheckOutQty(log);
      if (qty <= 0) return;
      galByItemId[log.itemId] = (galByItemId[log.itemId] || 0) + qty;
    });
    let bestItemId = null;
    let bestGal = 0;
    Object.entries(galByItemId).forEach(([id, gal]) => {
      if (gal > bestGal) {
        bestGal = gal;
        bestItemId = id;
      }
    });
    if (!bestItemId) return null;
    const item = inventory.find((i) => i.id === bestItemId);
    return {
      name: item?.name || bestItemId,
      totalGal: bestGal,
      periodLabel: periodRange.label,
      isWeek: mostUsedByWeek,
    };
  }, [auditLogs, inventory, mostUsedByWeek, periodRange]);

  // Latest audit log per item (for "Last Action" column); logs are timestamp DESC
  const lastLogByItemId = useMemo(() => {
    const map = {};
    auditLogs.forEach((log) => {
      const key = log.itemId != null ? String(log.itemId) : "";
      if (!key || map[key] != null) return;
      map[key] = log;
    });
    return map;
  }, [auditLogs]);

  const getValidHex = (raw) => {
    if (!raw || typeof raw !== "string") return null;
    const s = raw.trim().replace(/^#/, "");
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
  };

  const handleCopyItemId = async (rawId, event, itemName) => {
    event?.stopPropagation?.();
    if (typeof event?.preventDefault === "function") event.preventDefault();
    const id = String(rawId ?? "").trim();
    if (!id || id === "N/A" || id === "—") return;
    try {
      await Clipboard.setStringAsync(id);
      setCopiedItemId(id);
      if (copiedItemIdTimerRef.current) {
        clearTimeout(copiedItemIdTimerRef.current);
      }
      copiedItemIdTimerRef.current = setTimeout(() => {
        setCopiedItemId(null);
        copiedItemIdTimerRef.current = null;
      }, 2000);
      const name = String(itemName || "").trim() || "Item";
      showToast({
        title: "Copied",
        message: `${name} · ID ${id} copied.`,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Copy failed",
        message: e?.message || "Could not copy ID.",
      });
    }
  };

  const renderCopyableItemId = ({
    id,
    name,
    prefix = false,
    textStyle,
    numberOfLines,
    hitStyle,
  }) => {
    const idStr = id != null && id !== "" ? String(id) : "";
    const display = idStr || "N/A";
    const copied = idStr && copiedItemId === idStr;
    const flatStyle = StyleSheet.flatten(textStyle) || {};
    const itemName = String(name || "").trim();
    const showCopiedBelow = isDesktop;
    const idLabel = prefix ? `ID: ${display}` : display;
    return (
      <Pressable
        onPress={(e) => handleCopyItemId(idStr || display, e, itemName)}
        onPressIn={(e) => e?.stopPropagation?.()}
        hitSlop={4}
        style={[styles.copyableIdHit, hitStyle]}
        accessibilityRole="button"
        accessibilityLabel={
          display !== "N/A" && display !== "—"
            ? `Copy item ID ${display}${itemName ? ` for ${itemName}` : ""}`
            : "Item ID unavailable"
        }
      >
        <Text
          numberOfLines={numberOfLines}
          style={[
            flatStyle,
            {
              color: flatStyle.color || theme.colors.onSurfaceVariant,
              fontWeight: "700",
            },
          ]}
        >
          {idLabel}
          {copied && !showCopiedBelow ? (
            <Text
              style={{
                fontWeight: "400",
                fontStyle: "italic",
                color: theme.colors.primary,
              }}
            >
              {" · Copied"}
            </Text>
          ) : null}
        </Text>
        {copied && showCopiedBelow ? (
          <Text
            style={[
              styles.copiedHint,
              { color: theme.colors.primary },
            ]}
          >
            Copied
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const getActionLabel = (log) => {
    if (!log) return null;
    const a = log.action;
    const d = log.details;
    if (a === "check_in") return "Checked in";
    if (a === "check_out") return "Checked out";
    if (a === "receiving" || (a === "update" && d?._actionType === "receiving"))
      return "Receiving";
    if (a === "recycled" || (a === "update" && d?._actionType === "recycled"))
      return "Recycled";
    if (a === "update" && d?._actionType === "check_in") return "Checked in";
    if (a === "update" && d?._actionType === "check_out") return "Checked out";
    if (a === "add") return "Added";
    if (a === "delete") return "Deleted";
    return "Updated";
  };

  // Filter and sort inventory (search + optional stock filter + book filter + recycle due)
  const filteredAndSortedInventory = useMemo(() => {
    const min = minQuantity ?? 30;
    let filtered = inventory.filter((item) => {
      const query = searchQuery.toLowerCase();
      const locationDisplay = formatItemLocationDisplay(item).toLowerCase();
      const matchesSearch =
        item.name?.toLowerCase().includes(query) ||
        item.id?.toString().toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query) ||
        locationDisplay.includes(query) ||
        item.type?.toLowerCase().includes(query) ||
        String(item.color_label || "")
          .toLowerCase()
          .includes(query);
      if (!matchesSearch) return false;
      if (isAdmin && apOnly) {
        // AP-only: is_mixing=false
        if (item.is_mixing !== false) return false;
      }
      const qty = item.quantity || 0;
      if (stockFilter === "outOfStock") {
        const itemType = (item.type || "").toLowerCase();
        if (CUSTOM_TYPES.includes(itemType)) return false;
        return qty === 0;
      }
      if (stockFilter === "inStock")
        return qty > 0 && qty >= (item.minQuantity ?? min);
      if (stockFilter === "lowStock")
        return qty > 0 && qty < (item.minQuantity ?? min);
      const itemType = (item.type || "").toLowerCase();
      if (bookFilter === "standard" && CUSTOM_TYPES.includes(itemType))
        return false;
      if (bookFilter === "custom" && !CUSTOM_TYPES.includes(itemType))
        return false;
      // Custom inventory: hide empty cans unless admin opts into full list.
      if (
        !showZeroCustoms &&
        CUSTOM_TYPES.includes(itemType) &&
        qty === 0
      ) {
        return false;
      }
      if (effectiveRecycleDue && !isRecycleDue(item)) return false;
      return true;
    });

    // Sort
    if (listOrderMode === "trueOrder") {
      filtered.sort((a, b) => {
        const aIsPaint = (a.type || "").toLowerCase() === "paint";
        const bIsPaint = (b.type || "").toLowerCase() === "paint";
        // Only paint type uses display_order; custom/stains/etc. sort by name
        if (aIsPaint && bIsPaint) {
          const aOrder =
            a.display_order != null && !isNaN(Number(a.display_order))
              ? Number(a.display_order)
              : 999999;
          const bOrder =
            b.display_order != null && !isNaN(Number(b.display_order))
              ? Number(b.display_order)
              : 999999;
          if (aOrder !== bOrder) return aOrder - bOrder;
        }
        if (aIsPaint && !bIsPaint) return -1;
        if (!aIsPaint && bIsPaint) return 1;
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        return aName.localeCompare(bName);
      });
    } else {
      filtered.sort((a, b) => {
        let aVal, bVal;
        switch (sortBy) {
          case "quantity":
            aVal = a.quantity || 0;
            bVal = b.quantity || 0;
            break;
          case "lastScanned":
            aVal = a.lastScanned ? new Date(a.lastScanned).getTime() : 0;
            bVal = b.lastScanned ? new Date(b.lastScanned).getTime() : 0;
            break;
          case "location":
            aVal = (a.location || "").toLowerCase();
            bVal = (b.location || "").toLowerCase();
            break;
          default: // 'name'
            aVal = (a.name || "").toLowerCase();
            bVal = (b.name || "").toLowerCase();
        }

        if (sortOrder === "asc") {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
      });
    }

    return filtered;
  }, [
    inventory,
    searchQuery,
    sortBy,
    sortOrder,
    stockFilter,
    minQuantity,
    listOrderMode,
    bookFilter,
    effectiveRecycleDue,
    isAdmin,
    apOnly,
    showZeroCustoms,
  ]);

  // Paint/custom items with valid hex for color book grid (filtered by bookFilter)
  const colorBookItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const typeLower = (t) => (t || "").toLowerCase();
    return inventory
      .filter((item) => {
        if (!getValidHex(item.hex_color)) return false;
        const t = typeLower(item.type);
        if (bookFilter === "standard" && t !== "paint") return false;
        if (bookFilter === "custom" && !CUSTOM_TYPES.includes(t)) return false;
        if (effectiveRecycleDue && !isRecycleDue(item)) return false;
        if (!query) return true;
        return (
          item.name?.toLowerCase().includes(query) ||
          item.id?.toString().toLowerCase().includes(query) ||
          String(item.color_label || "")
            .toLowerCase()
            .includes(query)
        );
      })
      .sort((a, b) =>
        (a.name || "")
          .toLowerCase()
          .localeCompare((b.name || "").toLowerCase()),
      );
  }, [inventory, searchQuery, bookFilter, effectiveRecycleDue]);

  const renderColorCard = ({ item, desktop = false }) => {
    const bgHex = getValidHex(item.hex_color) || "#e0e0e0";
    const name = item.name || "Unnamed";
    const colorLabel = String(item.color_label || "").trim();
    return (
      <Pressable
        style={
          desktop ? styles.colorBookCardWrapDesktop : styles.colorBookCardWrap
        }
        onPress={() => setColorPreviewItem(item)}
      >
        <View style={[styles.colorBookCard, { backgroundColor: bgHex }]} />
        <Text
          style={[styles.colorBookCardName, { color: theme.colors.onSurface }]}
          numberOfLines={2}
        >
          {name}
        </Text>
        {colorLabel ? (
          <Text
            style={[
              styles.colorBookCardLabel,
              { color: theme.colors.onSurfaceVariant },
            ]}
            numberOfLines={2}
          >
            {colorLabel}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const ColorPreviewModal = () => {
    const it = colorPreviewItem;
    if (!it) return null;
    const bgHex = getValidHex(it.hex_color) || "#e0e0e0";
    const name = it.name || "Unnamed";
    const colorLabel = String(it.color_label || "").trim();
    const type = (it.type || "").toLowerCase();
    const isStain = type === "stain" || type === "custom_stain";
    return (
      <Modal
        visible={!!it}
        transparent
        animationType="fade"
        onRequestClose={() => setColorPreviewItem(null)}
      >
        <Pressable
          style={styles.colorModalBackdrop}
          onPress={() => setColorPreviewItem(null)}
        >
          <Pressable
            style={[
              styles.colorModalBox,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={styles.colorModalSwatchWrapper}>
              <View
                style={[styles.colorModalSwatch, { backgroundColor: bgHex }]}
              />
              {isStain && (
                <View
                  style={[
                    styles.colorModalStainWatermark,
                    { pointerEvents: "none" },
                  ]}
                >
                  <Text
                    style={[
                      styles.colorModalStainWatermarkText,
                      {
                        color: theme.dark
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(0,0,0,0.2)",
                      },
                    ]}
                  >
                    STAIN
                  </Text>
                </View>
              )}
            </View>
            <View
              style={[
                styles.colorModalNameRow,
                {
                  backgroundColor: nestedSurfaceColor(theme),
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <Text
                style={[
                  styles.colorModalName,
                  { color: theme.colors.onSurface },
                ]}
                numberOfLines={2}
              >
                {name}
              </Text>
              {colorLabel ? (
                <Text
                  style={[
                    styles.colorModalColorLabel,
                    { color: theme.colors.onSurface },
                  ]}
                  numberOfLines={2}
                >
                  {colorLabel}
                </Text>
              ) : null}
              {it.id ? (
                <Text
                  style={[
                    styles.colorModalId,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  ID: {String(it.id)}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon="close"
              size={24}
              onPress={() => setColorPreviewItem(null)}
              style={[
                styles.colorModalClose,
                {
                  backgroundColor: theme.dark
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(255,255,255,0.9)",
                },
              ]}
              iconColor={theme.colors.onSurface}
            />
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const inventoryStatModals = (
    <>
      <Modal
        visible={totalValueListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTotalValueListOpen(false)}
      >
        <Pressable
          style={styles.invStatModalOverlay}
          onPress={() => setTotalValueListOpen(false)}
        >
          <Pressable
            style={[
              styles.invStatModalCard,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.invStatModalHeader}>
              <Text
                style={[
                  styles.invStatModalTitle,
                  { color: theme.colors.onSurface },
                ]}
              >
                Total value
              </Text>
              <AppButton compact onPress={() => setTotalValueListOpen(false)}>
                Close
              </AppButton>
            </View>
            <Text style={[styles.invStatModalHint, { color: theme.colors.primary }]}>
              $
              {analytics.totalValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <ScrollFrame
              maxHeight={420}
              contentContainerStyle={styles.invStatModalList}
            >
              {analytics.totalValueItems.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  No items.
                </Text>
              ) : (
                analytics.totalValueItems.map((it) => (
                  <View
                    key={String(it.id)}
                    style={[
                      styles.invStatModalItem,
                      {
                        backgroundColor: nestedSurfaceColor(theme),
                        borderColor: theme.colors.outlineVariant,
                      },
                    ]}
                  >
                    <View style={styles.invStatModalItemHeader}>
                      <Text
                        style={[
                          styles.invStatModalItemName,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {it.name || it.id}
                      </Text>
                      <Text
                        style={[
                          styles.invStatModalItemValue,
                          { color: theme.colors.primary },
                        ]}
                      >
                        $
                        {it.value.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Text>
                    </View>
                    <Text
                      style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}
                    >
                      {it.qty} gal · $
                      {Number(it.price || 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      /gal
                    </Text>
                  </View>
                ))
              )}
            </ScrollFrame>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={staleListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStaleListOpen(false)}
      >
        <Pressable
          style={styles.invStatModalOverlay}
          onPress={() => setStaleListOpen(false)}
        >
          <Pressable
            style={[
              styles.invStatModalCard,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.invStatModalHeader}>
              <Text
                style={[
                  styles.invStatModalTitle,
                  { color: theme.colors.onSurface },
                ]}
              >
                Not scanned in {staleDays} days
              </Text>
              <AppButton compact onPress={() => setStaleListOpen(false)}>
                Close
              </AppButton>
            </View>
            <ScrollFrame
              maxHeight={420}
              contentContainerStyle={styles.invStatModalList}
            >
              {notScannedItems.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  None.
                </Text>
              ) : (
                notScannedItems.map((it) => {
                  const daysAgo = it.lastScanned
                    ? Math.max(
                        0,
                        Math.floor(
                          (Date.now() - (it.lastScannedMs || 0)) /
                            (24 * 60 * 60 * 1000),
                        ),
                      )
                    : null;
                  return (
                    <View
                      key={String(it.id)}
                      style={[
                        styles.invStatModalItem,
                        {
                          backgroundColor: nestedSurfaceColor(theme),
                          borderColor: theme.colors.outlineVariant,
                        },
                      ]}
                    >
                      <View style={styles.invStatModalItemHeader}>
                        <Text
                          style={[
                            styles.invStatModalItemName,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {it.name || it.id}
                        </Text>
                        <Text
                          style={[
                            styles.invStatModalItemValue,
                            { color: kitColors.semantic.lowStockValue },
                          ]}
                        >
                          {daysAgo != null ? `${daysAgo}d` : "Never"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: theme.colors.onSurfaceVariant,
                          fontSize: 12,
                        }}
                      >
                        ID: {it.id} · {it.quantity} gal
                        {it.lastScanned
                          ? ` · ${new Date(it.lastScanned).toLocaleDateString()}`
                          : ""}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollFrame>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  const backToReceivePoList = () => {
    if (receiveSubmitting) return;
    setReceivePoStep("list");
    setSelectedReceiveOrder(null);
    lineReceiveQtysRef.current = {};
    setReceiveDetailKey((k) => k + 1);
  };

  const receivePoModal = (
    <ReceivePoModal
      visible={receivePoVisible}
      actorName={actorName}
      step={receivePoStep}
      onClose={closeReceivePoModal}
      onBackToList={backToReceivePoList}
      onSelectOrder={selectOrderForReceive}
      onSubmit={handleReceivePoSubmit}
      receiveSubmitting={receiveSubmitting}
      receiveOrdersList={receiveOrdersList}
      receiveOrdersLoaded={receiveOrdersLoaded}
      receiveOrdersLoading={receiveOrdersLoading}
      onRefreshReceiveOrders={onRefreshReceiveOrders}
      selectedReceiveOrder={selectedReceiveOrder}
      lineReceiveQtysRef={lineReceiveQtysRef}
      detailResetKey={receiveDetailKey}
      getItemNameForOrder={getItemNameForOrder}
      getItemCodeForOrder={getItemCodeForOrder}
      getItemTypeForOrder={getItemTypeForOrder}
      formatOrderColorsPreview={formatOrderColorsPreview}
      anchorRef={receivePoAnchorRef}
    />
  );

  const itemActionPopover = (
    <ItemActionPopover
      visible={!!itemActionMenu?.item}
      anchor={itemActionMenu || { pageX: 0, pageY: 0 }}
      itemName={itemActionMenu?.item?.name || itemActionMenu?.item?.id}
      jobs={
        itemActionMenu?.showRelatedJobs
          ? getItemJobs(itemActionMenu?.item, onOrderSummary)
          : []
      }
      showRelatedJobs={!!itemActionMenu?.showRelatedJobs}
      showEditDetails={isAdmin}
      allowAddJobs={
        !!(isAdmin && itemActionMenu?.showRelatedJobs && itemActionMenu?.item)
      }
      onClose={() => setItemActionMenu(null)}
      onViewTransactions={() => {
        const item = itemActionMenu?.item;
        setItemActionMenu(null);
        if (!item) return;
        if (onViewItemHistory) onViewItemHistory(item);
        else onItemSelect?.(item);
      }}
      onEditDetails={() => {
        const item = itemActionMenu?.item;
        setItemActionMenu(null);
        if (!item) return;
        if (onEditItem) onEditItem(item);
        else onItemSelect?.(item);
      }}
      onAddJob={async (jobName) => {
        const item = itemActionMenu?.item;
        if (!item?.id) {
          return { success: false, error: "Item not found." };
        }
        const result = await InventoryService.addJobToItem(item.id, jobName);
        if (!result?.success) {
          return {
            success: false,
            error: result?.error || "Could not add job.",
          };
        }
        try {
          if (typeof onRefreshOnOrderSummary === "function") {
            await onRefreshOnOrderSummary();
          } else {
            // Fallback if parent did not wire refresh — still try local fetch
            // so the open popover can re-render from updated prop on next open.
            await OrderService.getOnOrderSummary();
          }
        } catch (e) {
          console.error("Error refreshing jobs after add:", e);
        }
        showToast({
          title: "Job linked",
          message: `${String(jobName).trim()} linked to ${
            item.name || item.id
          }.`,
        });
        return { success: true };
      }}
    />
  );

  const renderItem = ({ item }) => {
    const isLowStock =
      (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30);
    const itemId = item.id?.toString() || "N/A";
    const orderInfo = onOrderSummary[item.id] || onOrderSummary[itemId];
    const hasOpen = !!(orderInfo && orderInfo.quantity > 0);
    const isLate = !!(orderInfo && orderInfo.late);
    const isBackOrdered = !!(orderInfo && orderInfo.backOrdered);

    // Theme-aware low stock card style
    const lowStockCardStyle = isLowStock
      ? {
          borderLeftWidth: 4,
          borderLeftColor: kitColors.semantic.lowStockText,
          backgroundColor: theme.dark
            ? theme.colors.surfaceContainerHighest
            : "#fef5f5",
        }
      : null;

    return (
      <Card style={[styles.card, lowStockCardStyle]}>
        <Card.Content style={styles.itemCardContent}>
          <Pressable
            style={styles.itemCardPressable}
            onPress={(e) => handleItemActivate(item, e)}
          >
            <View style={styles.itemHeader}>
              <View style={styles.itemNameBlock}>
                {(() => {
                  const colorLabel = String(item.color_label || "").trim();
                  const itemKey = String(item.id || item.name || "");
                  const showLabel =
                    colorLabel && revealedColorLabels.has(itemKey);
                  const titleText = showLabel
                    ? colorLabel
                    : item.name || "Unnamed Item";
                  return (
                    <Pressable
                      onPress={(e) => {
                        if (colorLabel) {
                          e?.stopPropagation?.();
                          setRevealedColorLabels((prev) => {
                            const next = new Set(prev);
                            if (next.has(itemKey)) next.delete(itemKey);
                            else next.add(itemKey);
                            return next;
                          });
                          return;
                        }
                        handleItemActivate(item, e);
                      }}
                      hitSlop={4}
                      style={styles.itemNameHit}
                    >
                      <Text
                        style={[
                          styles.itemName,
                          isLowStock && styles.lowStockText,
                        ]}
                      >
                        {titleText}
                      </Text>
                    </Pressable>
                  );
                })()}
                {isCustomInventoryView ? (
                  <RecycleDateUnderName
                    item={item}
                    style={styles.recycleDateUnderName}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  styles.itemQuantity,
                  { color: ink.primary },
                  isLowStock && styles.lowStockText,
                ]}
              >
                {item.quantity || 0} gal
              </Text>
            </View>
            {(item.location || hasOpen) && (
              <View style={styles.itemMetaRow}>
                {item.location ? (
                  <Text
                    style={[styles.itemLocation, { color: ink.muted }]}
                    numberOfLines={1}
                  >
                    📍 {formatItemLocationDisplay(item)}
                  </Text>
                ) : (
                  <View style={styles.itemMetaSpacer} />
                )}
                {hasOpen ? (
                  <View style={styles.itemBadgeRow}>
                    {!isLate && !isBackOrdered ? (
                      <AppBadge tone="primary">Open</AppBadge>
                    ) : null}
                    {isLate && <AppBadge tone="late">Late</AppBadge>}
                    {isBackOrdered && (
                      <AppBadge tone="backOrder">Back ordered</AppBadge>
                    )}
                  </View>
                ) : null}
              </View>
            )}
            {renderCopyableItemId({
              id: itemId === "N/A" ? "" : itemId,
              name: item.name || "Unnamed Item",
              prefix: true,
              textStyle: [styles.itemId, { color: ink.dim }],
            })}
            {(() => {
              const orderInfo =
                onOrderSummary[item.id] || onOrderSummary[itemId];
              if (orderInfo && orderInfo.quantity > 0) {
                const expDate = orderInfo.expectedDate
                  ? new Date(orderInfo.expectedDate)
                  : null;
                const exp = expDate
                  ? expDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                const isLate = expDate && expDate.getTime() < Date.now();
                const textColor = isLate
                  ? kitColors.semantic.recycleDueDate
                  : theme.colors.primary;
                const po = orderInfo.poNumber || orderInfo.po_number || "";
                return (
                  <View style={styles.onOrderBlock}>
                    <Text style={[styles.onOrderText, { color: textColor }]}>
                      On order: {orderInfo.quantity} gal
                    </Text>
                    {exp ? (
                      <Text
                        style={[styles.onOrderDateText, { color: textColor }]}
                      >
                        {exp}
                      </Text>
                    ) : null}
                    {po ? (
                      <Text
                        style={[styles.onOrderPoText, { color: textColor }]}
                      >
                        PO {po}
                      </Text>
                    ) : null}
                  </View>
                );
              }
              return null;
            })()}
            {(() => {
              const t = item.type ? String(item.type).toLowerCase() : "";
              const label = getMaterialTypeLabel(t);
              const materialTypeColor = getMaterialTypeColor(t, theme);
              if (!label) return null;
              return (
                <Text
                  style={[
                    styles.materialTypeText,
                    { color: materialTypeColor },
                  ]}
                >
                  {label}
                </Text>
              );
            })()}
            {!isCustomInventoryView ? (
              <RecycleDateText
                item={item}
                style={styles.recycleDateText}
                dueStyle={styles.recycleDateDue}
              />
            ) : null}
            <View style={styles.cardBottomRow}>
              <Text
                style={[styles.lastScanned, { color: ink.dim }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.lastScanned
                  ? `Last scanned: ${new Date(item.lastScanned).toLocaleString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )} by ${item?.lastScannedBy || "unknown"}`
                  : " "}
              </Text>
              {getValidHex(item.hex_color) ? (
                <Pressable
                  onPress={() => setColorPreviewItem(item)}
                  style={[
                    styles.inventoryColorSwatch,
                    {
                      backgroundColor: getValidHex(item.hex_color),
                    },
                  ]}
                />
              ) : null}
            </View>
          </Pressable>
        </Card.Content>
      </Card>
    );
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? "↑" : "↓";
  };

  // Desktop/Web Dashboard View: only the table area scrolls
  if (isDesktop) {
    return (
      <View
        style={[
          styles.container,
          styles.webDesktopRoot,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <View style={[styles.webContainer, styles.webContainerFlex]}>
          <PageHeader
            title="Inventory"
            showBack={false}
            embeddedInShell={embeddedInShell}
          />

          {effectiveRecycleDue && (
            <View style={styles.recycleDueBanner}>
              <Text style={styles.recycleDueBannerText}>
                Showing: Paint Needing Recycle
              </Text>
              <AppButton
                mode="text"
                compact
                onPress={() => {
                  setRecycleDueOnly(false);
                  onClearRecycleDueFilter?.();
                }}
              >
                Clear Filter
              </AppButton>
            </View>
          )}
          {initialStockFilter === "lowStock" && stockFilter === "lowStock" && (
            <View style={styles.recycleDueBanner}>
              <Text style={styles.recycleDueBannerText}>
                Showing: Low Stock Items
              </Text>
              {onClearStockFilter && (
                <AppButton
                  mode="text"
                  compact
                  onPress={() => {
                    setStockFilter(null);
                    onClearStockFilter();
                  }}
                >
                  Clear Filter
                </AppButton>
              )}
            </View>
          )}

          {/* Color Book view (desktop): 4-column grid */}
          {viewMode === "colorBook" ? (
            <View
              style={[styles.webContentCentered, styles.webContentCenteredFlex]}
            >
              <OutlinedSearchInput
                ref={searchInputRef}
                placeholder="Search by name, color, or ID — Enter scans ID/barcode for check in/out"
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.colorBookSearchbar}
                onSubmitEditing={handleSearchSubmit}
                blurOnSubmit={false}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {colorBookItems.length === 0 ? (
                <AppEmptyState
                  title={
                    searchQuery
                      ? "No paint colors found"
                      : "No paint colors with hex in inventory"
                  }
                />
              ) : (
                <ScrollView
                  style={styles.colorBookScrollDesktop}
                  contentContainerStyle={styles.colorBookGridDesktop}
                  showsVerticalScrollIndicator
                >
                  {colorBookItems.map((item) => (
                    <React.Fragment
                      key={item.id?.toString() || String(Math.random())}
                    >
                      {renderColorCard({ item, desktop: true })}
                    </React.Fragment>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View
              style={[styles.webContentCentered, styles.webContentCenteredFlex]}
            >
              {/* Analytics + Table: centered; table area fills remaining height and scrolls */}
              <View
                style={[
                  styles.webContentCentered,
                  styles.webContentCenteredFlex,
                ]}
              >
                {/* Analytics Cards */}
                <View style={styles.analyticsRow}>
                  {isAdmin ? (
                    <Pressable
                      style={[styles.analyticsCard, styles.analyticsCardFilter]}
                      onPress={() => setTotalValueListOpen(true)}
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor:
                              theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>Total value</Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              { color: theme.colors.primary },
                            ]}
                          >
                            $
                            {analytics.totalValue.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </Title>
                          <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                            Tap for breakdown
                          </Text>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  ) : null}
                  <Card
                    style={[
                      styles.analyticsCard,
                      {
                        backgroundColor: theme.colors.surfaceContainerHighest,
                        borderColor: theme.colors.outlineVariant,
                        borderWidth: 1,
                      },
                    ]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.analyticsCardContent}>
                      <Text style={[styles.analyticsLabel, { color: ink.muted }]}>Total Gallons</Text>
                      <Title style={[styles.analyticsValue, { color: ink.primary }]}>
                        {analytics.totalGallons.toLocaleString()}
                      </Title>
                    </Card.Content>
                  </Card>
                  {isAdmin && analytics.recycleDueCount > 0 ? (
                    <Pressable
                      style={[
                        styles.analyticsCard,
                        styles.analyticsCardFilter,
                        effectiveRecycleDue &&
                          styles.analyticsCardFilterActive,
                        effectiveRecycleDue && {
                          borderColor: theme.colors.primary,
                        },
                      ]}
                      onPress={() => {
                        setRecycleDueOnly((v) => {
                          const next = !v;
                          if (next) {
                            changeBookFilter("custom");
                          }
                          return next;
                        });
                        if (effectiveRecycleDue) {
                          onClearRecycleDueFilter?.();
                        }
                      }}
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor:
                              theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                            Need to recycle
                            {effectiveRecycleDue ? " (filtering)" : ""}
                          </Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              {
                                color: kitColors.semantic.recycleBannerText,
                              },
                            ]}
                          >
                            {analytics.recycleDueCount}
                          </Title>
                          <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                            Past due date
                          </Text>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  ) : null}
                  {isAdmin ? (
                    <Pressable
                      style={[styles.analyticsCard, styles.analyticsCardFilter]}
                      onPress={() =>
                        setStaleDays((d) =>
                          d === 30 ? 60 : d === 60 ? 90 : 30,
                        )
                      }
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor:
                              theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                            Not scanned in {staleDays} days
                          </Text>
                          <Pressable
                            onPress={(e) => {
                              e?.stopPropagation?.();
                              setStaleListOpen(true);
                            }}
                          >
                            <Title
                              style={[
                                styles.analyticsValue,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {notScannedCount}
                            </Title>
                          </Pressable>
                          <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                            Tap card for 30/60/90 · number for list
                          </Text>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  ) : null}
                  {analytics.lowStockCount > 0 && (
                    <Pressable
                      style={[
                        styles.analyticsCard,
                        styles.analyticsCardFilter,
                        stockFilter === "lowStock" &&
                          styles.analyticsCardFilterActive,
                        stockFilter === "lowStock" && {
                          borderColor: theme.colors.primary,
                        },
                      ]}
                      onPress={() =>
                        setStockFilter((f) =>
                          f === "lowStock" ? null : "lowStock",
                        )
                      }
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor: theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                            Low Stock
                            {stockFilter === "lowStock" ? " (filtering)" : ""}
                          </Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              { color: kitColors.semantic.lowStockValue },
                            ]}
                          >
                            {analytics.lowStockCount}
                          </Title>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  )}
                  {analytics.outOfStockCount > 0 && (
                    <Pressable
                      style={[
                        styles.analyticsCard,
                        styles.analyticsCardFilter,
                        stockFilter === "outOfStock" &&
                          styles.analyticsCardFilterActive,
                        stockFilter === "outOfStock" && {
                          borderColor: theme.colors.primary,
                        },
                      ]}
                      onPress={() =>
                        setStockFilter((f) =>
                          f === "outOfStock" ? null : "outOfStock",
                        )
                      }
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor: theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                            Out of Stock
                            {stockFilter === "outOfStock" ? " (filtering)" : ""}
                          </Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              { color: kitColors.semantic.outOfStockValue },
                            ]}
                          >
                            {analytics.outOfStockCount}
                          </Title>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.analyticsCard, styles.analyticsCardFilter]}
                    onPress={() => setGalPeriodWeek((prev) => !prev)}
                  >
                    <Card
                      style={[
                        styles.analyticsCardInner,
                        {
                          backgroundColor: theme.colors.surfaceContainerHighest,
                          borderColor: theme.colors.outlineVariant,
                          borderWidth: 1,
                        },
                      ]}
                      mode="outlined"
                    >
                      <Card.Content style={styles.analyticsCardContent}>
                        <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                          Checked out this {galPeriodWeek ? "week" : "month"}
                        </Text>
                        <Title style={[styles.analyticsValue, { color: ink.primary }]}>
                          {galPeriodWeek
                            ? gallonsUsedThisWeek
                            : gallonsUsedThisMonth}
                          <Text style={[styles.analyticsValueUnit, { color: ink.muted }]}> gal</Text>
                        </Title>
                        <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                          {galPeriodWeek
                            ? thisWeekRange.label
                            : thisMonthRange.label}
                        </Text>
                        <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                          Tap for {galPeriodWeek ? "month" : "week"}
                        </Text>
                      </Card.Content>
                    </Card>
                  </Pressable>
                  {mostUsedColor && (
                    <Pressable
                      style={[styles.analyticsCard, styles.analyticsCardFilter]}
                      onPress={() => setMostUsedByWeek((prev) => !prev)}
                    >
                      <Card
                        style={[
                          styles.analyticsCardInner,
                          {
                            backgroundColor: theme.colors.surfaceContainerHighest,
                            borderColor: theme.colors.outlineVariant,
                            borderWidth: 1,
                          },
                        ]}
                        mode="outlined"
                      >
                        <Card.Content style={styles.analyticsCardContent}>
                          <Text style={[styles.analyticsLabel, { color: ink.muted }]}>
                            Most gallons checked out
                          </Text>
                          <Title
                            style={[styles.analyticsValue, { fontSize: 18, color: ink.primary }]}
                            numberOfLines={1}
                          >
                            {mostUsedColor.name}
                          </Title>
                          <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                            {mostUsedColor.totalGal} gal —{" "}
                            {mostUsedColor.isWeek
                              ? `week of ${mostUsedColor.periodLabel}`
                              : mostUsedColor.periodLabel}
                          </Text>
                          <Text style={[styles.analyticsSubtext, { color: ink.dim }]}>
                            Tap for {mostUsedByWeek ? "month" : "week"}
                          </Text>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  )}
                </View>

                {/* Search and Table - fills remaining height, scrolls internally */}
                <View style={styles.tableCardWrapper}>
                  <Card
                    style={[
                      styles.tableCardFlex,
                      {
                        backgroundColor: theme.colors.surfaceContainerHighest,
                        borderColor: theme.colors.outlineVariant,
                        borderWidth: 1,
                      },
                    ]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.tableCardContentFlex}>
                      <View style={styles.tableHeader}>
                        <View style={styles.tableHeaderTopRow}>
                          {viewMode !== "colorBook" && (
                            <View style={styles.headerFilterGroup}>
                              {isAdmin && (
                                <AppButton
                                  // Keep mode constant to avoid layout shift between outlined/contained
                                  mode="outlined"
                                  compact
                                  onPress={() =>
                                    setListOrderMode((prev) =>
                                      prev === "trueOrder"
                                        ? "alphabetical"
                                        : "trueOrder",
                                    )
                                  }
                                  style={[
                                    styles.viewModeButton,
                                    styles.viewModeButtonLong,
                                    listOrderMode === "trueOrder" && {
                                      backgroundColor: theme.dark
                                        ? "rgba(255,255,255,0.08)"
                                        : "rgba(0,0,0,0.06)",
                                    },
                                  ]}
                                  contentStyle={invBtnContentStyle}
                                  labelStyle={invBtnLabelStyle}
                                  disabled={bookFilter === "custom"}
                                >
                                  {listOrderMode === "trueOrder"
                                    ? "Alphabetical"
                                    : "True Order"}
                                </AppButton>
                              )}
                              <AppButton
                                mode={
                                  bookFilter === "standard"
                                    ? "outlined"
                                    : "contained"
                                }
                                compact
                                onPress={toggleBookFilter}
                                style={styles.viewModeButton}
                                contentStyle={invBtnContentStyle}
                                labelStyle={invBtnLabelStyle}
                              >
                                {bookFilter === "standard" ? "Custom" : "Stock"}
                              </AppButton>
                              {isAdmin && (
                                <AppButton
                                  mode={apOnly ? "contained" : "outlined"}
                                  compact
                                  onPress={() => setApOnly((v) => !v)}
                                  style={styles.viewModeButton}
                                  contentStyle={invBtnContentStyle}
                                  labelStyle={invBtnLabelStyle}
                                >
                                  AP
                                </AppButton>
                              )}
                              {isAdmin && bookFilter === "custom" && (
                                <AppButton
                                  mode={
                                    showZeroCustoms ? "contained" : "outlined"
                                  }
                                  compact
                                  onPress={() =>
                                    setShowZeroCustoms((v) => !v)
                                  }
                                  style={[
                                    styles.viewModeButton,
                                    styles.viewModeButtonLong,
                                  ]}
                                  contentStyle={invBtnContentStyle}
                                  labelStyle={invBtnLabelStyle}
                                >
                                  {showZeroCustoms
                                    ? "Hide empty"
                                    : "Show empty"}
                                </AppButton>
                              )}
                            </View>
                          )}
                          <View style={styles.tableHeaderTopRight}>
                            <Text style={styles.filterSummaryText}>
                              {bookFilter === "custom"
                                ? "Custom"
                                : listOrderMode === "trueOrder"
                                  ? "Stock - True order"
                                  : "Stock - Alphabetical"}
                            </Text>
                            <Text style={styles.resultCount}>
                              {filteredAndSortedInventory.length} of{" "}
                              {inventory.length} items
                            </Text>
                          </View>
                        </View>
                        <View style={styles.tableHeaderSearchRow}>
                          <OutlinedSearchInput
                            ref={searchInputRef}
                            placeholder="Search or Scan"
                            onChangeText={setSearchQuery}
                            value={searchQuery}
                            style={styles.webSearchbar}
                            onSubmitEditing={handleSearchSubmit}
                            blurOnSubmit={false}
                            autoCorrect={false}
                            autoCapitalize="none"
                          />
                          {actorName ? (
                            <View
                              ref={receivePoAnchorRef}
                              collapsable={false}
                              style={styles.receivePoButtonWrap}
                            >
                              <AppButton
                                mode="outlined"
                                compact
                                icon="truck-delivery"
                                onPress={openReceivePoModal}
                                style={styles.receivePoButton}
                                contentStyle={invBtnContentStyle}
                                labelStyle={invBtnLabelStyle}
                              >
                                Receive PO
                              </AppButton>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      {filteredAndSortedInventory.length === 0 ? (
                        <AppEmptyState
                          title={
                            searchQuery
                              ? "No items found"
                              : "No items in inventory"
                          }
                        />
                      ) : (
                        <ScrollView
                          horizontal
                          style={styles.tableScrollHorizontal}
                          showsHorizontalScrollIndicator={true}
                        >
                          <View style={styles.tableWithStaticHeader}>
                            <DataTable style={styles.dataTable}>
                              <DataTable.Header>
                                <DataTable.Title
                                  style={[styles.tableCell, styles.nameColCell]}
                                  sortDirection={
                                    getSortIcon("name")
                                      ? sortOrder === "asc"
                                        ? "ascending"
                                        : "descending"
                                      : null
                                  }
                                  onPress={() => handleSort("name")}
                                >
                                  Paint Name
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[styles.tableCell, styles.qtyColCell]}
                                  sortDirection={
                                    getSortIcon("quantity")
                                      ? sortOrder === "asc"
                                        ? "ascending"
                                        : "descending"
                                      : null
                                  }
                                  onPress={() => handleSort("quantity")}
                                >
                                  Quantity
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[styles.tableCell, styles.idColCell]}
                                >
                                  ID
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[styles.tableCell, styles.typeColCell]}
                                >
                                  Material Type
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[
                                    styles.tableCell,
                                    styles.locationColCell,
                                  ]}
                                >
                                  Location
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[
                                    styles.tableCell,
                                    styles.colorColHeader,
                                  ]}
                                >
                                  Color
                                </DataTable.Title>
                                <DataTable.Title
                                  style={styles.lastScannedCell}
                                  sortDirection={
                                    getSortIcon("lastScanned")
                                      ? sortOrder === "asc"
                                        ? "ascending"
                                        : "descending"
                                      : null
                                  }
                                  onPress={() => handleSort("lastScanned")}
                                >
                                  Last Action
                                </DataTable.Title>
                                <DataTable.Title
                                  style={[
                                    styles.tableCell,
                                    styles.onOrderColCell,
                                  ]}
                                >
                                  On order
                                </DataTable.Title>
                              </DataTable.Header>
                            </DataTable>
                            <View
                              style={[
                                styles.tableScrollOuter,
                                styles.tableScrollFadeHost,
                              ]}
                            >
                              <ScrollView
                                style={styles.tableScrollOuter}
                                contentContainerStyle={
                                  styles.tableScrollOuterContent
                                }
                                showsVerticalScrollIndicator
                                nestedScrollEnabled
                                scrollEventThrottle={16}
                                onScroll={(e) => {
                                  const {
                                    contentOffset,
                                    contentSize,
                                    layoutMeasurement,
                                  } = e.nativeEvent;
                                  const y = contentOffset.y;
                                  const canScroll =
                                    contentSize.height >
                                    layoutMeasurement.height + 2;
                                  setTableScrollFades({
                                    top: canScroll && y > 2,
                                    bottom:
                                      canScroll &&
                                      y + layoutMeasurement.height <
                                        contentSize.height - 2,
                                  });
                                }}
                                onContentSizeChange={(_w, h) => {
                                  tableScrollMetricsRef.current.contentH = h;
                                  const layoutH =
                                    tableScrollMetricsRef.current.layoutH;
                                  if (layoutH > 0) {
                                    const canScroll = h > layoutH + 2;
                                    setTableScrollFades((prev) => ({
                                      top: prev.top && canScroll,
                                      bottom: canScroll,
                                    }));
                                  }
                                }}
                                onLayout={(e) => {
                                  const layoutH = e.nativeEvent.layout.height;
                                  tableScrollMetricsRef.current.layoutH =
                                    layoutH;
                                  const contentH =
                                    tableScrollMetricsRef.current.contentH;
                                  if (contentH > 0) {
                                    const canScroll = contentH > layoutH + 2;
                                    setTableScrollFades((prev) => ({
                                      top: prev.top && canScroll,
                                      bottom: canScroll,
                                    }));
                                  }
                                }}
                              >
                                <DataTable style={styles.dataTable}>
                                  {filteredAndSortedInventory.map((item) => {
                                  const isLowStock =
                                    (item.quantity || 0) <
                                    (item.minQuantity ?? minQuantity ?? 30);
                                  const isOutOfStock =
                                    (item.quantity || 0) === 0;
                                  return (
                                    <DataTable.Row
                                      key={item.id}
                                      onPress={(e) => handleItemActivate(item, e)}
                                      style={
                                        isLowStock
                                          ? {
                                              backgroundColor: theme.dark
                                                ? theme.colors.surfaceContainerHighest
                                                : "#fef5f5",
                                              borderLeftWidth: 4,
                                              borderLeftColor: kitColors.semantic.lowStockText,
                                            }
                                          : undefined
                                      }
                                    >
                                      <DataTable.Cell
                                        style={[styles.tableCell, styles.nameColCell]}
                                      >
                                        <View style={styles.tableNameCellInner}>
                                          <Text
                                            style={[
                                              styles.itemNameText,
                                              {
                                                color:
                                                  theme.dark && !isLowStock
                                                    ? "#fff"
                                                    : undefined,
                                              },
                                              isLowStock && styles.lowStockText,
                                            ]}
                                          >
                                            {item.name || "Unnamed"}
                                          </Text>
                                          {isCustomInventoryView &&
                                          String(item.color_label || "").trim() ? (
                                            <Text
                                              style={[
                                                styles.tableColorLabel,
                                                {
                                                  color: theme.colors.onSurfaceVariant,
                                                },
                                              ]}
                                              numberOfLines={1}
                                            >
                                              {String(item.color_label).trim()}
                                            </Text>
                                          ) : null}
                                          {isCustomInventoryView ? (
                                            <RecycleDateUnderName
                                              item={item}
                                              style={styles.recycleDateUnderNameTable}
                                            />
                                          ) : null}
                                        </View>
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[styles.tableCell, styles.qtyColCell]}
                                      >
                                        <Text
                                          style={[
                                            styles.quantityText,
                                            {
                                              color:
                                                theme.dark && !isLowStock
                                                  ? "#fff"
                                                  : theme.dark
                                                    ? undefined
                                                    : theme.colors.onSurface,
                                            },
                                            isLowStock && styles.lowStockText,
                                          ]}
                                        >
                                          {item.quantity || 0} gal
                                        </Text>
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[
                                          styles.tableCell,
                                          styles.idColCell,
                                        ]}
                                      >
                                        {renderCopyableItemId({
                                          id: item.id,
                                          name: item.name || "Unnamed",
                                          prefix: false,
                                          hitStyle: styles.copyableIdHitCentered,
                                          textStyle: [
                                            styles.idText,
                                            {
                                              color: theme.dark
                                                ? "#fff"
                                                : mutedTextColor(theme),
                                            },
                                          ],
                                        })}
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[styles.tableCell, styles.typeColCell]}
                                      >
                                        {(() => {
                                          const t = item.type
                                            ? String(item.type).toLowerCase()
                                            : "";
                                          const label = getMaterialTypeLabel(t);
                                          const materialTypeColor =
                                            getMaterialTypeColor(t, theme);
                                          return (
                                            <Text
                                              style={[
                                                styles.materialTypeText,
                                                { color: materialTypeColor },
                                              ]}
                                            >
                                              {label}
                                            </Text>
                                          );
                                        })()}
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[
                                          styles.tableCell,
                                          styles.locationColCell,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.locationText,
                                            {
                                              color: theme.dark
                                                ? "#fff"
                                                : mutedTextColor(theme),
                                            },
                                          ]}
                                        >
                                          {formatItemLocationDisplay(item) ||
                                            "-"}
                                        </Text>
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[
                                          styles.tableCell,
                                          styles.colorColCell,
                                        ]}
                                      >
                                        {getValidHex(item.hex_color) ? (
                                          <Pressable
                                            onPress={() =>
                                              setColorPreviewItem(item)
                                            }
                                            style={[
                                              styles.inventoryColorSwatch,
                                              {
                                                backgroundColor: getValidHex(
                                                  item.hex_color,
                                                ),
                                              },
                                            ]}
                                          />
                                        ) : null}
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={styles.lastScannedCell}
                                      >
                                        {(() => {
                                          const log =
                                            lastLogByItemId[
                                              item.id != null
                                                ? String(item.id)
                                                : ""
                                            ];
                                          if (log) {
                                            const ts = log.timestamp
                                              ? new Date(
                                                  log.timestamp,
                                                ).toLocaleString("en-US", {
                                                  month: "short",
                                                  day: "numeric",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })
                                              : "—";
                                            const user =
                                              log.userName || "Unknown";
                                            const actionLabel =
                                              getActionLabel(log);
                                            return (
                                              <View>
                                                <Text
                                                  style={[
                                                    styles.timeText,
                                                    {
                                                      color: theme.dark
                                                        ? "#fff"
                                                        : mutedTextColor(theme),
                                                    },
                                                  ]}
                                                >
                                                  {ts}
                                                </Text>
                                                <Text
                                                  style={[
                                                    styles.lastScannedByText,
                                                    {
                                                      color: theme.dark
                                                        ? "#fff"
                                                        : "#333",
                                                    },
                                                  ]}
                                                >
                                                  {user}
                                                </Text>
                                                <Text
                                                  style={[
                                                    styles.timeText,
                                                    {
                                                      color: theme.dark
                                                        ? "#aaa"
                                                        : mutedTextColor(theme),
                                                    },
                                                  ]}
                                                >
                                                  {actionLabel}
                                                </Text>
                                              </View>
                                            );
                                          }
                                          return (
                                            <Text
                                              style={[
                                                styles.timeText,
                                                {
                                                  color: theme.dark
                                                    ? "#fff"
                                                    : mutedTextColor(theme),
                                                },
                                              ]}
                                            >
                                              Never
                                            </Text>
                                          );
                                        })()}
                                      </DataTable.Cell>
                                      <DataTable.Cell
                                        style={[
                                          styles.tableCell,
                                          styles.onOrderColCell,
                                        ]}
                                      >
                                        {(() => {
                                          const orderInfo =
                                            onOrderSummary[item.id] ||
                                            onOrderSummary[String(item.id)];
                                          if (
                                            orderInfo &&
                                            orderInfo.quantity > 0
                                          ) {
                                            const expDate =
                                              orderInfo.expectedDate
                                                ? new Date(
                                                    orderInfo.expectedDate,
                                                  )
                                                : null;
                                            const exp = expDate
                                              ? expDate.toLocaleDateString(
                                                  "en-US",
                                                  {
                                                    month: "short",
                                                    day: "numeric",
                                                    year: "numeric",
                                                  },
                                                )
                                              : "";
                                            const isLate =
                                              expDate &&
                                              expDate.getTime() < Date.now();
                                            const textColor = isLate
                                              ? kitColors.semantic.recycleDueDate
                                              : theme.colors.primary;
                                            const po =
                                              orderInfo.poNumber ||
                                              orderInfo.po_number ||
                                              "";
                                            return (
                                              <View>
                                                <Text
                                                  style={{
                                                    fontSize: 12,
                                                    color: textColor,
                                                  }}
                                                >
                                                  {orderInfo.quantity} gal
                                                </Text>
                                                {exp ? (
                                                  <Text
                                                    style={{
                                                      fontSize: 11,
                                                      color: textColor,
                                                      marginTop: 2,
                                                    }}
                                                  >
                                                    {exp}
                                                  </Text>
                                                ) : null}
                                                {po ? (
                                                  <Text
                                                    style={{
                                                      fontSize: 11,
                                                      color: textColor,
                                                      marginTop: 2,
                                                    }}
                                                  >
                                                    PO {po}
                                                  </Text>
                                                ) : null}
                                              </View>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </DataTable.Cell>
                                    </DataTable.Row>
                                  );
                                })}
                              </DataTable>
                              </ScrollView>
                              {tableScrollFades.top ? (
                                <EdgeFade
                                  color={theme.colors.surfaceContainerHighest}
                                  side="top"
                                />
                              ) : null}
                              {tableScrollFades.bottom ? (
                                <EdgeFade
                                  color={theme.colors.surfaceContainerHighest}
                                  side="bottom"
                                />
                              ) : null}
                            </View>
                          </View>
                        </ScrollView>
                      )}
                    </Card.Content>
                  </Card>
                </View>
              </View>
            </View>
          )}
          {receivePoModal}
          {itemActionPopover}
          <ColorPreviewModal />
          {inventoryStatModals}
        </View>
      </View>
    );
  }

  // Mobile View (original card-based layout)
  // Mobile landscape: whole page (header + search + stats + list) in one ScrollView with overflow scroll
  if (isMobileLandscape) {
    return (
      <>
        <View
          style={[
            styles.container,
            styles.tableScrollFadeHost,
            { backgroundColor: theme.colors.background },
          ]}
        >
        <PullToRefresh
          style={styles.listPullRefresh}
          contentStyle={styles.listPullRefreshContent}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          atTop={listAtTop}
        >
        <ScrollView
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
            Platform.OS === "web" && styles.mobileLandscapeScrollWeb,
          ]}
          contentContainerStyle={styles.mobileLandscapeScrollContent}
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              e.nativeEvent;
            setListAtTop((contentOffset.y ?? 0) <= 2);
            syncScrollFades(
              setMobileListFades,
              contentOffset.y,
              contentSize.height,
              layoutMeasurement.height,
            );
          }}
          onContentSizeChange={(_w, h) => {
            mobileListMetricsRef.current.contentH = h;
            const layoutH = mobileListMetricsRef.current.layoutH;
            if (layoutH > 0) {
              syncScrollFades(
                setMobileListFades,
                0,
                h,
                layoutH,
              );
            }
          }}
          onLayout={(e) => {
            const layoutH = e.nativeEvent.layout.height;
            mobileListMetricsRef.current.layoutH = layoutH;
            const contentH = mobileListMetricsRef.current.contentH;
            if (contentH > 0) {
              syncScrollFades(setMobileListFades, 0, contentH, layoutH);
            }
          }}
        >
          <View style={styles.header}>
            <View style={styles.refreshContainer}>
              <View style={styles.headerFilterGroup}>
                {isAdmin && viewMode !== "colorBook" && (
                  <AppButton
                    mode={
                      listOrderMode === "trueOrder" ? "contained" : "outlined"
                    }
                    compact
                    onPress={() =>
                      setListOrderMode((prev) =>
                        prev === "trueOrder" ? "alphabetical" : "trueOrder",
                      )
                    }
                    style={[
                      styles.viewModeButtonMobile,
                      styles.viewModeButtonLong,
                    ]}
                    contentStyle={invBtnContentStyle}
                    labelStyle={invBtnLabelStyle}
                    disabled={bookFilter === "custom"}
                  >
                    {listOrderMode === "trueOrder"
                      ? "Display order"
                      : "Sort by display order"}
                  </AppButton>
                )}
                <AppButton
                  mode={bookFilter === "standard" ? "outlined" : "contained"}
                  compact
                  onPress={toggleBookFilter}
                  style={styles.viewModeButtonMobile}
                  contentStyle={invBtnContentStyle}
                  labelStyle={invBtnLabelStyle}
                >
                  {bookFilter === "standard" ? "Stock" : "Custom"}
                </AppButton>
                {isAdmin && (
                  <AppButton
                    mode={apOnly ? "contained" : "outlined"}
                    compact
                    onPress={() => setApOnly((v) => !v)}
                    style={styles.viewModeButtonMobile}
                    contentStyle={invBtnContentStyle}
                    labelStyle={invBtnLabelStyle}
                  >
                    AP
                  </AppButton>
                )}
                {isAdmin &&
                  viewMode !== "colorBook" &&
                  bookFilter === "custom" && (
                    <AppButton
                      mode={showZeroCustoms ? "contained" : "outlined"}
                      compact
                      onPress={() => setShowZeroCustoms((v) => !v)}
                      style={[
                        styles.viewModeButtonMobile,
                        styles.viewModeButtonLong,
                      ]}
                      contentStyle={invBtnContentStyle}
                      labelStyle={invBtnLabelStyle}
                    >
                      {showZeroCustoms ? "Hide empty" : "Show empty"}
                    </AppButton>
                  )}
              </View>
              <AppButton
                mode={viewMode === "colorBook" ? "contained" : "outlined"}
                compact
                onPress={toggleViewMode}
                style={[
                  styles.viewModeButtonMobile,
                  styles.viewModeButtonColorBook,
                ]}
                contentStyle={invBtnContentStyle}
                labelStyle={invBtnLabelStyle}
                icon="palette-outline"
              >
                {viewMode === "colorBook" ? "Inventory" : "Color Book"}
              </AppButton>
            </View>
          </View>

          <View style={styles.filterSummaryRow}>
            <Text style={styles.filterSummaryText}>
              {viewMode === "colorBook"
                ? bookFilter === "standard"
                  ? "Stock"
                  : "Custom"
                : bookFilter === "custom"
                  ? "Custom"
                  : listOrderMode === "trueOrder"
                    ? "Stock - True order"
                    : "Stock - Alphabetical"}
            </Text>
          </View>
          <View style={styles.searchRow}>
            <OutlinedSearchInput
              ref={searchInputRef}
              placeholder={
                viewMode === "colorBook"
                  ? "Search by name or color"
                  : "Search or Scan"
              }
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchbar}
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit={false}
              onSubmitEditing={handleSearchSubmit}
            />
            {actorName && viewMode !== "colorBook" ? (
              <View
                ref={receivePoAnchorRef}
                collapsable={false}
                style={styles.receivePoButtonWrap}
              >
                <AppButton
                  mode="outlined"
                  compact
                  icon="truck-delivery"
                  onPress={openReceivePoModal}
                  style={styles.receivePoButton}
                  contentStyle={invBtnContentStyle}
                  labelStyle={invBtnLabelStyle}
                >
                  Receive PO
                </AppButton>
              </View>
            ) : null}
          </View>
          {effectiveRecycleDue && (
            <View style={styles.recycleDueBanner}>
              <Text style={styles.recycleDueBannerText}>
                Showing: Paint Needing Recycle
              </Text>
              <AppButton
                mode="text"
                compact
                onPress={() => {
                  setRecycleDueOnly(false);
                  onClearRecycleDueFilter?.();
                }}
              >
                Clear Filter
              </AppButton>
            </View>
          )}
          {viewMode === "inventory" && (
            <View
              style={[
                styles.analyticsRowMobile,
                styles.analyticsRowMobileLandscape,
              ]}
            >
              {isAdmin ? (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                  ]}
                  onPress={() => setTotalValueListOpen(true)}
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>Value</Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: theme.colors.primary, fontSize: 16 },
                        ]}
                        numberOfLines={1}
                      >
                        $
                        {Math.round(analytics.totalValue).toLocaleString(
                          "en-US",
                        )}
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              ) : null}
              {analytics.totalGallons > 0 && (
                <Card
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                  ]}
                >
                  <Card.Content
                    style={[
                      styles.analyticsCardMobileContent,
                      isMobileLandscape &&
                        styles.analyticsCardMobileContentLandscape,
                    ]}
                  >
                    <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                      Total Gallons
                    </Text>
                    <Title style={[styles.analyticsValueMobile, { color: ink.primary }]}>
                      {analytics.totalGallons.toLocaleString()}
                    </Title>
                  </Card.Content>
                </Card>
              )}
              {isAdmin && analytics.recycleDueCount > 0 ? (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                    effectiveRecycleDue && styles.analyticsCardFilterActive,
                  ]}
                  onPress={() => {
                    setRecycleDueOnly((v) => {
                      const next = !v;
                      if (next) {
                        changeBookFilter("custom");
                      }
                      return next;
                    });
                    if (effectiveRecycleDue) onClearRecycleDueFilter?.();
                  }}
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>Recycle</Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: kitColors.semantic.recycleBannerText },
                        ]}
                      >
                        {analytics.recycleDueCount}
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              ) : null}
              {isAdmin ? (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                  ]}
                  onPress={() =>
                    setStaleDays((d) => (d === 30 ? 60 : d === 60 ? 90 : 30))
                  }
                  onLongPress={() => setStaleListOpen(true)}
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                        {staleDays}d stale
                      </Text>
                      <Pressable onPress={() => setStaleListOpen(true)}>
                        <Title
                          style={[
                            styles.analyticsValueMobile,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {notScannedCount}
                        </Title>
                      </Pressable>
                    </Card.Content>
                  </Card>
                </Pressable>
              ) : null}
              {analytics.lowStockCount > 0 && (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                    stockFilter === "lowStock" &&
                      styles.analyticsCardFilterActive,
                    stockFilter === "lowStock" && {
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() =>
                    setStockFilter((f) =>
                      f === "lowStock" ? null : "lowStock",
                    )
                  }
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                        Low Stock
                        {stockFilter === "lowStock" ? " (filtering)" : ""}
                      </Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: kitColors.semantic.lowStockValue },
                        ]}
                      >
                        {analytics.lowStockCount}
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              )}
              {analytics.outOfStockCount > 0 && (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                    stockFilter === "outOfStock" &&
                      styles.analyticsCardFilterActive,
                    stockFilter === "outOfStock" && {
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() =>
                    setStockFilter((f) =>
                      f === "outOfStock" ? null : "outOfStock",
                    )
                  }
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                        Out of Stock
                        {stockFilter === "outOfStock" ? " (filtering)" : ""}
                      </Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: kitColors.semantic.outOfStockValue },
                        ]}
                      >
                        {analytics.outOfStockCount}
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              )}
              {(gallonsUsedThisWeek > 0 || gallonsUsedThisMonth > 0) && (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                  ]}
                  onPress={() => setGalPeriodWeek((prev) => !prev)}
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                        Gal this {galPeriodWeek ? "week" : "month"}
                      </Text>
                      <Title style={[styles.analyticsValueMobile, { color: ink.primary }]}>
                        {galPeriodWeek
                          ? gallonsUsedThisWeek
                          : gallonsUsedThisMonth}
                      </Title>
                      <Text style={[styles.analyticsSubtextMobile, { color: ink.dim }]}>
                        Tap for {galPeriodWeek ? "month" : "week"}
                      </Text>
                    </Card.Content>
                  </Card>
                </Pressable>
              )}
              {mostUsedColor && mostUsedColor.totalGal > 0 && (
                <Pressable
                  style={[
                    styles.analyticsCardMobile,
                    isMobileLandscape && styles.analyticsCardMobileLandscape,
                    styles.analyticsCardFilter,
                  ]}
                  onPress={() => setMostUsedByWeek((prev) => !prev)}
                >
                  <Card style={styles.analyticsCardInner}>
                    <Card.Content
                      style={[
                        styles.analyticsCardMobileContent,
                        isMobileLandscape &&
                          styles.analyticsCardMobileContentLandscape,
                      ]}
                    >
                      <Text style={[styles.analyticsLabelMobile, { color: ink.muted }]}>
                        Most checked out
                      </Text>
                      <Title
                        style={[styles.analyticsValueMobile, { fontSize: 14, color: ink.primary }]}
                        numberOfLines={1}
                      >
                        {mostUsedColor.name}
                      </Title>
                      <Text style={[styles.analyticsSubtextMobile, { color: ink.dim }]}>
                        {mostUsedColor.totalGal} gal
                      </Text>
                    </Card.Content>
                  </Card>
                </Pressable>
              )}
            </View>
          )}

          {viewMode === "inventory" ? (
            filteredAndSortedInventory.length === 0 ? (
              <AppEmptyState
                title={
                  searchQuery ? "No items found" : "No items in inventory"
                }
                subtitle={
                  searchQuery
                    ? "Try a different search term"
                    : "Scan a QR Code to add your first item"
                }
              />
            ) : (
              <View style={[styles.list, styles.listLandscape]}>
                {filteredAndSortedInventory.map((item) => (
                  <View key={item.id?.toString() || Math.random().toString()}>
                    {renderItem({ item })}
                  </View>
                ))}
              </View>
            )
          ) : colorBookItems.length === 0 ? (
            <AppEmptyState
              title={
                searchQuery
                  ? "No paint colors found"
                  : "No paint colors with hex in inventory"
              }
              subtitle={
                searchQuery
                  ? "Try a different search"
                  : "Add paint items with a color (hex) to see them here"
              }
            />
          ) : (
            <View
              style={[styles.list, styles.listLandscape, styles.colorBookGrid]}
            >
              {colorBookItems.map((item) => (
                <React.Fragment
                  key={item.id?.toString() || String(Math.random())}
                >
                  {renderColorCard({ item })}
                </React.Fragment>
              ))}
            </View>
          )}
        </ScrollView>
        </PullToRefresh>
        {mobileListFades.top ? (
          <EdgeFade color={theme.colors.background} side="top" />
        ) : null}
        {mobileListFades.bottom ? (
          <EdgeFade color={theme.colors.background} side="bottom" />
        ) : null}
        </View>
        {receivePoModal}
        {itemActionPopover}
        <ColorPreviewModal />
        {inventoryStatModals}
      </>
    );
  }

  // Mobile portrait: fixed header, scrollable list only
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.headerMobilePortrait}>
        <View style={styles.headerFilterRow}>
          <View style={styles.headerFilterGroup}>
            {isAdmin && viewMode !== "colorBook" && (
              <AppButton
                // Keep mode constant to avoid layout shift between outlined/contained
                mode="outlined"
                compact
                onPress={() =>
                  setListOrderMode((prev) =>
                    prev === "trueOrder" ? "alphabetical" : "trueOrder",
                  )
                }
                style={[
                  styles.viewModeButtonMobile,
                  styles.viewModeButtonLong,
                  listOrderMode === "trueOrder" && {
                    backgroundColor: theme.dark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                  },
                ]}
                contentStyle={invBtnContentStyle}
                labelStyle={invBtnLabelStyle}
                disabled={bookFilter === "custom"}
              >
                {listOrderMode === "trueOrder" ? "True Order" : "Alphabetical"}
              </AppButton>
            )}
            <AppButton
              mode={bookFilter === "standard" ? "outlined" : "contained"}
              compact
              onPress={toggleBookFilter}
              style={styles.viewModeButtonMobile}
              contentStyle={invBtnContentStyle}
              labelStyle={invBtnLabelStyle}
            >
              {bookFilter === "standard" ? "Stock" : "Custom"}
            </AppButton>
          </View>
          <View style={styles.headerFilterRowRight}>
            <AppButton
              mode={viewMode === "colorBook" ? "contained" : "outlined"}
              compact
              onPress={toggleViewMode}
              style={[
                styles.viewModeButtonMobile,
                styles.viewModeButtonColorBook,
              ]}
              contentStyle={invBtnContentStyle}
              labelStyle={invBtnLabelStyle}
              icon="palette-outline"
            >
              {viewMode === "colorBook" ? "Inventory" : "Color Book"}
            </AppButton>
          </View>
        </View>
      </View>

      <View style={styles.searchbarWrap}>
        <View style={styles.filterSummaryRow}>
          <Text style={styles.filterSummaryText}>
            {viewMode === "colorBook"
              ? bookFilter === "standard"
                ? "Stock"
                : "Custom"
              : bookFilter === "custom"
                ? "Custom"
                : listOrderMode === "trueOrder"
                  ? "Stock - True order"
                  : "Stock - Alphabetical"}
          </Text>
        </View>
        <View style={styles.searchRow}>
          <OutlinedSearchInput
            ref={searchInputRef}
            placeholder={
              viewMode === "colorBook"
                  ? "Search by name or color"
                  : "Search or Scan"
            }
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
            onSubmitEditing={handleSearchSubmit}
          />
          {actorName && viewMode !== "colorBook" ? (
            <View
              ref={receivePoAnchorRef}
              collapsable={false}
              style={styles.receivePoButtonWrap}
            >
              <AppButton
                mode="outlined"
                compact
                icon="truck-delivery"
                onPress={openReceivePoModal}
                style={styles.receivePoButton}
                contentStyle={invBtnContentStyle}
                labelStyle={invBtnLabelStyle}
              >
                Receive PO
              </AppButton>
            </View>
          ) : null}
        </View>
      </View>
      {effectiveRecycleDue && (
        <View style={styles.recycleDueBanner}>
          <Text style={styles.recycleDueBannerText}>
            Showing: Paint Needing Recycle
          </Text>
          <AppButton
            mode="text"
            compact
            onPress={() => {
              setRecycleDueOnly(false);
              onClearRecycleDueFilter?.();
            }}
          >
            Clear Filter
          </AppButton>
        </View>
      )}
      <View style={styles.listContent}>
        <PullToRefresh
          style={styles.listPullRefresh}
          contentStyle={styles.listPullRefreshContent}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          atTop={
            (viewMode === "inventory" &&
              filteredAndSortedInventory.length === 0) ||
            (viewMode === "colorBook" && colorBookItems.length === 0)
              ? true
              : listAtTop
          }
        >
          {viewMode === "inventory" &&
          filteredAndSortedInventory.length === 0 ? (
            <AppEmptyState
              title={searchQuery ? "No items found" : "No items in inventory"}
              subtitle={
                searchQuery
                  ? "Try a different search term"
                  : "Scan a QR Code to add your first item"
              }
            />
          ) : viewMode === "colorBook" && colorBookItems.length === 0 ? (
            <AppEmptyState
              title={
                searchQuery
                  ? "No paint colors found"
                  : "No paint colors with hex in inventory"
              }
              subtitle={
                searchQuery
                  ? "Try a different search"
                  : "Add paint items with a color (hex) to see them here"
              }
            />
          ) : (
            <View style={[styles.listFlex, styles.tableScrollFadeHost]}>
              <FlatList
                ref={listRef}
                key={viewMode}
                data={
                  viewMode === "inventory"
                    ? filteredAndSortedInventory
                    : colorBookItems
                }
                renderItem={
                  viewMode === "inventory" ? renderItem : renderColorCard
                }
                keyExtractor={(item) =>
                  item.id?.toString() || String(Math.random())
                }
                numColumns={viewMode === "colorBook" ? 2 : 1}
                columnWrapperStyle={
                  viewMode === "colorBook" ? styles.colorBookRow : undefined
                }
                style={styles.listFlex}
                contentContainerStyle={
                  viewMode === "colorBook" ? styles.colorBookList : styles.list
                }
                keyboardDismissMode="none"
                keyboardShouldPersistTaps="handled"
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } =
                    e.nativeEvent;
                  const y = contentOffset.y ?? 0;
                  setListAtTop(y <= 2);
                  setScrollOffset(y);
                  notifyViewState({ scrollOffset: y });
                  syncScrollFades(
                    setMobileListFades,
                    y,
                    contentSize.height,
                    layoutMeasurement.height,
                  );
                }}
                onContentSizeChange={(_w, h) => {
                  mobileListMetricsRef.current.contentH = h;
                  const layoutH = mobileListMetricsRef.current.layoutH;
                  if (layoutH > 0) {
                    syncScrollFades(
                      setMobileListFades,
                      scrollOffset,
                      h,
                      layoutH,
                    );
                  }
                }}
                onLayout={(e) => {
                  const layoutH = e.nativeEvent.layout.height;
                  mobileListMetricsRef.current.layoutH = layoutH;
                  const contentH = mobileListMetricsRef.current.contentH;
                  if (contentH > 0) {
                    syncScrollFades(
                      setMobileListFades,
                      scrollOffset,
                      contentH,
                      layoutH,
                    );
                  }
                }}
                scrollEventThrottle={16}
              />
              {mobileListFades.top ? (
                <EdgeFade color={theme.colors.background} side="top" />
              ) : null}
              {mobileListFades.bottom ? (
                <EdgeFade color={theme.colors.background} side="bottom" />
              ) : null}
            </View>
          )}
        </PullToRefresh>
      </View>
      {receivePoModal}
      {itemActionPopover}
      <ColorPreviewModal />
      {inventoryStatModals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  listContent: {
    flex: 1,
    minHeight: 0,
  },
  listPullRefresh: {
    flex: 1,
    minHeight: 0,
  },
  listPullRefreshContent: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web"
      ? { overflowY: "hidden", overflowX: "hidden" }
      : { overflow: "hidden" }),
  },
  listFlex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  headerMobilePortrait: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 12,
  },
  headerRow1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
  headerFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  headerFilterRowRight: {
    marginLeft: "auto",
  },
  headerFilterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerFilterGroupSpacer: {
    marginRight: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  placeholder: {
    width: 80,
  },
  refreshContainer: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 80,
    justifyContent: "flex-end",
  },
  refreshIndicator: {
    marginLeft: 4,
  },
  searchbarWrap: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  searchbar: {
    margin: 0,
    height: 52,
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === "web" && { minHeight: 52 }),
  },
  receivePoButton: {
    flexShrink: 0,
    alignSelf: "center",
    margin: 0,
    height: 36,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  receivePoButtonWrap: {
    flexShrink: 0,
    alignSelf: "center",
  },
  receivePoKb: {
    flex: 1,
  },
  receivePoOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  receivePoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  receivePoBox: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "88%",
    borderRadius: 12,
    padding: 18,
    elevation: 4,
    zIndex: 1,
  },
  receivePoTitle: {
    fontWeight: "600",
    marginBottom: 8,
  },
  receivePoHelp: {
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  receivePoListScroll: {
    maxHeight: 320,
    marginBottom: 8,
  },
  receivePoOrderRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  receivePoOrderPo: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  receivePoOrderMeta: {
    fontSize: 12,
    marginBottom: 6,
  },
  receivePoOrderPreview: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  receivePoActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 8,
  },
  receivePoDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  receivePoDetailScroll: {
    maxHeight: 360,
    marginBottom: 8,
  },
  receivePoLineCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  receivePoLineName: {
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
  },
  filterSummaryRow: {
    marginBottom: 4,
  },
  filterSummaryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  list: {
    padding: 16,
  },
  mobileLandscapeScrollWeb: {
    overflow: "auto",
    overflowX: "hidden",
  },
  mobileLandscapeScrollContent: {
    paddingBottom: 32,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  itemCardContent: {
    flexDirection: "column",
  },
  itemCardPressable: {
    marginBottom: 0,
  },
  itemHeaderRight: {
    alignItems: "flex-end",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  itemMetaSpacer: {
    flex: 1,
  },
  itemBadgeRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  itemBadge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.lg,
    backgroundColor: kitColors.semantic.badgeBg,
    borderWidth: 1,
    borderColor: kitColors.semantic.badgeBorder,
  },
  itemBadgeLate: {
    backgroundColor: kitColors.semantic.lateBadgeBg,
    borderColor: kitColors.semantic.lateBadgeBorder,
  },
  itemBadgeBackOrder: {
    backgroundColor: kitColors.semantic.backOrderBadgeBg,
    borderColor: kitColors.semantic.backOrderBadgeBorder,
  },
  itemBadgeText: {
    ...kitType.badge,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    minHeight: 32,
  },
  colorPreviewButton: {
    margin: -4,
  },
  colorPreviewButtonBottom: {
    margin: -4,
    marginLeft: 8,
  },
  inventoryColorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  nonClickableCard: {
    // Remove any visual indication that it's clickable
    opacity: 1,
  },
  // lowStockCard style is now handled inline with theme-aware colors
  lowStockText: {
    color: kitColors.semantic.lowStockText,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
    gap: 8,
  },
  itemNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  itemNameHit: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  itemName: {
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 0,
  },
  itemQuantity: {
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 0,
  },
  itemLocation: {
    fontSize: 14,
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  itemId: {
    fontSize: 12,
    fontFamily: fontFamily.mono,
    marginBottom: 4,
  },
  copyableIdHit: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  copyableIdHitCentered: {
    alignSelf: "center",
  },
  copiedHint: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 2,
    marginBottom: 2,
  },
  onOrderText: {
    fontSize: 12,
    marginBottom: 2,
  },
  onOrderBlock: {
    marginBottom: 4,
  },
  onOrderDateText: {
    fontSize: 11,
    marginTop: 0,
  },
  onOrderPoText: {
    fontSize: 11,
    marginTop: 2,
  },
  lastScanned: {
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: kitColors.light.textMuted,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: kitColors.light.textDim,
    textAlign: "center",
  },
  colorModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  colorModalBox: {
    position: "relative",
    width: "100%",
    maxWidth: 320,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 4px 16px rgba(0,0,0,0.3)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }),
  },
  colorModalSwatchWrapper: {
    position: "relative",
    width: "100%",
    aspectRatio: 1.1,
    minHeight: 280,
  },
  colorModalSwatch: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  colorModalStainWatermark: {
    position: "absolute",
    top: 50,
    left: 30,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  colorModalStainWatermarkText: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 55,
    transform: [{ rotate: "45deg" }],
  },
  colorModalNameRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
  },
  colorModalName: {
    fontSize: 18,
    fontWeight: "600",
  },
  colorModalColorLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  colorModalId: {
    fontSize: 13,
    fontFamily: fontFamily.mono,
    marginTop: 4,
  },
  colorModalClose: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  locationColCell: {
    flex: 1.1,
    minWidth: 110,
    paddingRight: 28,
  },
  nameColCell: {
    flex: 2,
    minWidth: 160,
  },
  tableNameCellInner: {
    maxWidth: "100%",
    minWidth: 0,
  },
  qtyColCell: {
    flex: 0.85,
    minWidth: 90,
  },
  idColCell: {
    flex: 1,
    minWidth: 130,
    alignItems: "center",
  },
  typeColCell: {
    flex: 1,
    minWidth: 100,
  },
  colorColHeader: {
    flexGrow: 0,
    flexShrink: 0,
    width: 56,
    paddingRight: 6,
  },
  colorColCell: {
    flexGrow: 0,
    flexShrink: 0,
    width: 56,
    paddingRight: 6,
  },
  onOrderColCell: {
    flex: 1.15,
    minWidth: 110,
    paddingLeft: 6,
  },
  recycleColCell: {
    minWidth: 118,
    paddingLeft: 6,
    paddingRight: 8,
  },
  recycleDateText: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 4,
  },
  recycleDateUnderName: {
    fontSize: 12,
    marginTop: 2,
  },
  recycleDateUnderNameTable: {
    fontSize: 11,
    marginTop: 2,
  },
  recycleDateTableText: {
    fontSize: 12,
  },
  recycleDateDue: {
    color: kitColors.semantic.recycleDueDate,
    fontWeight: "600",
  },
  jobsColCell: {
    minWidth: 160,
    paddingLeft: 6,
    paddingRight: 12,
  },
  // Web/Dashboard Styles
  webDesktopRoot: {
    flex: 1,
    minHeight: 0,
  },
  webContainer: {
    maxWidth: 1600,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  webContainerFlex: {
    flex: 1,
    minHeight: 0,
  },
  webContentCentered: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 1200,
  },
  webContentCenteredFlex: {
    flex: 1,
    minHeight: 0,
  },
  webScrollContent: {},
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  webHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    marginLeft: -12,
  },
  webTitle: {
    fontSize: 28,
    fontWeight: "bold",
  },
  recycleDueBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 152, 0, 0.15)",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  recycleDueBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: kitColors.semantic.recycleBannerText,
  },
  analyticsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  invStatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  invStatModalCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    maxHeight: "85%",
  },
  invStatModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  invStatModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  invStatModalHint: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  invStatModalList: {
    paddingBottom: 8,
    gap: 8,
  },
  invStatModalItem: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  invStatModalItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  invStatModalItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  invStatModalItemValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  analyticsCard: {
    flex: 1,
    minWidth: 180,
    elevation: 2,
    borderRadius: 12,
  },
  analyticsCardInner: {
    flex: 1,
  },
  analyticsCardContent: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  analyticsCardFilter: {
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  analyticsCardFilterActive: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderWidth: 2,
    borderRadius: 12,
  },
  analyticsRowMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  analyticsRowMobileLandscape: {
    gap: 4,
    paddingHorizontal: 10,
  },
  analyticsCardMobile: {
    minWidth: 72,
    flex: 1,
    elevation: 2,
    maxWidth: 120,
    borderRadius: 12,
  },
  analyticsCardMobileLandscape: {
    minWidth: 64,
    maxWidth: 96,
  },
  analyticsCardMobileContent: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  analyticsCardMobileContentLandscape: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  listLandscape: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  analyticsLabelMobile: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 0,
  },
  analyticsValueMobile: {
    fontSize: 16,
    fontWeight: "bold",
  },
  analyticsSubtextMobile: {
    fontSize: 9,
    marginTop: 1,
  },
  analyticsLabel: {
    fontSize: 11,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  analyticsValueUnit: {
    fontSize: 14,
  },
  analyticsSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
  tableCardWrapper: {
    flex: 1,
    minHeight: 0,
    marginTop: 8,
  },
  tableCardFlex: {
    flex: 1,
    minHeight: 0,
    elevation: 2,
  },
  tableCardContentFlex: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 0,
  },
  tableCard: {
    elevation: 2,
  },
  tableHeader: {
    flexDirection: "column",
    gap: 8,
  },
  tableHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tableHeaderTopRight: {
    alignItems: "flex-end",
  },
  tableHeaderSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minWidth: 0,
  },
  webSearchbar: {
    flex: 1,
    minWidth: 0,
    elevation: 0,
    height: 52,
    ...(Platform.OS === "web" && { minHeight: 52 }),
  },
  colorBookSearchbar: {
    marginBottom: 8,
    elevation: 0,
    height: 52,
    maxHeight: 52,
    width: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web" && { minHeight: 52 }),
  },
  searchbarInput: {
    fontSize: 13,
    paddingVertical: 0,
    ...(Platform.OS === "android" && { textAlignVertical: "center" }),
    ...(Platform.OS === "web" && { paddingVertical: 12 }),
  },
  resultCount: {
    fontSize: 12,
    color: kitColors.light.textMuted,
  },
  orderToggleButton: {
    alignSelf: "center",
  },
  orderToggleRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  orderToggleButtonMobile: {
    alignSelf: "flex-start",
  },
  tableWithStaticHeader: {
    flex: 1,
    minHeight: 0,
    minWidth: 1100,
  },
  tableScrollOuter: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    ...(Platform.OS === "web" && {
      overflowY: "auto",
      overflowX: "hidden",
    }),
  },
  tableScrollFadeHost: {
    position: "relative",
  },
  tableScrollOuterContent: {
    flexGrow: 0,
  },
  tableScrollHorizontal: {
    flexGrow: 0,
  },
  dataTable: {
    minWidth: 1100,
  },
  tableCell: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 100,
  },
  lastScannedCell: {
    flex: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 200,
  },
  materialTypeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: "500",
  },
  tableColorLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: "600",
    // No hardcoded color - uses theme color like itemNameText for dark mode compatibility
  },
  idText: {
    fontSize: 12,
    fontFamily: fontFamily.mono,
    // Color is set inline based on theme
  },
  locationText: {
    fontSize: 13,
    // Color is set inline based on theme
  },
  timeText: {
    fontSize: 12,
    fontWeight: "400", // Normal weight, not bold
    // Color is set inline based on theme
  },
  lastScannedByText: {
    fontSize: 13,
    fontWeight: "700", // Bold for user name
    // Color is set inline based on theme
    marginBottom: 2,
  },
  userText: {
    fontSize: 11,
    color: kitColors.light.textDim,
    marginTop: 2,
  },
  // lowStockRow style is now handled inline with theme-aware colors
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  colorBookList: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  colorBookRow: {
    justifyContent: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  colorBookCardWrap: {
    width: Platform.OS === "web" ? "calc((100% - 12px) / 2)" : "47%",
    marginBottom: 4,
  },
  colorBookCard: {
    width: "100%",
    aspectRatio: 1.3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  colorBookCardName: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 2,
    fontWeight: "500",
  },
  colorBookCardLabel: {
    fontSize: 10,
    marginTop: 2,
    marginLeft: 2,
    fontWeight: "500",
  },
  colorBookGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  viewModeButton: {
    margin: 0,
    marginRight: 0,
    minWidth: 68,
    height: 36,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  viewModeButtonContent: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  viewModeButtonLabel: {
    fontSize: 13,
    marginVertical: 0,
    lineHeight: 18,
  },
  viewModeButtonColorBook: {
    marginLeft: 0,
    minWidth: 118,
  },
  viewModeButtonMobile: {
    margin: 0,
    marginRight: 0,
    minWidth: 68,
    height: 36,
    borderRadius: radius.md,
    justifyContent: "center",
  },
  viewModeButtonLong: {
    minWidth: 0,
  },
  colorBookScrollDesktop: {
    flex: 1,
    minHeight: 0,
  },
  colorBookGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 16,
    padding: 16,
    paddingBottom: 24,
  },
  colorBookCardWrapDesktop: {
    width: "calc((100% - 48px) / 4)",
    marginBottom: 0,
  },
});
