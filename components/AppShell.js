import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { layout, space, colors } from "../theme/tokens";
import UserMenuAvatar from "./UserMenuAvatar";

const DRAWER_MS = 200;
const isWeb = Platform.OS === "web";

/**
 * App chrome:
 * - Desktop / wide: sidebar (#0F1624) + main canvas with top actions bar
 * - Mobile: hamburger top bar; drawer slides in/out with scrim fade
 */
export default function AppShell({
  sidebar,
  children,
  isNarrowDesktop = false,
  showPersistentSidebar = true,
  title = "Dashboard",
  userName,
  drawerOpen = false,
  onOpenDrawer,
  onCloseDrawer,
  onRefresh,
  isRefreshing = false,
  onOpenSettings,
  onSignOut,
  notifications,
}) {
  const theme = useTheme();
  const mobile = !showPersistentSidebar;
  const sidebarBg = colors.dark.sidebar;
  const canvasBg = theme.dark ? colors.dark.background : theme.colors.background;
  const drawerWidth = Math.min(layout.sidebarWidth, 300);
  const iconColor = theme.colors.onSurfaceVariant;

  // Stay mounted through the close animation.
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [panelIn, setPanelIn] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const closeTimer = useRef(null);
  const mountedRef = useRef(false);
  mountedRef.current = drawerMounted;

  useEffect(() => {
    if (!mobile) return undefined;

    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }

    if (drawerOpen) {
      setDrawerMounted(true);
      if (isWeb) {
        setPanelIn(false);
        let cancelled = false;
        const id = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) setPanelIn(true);
          });
        });
        return () => {
          cancelled = true;
          cancelAnimationFrame(id);
        };
      }
      slide.setValue(0);
      scrim.setValue(0);
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 1,
          duration: DRAWER_MS,
          useNativeDriver: true,
        }),
        Animated.timing(scrim, {
          toValue: 1,
          duration: DRAWER_MS,
          useNativeDriver: true,
        }),
      ]).start();
      return undefined;
    }

    // Already closed — nothing to animate.
    if (!mountedRef.current) return undefined;

    // Closing — animate out, then unmount
    if (isWeb) {
      setPanelIn(false);
      closeTimer.current = setTimeout(() => {
        setDrawerMounted(false);
        closeTimer.current = null;
      }, DRAWER_MS);
      return () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
      };
    }

    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: DRAWER_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scrim, {
        toValue: 0,
        duration: DRAWER_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setDrawerMounted(false);
    });
    return undefined;
  }, [drawerOpen, mobile, slide, scrim]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const topActions = (
    <View style={styles.topActions}>
      <IconButton
        icon="refresh"
        size={22}
        onPress={onRefresh}
        disabled={isRefreshing}
        iconColor={iconColor}
        accessibilityLabel="Refresh"
      />
      {isRefreshing ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : null}
      {notifications}
      <UserMenuAvatar
        userName={userName}
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
      />
    </View>
  );

  const panelBg = theme.dark ? sidebarBg : theme.colors.background;
  const panelBorder = theme.colors.outlineVariant;

  const drawerPanelInner = (
    <>
      <View
        style={[
          styles.drawerHeader,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <Text
          style={[styles.drawerBrand, { color: theme.colors.onBackground }]}
        >
          Paint Inventory
        </Text>
        <IconButton
          icon="close"
          size={22}
          onPress={onCloseDrawer}
          iconColor={theme.colors.onBackground}
          accessibilityLabel="Close navigation"
        />
      </View>
      <View style={styles.drawerBody}>{sidebar}</View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: canvasBg }]}>
      <View
        style={[
          styles.webContainer,
          mobile && styles.webContainerMobile,
          { backgroundColor: canvasBg },
        ]}
      >
        {!mobile ? (
          <View
            style={[
              styles.webSidebar,
              isNarrowDesktop && styles.webSidebarNarrow,
              {
                backgroundColor: theme.dark
                  ? sidebarBg
                  : theme.colors.background,
                borderRightColor: theme.colors.outlineVariant,
              },
            ]}
          >
            {sidebar}
          </View>
        ) : null}

        <View style={styles.mainColumn}>
          <View
            style={[
              styles.topBar,
              {
                backgroundColor: canvasBg,
                borderBottomColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.topBarLeft}>
              {mobile ? (
                <IconButton
                  icon="menu"
                  size={24}
                  onPress={onOpenDrawer}
                  iconColor={theme.colors.onBackground}
                  accessibilityLabel="Open navigation"
                />
              ) : null}
              {mobile ? (
                <View
                  style={[
                    styles.topDivider,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
              ) : null}
              <Text
                style={[styles.topTitle, { color: theme.colors.onBackground }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            {topActions}
          </View>

          <View
            style={[
              styles.webMain,
              isNarrowDesktop && styles.webMainNarrow,
              mobile && styles.webMainMobile,
            ]}
          >
            {children}
          </View>
        </View>
      </View>

      {mobile && drawerMounted ? (
        <View
          style={styles.drawerRoot}
          pointerEvents={drawerOpen || panelIn ? "auto" : "none"}
        >
          {isWeb ? (
            <>
              <Pressable
                style={[
                  styles.drawerScrim,
                  {
                    backgroundColor: colors.semantic.scrim,
                    opacity: panelIn ? 1 : 0,
                    transitionProperty: "opacity",
                    transitionDuration: `${DRAWER_MS}ms`,
                    transitionTimingFunction: "ease-out",
                  },
                ]}
                onPress={onCloseDrawer}
                accessibilityLabel="Close navigation"
              />
              <View
                style={[
                  styles.drawerPanel,
                  {
                    width: drawerWidth,
                    backgroundColor: panelBg,
                    borderRightColor: panelBorder,
                    transform: [
                      { translateX: panelIn ? 0 : -drawerWidth },
                    ],
                    transitionProperty: "transform",
                    transitionDuration: `${DRAWER_MS}ms`,
                    transitionTimingFunction: "ease-out",
                  },
                ]}
              >
                {drawerPanelInner}
              </View>
            </>
          ) : (
            <>
              <Pressable
                onPress={onCloseDrawer}
                accessibilityLabel="Close navigation"
                style={StyleSheet.absoluteFill}
              >
                <Animated.View
                  style={[
                    styles.drawerScrim,
                    {
                      backgroundColor: colors.semantic.scrim,
                      opacity: scrim,
                    },
                  ]}
                />
              </Pressable>
              <Animated.View
                style={[
                  styles.drawerPanel,
                  {
                    width: drawerWidth,
                    backgroundColor: panelBg,
                    borderRightColor: panelBorder,
                    transform: [{ translateX }],
                  },
                ]}
              >
                {drawerPanelInner}
              </Animated.View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    ...(Platform.OS === "web" ? { height: "100%" } : null),
  },
  webContainer: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    minHeight: 0,
  },
  webContainerMobile: {
    flexDirection: "column",
  },
  webSidebar: {
    width: layout.sidebarWidth,
    minWidth: layout.sidebarWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: space[4],
    paddingBottom: space[4],
    paddingHorizontal: space[3],
  },
  webSidebarNarrow: {
    width: layout.sidebarNarrowWidth,
    minWidth: layout.sidebarNarrowWidth,
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: space[1],
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  topDivider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    marginHorizontal: space[1],
  },
  topTitle: {
    fontSize: 18,
    fontWeight: "600",
    flexShrink: 1,
    paddingLeft: space[2],
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space[2],
  },
  webMain: {
    flex: 1,
    paddingHorizontal: layout.pagePadX,
    paddingTop: layout.pagePadY,
    paddingBottom: space[6],
    minHeight: 0,
    ...(Platform.OS === "web"
      ? {
          overflowY: "auto",
          overflowX: "hidden",
        }
      : {
          overflow: "hidden",
        }),
  },
  webMainNarrow: {
    paddingHorizontal: space[6],
  },
  webMainMobile: {
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[3],
    ...(Platform.OS === "web"
      ? { overflowY: "hidden", overflowX: "hidden" }
      : null),
  },
  drawerRoot: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 100,
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerPanel: {
    height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
    ...(Platform.OS === "web"
      ? { boxShadow: "4px 0 24px rgba(0,0,0,0.35)" }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
        }),
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space[4],
    paddingRight: space[1],
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerBrand: {
    fontSize: 16,
    fontWeight: "700",
  },
  drawerBody: {
    flex: 1,
    paddingTop: space[3],
    paddingHorizontal: space[3],
    paddingBottom: space[4],
  },
});
