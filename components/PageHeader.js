import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import FadeIn from "./FadeIn";
import { AppText } from "./ui";
import { space, motion } from "../theme/tokens";

export default function PageHeader({
  title,
  onBack,
  showBack = true,
  embeddedInShell = false,
  actions,
}) {
  const theme = useTheme();
  // Shell top bar already shows the screen title.
  const hideTitle = embeddedInShell;
  const showBackBtn = showBack && !embeddedInShell && onBack;

  if (hideTitle && !actions && !showBackBtn) {
    return null;
  }

  return (
    <FadeIn
      fromY={6}
      duration={motion.pageHeaderMs}
      style={styles.row}
      disabled={embeddedInShell}
    >
      <View style={styles.left}>
        {showBackBtn ? (
          <AppButton
            icon="arrow-left"
            onPress={onBack}
            mode="text"
            style={styles.backButton}
          >
            Back
          </AppButton>
        ) : null}
        {!hideTitle ? (
          <AppText
            variant="pageTitle"
            style={[styles.title, { color: theme.colors.onBackground }]}
          >
            {title}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[4],
    flexWrap: "wrap",
    gap: space[2],
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
    gap: space[1],
  },
  backButton: { marginRight: space[1] },
  title: {},
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space[2],
  },
});
