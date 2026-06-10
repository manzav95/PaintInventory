import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
  Pressable,
  Modal,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Card,
  IconButton,
  useTheme,
  Menu,
  ActivityIndicator,
} from "react-native-paper";
import CameraColorPickerModal from "../components/CameraColorPickerModal";
import PageHeader from "../components/PageHeader";
import { getItemApMixingFlags } from "../utils/poItemLabels";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import {
  normalizeDateInput,
  formatRecycleDueFromLotDate,
  formatDateDisplay,
} from "../utils/recycleDates";
import { normalizeItemNameForSave } from "../utils/itemNameUtils";

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

const CUSTOM_CONTAINER_LOCATION = "Custom Container";

function FormRow({ children, desktop }) {
  if (!desktop) return <>{children}</>;
  return <View style={styles.formRow}>{children}</View>;
}

function FormCol({ children, desktop, flex = 1 }) {
  if (!desktop) return <>{children}</>;
  return <View style={[styles.formCol, { flex }]}>{children}</View>;
}

function FieldLabel({ theme, children }) {
  return (
    <Text style={[styles.typeLabel, { color: theme.colors.onSurfaceVariant }]}>
      {children}
    </Text>
  );
}

function WebSelect({
  value,
  onChange,
  options,
  placeholder,
  theme,
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

function ReadOnlyValue({ children, style }) {
  return <Text style={[styles.readOnlyValue, style]}>{children}</Text>;
}

export default function ItemDetailScreen({
  item,
  inventory = [],
  onSave,
  onDelete,
  onChangeId,
  onBack,
  isAdmin,
  onOrderSummary = {},
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const isWideDesktop = isDesktop;
  const inputStyle = isWideDesktop ? styles.inputDesktop : styles.input;
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
  const [displayOrderInput, setDisplayOrderInput] = useState(
    item?.display_order != null && item?.display_order !== ""
      ? String(item.display_order)
      : "0",
  );
  const [hexColorInput, setHexColorInput] = useState(item?.hex_color ?? "");
  const [externalCodeInput, setExternalCodeInput] = useState(
    item?.external_code != null ? String(item.external_code) : "",
  );
  const [rexInput, setRexInput] = useState(
    item?.rex != null ? String(item.rex) : "",
  );
  const [lotDateInput, setLotDateInput] = useState(item?.lot_date ?? "");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [poCategoryMenuOpen, setPoCategoryMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [poCategory, setPoCategory] = useState("mixing");
  const isCustomType = CUSTOM_TYPES.includes(type);
  const recycleDueDisplay =
    formatDateDisplay(item?.recycle_date) ||
    formatRecycleDueFromLotDate(lotDateInput);

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

  useEffect(() => {
    setMinQuantityInput(
      item?.minQuantity != null ? String(item.minQuantity) : "",
    );
  }, [item?.id, item?.minQuantity]);
  useEffect(() => {
    setPriceInput(
      item?.price != null && item?.price !== "" ? String(item.price) : "",
    );
  }, [item?.id, item?.price]);
  useEffect(() => {
    setType(item?.type || "");
  }, [item?.id, item?.type]);
  useEffect(() => {
    setDisplayOrderInput(
      item?.display_order != null && item?.display_order !== ""
        ? String(item.display_order)
        : "0",
    );
  }, [item?.id, item?.display_order]);
  useEffect(() => {
    setHexColorInput(item?.hex_color ?? "");
  }, [item?.id, item?.hex_color]);
  useEffect(() => {
    setLotDateInput(item?.lot_date ?? "");
  }, [item?.id, item?.lot_date]);
  useEffect(() => {
    setExternalCodeInput(
      item?.external_code != null ? String(item.external_code) : "",
    );
  }, [item?.id, item?.external_code]);

  useEffect(() => {
    setRexInput(item?.rex != null ? String(item.rex) : "");
  }, [item?.id, item?.rex]);

  useEffect(() => {
    setFieldErrors({});
  }, [item?.id]);

  useEffect(() => {
    setPoCategory(item?.is_mixing === false ? "ap" : "mixing");
  }, [item?.id]);

  useEffect(() => {
    if (CUSTOM_TYPES.includes(type)) {
      setLocation(CUSTOM_CONTAINER_LOCATION);
    }
  }, [type]);

  const orderInfo = useMemo(() => {
    const id = item?.id != null ? item.id : null;
    if (id == null) return null;
    return onOrderSummary[id] || onOrderSummary[String(id)] || null;
  }, [item?.id, onOrderSummary]);

  const handleSave = async () => {
    if (!isAdmin) {
      Alert.alert(
        "Not Allowed",
        "Only admin can make changes to inventory items.",
      );
      return;
    }

    const trimmedName = normalizeItemNameForSave(name);
    const trimmedId = idInput.trim();
    const nextErr = {};
    if (!trimmedName) nextErr.name = true;
    if (!trimmedId) nextErr.id = true;
    if (Object.keys(nextErr).length > 0) {
      setFieldErrors(nextErr);
      Alert.alert(
        "Required",
        "Please fill in all fields marked with *.",
      );
      return;
    }
    setFieldErrors({});

    const selfId = String(item?.id ?? "");
    const inv = Array.isArray(inventory) ? inventory : [];
    const extTrim = externalCodeInput.trim();
    const otherHasId = inv.some(
      (i) =>
        String(i.id) !== selfId &&
        String(i?.id ?? "").trim() === trimmedId,
    );
    const otherHasName = inv.some(
      (i) =>
        String(i.id) !== selfId &&
        (i?.name ?? "").trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    const otherHasExt =
      extTrim !== "" &&
      inv.some(
        (i) =>
          String(i.id) !== selfId &&
          String(i?.external_code ?? "").trim().toLowerCase() ===
            extTrim.toLowerCase(),
      );

    if (otherHasId || otherHasName || otherHasExt) {
      const lines = [];
      if (otherHasId) {
        lines.push("Another item already uses this Paint ID.");
      }
      if (otherHasName) {
        lines.push("Another item already uses this name.");
      }
      if (otherHasExt) {
        lines.push("Another item already uses this external code.");
      }
      Alert.alert("Cannot save", lines.join("\n\n"));
      return;
    }

    const trimmedMin = minQuantityInput.trim();
    const minQ = trimmedMin === "" ? 0 : parseInt(trimmedMin, 10);
    if (
      type !== "custom_paint" &&
      type !== "custom_stain" &&
      minQuantityInput.trim() !== "" &&
      (isNaN(minQ) || minQ < 0)
    ) {
      Alert.alert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }
    if (
      priceInput.trim() !== "" &&
      (isNaN(parseFloat(priceInput)) || parseFloat(priceInput) < 0)
    ) {
      Alert.alert("Invalid", "Unit price must be 0 or greater.");
      return;
    }
    const typeVal = TYPE_OPTIONS.some((o) => o.value === type) ? type : null;
    const displayOrderVal =
      typeVal === "paint"
        ? displayOrderInput.trim() === ""
          ? 0
          : parseInt(displayOrderInput, 10)
        : 0;
    if (
      typeVal === "paint" &&
      (isNaN(displayOrderVal) || displayOrderVal < 0)
    ) {
      Alert.alert("Invalid", "Display order must be 0 or greater.");
      return;
    }

    const priceVal = priceInput.trim() === "" ? 55.56 : parseFloat(priceInput);
    const hexVal = normalizeHex(hexColorInput);
    let lotDateVal = null;
    if (isCustomType) {
      if (lotDateInput.trim()) {
        lotDateVal = normalizeDateInput(lotDateInput);
        if (!lotDateVal) {
          Alert.alert(
            "Invalid",
            "Lot date must be YYYY-MM-DD (example: 2024-06-15).",
          );
          return;
        }
      }
    }
    const externalCodeVal = externalCodeInput.trim()
      ? externalCodeInput.trim()
      : null;
    const rexVal = rexInput.trim() ? rexInput.trim() : null;
    const updatedItem = {
      ...item,
      id: trimmedId || item?.id,
      name: trimmedName,
      quantity: quantity.trim() === "" ? 0 : parseInt(quantity, 10) || 0,
      location,
      ...(type !== "custom_paint" &&
        type !== "custom_stain" &&
        minQ !== undefined && { minQuantity: minQ }),
      ...(priceVal != null && !isNaN(priceVal) && priceVal >= 0
        ? { price: priceVal }
        : { price: null }),
      type: typeVal,
      display_order: displayOrderVal,
      hex_color: hexVal || null,
      lot_date: lotDateVal,
      external_code: externalCodeVal,
      rex: rexVal,
      is_mixing: poCategory !== "ap",
      po_label_ap: poCategory === "ap",
      po_label_mixing: poCategory !== "ap",
    };

    setSaving(true);
    try {
      if (
        isAdmin &&
        idInput.trim() &&
        idInput.trim() !== (item?.id?.toString() || "").trim()
      ) {
        const newId = idInput.trim();
        const idResult = await onChangeId?.(item?.id, newId);
        if (!idResult || !idResult.success) {
          Alert.alert("Error", idResult?.error || "Failed to change item ID.");
          return;
        }
      }
      await Promise.resolve(onSave(updatedItem));
      onBack?.();
    } finally {
      setSaving(false);
    }
  };

  const rexDisplay = (() => {
    const r =
      item?.rex != null && String(item.rex).trim() !== ""
        ? String(item.rex).trim()
        : "";
    if (r) return r;
    const fb = `${String(item?.id ?? "")}${String(item?.external_code ?? "").trim()}`;
    return fb || "—";
  })();

  const poCategoryDisplay = (() => {
    const { hasAp, hasMixing } = getItemApMixingFlags(item);
    if (hasAp && hasMixing) return "AP · Mixing";
    if (hasAp) return "AP";
    return "Mixing";
  })();

  const typeDisplay =
    type ? (TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type) : "—";

  const containerDisplay = location
    ? (CONTAINER_OPTIONS.find((o) => o.value === location)?.label ?? location)
    : "—";

  const quantityField = isAdmin ? (
    <TextInput
      label={isWideDesktop ? "Quantity" : "Quantity (Gallons)"}
      value={quantity}
      onChangeText={setQuantity}
      mode="outlined"
      keyboardType="numeric"
      style={inputStyle}
      dense={isWideDesktop}
      right={<TextInput.Affix text="gal" />}
    />
  ) : (
    <ReadOnlyValue>{quantity} gal</ReadOnlyValue>
  );

  const colorSection = isAdmin ? (
    <View style={isWideDesktop ? styles.colorRowDesktop : styles.colorRow}>
      <TextInput
        label="Hex color"
        value={hexColorInput}
        onChangeText={setHexColorInput}
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
              hexColorInput && /^#?[0-9A-Fa-f]{6}$/.test(hexColorInput.trim())
                ? hexColorInput.trim().startsWith("#")
                  ? hexColorInput.trim()
                  : "#" + hexColorInput.trim()
                : "#808080"
            }
            onChange={(e) =>
              e?.target?.value && setHexColorInput(e.target.value)
            }
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
  ) : (
    <View style={styles.colorPreviewReadOnly}>
      {hexColorInput ? (
        <>
          <View
            style={[
              styles.colorSwatch,
              {
                backgroundColor: /^#?[0-9A-Fa-f]{6}$/.test(
                  hexColorInput.trim().replace(/^#/, ""),
                )
                  ? hexColorInput.trim().startsWith("#")
                    ? hexColorInput.trim()
                    : "#" + hexColorInput.trim()
                  : "#e0e0e0",
              },
            ]}
          />
          <ReadOnlyValue>{hexColorInput.trim()}</ReadOnlyValue>
        </>
      ) : (
        <ReadOnlyValue>—</ReadOnlyValue>
      )}
    </View>
  );

  const recycleBlock = isCustomType ? (
    <View style={isWideDesktop ? styles.recycleBlockDesktop : styles.recycleBlock}>
      <FieldLabel theme={theme}>Lot date (on bucket)</FieldLabel>
      {isAdmin ? (
        <>
          {isWeb ? (
            <input
              type="date"
              value={lotDateInput}
              onChange={(e) => setLotDateInput(e.target.value)}
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
              value={lotDateInput}
              onChangeText={setLotDateInput}
              mode="outlined"
              style={inputStyle}
              placeholder="YYYY-MM-DD"
            />
          )}
          <Text
            style={[styles.recycleDueValue, { color: theme.colors.onSurface }]}
          >
            Recycle due: {recycleDueDisplay}
          </Text>
          <Text
            style={[styles.recycleHint, { color: theme.colors.onSurfaceVariant }]}
          >
            Recycle is due 9 months after the lot date, and resets 9 months after
            each check-in, check-out, or receiving.
          </Text>
        </>
      ) : (
        <>
          <ReadOnlyValue>
            {lotDateInput ? formatDateDisplay(lotDateInput) : "—"}
          </ReadOnlyValue>
          <Text
            style={[styles.recycleDueValue, { color: theme.colors.onSurface }]}
          >
            Recycle due: {recycleDueDisplay}
          </Text>
        </>
      )}
    </View>
  ) : null;

  const onOrderLine =
    orderInfo && orderInfo.quantity > 0 ? (
      <Text style={[styles.onOrderText, { color: theme.colors.primary }]}>
        On order: {orderInfo.quantity} gal
        {orderInfo.expectedDate
          ? ` · Expected ~${new Date(orderInfo.expectedDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`
          : ""}
      </Text>
    ) : null;

  const lastScannedLine = item?.lastScanned ? (
    <Text
      style={[styles.lastScanned, { color: theme.colors.onSurfaceVariant }]}
    >
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
  ) : null;

  const actionButtons = (
    <View style={isWideDesktop ? styles.buttonRowDesktop : styles.buttonContainer}>
      {isAdmin && (
        <Button
          mode="contained"
          onPress={handleSave}
          icon="content-save"
          disabled={saving}
          loading={saving}
          style={!isWideDesktop ? styles.button : undefined}
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
          View only — admin access required to make changes
        </Text>
      )}
      {isAdmin && item?.id && (
        <Button
          mode="outlined"
          onPress={() => onDelete(item.id)}
          icon="delete"
          textColor="#ff6b6b"
          style={[
            !isWideDesktop && styles.button,
            !isWideDesktop && styles.deleteButton,
          ]}
        >
          Delete Item
        </Button>
      )}
    </View>
  );

  const renderTypeField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>Type</FieldLabel>
          {isAdmin ? (
            <WebSelect
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
              placeholder="Select type"
              theme={theme}
            />
          ) : (
            <ReadOnlyValue
              style={type === "catalyst" ? { color: "#9a7b00" } : undefined}
            >
              {typeDisplay}
            </ReadOnlyValue>
          )}
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>Type</FieldLabel>
        {isAdmin ? (
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
                    color:
                      type === "catalyst"
                        ? "#9a7b00"
                        : type
                          ? theme.colors.onSurface
                          : theme.colors.onSurfaceVariant,
                  }}
                >
                  {type ? typeDisplay : "Select type"}
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
          <ReadOnlyValue
            style={[
              { marginBottom: 16 },
              type === "catalyst" && { color: "#9a7b00" },
            ]}
          >
            {typeDisplay}
          </ReadOnlyValue>
        )}
      </>
    );
  };

  const renderPoCategoryField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>PO / delivery</FieldLabel>
          {isAdmin ? (
            <WebSelect
              value={poCategory}
              onChange={setPoCategory}
              options={PO_CATEGORY_OPTIONS}
              theme={theme}
            />
          ) : (
            <ReadOnlyValue>{poCategoryDisplay}</ReadOnlyValue>
          )}
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>PO / delivery category</FieldLabel>
        {isAdmin ? (
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
        ) : (
          <ReadOnlyValue style={{ marginBottom: 16 }}>
            {poCategoryDisplay}
          </ReadOnlyValue>
        )}
      </>
    );
  };

  const renderContainerField = () => {
    if (isWeb && isWideDesktop) {
      return (
        <View>
          <FieldLabel theme={theme}>Container</FieldLabel>
          {isAdmin ? (
            <WebSelect
              value={isCustomType ? CUSTOM_CONTAINER_LOCATION : location}
              onChange={setLocation}
              options={CONTAINER_OPTIONS}
              placeholder="Select container"
              theme={theme}
              disabled={isCustomType}
            />
          ) : (
            <ReadOnlyValue>{containerDisplay}</ReadOnlyValue>
          )}
        </View>
      );
    }
    return (
      <>
        <FieldLabel theme={theme}>Container</FieldLabel>
        {isAdmin ? (
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
        ) : (
          <ReadOnlyValue style={{ marginBottom: 16 }}>
            {containerDisplay}
          </ReadOnlyValue>
        )}
      </>
    );
  };

  return (
    <>
      <Modal
        visible={saving}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View
          style={[styles.savingOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}
        >
          <View
            style={[
              styles.savingBox,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              style={[styles.savingText, { color: theme.colors.onSurface }]}
            >
              Saving...
            </Text>
          </View>
        </View>
      </Modal>
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
            title="Item Details"
            onBack={onBack}
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
            <Card.Content
              style={isWideDesktop ? styles.cardContentDesktop : styles.cardContent}
            >
              {isWideDesktop ? (
                <>
                  <FormRow desktop>
                    <FormCol desktop flex={1}>
                      {isAdmin ? (
                        <TextInput
                          label="Paint ID *"
                          value={idInput}
                          onChangeText={(t) => {
                            setIdInput(t);
                            setFieldErrors((e) => ({ ...e, id: false }));
                          }}
                          mode="outlined"
                          style={inputStyle}
                          dense
                          error={!!fieldErrors.id}
                        />
                      ) : (
                        <>
                          <FieldLabel theme={theme}>Paint ID</FieldLabel>
                          <ReadOnlyValue>
                            {item?.id?.toString() || "N/A"}
                          </ReadOnlyValue>
                        </>
                      )}
                    </FormCol>
                    <FormCol desktop flex={1.3}>
                      <TextInput
                        label={isAdmin ? "Paint Name *" : "Paint Name"}
                        value={name}
                        onChangeText={(t) => {
                          setName(t);
                          setFieldErrors((e) => ({ ...e, name: false }));
                        }}
                        mode="outlined"
                        style={inputStyle}
                        dense
                        disabled={!isAdmin}
                        editable={isAdmin}
                        error={!!fieldErrors.name}
                      />
                    </FormCol>
                    <FormCol desktop flex={1}>
                      {isAdmin ? (
                        <TextInput
                          label="External code"
                          value={externalCodeInput}
                          onChangeText={setExternalCodeInput}
                          mode="outlined"
                          style={inputStyle}
                          dense
                          placeholder="Optional"
                          autoCapitalize="none"
                        />
                      ) : (
                        <>
                          <FieldLabel theme={theme}>External code</FieldLabel>
                          <ReadOnlyValue>
                            {item?.external_code != null &&
                            String(item.external_code).trim() !== ""
                              ? String(item.external_code)
                              : "—"}
                          </ReadOnlyValue>
                        </>
                      )}
                    </FormCol>
                  </FormRow>

                  <FormRow desktop>
                    <FormCol desktop flex={1}>
                      {isAdmin ? (
                        <TextInput
                          label="REX"
                          value={rexInput}
                          onChangeText={setRexInput}
                          mode="outlined"
                          style={inputStyle}
                          dense
                          placeholder="Optional"
                          autoCapitalize="none"
                        />
                      ) : (
                        <>
                          <FieldLabel theme={theme}>REX</FieldLabel>
                          <ReadOnlyValue>{rexDisplay}</ReadOnlyValue>
                        </>
                      )}
                    </FormCol>
                    <FormCol desktop flex={0.7}>
                      {isAdmin ? (
                        quantityField
                      ) : (
                        <>
                          <FieldLabel theme={theme}>Quantity</FieldLabel>
                          {quantityField}
                        </>
                      )}
                    </FormCol>
                    {!isCustomType && (
                      <FormCol desktop flex={0.7}>
                        {isAdmin ? (
                          <TextInput
                            label="Min qty"
                            value={minQuantityInput}
                            onChangeText={setMinQuantityInput}
                            mode="outlined"
                            style={inputStyle}
                            dense
                            keyboardType="number-pad"
                          />
                        ) : (
                          <>
                            <FieldLabel theme={theme}>Min qty</FieldLabel>
                            <ReadOnlyValue>
                              {item?.minQuantity != null
                                ? String(item.minQuantity)
                                : "Use app default"}
                            </ReadOnlyValue>
                          </>
                        )}
                      </FormCol>
                    )}
                    <FormCol desktop flex={0.7}>
                      {isAdmin ? (
                        <TextInput
                          label="Price"
                          value={priceInput}
                          onChangeText={setPriceInput}
                          mode="outlined"
                          style={inputStyle}
                          dense
                          keyboardType="decimal-pad"
                          left={<TextInput.Affix text="$" />}
                        />
                      ) : (
                        <>
                          <FieldLabel theme={theme}>Price</FieldLabel>
                          <ReadOnlyValue>
                            {item?.price != null && item?.price !== ""
                              ? `$${Number(item.price).toFixed(2)}`
                              : "—"}
                          </ReadOnlyValue>
                        </>
                      )}
                    </FormCol>
                    {isAdmin && type === "paint" && (
                      <FormCol desktop flex={0.6}>
                        <TextInput
                          label="Display order"
                          value={displayOrderInput}
                          onChangeText={setDisplayOrderInput}
                          mode="outlined"
                          style={inputStyle}
                          dense
                          keyboardType="number-pad"
                        />
                      </FormCol>
                    )}
                  </FormRow>

                  {onOrderLine}

                  <FormRow desktop>
                    <FormCol desktop flex={1}>{renderTypeField()}</FormCol>
                    <FormCol desktop flex={1}>{renderPoCategoryField()}</FormCol>
                    <FormCol desktop flex={1}>{renderContainerField()}</FormCol>
                  </FormRow>

                  <FormRow desktop>
                    <FormCol desktop flex={1}>
                      <FieldLabel theme={theme}>Paint color</FieldLabel>
                      {colorSection}
                    </FormCol>
                  </FormRow>

                  {recycleBlock}
                  {lastScannedLine}
                  {actionButtons}
                </>
              ) : (
                <>
                  {isAdmin ? (
                    <TextInput
                      label="Paint ID *"
                      value={idInput}
                      onChangeText={(t) => {
                        setIdInput(t);
                        setFieldErrors((e) => ({ ...e, id: false }));
                      }}
                      mode="outlined"
                      style={inputStyle}
                      error={!!fieldErrors.id}
                    />
                  ) : (
                    <>
                      <FieldLabel theme={theme}>Paint ID</FieldLabel>
                      <ReadOnlyValue style={{ marginBottom: 16 }}>
                        {item?.id?.toString() || "N/A"}
                      </ReadOnlyValue>
                    </>
                  )}
                  <TextInput
                    label={isAdmin ? "Paint Name *" : "Paint Name"}
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      setFieldErrors((e) => ({ ...e, name: false }));
                    }}
                    mode="outlined"
                    style={inputStyle}
                    disabled={!isAdmin}
                    editable={isAdmin}
                    error={!!fieldErrors.name}
                  />
                  {isAdmin ? (
                    <TextInput
                      label="External code (optional)"
                      value={externalCodeInput}
                      onChangeText={setExternalCodeInput}
                      mode="outlined"
                      style={inputStyle}
                      autoCapitalize="none"
                    />
                  ) : (
                    <>
                      <FieldLabel theme={theme}>External code</FieldLabel>
                      <ReadOnlyValue style={{ marginBottom: 16 }}>
                        {item?.external_code != null &&
                        String(item.external_code).trim() !== ""
                          ? String(item.external_code)
                          : "—"}
                      </ReadOnlyValue>
                    </>
                  )}
                  {isAdmin ? (
                    <TextInput
                      label="REX (optional)"
                      value={rexInput}
                      onChangeText={setRexInput}
                      mode="outlined"
                      style={inputStyle}
                      autoCapitalize="none"
                    />
                  ) : (
                    <>
                      <FieldLabel theme={theme}>REX</FieldLabel>
                      <ReadOnlyValue style={{ marginBottom: 16 }}>
                        {rexDisplay}
                      </ReadOnlyValue>
                    </>
                  )}
                  {isAdmin ? (
                    quantityField
                  ) : (
                    <>
                      <FieldLabel theme={theme}>Quantity (Gallons)</FieldLabel>
                      {quantityField}
                    </>
                  )}
                  {onOrderLine}
                  {!isCustomType && (
                    <>
                      <FieldLabel theme={theme}>Minimum quantity</FieldLabel>
                      {isAdmin ? (
                        <TextInput
                          label="Min quantity"
                          value={minQuantityInput}
                          onChangeText={setMinQuantityInput}
                          mode="outlined"
                          keyboardType="number-pad"
                          style={inputStyle}
                        />
                      ) : (
                        <ReadOnlyValue style={{ marginBottom: 16 }}>
                          {item?.minQuantity != null
                            ? String(item.minQuantity)
                            : "Use app default"}
                        </ReadOnlyValue>
                      )}
                    </>
                  )}
                  <FieldLabel theme={theme}>Unit price</FieldLabel>
                  {isAdmin ? (
                    <TextInput
                      label="Price"
                      value={priceInput}
                      onChangeText={setPriceInput}
                      mode="outlined"
                      keyboardType="decimal-pad"
                      style={inputStyle}
                      left={<TextInput.Affix text="$" />}
                    />
                  ) : (
                    <ReadOnlyValue style={{ marginBottom: 16 }}>
                      {item?.price != null && item?.price !== ""
                        ? `$${Number(item.price).toFixed(2)}`
                        : "—"}
                    </ReadOnlyValue>
                  )}
                  {renderTypeField()}
                  {renderPoCategoryField()}
                  {renderContainerField()}
                  {isAdmin && type === "paint" && (
                    <TextInput
                      label="Display order"
                      value={displayOrderInput}
                      onChangeText={setDisplayOrderInput}
                      mode="outlined"
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                  )}
                  <FieldLabel theme={theme}>Paint color (optional)</FieldLabel>
                  {colorSection}
                  {recycleBlock}
                  {lastScannedLine}
                  {actionButtons}
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
            if (hex) setHexColorInput(hex);
          }}
        />
      </ScrollView>
    </>
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
  cardContent: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
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
  readOnlyValue: {
    fontSize: 15,
    fontFamily: "monospace",
    color: "#6f95ab",
  },
  recycleBlock: {
    marginBottom: 12,
    marginTop: 4,
  },
  recycleBlockDesktop: {
    marginTop: 4,
    marginBottom: 4,
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
  onOrderText: {
    fontSize: 14,
    marginBottom: 8,
  },
  lastScanned: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    marginTop: 10,
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
  savingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  savingBox: {
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 160,
  },
  savingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
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
  colorPreviewReadOnly: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 0,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  buttonRowDesktop: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    justifyContent: "flex-start",
    flexWrap: "wrap",
    alignItems: "center",
  },
});
