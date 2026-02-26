import React, { useState, useMemo } from "react";
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

export default function InventoryListScreen({
  inventory,
  onItemSelect,
  onBack,
  onRefresh,
  isRefreshing = false,
  isAdmin = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name"); // 'name', 'quantity', 'lastScanned', 'location'
  const [sortOrder, setSortOrder] = useState("asc"); // 'asc', 'desc'

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalGallons = inventory.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
    const lowStockCount = inventory.filter(
      (item) => (item.quantity || 0) < 30,
    ).length;
    const inStockCount = inventory.filter(
      (item) => (item.quantity || 0) >= 30,
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

    // Recently scanned (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyScanned = inventory.filter((item) => {
      if (!item.lastScanned) return false;
      return new Date(item.lastScanned) > sevenDaysAgo;
    }).length;

    return {
      totalGallons,
      lowStockCount,
      inStockCount,
      outOfStockCount,
      topLocations,
      recentlyScanned,
    };
  }, [inventory]);

  // Filter and sort inventory
  const filteredAndSortedInventory = useMemo(() => {
    let filtered = inventory.filter((item) => {
      const query = searchQuery.toLowerCase();
      return (
        item.name?.toLowerCase().includes(query) ||
        item.id?.toString().toLowerCase().includes(query) ||
        item.location?.toLowerCase().includes(query)
      );
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
  }, [inventory, searchQuery, sortBy, sortOrder]);

  const renderItem = ({ item }) => {
    const isLowStock = (item.quantity || 0) < 30;
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
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.webScrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.webContainer}>
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
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>In Stock</Text>
                <Title style={[styles.analyticsValue, { color: "#4caf50" }]}>
                  {analytics.inStockCount}
                </Title>
              </Card.Content>
            </Card>
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>Low Stock</Text>
                <Title style={[styles.analyticsValue, { color: "#ff9800" }]}>
                  {analytics.lowStockCount}
                </Title>
              </Card.Content>
            </Card>
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>Out of Stock</Text>
                <Title style={[styles.analyticsValue, { color: "#f44336" }]}>
                  {analytics.outOfStockCount}
                </Title>
              </Card.Content>
            </Card>
            <Card style={styles.analyticsCard}>
              <Card.Content>
                <Text style={styles.analyticsLabel}>Recently Scanned</Text>
                <Title style={styles.analyticsValue}>
                  {analytics.recentlyScanned}
                </Title>
                <Text style={styles.analyticsSubtext}>Last 7 days</Text>
              </Card.Content>
            </Card>
          </View>

          {/* Top Locations */}
          {analytics.topLocations.length > 0 && (
            <Card style={styles.locationsCard}>
              <Card.Content>
                <Text style={styles.sectionTitle}>Top Locations</Text>
                <View style={styles.locationsList}>
                  {analytics.topLocations.map(([location, count]) => (
                    <Chip key={location} style={styles.locationChip}>
                      {location}: {count}
                    </Chip>
                  ))}
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Search and Table */}
          <Card style={styles.tableCard}>
            <Card.Content>
              <View style={styles.tableHeader}>
                <Searchbar
                  placeholder="Search by name, ID, or location..."
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
                    {searchQuery ? "No items found" : "No items in inventory"}
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal style={styles.tableScroll}>
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
                        Last Scanned By {getSortIcon("lastScanned")}
                      </DataTable.Title>
                      <DataTable.Title style={styles.tableCell}>
                        Status
                      </DataTable.Title>
                    </DataTable.Header>

                    {filteredAndSortedInventory.map((item) => {
                      const isLowStock = (item.quantity || 0) < 30;
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
                            {item.lastScanned ? (
                              <View>
                                <Text
                                  style={[
                                    styles.lastScannedByText,
                                    { color: theme.dark ? "#fff" : "#333" },
                                  ]}
                                >
                                  {item.lastScannedBy || "Unknown"}
                                </Text>
                                <Text
                                  style={[
                                    styles.timeText,
                                    { color: theme.dark ? "#fff" : "#666" },
                                  ]}
                                >
                                  {new Date(item.lastScanned).toLocaleString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Text>
                              </View>
                            ) : (
                              <Text
                                style={[
                                  styles.timeText,
                                  { color: theme.dark ? "#fff" : "#666" },
                                ]}
                              >
                                Never
                              </Text>
                            )}
                          </DataTable.Cell>
                          <DataTable.Cell style={styles.tableCell}>
                            {isOutOfStock ? (
                              <Chip
                                style={{ backgroundColor: "#f4433620" }}
                                textStyle={{ color: "#f44336", fontSize: 11 }}
                              >
                                Out
                              </Chip>
                            ) : isLowStock ? (
                              <Chip
                                style={{ backgroundColor: "#ff980020" }}
                                textStyle={{ color: "#ff9800", fontSize: 11 }}
                              >
                                Low
                              </Chip>
                            ) : (
                              <Chip
                                style={{ backgroundColor: "#4caf5020" }}
                                textStyle={{ color: "#4caf50", fontSize: 11 }}
                              >
                                OK
                              </Chip>
                            )}
                          </DataTable.Cell>
                        </DataTable.Row>
                      );
                    })}
                  </DataTable>
                </ScrollView>
              )}
            </Card.Content>
          </Card>
        </View>
      </ScrollView>
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
        placeholder="Search items..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
      />

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
          contentContainerStyle={styles.list}
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
    padding: 16,
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
  webContainer: {
    maxWidth: 1600,
    width: "100%",
    alignSelf: "center",
    padding: 20,
  },
  webScrollContent: {},
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
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
  locationsCard: {
    marginBottom: 24,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  locationsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  locationChip: {
    marginRight: 8,
    marginBottom: 8,
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
  tableScroll: {
    maxHeight: 600,
  },
  dataTable: {
    minWidth: 1000,
  },
  tableCell: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 120,
  },
  lastScannedCell: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 180, // Wider to accommodate name and time
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
