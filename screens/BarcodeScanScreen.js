import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import {
  Text,
  Button,
  Card,
  TextInput,
  useTheme,
} from "react-native-paper";

/**
 * BarcodeScanScreen
 *
 * Similar to QRScanScreen, but optimized for linear barcodes (UPC/EAN/Code128/etc.)
 * with a horizontal scan line overlay to make the target region obvious.
 *
 * Props:
 * - onScanResult(data: string)
 * - onCancel()
 */
export default function BarcodeScanScreen({ onScanResult, onCancel }) {
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024;

  const isWebViaIP =
    isWeb &&
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.protocol !== "https:";

  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [permissionError, setPermissionError] = useState(null);
  const theme = useTheme();

  const requestCameraPermission = async () => {
    try {
      setPermissionError(null);
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    } catch (error) {
      console.error("Camera permission error:", error);
      setPermissionError(error.message);
      setHasPermission(false);
    }
  };

  useEffect(() => {
    if (isWebViaIP) {
      setHasPermission(false);
      setPermissionError(
        "Camera requires HTTPS or localhost. Use manual entry instead.",
      );
    } else if (!isDesktop) {
      requestCameraPermission();
    } else {
      setHasPermission(false);
    }
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    if (data) {
      onScanResult(data);
    } else {
      Alert.alert("Scan Failed", "Could not read barcode.");
      setScanned(false);
    }
  };

  const handleManualSubmit = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      Alert.alert("Invalid Input", "Please enter a barcode value.");
      return;
    }
    onScanResult(trimmed);
  };

  if (isDesktop) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.manualContainer,
            styles.webManualContainer,
          ]}
        >
          <View style={styles.webWrapper}>
            <Card
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface },
                styles.webCard,
              ]}
            >
              <Card.Content>
                <Text style={[styles.title, { color: theme.colors.onSurface }]}>
                  Enter Barcode
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Type or paste the barcode value below.
                </Text>
                <TextInput
                  label="Barcode Value"
                  value={manualInput}
                  onChangeText={setManualInput}
                  mode="outlined"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  mode="contained"
                  onPress={handleManualSubmit}
                  style={styles.button}
                >
                  Submit
                </Button>
                <Button
                  mode="outlined"
                  onPress={onCancel}
                  style={styles.button}
                >
                  Cancel
                </Button>
              </Card.Content>
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isWebViaIP ? (
        <ScrollView
          contentContainerStyle={[
            styles.manualContainer,
            styles.mobileManualContainer,
          ]}
        >
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>
                Enter Barcode
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Camera scanning is unavailable in this environment. Enter the
                barcode manually instead.
              </Text>
              <TextInput
                label="Barcode Value"
                value={manualInput}
                onChangeText={setManualInput}
                mode="outlined"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                mode="contained"
                onPress={handleManualSubmit}
                style={styles.button}
              >
                Submit
              </Button>
              <Button
                mode="outlined"
                onPress={onCancel}
                style={styles.button}
              >
                Cancel
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      ) : (
        <>
          {hasPermission === null && (
            <View
              style={[
                styles.manualContainer,
                { justifyContent: "center", alignItems: "center" },
              ]}
            >
              <Text style={{ color: "#fff", marginBottom: 12 }}>
                Requesting camera permission…
              </Text>
            </View>
          )}
          {hasPermission === false && (
            <ScrollView
              contentContainerStyle={[
                styles.manualContainer,
                styles.mobileManualContainer,
              ]}
            >
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                <Card.Content>
                  <Text
                    style={[styles.title, { color: theme.colors.onSurface }]}
                  >
                    Camera not available
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {permissionError ||
                      "Camera permission is required to scan barcodes."}
                  </Text>
                  <Button
                    mode="contained"
                    onPress={requestCameraPermission}
                    style={styles.button}
                  >
                    Request Permission
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={onCancel}
                    style={styles.button}
                  >
                    Cancel
                  </Button>
                </Card.Content>
              </Card>
            </ScrollView>
          )}

          {hasPermission === true && (
            <>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "ean13",
                    "ean8",
                    "upc_a",
                    "upc_e",
                    "code128",
                    "code39",
                    "code93",
                    "codabar",
                  ],
                }}
              >
                <View style={styles.barcodeOverlay}>
                  <View style={styles.shade} />
                  <View style={styles.lineRow}>
                    <View style={styles.sideShade} />
                    <View style={styles.scanLine} />
                    <View style={styles.sideShade} />
                  </View>
                  <View style={styles.bottomBlock}>
                    <Text style={styles.instruction}>
                      Align the barcode with the line
                    </Text>
                  </View>
                </View>
              </CameraView>

              <View
                style={[
                  styles.controls,
                  { backgroundColor: theme.colors.surface },
                ]}
              >
                <Button
                  mode="outlined"
                  onPress={() => {
                    setScanned(false);
                    onCancel();
                  }}
                  style={styles.button}
                >
                  Cancel
                </Button>
                {scanned && (
                  <Button
                    mode="contained"
                    onPress={() => setScanned(false)}
                    style={styles.button}
                  >
                    Scan Again
                  </Button>
                )}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  manualContainer: {
    flexGrow: 1,
    padding: 16,
  },
  mobileManualContainer: {
    justifyContent: "center",
  },
  webManualContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  webWrapper: {
    width: "100%",
    maxWidth: 700,
  },
  card: {
    marginBottom: 16,
  },
  webCard: {
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  controls: {
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barcodeOverlay: {
    flex: 1,
    justifyContent: "center",
  },
  shade: {
    flex: 3,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 80,
  },
  sideShade: {
    flex: 1,
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  scanLine: {
    width: "70%",
    height: 2,
    backgroundColor: "#6f95ab",
    borderRadius: 999,
  },
  bottomBlock: {
    flex: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 16,
  },
  instruction: {
    color: "#fff",
    fontSize: 14,
  },
});

