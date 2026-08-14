import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  TextInput,
  Text,
  Card,
  useTheme,
  Menu,
  IconButton,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import CameraColorPickerModal from "../components/CameraColorPickerModal";
import PageHeader from "../components/PageHeader";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { normalizeItemNameForSave } from "../utils/itemNameUtils";
import {
  todayDateInput,
  normalizeDateInput,
  formatRecycleDueFromLotDate,
  RECYCLE_DUE_RESET_HINT,
} from "../utils/recycleDates";
import { MATERIAL_TYPE_OPTIONS as TYPE_OPTIONS } from "../utils/materialTypes";
import showAlert from "../utils/showAlert";
import {
  allowsHalfGallon,
  parseGallonQuantity,
  sanitizeGallonInput,
} from "../utils/gallonQuantity";
import {
  DEFAULT_UNIT_PRICE,
  resolveUnitPrice,
} from "../utils/pricing";
import {
  CUSTOM_TYPES,
  CUSTOM_STACK_OPTIONS,
  resolveCustomStackLocation,
} from "../utils/customStacks";

function nameImpliesCustomPaint(name) {
  const t = String(name ?? "").trim();
  if (!t) return false;
  return t.startsWith("#") || /^\d/.test(t);
}

function textMentionsFlorenza(...parts) {
  return parts.some((p) => /\bflorenza\b/i.test(String(p ?? "")));
}

function idImpliesPrecat(id) {
  return String(id ?? "")
    .trim()
    .toUpperCase()
    .startsWith("T75");
}

