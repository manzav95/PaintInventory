import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useTheme } from "react-native-paper";

export default function AppShell({
  sidebar,
  children,
  isNarrowDesktop = false,
}) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.webContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <View
          style={[
            styles.webSidebar,
            isNarrowDesktop && styles.webSidebarNarrow,
            {
              backgroundColor: theme.colors.background,
              borderRightColor: theme.colors.outlineVariant,
            },
          ]}
        >
          {sidebar}
        </View>
        <View
          style={[
            styles.webMain,
            isNarrowDesktop && styles.webMainNarrow,
            { backgroundColor: theme.colors.background },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
  },
  webContainer: {
    flex: 1,
    flexDirection: "row",
    maxWidth: 1600,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  webSidebar: {
    width: 280,
    minWidth: 280,
    borderRightWidth: 1,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  webSidebarNarrow: {
    width: 240,
    minWidth: 240,
  },
  webMain: {
    flex: 1,
    paddingLeft: 20,
    paddingTop: 8,
    paddingBottom: 16,
    ...(Platform.OS === "web"
      ? {
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
        }
      : {
          overflow: "hidden",
        }),
  },
  webMainNarrow: {
    paddingLeft: 16,
  },
});
