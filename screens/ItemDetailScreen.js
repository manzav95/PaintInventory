import React, { useState, useEffect } from "react";
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
import { getItemApMixingFlags } from "../utils/poItemLabels";

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

export default function ItemDetailScreen({
  item,
  inventory = [],
  onSave,
  onDelete,
  onChangeId,
  onQuantityChange,
  onBack,
  isAdmin,
  onOrderSummary = {},
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
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
  const [recycleDateInput, setRecycleDateInput] = useState(
    item?.recycle_date ?? "",
  );
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [poCategoryMenuOpen, setPoCategoryMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [poCategory, setPoCategory] = useState("mixing");
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
    setRecycleDateInput(item?.recycle_date ?? "");
  }, [item?.id, item?.recycle_date]);
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
    // Everything is mixing unless is_mixing is explicitly false (AP).
    setPoCategory(item?.is_mixing === false ? "ap" : "mixing");
  }, [item?.id]);

  const handleSave = async () => {
    if (!isAdmin) {
      Alert.alert(
        "Not Allowed",
        "Only admin can make changes to inventory items.",
      );
      return;
    }

    const trimmedName = name.trim();
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
    const recycleVal = recycleDateInput.trim() ? recycleDateInput.trim() : null;
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
      recycle_date: recycleVal,
      external_code: externalCodeVal,
      rex: rexVal,
      // IMPORTANT: AP => is_mixing=false
      is_mixing: poCategory !== "ap",
      // Backward-compatible fallback (older servers)
      po_label_ap: poCategory === "ap",
      po_label_mixing: poCategory !== "ap",
    };

    setSaving(true);
    try {
      // Handle ID change separately first (if changed)
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
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.header}>
          <Button icon="arrow-left" onPress={onBack} mode="text">
            Back
          </Button>
          <Text style={styles.headerTitle}>Item Details</Text>
          <View style={styles.placeholder} />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={isDesktop && styles.webContentContainer}
        >
          <View style={isDesktop && styles.webWrapper}>
            <Card style={[styles.card, isDesktop && styles.webCard]}>
              <Card.Content>
                <Text style={styles.label}>
                  Paint ID{isAdmin ? " *" : ""}
                </Text>
                {isAdmin ? (
                  <TextInput
                    label="Paint ID *"
                    value={idInput}
                    onChangeText={(t) => {
                      setIdInput(t);
                      setFieldErrors((e) => ({ ...e, id: false }));
                    }}
                    mode="outlined"
                    style={styles.input}
                    placeholder="Any format"
                    error={!!fieldErrors.id}
                  />
                ) : (
                  <Text style={styles.itemId}>
                    {item?.id?.toString() || "N/A"}
                  </Text>
                )}

                <Text style={styles.label}>External code</Text>
                {isAdmin ? (
                  <TextInput
                    label="External code (optional)"
                    value={externalCodeInput}
                    onChangeText={setExternalCodeInput}
                    mode="outlined"
                    style={styles.input}
                    placeholder="Barcode text or alternate code"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : (
                  <Text style={styles.itemId}>
                    {item?.external_code != null &&
                    String(item.external_code).trim() !== ""
                      ? String(item.external_code)
                      : "—"}
                  </Text>
                )}

                <Text style={styles.label}>REX</Text>
                {isAdmin ? (
                  <>
                    <TextInput
                      label="REX (optional)"
                      value={rexInput}
                      onChangeText={setRexInput}
                      mode="outlined"
                      style={styles.input}
                      placeholder="Order export code"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Text
                      style={[
                        styles.helperText,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      If empty, exports use Paint ID + external code.
                    </Text>
                  </>
                ) : (
                  <Text style={styles.itemId}>
                    {(() => {
                      const r =
                        item?.rex != null && String(item.rex).trim() !== ""
                          ? String(item.rex).trim()
                          : "";
                      if (r) return r;
                      const fb = `${String(item?.id ?? "")}${String(item?.external_code ?? "").trim()}`;
                      return fb || "—";
                    })()}
                  </Text>
                )}
              </Card.Content>
            </Card>

            <Card style={[styles.card, isDesktop && styles.webCard]}>
              <Card.Content>
                <TextInput
                  label={isAdmin ? "Paint Name *" : "Paint Name"}
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    setFieldErrors((e) => ({ ...e, name: false }));
                  }}
                  mode="outlined"
                  style={styles.input}
                  disabled={!isAdmin}
                  editable={isAdmin}
                  error={!!fieldErrors.name}
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
                        color:
                          type === "catalyst"
                            ? "#9a7b00"
                            : theme.colors.onSurface,
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
                                color:
                                  type === "catalyst"
                                    ? "#9a7b00"
                                    : type
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
                    ) : (
                      <View style={{ marginBottom: 16 }}>
                        <Text
                          style={[
                            styles.itemId,
                            type === "catalyst" && { color: "#9a7b00" },
                          ]}
                        >
                          {type
                            ? (TYPE_OPTIONS.find((o) => o.value === type)
                                ?.label ?? type)
                            : "—"}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                <Text style={styles.label}>PO / delivery category</Text>
                {isAdmin ? (
                  <>
                    {isWeb && isDesktop ? (
                      <View style={styles.input}>
                        <select
                          value={poCategory}
                          onChange={(e) => setPoCategory(e.target.value)}
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
                                marginBottom: 16,
                              },
                            ]}
                          >
                            <Text style={{ color: theme.colors.onSurface }}>
                              {PO_CATEGORY_OPTIONS.find((o) => o.value === poCategory)?.label ??
                                poCategory}
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
                  </>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.itemId}>
                      {(() => {
                        const { hasAp, hasMixing } = getItemApMixingFlags(item);
                        if (hasAp && hasMixing) return "AP · Mixing";
                        if (hasAp) return "AP";
                        return "Mixing";
                      })()}
                    </Text>
                  </View>
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
                                ? (CONTAINER_OPTIONS.find(
                                    (o) => o.value === location,
                                  )?.label ?? location)
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
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.itemId}>
                          {location
                            ? (CONTAINER_OPTIONS.find(
                                (o) => o.value === location,
                              )?.label ?? location)
                            : "—"}
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
                {(() => {
                  const id = item?.id != null ? item.id : null;
                  const orderInfo =
                    id != null &&
                    (onOrderSummary[id] || onOrderSummary[String(id)]);
                  if (orderInfo && orderInfo.quantity > 0) {
                    const exp = orderInfo.expectedDate
                      ? new Date(orderInfo.expectedDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )
                      : "";
                    return (
                      <Text
                        style={[
                          styles.onOrderText,
                          { color: theme.colors.primary, marginBottom: 12 },
                        ]}
                      >
                        On order: {orderInfo.quantity} gal
                        {exp ? ` · Expected ~${exp}` : ""}
                      </Text>
                    );
                  }
                  return null;
                })()}

                {type !== "custom_paint" && type !== "custom_stain" && (
                  <>
                    <Text style={styles.label}>
                      Minimum quantity (low stock)
                    </Text>
                    {isAdmin ? (
                      <TextInput
                        label="Min quantity"
                        value={minQuantityInput}
                        onChangeText={setMinQuantityInput}
                        mode="outlined"
                        keyboardType="number-pad"
                        style={styles.input}
                        placeholder="Blank = 0"
                      />
                    ) : (
                      <Text style={styles.itemId}>
                        {item?.minQuantity != null
                          ? String(item.minQuantity)
                          : "Use app default"}
                      </Text>
                    )}
                  </>
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
                    placeholder="Defaults to 55.56 when blank"
                    left={<TextInput.Affix text="$" />}
                  />
                ) : (
                  <Text style={styles.itemId}>
                    {item?.price != null && item?.price !== ""
                      ? `$${Number(item.price).toFixed(2)}`
                      : "—"}
                  </Text>
                )}

                {isAdmin && type === "paint" && (
                  <>
                    <Text style={styles.label}>
                      Display order (for True order list)
                    </Text>
                    <TextInput
                      label="Order number"
                      value={displayOrderInput}
                      onChangeText={setDisplayOrderInput}
                      mode="outlined"
                      keyboardType="number-pad"
                      style={styles.input}
                      placeholder="0"
                    />
                  </>
                )}

                <Text style={styles.label}>Paint color (optional)</Text>
                {isAdmin ? (
                  <View style={styles.colorRow}>
                    <TextInput
                      label="Hex code"
                      value={hexColorInput}
                      onChangeText={setHexColorInput}
                      mode="outlined"
                      style={[styles.input, styles.colorInput]}
                      placeholder="#aabbcc or aabbcc"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {isWeb && isDesktop && (
                      <View style={styles.colorPickerWrap}>
                        <input
                          type="color"
                          value={
                            hexColorInput &&
                            /^#?[0-9A-Fa-f]{6}$/.test(hexColorInput.trim())
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
                        <Text style={styles.itemId}>
                          {hexColorInput.trim()}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.itemId}>—</Text>
                    )}
                  </View>
                )}

                {isCustomType && (
                  <>
                    <Text style={styles.label}>Recycle date</Text>
                    <Text style={styles.itemId}>{recycleDateInput || "—"}</Text>
                    <Text
                      style={[
                        styles.recycleHint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Set automatically on each check-in (4 months from check-in
                      date).
                    </Text>
                  </>
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
                  disabled={saving}
                  loading={saving}
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
            <CameraColorPickerModal
              visible={cameraPickerVisible}
              onClose={() => setCameraPickerVisible(false)}
              onColorPicked={(hex) => {
                setCameraPickerVisible(false);
                if (hex) setHexColorInput(hex);
              }}
            />
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
  helperText: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemId: {
    fontSize: 16,
    fontFamily: "monospace",
    color: "#6f95ab",
  },
  recycleHint: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    fontStyle: "italic",
  },
  onOrderText: {
    fontSize: 14,
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
  colorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 16,
  },
  colorInput: {
    flex: 1,
    marginBottom: 0,
  },
  colorPickerWrap: {
    alignItems: "center",
    paddingBottom: 8,
  },
  colorCameraButton: {
    marginBottom: 8,
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
  colorPreviewReadOnly: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
});
