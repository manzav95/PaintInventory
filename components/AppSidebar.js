import React, { useRef } from "react";
import { View, StyleSheet, ScrollView, Animated, Platform } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import FadeIn from "./FadeIn";
import BrandLogo from "./BrandLogo";
import version from "../version";
import { space, radius, colors } from "../theme/tokens";

const useNative = Platform.OS !== "web";

function NavButton({ label, icon, onPress, active }) {
  const theme = useTheme();
  const press = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(press, {
      toValue: 0.97,
      useNativeDriver: useNative,
      speed: 40,
      bounciness: 0,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(press, {
      toValue: 1,
      useNativeDriver: useNative,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const activeBg = theme.dark
    ? colors.semantic.activeTintDark
    : colors.semantic.activeTintLight;

  return (
    <Animated.View style={{ transform: [{ scale: press }] }}>
      <AppButton
        mode="text"
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        icon={icon}
        style={[styles.navButton, active && { backgroundColor: activeBg }]}
        textColor={
          active ? theme.colors.onSurface : theme.colors.onSurfaceVariant
        }
        contentStyle={styles.navButtonContent}
        labelStyle={styles.navButtonLabel}
      >
        {label}
      </AppButton>
    </Animated.View>
  );
}

/**
 * Navigation list for desktop sidebar / mobile drawer.
 * Settings + sign out live in the shell avatar menu; refresh/bell in the top bar.
 */
export default function AppSidebar({
  currentScreen,
  ordersInitialFilter,
  isAdmin,
  isSales = false,
  onNavigate,
  onAddManual,
  showCheckInOutNav = true,
  inDrawer = false,
}) {
  const theme = useTheme();

  const body = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {!inDrawer ? (
        <View style={styles.headerRow}>
          <BrandLogo variant="sidebar" />
        </View>
      ) : null}

      <Text
        style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        Operations
      </Text>
      {!isSales ? (
        <NavButton
          label="Dashboard"
          icon="view-dashboard"
          active={currentScreen === "home"}
          onPress={() => onNavigate("home")}
        />
      ) : null}
      {showCheckInOutNav && !isSales && (
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
            active={currentScreen === "orders" && ordersInitialFilter == null}
            onPress={() => onNavigate("orders", { ordersInitialFilter: null })}
          />
        </>
      )}

      {!isSales ? (
        <>
          <Text
            style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            Tracking
          </Text>
          <NavButton
            label="Material Usage"
            icon="chart-box"
            active={currentScreen === "materialUsage"}
            onPress={() => onNavigate("materialUsage")}
          />
          <NavButton
            label="Waste Tracking"
            icon="delete-variant"
            active={currentScreen === "wasteTracking"}
            onPress={() => onNavigate("wasteTracking")}
          />
          {isAdmin && (
            <NavButton
              label="Reports"
              icon="chart-line"
              active={currentScreen === "reports"}
              onPress={() => onNavigate("reports")}
            />
          )}
        </>
      ) : null}

      <View style={styles.footer}>
        <Text style={[styles.version, { color: theme.colors.outline }]}>
          v1.{version?.build ?? "?"}
        </Text>
      </View>
    </ScrollView>
  );

  // Skip FadeIn in the drawer — it made the hamburger menu feel sluggish.
  if (inDrawer) {
    return <View style={styles.fadeRoot}>{body}</View>;
  }

  return (
    <FadeIn fromY={8} duration={280} style={styles.fadeRoot}>
      {body}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  fadeRoot: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, gap: 4 },
  headerRow: {
    marginBottom: space[2],
    paddingHorizontal: space[2],
  },
  title: { fontSize: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: space[4],
    marginBottom: space[1],
    paddingHorizontal: space[2],
  },
  navButton: {
    marginBottom: 2,
    borderRadius: radius.md,
  },
  navButtonContent: { justifyContent: "flex-start" },
  navButtonLabel: { fontWeight: "500" },
  footer: { marginTop: 20, paddingTop: 12, paddingHorizontal: space[2] },
  version: { fontSize: 11 },
});
