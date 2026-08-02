import React from "react";
import { StyleSheet } from "react-native";
import { AppSurface } from "./ui";
import { space } from "../theme/tokens";

/** Outlined toolbar / filter strip — Inventory kit surface. */
export default function ToolbarCard({ children, style, contentStyle }) {
  return (
    <AppSurface style={[styles.card, style]} contentStyle={[styles.content, contentStyle]}>
      {children}
    </AppSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: space[4],
  },
  content: {
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    gap: space[3],
  },
});
