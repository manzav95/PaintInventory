import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  useWindowDimensions,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import {
  Card,
  Text,
  Button,
  Searchbar,
  useTheme,
  IconButton,
  ActivityIndicator,
  DataTable,
  Chip,
  Title,
  TextInput,
} from "react-native-paper";
import AuditService from "../services/auditService";

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];
const STANDARD_TYPES = ["paint", "primer", "clear", "catalyst", "stain", "dye"];

function isRecycleDue(item) {
  const rd = item.recycle_date;
  if (!rd || (item.quantity || 0) <= 0) return false;
  if (!CUSTOM_TYPES.includes((item.type || "").toLowerCase())) return false;
  const d = new Date(rd);
  if (isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

export default function InventoryListScreen({
  inventory,
  minQuantity = 30,
  onItemSelect,
  onBack,
  onRefresh,
  isRefreshing = false,
  isAdmin = false,
  onOrderSummary = {},
  recycleDueFilter = false,
  onClearRecycleDueFilter,
  onScanCode,
  initialViewMode = "inventory",
  initialBookFilter,
  initialScrollOffset = 0,
  onViewStateChange,
}) {
  const theme = useTheme();
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
  const [auditLogs, setAuditLogs] = useState([]);
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);
  const [galPeriodWeek, setGalPeriodWeek] = useState(true); // true = show week, false = show month (toggle one card)
  const [colorPreviewItem, setColorPreviewItem] = useState(null);
  const [viewMode, setViewMode] = useState(initialViewMode || "inventory"); // 'inventory' | 'colorBook' — default to standard inventory
  const [bookFilter, setBookFilter] = useState(
    initialBookFilter || (recycleDueFilter ? "custom" : "standard"),
  ); // 'standard' | 'custom'
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef(null);
  const [scrollOffset, setScrollOffset] = useState(initialScrollOffset || 0);
  const listRef = useRef(null);
  const hasRestoredScrollRef = useRef(false);

  const notifyViewState = (next = {}) => {
    if (!onViewStateChange) return;
    onViewStateChange({
      viewMode,
      bookFilter,
      scrollOffset,
      ...next,
    });
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
    let cancelled = false;
    (async () => {
      try {
        const logs = await AuditService.list(1000);
        if (!cancelled) setAuditLogs(logs);
      } catch (e) {
        if (!cancelled) console.error("InventoryListScreen audit load:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (recycleDueFilter) {
      setBookFilter("custom");
      notifyViewState({ bookFilter: "custom" });
    }
  }, [recycleDueFilter]);

  const handleBack = () => {
    onClearRecycleDueFilter?.();
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
    const outOfStockCount = inventory.filter(
      (item) => (item.quantity || 0) === 0,
    ).length;

    // Group by location
    const byLocation = {};
    inventory.forEach((item) => {
      const loc = item.location || "Unspecified";
      byLocation[loc] = (byLocation[loc] || 0) + 1;
    });
    const topLocations = Object.entries(byLocation)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalGallons,
      lowStockCount,
      outOfStockCount,
      topLocations,
    };
  }, [inventory, minQuantity]);

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

  const getActionLabel = (log) => {
    if (!log) return null;
    const a = log.action;
    const d = log.details;
    if (a === "check_in") return "Checked in";
    if (a === "check_out") return "Checked out";
    if (a === "receiving" || (a === "update" && d?._actionType === "receiving"))
      return "Receiving";
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
      const matchesSearch =
        item.name?.toLowerCase().includes(query) ||
        item.id?.toString().toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query) ||
        item.type?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      const qty = item.quantity || 0;
      if (stockFilter === "outOfStock") return qty === 0;
      if (stockFilter === "inStock")
        return qty > 0 && qty >= (item.minQuantity ?? min);
      if (stockFilter === "lowStock")
        return qty > 0 && qty < (item.minQuantity ?? min);
      const itemType = (item.type || "").toLowerCase();
      if (bookFilter === "standard" && CUSTOM_TYPES.includes(itemType))
        return false;
      if (bookFilter === "custom" && !CUSTOM_TYPES.includes(itemType))
        return false;
      if (recycleDueFilter && !isRecycleDue(item)) return false;
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
    recycleDueFilter,
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
        if (recycleDueFilter && !isRecycleDue(item)) return false;
        if (!query) return true;
        return (
          item.name?.toLowerCase().includes(query) ||
          item.id?.toString().toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        (a.name || "")
          .toLowerCase()
          .localeCompare((b.name || "").toLowerCase()),
      );
  }, [inventory, searchQuery, bookFilter, recycleDueFilter]);

  const renderColorCard = ({ item, desktop = false }) => {
    const bgHex = getValidHex(item.hex_color) || "#e0e0e0";
    const name = item.name || "Unnamed";
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
      </Pressable>
    );
  };

  const ColorPreviewModal = () => {
    const it = colorPreviewItem;
    if (!it) return null;
    const bgHex = getValidHex(it.hex_color) || "#e0e0e0";
    const name = it.name || "Unnamed";
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
                  style={styles.colorModalStainWatermark}
                  pointerEvents="none"
                >
                  <Text
                    style={[
                      styles.colorModalStainWatermarkText,
                      { color: theme.dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)" },
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
                  backgroundColor: theme.dark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
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
              <Text
                style={[
                  styles.colorModalId,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                ID: {it.id != null ? String(it.id) : "—"}
              </Text>
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

  const renderItem = ({ item }) => {
    const isLowStock =
      (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30);
    const itemId = item.id?.toString() || "N/A";

    // Theme-aware low stock card style
    const lowStockCardStyle = isLowStock
      ? {
          borderLeftWidth: 4,
          borderLeftColor: "#ff6b6b",
          backgroundColor: theme.dark ? "#3a3a3a" : "#fef5f5", // Subtle gray in dark mode, very light pink in light mode
        }
      : null;

    return (
      <Card style={[styles.card, lowStockCardStyle]}>
        <Card.Content style={styles.itemCardContent}>
          <Pressable
            style={styles.itemCardPressable}
            onPress={() => onItemSelect(item)}
          >
            <View style={styles.itemHeader}>
              <Text
                style={[styles.itemName, isLowStock && styles.lowStockText]}
              >
                {item.name || "Unnamed Item"}
              </Text>
              <View style={styles.itemHeaderRight}>
                <Text
                  style={[
                    styles.itemQuantity,
                    isLowStock && styles.lowStockText,
                  ]}
                >
                  {item.quantity || 0} gal
                </Text>
              </View>
            </View>
            {item.location && (
              <Text style={styles.itemLocation}>📍 {item.location}</Text>
            )}
            <Text style={styles.itemId}>ID: {itemId}</Text>
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
                const textColor = isLate ? "#c62828" : theme.colors.primary;
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
                  </View>
                );
              }
              return null;
            })()}
            {(() => {
              const t = item.type ? String(item.type).toLowerCase() : "";
              const label =
                t === "custom_paint"
                  ? "Custom Paint"
                  : t === "custom_stain"
                    ? "Custom Stain"
                    : item.type
                      ? String(item.type).charAt(0).toUpperCase() +
                        String(item.type).slice(1).toLowerCase()
                      : "";
              const materialTypeColor =
                t === "paint" || t === "custom_paint"
                  ? "#1565c0"
                  : t === "clear"
                    ? "#e65100"
                    : t === "stain" || t === "custom_stain"
                      ? "#2e7d32"
                      : t === "primer"
                        ? theme.dark
                          ? "#f5f5dc"
                          : "#5d4037"
                        : t === "dye"
                          ? "#7e57c2"
                          : t === "catalyst"
                            ? "#9a7b00"
                            : theme.dark
                              ? "#fff"
                              : "#666";
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
            <View style={styles.cardBottomRow}>
              <Text
                style={styles.lastScanned}
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
          {/* Header */}
          <View style={styles.webHeader}>
            <View style={styles.webHeaderLeft}>
              <Button
                icon="arrow-left"
                onPress={handleBack}
                mode="text"
                style={styles.backButton}
              >
                Back
              </Button>
              <Title style={styles.webTitle}>Inventory Dashboard</Title>
            </View>
            <View style={styles.refreshContainer}>
              <View
                style={[
                  styles.headerFilterGroup,
                  styles.headerFilterGroupSpacer,
                ]}
              >
                {isAdmin && viewMode !== "colorBook" && (
                  <Button
                    mode={
                      listOrderMode === "trueOrder" ? "contained" : "outlined"
                    }
                    compact
                    onPress={() =>
                      setListOrderMode((prev) =>
                        prev === "trueOrder" ? "alphabetical" : "trueOrder",
                      )
                    }
                    style={[styles.viewModeButton, styles.viewModeButtonLong]}
                    disabled={bookFilter === "custom"}
                  >
                    {listOrderMode === "trueOrder"
                      ? "Alphabetical"
                      : "True Order"}
                  </Button>
                )}
                <Button
                  mode={bookFilter === "standard" ? "outlined" : "contained"}
                  compact
                  onPress={() =>
                    setBookFilter((prev) =>
                      prev === "standard" ? "custom" : "standard",
                    )
                  }
                  style={styles.viewModeButton}
                >
                  {bookFilter === "standard" ? "Stock" : "Custom"}
                </Button>
              </View>
              <Button
                mode={viewMode === "colorBook" ? "contained" : "outlined"}
                compact
                onPress={() =>
                  setViewMode(
                    viewMode === "colorBook" ? "inventory" : "colorBook",
                  )
                }
                style={styles.viewModeButtonColorBook}
                icon="palette-outline"
              >
                {viewMode === "colorBook" ? "Inventory" : "Color Book"}
              </Button>
              <IconButton
                icon="refresh"
                size={24}
                onPress={onRefresh}
                disabled={isRefreshing}
                iconColor={theme.colors.primary}
              />
              {isRefreshing && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={styles.refreshIndicator}
                />
              )}
            </View>
          </View>

          {recycleDueFilter && (
            <View style={styles.recycleDueBanner}>
              <Text style={styles.recycleDueBannerText}>
                Showing: Paint Needing Recycle
              </Text>
              {onClearRecycleDueFilter && (
                <Button mode="text" compact onPress={onClearRecycleDueFilter}>
                  Clear Filter
                </Button>
              )}
            </View>
          )}

          {/* Color Book view (desktop): 4-column grid */}
          {viewMode === "colorBook" ? (
            <View
              style={[styles.webContentCentered, styles.webContentCenteredFlex]}
            >
              <Searchbar
                placeholder="Search colors by name or ID..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.colorBookSearchbar}
                inputStyle={styles.searchbarInput}
              />
              {colorBookItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {searchQuery
                      ? "No paint colors found"
                      : "No paint colors with hex in inventory"}
                  </Text>
                </View>
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
                  <Card style={styles.analyticsCard}>
                    <Card.Content>
                      <Text style={styles.analyticsLabel}>Total Gallons</Text>
                      <Title style={styles.analyticsValue}>
                        {analytics.totalGallons.toLocaleString()}
                      </Title>
                    </Card.Content>
                  </Card>
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
                      <Card style={styles.analyticsCardInner}>
                        <Card.Content>
                          <Text style={styles.analyticsLabel}>
                            Low Stock
                            {stockFilter === "lowStock" ? " (filtering)" : ""}
                          </Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              { color: "#ff9800" },
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
                      <Card style={styles.analyticsCardInner}>
                        <Card.Content>
                          <Text style={styles.analyticsLabel}>
                            Out of Stock
                            {stockFilter === "outOfStock"
                              ? " (filtering)"
                              : ""}
                          </Text>
                          <Title
                            style={[
                              styles.analyticsValue,
                              { color: "#f44336" },
                            ]}
                          >
                            {analytics.outOfStockCount}
                          </Title>
                        </Card.Content>
                      </Card>
                    </Pressable>
                  )}
                  <Pressable
                    style={[
                      styles.analyticsCard,
                      styles.analyticsCardFilter,
                    ]}
                    onPress={() => setGalPeriodWeek((prev) => !prev)}
                  >
                    <Card style={styles.analyticsCardInner}>
                      <Card.Content>
                        <Text style={styles.analyticsLabel}>
                          Checked out this {galPeriodWeek ? "week" : "month"}
                        </Text>
                      <Title style={styles.analyticsValue}>
                        {galPeriodWeek
                          ? gallonsUsedThisWeek
                          : gallonsUsedThisMonth}
                        <Text style={styles.analyticsValueUnit}> gal</Text>
                      </Title>
                      <Text style={styles.analyticsSubtext}>
                        {galPeriodWeek
                          ? thisWeekRange.label
                          : thisMonthRange.label}
                      </Text>
                      <Text style={styles.analyticsSubtext}>
                        Tap for {galPeriodWeek ? "month" : "week"}
                      </Text>
                    </Card.Content>
                    </Card>
                  </Pressable>
                  {mostUsedColor && (
                    <Pressable
                      style={[
                        styles.analyticsCard,
                        styles.analyticsCardFilter,
                      ]}
                      onPress={() => setMostUsedByWeek((prev) => !prev)}
                    >
                      <Card style={styles.analyticsCardInner}>
                        <Card.Content>
                          <Text style={styles.analyticsLabel}>
                            Most gallons checked out
                          </Text>
                        <Title
                          style={[styles.analyticsValue, { fontSize: 18 }]}
                          numberOfLines={1}
                        >
                          {mostUsedColor.name}
                        </Title>
                        <Text style={styles.analyticsSubtext}>
                          {mostUsedColor.totalGal} gal —{" "}
                          {mostUsedColor.isWeek
                            ? `week of ${mostUsedColor.periodLabel}`
                            : mostUsedColor.periodLabel}
                        </Text>
                        <Text style={styles.analyticsSubtext}>
                          Tap for {mostUsedByWeek ? "month" : "week"}
                        </Text>
                      </Card.Content>
                    </Card>
                  </Pressable>
                  )}
                </View>

                {/* Search and Table - fills remaining height, scrolls internally */}
                <View style={styles.tableCardWrapper}>
                  <Card style={styles.tableCardFlex}>
                    <Card.Content style={styles.tableCardContentFlex}>
                      <View style={styles.tableHeader}>
                        <View style={styles.filterSummaryRow}>
                          <Text style={styles.filterSummaryText}>
                            {bookFilter === "custom"
                              ? "Custom"
                              : listOrderMode === "trueOrder"
                                ? "Stock - True order"
                                : "Stock - Alphabetical"}
                          </Text>
                        </View>
                        <View style={styles.tableHeaderSearchRow}>
                          <Searchbar
                            placeholder="Search by name, ID, location, or type..."
                            onChangeText={setSearchQuery}
                            value={searchQuery}
                            style={styles.webSearchbar}
                            inputStyle={styles.searchbarInput}
                          />
                          <Text style={styles.resultCount}>
                            {filteredAndSortedInventory.length} of{" "}
                            {inventory.length} items
                          </Text>
                        </View>
                      </View>

                      {filteredAndSortedInventory.length === 0 ? (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyText}>
                            {searchQuery
                              ? "No items found"
                              : "No items in inventory"}
                          </Text>
                        </View>
                      ) : (
                        <ScrollView
                          style={styles.tableScrollOuter}
                          contentContainerStyle={styles.tableScrollOuterContent}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled
                          refreshControl={
                            <RefreshControl
                              refreshing={isRefreshing}
                              onRefresh={onRefresh}
                              tintColor={theme.colors.primary}
                            />
                          }
                        >
                          <ScrollView
                            horizontal
                            style={styles.tableScrollHorizontal}
                            showsHorizontalScrollIndicator={true}
                          >
                            <DataTable style={styles.dataTable}>
                              <DataTable.Header>
                                <DataTable.Title
                                  style={styles.tableCell}
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
                                  style={styles.tableCell}
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
                                  style={[
                                    styles.tableCell,
                                    styles.idColCell,
                                  ]}
                                >
                                  ID
                                </DataTable.Title>
                                <DataTable.Title style={styles.tableCell}>
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
                                  style={[
                                    styles.tableCell,
                                    styles.onOrderColCell,
                                  ]}
                                >
                                  On order
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
                              </DataTable.Header>

                              {filteredAndSortedInventory.map((item) => {
                                const isLowStock =
                                  (item.quantity || 0) <
                                  (item.minQuantity ?? minQuantity ?? 30);
                                const isOutOfStock = (item.quantity || 0) === 0;
                                return (
                                  <DataTable.Row
                                    key={item.id}
                                    onPress={() => onItemSelect(item)}
                                    style={
                                      isLowStock
                                        ? {
                                            backgroundColor: theme.dark
                                              ? "#3a3a3a"
                                              : "#fef5f5", // Subtle gray in dark mode, very light pink in light mode
                                            borderLeftWidth: 4,
                                            borderLeftColor: "#ff6b6b",
                                          }
                                        : undefined
                                    }
                                  >
                                    <DataTable.Cell style={styles.tableCell}>
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
                                    </DataTable.Cell>
                                    <DataTable.Cell style={styles.tableCell}>
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
                                      <Text
                                        style={[
                                          styles.idText,
                                          {
                                            color: theme.dark ? "#fff" : "#666",
                                          },
                                        ]}
                                      >
                                        {item.id || "N/A"}
                                      </Text>
                                    </DataTable.Cell>
                                    <DataTable.Cell style={styles.tableCell}>
                                      {(() => {
                                        const t = item.type
                                          ? String(item.type).toLowerCase()
                                          : "";
                                        const label =
                                          t === "custom_paint"
                                            ? "Custom Paint"
                                            : t === "custom_stain"
                                              ? "Custom Stain"
                                              : item.type
                                                ? String(item.type)
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                  String(item.type)
                                                    .slice(1)
                                                    .toLowerCase()
                                                : "";
                                        const materialTypeColor =
                                          t === "paint" || t === "custom_paint"
                                            ? "#1565c0"
                                            : t === "clear"
                                              ? "#e65100"
                                              : t === "stain" ||
                                                  t === "custom_stain"
                                                ? "#2e7d32"
                                                : t === "primer"
                                                  ? theme.dark
                                                    ? "#f5f5dc"
                                                    : "#5d4037"
                                                  : t === "dye"
                                                    ? "#7e57c2"
                                                    : t === "catalyst"
                                                      ? "#9a7b00"
                                                      : theme.dark
                                                        ? "#fff"
                                                        : "#666";
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
                                            color: theme.dark ? "#fff" : "#666",
                                          },
                                        ]}
                                      >
                                        {item.location || "-"}
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
                                              backgroundColor:
                                                getValidHex(item.hex_color),
                                            },
                                          ]}
                                        />
                                      ) : null}
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
                                          const expDate = orderInfo.expectedDate
                                            ? new Date(orderInfo.expectedDate)
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
                                            ? "#c62828"
                                            : theme.colors.primary;
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
                                            </View>
                                          );
                                        }
                                        return null;
                                      })()}
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
                                                      : "#666",
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
                                                      : "#666",
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
                                                  : "#666",
                                              },
                                            ]}
                                          >
                                            Never
                                          </Text>
                                        );
                                      })()}
                                    </DataTable.Cell>
                                  </DataTable.Row>
                                );
                              })}
                            </DataTable>
                          </ScrollView>
                        </ScrollView>
                      )}
                    </Card.Content>
                  </Card>
                </View>
              </View>
            </View>
          )}
          <ColorPreviewModal />
        </View>
      </View>
    );
  }

  // Mobile View (original card-based layout)
  // Mobile landscape: whole page (header + search + stats + list) in one ScrollView with overflow scroll
  if (isMobileLandscape) {
    return (
      <>
        <ScrollView
          style={[
            styles.container,
            { backgroundColor: theme.colors.background },
            Platform.OS === "web" && styles.mobileLandscapeScrollWeb,
          ]}
          contentContainerStyle={styles.mobileLandscapeScrollContent}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <View style={styles.header}>
            <Button icon="arrow-left" onPress={handleBack} mode="text">
              Back
            </Button>
            <Text style={styles.headerTitle}>
              {viewMode === "colorBook" ? "Color Book" : "Inventory"}
            </Text>
            <View style={styles.refreshContainer}>
              <View style={styles.headerFilterGroup}>
                {isAdmin && viewMode !== "colorBook" && (
                  <Button
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
                    disabled={bookFilter === "custom"}
                  >
                    {listOrderMode === "trueOrder"
                      ? "Display order"
                      : "Sort by display order"}
                  </Button>
                )}
                <Button
                  mode={bookFilter === "standard" ? "outlined" : "contained"}
                  compact
                  onPress={() =>
                    setBookFilter((prev) =>
                      prev === "standard" ? "custom" : "standard",
                    )
                  }
                  style={styles.viewModeButtonMobile}
                >
                  {bookFilter === "standard" ? "Stock" : "Custom"}
                </Button>
              </View>
              <Button
                mode={viewMode === "colorBook" ? "contained" : "outlined"}
                compact
                onPress={() =>
                  setViewMode(
                    viewMode === "colorBook" ? "inventory" : "colorBook",
                  )
                }
                style={[
                  styles.viewModeButtonMobile,
                  styles.viewModeButtonColorBook,
                ]}
                icon="palette-outline"
              >
                {viewMode === "colorBook" ? "Inventory" : "Color Book"}
              </Button>
              <IconButton
                icon="refresh"
                size={24}
                onPress={onRefresh}
                disabled={isRefreshing}
                iconColor={theme.colors.primary}
              />
              {isRefreshing && (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={styles.refreshIndicator}
                />
              )}
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
          <Searchbar
            placeholder={
              viewMode === "colorBook"
                ? "Search colors by name or ID..."
                : "Search by name, ID, location, or type..."
            }
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
          />
          {recycleDueFilter && (
            <View style={styles.recycleDueBanner}>
              <Text style={styles.recycleDueBannerText}>
                Showing: Paint Needing Recycle
              </Text>
              {onClearRecycleDueFilter && (
                <Button mode="text" compact onPress={onClearRecycleDueFilter}>
                  Clear Filter
                </Button>
              )}
            </View>
          )}
          {viewMode === "inventory" && (
            <View
              style={[
                styles.analyticsRowMobile,
                styles.analyticsRowMobileLandscape,
              ]}
            >
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
                    <Text style={styles.analyticsLabelMobile}>
                      Total Gallons
                    </Text>
                    <Title style={styles.analyticsValueMobile}>
                      {analytics.totalGallons.toLocaleString()}
                    </Title>
                  </Card.Content>
                </Card>
              )}
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
                      <Text style={styles.analyticsLabelMobile}>
                        Low Stock
                        {stockFilter === "lowStock" ? " (filtering)" : ""}
                      </Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: "#ff9800" },
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
                      <Text style={styles.analyticsLabelMobile}>
                        Out of Stock
                        {stockFilter === "outOfStock" ? " (filtering)" : ""}
                      </Text>
                      <Title
                        style={[
                          styles.analyticsValueMobile,
                          { color: "#f44336" },
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
                      <Text style={styles.analyticsLabelMobile}>
                        Gal this {galPeriodWeek ? "week" : "month"}
                      </Text>
                      <Title style={styles.analyticsValueMobile}>
                        {galPeriodWeek
                          ? gallonsUsedThisWeek
                          : gallonsUsedThisMonth}
                      </Title>
                      <Text style={styles.analyticsSubtextMobile}>
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
                    <Text style={styles.analyticsLabelMobile}>
                      Most checked out
                    </Text>
                    <Title
                      style={[styles.analyticsValueMobile, { fontSize: 14 }]}
                      numberOfLines={1}
                    >
                      {mostUsedColor.name}
                    </Title>
                    <Text style={styles.analyticsSubtextMobile}>
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
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {searchQuery ? "No items found" : "No items in inventory"}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchQuery
                    ? "Try a different search term"
                    : "Scan a QR Code to add your first item"}
                </Text>
              </View>
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
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? "No paint colors found"
                  : "No paint colors with hex in inventory"}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery
                  ? "Try a different search"
                  : "Add paint items with a color (hex) to see them here"}
              </Text>
            </View>
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
        <ColorPreviewModal />
      </>
    );
  }

  // Mobile portrait: fixed header, scrollable list only
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.headerMobilePortrait}>
        <View style={styles.headerRow1}>
          <Button icon="arrow-left" onPress={handleBack} mode="text">
            Back
          </Button>
          <Text style={styles.headerTitle}>
            {viewMode === "colorBook" ? "Color Book" : "Inventory"}
          </Text>
          <View style={styles.refreshContainer}>
            <IconButton
              icon="refresh"
              size={24}
              onPress={onRefresh}
              disabled={isRefreshing}
              iconColor={theme.colors.primary}
            />
            {isRefreshing && (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={styles.refreshIndicator}
              />
            )}
          </View>
        </View>
        <View style={styles.headerFilterRow}>
          <View style={styles.headerFilterGroup}>
            {isAdmin && viewMode !== "colorBook" && (
              <Button
                mode={listOrderMode === "trueOrder" ? "contained" : "outlined"}
                compact
                onPress={() =>
                  setListOrderMode((prev) =>
                    prev === "trueOrder" ? "alphabetical" : "trueOrder",
                  )
                }
                style={[styles.viewModeButtonMobile, styles.viewModeButtonLong]}
                disabled={bookFilter === "custom"}
              >
                {listOrderMode === "trueOrder"
                  ? "True Order"
                  : "Alphabetical"}
              </Button>
            )}
            <Button
              mode={bookFilter === "standard" ? "outlined" : "contained"}
              compact
              onPress={() =>
                setBookFilter((prev) =>
                  prev === "standard" ? "custom" : "standard",
                )
              }
              style={styles.viewModeButtonMobile}
            >
              {bookFilter === "standard" ? "Stock" : "Custom"}
            </Button>
          </View>
          <View style={styles.headerFilterRowRight}>
            <Button
              mode={viewMode === "colorBook" ? "contained" : "outlined"}
              compact
              onPress={() =>
                setViewMode(viewMode === "colorBook" ? "inventory" : "colorBook")
              }
              style={[
                styles.viewModeButtonMobile,
                styles.viewModeButtonColorBook,
              ]}
              icon="palette-outline"
            >
              {viewMode === "colorBook" ? "Inventory" : "Color Book"}
            </Button>
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
        <Searchbar
          placeholder={
            viewMode === "colorBook"
              ? "Search colors by name or ID..."
              : "Search by name, ID, location, or type..."
          }
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
        />
        {onScanCode && isWeb && (
          <TextInput
            label="Scan material code"
            value={scanInput}
            onChangeText={setScanInput}
            ref={scanInputRef}
            mode="outlined"
            style={styles.scanInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Ready for scanner input"
            onSubmitEditing={() => {
              const trimmed = scanInput.trim();
              if (trimmed && onScanCode) {
                onScanCode(trimmed);
                setScanInput("");
                notifyViewState();
              }
            }}
            blurOnSubmit={false}
            keyboardType="default"
          />
        )}
      </View>
      {recycleDueFilter && (
        <View style={styles.recycleDueBanner}>
          <Text style={styles.recycleDueBannerText}>
            Showing: Paint Needing Recycle
          </Text>
          {onClearRecycleDueFilter && (
            <Button mode="text" compact onPress={onClearRecycleDueFilter}>
              Clear Filter
            </Button>
          )}
        </View>
      )}
      <View style={styles.listContent}>
        {viewMode === "inventory" && filteredAndSortedInventory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? "No items found" : "No items in inventory"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? "Try a different search term"
                : "Scan a QR Code to add your first item"}
            </Text>
          </View>
        ) : viewMode === "colorBook" && colorBookItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "No paint colors found"
                : "No paint colors with hex in inventory"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? "Try a different search"
                : "Add paint items with a color (hex) to see them here"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            key={viewMode}
            data={
              viewMode === "inventory"
                ? filteredAndSortedInventory
                : colorBookItems
            }
            renderItem={viewMode === "inventory" ? renderItem : renderColorCard}
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
              />
            }
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              setScrollOffset(y);
              notifyViewState({ scrollOffset: y });
            }}
            scrollEventThrottle={16}
          />
        )}
      </View>
      <ColorPreviewModal />
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
    borderBottomColor: "#eee",
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
    paddingBottom: 8,
  },
  searchbar: {
    margin: 0,
  },
  scanInput: {
    marginTop: 8,
  },
  filterSummaryRow: {
    marginBottom: 4,
  },
  filterSummaryText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666",
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
    color: "#ff6b6b",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    marginRight: 8,
  },
  itemQuantity: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6f95ab",
  },
  itemLocation: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  itemId: {
    fontSize: 12,
    color: "#999",
    fontFamily: "monospace",
    marginBottom: 4,
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
  lastScanned: {
    fontSize: 12,
    color: "#999",
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
    color: "#666",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  colorModalName: {
    fontSize: 18,
    fontWeight: "600",
  },
  colorModalId: {
    fontSize: 13,
    fontFamily: "monospace",
    marginTop: 4,
  },
  colorModalClose: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  locationColCell: {
    paddingRight: 28,
  },
  idColCell: {
    minWidth: 130,
  },
  colorColHeader: {
    width: 56,
    paddingRight: 6,
  },
  colorColCell: {
    width: 56,
    paddingRight: 6,
  },
  onOrderColCell: {
    paddingLeft: 6,
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
    borderBottomColor: "#eee",
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
    color: "#e65100",
  },
  analyticsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
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
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
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
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  analyticsCardMobileContentLandscape: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  listLandscape: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  analyticsLabelMobile: {
    fontSize: 10,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  analyticsValueMobile: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#6f95ab",
  },
  analyticsSubtextMobile: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
  analyticsLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analyticsValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#6f95ab",
  },
  analyticsValueUnit: {
    fontSize: 18,
    color: "#666",
  },
  analyticsSubtext: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
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
    marginBottom: 16,
    flexDirection: "column",
    gap: 8,
  },
  tableHeaderSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  webSearchbar: {
    flex: 1,
    elevation: 0,
  },
  colorBookSearchbar: {
    marginBottom: 12,
    elevation: 0,
    maxHeight: 56,
  },
  searchbarInput: {
    fontSize: 14,
  },
  resultCount: {
    fontSize: 12,
    color: "#666",
    whiteSpace: "nowrap",
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
  tableScrollOuter: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    ...(Platform.OS === "web" && {
      overflowY: "auto",
      overflowX: "hidden",
    }),
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
  quantityText: {
    fontSize: 14,
    fontWeight: "600",
    // No hardcoded color - uses theme color like itemNameText for dark mode compatibility
  },
  idText: {
    fontSize: 12,
    fontFamily: "monospace",
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
    color: "#999",
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
    justifyContent: "space-between",
    marginBottom: 12,
  },
  colorBookCardWrap: {
    width: "48%",
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
  colorBookGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  viewModeButton: {
    marginRight: 8,
    minWidth: 68,
    paddingHorizontal: 12,
  },
  viewModeButtonColorBook: {
    marginLeft: 8,
    minWidth: 128,
    paddingHorizontal: 12,
  },
  viewModeButtonMobile: {
    marginRight: 4,
    minWidth: 68,
    paddingHorizontal: 12,
  },
  viewModeButtonLong: {
    minWidth: 0,
    paddingHorizontal: 12,
  },
  colorBookScrollDesktop: {
    flex: 1,
    minHeight: 0,
  },
  colorBookGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    padding: 16,
    paddingBottom: 24,
  },
  colorBookCardWrapDesktop: {
    width: "24%",
    marginBottom: 16,
  },
});
