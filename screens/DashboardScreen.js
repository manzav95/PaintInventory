import React, { useState, useMemo, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import {
  Card,
  Text,
  Title,
  Paragraph,
  Searchbar,
  useTheme,
  DataTable,
  Chip,
} from "react-native-paper";
import AuditService from "../services/auditService";

export default function DashboardScreen({
  inventory,
  onRefresh,
  isRefreshing = false,
}) {
  const theme = useTheme();
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    try {
      const logs = await AuditService.list(500); // Get more logs for dashboard
      setAuditLogs(logs);
    } catch (error) {
      console.error("Error loading audit logs:", error);
    }
  };

  // Calculate most used color
  const mostUsedColor = useMemo(() => {
    const colorUsage = {};
    auditLogs.forEach((log) => {
      if (
        log.itemId &&
        (log.action === "check_in" ||
          log.action === "check_out" ||
          log.action === "update")
      ) {
        const item = inventory.find((i) => i.id === log.itemId);
        if (item) {
          colorUsage[item.name] = (colorUsage[item.name] || 0) + 1;
        }
      }
    });

    const sorted = Object.entries(colorUsage).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0
      ? { name: sorted[0][0], count: sorted[0][1] }
      : null;
  }, [auditLogs, inventory]);

  // Filter audit logs by search
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return auditLogs;
    const query = searchQuery.toLowerCase();
    return auditLogs.filter((log) => {
      const item = inventory.find((i) => i.id === log.itemId);
      const itemName = item?.name?.toLowerCase() || "";
      const userName = log.userName?.toLowerCase() || "";
      const action = log.action?.toLowerCase() || "";
      const itemId = log.itemId?.toLowerCase() || "";

      return (
        itemName.includes(query) ||
        userName.includes(query) ||
        action.includes(query) ||
        itemId.includes(query)
      );
    });
  }, [auditLogs, searchQuery, inventory]);

  const getActionColor = (action, details) => {
    // Handle old records with _actionType in details (for backward compatibility)
    if (action === "update" && details && details._actionType) {
      if (details._actionType === "check_in") {
        return "#81c784"; // Subtle green
      } else if (details._actionType === "check_out") {
        return "#e57373"; // Subtle red
      }
    }

    switch (action) {
      case "check_in":
        return "#81c784"; // Subtle green
      case "check_out":
        return "#e57373"; // Subtle red
      case "add":
        return "#64b5f6"; // Subtle blue
      case "delete":
        return "#f44336";
      case "update":
        return "#ba68c8"; // Subtle purple
      case "change_id":
        return "#ff5722";
      default:
        return "#757575";
    }
  };

  const formatAction = (action, details, itemId) => {
    // Check if this is an old record with _actionType in details (for backward compatibility)
    if (action === "update" && details && details._actionType) {
      if (details._actionType === "check_in") {
        return "Checked In";
      } else if (details._actionType === "check_out") {
        return "Checked Out";
      }
    }

    // Map action types to display text
    if (action === "add") {
      return "New Entry";
    } else if (action === "check_in") {
      return "Checked In";
    } else if (action === "check_out") {
      return "Checked Out";
    } else if (action === "update") {
      // If it's an update with quantity change, it's a manual adjustment
      // (check_in/check_out are now logged separately)
      return "Manual Adjustment";
    } else if (action === "delete") {
      return "Deleted";
    } else if (action === "change_id") {
      return "ID Changed";
    } else if (action === "set_next_id") {
      return "Next ID Set";
    }
    return action;
  };

  const getQuantity = (action, details, itemId) => {
    // Return the amount of gallons that were manipulated (changed)
    if (details) {
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out"));

      if (isCheckInOut) {
        // For check_in and check_out, show the quantity change amount
        if (typeof details.quantityChange === "number") {
          return Math.abs(details.quantityChange);
        } else if (typeof details._quantityChange === "number") {
          // Old records might have _quantityChange
          return Math.abs(details._quantityChange);
        }
      }

      // For manual adjustment (update), show the quantity change
      if (action === "update" && typeof details.quantityChange === "number") {
        return Math.abs(details.quantityChange);
      }

      // For add, show the initial quantity added
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    return "-";
  };

  const getTotalQuantity = (action, details, itemId) => {
    // Get the total quantity of the item AT THE TIME OF THIS TRANSACTION
    // This is stored in the audit log details as newQuantity or quantity
    if (details) {
      // First check for newQuantity (the total after the transaction) - new format
      if (typeof details.newQuantity === "number") {
        return details.newQuantity;
      }

      // For old records: check_in/check_out/update actions, the quantity field contains the new total
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out"));

      if (isCheckInOut && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For manual adjustment (update without _actionType), quantity is the new total
      if (action === "update" && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For add actions, use the quantity field (initial quantity)
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    // For delete actions, show 0 (after deletion, quantity is 0)
    if (action === "delete") {
      return 0;
    }

    return "-";
  };

  const getItemName = (itemId) => {
    const item = inventory.find((i) => i.id === itemId);
    return item?.name || itemId || "Unknown";
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      <View style={styles.dashboardContainer}>
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total Colors</Text>
              <Title style={styles.statValue}>{inventory.length}</Title>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Low Stock</Text>
              <Title style={[styles.statValue, { color: "#ff6b6b" }]}>
                {inventory.filter((item) => (item.quantity || 0) < 30).length}
              </Title>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total Gallons</Text>
              <Title style={styles.statValue}>
                {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
              </Title>
            </Card.Content>
          </Card>

          {mostUsedColor && (
            <Card style={styles.statCard}>
              <Card.Content>
                <Text style={styles.statLabel}>Most Used</Text>
                <Title
                  style={[styles.statValue, { fontSize: 18 }]}
                  numberOfLines={1}
                >
                  {mostUsedColor.name}
                </Title>
                <Text style={styles.statSubtext}>
                  {mostUsedColor.count} transactions
                </Text>
              </Card.Content>
            </Card>
          )}
        </View>

        {/* Transaction History */}
        <Card style={styles.historyCard}>
          <Card.Content>
            <View style={styles.historyHeader}>
              <Title style={styles.historyTitle}>Transaction History</Title>
              <Searchbar
                placeholder="Search transactions..."
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchbar}
                inputStyle={styles.searchbarInput}
              />
            </View>

            {filteredLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No transactions found</Text>
              </View>
            ) : (
              <ScrollView horizontal style={styles.tableScroll}>
                <DataTable style={styles.dataTable}>
                  <DataTable.Header>
                    <DataTable.Title style={styles.timeCell}>
                      Time
                    </DataTable.Title>
                    <DataTable.Title style={styles.userCell}>
                      User
                    </DataTable.Title>
                    <DataTable.Title style={styles.qtyCell} numeric>
                      Qty (gal)
                    </DataTable.Title>
                    <DataTable.Title style={styles.actionCell}>
                      Action
                    </DataTable.Title>
                    <DataTable.Title style={styles.colorCell}>
                      Color
                    </DataTable.Title>
                    <DataTable.Title style={styles.totalCell} numeric>
                      Total (gal)
                    </DataTable.Title>
                  </DataTable.Header>

                  {filteredLogs.slice(0, 100).map((log, index) => {
                    const actionText = formatAction(
                      log.action,
                      log.details,
                      log.itemId,
                    );
                    const quantity = getQuantity(
                      log.action,
                      log.details,
                      log.itemId,
                    );
                    const colorName = getItemName(log.itemId);
                    const totalQuantity = getTotalQuantity(
                      log.action,
                      log.details,
                      log.itemId,
                    );

                    return (
                      <DataTable.Row key={index}>
                        <DataTable.Cell style={styles.timeCell}>
                          <Text style={styles.timeText}>
                            {new Date(log.timestamp).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.userCell}>
                          <Text
                            style={[
                              styles.userText,
                              { color: theme.dark ? "#fff" : "#666" },
                            ]}
                          >
                            {log.userName || "Unknown"}
                          </Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.qtyCell} numeric>
                          <Text
                            style={[
                              styles.quantityText,
                              { color: theme.dark ? "#fff" : "#000" },
                            ]}
                          >
                            {quantity !== "-" ? `${quantity}` : "-"}
                          </Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.actionCell}>
                          <Chip
                            style={{
                              backgroundColor:
                                getActionColor(log.action, log.details) + "20",
                            }}
                            textStyle={{
                              color: getActionColor(log.action, log.details),
                              fontSize: 11,
                            }}
                          >
                            {actionText}
                          </Chip>
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.colorCell}>
                          <Text
                            style={[
                              styles.itemNameText,
                              { color: theme.dark ? "#fff" : undefined },
                            ]}
                          >
                            {colorName}
                          </Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.totalCell} numeric>
                          <Text
                            style={[
                              styles.totalText,
                              { color: theme.dark ? "#fff" : "#000" },
                            ]}
                          >
                            {totalQuantity !== "-" ? `${totalQuantity}` : "-"}
                          </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  dashboardContainer: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: 200,
    elevation: 2,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#6f95ab",
  },
  statSubtext: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  historyCard: {
    elevation: 2,
  },
  historyHeader: {
    marginBottom: 16,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  searchbar: {
    marginBottom: 0,
    elevation: 0,
  },
  searchbarInput: {
    fontSize: 14,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  tableScroll: {
    maxHeight: 600,
  },
  dataTable: {
    minWidth: 900,
  },
  // Fixed width cells based on content needs
  timeCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 120, // "Dec 25, 2:30 PM"
  },
  userCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 70, // User names are typically short
  },
  qtyCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 90, // "5 gal" or numbers
  },
  actionCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 140, // "Checked In", "Manual Adjustment", etc.
  },
  colorCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 250, // Paint color names can be longer - increased to show full text
    flexShrink: 0, // Prevent shrinking
  },
  totalCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 100, // Total quantity numbers
  },
  timeText: {
    fontSize: 12,
    color: "#666",
  },
  itemNameText: {
    fontSize: 13,
    fontWeight: "500",
  },
  userText: {
    fontSize: 12,
    // Color is set inline based on theme
  },
  quantityText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
  totalText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
});