const CONTAINER_OPTIONS = [
  { label: "White Container", value: "White Container" },
  { label: "Stock Container", value: "Stock Container" },
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
  const [lotDate, setLotDate] = useState(todayDateInput);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [poCategoryMenuOpen, setPoCategoryMenuOpen] = useState(false);
  const [poCategory, setPoCategory] = useState("mixing");
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [catalystPercentInput, setCatalystPercentInput] = useState("");
  const [colorLabel, setColorLabel] = useState("");
  const [fieldErrors, setFieldErrors] = useState({
    itemId: false,
    name: false,
  });

  const isCustomType = CUSTOM_TYPES.includes(type);
  const inputStyle = isWideDesktop ? styles.inputDesktop : styles.input;
  const showFlorenzaCatalyst = textMentionsFlorenza(name, colorLabel);
  const locationOptions = isCustomType
    ? [{ label: "None", value: "" }, ...CUSTOM_STACK_OPTIONS]
    : CONTAINER_OPTIONS;

  useEffect(() => {
    if (CUSTOM_TYPES.includes(type)) {
      setLocation((prev) => {
        const raw = String(prev || "").trim();
        return raw ? resolveCustomStackLocation(raw) : "";
      });
    }
  }, [type]);

  useEffect(() => {
    if (!showFlorenzaCatalyst) setCatalystPercentInput("");
  }, [showFlorenzaCatalyst]);

  const handleItemIdChange = (text) => {
    setItemId(text);
    setFieldErrors((e) => ({ ...e, itemId: false }));
    if (idImpliesPrecat(text)) {
      setType("precat");
    }
  };

  const handleNameChange = (text) => {
    setName(text);
    setFieldErrors((e) => ({ ...e, name: false }));
    if (nameImpliesCustomPaint(text)) {
      setType("custom_paint");
      setLocation((prev) => {
        const raw = String(prev || "").trim();
        return raw ? resolveCustomStackLocation(raw) : "";
      });
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
    const nname = normalizeItemNameForSave(name);
    const nextErr = { itemId: !tid, name: !nname };
    if (nextErr.itemId || nextErr.name) {
      setFieldErrors(nextErr);
      showAlert("Required", "Please fill in all fields marked with *.");
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
      showAlert("Cannot add item", lines.join("\n\n"));
      return;
    }

    const minQ = minQuantity.trim() === "" ? 0 : parseInt(minQuantity, 10);
    if (minQuantity.trim() !== "" && (isNaN(minQ) || minQ < 0)) {
      showAlert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }

    const priceNum = resolveUnitPrice(price);
    if (price.trim() !== "" && (isNaN(parseFloat(price)) || parseFloat(price) < 0)) {
      showAlert("Invalid", "Unit price must be 0 or greater.");
      return;
    }
    let typeVal = TYPE_OPTIONS.some((o) => o.value === type) ? type : undefined;
    if (idImpliesPrecat(tid)) {
      typeVal = "precat";
    } else if (nameImpliesCustomPaint(nname)) {
      typeVal = "custom_paint";
    }
    const locationVal = CUSTOM_TYPES.includes(typeVal)
      ? String(location || "").trim()
        ? resolveCustomStackLocation(location)
        : ""
      : location.trim();
    const hexVal = normalizeHex(hexColor);
    const rexRaw = rex.trim();
    let lotDateVal = null;
    if (CUSTOM_TYPES.includes(typeVal)) {
      lotDateVal = normalizeDateInput(lotDate);
      if (!lotDateVal) {
        showAlert(
          "Invalid",
          "Lot date must be YYYY-MM-DD (example: 2024-06-15).",
        );
        return;
      }
    }
    const qtyParsed = parseGallonQuantity(quantity, typeVal, { allowZero: true });
    if (!qtyParsed.ok) {
      showAlert("Invalid quantity", qtyParsed.error);
      return;
    }

    let catalystPercentVal = null;
    if (showFlorenzaCatalyst) {
      const catRaw = catalystPercentInput.trim();
      if (catRaw !== "") {
        const n = parseFloat(catRaw);
        if (isNaN(n) || n < 0) {
          showAlert("Invalid", "Catalyst % must be 0 or greater.");
          return;
        }
        catalystPercentVal = n;
      }
    }
    const colorLabelVal = colorLabel.trim() || null;

    const item = {
      id: tid,
      name: nname,
      quantity: qtyParsed.value,
      location: locationVal,
      createdAt: new Date().toISOString(),
      is_mixing: poCategory !== "ap",
      po_label_ap: poCategory === "ap",
      po_label_mixing: poCategory !== "ap",
      ...(minQ != null && !isNaN(minQ) && { minQuantity: minQ }),
      price: priceNum,
      ...(typeVal && { type: typeVal }),
      ...(hexVal && { hex_color: hexVal }),
      ...(extRaw && { external_code: extRaw }),
      ...(rexRaw && { rex: rexRaw }),
      ...(lotDateVal && { lot_date: lotDateVal }),
      ...(colorLabelVal && { color_label: colorLabelVal }),
      catalyst_percent: catalystPercentVal,
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
    const fieldLabel = isCustomType ? "Stack (optional)" : "Container";
    const placeholder = isCustomType ? "None" : "Select container";
    const displayValue = isCustomType
      ? String(location || "").trim()
        ? resolveCustomStackLocation(location)
        : ""
      : location;
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>{fieldLabel}</FieldLabel>
          <WebSelect
            value={displayValue}
            onChange={setLocation}
            options={locationOptions}
            placeholder={placeholder}
            theme={theme}
          />
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>{fieldLabel}</FieldLabel>
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
                  backgroundColor: theme.colors.surfaceContainerHighest,
                },
              ]}
            >
              <Text
                style={{
                  color: displayValue
                    ? theme.colors.onSurface
                    : theme.colors.onSurfaceVariant,
                }}
              >
                {displayValue
                  ? locationOptions.find((o) => o.value === displayValue)
                      ?.label ?? displayValue
                  : placeholder}
              </Text>
            </Pressable>
          }
        >
          {locationOptions.map((o) => (
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
    <View style={isWideDesktop ? undefined : { marginBottom: 15 }}>
      <View style={isWideDesktop ? styles.colorRowDesktop : styles.colorRow}>
        <TextInput
          label="Color name (optional)"
          value={colorLabel}
          onChangeText={setColorLabel}
          mode="outlined"
          style={[
            inputStyle,
            styles.colorNameInput,
            isWideDesktop && { marginBottom: 0 },
          ]}
          dense={isWideDesktop}
          placeholder="Actual paint color name"
        />
        <TextInput
          label="Hex color"
          value={hexColor}
          onChangeText={setHexColor}
          mode="outlined"
          style={[
            inputStyle,
            styles.colorInput,
            isWideDesktop && { marginBottom: 0 },
          ]}
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
      {showFlorenzaCatalyst ? (
        <TextInput
          label="Custom catalyst %"
          value={catalystPercentInput}
          onChangeText={setCatalystPercentInput}
          mode="outlined"
          style={[inputStyle, isWideDesktop && { marginTop: 8, marginBottom: 0 }]}
          dense={isWideDesktop}
          keyboardType="decimal-pad"
          placeholder="e.g. 3.9"
          right={<TextInput.Affix text="%" />}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={{ width: "100%", maxWidth: "100%" }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title="Add New Paint"
          onBack={handleBack}
          embeddedInShell={embeddedInShell}
        />
        <Card
          style={[
            styles.card,
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
                      onChangeText={handleItemIdChange}
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
                      onChangeText={(t) =>
                        setQuantity(sanitizeGallonInput(t, allowsHalfGallon(type)))
                      }
                      mode="outlined"
                      style={inputStyle}
                      dense
                      keyboardType={
                        allowsHalfGallon(type) ? "decimal-pad" : "number-pad"
                      }
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
                    <FieldLabel theme={theme}>Lot date (on bucket)</FieldLabel>
                    {isWeb ? (
                      <input
                        type="date"
                        value={lotDate}
                        onChange={(e) => setLotDate(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: 10,
                          fontSize: 15,
                          borderRadius: 4,
                          border: `1px solid ${theme.colors.outline}`,
                          backgroundColor: theme.colors.surfaceContainerHighest,
                          color: theme.colors.onSurface,
                          marginBottom: 8,
                        }}
                      />
                    ) : (
                      <TextInput
                        label="Lot date"
                        value={lotDate}
                        onChangeText={setLotDate}
                        mode="outlined"
                        style={inputStyle}
                        placeholder="YYYY-MM-DD"
                      />
                    )}
                    <Text
                      style={[
                        styles.recycleDueValue,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Recycle due: {formatRecycleDueFromLotDate(lotDate)}
                    </Text>
                    <Text
                      style={[
                        styles.recycleHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {RECYCLE_DUE_RESET_HINT}
                    </Text>
                  </View>
                )}

                <View style={styles.buttonRowDesktop}>
                  <AppButton mode="contained" onPress={handleSave} icon="content-save">
                    Save Item
                  </AppButton>
                  <AppButton mode="outlined" onPress={onCancel}>
                    Cancel
                  </AppButton>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  label="Paint ID *"
                  value={itemId}
                  onChangeText={handleItemIdChange}
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
                  onChangeText={(t) =>
                    setQuantity(sanitizeGallonInput(t, allowsHalfGallon(type)))
                  }
                  mode="outlined"
                  style={inputStyle}
                  keyboardType={
                    allowsHalfGallon(type) ? "decimal-pad" : "number-pad"
                  }
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
                  label={`Unit price (blank → $${DEFAULT_UNIT_PRICE})`}
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
                      Lot date (on bucket)
                    </Text>
                    <TextInput
                      label="Lot date"
                      value={lotDate}
                      onChangeText={setLotDate}
                      mode="outlined"
                      style={inputStyle}
                      placeholder="YYYY-MM-DD"
                    />
                    <Text
                      style={[
                        styles.recycleDueValue,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Recycle due: {formatRecycleDueFromLotDate(lotDate)}
                    </Text>
                    <Text
                      style={[
                        styles.recycleHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {RECYCLE_DUE_RESET_HINT}
                    </Text>
                  </View>
                )}
                <View style={styles.buttonContainer}>
                  <AppButton
                    mode="contained"
                    onPress={handleSave}
                    style={[styles.button, styles.saveButton]}
                  >
                    Save Item
                  </AppButton>
                  <AppButton mode="outlined" onPress={onCancel} style={styles.button}>
                    Cancel
                  </AppButton>
                </View>
              </>
            )}
          </Card.Content>
        </Card>
        <CameraColorPickerModal
          visible={cameraPickerVisible}
          onClose={() => setCameraPickerVisible(false)}
          onColorPicked={(hex) => {
            setCameraPickerVisible(false);
            if (hex) setHexColor(hex);
          }}
        />
      </ScrollView>
    </View>
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
  root: { flex: 1, minWidth: 0 },
  scroll: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: 48,
    /** Match Item Details desktop width (webWrapperWide). */
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  card: {
    elevation: 2,
    borderWidth: 1,
    alignSelf: "stretch",
    maxWidth: "100%",
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
    marginBottom: 0,
  },
  colorRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginBottom: 0,
  },
  colorNameInput: {
    flex: 1.2,
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
    alignItems: "center",
    flexWrap: "wrap",
  },
});
