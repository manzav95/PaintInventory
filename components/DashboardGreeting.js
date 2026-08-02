import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, useTheme } from "react-native-paper";
import FadeIn from "./FadeIn";

export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardGreeting({ isAdmin, userName, style }) {
  const theme = useTheme();
  const displayName = isAdmin ? "Admin" : userName || "there";
  const greetingPhrase = getTimeGreeting();

  return (
    <FadeIn
      fromY={8}
      duration={300}
      delay={60}
      style={[styles.block, style]}
      disabled
    >
      <Text style={styles.greeting}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          {greetingPhrase},{" "}
        </Text>
        <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
          {displayName}
        </Text>
      </Text>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  block: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "500",
    lineHeight: 32,
  },
});
