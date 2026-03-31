import React, { useEffect, useState, useRef } from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import { Text, Button, ActivityIndicator } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";

/**
 * Simple camera-based color picker shell.
 * Opens the camera with a sampling box in the center and returns a hex color.
 *
 * NOTE: This implementation currently stubs the sampled color and returns
 * a placeholder (#808080). To get an accurate sampled color, you'll need
 * to add a pixel-sampling step from the camera image or frame.
 */
export default function CameraColorPickerModal({
  visible,
  onClose,
  onColorPicked,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isRequesting, setIsRequesting] = useState(false);
  const [sampleHex, setSampleHex] = useState("#808080");
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    if (!permission || !permission.granted) {
      (async () => {
        try {
          setIsRequesting(true);
          await requestPermission();
        } finally {
          setIsRequesting(false);
        }
      })();
    }
  }, [visible, permission, requestPermission]);

  const handleUseColor = () => {
    if (onColorPicked) onColorPicked(sampleHex);
  };

  const canShowCamera = permission?.granted;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Pick color from camera</Text>
          {!canShowCamera ? (
            <View style={styles.permissionBlock}>
              {isRequesting ? (
                <>
                  <ActivityIndicator />
                  <Text style={styles.permissionText}>
                    Requesting camera permission…
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.permissionText}>
                    Camera access is needed to pick a color.
                  </Text>
                  <Button mode="contained" onPress={requestPermission}>
                    Grant permission
                  </Button>
                </>
              )}
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              <View style={styles.cameraWrap}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  ref={cameraRef}
                  facing="back"
                />
                <View style={[styles.sampleBox, { pointerEvents: "none" }]} />
              </View>
              <View style={styles.sampleRow}>
                <View
                  style={[styles.sampleSwatch, { backgroundColor: sampleHex }]}
                />
                <Text style={styles.sampleLabel}>{sampleHex}</Text>
              </View>
              <Text style={styles.helperText}>
                Center the sampling box over the color you want.
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Button mode="text" onPress={onClose}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleUseColor}
              disabled={!canShowCamera}
            >
              Use color
            </Button>
          </View>
        </View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#111319",
    zIndex: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  permissionBlock: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  permissionText: {
    fontSize: 14,
    textAlign: "center",
  },
  cameraContainer: {
    marginBottom: 16,
  },
  cameraWrap: {
    height: 260,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: 12,
  },
  sampleBox: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#fff",
    alignSelf: "center",
    marginTop: "35%",
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sampleSwatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  sampleLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  helperText: {
    fontSize: 13,
    color: "#9aa1b5",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
});

