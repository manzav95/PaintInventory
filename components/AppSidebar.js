import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Button,
  Text,
  Title,
  useTheme,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import NotificationsBell from "./NotificationsBell";
import version from "../version";

function NavButton({ label, icon, onPress, active }) {
  const theme = useTheme();
  return (
    <Button
      mode="outlined"
      onPress={onPress}
      icon={icon}
      style={[
        styles.navButton,
        active && {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: theme.colors.primary,
        },
      ]}
      textColor={active ? theme.colors.primary : theme.colors.onSurface}
      contentStyle={styles.navButtonContent}
    >
      {label}
    </Button>
  );
}

export default function AppSidebar({
  currentScreen,
  ordersInitialFilter,
  isAdmin,
  userName,
  inventory = [],
  inventoryLoaded = true,
  minQuantity = 30,
  isRefreshing = false,
  onNavigate,
  onAddManual,
  onRefresh,
  onOpenSettings,
  onToggleDarkMode,
  onSwitchUser,
  onOpenRecycleDue,
  onOpenBackOrders,
  onOpenLateOrders,
  onOpenLowStock,
  showCheckInOutNav = true,
}) {
  const theme = useTheme();

  const isOrdersActive =
    currentScreen === "orders" ||
    currentScreen === "placeOrder";
  const ordersFilterActive = (filter) =>
    currentScreen === "orders" && ordersInitialFilter === filter;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Title style={[styles.title, { color: theme.colors.onBackground }]}>
          Paint Inventory
        </Title>
        <View style={styles.headerIcons}>
          <NotificationsBell
            inventory={inventory}
            inventoryLoaded={inventoryLoaded}
            minQuantity={minQuantity}
            isAdmin={isAdmin}
            userName={userName}
            onOpenRecycleDue={onOpenRecycleDue}
            onOpenBackOrders={onOpenBackOrders}
            onOpenLateOrders={onOpenLateOrders}
            onOpenLowStock={onOpenLowStock}
          />
          <IconButton
            icon="cog"
            size={20}
            onPress={onOpenSettings}
            iconColor={theme.colors.primary}
          />
          <IconButton
            icon="refresh"
            size={20}
            onPress={onRefresh}
            disabled={isRefreshing}
            iconColor={theme.colors.primary}
          />
          {isRefreshing && (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          )}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
        Operations
      </Text>
      <NavButton
        label="Dashboard"
        icon="view-dashboard"
        active={currentScreen === "home"}
        onPress={() => onNavigate("home")}
      />
      {showCheckInOutNav && (
        <NavButton
          label="Check In / Check Out"
          icon="keyboard"
          active={currentScreen === "qrscan" || currentScreen === "checkinout"}
          onPress={() => onNavigate("qrscan")}
        />
      )}
      <NavButton
        label="View Inventory"
        icon="format-list-bulleted"
        active={currentScreen === "list"}
        onPress={() => onNavigate("list")}
      />

      {isAdmin && (
        <>
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Orders
          </Text>
          {onAddManual && (
            <NavButton
              label="Add Item"
              icon="plus-circle"
              active={currentScreen === "add"}
              onPress={onAddManual}
            />
          )}
          <NavButton
            label="Place Order"
            icon="cart-plus"
            active={currentScreen === "placeOrder"}
            onPress={() => onNavigate("placeOrder")}
          />
          <NavButton
            label="Purchase Orders"
            icon="truck-delivery"
            active={
              currentScreen === "orders" && ordersInitialFilter == null
            }
            onPress={() => onNavigate("orders", { ordersInitialFilter: null })}
          />
        </>
      )}

      <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
        Tracking
      </Text>
      <NavButton
        label="Material Usage"
        icon="chart-box"
        active={currentScreen === "materialUsage"}
        onPress={() => onNavigate("materialUsage")}
      />
      {isAdmin && (
        <NavButton
          label="Reports"
          icon="chart-line"
          active={currentScreen === "reports"}
          onPress={() => onNavigate("reports")}
        />
      )}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>
          {isAdmin ? "Admin" : userName}
        </Text>
        <Button mode="text" compact onPress={onSwitchUser}>
          Switch user
        </Button>
        <Button mode="text" compact onPress={onToggleDarkMode} icon="theme-light-dark">
          Theme
        </Button>
        <Text style={[styles.version, { color: theme.colors.outline }]}>
          v1.{version?.build ?? "?"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, gap: 6 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 20, flex: 1 },
  headerIcons: { flexDirection: "row", alignItems: "center" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  navButton: { marginBottom: 4 },
  navButtonContent: { justifyContent: "flex-start" },
  footer: { marginTop: 20, paddingTop: 12 },
  footerText: { fontSize: 13 },
  version: { fontSize: 11, marginTop: 4 },
});
