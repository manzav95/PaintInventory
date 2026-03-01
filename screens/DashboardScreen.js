import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
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
  minQuantity = 30,
  onRefresh,
  isRefreshing = false,
  showTransactionTable = true,
  isAdmin = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);
  const [staleDays, setStaleDays] = useState(30);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    try {
      const logs = await AuditService.list(1000);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Error loading audit logs:", error);
    }
  };

  // Current week (Sun–Sat) and current month date ranges + labels
  const periodRange = useMemo(() => {
    const now = new Date();
    if (mostUsedByWeek) {
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
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
    return {
      start: first.getTime(),
      end: last.getTime(),
      label: monthLabel,
    };
  }, [mostUsedByWeek]);

  // This week (Sun–Sat) range for "gallons used this week"
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

  const gallonsUsedThisWeek = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      total += getQty(log);
    });
    return total;
  }, [auditLogs, thisWeekRange]);

  const notScannedCount = useMemo(() => {
    const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    return inventory.filter((item) => {
      if (!item.lastScanned) return true;
      return new Date(item.lastScanned).getTime() < cutoff;
    }).length;
  }, [inventory, staleDays]);

  const totalValue = useMemo(() => {
    return inventory.reduce((sum, item) => {
      const qty = item.quantity ?? 0;
      const price = item.price != null && !isNaN(Number(item.price)) ? Number(item.price) : 0;
      return sum + qty * price;
    }, 0);
  }, [inventory]);

  // Most used = color with largest qty checked out in the selected period (week or month)
  const mostUsedColor = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getCheckOutQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
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

  const isStandardUserVisibleAction = (log) => {
    const a = log.action;
    const d = log.details;
    if (a === "check_in" || a === "check_out" || a === "delete") return true;
    if (a === "update" && d?._actionType && (d._actionType === "check_in" || d._actionType === "check_out")) return true;
    return false;
  };

  const logsByRole = useMemo(() => {
    if (isAdmin) return auditLogs;
    return auditLogs.filter(isStandardUserVisibleAction);
  }, [auditLogs, isAdmin]);

  const getDisplayUserName = (log) => {
    const u = (log.userName || "").trim().toLowerCase();
    if (u && u !== "unknown") return log.userName;
    const adminOnly =
      ["add", "change_id", "set_next_id", "set_min_quantity", "delete"].includes(log.action) ||
      (log.action === "update" && !(log.details?._actionType === "check_in" || log.details?._actionType === "check_out"));
    return adminOnly ? "Admin" : (log.userName || "Unknown");
  };

  // Filter audit logs by search
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logsByRole;
    const query = searchQuery.toLowerCase();
    return logsByRole.filter((log) => {
      const item = inventory.find((i) => i.id === log.itemId);
      const itemName = item?.name?.toLowerCase() || "";
      const userName = (log.userName || "").toLowerCase();
      const action = log.action?.toLowerCase() || "";
      const itemId = log.itemId?.toLowerCase() || "";

      return (
        itemName.includes(query) ||
        userName.includes(query) ||
        action.includes(query) ||
        itemId.includes(query)
      );
    });
  }, [logsByRole, searchQuery, inventory]);

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

  const content = (
    <View style={[
      styles.dashboardContainer,
      isWeb && showTransactionTable && styles.dashboardContainerWeb,
    ]}>
      {/* Stats Cards */}
      <View style={styles.statsRow}>
          {isAdmin && (
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total items</Text>
              <Title style={styles.statValue}>{inventory.length}</Title>
              <Text style={styles.statSubtext}>
                {inventory.filter((i) => (i.type || "").toLowerCase() === "paint").length} paint
              </Text>
            </Card.Content>
          </Card>
          )}

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total Gallons</Text>
              <Title style={styles.statValue}>
                {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
              </Title>
            </Card.Content>
          </Card>

          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Gal checked out this week</Text>
              <Title style={styles.statValue}>{gallonsUsedThisWeek}</Title>
              <Text style={styles.statSubtext}>{thisWeekRange.label}</Text>
            </Card.Content>
          </Card>

          {isAdmin && (
          <Card
            style={styles.statCard}
            onPress={() => setStaleDays((d) => (d === 30 ? 60 : d === 60 ? 90 : 30))}
          >
            <Card.Content>
              <Text style={styles.statLabel}>
                Not scanned in <Text style={styles.staleDaysInline}>{staleDays}</Text> days
              </Text>
              <Title style={styles.statValue}>{notScannedCount}</Title>
              <Text style={styles.statSubtextHint}>Tap to change period</Text>
            </Card.Content>
          </Card>
          )}

          {isAdmin && (
          <Card style={styles.statCard}>
            <Card.Content>
              <Text style={styles.statLabel}>Total value</Text>
              <Title style={styles.statValue}>
                ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Title>
            </Card.Content>
          </Card>
          )}

          {mostUsedColor && (
            <Card
              style={styles.statCard}
              onPress={() => setMostUsedByWeek((prev) => !prev)}
            >
              <Card.Content>
                <Text style={styles.statLabel}>Most gallons checked out</Text>
                <Title
                  style={[styles.statValue, { fontSize: 18 }]}
                  numberOfLines={1}
                >
                  {mostUsedColor.name}
                </Title>
                <Text style={styles.statSubtext}>
                  {mostUsedColor.totalGal} gal — {mostUsedColor.isWeek ? `week of ${mostUsedColor.periodLabel}` : mostUsedColor.periodLabel}
                </Text>
                <Text style={styles.statSubtextHint}>
                  Tap for {mostUsedByWeek ? "month" : "week"}
                </Text>
              </Card.Content>
            </Card>
          )}
      </View>

      {showTransactionTable && (
        <>
          {/* Transaction History */}
          <Card style={[styles.historyCard, isWeb && styles.historyCardWeb]}>
            <Card.Content style={isWeb ? styles.historyCardContentWeb : undefined}>
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
                <ScrollView
                  style={[styles.tableScrollOuter, isWeb && styles.tableScrollOuterWeb]}
                  contentContainerStyle={styles.tableScrollOuterContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                >
                  <ScrollView
                    horizontal
                    style={styles.tableScrollHorizontal}
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.tableScrollHorizontalContent}
                  >
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

                    {filteredLogs.slice(0, 500).map((log, index) => {
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
                              {getDisplayUserName(log)}
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
              </ScrollView>
            )}
            </Card.Content>
          </Card>
        </>
      )}
    </View>
  );

  if (isWeb) {
    if (!showTransactionTable) {
      return (
        <ScrollView
          style={[styles.container, styles.containerWeb, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={styles.scrollContentStatsOnly}
          showsVerticalScrollIndicator={true}
        >
          {content}
        </ScrollView>
      );
    }
    return (
      <View style={[styles.container, styles.containerWeb, { backgroundColor: theme.colors.background }]}>
        {content}
      </View>
    );
  }

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
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web" && { overflow: "hidden" }),
  },
  containerWeb: {
    padding: 20,
    paddingTop: 8,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  scrollContentStatsOnly: {
    padding: 20,
    paddingTop: 8,
  },
  dashboardContainer: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
  },
  dashboardContainerWeb: {
    flex: 1,
    minHeight: 0,
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
  statSubtextHint: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
    fontStyle: "italic",
  },
  staleDaysInline: {
    fontSize: 11,
    color: "#666",
  },
  historyCard: {
    elevation: 2,
  },
  historyCardWeb: {
    flex: 1,
    minHeight: 0,
  },
  historyCardContentWeb: {
    flex: 1,
    minHeight: 0,
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
  tableScrollOuter: {
    maxHeight: 520,
    overflow: "hidden",
    ...(Platform.OS === "web" && {
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch",
    }),
  },
  tableScrollOuterWeb: {
    flex: 1,
    minHeight: 0,
    maxHeight: undefined,
  },
  tableScrollOuterContent: {
    flexGrow: 1,
  },
  tableScrollHorizontal: {
    flexGrow: 0,
  },
  tableScrollHorizontalContent: {
    flexGrow: 0,
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
