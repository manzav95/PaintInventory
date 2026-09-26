import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
  Image,
} from "react-native";
import {
  Text,
  useTheme,
  ActivityIndicator,
  TextInput,
  SegmentedButtons,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import InventoryService from "../services/inventoryService";
import showToast from "../utils/showToast";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { colors, radius } from "../theme/tokens";
import {
  CAB_LF_PER_GALLON,
  gallonsFromCabLf,
  matchFinishColorToInventory,
  parseFinishQuantitiesText,
} from "../utils/finishQuantitiesParse";
import { getMaterialTypeLabel } from "../utils/materialTypes";

function wholeGal(n) {
  const v = Number(n) || 0;
  return String(Math.round(v));
}

function fmtLf(n) {
  const v = Number(n) || 0;
  return Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : String(Math.round(v * 10) / 10);
}

async function pickImageAsDataUrl() {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  try {
    const ImagePicker = require("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({
        type: "error",
        title: "Permission needed",
        message: "Allow photo library access to upload the report screenshot.",
      });
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    if (asset.base64) {
      const mime = asset.mimeType || "image/jpeg";
      return `data:${mime};base64,${asset.base64}`;
    }
    return asset.uri || null;
  } catch (e) {
    console.error(e);
    showToast({
      type: "error",
      title: "Cannot open photos",
      message: e?.message || "Image picker unavailable.",
    });
    return null;
  }
}

