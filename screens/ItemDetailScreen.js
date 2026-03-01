import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Card,
  IconButton,
  useTheme,
  Menu,
} from "react-native-paper";

const TYPE_OPTIONS = [
  { label: "Paint", value: "paint" },
  { label: "Primer", value: "primer" },
  { label: "Clear", value: "clear" },
  { label: "Stain", value: "stain" },
  { label: "Dye", value: "dye" },
];

const CONTAINER_OPTIONS = [
  { label: "White Container", value: "White Container" },
  { label: "Stock Container", value: "Stock Container" },
  { label: "Custom Container", value: "Custom Container" },
];

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
  const [type, setType] = useState(item?.type || "");
  const [location, setLocation] = useState(item?.location || "");
  const [idInput, setIdInput] = useState(item?.id?.toString() || "");
  const [minQuantityInput, setMinQuantityInput] = useState(
    item?.minQuantity != null ? String(item.minQuantity) : "",
  );
  const [priceInput, setPriceInput] = useState(
    item?.price != null && item?.price !== "" ? String(item.price) : "",
  );
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);

  useEffect(() => {
    setMinQuantityInput(
      item?.minQuantity != null ? String(item.minQuantity) : "",
    );
  }, [item?.id, item?.minQuantity]);
  useEffect(() => {
    setPriceInput(item?.price != null && item?.price !== "" ? String(item.price) : "");
  }, [item?.id, item?.price]);
  useEffect(() => {
    setType(item?.type || "");
  }, [item?.id, item?.type]);

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
      idInput.trim() &&
      idInput.trim() !== (item?.id?.toString() || "").trim()
    ) {
      const newId = idInput.trim();
      // Change the ID first
      const idResult = await onChangeId?.(item?.id, newId);
      if (!idResult || !idResult.success) {
        Alert.alert("Error", idResult?.error || "Failed to change item ID.");
        return;
      }
    }

    const minQ =
      minQuantityInput.trim() === ""
        ? null
        : parseInt(minQuantityInput, 10);
    if (
      minQuantityInput.trim() !== "" &&
      (isNaN(minQ) || minQ < 0)
    ) {
      Alert.alert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }
    if (priceInput.trim() !== "" && (isNaN(parseFloat(priceInput)) || parseFloat(priceInput) < 0)) {
      Alert.alert("Invalid", "Unit price must be 0 or greater.");
      return;
    }

    const priceVal = priceInput.trim() === "" ? null : parseFloat(priceInput);
    const typeVal = TYPE_OPTIONS.some((o) => o.value === type) ? type : null;
    const updatedItem = {
      ...item,
      id: idInput.trim() || item?.id,
      name,
      quantity: parseInt(quantity) || 0,
      location,
      ...(minQ !== undefined && { minQuantity: minQ }),
      ...(priceVal != null && !isNaN(priceVal) && priceVal >= 0 ? { price: priceVal } : { price: null }),
      type: typeVal,
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
                label="Paint ID"
                value={idInput}
                onChangeText={setIdInput}
                mode="outlined"
                style={styles.input}
                placeholder="Any format"
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

            <Text style={styles.label}>Type</Text>
            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={!isAdmin}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 16,
                    borderRadius: 4,
                    border: `1px solid ${theme.colors.outline}`,
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.onSurface,
                  }}
                >
                  <option value="">Select type</option>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            ) : (
              <>
                {isAdmin ? (
                  <Menu
                    visible={typeMenuOpen}
                    onDismiss={() => setTypeMenuOpen(false)}
                    anchor={
                      <Pressable
                        onPress={() => isAdmin && setTypeMenuOpen(true)}
                        style={[styles.typeTrigger, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }]}
                      >
                        <Text style={{ color: type ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                          {type ? TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type : "Select type"}
                        </Text>
                      </Pressable>
                    }
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <Menu.Item
                        key={o.value}
                        onPress={() => {
                          setType(o.value);
                          setTypeMenuOpen(false);
                        }}
                        title={o.label}
                      />
                    ))}
                  </Menu>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.itemId}>
                      {type ? (TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type) : "—"}
                    </Text>
                  </View>
                )}
              </>
            )}

            <Text style={styles.label}>Container</Text>
            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={!isAdmin}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 16,
                    borderRadius: 4,
                    border: `1px solid ${theme.colors.outline}`,
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.onSurface,
                  }}
                >
                  <option value="">Select container</option>
                  {CONTAINER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            ) : (
              <>
                {isAdmin ? (
                  <Menu
                    visible={locationMenuOpen}
                    onDismiss={() => setLocationMenuOpen(false)}
                    anchor={
                      <Pressable
                        onPress={() => setLocationMenuOpen(true)}
                        style={[styles.typeTrigger, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }]}
                      >
                        <Text style={{ color: location ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                          {location ? (CONTAINER_OPTIONS.find((o) => o.value === location)?.label ?? location) : "Select container"}
                        </Text>
                      </Pressable>
                    }
                  >
                    {CONTAINER_OPTIONS.map((o) => (
                      <Menu.Item
                        key={o.value}
                        onPress={() => {
                          setLocation(o.value);
                          setLocationMenuOpen(false);
                        }}
                        title={o.label}
                      />
                    ))}
                  </Menu>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.itemId}>
                      {location ? (CONTAINER_OPTIONS.find((o) => o.value === location)?.label ?? location) : "—"}
                    </Text>
                  </View>
                )}
              </>
            )}

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

            <Text style={styles.label}>Minimum quantity (low stock)</Text>
            {isAdmin ? (
              <TextInput
                label="Min quantity"
                value={minQuantityInput}
                onChangeText={setMinQuantityInput}
                mode="outlined"
                keyboardType="number-pad"
                style={styles.input}
                placeholder="Blank = use app default"
              />
            ) : (
              <Text style={styles.itemId}>
                {item?.minQuantity != null
                  ? String(item.minQuantity)
                  : "Use app default"}
              </Text>
            )}

            <Text style={styles.label}>Unit price</Text>
            {isAdmin ? (
              <TextInput
                label="Price"
                value={priceInput}
                onChangeText={setPriceInput}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="Optional"
                left={<TextInput.Affix text="$" />}
              />
            ) : (
              <Text style={styles.itemId}>
                {item?.price != null && item?.price !== ""
                  ? `$${Number(item.price).toFixed(2)}`
                  : "—"}
              </Text>
            )}

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
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    marginTop: 8,
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
  typeTrigger: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
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
