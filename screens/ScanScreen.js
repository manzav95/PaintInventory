import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text, Button, Card, useTheme } from "react-native-paper";
import NFCService from "../services/nfcService";
import { colors, space } from "../theme/tokens";

export default function ScanScreen({ onScanResult, onCancel }) {
  const theme = useTheme();
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("Hold your device near an NFC tag...");

  useEffect(() => {
    startScanning();
    return () => {
      NFCService.cancelRequest();
    };
  }, []);

  const startScanning = async () => {
    setScanning(true);
    setMessage("Scanning for NFC tag...");

    try {
      const result = await NFCService.readTag();

      if (result.success && result.itemId) {
        setMessage("Tag scanned successfully!");
        setTimeout(() => {
          onScanResult(result.itemId);
        }, 500);
      } else {
        setMessage(
          result.error || result.message || "Failed to read tag. Try again.",
        );
        setScanning(false);
      }
    } catch (error) {
      setMessage("Error scanning tag: " + error.message);
      setScanning(false);
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          <View style={styles.iconContainer}>
            {scanning ? (
              <ActivityIndicator size="large" color={colors.brand.primary} />
            ) : (
              <Text style={styles.icon}>📱</Text>
            )}
          </View>

          <Text style={[styles.message, { color: theme.colors.onSurface }]}>
            {message}
          </Text>

          {!scanning && (
            <Button
              mode="contained"
              onPress={startScanning}
              style={styles.button}
            >
              Try Again
            </Button>
          )}

          <Button mode="outlined" onPress={onCancel} style={styles.button}>
            Cancel
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: space[8],
    backgroundColor: colors.light.background,
  },
  card: {
    elevation: 4,
  },
  content: {
    alignItems: "center",
    paddingVertical: space[10],
  },
  iconContainer: {
    marginBottom: 30,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 64,
  },
  message: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 30,
  },
  button: {
    marginTop: 10,
    minWidth: 200,
  },
});
