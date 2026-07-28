import React, { useState } from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import {
  Card,
  Title,
  Paragraph,
  TextInput,
  Button,
  useTheme,
} from "react-native-paper";
import FadeIn from "../components/FadeIn";
import ShakeView from "../components/ShakeView";
import showToast from "../utils/showToast";

export default function LoginScreen({ onLogin }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const [name, setName] = useState("");
  const [shakeTick, setShakeTick] = useState(0);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Name required",
        message: "Enter your name to continue.",
      });
      return;
    }
    onLogin(trimmed);
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FadeIn
        fromY={16}
        duration={360}
        style={isDesktop ? styles.webWrapper : undefined}
      >
        <ShakeView trigger={shakeTick}>
          <Card style={[styles.card, isDesktop && styles.webCard]}>
            <Card.Content>
              <Title style={styles.title}>Paint Inventory Tracker</Title>
              <Paragraph style={styles.subtitle}>
                Enter your name to continue.
              </Paragraph>

              <TextInput
                label="Name"
                value={name}
                onChangeText={setName}
                mode="outlined"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                onSubmitEditing={submit}
                error={shakeTick > 0 && !name.trim()}
              />

              <Button
                mode="contained"
                onPress={submit}
                style={styles.button}
              >
                Continue
              </Button>
            </Card.Content>
          </Card>
        </ShakeView>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  mono: {
    fontFamily: "monospace",
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
});
