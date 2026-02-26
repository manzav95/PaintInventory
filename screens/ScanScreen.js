import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text, Button, Card, useTheme } from "react-native-paper";
import NFCService from "../services/nfcService";

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
              <ActivityIndicator size="large" color="#6f95ab" />
            ) : (
              <Text style={styles.icon}>📱</Text>
            )}
          </View>

          <Text style={styles.message}>{message}</Text>

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
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  card: {
    elevation: 4,
  },
  content: {
    alignItems: "center",
    paddingVertical: 40,
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
    color: "#333",
  },
  button: {
    marginTop: 10,
    minWidth: 200,
  },
});
