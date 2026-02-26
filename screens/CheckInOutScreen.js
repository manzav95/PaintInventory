import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Card, Text, Button, TextInput, useTheme } from "react-native-paper";

export default function CheckInOutScreen({
  item,
  onCheckIn,
  onCheckOut,
  onCancel,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [quantity, setQuantity] = useState("");
  const [action, setAction] = useState(null); // 'in' or 'out'

  const handleSubmit = () => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(
        "Invalid Quantity",
        "Please enter a valid quantity greater than 0.",
      );
      return;
    }

    if (action === "in") {
      onCheckIn(qty);
    } else if (action === "out") {
      onCheckOut(qty);
    }
  };

  if (!item) {
    return null;
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={isDesktop && styles.webWrapper}>
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface },
            isDesktop && styles.webCard,
          ]}
        >
          <Card.Content>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              {item.name || "Paint Item"}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              ID: {item.id}
            </Text>
            <Text
              style={[
                styles.currentQty,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Current Quantity: {item.quantity || 0} gallons
            </Text>

            <View style={styles.buttonRow}>
              <Button
                mode={action === "in" ? "contained" : "outlined"}
                onPress={() => setAction("in")}
                style={[
                  styles.actionButton,
                  action === "in" && styles.selectedButton,
                ]}
                icon="arrow-down"
              >
                Check In
              </Button>
              <Button
                mode={action === "out" ? "contained" : "outlined"}
                onPress={() => setAction("out")}
                style={[
                  styles.actionButton,
                  action === "out" && styles.selectedButton,
                ]}
                icon="arrow-up"
              >
                Check Out
              </Button>
            </View>

            {action && (
              <>
                <TextInput
                  label={`Quantity to ${action === "in" ? "add" : "remove"} (gallons)`}
                  value={quantity}
                  onChangeText={setQuantity}
                  mode="outlined"
                  keyboardType="decimal-pad"
                  style={styles.input}
                  right={<TextInput.Affix text="gal" />}
                  autoFocus
                />

                <View style={styles.submitRow}>
                  <Button
                    mode="outlined"
                    onPress={onCancel}
                    style={styles.button}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    style={styles.button}
                    disabled={!quantity || parseFloat(quantity) <= 0}
                  >
                    Submit
                  </Button>
                </View>
              </>
            )}

            {!action && (
              <Button
                mode="outlined"
                onPress={onCancel}
                style={styles.cancelButton}
              >
                Cancel
              </Button>
            )}
          </Card.Content>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: "center",
    fontFamily: "monospace",
  },
  currentQty: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
  },
  selectedButton: {
    // Selected state is handled by mode="contained"
  },
  input: {
    marginBottom: 20,
  },
  submitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    flex: 1,
  },
  cancelButton: {
    marginTop: 10,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
});
