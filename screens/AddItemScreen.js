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
  useTheme,
  Menu,
  IconButton,
} from "react-native-paper";
import CameraColorPickerModal from "../components/CameraColorPickerModal";
import PageHeader from "../components/PageHeader";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

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
const CUSTOM_CONTAINER_LOCATION = "Custom Container";

function nameImpliesCustomPaint(name) {
  const t = String(name ?? "").trim();
  if (!t) return false;
  return t.startsWith("#") || /^\d/.test(t);
}

function recycleDueDateFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 4);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CONTAINER_OPTIONS = [
  { label: "White Container", value: "White Container" },
  { label: "Stock Container", value: "Stock Container" },
  { label: "Custom Container", value: "Custom Container" },
];

const PO_CATEGORY_OPTIONS = [
  { label: "Mixing", value: "mixing" },
  { label: "AP", value: "ap" },
];

function FormRow({ children, desktop }) {
  if (!desktop) return <>{children}</>;
  return <View style={styles.formRow}>{children}</View>;
}

function FormCol({ children, desktop, flex = 1 }) {
  if (!desktop) return <>{children}</>;
  return <View style={[styles.formCol, { flex }]}>{children}</View>;
}

function WebSelect({
  value,
  onChange,
  options,
  placeholder,
  theme,
  style,
  disabled = false,
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: 10,
        fontSize: 15,
        borderRadius: 4,
        border: `1px solid ${theme.colors.outline}`,
        backgroundColor: theme.colors.surfaceContainerHighest,
        color: theme.colors.onSurface,
        opacity: disabled ? 0.7 : 1,
        ...style,
      }}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function AddItemScreen({
  onSave,
  onCancel,
  inventory = [],
  embeddedInShell = false,
  onBack,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const isWideDesktop = isDesktop;
  const handleBack = onBack || onCancel;
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [itemId, setItemId] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [hexColor, setHexColor] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [rex, setRex] = useState("");
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
  const inputStyle = isWideDesktop ? styles.inputDesktop : styles.input;

  useEffect(() => {
    if (CUSTOM_TYPES.includes(type)) {
      setLocation(CUSTOM_CONTAINER_LOCATION);
    }
  }, [type]);

  const handleNameChange = (text) => {
    setName(text);
    setFieldErrors((e) => ({ ...e, name: false }));
    if (nameImpliesCustomPaint(text)) {
      setType("custom_paint");
    }
  };

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
      Alert.alert("Required", "Please fill in all fields marked with *.");
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
      if (idDup) lines.push("An item with this Paint ID already exists.");
      if (nameDup) lines.push("An item with this name already exists.");
      if (extDup) lines.push("Another item already uses this external code.");
      Alert.alert("Cannot add item", lines.join("\n\n"));
      return;
    }

    const minQ = minQuantity.trim() === "" ? 0 : parseInt(minQuantity, 10);
    if (minQuantity.trim() !== "" && (isNaN(minQ) || minQ < 0)) {
      Alert.alert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }

    const priceNum = price.trim() === "" ? undefined : parseFloat(price);
    let typeVal = TYPE_OPTIONS.some((o) => o.value === type) ? type : undefined;
    if (nameImpliesCustomPaint(nname)) {
      typeVal = "custom_paint";
    }
    const locationVal = CUSTOM_TYPES.includes(typeVal)
      ? CUSTOM_CONTAINER_LOCATION
      : location.trim();
    const hexVal = normalizeHex(hexColor);
    const rexRaw = rex.trim();
    const item = {
      id: tid,
      name: nname,
      quantity: parseInt(quantity) || 0,
      location: locationVal,
      createdAt: new Date().toISOString(),
      is_mixing: poCategory !== "ap",
      po_label_ap: poCategory === "ap",
      po_label_mixing: poCategory !== "ap",
      ...(minQ != null && !isNaN(minQ) && { minQuantity: minQ }),
      ...(priceNum != null &&
        !isNaN(priceNum) &&
        priceNum >= 0 && { price: priceNum }),
      ...(typeVal && { type: typeVal }),
      ...(hexVal && { hex_color: hexVal }),
      ...(extRaw && { external_code: extRaw }),
      ...(rexRaw && { rex: rexRaw }),
    };

    onSave(item);
  };

  const renderTypeField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>Type</FieldLabel>
          <WebSelect
            value={type}
            onChange={setType}
            options={TYPE_OPTIONS}
            placeholder="Select type"
            theme={theme}
          />
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>Type</FieldLabel>
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
                  backgroundColor: theme.colors.surfaceContainerHighest,
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
                  ? (TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type)
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
    );
  };

  const renderPoCategoryField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>PO / delivery</FieldLabel>
          <WebSelect
            value={poCategory}
            onChange={setPoCategory}
            options={PO_CATEGORY_OPTIONS}
            theme={theme}
          />
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>PO / delivery category</FieldLabel>
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
                  backgroundColor: theme.colors.surfaceContainerHighest,
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
      </>
    );
  };

  const renderContainerField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>Container</FieldLabel>
          <WebSelect
            value={isCustomType ? CUSTOM_CONTAINER_LOCATION : location}
            onChange={setLocation}
            options={CONTAINER_OPTIONS}
            placeholder="Select container"
            theme={theme}
            disabled={isCustomType}
          />
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>Container</FieldLabel>
        <Menu
          visible={locationMenuOpen}
          onDismiss={() => setLocationMenuOpen(false)}
          anchor={
            <Pressable
              onPress={() => !isCustomType && setLocationMenuOpen(true)}
              disabled={isCustomType}
              style={[
                styles.typeTrigger,
                {
                  borderColor: theme.colors.outline,
                  backgroundColor: theme.colors.surfaceContainerHighest,
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
                {(isCustomType ? CUSTOM_CONTAINER_LOCATION : location)
                  ? (CONTAINER_OPTIONS.find(
                      (o) =>
                        o.value ===
                        (isCustomType ? CUSTOM_CONTAINER_LOCATION : location),
                    )?.label ??
                    (isCustomType ? CUSTOM_CONTAINER_LOCATION : location))
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
    );
  };

  const colorSection = (
    <View style={isWideDesktop ? styles.colorRowDesktop : styles.colorRow}>
      <TextInput
        label="Hex color"
        value={hexColor}
        onChangeText={setHexColor}
        mode="outlined"
        style={[inputStyle, styles.colorInput, isWideDesktop && { marginBottom: 0 }]}
        dense={isWideDesktop}
        placeholder="#aabbcc"
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
        </View>
      )}
      {!isWeb && (
        <IconButton
          icon="camera"
          size={24}
          onPress={() => setCameraPickerVisible(true)}
        />
      )}
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        isDesktop && styles.webContentContainer,
        isWideDesktop && styles.webContentContainerWide,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[
          isDesktop && styles.webWrapper,
          isWideDesktop && styles.webWrapperWide,
        ]}
      >
        <PageHeader
          title="Add New Paint"
          onBack={handleBack}
          embeddedInShell={embeddedInShell}
        />
        <Card
          style={[
            styles.card,
            isDesktop && styles.webCard,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
          mode="outlined"
        >
          <Card.Content style={isWideDesktop && styles.cardContentDesktop}>
            {isWideDesktop ? (
              <>
                <FormRow desktop>
                  <FormCol desktop flex={1}>
                    <TextInput
                      label="Paint ID *"
                      value={itemId}
                      onChangeText={(t) => {
                        setItemId(t);
                        setFieldErrors((e) => ({ ...e, itemId: false }));
                      }}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      error={fieldErrors.itemId}
                    />
                  </FormCol>
                  <FormCol desktop flex={1.3}>
                    <TextInput
                      label="Paint Name *"
                      value={name}
                      onChangeText={handleNameChange}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      error={fieldErrors.name}
                    />
                  </FormCol>
                  <FormCol desktop flex={1}>
                    <TextInput
                      label="External code"
                      value={externalCode}
                      onChangeText={setExternalCode}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      placeholder="Optional"
                      autoCapitalize="none"
                    />
                  </FormCol>
                </FormRow>

                <FormRow desktop>
                  <FormCol desktop flex={1}>
                    <TextInput
                      label="REX"
                      value={rex}
                      onChangeText={setRex}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      placeholder="Optional"
                      autoCapitalize="none"
                    />
                  </FormCol>
                  <FormCol desktop flex={0.7}>
                    <TextInput
                      label="Quantity"
                      value={quantity}
                      onChangeText={setQuantity}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      keyboardType="numeric"
                      right={<TextInput.Affix text="gal" />}
                    />
                  </FormCol>
                  <FormCol desktop flex={0.7}>
                    <TextInput
                      label="Min qty"
                      value={minQuantity}
                      onChangeText={setMinQuantity}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      keyboardType="number-pad"
                    />
                  </FormCol>
                  <FormCol desktop flex={0.7}>
                    <TextInput
                      label="Price"
                      value={price}
                      onChangeText={setPrice}
                      mode="outlined"
                      style={inputStyle}
                      dense
                      keyboardType="decimal-pad"
                      left={<TextInput.Affix text="$" />}
                    />
                  </FormCol>
                </FormRow>

                <FormRow desktop>
                  <FormCol desktop flex={1}>{renderTypeField()}</FormCol>
                  <FormCol desktop flex={1}>{renderPoCategoryField()}</FormCol>
                  <FormCol desktop flex={1}>{renderContainerField()}</FormCol>
                </FormRow>

                <FormRow desktop>{colorSection}</FormRow>

                {isCustomType && (
                  <View style={styles.recycleBlockDesktop}>
                    <Text
                      style={[
                        styles.recycleDueValue,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Recycle due: {recycleDueDateFromNow()}
                    </Text>
                    <Text
                      style={[
                        styles.recycleHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      4 months after last activity (add, check-in/out, receive,
                      qty change).
                    </Text>
                  </View>
                )}

                <View style={styles.buttonRowDesktop}>
                  <Button mode="contained" onPress={handleSave} icon="content-save">
                    Save Item
                  </Button>
                  <Button mode="outlined" onPress={onCancel}>
                    Cancel
                  </Button>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  label="Paint ID *"
                  value={itemId}
                  onChangeText={(t) => {
                    setItemId(t);
                    setFieldErrors((e) => ({ ...e, itemId: false }));
                  }}
                  placeholder="Required – enter a custom ID"
                  mode="outlined"
                  style={inputStyle}
                  error={fieldErrors.itemId}
                />
                <TextInput
                  label="Paint Name *"
                  value={name}
                  onChangeText={handleNameChange}
                  mode="outlined"
                  style={inputStyle}
                  autoFocus={!itemId}
                  error={fieldErrors.name}
                />
                <TextInput
                  label="External code (optional)"
                  value={externalCode}
                  onChangeText={setExternalCode}
                  mode="outlined"
                  style={inputStyle}
                  placeholder="Barcode or alternate code"
                  autoCapitalize="none"
                />
                <TextInput
                  label="REX (optional)"
                  value={rex}
                  onChangeText={setRex}
                  mode="outlined"
                  style={inputStyle}
                  autoCapitalize="none"
                />
                <TextInput
                  label="Quantity (Gallons)"
                  value={quantity}
                  onChangeText={setQuantity}
                  mode="outlined"
                  style={inputStyle}
                  keyboardType="numeric"
                  right={<TextInput.Affix text="gal" />}
                />
                <TextInput
                  label="Minimum quantity (low stock threshold)"
                  value={minQuantity}
                  onChangeText={setMinQuantity}
                  mode="outlined"
                  style={inputStyle}
                  keyboardType="number-pad"
                />
                {renderTypeField()}
                {renderPoCategoryField()}
                {renderContainerField()}
                <TextInput
                  label="Unit price (optional)"
                  value={price}
                  onChangeText={setPrice}
                  mode="outlined"
                  style={inputStyle}
                  keyboardType="decimal-pad"
                  left={<TextInput.Affix text="$" />}
                />
                <FieldLabel theme={theme}>Paint color (optional)</FieldLabel>
                {colorSection}
                {isCustomType && (
                  <View style={styles.recycleBlock}>
                    <Text
                      style={[
                        styles.recycleDueLabel,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Recycle due
                    </Text>
                    <Text
                      style={[
                        styles.recycleDueValue,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {recycleDueDateFromNow()}
                    </Text>
                    <Text
                      style={[
                        styles.recycleHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Starts when you save. Due 4 months after last activity.
                    </Text>
                  </View>
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
              </>
            )}
          </Card.Content>
        </Card>
      </View>
      <CameraColorPickerModal
        visible={cameraPickerVisible}
        onClose={() => setCameraPickerVisible(false)}
        onColorPicked={(hex) => {
          setCameraPickerVisible(false);
          if (hex) setHexColor(hex);
        }}
      />
    </ScrollView>
  );
}

function FieldLabel({ theme, children }) {
  return (
    <Text style={[styles.typeLabel, { color: theme.colors.onSurfaceVariant }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  card: {
    elevation: 2,
    borderWidth: 1,
  },
  input: {
    marginBottom: 15,
  },
  inputDesktop: {
    marginBottom: 0,
  },
  typeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  typeTrigger: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
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
  recycleBlock: {
    marginBottom: 12,
    marginTop: 4,
  },
  recycleBlockDesktop: {
    marginTop: 4,
    marginBottom: 4,
  },
  recycleDueLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  recycleDueValue: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  recycleHint: {
    fontSize: 12,
    fontStyle: "italic",
  },
  webContentContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 24,
  },
  webContentContainerWide: {
    paddingBottom: 16,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  webWrapperWide: {
    maxWidth: 1100,
    width: "100%",
  },
  webCard: {
    width: "100%",
  },
  cardContentDesktop: {
    paddingVertical: 12,
    gap: 10,
  },
  formRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  formCol: {
    minWidth: 0,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 15,
  },
  colorRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginBottom: 0,
  },
  colorInput: {
    flex: 1,
    marginBottom: 0,
  },
  colorPickerWrap: {
    paddingTop: 4,
  },
  nativeColorInput: {
    width: 40,
    height: 40,
    padding: 0,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    backgroundColor: "transparent",
  },
  buttonRowDesktop: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    justifyContent: "flex-start",
  },
});
