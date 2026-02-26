import React, { useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Card,
  Button,
  Text,
  Title,
  Paragraph,
  TextInput,
  Switch,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";

export default function HomeScreen({
  onScanQR,
  onAddManual,
  onViewInventory,
  inventory,
  userName,
  isAdmin,
  onSwitchUser,
  nextIdNumber,
  onSetNextIdNumber,
  isDarkMode,
  onToggleDarkMode,
  onRefresh,
  isRefreshing = false,
  onOpenSettings,
  isWeb = false,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024; // Same breakpoint as QRScanScreen

  const lowStockItems = useMemo(
    () => inventory.filter((item) => (item.quantity || 0) < 30),
    [inventory],
  );

  // Button text based on screen size
  const qrButtonText = isDesktop ? "Manual Entry" : "QR Scan or Text Input";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
        isWeb && styles.webContainer,
      ]}
    >
      {!isWeb && (
        <View style={styles.headerBar}>
          <Title style={styles.title}>Paint Inventory</Title>
          <View style={styles.headerButtons}>
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
            <IconButton
              icon="cog"
              size={24}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
          </View>
        </View>
      )}
      {isWeb && (
        <View style={styles.webHeader}>
          <Title style={styles.webTitle}>Quick Actions</Title>
          <View style={styles.webHeaderButtons}>
            <IconButton
              icon="refresh"
              size={20}
              onPress={onRefresh}
              disabled={isRefreshing}
              iconColor={theme.colors.primary}
            />
            <IconButton
              icon="cog"
              size={20}
              onPress={onOpenSettings}
              iconColor={theme.colors.primary}
            />
          </View>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && styles.webScrollContent,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          !isWeb ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          ) : undefined
        }
      >
        <View style={styles.content}>
          {lowStockItems.length > 0 ? (
            <Card style={styles.card}>
              <Card.Content>
                <Text style={styles.statLabel}>
                  Low Stock ({"< 30"} gallons)
                </Text>
                {lowStockItems.map((item) => (
                  <View key={item.id} style={styles.lowStockItem}>
                    <Text style={styles.lowStockName}>
                      {item.name || "Unnamed"}
                    </Text>
                    <Text style={styles.lowStockQty}>
                      {item.quantity || 0} gal
                    </Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          ) : (
            <Card style={styles.card}>
              <Card.Content>
                <Text style={styles.statLabel}>All paints in stock</Text>
                <Text style={styles.statValue}>✓</Text>
              </Card.Content>
            </Card>
          )}

          {isAdmin && (
            <Button
              mode="contained"
              onPress={onAddManual}
              style={styles.button}
              icon="plus-circle"
            >
              Add Item Manually
            </Button>
          )}

          <Button
            mode="contained"
            onPress={onScanQR}
            style={styles.button}
            icon={isDesktop ? "keyboard" : "qrcode-scan"}
          >
            {qrButtonText}
          </Button>

          <Button
            mode="outlined"
            onPress={onViewInventory}
            style={styles.button}
            icon="format-list-bulleted"
          >
            View Inventory
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Logged in as{" "}
              <Text style={styles.mono}>{isAdmin ? "Admin" : userName}</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 10,
    paddingBottom: 48,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "transparent",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  header: {
    marginTop: 30,
    marginBottom: 30,
    alignItems: "center",
  },
  refreshIndicator: {
    marginLeft: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  card: {
    marginBottom: 30,
    elevation: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
    color: "#6f95ab",
  },
  lowStockItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  lowStockName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff6b6b",
    flex: 1,
  },
  lowStockQty: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff6b6b",
  },
  button: {
    marginBottom: 15,
    paddingVertical: 8,
  },
  warning: {
    color: "#ff6b6b",
    textAlign: "center",
    marginBottom: 15,
    fontSize: 12,
  },
  footer: {
    alignItems: "center",
    paddingTop: 10,
  },
  footerText: {
    color: "#666",
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 6,
  },
  toggleLabel: {
    color: "#666",
    fontWeight: "600",
  },
  mono: {
    fontFamily: "monospace",
  },
  webContainer: {
    paddingTop: 20,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  webHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  webScrollContent: {
    padding: 0,
    paddingTop: 0,
    paddingBottom: 20,
  },
});
