import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import {
  Card,
  Text,
  TextInput,
  Button,
  useTheme,
  Dialog,
  Portal,
  ActivityIndicator,
  Checkbox,
} from "react-native-paper";
import DateField from "../components/DateField";
import TimeField from "../components/TimeField";
import PageHeader from "../components/PageHeader";
import ShakeView from "../components/ShakeView";
import FormHelp from "../components/FormHelp";
import StaggerItem from "../components/StaggerItem";
import { SkeletonStack } from "../components/SkeletonBlock";
import ScrollFrame from "../components/ScrollFrame";
import showToast from "../utils/showToast";
import { MATERIAL_USAGE_FORM_HELP } from "../constants/formHelpContent";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { nestedSurfaceColor } from "../utils/themeColors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialUsageService, {
  BOOTH_OPTIONS,
  CATALYST_PERCENT,
} from "../services/materialUsageService";
import {
  formatMonthDayYear,
  todayPacificIso,
} from "../utils/wasteDrumConversion";

const STORAGE_KEYS = {
  booth: "@material_usage_booth",
  boothFilter: "@material_usage_booth_filter",
  shiftFilter: "@material_usage_shift_filter",
};

function formatDateForInput(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeForInput(d) {
  const date = d instanceof Date ? d : new Date(d);
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatTimeDisplay(t) {
  if (!t || typeof t !== "string") return t || "—";
  const s = t.trim();
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = match24[2];
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${h12}:${m} ${ampm}`;
  }
  return s;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function formatLogDate(entryDate) {
  if (!entryDate || typeof entryDate !== "string") return "—";
  const d = new Date(entryDate.trim());
  if (Number.isNaN(d.getTime())) return entryDate;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

const MATERIAL_USAGE_COLOR_TYPES = [
  "paint",
  "custom_paint",
  "clear",
  "primer",
  "custom_stain",
];

/** Parse custom material input:
 * - If user types a paint ID (e.g. "1234" or "#1234"), treat as paint.
 * - Otherwise, exactly one of dye/stain/toner required. toner → clear.
 */
function parseCustomMaterialInput(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "no_keyword" };
  }
  const raw = text.trim();
  const t = raw.toLowerCase();
  // Paint ID shortcut: 4 digits or # followed by digits
  if (/^\d{4}$/.test(raw) || /^#\d+$/.test(raw)) {
    return { ok: true, type: "paint" };
  }
  const hasDye = t.includes("dye");
  const hasStain = t.includes("stain");
  const hasToner = t.includes("toner");
  const count = [hasDye, hasStain, hasToner].filter(Boolean).length;
  if (count === 0) {
    return { ok: false, error: "no_keyword" };
  }
  if (count > 1) {
    return { ok: false, error: "multiple_keywords" };
  }
  if (hasDye) return { ok: true, type: "dye" };
  if (hasStain) return { ok: true, type: "stain" };
  return { ok: true, type: "clear" };
}

/** For display only: infer type from color name when exactly one keyword (dye/stain/toner). Otherwise return "". */
function deriveCustomCategory(text) {
  const result = parseCustomMaterialInput(text);
  return result.ok ? result.type : "";
}

/** Resolve material type for a log row: stored type, else item type from inventory, else infer from color name (dye/stain/toner). */
function getResolvedMaterialType(row, inventory = []) {
  const stored = (row.material_type || "").toLowerCase().trim();
  if (stored) return stored;
  if (row.item_id && inventory.length > 0) {
    const item = inventory.find((i) => String(i.id) === String(row.item_id));
    const t = (item?.type || "").toLowerCase().trim();
    if (t) return t;
  }
  return deriveCustomCategory(row.color_name || "") || "";
}

function formatMaterialTypeLabel(type) {
  if (!type || typeof type !== "string") return "—";
  const t = type.trim();
  if (!t) return "—";
  return t
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Material type colors (match inventory list): paint blue, clear orange, stain green, primer brown, dye purple, catalyst yellow. */
function getMaterialTypeColor(type, theme) {
  if (!type || typeof type !== "string")
    return theme?.colors?.onSurfaceVariant ?? "#666";
  const t = (type || "").toLowerCase().trim();
  if (t === "paint" || t === "custom_paint" || t === "precat") return "#1565c0";
  if (t === "clear") return "#e65100";
  if (t === "stain" || t === "custom_stain") return "#2e7d32";
  if (t === "primer") return theme?.dark ? "#f5f5dc" : "#5d4037";
  if (t === "dye") return "#7e57c2";
  if (t === "catalyst") return "#9a7b00";
  return theme?.colors?.onSurfaceVariant ?? "#666";
}

function formatQtyDisplay(row) {
  const gal = Number(row.qty_gallons) || 0;
  if (row.cup_gun) {
    const oz = Math.round(gal * 128 * 10) / 10;
    return `${oz} oz`;
  }
  return `${gal} gal`;
}

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

/** Parse entry_time (e.g. "3:25 PM", "15:25", "12:30 AM") to minutes since midnight. Returns NaN if unparseable. */
function parseTimeToMinutes(entryTime) {
  if (!entryTime || typeof entryTime !== "string") return NaN;
  const s = entryTime.trim();
  const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const ampm = (match12[3] || "").toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    return h * 60 + m;
  }
  return NaN;
}

/** Standard: day 6:00–15:25 (360–925), swing 15:26–00:30 (926–1440 or 0–30). OT: day 6:00–16:25 (360–985), swing 16:26–02:30 (986–1440 or 0–150). */
function getShift(entryTime, isOvertime) {
  const M = parseTimeToMinutes(entryTime);
  if (Number.isNaN(M)) return null;
  if (isOvertime) {
    if (M >= 360 && M <= 985) return "day";
    if (M >= 986 || M <= 150) return "swing";
  } else {
    if (M >= 360 && M <= 925) return "day";
    if (M >= 926 || M <= 30) return "swing";
  }
  return null;
}

/** Date key for grouping/stats: swing entries after midnight (e.g. 12:01am–12:30am) count as the previous calendar day. */
function getLogDate(row, isOvertime) {
  const dateStr = row.entry_date || "";
  if (!dateStr) return dateStr;
  const shift = getShift(row.entry_time, isOvertime);
  if (shift !== "swing") return dateStr;
  const M = parseTimeToMinutes(row.entry_time);
  if (Number.isNaN(M)) return dateStr;
  const overnightEnd = isOvertime ? 150 : 30;
  if (M > overnightEnd) return dateStr;
  try {
    const d = new Date(dateStr + "T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  } catch (e) {
    return dateStr;
  }
}

export default function MaterialUsageScreen({
  inventory = [],
  userName,
  isAdmin = false,
  materialUsageOvertime = false,
  onBack,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const surfaceCardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.surfaceContainerHighest,
      borderColor: theme.colors.outlineVariant,
    },
  ];

  const now = useMemo(() => new Date(), []);
  const [entryDate, setEntryDate] = useState(() => formatDateForInput(now));
  const [entryTime, setEntryTime] = useState(() => formatTimeForInput(now));
  const [jobName, setJobName] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [materialFocused, setMaterialFocused] = useState(false);
  const [customColor, setCustomColor] = useState("");
  const [qty, setQty] = useState("");
  const [cupGun, setCupGun] = useState(false);
  const [booth, setBoothState] = useState(BOOTH_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [catalyzedDialogVisible, setCatalyzedDialogVisible] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [boothFilter, setBoothFilterState] = useState("all");
  const [shiftFilter, setShiftFilterState] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [expandedLogDayKeys, setExpandedLogDayKeys] = useState([]);

  const setBooth = (value) => {
    setBoothState(value);
    AsyncStorage.setItem(STORAGE_KEYS.booth, value);
  };
  const setBoothFilter = (value) => {
    setBoothFilterState(value);
    AsyncStorage.setItem(STORAGE_KEYS.boothFilter, value);
  };
  const setShiftFilter = (value) => {
    setShiftFilterState(value);
    AsyncStorage.setItem(STORAGE_KEYS.shiftFilter, value);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedBooth, savedBoothFilter, savedShiftFilter] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.booth),
            AsyncStorage.getItem(STORAGE_KEYS.boothFilter),
            AsyncStorage.getItem(STORAGE_KEYS.shiftFilter),
          ]);
        if (cancelled) return;
        const validBooths = BOOTH_OPTIONS.map((o) => o.value);
        if (savedBooth && validBooths.includes(savedBooth))
          setBoothState(savedBooth);
        if (
          savedBoothFilter &&
          ["all", ...BOOTH_OPTIONS.map((o) => o.value)].includes(
            savedBoothFilter,
          )
        )
          setBoothFilterState(savedBoothFilter);
        if (
          savedShiftFilter &&
          ["all", "day", "swing"].includes(savedShiftFilter)
        )
          setShiftFilterState(savedShiftFilter);
      } catch (e) {
        console.warn("Material usage prefs load:", e);
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveMaterialType = useMemo(() => {
    if (selectedItem) return (selectedItem.type || "").toLowerCase() || null;
    const custom = (customColor || colorQuery || "").trim();
    return custom ? deriveCustomCategory(custom) : null;
  }, [selectedItem, customColor, colorQuery]);

  const needsCatalyst = useMemo(
    () =>
      effectiveMaterialType &&
      ["paint", "custom_paint", "clear", "primer"].includes(
        effectiveMaterialType,
      ),
    [effectiveMaterialType],
  );

  const catalystOz = useMemo(() => {
    if (!needsCatalyst) return 0;
    const n = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(n) || n < 0) return 0;
    if (cupGun) {
      // Qty is entered in ounces; catalyst is a % of that in ounces, rounded to nearest 0.1
      const oz = n * (CATALYST_PERCENT / 100);
      return Math.round(oz * 10) / 10;
    }
    // Qty is in gallons; convert to ounces and apply percentage, keep 2 decimals
    const oz = n * (CATALYST_PERCENT / 100) * 128;
    return Math.round(oz * 100) / 100;
  }, [qty, needsCatalyst, cupGun]);

  const materialSuggestions = useMemo(() => {
    const paintClearPrimer = inventory.filter((i) =>
      MATERIAL_USAGE_COLOR_TYPES.includes(String(i.type || "").toLowerCase()),
    );
    const q = (colorQuery || "").trim().toLowerCase();
    // Live search: wait for a few letters, then top 5 hits
    if (q.length < 2 || selectedItem) return [];
    return paintClearPrimer
      .filter(
        (i) =>
          (i.name || "").toLowerCase().includes(q) ||
          (i.id || "").toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aName = (a.name || a.id || "").toLowerCase();
        const bName = (b.name || b.id || "").toLowerCase();
        const aStarts = aName.startsWith(q) ? 0 : 1;
        const bStarts = bName.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return aName.localeCompare(bName);
      })
      .slice(0, 5);
  }, [inventory, colorQuery, selectedItem]);

  const showMaterialSuggestions =
    materialFocused && !selectedItem && (colorQuery || "").trim().length >= 2;
  const filteredLogs = useMemo(() => {
    let list = logs;
    if (boothFilter && boothFilter !== "all") {
      list = list.filter((l) => l.booth === boothFilter);
    }
    if (isAdmin) {
      const cutoff = Date.now() - THREE_MONTHS_MS;
      list = list.filter((row) => {
        const d = row.entry_date ? new Date(row.entry_date) : null;
        return d && !Number.isNaN(d.getTime()) && d.getTime() >= cutoff;
      });
      if (shiftFilter && shiftFilter !== "all") {
        list = list.filter(
          (row) =>
            getShift(row.entry_time, materialUsageOvertime) === shiftFilter,
        );
      }
    }
    return list;
  }, [logs, boothFilter, isAdmin, shiftFilter, materialUsageOvertime]);

  const logsByDay = useMemo(() => {
    const byDay = {};
    filteredLogs.forEach((row) => {
      const key = getLogDate(row, materialUsageOvertime) || "";
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(row);
    });
    const dayTotals = (rows) => {
      const t = { paint: 0, clear: 0, primer: 0, stain: 0, dye: 0 };
      rows.forEach((row) => {
        const type = getResolvedMaterialType(row, inventory);
        const qty = Number(row.qty_gallons) || 0;
        if (type === "paint" || type === "custom_paint" || type === "precat")
          t.paint += qty;
        else if (type === "clear") t.clear += qty;
        else if (type === "primer") t.primer += qty;
        else if (type === "stain" || type === "custom_stain") t.stain += qty;
        else if (type === "dye") t.dye += qty;
      });
      return t;
    };
    return Object.keys(byDay)
      .sort((a, b) => (b || "").localeCompare(a || ""))
      .map((date) => ({
        date,
        rows: byDay[date],
        totals: dayTotals(byDay[date]),
      }));
  }, [filteredLogs, materialUsageOvertime, inventory]);

  const formatDayTotals = (totals) => {
    if (!totals) return "";
    const parts = [];
    if (totals.paint > 0) parts.push(`Paint: ${totals.paint.toFixed(2)} gal`);
    if (totals.clear > 0) parts.push(`Clear: ${totals.clear.toFixed(2)} gal`);
    if (totals.primer > 0)
      parts.push(`Primer: ${totals.primer.toFixed(2)} gal`);
    if (totals.stain > 0) parts.push(`Stain: ${totals.stain.toFixed(2)} gal`);
    if (totals.dye > 0) parts.push(`Dye: ${totals.dye.toFixed(2)} gal`);
    return parts.length ? parts.join(" · ") : "No line items";
  };

  const totalsFilterLabel = (() => {
    const boothPart =
      !boothFilter || boothFilter === "all" ? "All" : boothFilter;
    if (!isAdmin) return `${boothPart} · Today`;
    const shiftPart =
      !shiftFilter || shiftFilter === "all"
        ? null
        : shiftFilter === "day"
          ? "Day"
          : "Swing";
    return shiftPart ? `${boothPart} · ${shiftPart}` : boothPart;
  })();

  const logTotals = useMemo(() => {
    const t = { paint: 0, clear: 0, primer: 0, stain: 0, dye: 0 };
    filteredLogs.forEach((row) => {
      const type = getResolvedMaterialType(row, inventory);
      const qty = Number(row.qty_gallons) || 0;
      if (type === "paint" || type === "custom_paint" || type === "precat")
        t.paint += qty;
      else if (type === "clear") t.clear += qty;
      else if (type === "primer") t.primer += qty;
      else if (type === "stain" || type === "custom_stain") t.stain += qty;
      else if (type === "dye") t.dye += qty;
    });
    return t;
  }, [filteredLogs, inventory]);

  const loadLogs = useCallback(
    async (boothOverride) => {
      try {
        const boothValue =
          boothOverride !== undefined ? boothOverride : boothFilter;
        const boothParam = boothValue === "all" ? null : boothValue;
        const limit = isAdmin ? 2000 : 500;
        const list = await MaterialUsageService.list(
          boothParam,
          limit,
          isAdmin ? {} : { restrictToToday: true, excludeAdmin: true },
        );
        const next = Array.isArray(list) ? list : [];
        setLogs(next);
        // Auto-expand day groups so entries are visible without an extra tap
        const keys = [
          ...new Set(
            next.map((row) => {
              const date = getLogDate(row, materialUsageOvertime) || "";
              return date ? `day-${date}` : null;
            }),
          ),
        ].filter(Boolean);
        setExpandedLogDayKeys(keys);
      } catch (e) {
        console.error("Material usage list:", e);
      } finally {
        setLogsLoaded(true);
        setRefreshing(false);
      }
    },
    [boothFilter, isAdmin, materialUsageOvertime],
  );

  useEffect(() => {
    setLogsLoaded(false);
    loadLogs();
  }, [loadLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const submitEntry = async (entry) => {
    setSubmitting(true);
    try {
      await MaterialUsageService.create(entry);
      setJobName("");
      setSelectedItem(null);
      setCustomColor("");
      setColorQuery("");
      setQty("");
      const now = new Date();
      setEntryDate(formatDateForInput(now));
      setEntryTime(formatTimeForInput(now));
      // Show the booth that was just logged so the new row is visible
      const nextBooth = entry.booth || boothFilter;
      if (entry.booth) {
        setBoothFilter(entry.booth);
      }
      await loadLogs(nextBooth);
      showToast({ title: "Saved", message: "Material usage logged." });
    } catch (e) {
      console.error("Submit material usage:", e);
      showToast({
        type: "error",
        title: "Error",
        message: e?.message || "Failed to save entry.",
      });
    } finally {
      setSubmitting(false);
      setPendingEntry(null);
      setCatalyzedDialogVisible(false);
    }
  };

  const handleSubmit = () => {
    const job = (jobName || "").trim();
    if (!job) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Required",
        message: "Enter a job number.",
      });
      return;
    }
    const customTrim = (customColor || colorQuery || "").trim();
    const hasSelection = selectedItem || customTrim;
    if (!hasSelection) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Required",
        message: "Choose a material or enter a custom one.",
      });
      return;
    }
    if (customTrim && !selectedItem) {
      const parsed = parseCustomMaterialInput(customTrim);
      if (!parsed.ok) {
        const title =
          parsed.error === "no_keyword"
            ? "Specify material type"
            : "Clarify material type";
        const message =
          parsed.error === "no_keyword"
            ? 'Please include one of these in your material description: if it\'s a dye, write "dye"; if it\'s a stain, write "stain"; if it\'s a toner, write "toner" (counts as clear).'
            : "Your input contains more than one type (dye, stain, or toner). Please clarify which one applies.";
        setShakeTick((n) => n + 1);
        showToast({ type: "error", title, message, duration: 4200 });
        return;
      }
    }
    const rawQty = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(rawQty) || rawQty <= 0) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Required",
        message: "Enter a quantity greater than zero.",
      });
      return;
    }
    let qtyGallons;
    let catOz = 0;
    if (cupGun) {
      // Qty entered in ounces; convert to gallons for storage
      qtyGallons = rawQty / 128;
      if (needsCatalyst) {
        const oz = rawQty * (CATALYST_PERCENT / 100);
        // Round catalyst to nearest 0.10 oz
        catOz = Math.round(oz * 10) / 10;
      }
    } else {
      // Qty entered in gallons, snapped to 0.25 increments
      const qtyNum = Math.round(rawQty * 4) / 4;
      qtyGallons = qtyNum;
      if (needsCatalyst) {
        const oz = qtyNum * (CATALYST_PERCENT / 100) * 128;
        catOz = Math.round(oz * 100) / 100;
      }
    }
    const itemId = selectedItem ? selectedItem.id : "";
    const colorName = selectedItem
      ? selectedItem.name || selectedItem.id
      : customTrim;
    const materialType = selectedItem
      ? (selectedItem.type || "").toLowerCase() || null
      : parseCustomMaterialInput(customTrim).type;
    const entry = {
      entry_date: entryDate,
      entry_time: entryTime,
      job_name: job,
      item_id: itemId,
      color_name: colorName,
      material_type: materialType,
      qty_gallons: qtyGallons,
      catalyst_oz: catOz,
      booth,
      user_name: userName || "unknown",
      catalyzed_confirmed: true,
      cup_gun: cupGun,
    };
    if (!needsCatalyst) {
      submitEntry(entry);
      return;
    }
    setPendingEntry(entry);
    setCatalyzedDialogVisible(true);
  };

  const handleCatalyzed = async (confirmed) => {
    if (!pendingEntry) {
      setCatalyzedDialogVisible(false);
      setPendingEntry(null);
      return;
    }
    if (!confirmed) {
      setCatalyzedDialogVisible(false);
      setPendingEntry(null);
      return;
    }
    await submitEntry({ ...pendingEntry, catalyzed_confirmed: true });
  };

  const hasColor = selectedItem || !!(customColor || colorQuery || "").trim();
  const canSubmit =
    (jobName || "").trim() &&
    hasColor &&
    parseFloat(String(qty).replace(/,/g, ""), 10) > 0 &&
    booth;

  return (
    <>
      <Modal
        visible={submitting}
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
              Saving entry...
            </Text>
          </View>
        </View>
      </Modal>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ScrollView
          style={{ width: "100%", maxWidth: "100%" }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <PageHeader
            title="Material Usage"
            onBack={onBack}
            embeddedInShell={embeddedInShell}
          />
          <Card style={surfaceCardStyle} mode="outlined">
            <ShakeView trigger={shakeTick} style={styles.shakePad}>
              <Card.Content style={styles.form}>
                <View style={styles.formHeaderRow}>
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Log mix
                  </Text>
                  <FormHelp content={MATERIAL_USAGE_FORM_HELP} />
                </View>
                <View style={styles.row}>
                  <DateField
                    label="Date"
                    value={entryDate}
                    onChange={setEntryDate}
                    style={styles.halfInput}
                  />
                  <TimeField
                    label="Time"
                    value={entryTime}
                    onChange={setEntryTime}
                    style={styles.halfInput}
                  />
                </View>
                <TextInput
                  label="Job Number"
                  value={jobName}
                  onChangeText={setJobName}
                  mode="outlined"
                  style={styles.input}
                  placeholder="e.g. 12345"
                />
                <View style={styles.colorSection}>
                  <TextInput
                    label="Material"
                    value={
                      selectedItem
                        ? selectedItem.name || selectedItem.id
                        : customColor || colorQuery
                    }
                    onChangeText={(t) => {
                      setColorQuery(t);
                      setCustomColor("");
                      if (selectedItem) setSelectedItem(null);
                    }}
                    onFocus={() => setMaterialFocused(true)}
                    onBlur={() => {
                      // Delay so suggestion press can register before list unmounts
                      setTimeout(() => setMaterialFocused(false), 150);
                    }}
                    mode="outlined"
                    style={styles.input}
                    placeholder="Type to search or custom dye/stain/toner"
                    right={
                      selectedItem || customColor || colorQuery ? (
                        <TextInput.Icon
                          icon="close"
                          onPress={() => {
                            setSelectedItem(null);
                            setCustomColor("");
                            setColorQuery("");
                          }}
                        />
                      ) : null
                    }
                  />
                  {showMaterialSuggestions ? (
                    <ScrollFrame
                      maxHeight={200}
                      style={styles.suggestBox}
                    >
                        {materialSuggestions.map((item) => (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setSelectedItem(item);
                              setCustomColor("");
                              setColorQuery("");
                              setMaterialFocused(false);
                            }}
                            style={({ pressed }) => [
                              styles.colorRow,
                              pressed && styles.colorRowPressed,
                            ]}
                          >
                            <Text numberOfLines={1} style={styles.colorRowText}>
                              {item.name || item.id}
                            </Text>
                          </Pressable>
                        ))}
                        {(colorQuery || "").trim() ? (
                          <Pressable
                            onPress={() => {
                              setCustomColor((colorQuery || "").trim());
                              setSelectedItem(null);
                              setMaterialFocused(false);
                            }}
                            style={({ pressed }) => [
                              styles.colorRow,
                              styles.colorRowCustom,
                              pressed && styles.colorRowPressed,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.colorRowText,
                                { fontStyle: "italic" },
                              ]}
                            >
                              Use custom: {(colorQuery || "").trim()}
                            </Text>
                          </Pressable>
                        ) : null}
                        {materialSuggestions.length === 0 ? (
                          <Text style={styles.emptyList}>
                            No inventory matches
                          </Text>
                        ) : null}
                    </ScrollFrame>
                  ) : null}
                </View>
                <View style={styles.row}>
                  <TextInput
                    label={cupGun ? "Qty (oz)" : "Qty (gal)"}
                    value={qty}
                    onChangeText={setQty}
                    mode="outlined"
                    keyboardType="decimal-pad"
                    style={needsCatalyst ? styles.halfInput : styles.input}
                    placeholder={cupGun ? "ounces" : "0.25 increments"}
                  />
                  {needsCatalyst && (
                    <View style={[styles.halfInput, styles.catalystDisplay]}>
                      <Text
                        style={[
                          styles.catalystLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Catalyst (4%)
                      </Text>
                      <Text
                        style={[
                          styles.catalystValue,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {catalystOz} oz
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.cupGunRow}>
                  <Checkbox
                    status={cupGun ? "checked" : "unchecked"}
                    onPress={() => setCupGun((prev) => !prev)}
                    color={theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.cupGunLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                    onPress={() => setCupGun((prev) => !prev)}
                  >
                    Cup gun?
                  </Text>
                </View>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Booth
                </Text>
                <View style={styles.buttonRow}>
                  {BOOTH_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      mode={booth === opt.value ? "contained" : "outlined"}
                      onPress={() => setBooth(opt.value)}
                      style={styles.filterButton}
                      compact
                    >
                      {opt.label}
                    </Button>
                  ))}
                </View>
                <View style={styles.actions}>
                  <Button
                    mode="contained"
                    onPress={handleSubmit}
                    disabled={!canSubmit || submitting}
                    loading={submitting}
                    compact
                    icon="send"
                  >
                    Submit
                  </Button>
                </View>
              </Card.Content>
            </ShakeView>
          </Card>

          <Card style={surfaceCardStyle} mode="outlined">
            <Card.Content style={styles.form}>
              <Text
                style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
              >
                {isAdmin ? "Transaction log" : "Today's usage"} ·{" "}
                {formatMonthDayYear(todayPacificIso())}
              </Text>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Filter by booth
              </Text>
              <View style={styles.buttonRow}>
                <Button
                  mode={boothFilter === "all" ? "contained" : "outlined"}
                  onPress={() => setBoothFilter("all")}
                  style={styles.filterButton}
                  compact
                >
                  All
                </Button>
                {BOOTH_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    mode={boothFilter === opt.value ? "contained" : "outlined"}
                    onPress={() => setBoothFilter(opt.value)}
                    style={styles.filterButton}
                    compact
                  >
                    {opt.label}
                  </Button>
                ))}
              </View>
              {isAdmin ? (
                <>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Filter by shift
                  </Text>
                  <View style={styles.buttonRow}>
                    {["all", "day", "swing"].map((sf) => (
                      <Button
                        key={sf}
                        mode={shiftFilter === sf ? "contained" : "outlined"}
                        onPress={() => setShiftFilter(sf)}
                        style={styles.filterButton}
                        compact
                      >
                        {sf === "all" ? "All" : sf === "day" ? "Day" : "Swing"}
                      </Button>
                    ))}
                  </View>
                </>
              ) : null}
              {logsLoaded && filteredLogs.length > 0 && (
                <View style={styles.totalsSection}>
                  <Text
                    style={[
                      styles.totalsTitle,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Totals ({totalsFilterLabel})
                    {isAdmin ? " · Showing last 3 months (admin)" : ""}
                  </Text>
                  <View style={styles.totalsGrid}>
                    <Text
                      style={[
                        styles.totalsRow,
                        styles.totalsChip,
                        {
                          color: "#1565c0",
                          backgroundColor: "rgba(21, 101, 192, 0.12)",
                        },
                      ]}
                    >
                      Paint: {logTotals.paint.toFixed(2)} gal
                    </Text>
                    <Text
                      style={[
                        styles.totalsRow,
                        styles.totalsChip,
                        {
                          color: "#e65100",
                          backgroundColor: "rgba(230, 81, 0, 0.12)",
                        },
                      ]}
                    >
                      Clear: {logTotals.clear.toFixed(2)} gal
                    </Text>
                    <Text
                      style={[
                        styles.totalsRow,
                        styles.totalsChip,
                        {
                          color: theme.dark ? "#f5f5dc" : "#5d4037",
                          backgroundColor: theme.dark
                            ? "rgba(245, 245, 220, 0.2)"
                            : "rgba(93, 64, 55, 0.12)",
                        },
                      ]}
                    >
                      Primer: {logTotals.primer.toFixed(2)} gal
                    </Text>
                    <Text
                      style={[
                        styles.totalsRow,
                        styles.totalsChip,
                        {
                          color: "#2e7d32",
                          backgroundColor: "rgba(46, 125, 50, 0.12)",
                        },
                      ]}
                    >
                      Stain: {logTotals.stain.toFixed(2)} gal
                    </Text>
                    <Text
                      style={[
                        styles.totalsRow,
                        styles.totalsChip,
                        {
                          color: "#7e57c2",
                          backgroundColor: "rgba(126, 87, 194, 0.12)",
                        },
                      ]}
                    >
                      Dye: {logTotals.dye.toFixed(2)} gal
                    </Text>
                  </View>
                </View>
              )}
              {!logsLoaded ? (
                <SkeletonStack lines={5} style={{ marginTop: 8 }} />
              ) : filteredLogs.length === 0 ? (
                <Text style={styles.emptyLogs}>No entries</Text>
              ) : isDesktop ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  style={styles.tableHorizontalWrap}
                >
                  <View style={styles.tableContainer}>
                    <View
                      style={[styles.tableHeader, styles.tableHeaderSticky]}
                    >
                      <Text style={[styles.th, styles.thDate]}>
                        Date / Time
                      </Text>
                      <Text style={[styles.th, styles.thUser]}>User</Text>
                      <Text style={[styles.th, styles.thJob]}>Job</Text>
                      <Text style={[styles.th, styles.thMaterialType]}>
                        Type
                      </Text>
                      <Text style={[styles.th, styles.thColor]}>Color</Text>
                      <Text style={[styles.th, styles.thQty]}>Qty</Text>
                      <Text style={[styles.th, styles.thCat]}>Cat (oz)</Text>
                      <Text style={[styles.th, styles.thBooth]}>Booth</Text>
                    </View>
                    <ScrollFrame maxHeight={520}>
                      <View style={styles.table}>
                        {logsByDay.map(({ date, rows, totals }) => {
                          const dayKey = `day-${date}`;
                          const isExpanded =
                            expandedLogDayKeys.includes(dayKey);
                          return (
                            <React.Fragment key={date}>
                              <Pressable
                                onPress={() =>
                                  setExpandedLogDayKeys((prev) =>
                                    prev.includes(dayKey)
                                      ? prev.filter((k) => k !== dayKey)
                                      : [...prev, dayKey],
                                  )
                                }
                              >
                                <View
                                  style={[
                                    styles.dayHeaderRow,
                                    {
                                      backgroundColor:
                                        theme.colors.surfaceContainerHighest,
                                      borderLeftWidth: 4,
                                      borderLeftColor:
                                        theme.colors.primary || "#6f95ab",
                                    },
                                  ]}
                                >
                                  <View style={styles.dayHeaderContent}>
                                    <Text
                                      style={[
                                        styles.dayHeaderText,
                                        { color: theme.colors.onSurface },
                                      ]}
                                    >
                                      {formatLogDate(date)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.dayHeaderTotals,
                                        {
                                          color:
                                            theme.colors.onSurfaceVariant ||
                                            "#666",
                                        },
                                      ]}
                                    >
                                      {formatDayTotals(totals)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.dayHeaderToggle,
                                        {
                                          color:
                                            theme.colors.onSurfaceVariant ||
                                            "#666",
                                        },
                                      ]}
                                    >
                                      {isExpanded
                                        ? "Tap to collapse"
                                        : "Tap to expand"}
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>
                              {isExpanded &&
                                rows.map((row) => (
                                  <View key={row.id} style={styles.tableRow}>
                                    <View style={[styles.td, styles.thDate]}>
                                      <Text
                                        style={[
                                          styles.timeOnly,
                                          { color: theme.colors.onSurface },
                                        ]}
                                      >
                                        {formatTimeDisplay(row.entry_time)}
                                      </Text>
                                    </View>
                                    <Text style={[styles.td, styles.thUser]}>
                                      {row.user_name || "—"}
                                    </Text>
                                    <Text style={[styles.td, styles.thJob]}>
                                      {row.job_name || "—"}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.td,
                                        styles.thMaterialType,
                                        {
                                          color: getMaterialTypeColor(
                                            getResolvedMaterialType(
                                              row,
                                              inventory,
                                            ),
                                            theme,
                                          ),
                                          fontWeight: "600",
                                        },
                                      ]}
                                    >
                                      {formatMaterialTypeLabel(
                                        getResolvedMaterialType(row, inventory),
                                      )}
                                    </Text>
                                    <Text style={[styles.td, styles.thColor]}>
                                      {row.color_name || "—"}
                                    </Text>
                                    <Text style={[styles.td, styles.thQty]}>
                                      {formatQtyDisplay(row)}
                                    </Text>
                                    <Text style={[styles.td, styles.thCat]}>
                                      {(() => {
                                        const resolvedType =
                                          getResolvedMaterialType(
                                            row,
                                            inventory,
                                          );
                                        if (
                                          resolvedType === "dye" ||
                                          resolvedType === "stain"
                                        )
                                          return "—";
                                        return row.catalyst_oz != null
                                          ? Number(row.catalyst_oz).toFixed(2)
                                          : row.catalyst_gallons != null
                                            ? (
                                                Number(row.catalyst_gallons) *
                                                128
                                              ).toFixed(2)
                                            : "—";
                                      })()}
                                    </Text>
                                    <Text style={[styles.td, styles.thBooth]}>
                                      {row.booth}
                                    </Text>
                                  </View>
                                ))}
                            </React.Fragment>
                          );
                        })}
                      </View>
                    </ScrollFrame>
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.logCardList}>
                  {logsByDay.map(({ date, rows, totals }, dayIndex) => {
                    const dayKey = `day-${date}`;
                    const isExpanded = expandedLogDayKeys.includes(dayKey);
                    return (
                      <StaggerItem key={date} index={dayIndex}>
                        <React.Fragment>
                          <Pressable
                            onPress={() =>
                              setExpandedLogDayKeys((prev) =>
                                prev.includes(dayKey)
                                  ? prev.filter((k) => k !== dayKey)
                                  : [...prev, dayKey],
                              )
                            }
                          >
                            <View
                              style={[
                                styles.dayHeaderCard,
                                {
                                  backgroundColor:
                                    theme.colors.surfaceContainerHighest,
                                  borderLeftColor:
                                    theme.colors.primary || "#6f95ab",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayHeaderText,
                                  { color: theme.colors.onSurface },
                                ]}
                              >
                                {formatLogDate(date)}
                              </Text>
                              <Text
                                style={[
                                  styles.dayHeaderTotals,
                                  {
                                    color:
                                      theme.colors.onSurfaceVariant || "#666",
                                  },
                                ]}
                              >
                                {formatDayTotals(totals)}
                              </Text>
                              <Text
                                style={[
                                  styles.dayHeaderToggle,
                                  {
                                    color:
                                      theme.colors.onSurfaceVariant || "#666",
                                  },
                                ]}
                              >
                                {isExpanded
                                  ? "Tap to collapse"
                                  : "Tap to expand"}
                              </Text>
                            </View>
                          </Pressable>
                          {isExpanded &&
                            rows.map((row) => {
                              const resolvedType = getResolvedMaterialType(
                                row,
                                inventory,
                              );
                              const showCatalyst =
                                resolvedType !== "dye" &&
                                resolvedType !== "stain";
                              const catalystDisplay =
                                row.catalyst_oz != null
                                  ? Number(row.catalyst_oz).toFixed(2)
                                  : row.catalyst_gallons != null
                                    ? (
                                        Number(row.catalyst_gallons) * 128
                                      ).toFixed(2)
                                    : "—";
                              const logItem = (inventory || []).find(
                                (i) => String(i.id) === String(row.item_id),
                              );
                              const hexColor =
                                logItem?.hex_color &&
                                String(logItem.hex_color).trim()
                                  ? String(logItem.hex_color).trim()
                                  : null;
                              const normalizedHex =
                                hexColor &&
                                /^#?[0-9A-Fa-f]{3,8}$/.test(
                                  hexColor.replace(/^#/, ""),
                                )
                                  ? hexColor.startsWith("#")
                                    ? hexColor
                                    : `#${hexColor}`
                                  : null;
                              return (
                                <View
                                  key={row.id}
                                  style={[
                                    styles.logCard,
                                    {
                                      backgroundColor: nestedSurfaceColor(theme),
                                      borderColor: theme.colors.outlineVariant,
                                      borderLeftWidth: 4,
                                      borderLeftColor: getMaterialTypeColor(
                                        getResolvedMaterialType(row, inventory),
                                        theme,
                                      ),
                                    },
                                  ]}
                                >
                                  <View style={styles.logCardInnerRow}>
                                    <View style={styles.logCardMain}>
                                      {/* Very top left: Time + User, then Booth (same format) */}
                                      <Text
                                        style={[
                                          styles.logCardMetaLine,
                                          {
                                            color:
                                              theme.colors.onSurfaceVariant,
                                          },
                                        ]}
                                      >
                                        {formatTimeDisplay(row.entry_time)}
                                        {" · "}
                                        {row.user_name || "—"}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.logCardMetaLine,
                                          styles.logCardMetaLineSecond,
                                          {
                                            color:
                                              theme.colors.onSurfaceVariant,
                                          },
                                        ]}
                                      >
                                        {row.booth || "—"}
                                      </Text>

                                      {/* Job */}
                                      <View style={styles.logCardJobBlock}>
                                        <Text style={styles.logCardJobLabel}>
                                          Job
                                        </Text>
                                        <Text
                                          style={styles.logCardJobValue}
                                          numberOfLines={2}
                                        >
                                          {row.job_name || "—"}
                                        </Text>
                                      </View>

                                      {/* Color — large */}
                                      <View
                                        style={styles.logCardHighlightBlock}
                                      >
                                        <Text
                                          style={styles.logCardHighlightLabel}
                                        >
                                          Color
                                        </Text>
                                        <Text
                                          style={styles.logCardHighlightValue}
                                          numberOfLines={2}
                                        >
                                          {row.color_name || "—"}
                                        </Text>
                                      </View>

                                      {/* Qty — large, catalyst small below (last block: no extra bottom margin) */}
                                      <View
                                        style={[
                                          styles.logCardHighlightBlock,
                                          styles.logCardHighlightBlockLast,
                                        ]}
                                      >
                                        <Text
                                          style={styles.logCardHighlightLabel}
                                        >
                                          Qty ({row.cup_gun ? "oz" : "gal"})
                                        </Text>
                                        <Text
                                          style={styles.logCardHighlightValue}
                                        >
                                          {formatQtyDisplay(row)}
                                        </Text>
                                        {showCatalyst && (
                                          <Text
                                            style={styles.logCardCatalystSub}
                                          >
                                            Cat {catalystDisplay} oz
                                          </Text>
                                        )}
                                      </View>
                                    </View>

                                    {/* Right: Type at top */}
                                    <View style={styles.logCardRightCol}>
                                      <Text
                                        style={[
                                          styles.logCardTypePill,
                                          {
                                            color: getMaterialTypeColor(
                                              resolvedType,
                                              theme,
                                            ),
                                          },
                                        ]}
                                      >
                                        {formatMaterialTypeLabel(resolvedType)}
                                      </Text>
                                    </View>
                                  </View>
                                  {/* Color swatch: fixed bottom-right ~25% of card, same spot every card */}
                                  {normalizedHex ? (
                                    <View
                                      style={[
                                        styles.logCardColorSwatchFixed,
                                        { backgroundColor: normalizedHex },
                                      ]}
                                    />
                                  ) : null}
                                </View>
                              );
                            })}
                        </React.Fragment>
                      </StaggerItem>
                    );
                  })}
                </View>
              )}
            </Card.Content>
          </Card>
        </ScrollView>

        <Portal>
          <Dialog
            visible={catalyzedDialogVisible}
            onDismiss={() => setCatalyzedDialogVisible(false)}
            style={styles.catalystDialog}
          >
            <Dialog.Title>Catalyst confirmation</Dialog.Title>
            <Dialog.Content>
              <Text>Was this batch catalyzed?</Text>
              <Text style={styles.catalystDialogSubtext}>4% mixing ratio</Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button
                mode="outlined"
                onPress={() => handleCatalyzed(false)}
                style={styles.dialogButton}
              >
                No
              </Button>
              <Button
                mode="contained"
                onPress={() => handleCatalyzed(true)}
                style={styles.dialogButton}
              >
                Yes
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
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
  scroll: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 48,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  card: {
    borderWidth: 1,
    marginBottom: 14,
    overflow: "hidden",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  shakePad: {
    paddingTop: 4,
    paddingBottom: 4,
    maxWidth: "100%",
  },
  form: {
    gap: 14,
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  formHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: -4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 0,
    flex: 1,
    flexShrink: 1,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  halfInput: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    backgroundColor: "transparent",
  },
  input: {
    backgroundColor: "transparent",
    alignSelf: "stretch",
    maxWidth: "100%",
    minWidth: 0,
  },
  colorSection: {
    alignSelf: "stretch",
    maxWidth: "100%",
    minWidth: 0,
    zIndex: 2,
  },
  suggestBox: {
    marginTop: 6,
    maxWidth: "100%",
  },
  colorRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  colorRowCustom: {
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  colorRowPressed: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  colorRowText: {
    fontSize: 15,
  },
  emptyList: {
    padding: 12,
    color: "#888",
    fontSize: 14,
  },
  catalystDisplay: {
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  catalystLabel: {
    fontSize: 12,
  },
  catalystValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
    maxWidth: "100%",
  },
  filterButton: {
    marginRight: 0,
    marginBottom: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    width: "100%",
  },
  catalystDialog: {
    alignSelf: "center",
    maxWidth: 320,
    width: "100%",
  },
  catalystDialogSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  dialogButton: {
    marginLeft: 8,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },
  emptyLogs: {
    padding: 24,
    color: "#888",
    fontSize: 14,
  },
  logCardList: {
    gap: 12,
    width: "100%",
  },
  logCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 2,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 6px rgba(0,0,0,0.06)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
        }),
    position: "relative",
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  logCardInnerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minWidth: 0,
  },
  logCardMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  logCardRightCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    maxWidth: "40%",
  },
  logCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  logCardTopLeft: {
    flex: 1,
    paddingRight: 12,
    minWidth: 0,
  },
  logCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  logCardJobBlock: {
    marginBottom: 10,
  },
  logCardJobLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.8,
    marginBottom: 2,
  },
  logCardJobValue: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  logCardTypePill: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  logCardColorSwatchFixed: {
    position: "absolute",
    right: 12,
    bottom: 36,
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  logCardMetaLine: {
    fontSize: 12,
    marginBottom: 4,
    opacity: 0.85,
  },
  logCardMetaLineSecond: {
    marginBottom: 12,
  },
  logCardHighlightBlock: {
    marginBottom: 14,
  },
  logCardHighlightBlockLast: {
    marginBottom: 0,
  },
  logCardHighlightLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.75,
    marginBottom: 4,
  },
  logCardHighlightValue: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 26,
  },
  logCardCatalystSub: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  logCardBoothRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  logCardBoothLabel: {
    fontSize: 11,
    opacity: 0.75,
    marginRight: 6,
  },
  logCardBoothValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  logCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  logCardInlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  logCardInlineCol: {
    flex: 1,
    paddingRight: 8,
  },
  logCardLabel: {
    fontSize: 12,
    color: "#666",
    marginRight: 8,
  },
  logCardValue: {
    fontSize: 14,
    flex: 1,
    textAlign: "right",
    alignItems: "flex-end",
  },
  logCardValueInline: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
    textAlign: "left",
  },
  cupGunRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 0,
    flexWrap: "wrap",
    width: "100%",
  },
  cupGunLabel: {
    fontSize: 14,
    flexShrink: 1,
  },
  logCardValueMain: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  logCardValueSecondary: {
    fontSize: 14,
    lineHeight: 20,
  },
  tableHorizontalWrap: {
    marginTop: 4,
    width: "100%",
    maxWidth: "100%",
  },
  tableContainer: {
    minWidth: 720,
    flex: 1,
  },
  table: {
    minWidth: 720,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  tableHeaderSticky: {
    zIndex: 1,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  th: {
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 20,
  },
  td: {
    fontSize: 13,
    lineHeight: 20,
  },
  dateLine: {
    fontSize: 13,
  },
  timeLine: {
    fontSize: 12,
    marginTop: 2,
  },
  timeOnly: {
    fontSize: 13,
    lineHeight: 20,
  },
  dayHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    minWidth: 619,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.15)",
  },
  dayHeaderContent: {
    flex: 1,
  },
  dayHeaderTotals: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 2,
  },
  dayHeaderToggle: {
    fontSize: 11,
    marginTop: 2,
  },
  dayHeaderCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: "rgba(0,0,0,0.2)",
  },
  dayHeaderText: {
    fontSize: 16,
    fontWeight: "700",
  },
  thDate: { width: 72, paddingRight: 10 },
  thUser: { width: 80, paddingRight: 10 },
  thJob: { width: 100, paddingRight: 10 },
  thMaterialType: { width: 92, paddingRight: 10 },
  thColor: { width: 120, paddingRight: 10 },
  thQty: { width: 50, paddingRight: 10 },
  thCat: { width: 58, paddingRight: 10 },
  thBooth: { width: 75, paddingRight: 10 },
  totalsSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    width: "100%",
  },
  totalsTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  totalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  totalsRow: {
    fontSize: 14,
  },
  totalsChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontWeight: "600",
    overflow: "hidden",
  },
});
