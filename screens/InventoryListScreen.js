import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  useWindowDimensions,
  ScrollView,
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
} from "react-native-paper";
import AuditService from "../services/auditService";

export default function InventoryListScreen({
  inventory,
  minQuantity = 30,
  onItemSelect,
  onBack,
  onRefresh,
  isRefreshing = false,
  isAdmin = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width, height } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const isLargeDesktop = isWeb && width > 1024; // full-height table, no page scroll; smaller gets page scroll
  const isMobileLandscape = !isDesktop && width > height;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name"); // 'name', 'quantity', 'lastScanned', 'location'
  const [sortOrder, setSortOrder] = useState("asc"); // 'asc', 'desc'
  const [stockFilter, setStockFilter] = useState(null); // null | 'inStock' | 'lowStock' | 'outOfStock'
  const [auditLogs, setAuditLogs] = useState([]);
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);

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
    return () => { cancelled = true; };
  }, []);

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalGallons = inventory.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
    const lowStockCount = inventory.filter(
      (item) =>
        (item.quantity || 0) <
        (item.minQuantity ?? minQuantity ?? 30),
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
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = now.toLocaleString("en-US", { month: "long", year: "numeric" });
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

  const getActionLabel = (log) => {
    if (!log) return null;
    const a = log.action;
    const d = log.details;
    if (a === "check_in") return "Checked in";
    if (a === "check_out") return "Checked out";
    if (a === "update" && d?._actionType === "check_in") return "Checked in";
    if (a === "update" && d?._actionType === "check_out") return "Checked out";
    if (a === "add") return "Added";
    if (a === "delete") return "Deleted";
    return "Updated";
  };

  // Filter and sort inventory (search + optional stock filter)
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
      return true;
    });

    // Sort
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

    return filtered;
  }, [inventory, searchQuery, sortBy, sortOrder, stockFilter, minQuantity]);

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
      <Card
        style={[
          styles.card,
          lowStockCardStyle,
          !isAdmin && styles.nonClickableCard,
        ]}
        onPress={isAdmin ? () => onItemSelect(item) : undefined}
      >
        <Card.Content>
          <View style={styles.itemHeader}>
            <Text style={[styles.itemName, isLowStock && styles.lowStockText]}>
              {item.name || "Unnamed Item"}
            </Text>
            <Text
              style={[styles.itemQuantity, isLowStock && styles.lowStockText]}
            >
              {item.quantity || 0} gal
            </Text>
          </View>
          {item.location && (
            <Text style={styles.itemLocation}>📍 {item.location}</Text>
          )}
          <Text style={styles.itemId}>ID: {itemId}</Text>
          {item.lastScanned && (
            <Text style={styles.lastScanned}>
              Last scanned:{" "}
              {new Date(item.lastScanned).toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              by {item?.lastScannedBy || "unknown"}
            </Text>
          )}
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

  // Desktop/Web Dashboard View
  if (isDesktop) {
    // Large desktop: full-height layout, no page scroll; only table scrolls. Tablet/phone landscape: page scrolls.
    const useFullHeight = isLargeDesktop;
    const WebRoot = useFullHeight ? View : ScrollView;
    const webRootProps = useFullHeight
      ? {
          style: [
            styles.container,
            styles.webDesktopRoot,
            { backgroundColor: theme.colors.background },
          ],
        }
      : {
          style: [styles.container, { backgroundColor: theme.colors.background }],
          contentContainerStyle: styles.webScrollContent,
          refreshControl: (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          ),
        };

    return (
      <WebRoot {...webRootProps}>
        <View style={[styles.webContainer, useFullHeight && styles.webContainerFlex]}>
          {/* Header */}
          <View style={styles.webHeader}>
            <View style={styles.webHeaderLeft}>
              <Button
                icon="arrow-left"
                onPress={onBack}
                mode="text"
                style={styles.backButton}
              >
                Back
              </Button>
              <Title style={styles.webTitle}>Inventory Dashboard</Title>
            </View>
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

          {/* Analytics + Table: centered on desktop to balance empty space */}
          <View style={styles.webContentCentered}>
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
              <Card
                style={[
                  styles.analyticsCard,
                  styles.analyticsCardFilter,
                  stockFilter === "lowStock" && styles.analyticsCardFilterActive,
                ]}
                onPress={() =>
                  setStockFilter((f) => (f === "lowStock" ? null : "lowStock"))
                }
              >
                <Card.Content>
                  <Text style={styles.analyticsLabel}>Low Stock</Text>
                  <Title style={[styles.analyticsValue, { color: "#ff9800" }]}>
                    {analytics.lowStockCount}
                  </Title>
                </Card.Content>
              </Card>
            )}
            {analytics.outOfStockCount > 0 && (
              <Card
                style={[
                  styles.analyticsCard,
                  styles.analyticsCardFilter,
                  stockFilter === "outOfStock" && styles.analyticsCardFilterActive,
                ]}
                onPress={() =>
                  setStockFilter((f) =>
                    f === "outOfStock" ? null : "outOfStock"
                  )
                }
              >
                <Card.Content>
                  <Text style={styles.analyticsLabel}>Out of Stock</Text>
                  <Title style={[styles.analyticsValue, { color: "#f44336" }]}>
                    {analytics.outOfStockCount}
                  </Title>
                </Card.Content>
              </Card>
            )}
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>Gal checked out this week</Text>
                <Title style={styles.analyticsValue}>
                  {gallonsUsedThisWeek}
                </Title>
                <Text style={styles.analyticsSubtext}>{thisWeekRange.label}</Text>
              </Card.Content>
            </Card>
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>Gal checked out this month</Text>
                <Title style={styles.analyticsValue}>
                  {gallonsUsedThisMonth}
                </Title>
                <Text style={styles.analyticsSubtext}>{thisMonthRange.label}</Text>
              </Card.Content>
            </Card>
            {mostUsedColor && (
              <Card
                style={styles.analyticsCard}
                onPress={() => setMostUsedByWeek((prev) => !prev)}
              >
                <Card.Content>
                  <Text style={styles.analyticsLabel}>Most gallons checked out</Text>
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
            )}
          </View>

          {/* Search and Table - on large desktop fills remaining height */}
          <View style={useFullHeight ? styles.tableCardWrapper : undefined}>
            <Card style={useFullHeight ? styles.tableCardFlex : styles.tableCard}>
              <Card.Content style={useFullHeight ? styles.tableCardContentFlex : undefined}>
                <View style={styles.tableHeader}>
                  <Searchbar
                    placeholder="Search by name, ID, location, or type..."
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={styles.webSearchbar}
                    inputStyle={styles.searchbarInput}
                  />
                  <Text style={styles.resultCount}>
                    {filteredAndSortedInventory.length} of {inventory.length}{" "}
                    items
                  </Text>
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
                    style={[
                      styles.tableScrollOuter,
                      !useFullHeight && styles.tableScrollOuterMaxHeight,
                    ]}
                    contentContainerStyle={styles.tableScrollOuterContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled
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
                        Paint Name {getSortIcon("name")}
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
                        Quantity {getSortIcon("quantity")}
                      </DataTable.Title>
                      <DataTable.Title style={styles.tableCell}>
                        ID
                      </DataTable.Title>
                      <DataTable.Title style={styles.tableCell}>
                        Material Type
                      </DataTable.Title>
                      <DataTable.Title style={styles.tableCell}>
                        Location
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
                        Last Action {getSortIcon("lastScanned")}
                      </DataTable.Title>
                    </DataTable.Header>

                    {filteredAndSortedInventory.map((item) => {
                      const isLowStock =
      (item.quantity || 0) < (item.minQuantity ?? minQuantity ?? 30);
                      const isOutOfStock = (item.quantity || 0) === 0;
                      return (
                        <DataTable.Row
                          key={item.id}
                          onPress={
                            isAdmin ? () => onItemSelect(item) : undefined
                          }
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
                          <DataTable.Cell style={styles.tableCell}>
                            <Text
                              style={[
                                styles.idText,
                                { color: theme.dark ? "#fff" : "#666" },
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
                              const label = item.type
                                ? String(item.type).charAt(0).toUpperCase() +
                                  String(item.type).slice(1).toLowerCase()
                                : "";
                              const materialTypeColor =
                                t === "paint"
                                  ? "#1565c0"
                                  : t === "clear"
                                    ? "#e65100"
                                    : t === "stain"
                                      ? "#2e7d32"
                                      : t === "primer"
                                        ? theme.dark
                                          ? "#f5f5dc"
                                          : "#5d4037"
                                        : t === "dye"
                                          ? "#7e57c2"
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
                          <DataTable.Cell style={styles.tableCell}>
                            <Text
                              style={[
                                styles.locationText,
                                { color: theme.dark ? "#fff" : "#666" },
                              ]}
                            >
                              {item.location || "-"}
                            </Text>
                          </DataTable.Cell>
                          <DataTable.Cell style={styles.lastScannedCell}>
                            {(() => {
                              const log =
                                lastLogByItemId[item.id != null ? String(item.id) : ""];
                              if (log) {
                                const ts = log.timestamp
                                  ? new Date(log.timestamp).toLocaleString(
                                      "en-US",
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )
                                  : "—";
                                const user = log.userName || "Unknown";
                                const actionLabel = getActionLabel(log);
                                return (
                                  <View>
                                    <Text
                                      style={[
                                        styles.timeText,
                                        {
                                          color: theme.dark ? "#fff" : "#666",
                                        },
                                      ]}
                                    >
                                      {ts}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.lastScannedByText,
                                        {
                                          color: theme.dark ? "#fff" : "#333",
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
                                    { color: theme.dark ? "#fff" : "#666" },
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
      </WebRoot>
    );
  }

  // Mobile View (original card-based layout)
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <Button icon="arrow-left" onPress={onBack} mode="text">
          Back
        </Button>
        <Text style={styles.headerTitle}>Inventory</Text>
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

      <Searchbar
        placeholder="Search by name, ID, location, or type..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
      />

      {/* Mobile stats: only in landscape; hide when value is 0; filter cards are tappable */}
      {isMobileLandscape && (
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
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Total Gallons</Text>
              <Title style={styles.analyticsValueMobile}>
                {analytics.totalGallons.toLocaleString()}
              </Title>
            </Card.Content>
          </Card>
        )}
        {analytics.lowStockCount > 0 && (
          <Card
            style={[
              styles.analyticsCardMobile,
              isMobileLandscape && styles.analyticsCardMobileLandscape,
              styles.analyticsCardFilter,
              stockFilter === "lowStock" && styles.analyticsCardFilterActive,
            ]}
            onPress={() =>
              setStockFilter((f) => (f === "lowStock" ? null : "lowStock"))
            }
          >
            <Card.Content
              style={[
                styles.analyticsCardMobileContent,
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Low Stock</Text>
              <Title style={[styles.analyticsValueMobile, { color: "#ff9800" }]}>
                {analytics.lowStockCount}
              </Title>
            </Card.Content>
          </Card>
        )}
        {analytics.outOfStockCount > 0 && (
          <Card
            style={[
              styles.analyticsCardMobile,
              isMobileLandscape && styles.analyticsCardMobileLandscape,
              styles.analyticsCardFilter,
              stockFilter === "outOfStock" && styles.analyticsCardFilterActive,
            ]}
            onPress={() =>
              setStockFilter((f) =>
                f === "outOfStock" ? null : "outOfStock"
              )
            }
          >
            <Card.Content
              style={[
                styles.analyticsCardMobileContent,
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Out of Stock</Text>
              <Title style={[styles.analyticsValueMobile, { color: "#f44336" }]}>
                {analytics.outOfStockCount}
              </Title>
            </Card.Content>
          </Card>
        )}
        {gallonsUsedThisWeek > 0 && (
          <Card
            style={[
              styles.analyticsCardMobile,
              isMobileLandscape && styles.analyticsCardMobileLandscape,
            ]}
          >
            <Card.Content
              style={[
                styles.analyticsCardMobileContent,
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Gal this week</Text>
              <Title style={styles.analyticsValueMobile}>
                {gallonsUsedThisWeek}
              </Title>
            </Card.Content>
          </Card>
        )}
        {gallonsUsedThisMonth > 0 && (
          <Card
            style={[
              styles.analyticsCardMobile,
              isMobileLandscape && styles.analyticsCardMobileLandscape,
            ]}
          >
            <Card.Content
              style={[
                styles.analyticsCardMobileContent,
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Gal this month</Text>
              <Title style={styles.analyticsValueMobile}>
                {gallonsUsedThisMonth}
              </Title>
            </Card.Content>
          </Card>
        )}
        {mostUsedColor && mostUsedColor.totalGal > 0 && (
          <Card
            style={[
              styles.analyticsCardMobile,
              isMobileLandscape && styles.analyticsCardMobileLandscape,
            ]}
            onPress={() => setMostUsedByWeek((prev) => !prev)}
          >
            <Card.Content
              style={[
                styles.analyticsCardMobileContent,
                isMobileLandscape && styles.analyticsCardMobileContentLandscape,
              ]}
            >
              <Text style={styles.analyticsLabelMobile}>Most checked out</Text>
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
        )}
      </View>
      )}

      {filteredAndSortedInventory.length === 0 ? (
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
        <FlatList
          data={filteredAndSortedInventory}
          renderItem={renderItem}
          keyExtractor={(item) =>
            item.id?.toString() || Math.random().toString()
          }
          contentContainerStyle={[
            styles.list,
            isMobileLandscape && styles.listLandscape,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    width: 80,
    justifyContent: "flex-end",
  },
  refreshIndicator: {
    marginLeft: 4,
  },
  searchbar: {
    margin: 16,
    marginTop: 0,
  },
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
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
    alignItems: "center",
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
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
  lastScanned: {
    fontSize: 12,
    color: "#999",
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
  webScrollContent: {},
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
  },
  analyticsCardFilter: {
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  analyticsCardFilterActive: {
    backgroundColor: "rgba(102, 126, 234, 0.12)",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  webSearchbar: {
    flex: 1,
    elevation: 0,
  },
  searchbarInput: {
    fontSize: 14,
  },
  resultCount: {
    fontSize: 12,
    color: "#666",
    whiteSpace: "nowrap",
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
  tableScrollOuterMaxHeight: {
    maxHeight: 560,
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
});
