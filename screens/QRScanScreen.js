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
  SegmentedButtons,
} from "react-native-paper";

export default function QRScanScreen({ onScanResult, onCancel }) {
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 1024; // iPad is 768-1024px, so >1024 is desktop
  const isTabletOrSmaller = !isDesktop;

  // Check if we're on web accessing via IP (not localhost) - camera won't work
  const isWebViaIP =
    isWeb &&
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.protocol !== "https:";

  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  // On desktop or web via IP, default to manual; on mobile/tablet native, default to camera
  const [inputMode, setInputMode] = useState(
    isDesktop || isWebViaIP ? "manual" : "camera",
  );
  const [manualInput, setManualInput] = useState("");
  const [permissionError, setPermissionError] = useState(null);
  const theme = useTheme();

  const requestCameraPermission = async () => {
    try {
      setPermissionError(null);
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
      if (status === "granted") {
        // If permission granted and we're in manual mode, switch to camera
        if (inputMode === "manual" && !isDesktop) {
          setInputMode("camera");
        }
      }
    } catch (error) {
      console.error("Camera permission error:", error);
      setPermissionError(error.message);
      setHasPermission(false);
    }
  };

  useEffect(() => {
    if (isWebViaIP) {
      // Web via IP - camera won't work, skip permission request
      setHasPermission(false);
      setPermissionError(
        "Camera requires HTTPS or localhost. Use manual entry instead.",
      );
    } else if (!isDesktop) {
      requestCameraPermission();
    } else {
      // On desktop localhost, we don't need camera permission
      setHasPermission(false);
    }
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;

    setScanned(true);
    if (data) {
      onScanResult(data);
    } else {
      Alert.alert("Scan Failed", "Could not read QR code.");
      setScanned(false);
    }
  };

  const handleManualSubmit = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      Alert.alert("Invalid Input", "Please enter a QR code value.");
      return;
    }
    onScanResult(trimmed);
  };

  // Desktop: Always show manual input only
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
                  Enter QR Code
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Type or paste the QR code value below
                </Text>

                <TextInput
                  label="QR Code Value"
                  value={manualInput}
                  onChangeText={setManualInput}
                  mode="outlined"
                  style={styles.input}
                  autoFocus
                  placeholder="Enter paint ID or QR code value"
                  onSubmitEditing={handleManualSubmit}
                />

                <View style={styles.buttonRow}>
                  <Button
                    mode="outlined"
                    onPress={onCancel}
                    style={styles.button}
                  >
                    Cancel
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleManualSubmit}
                    style={styles.button}
                    disabled={!manualInput.trim()}
                  >
                    Submit
                  </Button>
                </View>
              </Card.Content>
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Tablet/Mobile: Show both camera and manual options
  // Always show mode selector and allow manual entry
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.modeSelector}>
        <SegmentedButtons
          value={inputMode}
          onValueChange={(value) => {
            setInputMode(value);
            // If switching to camera and permission not granted, try requesting again
            if (value === "camera" && hasPermission !== true) {
              requestCameraPermission();
            }
          }}
          buttons={[
            {
              value: "camera",
              label: "Camera",
              icon: "camera",
              disabled: isWebViaIP, // Disable camera button on web via IP
            },
            {
              value: "manual",
              label: "Manual",
              icon: "keyboard",
            },
          ]}
        />
      </View>

      {/* Manual input mode */}
      {inputMode === "manual" && (
        <ScrollView contentContainerStyle={styles.manualContainer}>
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>
                Enter QR Code Manually
              </Text>
              {isWebViaIP && (
                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: theme.colors.error,
                      marginBottom: 12,
                      fontSize: 12,
                    },
                  ]}
                >
                  ⚠️ Camera access requires HTTPS or localhost. Manual entry is
                  available.
                </Text>
              )}
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Type or paste the QR code value below
              </Text>

              <TextInput
                label="QR Code Value"
                value={manualInput}
                onChangeText={setManualInput}
                mode="outlined"
                style={styles.input}
                autoFocus
                placeholder="Enter paint ID or QR code value"
                onSubmitEditing={handleManualSubmit}
              />

              <View style={styles.buttonRow}>
                <Button
                  mode="outlined"
                  onPress={onCancel}
                  style={styles.button}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleManualSubmit}
                  style={styles.button}
                  disabled={!manualInput.trim()}
                >
                  Submit
                </Button>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      {/* Camera mode */}
      {inputMode === "camera" && (
        <>
          {hasPermission === null && (
            <View
              style={[
                styles.container,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                <Card.Content style={styles.content}>
                  <Text style={{ color: theme.colors.onSurface }}>
                    Requesting camera permission...
                  </Text>
                </Card.Content>
              </Card>
            </View>
          )}

          {hasPermission === false && (
            <ScrollView contentContainerStyle={styles.manualContainer}>
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
              >
                <Card.Content style={styles.content}>
                  <Text
                    style={[styles.message, { color: theme.colors.onSurface }]}
                  >
                    {permissionError
                      ? `Camera error: ${permissionError}`
                      : "Camera permission is required to scan QR codes."}
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      {
                        color: theme.colors.onSurfaceVariant,
                        marginBottom: 20,
                      },
                    ]}
                  >
                    You can use manual entry instead, or try granting permission
                    again.
                  </Text>
                  <View style={styles.buttonRow}>
                    <Button
                      mode="outlined"
                      onPress={onCancel}
                      style={styles.button}
                    >
                      Go Back
                    </Button>
                    <Button
                      mode="contained"
                      onPress={requestCameraPermission}
                      style={styles.button}
                    >
                      Request Permission
                    </Button>
                  </View>
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
                  barcodeTypes: ["qr"],
                }}
              >
                <View style={styles.overlay}>
                  <View style={styles.scanArea}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                  <Text style={styles.instruction}>
                    Position the QR code within the frame
                  </Text>
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
  modeSelector: {
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#6f95ab",
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instruction: {
    color: "#fff",
    fontSize: 16,
    marginTop: 30,
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 5,
  },
  controls: {
    padding: 20,
    backgroundColor: "#fff",
  },
  button: {
    marginTop: 10,
  },
  card: {
    margin: 20,
    elevation: 4,
  },
  content: {
    alignItems: "center",
    paddingVertical: 40,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  manualContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
  webManualContainer: {},
});
