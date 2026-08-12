import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import {
  Text,
  Card,
  TextInput,
  useTheme,
  SegmentedButtons,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import {
  findInventoryLookupMatches,
  resolveBestInventoryMatch,
} from "../utils/itemLookup";
import ScrollFrame from "../components/ScrollFrame";

function LookupSuggestions({ matches, theme, onPick }) {
  if (!matches.length) return null;
  return (
    <ScrollFrame
      maxHeight={200}
      fadeColor={theme.colors.surfaceContainerHigh}
      nested={false}
      style={{
        marginTop: 6,
        backgroundColor: theme.colors.surfaceContainerHigh,
      }}
    >
      {matches.map(({ item, score }, idx) => (
        <Pressable
          key={String(item.id)}
          onPress={() => onPick(item)}
          style={({ pressed }) => [
            styles.suggestRow,
            idx > 0 && {
              borderTopWidth: 1,
              borderTopColor: theme.colors.outlineVariant,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.suggestMain}>
            <Text
              style={[styles.suggestName, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {item.name || item.id}
            </Text>
            <Text
              style={[
                styles.suggestMeta,
                { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={1}
            >
              {item.id}
              {item.external_code ? ` · ${item.external_code}` : ""}
            </Text>
          </View>
          {score < 900 ? (
            <Text
              style={[
                styles.suggestHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              close match
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollFrame>
  );
}

export default function QRScanScreen({
  onScanResult,
  onCancel,
  embeddedInShell = false,
  inventory = [],
}) {
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;

  const isWebViaIP =
    isWeb &&
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.protocol !== "https:";

  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [inputMode, setInputMode] = useState("manual");
  const [manualInput, setManualInput] = useState("");
  const [permissionError, setPermissionError] = useState(null);
  const theme = useTheme();

  const lookupMatches = useMemo(
    () =>
      findInventoryLookupMatches(inventory, manualInput, { limit: 8 }),
    [inventory, manualInput],
  );

  const requestCameraPermission = async () => {
    try {
      setPermissionError(null);
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
      if (status === "granted") {
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
      setHasPermission(false);
      setPermissionError(
        "Camera requires HTTPS or localhost. Use manual entry instead.",
      );
    } else if (isDesktop) {
      setHasPermission(false);
    } else {
      setHasPermission(null);
    }
  }, []);

  const handleBarCodeScanned = ({ type, data }) => {
    if (!scanned) {
      setScanned(true);
      onScanResult(data);
      setTimeout(() => {
        setScanned(false);
      }, 2000);
    }
  };

  const pickItem = (item) => {
    if (!item?.id) return;
    onScanResult(String(item.id));
  };

  const handleManualSubmit = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      Alert.alert("Invalid Input", "Please enter a material name or ID.");
      return;
    }
    if (trimmed.length < 3) {
      Alert.alert(
        "Too Short",
        "Enter at least 3 characters so the wrong item is not matched.",
      );
      return;
    }

    const { item, matches } = resolveBestInventoryMatch(inventory, trimmed);
    if (item?.id) {
      onScanResult(String(item.id));
      return;
    }
    if (matches.length > 1) {
      Alert.alert(
        "Multiple matches",
        "Several materials look similar — pick one from the list below.",
      );
      return;
    }
    // Still allow raw ID submit (online lookup / not yet in local list)
    onScanResult(trimmed);
  };

  const cardBg = theme.colors.surfaceContainerHighest;
  const shellHeader = embeddedInShell ? (
    <PageHeader
      title="Check In / Check Out"
      onBack={onCancel}
      embeddedInShell
    />
  ) : null;

  const renderManualFields = ({ title, subtitle, autoFocus = false }) => (
    <>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>
        {title}
      </Text>
      <Text
        style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
      >
        {subtitle}
      </Text>

      <TextInput
        label="Name or ID"
        value={manualInput}
        onChangeText={setManualInput}
        mode="outlined"
        style={styles.input}
        autoFocus={autoFocus}
        placeholder="e.g. white primer or H66…"
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={handleManualSubmit}
      />

      <LookupSuggestions
        matches={lookupMatches}
        theme={theme}
        onPick={pickItem}
      />

      <View style={styles.buttonRow}>
        <AppButton mode="outlined" onPress={onCancel} style={styles.button}>
          Cancel
        </AppButton>
        <AppButton
          mode="contained"
          onPress={handleManualSubmit}
          style={styles.button}
          disabled={manualInput.trim().length < 3}
        >
          Continue
        </AppButton>
      </View>
    </>
  );

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
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.webWrapper}>
            {shellHeader}
            <Card
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: theme.colors.outlineVariant,
                  borderWidth: 1,
                },
                styles.webCard,
              ]}
            >
              <Card.Content>
                {renderManualFields({
                  title: "Find material",
                  subtitle:
                    "Search by name or ID. Close spellings still match when possible.",
                  autoFocus: true,
                })}
              </Card.Content>
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {shellHeader}

      {inputMode === "manual" && (
        <ScrollView
          contentContainerStyle={styles.manualContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Card
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                borderColor: theme.colors.outlineVariant,
                borderWidth: 1,
              },
            ]}
          >
            <Card.Content>
              <SegmentedButtons
                value={inputMode}
                onValueChange={(value) => {
                  setInputMode(value);
                  if (value === "camera" && hasPermission !== true) {
                    requestCameraPermission();
                  }
                }}
                style={styles.modeSegmented}
                buttons={[
                  {
                    value: "camera",
                    label: "Camera",
                    icon: "camera",
                    disabled: isWebViaIP,
                  },
                  {
                    value: "manual",
                    label: "Manual",
                    icon: "keyboard",
                  },
                ]}
              />
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
                  Camera access requires HTTPS or localhost. Manual entry is
                  available.
                </Text>
              )}
              {renderManualFields({
                title: "Find material",
                subtitle:
                  "Search by name or ID. Close spellings still match when possible.",
                autoFocus: true,
              })}
            </Card.Content>
          </Card>
        </ScrollView>
      )}

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
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surfaceContainerHighest },
                ]}
              >
                <Card.Content style={styles.content}>
                  <SegmentedButtons
                    value={inputMode}
                    onValueChange={(value) => {
                      setInputMode(value);
                      if (value === "camera" && hasPermission !== true) {
                        requestCameraPermission();
                      }
                    }}
                    style={styles.modeSegmented}
                    buttons={[
                      {
                        value: "camera",
                        label: "Camera",
                        icon: "camera",
                        disabled: isWebViaIP,
                      },
                      {
                        value: "manual",
                        label: "Manual",
                        icon: "keyboard",
                      },
                    ]}
                  />
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
                style={[
                  styles.card,
                  { backgroundColor: theme.colors.surfaceContainerHighest },
                ]}
              >
                <Card.Content>
                  <SegmentedButtons
                    value={inputMode}
                    onValueChange={(value) => {
                      setInputMode(value);
                      if (value === "camera" && hasPermission !== true) {
                        requestCameraPermission();
                      }
                    }}
                    style={styles.modeSegmented}
                    buttons={[
                      {
                        value: "camera",
                        label: "Camera",
                        icon: "camera",
                        disabled: isWebViaIP,
                      },
                      {
                        value: "manual",
                        label: "Manual",
                        icon: "keyboard",
                      },
                    ]}
                  />
                  <Text
                    style={[styles.title, { color: theme.colors.onSurface }]}
                  >
                    Camera Permission Required
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    You can use manual entry instead, or try granting permission
                    again.
                  </Text>
                  {permissionError ? (
                    <Text
                      style={{
                        color: theme.colors.error,
                        marginBottom: 12,
                        fontSize: 12,
                      }}
                    >
                      {permissionError}
                    </Text>
                  ) : null}
                  <AppButton
                    mode="contained"
                    onPress={requestCameraPermission}
                    style={styles.button}
                  >
                    Grant Permission
                  </AppButton>
                  <AppButton
                    mode="outlined"
                    onPress={() => setInputMode("manual")}
                    style={styles.button}
                  >
                    Use Manual Entry
                  </AppButton>
                </Card.Content>
              </Card>
            </ScrollView>
          )}

          {hasPermission === true && (
            <View style={styles.cameraWrap}>
              <SegmentedButtons
                value={inputMode}
                onValueChange={(value) => {
                  setInputMode(value);
                  if (value === "camera" && hasPermission !== true) {
                    requestCameraPermission();
                  }
                }}
                style={[styles.modeSegmented, styles.cameraSegmented]}
                buttons={[
                  {
                    value: "camera",
                    label: "Camera",
                    icon: "camera",
                    disabled: isWebViaIP,
                  },
                  {
                    value: "manual",
                    label: "Manual",
                    icon: "keyboard",
                  },
                ]}
              />
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              />
              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraHint}>Align QR code in frame</Text>
                {scanned ? (
                  <AppButton mode="contained" onPress={() => setScanned(false)}>
                    Scan again
                  </AppButton>
                ) : null}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  manualContainer: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  webManualContainer: {
    alignItems: "center",
  },
  webWrapper: {
    width: "100%",
    maxWidth: 480,
  },
  webCard: { width: "100%" },
  card: { elevation: 2 },
  content: { gap: 12 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 14,
  },
  input: {
    marginBottom: 10,
    backgroundColor: "transparent",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  button: { flex: 1 },
  modeSegmented: { marginBottom: 14 },
  cameraSegmented: {
    margin: 12,
  },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },
  cameraOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
    gap: 12,
  },
  cameraHint: {
    color: "#fff",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  suggestBox: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  suggestMain: { flex: 1, minWidth: 0 },
  suggestName: { fontSize: 15, fontWeight: "600" },
  suggestMeta: { fontSize: 12, marginTop: 2 },
  suggestHint: { fontSize: 11, fontStyle: "italic" },
});
