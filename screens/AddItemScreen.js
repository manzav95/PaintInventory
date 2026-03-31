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
  Title,
  useTheme,
  Menu,
  IconButton,
} from "react-native-paper";
import CameraColorPickerModal from "../components/CameraColorPickerModal";

const TYPE_OPTIONS = [
  { label: "Paint", value: "paint" },
  { label: "Primer", value: "primer" },
  { label: "Clear", value: "clear" },
  { label: "Catalyst", value: "catalyst" },
  { label: "Stain", value: "stain" },
  { label: "Dye", value: "dye" },
  { label: "Custom Paint", value: "custom_paint" },
  { label: "Custom Stain", value: "custom_stain" },
];

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];

const CONTAINER_OPTIONS = [
  { label: "White Container", value: "White Container" },
  { label: "Stock Container", value: "Stock Container" },
  { label: "Custom Container", value: "Custom Container" },
];

const PO_CATEGORY_OPTIONS = [
  { label: "Mixing", value: "mixing" },
  { label: "AP", value: "ap" },
];

export default function AddItemScreen({ onSave, onCancel, inventory = [] }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [itemId, setItemId] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [hexColor, setHexColor] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [poCategoryMenuOpen, setPoCategoryMenuOpen] = useState(false);
  const [poCategory, setPoCategory] = useState("mixing");
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    itemId: false,
    name: false,
  });

  const isCustomType = CUSTOM_TYPES.includes(type);

  const normalizeHex = (raw) => {
    const s = String(raw).trim().replace(/^#/, "");
    if (!s) return "";
    if (/^[0-9A-Fa-f]{3}$/.test(s))
      return (
        "#" +
        s
          .split("")
          .map((c) => c + c)
          .join("")
      );
    if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s;
    return raw.trim().startsWith("#") ? raw.trim() : "#" + raw.trim();
  };

  const handleHexChange = (text) => {
    setHexColor(text);
  };

  const handleColorPickerChange = (e) => {
    const hex = e?.target?.value;
    if (hex) setHexColor(hex);
  };

  const handleSave = () => {
    const tid = itemId.trim();
    const nname = name.trim();
    const nextErr = { itemId: !tid, name: !nname };
    if (nextErr.itemId || nextErr.name) {
      setFieldErrors(nextErr);
      Alert.alert(
        "Required",
        "Please fill in all fields marked with *.",
      );
      return;
    }
    setFieldErrors({ itemId: false, name: false });

    const inv = Array.isArray(inventory) ? inventory : [];
    const idDup = inv.some((i) => String(i?.id ?? "").trim() === tid);
    const nameDup = inv.some(
      (i) => (i?.name ?? "").trim().toLowerCase() === nname.toLowerCase(),
    );
    const extRaw = externalCode.trim();
    const extDup =
      extRaw !== "" &&
      inv.some(
        (i) =>
          String(i?.external_code ?? "").trim().toLowerCase() ===
          extRaw.toLowerCase(),
      );

    if (idDup || nameDup || extDup) {
      const lines = [];
      if (idDup) {
        lines.push("An item with this Paint ID already exists.");
      }
      if (nameDup) {
        lines.push("An item with this name already exists.");
      }
      if (extDup) {
        lines.push("Another item already uses this external code.");
      }
      Alert.alert("Cannot add item", lines.join("\n\n"));
      return;
    }

    const minQ = minQuantity.trim() === "" ? 0 : parseInt(minQuantity, 10);
    if (minQuantity.trim() !== "" && (isNaN(minQ) || minQ < 0)) {
      Alert.alert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }

    const priceNum = price.trim() === "" ? undefined : parseFloat(price);
    const typeVal = TYPE_OPTIONS.some((o) => o.value === type)
      ? type
      : undefined;
    const hexVal = normalizeHex(hexColor);
    // Recycle date for custom types is set on first check-in (4 months from that date), not on add
    const item = {
      id: tid,
      name: nname,
      quantity: parseInt(quantity) || 0,
      location: location.trim(),
      createdAt: new Date().toISOString(),
      po_label_ap: poCategory === "ap",
      po_label_mixing: poCategory === "mixing",
      ...(minQ != null && !isNaN(minQ) && { minQuantity: minQ }),
      ...(priceNum != null &&
        !isNaN(priceNum) &&
        priceNum >= 0 && { price: priceNum }),
      ...(typeVal && { type: typeVal }),
      ...(hexVal && { hex_color: hexVal }),
      ...(extRaw && { external_code: extRaw }),
    };

    onSave(item);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={isDesktop && styles.webContentContainer}
    >
      <View style={isDesktop && styles.webWrapper}>
        <Card style={[styles.card, isDesktop && styles.webCard]}>
          <Card.Content>
            <Title style={styles.title}>Add New Paint</Title>

            <TextInput
              label="Paint ID *"
              value={itemId}
              onChangeText={(t) => {
                setItemId(t);
                setFieldErrors((e) => ({ ...e, itemId: false }));
              }}
              placeholder="Required – enter a custom ID"
              mode="outlined"
              style={styles.input}
              error={fieldErrors.itemId}
            />

            <TextInput
              label="Paint Name *"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setFieldErrors((e) => ({ ...e, name: false }));
              }}
              mode="outlined"
              style={styles.input}
              autoFocus={!itemId}
              error={fieldErrors.name}
            />

            <TextInput
              label="External code (optional)"
              value={externalCode}
              onChangeText={setExternalCode}
              mode="outlined"
              style={styles.input}
              placeholder="Barcode text or alternate code"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              label="Quantity (Gallons)"
              value={quantity}
              onChangeText={setQuantity}
              mode="outlined"
              style={styles.input}
              placeholder="0 (default)"
              keyboardType="numeric"
              right={<TextInput.Affix text="gal" />}
            />

            <TextInput
              label="Minimum quantity (low stock threshold)"
              value={minQuantity}
              onChangeText={setMinQuantity}
              mode="outlined"
              style={styles.input}
              keyboardType="number-pad"
              placeholder="0 (default)"
            />

            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <Text
                  style={[
                    styles.typeLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Type
                </Text>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
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
                <Text
                  style={[
                    styles.typeLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Type
                </Text>
                <Menu
                  visible={typeMenuOpen}
                  onDismiss={() => setTypeMenuOpen(false)}
                  anchor={
                    <Pressable
                      onPress={() => setTypeMenuOpen(true)}
                      style={[
                        styles.typeTrigger,
                        {
                          borderColor: theme.colors.outline,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: type
                            ? theme.colors.onSurface
                            : theme.colors.onSurfaceVariant,
                        }}
                      >
                        {type
                          ? (TYPE_OPTIONS.find((o) => o.value === type)
                              ?.label ?? type)
                          : "Select type"}
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
              </>
            )}

            <Text
              style={[
                styles.typeLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              PO / delivery category
            </Text>
            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <select
                  value={poCategory}
                  onChange={(e) => setPoCategory(e.target.value)}
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
                  {PO_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            ) : (
              <Menu
                visible={poCategoryMenuOpen}
                onDismiss={() => setPoCategoryMenuOpen(false)}
                anchor={
                  <Pressable
                    onPress={() => setPoCategoryMenuOpen(true)}
                    style={[
                      styles.typeTrigger,
                      {
                        borderColor: theme.colors.outline,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: theme.colors.onSurface }}>
                      {PO_CATEGORY_OPTIONS.find((o) => o.value === poCategory)
                        ?.label ?? poCategory}
                    </Text>
                  </Pressable>
                }
              >
                {PO_CATEGORY_OPTIONS.map((o) => (
                  <Menu.Item
                    key={o.value}
                    onPress={() => {
                      setPoCategory(o.value);
                      setPoCategoryMenuOpen(false);
                    }}
                    title={o.label}
                  />
                ))}
              </Menu>
            )}

            <Text
              style={[
                styles.typeLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Container
            </Text>
            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
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
                <Menu
                  visible={locationMenuOpen}
                  onDismiss={() => setLocationMenuOpen(false)}
                  anchor={
                    <Pressable
                      onPress={() => setLocationMenuOpen(true)}
                      style={[
                        styles.typeTrigger,
                        {
                          borderColor: theme.colors.outline,
                          backgroundColor: theme.colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: location
                            ? theme.colors.onSurface
                            : theme.colors.onSurfaceVariant,
                        }}
                      >
                        {location
                          ? (CONTAINER_OPTIONS.find((o) => o.value === location)
                              ?.label ?? location)
                          : "Select container"}
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
              </>
            )}

            <TextInput
              label="Unit price (optional)"
              value={price}
              onChangeText={setPrice}
              mode="outlined"
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="e.g. 45.00"
              left={<TextInput.Affix text="$" />}
            />

            <Text
              style={[
                styles.typeLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Paint color (optional)
            </Text>
            <View style={styles.colorRow}>
              <TextInput
                label="Hex code"
                value={hexColor}
                onChangeText={handleHexChange}
                mode="outlined"
                style={[styles.input, styles.colorInput]}
                placeholder="#aabbcc or aabbcc"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isWeb && (
                <View style={styles.colorPickerWrap}>
                  <input
                    type="color"
                    value={
                      hexColor && /^#?[0-9A-Fa-f]{6}$/.test(hexColor.trim())
                        ? hexColor.trim().startsWith("#")
                          ? hexColor.trim()
                          : "#" + hexColor.trim()
                        : "#808080"
                    }
                    onChange={handleColorPickerChange}
                    style={styles.nativeColorInput}
                    title="Pick color"
                  />
                  <Text
                    style={[
                      styles.colorPickerLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Pick
                  </Text>
                </View>
              )}
              {!isWeb && (
                <IconButton
                  icon="camera"
                  size={24}
                  onPress={() => setCameraPickerVisible(true)}
                  style={styles.colorCameraButton}
                />
              )}
            </View>
            <CameraColorPickerModal
              visible={cameraPickerVisible}
              onClose={() => setCameraPickerVisible(false)}
              onColorPicked={(hex) => {
                setCameraPickerVisible(false);
                if (hex) setHexColor(hex);
              }}
            />

            {isCustomType && (
              <Text
                style={[
                  styles.recycleHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Recycle date is set automatically on first check-in (4 months
                from that date).
              </Text>
            )}

            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={handleSave}
                style={[styles.button, styles.saveButton]}
              >
                Save Item
              </Button>

              <Button mode="outlined" onPress={onCancel} style={styles.button}>
                Cancel
              </Button>
            </View>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    marginBottom: 15,
  },
  typeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  typeTrigger: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    marginTop: 10,
  },
  saveButton: {
    marginTop: 20,
  },
  helpText: {
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 4,
    fontStyle: "italic",
  },
  recycleHint: {
    fontSize: 12,
    marginBottom: 12,
    fontStyle: "italic",
  },
  webContentContainer: {
    alignItems: "center",
    paddingTop: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 15,
  },
  colorInput: {
    flex: 1,
    marginBottom: 0,
  },
  colorCameraButton: {
    marginBottom: 8,
  },
  colorPickerWrap: {
    alignItems: "center",
    paddingBottom: 8,
  },
  nativeColorInput: {
    width: 44,
    height: 44,
    padding: 0,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: "transparent",
  },
  colorPickerLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});
