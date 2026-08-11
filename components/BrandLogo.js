import React from "react";
import { View, Image, StyleSheet, Pressable } from "react-native";
import { useTheme } from "react-native-paper";
import { AppText } from "./ui";
import { space, fontFamily } from "../theme/tokens";

export const CURE_ACRONYM = "Colors · Usage · Receiving · Export";

const LOGO = {
  whiteFull: require("../assets/cure-logo-white.png"),
  blackFull: require("../assets/cure-logo-black.png"),
  whiteMark: require("../assets/cure-mark-white.png"),
  blackMark: require("../assets/cure-mark-black.png"),
};

/**
 * CURE brand mark + subtle acronym line.
 * Transparent PNGs: white variants for dark UI, black for light UI.
 * @param {'login'|'sidebar'|'drawer'|'header'|'mark'} variant
 * @param {'auto'|'full'|'mark'} mark — full stacked logo vs C-only mark
 */
export default function BrandLogo({
  variant = "sidebar",
  mark = "auto",
  onPress,
  onDoubleClick,
  style,
}) {
  const theme = useTheme();
  const isLogin = variant === "login";
  const isSideRow = variant === "sidebar" || variant === "drawer";
  const useMarkOnly =
    mark === "mark" ||
    (mark === "auto" &&
      (variant === "sidebar" ||
        variant === "drawer" ||
        variant === "mark" ||
        variant === "header"));

  const logoSize = isLogin
    ? 132
    : variant === "drawer"
      ? 40
      : variant === "mark"
        ? 40
        : variant === "sidebar"
          ? 44
          : 72;

  const source = theme.dark
    ? useMarkOnly
      ? LOGO.whiteMark
      : LOGO.whiteFull
    : useMarkOnly
      ? LOGO.blackMark
      : LOGO.blackFull;

  const wordColor = theme.dark ? "#F2EEE6" : theme.colors.onBackground;

  const markImage = (
    <Image
      source={source}
      style={{ width: logoSize, height: logoSize }}
      resizeMode="contain"
      accessibilityLabel="CURE"
    />
  );

  const acronymLine =
    variant !== "mark" ? (
      <AppText
        variant="caption"
        tone="muted"
        style={[
          styles.acronym,
          isLogin && styles.acronymLogin,
          isSideRow && styles.acronymSide,
        ]}
        numberOfLines={2}
      >
        {CURE_ACRONYM}
      </AppText>
    ) : null;

  const content = isSideRow ? (
    <View style={[styles.sideWrap, style]}>
      <View style={styles.sideRow}>
        {markImage}
        <View style={styles.sideTextCol}>
          <AppText
            variant="sectionTitle"
            style={[styles.sideWordmark, { color: wordColor }]}
          >
            CURE
          </AppText>
          {acronymLine}
        </View>
      </View>
    </View>
  ) : (
    <View style={[styles.wrap, isLogin && styles.wrapLogin, style]}>
      {markImage}
      {acronymLine}
    </View>
  );

  if (onPress || onDoubleClick) {
    return (
      <Pressable
        onPress={onPress}
        {...(onDoubleClick ? { onDoubleClick } : {})}
        accessibilityRole="button"
        accessibilityLabel="CURE"
        style={({ pressed }) => pressed && { opacity: 0.88 }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  wrapLogin: {
    marginBottom: space[2],
  },
  sideWrap: {
    width: "100%",
  },
  sideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  sideTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  sideWordmark: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1.6,
    lineHeight: 26,
    marginBottom: 0,
  },
  acronym: {
    marginTop: space[2],
    textAlign: "center",
    opacity: 0.72,
    letterSpacing: 0.2,
  },
  acronymLogin: {
    fontSize: 12,
    marginTop: space[3],
    opacity: 0.65,
  },
  acronymSide: {
    textAlign: "left",
    fontSize: 10,
    lineHeight: 13,
    marginTop: 3,
    opacity: 0.55,
  },
});