export default function StockPlanningScreen({
  inventory = [],
  embeddedInShell = false,
  onBack,
  onOpenPlaceOrder,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  const [tab, setTab] = useState("stock");
  const [estimates, setEstimates] = useState([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [stockQuery, setStockQuery] = useState("");
  const [onlyShort, setOnlyShort] = useState(false);

  const [weekLabel, setWeekLabel] = useState("current");
  const [previewUri, setPreviewUri] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [lfRows, setLfRows] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const loadStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const rows = await InventoryService.getStockEstimates();
      setEstimates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setEstimates([]);
    } finally {
      setLoadingStock(false);
    }
  }, []);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  const filteredEstimates = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    return (estimates || [])
      .filter((r) => {
        if (onlyShort && !(Number(r.shortfall) > 0)) return false;
        if (!q) return true;
        return (
          String(r.name || "").toLowerCase().includes(q) ||
          String(r.itemId || "").toLowerCase().includes(q) ||
          String(r.type || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (Number(b.shortfall) || 0) - (Number(a.shortfall) || 0));
  }, [estimates, stockQuery, onlyShort]);

  const stockTotals = useMemo(() => {
    let short = 0;
    let need = 0;
    for (const r of filteredEstimates) {
      if (Number(r.shortfall) > 0) {
        short += 1;
        need += Number(r.shortfall) || 0;
      }
    }
    return { short, need: Math.round(need) };
  }, [filteredEstimates]);

  const enrichLfRows = useCallback(
    (rows) =>
      (rows || []).map((r) => {
        const matched = matchFinishColorToInventory(r.color, inventory);
        const cabLf = Number(r.cabLf) || 0;
        const gallons =
          r.gallons != null ? Number(r.gallons) : gallonsFromCabLf(cabLf);
        return {
          ...r,
          cabLf,
          gallons,
          itemId: matched?.id || null,
          itemName: matched?.name || null,
          onHand: matched != null ? Number(matched.quantity) || 0 : null,
          orderQty: Math.max(0, Math.ceil(gallons)),
        };
      }),
    [inventory],
  );

  const processImageDataUrl = useCallback(
    async (dataUrl) => {
      if (!dataUrl) return;
      setPreviewUri(dataUrl.startsWith("data:") ? dataUrl : dataUrl);
      setOcrBusy(true);
      try {
        const result = await InventoryService.ocrFinishQuantities(dataUrl);
        if (!result.success) {
          showToast({
            type: "error",
            title: "Could not read screenshot",
            message:
              result.error || "Try pasting the color + Cab LF text instead.",
          });
          return;
        }
        const enriched = enrichLfRows(result.rows);
        setLfRows(enriched);
        if (!enriched.length) {
          showToast({
            type: "error",
            title: "No colors found",
            message:
              "Collapse all finish colors so only the name and Cab LF show, then try again — or paste the list below.",
          });
        } else {
          showToast({
            title: "Report read",
            message: `${enriched.length} color${enriched.length === 1 ? "" : "s"} · gallons = Cab LF ÷ ${CAB_LF_PER_GALLON}`,
          });
        }
      } finally {
        setOcrBusy(false);
      }
    },
    [enrichLfRows],
  );

  const readFileAsDataUrl = useCallback((file) => {
    return new Promise((resolve, reject) => {
      if (!file || typeof FileReader === "undefined") {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "") || null);
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImageFile = useCallback(
    async (file) => {
      if (!file) return;
      const type = String(file.type || "");
      if (type && !type.startsWith("image/")) {
        showToast({
          type: "error",
          title: "Not an image",
          message: "Drop or paste a screenshot (PNG/JPG).",
        });
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        await processImageDataUrl(dataUrl);
      } catch (e) {
        showToast({
          type: "error",
          title: "Could not read image",
          message: e?.message || "Try Upload screenshot instead.",
        });
      }
    },
    [processImageDataUrl, readFileAsDataUrl],
  );

  const handleUploadScreenshot = async () => {
    const dataUrl = await pickImageAsDataUrl();
    if (!dataUrl) return;
    await processImageDataUrl(dataUrl);
  };

  // Web: paste image from clipboard while on Week LF tab
  useEffect(() => {
    if (Platform.OS !== "web" || tab !== "week") return undefined;
    if (typeof window === "undefined") return undefined;

    const onPaste = (e) => {
      if (ocrBusy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item && item.type && item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          return;
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [tab, ocrBusy, handleImageFile]);

  const onDropZoneDragOver = (e) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    e?.nativeEvent?.preventDefault?.();
    setDragOver(true);
  };

  const onDropZoneDragLeave = (e) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    e?.nativeEvent?.preventDefault?.();
    setDragOver(false);
  };

  const onDropZoneDrop = async (e) => {
    if (Platform.OS !== "web") return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    e?.nativeEvent?.preventDefault?.();
    setDragOver(false);
    if (ocrBusy) return;
    const dt = e?.dataTransfer || e?.nativeEvent?.dataTransfer;
    const file = dt?.files?.[0];
    if (file) await handleImageFile(file);
  };

  const handleParsePaste = () => {
    const local = parseFinishQuantitiesText(pasteText);
    if (local.length) {
      setLfRows(enrichLfRows(local));
      showToast({
        title: "List parsed",
        message: `${local.length} color${local.length === 1 ? "" : "s"}`,
      });
      return;
    }
    // Fall back to server parse (same logic)
    (async () => {
      setOcrBusy(true);
      try {
        const result = await InventoryService.parseFinishQuantitiesText(pasteText);
        const enriched = enrichLfRows(result.rows);
        setLfRows(enriched);
        if (!enriched.length) {
          showToast({
            type: "error",
            title: "Nothing parsed",
            message: "Paste lines like: Black Horizon 33",
          });
        }
      } finally {
        setOcrBusy(false);
      }
    })();
  };

  const lfTotals = useMemo(() => {
    let lf = 0;
    let gal = 0;
    for (const r of lfRows) {
      lf += Number(r.cabLf) || 0;
      gal += Number(r.gallons) || 0;
    }
    return {
      lf: Math.round(lf * 10) / 10,
      gal: Math.round(gal * 10) / 10,
      order: lfRows.reduce((s, r) => s + (Number(r.orderQty) || 0), 0),
    };
  }, [lfRows]);

  const updateLfRow = (index, patch) => {
    setLfRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        if (patch.cabLf != null) {
          next.cabLf = Number(patch.cabLf) || 0;
          next.gallons = gallonsFromCabLf(next.cabLf);
          next.orderQty = Math.max(0, Math.ceil(next.gallons));
        }
        return next;
      }),
    );
  };

  const removeLfRow = (index) => {
    setLfRows((prev) => prev.filter((_, i) => i !== index));
  };

  const dropZoneStyle = [
    styles.dropZone,
    {
      borderColor: dragOver
        ? theme.colors.primary
        : theme.colors.outlineVariant,
      backgroundColor: dragOver
        ? theme.dark
          ? "rgba(59,130,246,0.16)"
          : "rgba(59,130,246,0.1)"
        : theme.dark
          ? "rgba(255,255,255,0.03)"
          : "rgba(0,0,0,0.02)",
      opacity: ocrBusy ? 0.7 : 1,
    },
  ];

  const dropZoneInner = (
    <>
      <Text style={[styles.dropTitle, { color: theme.colors.onSurface }]}>
        {dragOver ? "Drop screenshot here" : "Drag & drop screenshot here"}
      </Text>
      <Text
        style={[styles.dropHint, { color: theme.colors.onSurfaceVariant }]}
      >
        or paste image from clipboard · or choose a file
      </Text>
      <View style={styles.toolbar}>
        <AppButton
          mode="contained"
          onPress={handleUploadScreenshot}
          disabled={ocrBusy}
          icon="image"
        >
          Choose file
        </AppButton>
        {ocrBusy ? <ActivityIndicator /> : null}
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.background },
        !embeddedInShell && styles.rootPad,
      ]}
    >
      {!embeddedInShell && (
        <PageHeader title="Stock & week order" onBack={onBack} />
      )}

      <View style={[styles.inner, isWide && styles.innerWide]}>
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          style={styles.tabs}
          buttons={[
            { value: "stock", label: "Suggested stock" },
            { value: "week", label: "Week LF order" },
          ]}
        />

        {tab === "stock" ? (
          <ScrollView
            contentContainerStyle={styles.scrollPad}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}
            >
              Based on the last ~6 months of check-outs for standard colors and
              AP materials (primer / clear / catalyst). Suggested stock = about
              2 weeks of use.
            </Text>

            <View style={styles.toolbar}>
              <OutlinedSearchInput
                value={stockQuery}
                onChangeText={setStockQuery}
                placeholder="Search color or ID"
                style={styles.search}
              />
              <AppButton
                mode={onlyShort ? "contained" : "outlined"}
                onPress={() => setOnlyShort((v) => !v)}
                compact
              >
                {onlyShort ? "Short only" : "Show all"}
              </AppButton>
              <AppButton mode="outlined" onPress={loadStock} compact>
                Refresh
              </AppButton>
            </View>

            <View
              style={[
                styles.summaryStrip,
                {
                  borderColor: theme.colors.outlineVariant,
                  backgroundColor: theme.dark
                    ? "rgba(59,130,246,0.1)"
                    : "rgba(59,130,246,0.06)",
                },
              ]}
            >
              <Text style={{ color: theme.colors.onSurface }}>
                {stockTotals.short} color
                {stockTotals.short === 1 ? "" : "s"} below 2-week target · need ~
                {stockTotals.need} gal total
              </Text>
            </View>

            {loadingStock ? (
              <ActivityIndicator style={{ marginTop: 24 }} />
            ) : filteredEstimates.length === 0 ? (
              <Text
                style={[
                  styles.empty,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                No matching items.
              </Text>
            ) : (
              <View style={styles.table}>
                <View
                  style={[
                    styles.tableHead,
                    { borderBottomColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.th,
                      styles.colName,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Color
                  </Text>
                  <View style={styles.metrics}>
                    {isWide ? (
                      <>
                        <Text
                          style={[
                            styles.th,
                            styles.colNum,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          /wk
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            styles.colNum,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          /mo
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            styles.colNum,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          2 wk
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            styles.colNum,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          On hand
                        </Text>
                        <Text
                          style={[
                            styles.th,
                            styles.colNum,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Need
                        </Text>
                      </>
                    ) : (
                      <Text
                        style={[
                          styles.th,
                          styles.colNumWide,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Target / hand
                      </Text>
                    )}
                  </View>
                </View>
                {filteredEstimates.map((r) => {
                  const short = Number(r.shortfall) > 0;
                  return (
                    <View
                      key={r.itemId}
                      style={[
                        styles.tableRow,
                        {
                          borderBottomColor: theme.colors.outlineVariant,
                          backgroundColor: short
                            ? theme.dark
                              ? "rgba(201,151,46,0.12)"
                              : "rgba(201,151,46,0.08)"
                            : "transparent",
                        },
                      ]}
                    >
                      <View style={styles.colName}>
                        <Text
                          style={[
                            styles.rowTitle,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                        <Text
                          style={[
                            styles.rowMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {getMaterialTypeLabel(r.type) || r.type} · {r.itemId}
                        </Text>
                      </View>
                      <View style={styles.metrics}>
                        {isWide ? (
                          <>
                            <Text
                              style={[
                                styles.td,
                                styles.colNum,
                                { color: theme.colors.onSurface },
                              ]}
                            >
                              {wholeGal(r.avgPerWeek)}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                styles.colNum,
                                { color: theme.colors.onSurface },
                              ]}
                            >
                              {wholeGal(r.avgPerMonth)}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                styles.colNum,
                                { color: theme.colors.onSurface },
                              ]}
                            >
                              {wholeGal(r.suggestedStock)}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                styles.colNum,
                                { color: theme.colors.onSurface },
                              ]}
                            >
                              {wholeGal(r.currentQuantity)}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                styles.colNum,
                                {
                                  color: short
                                    ? colors.brand?.buttonFill ||
                                      theme.colors.primary
                                    : theme.colors.onSurfaceVariant,
                                  fontWeight: short ? "700" : "500",
                                },
                              ]}
                            >
                              {short ? wholeGal(r.shortfall) : "—"}
                            </Text>
                          </>
                        ) : (
                          <View style={styles.colNumWide}>
                            <Text
                              style={{
                                color: theme.colors.onSurface,
                                fontWeight: "700",
                                textAlign: "right",
                              }}
                            >
                              {wholeGal(r.suggestedStock)} /{" "}
                              {wholeGal(r.currentQuantity)}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.onSurfaceVariant,
                                fontSize: 12,
                                textAlign: "right",
                                marginTop: 2,
                              }}
                            >
                              {wholeGal(r.avgPerWeek)}/wk ·{" "}
                              {wholeGal(r.avgPerMonth)}/mo
                              {short
                                ? ` · need ${wholeGal(r.shortfall)}`
                                : ""}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {typeof onOpenPlaceOrder === "function" ? (
              <AppButton
                mode="contained"
                onPress={onOpenPlaceOrder}
                style={{ marginTop: 20 }}
              >
                Open Place Order
              </AppButton>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollPad}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}
            >
              Drop or paste (⌘/Ctrl+V) a Finish Quantities screenshot — collapse
              all colors so you only see the name and Cab LF. Paint gallons =
              Cab LF ÷ {CAB_LF_PER_GALLON}. Use Current week (Mon–Fri) or Next
              week.
            </Text>

            <SegmentedButtons
              value={weekLabel}
              onValueChange={setWeekLabel}
              style={styles.tabs}
              buttons={[
                { value: "current", label: "Current week" },
                { value: "next", label: "Next week" },
              ]}
            />

            {Platform.OS === "web" ? (
              <div
                onDragOver={onDropZoneDragOver}
                onDragEnter={onDropZoneDragOver}
                onDragLeave={onDropZoneDragLeave}
                onDrop={onDropZoneDrop}
                style={{
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderRadius: 8,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 20,
                  paddingBottom: 20,
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 140,
                  boxSizing: "border-box",
                  borderColor: dragOver
                    ? theme.colors.primary
                    : theme.colors.outlineVariant,
                  backgroundColor: dragOver
                    ? theme.dark
                      ? "rgba(59,130,246,0.16)"
                      : "rgba(59,130,246,0.1)"
                    : theme.dark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                  opacity: ocrBusy ? 0.7 : 1,
                  cursor: "copy",
                }}
              >
                {dropZoneInner}
              </div>
            ) : (
              <View style={dropZoneStyle}>{dropZoneInner}</View>
            )}

            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.preview}
                resizeMode="contain"
              />
            ) : null}

            <Text
              style={[styles.pasteLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              Or paste color + Cab LF lines (one per row)
            </Text>
            <TextInput
              mode="outlined"
              multiline
              numberOfLines={4}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={"Black Horizon 33\nCustom # 4424 3\nRevere pewter 300"}
              style={styles.pasteBox}
            />
            <AppButton
              mode="outlined"
              onPress={handleParsePaste}
              disabled={ocrBusy || !pasteText.trim()}
              style={{ marginBottom: 12 }}
            >
              Parse pasted list
            </AppButton>

            {lfRows.length > 0 ? (
              <>
                <View
                  style={[
                    styles.summaryStrip,
                    {
                      borderColor: theme.colors.outlineVariant,
                      backgroundColor: theme.dark
                        ? "rgba(34,197,94,0.12)"
                        : "rgba(34,197,94,0.08)",
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.onSurface }}>
                    {weekLabel === "next" ? "Next week" : "Current week"} ·{" "}
                    {lfRows.length} colors · {fmtLf(lfTotals.lf)} Cab LF ·{" "}
                    {fmtLf(lfTotals.gal)} gal (÷{CAB_LF_PER_GALLON}) · order ~
                    {lfTotals.order} gal
                  </Text>
                </View>

                <View style={styles.table}>
                  <View
                    style={[
                      styles.tableHead,
                      { borderBottomColor: theme.colors.outlineVariant },
                    ]}
                  >
                    <Text
                      style={[
                        styles.th,
                        styles.colName,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Finish color
                    </Text>
                    <View style={styles.metricsLf}>
                      <Text
                        style={[
                          styles.th,
                          styles.colLf,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Cab LF
                      </Text>
                      <Text
                        style={[
                          styles.th,
                          styles.colLf,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Gal
                      </Text>
                      <Text
                        style={[
                          styles.th,
                          styles.colLf,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Order
                      </Text>
                    </View>
                  </View>
                  {lfRows.map((r, idx) => (
                    <View
                      key={`${r.color}-${idx}`}
                      style={[
                        styles.tableRow,
                        { borderBottomColor: theme.colors.outlineVariant },
                      ]}
                    >
                      <View style={styles.colName}>
                        <Text
                          style={[
                            styles.rowTitle,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {r.color}
                        </Text>
                        <Text
                          style={[
                            styles.rowMeta,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                          numberOfLines={1}
                        >
                          {r.itemId
                            ? `Matched ${r.itemId} · on hand ${wholeGal(r.onHand)}`
                            : "Not matched in inventory"}
                        </Text>
                      </View>
                      <View style={styles.metricsLf}>
                        <View style={styles.colLf}>
                          <TextInput
                            dense
                            mode="outlined"
                            value={String(r.cabLf ?? "")}
                            onChangeText={(t) =>
                              updateLfRow(idx, {
                                cabLf: t.replace(/[^0-9.]/g, ""),
                              })
                            }
                            keyboardType="decimal-pad"
                            style={styles.lfInput}
                          />
                        </View>
                        <Text
                          style={[
                            styles.td,
                            styles.colLf,
                            { color: theme.colors.onSurface },
                          ]}
                        >
                          {fmtLf(r.gallons)}
                        </Text>
                        <View style={styles.colLf}>
                          <Text
                            style={[
                              styles.td,
                              {
                                color: theme.colors.onSurface,
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {wholeGal(r.orderQty)}
                          </Text>
                          <Pressable
                            onPress={() => removeLfRow(idx)}
                            hitSlop={8}
                          >
                            <Text
                              style={{
                                color: theme.colors.error,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {typeof onOpenPlaceOrder === "function" ? (
                  <AppButton
                    mode="contained"
                    onPress={onOpenPlaceOrder}
                    style={{ marginTop: 16 }}
                  >
                    Open Place Order
                  </AppButton>
                ) : null}
              </>
            ) : (
              <Text
                style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}
              >
                No week list yet — upload a collapsed report or paste color + LF
                lines.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootPad: { paddingTop: Platform.OS === "ios" ? 48 : 16 },
  inner: { flex: 1, paddingHorizontal: 16 },
  innerWide: { maxWidth: 1080, alignSelf: "center", width: "100%" },
  tabs: { marginBottom: 16, marginTop: 8 },
  scrollPad: { paddingBottom: 48, paddingTop: 4 },
  lead: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
    maxWidth: 720,
  },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  search: { flex: 1, minWidth: 180 },
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: radius?.[2] || 8,
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 140,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    textAlign: "center",
  },
  dropHint: {
    fontSize: 12,
    marginBottom: 14,
    textAlign: "center",
  },
  summaryStrip: {
    borderWidth: 1,
    borderRadius: radius?.[2] || 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  empty: { marginTop: 32, textAlign: "center" },
  table: { borderRadius: 8, overflow: "hidden" },
  tableHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  th: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "right",
  },
  td: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  colName: { flex: 1, minWidth: 0 },
  metrics: {
    flexDirection: "row",
    flexShrink: 0,
    alignItems: "center",
    gap: 8,
  },
  metricsLf: {
    flexDirection: "row",
    flexShrink: 0,
    alignItems: "center",
    gap: 12,
  },
  colNum: {
    width: 64,
    textAlign: "right",
  },
  colNumWide: {
    width: 128,
    alignItems: "flex-end",
  },
  colLf: {
    width: 72,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "700", letterSpacing: 0.1 },
  rowMeta: { fontSize: 12, marginTop: 3, opacity: 0.9 },
  preview: {
    width: "100%",
    height: 160,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#111",
  },
  pasteLabel: { fontSize: 12, marginBottom: 8, marginTop: 4 },
  pasteBox: { marginBottom: 10, minHeight: 96 },
  lfInput: { width: 72, height: 40, fontSize: 14, textAlign: "right" },
});
