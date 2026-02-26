import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Card,
  IconButton,
  useTheme,
} from "react-native-paper";

export default function ItemDetailScreen({
  item,
  onSave,
  onDelete,
  onChangeId,
  onQuantityChange,
  onBack,
  isAdmin,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [name, setName] = useState(item?.name || "");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || "0");
  const [description, setDescription] = useState(item?.description || "");
  const [location, setLocation] = useState(item?.location || "");
  const [idInput, setIdInput] = useState(item?.id?.toString() || "");

  const validateIdFormat = (id) => {
    if (!id.trim()) {
      return false; // ID is required for existing items
    }
    const formattedId = id.trim().toUpperCase();
    return /^H66[A-Z]{3}\d{5}$/.test(formattedId);
  };

  const handleIdBlur = () => {
    if (idInput.trim() && !validateIdFormat(idInput)) {
      Alert.alert(
        "Invalid Paint Code Format",
        "Paint ID must be in Sherwin Williams format:\n\nH66 + 3 letters + 5 numbers\n\nExample: H66ABC12345",
        [{ text: "OK" }],
      );
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      Alert.alert(
        "Not Allowed",
        "Only admin can make changes to inventory items.",
      );
      return;
    }

    // Handle ID change separately first (if changed)
    if (
      isAdmin &&
      idInput &&
      idInput.toUpperCase() !== (item?.id?.toString() || "")
    ) {
      const formattedId = idInput.toUpperCase();
      // Validate format
      if (!/^H66[A-Z]{3}\d{5}$/.test(formattedId)) {
        Alert.alert(
          "Invalid Format",
          "Paint ID must be in Sherwin Williams format: H66(3 letters)(5 numbers), e.g., H66ABC12345",
        );
        return;
      }
      // Change the ID first
      const idResult = await onChangeId?.(item?.id, formattedId);
      if (!idResult || !idResult.success) {
        Alert.alert("Error", idResult?.error || "Failed to change item ID.");
        return;
      }
    }

    // Save the item fields
    const updatedItem = {
      ...item,
      id: idInput.toUpperCase() || item?.id,
      name,
      quantity: parseInt(quantity) || 0,
      description,
      location,
    };

    onSave(updatedItem);
  };

  const handleQuantityAdjust = (change) => {
    if (!isAdmin) {
      Alert.alert("Not Allowed", "Only admin can change inventory quantities.");
      return;
    }
    const newQuantity = Math.max(0, (parseInt(quantity) || 0) + change);
    setQuantity(newQuantity.toString());
    if (item?.id) {
      onQuantityChange(item.id, change);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={isDesktop && styles.webContentContainer}
    >
      <View style={styles.header}>
        <Button icon="arrow-left" onPress={onBack} mode="text">
          Back
        </Button>
        <Text style={styles.headerTitle}>Item Details</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={isDesktop && styles.webWrapper}>
        <Card style={[styles.card, isDesktop && styles.webCard]}>
          <Card.Content>
            <Text style={styles.label}>Paint ID</Text>
            {isAdmin ? (
              <TextInput
                label="Paint ID (Sherwin Williams format: H66ABC12345)"
                value={idInput}
                onChangeText={(t) => {
                  // Allow H66, 3 letters, 5 numbers
                  const upper = t.toUpperCase();
                  let filtered = upper.replace(/[^H0-9A-Z]/g, "");
                  // Ensure it starts with H66
                  if (filtered.length > 0 && filtered[0] !== "H") {
                    filtered = "H66" + filtered.replace(/^H66/, "");
                  }
                  if (filtered.length > 3 && !filtered.startsWith("H66")) {
                    filtered = "H66" + filtered.substring(3);
                  }
                  // Limit to 13 characters: H66 + 3 letters + 5 numbers
                  if (filtered.length > 13) filtered = filtered.slice(0, 13);
                  setIdInput(filtered);
                }}
                onBlur={handleIdBlur}
                mode="outlined"
                autoCapitalize="characters"
                style={styles.input}
                placeholder="H66ABC12345"
              />
            ) : (
              <Text style={styles.itemId}>{item?.id?.toString() || "N/A"}</Text>
            )}
          </Card.Content>
        </Card>

        <Card style={[styles.card, isDesktop && styles.webCard]}>
          <Card.Content>
            <TextInput
              label="Paint Name"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
              disabled={!isAdmin}
              editable={isAdmin}
            />

            <TextInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
              disabled={!isAdmin}
              editable={isAdmin}
            />

            <TextInput
              label="Location"
              value={location}
              onChangeText={setLocation}
              mode="outlined"
              style={styles.input}
              disabled={!isAdmin}
              editable={isAdmin}
            />

            <Text style={styles.label}>Quantity (Gallons)</Text>
            <View style={styles.quantityContainer}>
              <IconButton
                icon="minus"
                size={24}
                onPress={() => handleQuantityAdjust(-1)}
                disabled={!isAdmin}
              />
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                mode="outlined"
                keyboardType="numeric"
                style={styles.quantityInput}
                right={<TextInput.Affix text="gal" />}
                disabled={!isAdmin}
                editable={isAdmin}
              />
              <IconButton
                icon="plus"
                size={24}
                onPress={() => handleQuantityAdjust(1)}
                disabled={!isAdmin}
              />
            </View>

            {item?.lastScanned && (
              <Text style={styles.lastScanned}>
                Last scanned:{" "}
                {new Date(item.lastScanned).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                by {item?.lastScannedBy || "unknown"}
              </Text>
            )}
          </Card.Content>
        </Card>

        <View style={styles.actions}>
          {isAdmin && (
            <Button
              mode="contained"
              onPress={handleSave}
              style={styles.button}
              icon="content-save"
            >
              Save Changes
            </Button>
          )}
          {!isAdmin && (
            <Text
              style={[
                styles.readOnlyNotice,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              View only - Admin access required to make changes
            </Text>
          )}

          {isAdmin && item?.id && (
            <Button
              mode="outlined"
              onPress={() => onDelete(item.id)}
              style={[styles.button, styles.deleteButton]}
              icon="delete"
              textColor="#ff6b6b"
            >
              Delete Item
            </Button>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  placeholder: {
    width: 80,
  },
  card: {
    margin: 16,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#666",
  },
  itemId: {
    fontSize: 16,
    fontFamily: "monospace",
    color: "#6f95ab",
  },
  input: {
    marginBottom: 16,
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  quantityInput: {
    flex: 1,
    marginHorizontal: 8,
  },
  lastScanned: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  actions: {
    padding: 16,
    paddingBottom: 40,
  },
  button: {
    marginBottom: 12,
  },
  deleteButton: {
    borderColor: "#ff6b6b",
  },
  readOnlyNotice: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 12,
  },
  webContentContainer: {
    alignItems: "center",
  },
  webWrapper: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
});
