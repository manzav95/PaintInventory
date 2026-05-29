import React from "react";
import { View, StyleSheet } from "react-native";
import { Button, Title, useTheme } from "react-native-paper";

export default function PageHeader({
  title,
  onBack,
  showBack = true,
  embeddedInShell = false,
  actions,
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack && !embeddedInShell && onBack && (
          <Button
            icon="arrow-left"
            onPress={onBack}
            mode="text"
            style={styles.backButton}
          >
            Back
          </Button>
        )}
        <Title style={[styles.title, { color: theme.colors.onBackground }]}>
          {title}
        </Title>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
    gap: 4,
  },
  backButton: { marginRight: 4 },
  title: { fontSize: 26, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
});
