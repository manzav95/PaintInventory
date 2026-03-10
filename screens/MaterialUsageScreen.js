import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  FlatList,
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
  Title,
  useTheme,
  Dialog,
  Portal,
  ActivityIndicator,
  IconButton,
  Checkbox,
} from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialUsageService, {
  BOOTH_OPTIONS,
  CATALYST_PERCENT,
} from "../services/materialUsageService";

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

/** Parse "3:00 PM" into { timePart: "3:00", ampm: "PM" }. Used so AM/PM is not editable in the time field. */
function parseEntryTime(entryTime) {
  const s = (entryTime || "").trim();
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) return { timePart: `${match[1]}:${match[2]}`, ampm: match[3].toUpperCase() };
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const ampmPart = (parts[parts.length - 1] || "").toUpperCase();
    if (ampmPart === "AM" || ampmPart === "PM") {
      const timePart = parts.slice(0, -1).join(" ").trim();
      if (/^\d{1,2}:\d{2}$/.test(timePart)) return { timePart, ampm: ampmPart };
    }
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) return { timePart: s, ampm: "PM" };
  return { timePart: "12:00", ampm: "PM" };
}

/** Restrict time input to digits and one colon (H:MM or HH:MM). Strips other characters, max 5 chars. */
function sanitizeTimePart(input) {
  let s = input.replace(/[^\d:]/g, "");
  const firstColon = s.indexOf(":");
  if (firstColon === -1) return s.slice(0, 2);
  const before = s.slice(0, firstColon).slice(0, 2);
  const after = s.slice(firstColon + 1).replace(/:/g, "").slice(0, 2);
  s = after.length ? `${before}:${after}` : `${before}:`;
  return s.slice(0, 5);
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
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Material type colors (match inventory list): paint blue, clear orange, stain green, primer brown, dye purple, catalyst yellow. */
function getMaterialTypeColor(type, theme) {
  if (!type || typeof type !== "string") return theme?.colors?.onSurfaceVariant ?? "#666";
  const t = (type || "").toLowerCase().trim();
  if (t === "paint" || t === "custom_paint") return "#1565c0";
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
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 700;

  const now = useMemo(() => new Date(), []);
  const [entryDate, setEntryDate] = useState(() => formatDateForInput(now));
  const [entryTime, setEntryTime] = useState(() => formatTimeForInput(now));
  const [jobName, setJobName] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showColorList, setShowColorList] = useState(false);
  const [customColor, setCustomColor] = useState("");
  const [qty, setQty] = useState("");
  const [cupGun, setCupGun] = useState(false);
  const [booth, setBoothState] = useState(BOOTH_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [catalyzedDialogVisible, setCatalyzedDialogVisible] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [boothFilter, setBoothFilterState] = useState("all");
  const [shiftFilter, setShiftFilterState] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const lastAmpmTapRef = useRef(0);

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
          ["all", "Booth 1&3", "Booth 2", "Booth 4"].includes(savedBoothFilter)
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
    const custom = (customColor || "").trim();
    return custom ? deriveCustomCategory(custom) : null;
  }, [selectedItem, customColor]);

  const needsCatalyst = useMemo(
    () =>
      effectiveMaterialType &&
      ["paint", "custom_paint", "clear", "primer"].includes(effectiveMaterialType),
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

  const filteredInventory = useMemo(() => {
    const paintClearPrimer = inventory.filter((i) =>
      MATERIAL_USAGE_COLOR_TYPES.includes(String(i.type || "").toLowerCase()),
    );
    const q = (colorQuery || "").trim().toLowerCase();
    if (!q) {
      // Sort by: most recently used today → most used last 30 days → name/id
      const todayKey = formatDateForInput(new Date());
      const monthCutoff = new Date();
      monthCutoff.setDate(monthCutoff.getDate() - 30);
      monthCutoff.setHours(0, 0, 0, 0);

      const lastUsedTodayById = new Map();
      const monthCountById = new Map();

      for (const row of logs || []) {
        const id = row.item_id != null ? String(row.item_id).trim() : "";
        if (!id) continue;

        // Month usage count (based on entry_date)
        if (row.entry_date) {
          const d = new Date(String(row.entry_date).trim() + "T12:00:00.000Z");
          if (!Number.isNaN(d.getTime()) && d >= monthCutoff) {
            monthCountById.set(id, (monthCountById.get(id) || 0) + 1);
          }
        }

        // Today's recency (based on "log day" so swing after midnight counts to prior day)
        const logDay = getLogDate(row, materialUsageOvertime);
        if (logDay !== todayKey) continue;
        const minutes = parseTimeToMinutes(row.entry_time);
        const base = Date.parse(todayKey + "T00:00:00.000Z");
        const ts =
          !Number.isNaN(minutes) && !Number.isNaN(base)
            ? base + minutes * 60 * 1000
            : Date.now();
        const prev = lastUsedTodayById.get(id) || 0;
        if (ts > prev) lastUsedTodayById.set(id, ts);
      }

      return [...paintClearPrimer]
        .sort((a, b) => {
          const aId = a?.id != null ? String(a.id) : "";
          const bId = b?.id != null ? String(b.id) : "";
          const aToday = lastUsedTodayById.get(aId) || 0;
          const bToday = lastUsedTodayById.get(bId) || 0;
          if (bToday !== aToday) return bToday - aToday;
          const aCount = monthCountById.get(aId) || 0;
          const bCount = monthCountById.get(bId) || 0;
          if (bCount !== aCount) return bCount - aCount;
          const aName = (a.name || "").toLowerCase();
          const bName = (b.name || "").toLowerCase();
          if (aName !== bName) return aName.localeCompare(bName);
          return String(aId).localeCompare(String(bId));
        })
        .slice(0, 50);
    }
    return paintClearPrimer
      .filter(
        (i) =>
          (i.name || "").toLowerCase().includes(q) ||
          (i.id || "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [inventory, colorQuery, logs, materialUsageOvertime]);

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
    }
    if (shiftFilter && shiftFilter !== "all") {
      list = list.filter(
        (row) =>
          getShift(row.entry_time, materialUsageOvertime) === shiftFilter,
      );
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
    return Object.keys(byDay)
      .sort((a, b) => (b || "").localeCompare(a || ""))
      .map((date) => ({ date, rows: byDay[date] }));
  }, [filteredLogs, materialUsageOvertime]);

  const totalsFilterLabel = (() => {
    const boothPart =
      !boothFilter || boothFilter === "all" ? "All" : boothFilter;
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
      if (type === "paint") t.paint += qty;
      else if (type === "clear") t.clear += qty;
      else if (type === "primer") t.primer += qty;
      else if (type === "stain") t.stain += qty;
      else if (type === "dye") t.dye += qty;
    });
    return t;
  }, [filteredLogs, inventory]);

  const loadLogs = async () => {
    try {
      const boothParam = boothFilter === "all" ? null : boothFilter;
      const limit = isAdmin ? 2000 : 500;
      const list = await MaterialUsageService.list(boothParam, limit, isAdmin ? {} : { restrictToToday: true, excludeAdmin: true });
      setLogs(list);
    } catch (e) {
      console.error("Material usage list:", e);
    } finally {
      setLogsLoaded(true);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [boothFilter, isAdmin]);

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
      setEntryDate(formatDateForInput(new Date()));
      setEntryTime(formatTimeForInput(new Date()));
      await loadLogs();
    } catch (e) {
      console.error("Submit material usage:", e);
    } finally {
      setSubmitting(false);
      setPendingEntry(null);
      setCatalyzedDialogVisible(false);
    }
  };

  const handleSubmit = () => {
    const job = (jobName || "").trim();
    if (!job) return;
    const customTrim = (customColor || colorQuery || "").trim();
    const hasSelection = selectedItem || customTrim;
    if (!hasSelection) return;
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
        if (
          Platform.OS === "web" &&
          typeof window !== "undefined" &&
          window.alert
        ) {
          window.alert(`${title}\n\n${message}`);
        } else {
          Alert.alert(title, message);
        }
        return;
      }
    }
    const rawQty = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(rawQty) || rawQty <= 0) return;
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

  const hasColor = selectedItem || (customColor && customColor.trim());
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
        <View style={[styles.savingOverlay, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
          <View style={[styles.savingBox, { backgroundColor: theme.colors.surface }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.savingText, { color: theme.colors.onSurface }]}>
              Saving entry...
            </Text>
          </View>
        </View>
      </Modal>
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Button icon="arrow-left" onPress={onBack} mode="text">
            Back
          </Button>
        </View>
        <View style={styles.headerCenter}>
          <Title style={styles.title}>Material Usage Form</Title>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="refresh"
            size={24}
            onPress={() => {
              setRefreshing(true);
              loadLogs();
            }}
            iconColor={theme.colors.primary}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>Log mix</Title>
            <View style={styles.row}>
              <TextInput
                label="Date"
                value={entryDate}
                onChangeText={setEntryDate}
                mode="outlined"
                style={styles.halfInput}
                placeholder="YYYY-MM-DD"
              />
              <View style={styles.timeInputRow}>
                <TextInput
                  label="Time"
                  value={parseEntryTime(entryTime).timePart}
                  onChangeText={(t) => {
                    const sanitized = sanitizeTimePart(t);
                    if (sanitized !== undefined) setEntryTime(sanitized + " " + parseEntryTime(entryTime).ampm);
                  }}
                  mode="outlined"
                  style={styles.timePartInput}
                  placeholder="3:00"
                  keyboardType="numbers-and-punctuation"
                />
                <Button
                  mode="outlined"
                  onPress={() => {
                    const now = Date.now();
                    if (now - lastAmpmTapRef.current < 600) {
                      const { timePart, ampm } = parseEntryTime(entryTime);
                      setEntryTime(timePart + " " + (ampm === "AM" ? "PM" : "AM"));
                      lastAmpmTapRef.current = 0;
                    } else {
                      lastAmpmTapRef.current = now;
                    }
                  }}
                  style={styles.ampmButton}
                  compact
                >
                  {parseEntryTime(entryTime).ampm}
                </Button>
              </View>
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
                  if (selectedItem) setSelectedItem(null);
                  if (customColor) {
                    setCustomColor("");
                    setShowColorList(false);
                  } else {
                    setShowColorList(true);
                  }
                }}
                onFocus={() => {
                  if (!selectedItem && !customColor) setShowColorList(true);
                }}
                mode="outlined"
                style={styles.input}
                placeholder="Search paint/clear/primer or type custom (e.g. dye, stain, toner)"
                right={
                  selectedItem || customColor ? (
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
            </View>
            <Modal
              visible={showColorList}
              transparent
              animationType="fade"
              onRequestClose={() => setShowColorList(false)}
            >
              <Pressable
                style={styles.colorModalOverlay}
                onPress={() => setShowColorList(false)}
              >
                <Pressable
                  style={[
                    styles.colorModalContent,
                    { backgroundColor: theme.colors.surface },
                  ]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Text style={styles.colorModalTitle}>Choose Material</Text>
                  <Text
                    style={[
                      styles.colorModalHint,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Paint, clear, primer, dye, stain, toner
                  </Text>
                  <TextInput
                    mode="outlined"
                    placeholder="Search or type custom..."
                    value={colorQuery}
                    onChangeText={(t) => {
                      setColorQuery(t);
                      if (selectedItem) setSelectedItem(null);
                    }}
                    style={styles.colorModalSearch}
                    autoFocus
                  />
                  {(colorQuery || "").trim() ? (
                    <Pressable
                      onPress={() => {
                        setCustomColor(colorQuery.trim());
                        setSelectedItem(null);
                        setColorQuery("");
                        setShowColorList(false);
                      }}
                      style={({ pressed }) => [
                        styles.colorRow,
                        styles.colorRowCustom,
                        pressed && styles.colorRowPressed,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.colorRowText, { fontStyle: "italic" }]}
                      >
                        Use custom: {(colorQuery || "").trim()}
                      </Text>
                    </Pressable>
                  ) : null}
                  <FlatList
                    data={filteredInventory}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    style={styles.colorListInner}
                    nestedScrollEnabled
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          setSelectedItem(item);
                          setCustomColor("");
                          setColorQuery("");
                          setShowColorList(false);
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
                    )}
                    ListEmptyComponent={
                      <Text style={styles.emptyList}>
                        No matching paint/clear/primer
                      </Text>
                    }
                  />
                  <Button
                    mode="outlined"
                    onPress={() => setShowColorList(false)}
                    style={styles.colorModalClose}
                  >
                    Cancel
                  </Button>
                </Pressable>
              </Pressable>
            </Modal>
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
                  <Text style={styles.catalystLabel}>Catalyst (4%)</Text>
                  <Text style={styles.catalystValue}>{catalystOz} oz</Text>
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
                style={styles.cupGunLabel}
                onPress={() => setCupGun((prev) => !prev)}
              >
                Cup gun?
              </Text>
            </View>
            <Text style={styles.statLabel}>Booth</Text>
            <View style={styles.buttonRow}>
              {BOOTH_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  mode={booth === opt.value ? "contained" : "outlined"}
                  onPress={() => setBooth(opt.value)}
                  style={styles.filterButton}
                >
                  {opt.label}
                </Button>
              ))}
            </View>
            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              loading={submitting}
              style={styles.submitBtn}
              icon="send"
            >
              Submit
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>Transaction log</Title>
            {isAdmin && (
              <Text style={[styles.statLabel, { marginBottom: 4 }]}>
                Showing last 3 months (admin)
              </Text>
            )}
            <Text style={styles.statLabel}>Filter by booth</Text>
            <View style={styles.buttonRow}>
              {["all", "Booth 1&3", "Booth 2", "Booth 4"].map((bf) => (
                <Button
                  key={bf}
                  mode={boothFilter === bf ? "contained" : "outlined"}
                  onPress={() => setBoothFilter(bf)}
                  style={styles.filterButton}
                >
                  {bf === "all" ? "All" : bf}
                </Button>
              ))}
            </View>
            <Text style={[styles.statLabel, { marginTop: 12 }]}>
              Filter by shift
            </Text>
            <View style={styles.buttonRow}>
              {["all", "day", "swing"].map((sf) => (
                <Button
                  key={sf}
                  mode={shiftFilter === sf ? "contained" : "outlined"}
                  onPress={() => setShiftFilter(sf)}
                  style={styles.filterButton}
                >
                  {sf === "all" ? "All" : sf === "day" ? "Day" : "Swing"}
                </Button>
              ))}
            </View>
            {logsLoaded && filteredLogs.length > 0 && (
              <View style={styles.totalsSection}>
                <Text
                  style={[
                    styles.totalsTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  Totals ({totalsFilterLabel})
                </Text>
                <View style={styles.totalsGrid}>
                  <Text
                    style={[
                      styles.totalsRow,
                      styles.totalsChip,
                      { color: "#1565c0", backgroundColor: "rgba(21, 101, 192, 0.12)" },
                    ]}
                  >
                    Paint: {logTotals.paint.toFixed(2)} gal
                  </Text>
                  <Text
                    style={[
                      styles.totalsRow,
                      styles.totalsChip,
                      { color: "#e65100", backgroundColor: "rgba(230, 81, 0, 0.12)" },
                    ]}
                  >
                    Clear: {logTotals.clear.toFixed(2)} gal
                  </Text>
                  <Text
                    style={[
                      styles.totalsRow,
                      styles.totalsChip,
                      { color: theme.dark ? "#f5f5dc" : "#5d4037", backgroundColor: theme.dark ? "rgba(245, 245, 220, 0.2)" : "rgba(93, 64, 55, 0.12)" },
                    ]}
                  >
                    Primer: {logTotals.primer.toFixed(2)} gal
                  </Text>
                  <Text
                    style={[
                      styles.totalsRow,
                      styles.totalsChip,
                      { color: "#2e7d32", backgroundColor: "rgba(46, 125, 50, 0.12)" },
                    ]}
                  >
                    Stain: {logTotals.stain.toFixed(2)} gal
                  </Text>
                  <Text
                    style={[
                      styles.totalsRow,
                      styles.totalsChip,
                      { color: "#7e57c2", backgroundColor: "rgba(126, 87, 194, 0.12)" },
                    ]}
                  >
                    Dye: {logTotals.dye.toFixed(2)} gal
                  </Text>
                </View>
              </View>
            )}
            {!logsLoaded ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : filteredLogs.length === 0 ? (
              <Text style={styles.emptyLogs}>No entries</Text>
            ) : isDesktop ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={styles.tableHorizontalWrap}
              >
                <View style={styles.tableContainer}>
                  <View style={[styles.tableHeader, styles.tableHeaderSticky]}>
                    <Text style={[styles.th, styles.thDate]}>Date / Time</Text>
                    <Text style={[styles.th, styles.thUser]}>User</Text>
                    <Text style={[styles.th, styles.thJob]}>Job</Text>
                    <Text style={[styles.th, styles.thMaterialType]}>Type</Text>
                    <Text style={[styles.th, styles.thColor]}>Color</Text>
                    <Text style={[styles.th, styles.thQty]}>Qty</Text>
                    <Text style={[styles.th, styles.thCat]}>Cat (oz)</Text>
                    <Text style={[styles.th, styles.thBooth]}>Booth</Text>
                  </View>
                  <ScrollView
                    style={styles.tableWrap}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    <View style={styles.table}>
                      {logsByDay.map(({ date, rows }) => (
                      <React.Fragment key={date}>
                        <View
                          style={[
                            styles.dayHeaderRow,
                            {
                              backgroundColor:
                                theme.colors.surfaceVariant || "#eee",
                              borderLeftWidth: 4,
                              borderLeftColor: theme.colors.primary || "#6f95ab",
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
                        </View>
                        {rows.map((row) => (
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
                            <Text
                              style={[styles.td, styles.thUser]}
                              numberOfLines={1}
                            >
                              {row.user_name || "—"}
                            </Text>
                            <Text
                              style={[styles.td, styles.thJob]}
                              numberOfLines={1}
                            >
                              {row.job_name || "—"}
                            </Text>
                            <Text
                              style={[
                                styles.td,
                                styles.thMaterialType,
                                {
                                  color: getMaterialTypeColor(
                                    getResolvedMaterialType(row, inventory),
                                    theme,
                                  ),
                                  fontWeight: "600",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {formatMaterialTypeLabel(
                                getResolvedMaterialType(row, inventory),
                              )}
                            </Text>
                            <Text
                              style={[styles.td, styles.thColor]}
                              numberOfLines={1}
                            >
                              {row.color_name || "—"}
                            </Text>
                            <Text style={[styles.td, styles.thQty]}>
                              {formatQtyDisplay(row)}
                            </Text>
                            <Text style={[styles.td, styles.thCat]}>
                              {(() => {
                                const resolvedType = getResolvedMaterialType(
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
                                        Number(row.catalyst_gallons) * 128
                                      ).toFixed(2)
                                    : "—";
                              })()}
                            </Text>
                            <Text
                              style={[styles.td, styles.thBooth]}
                              numberOfLines={1}
                            >
                              {row.booth}
                            </Text>
                          </View>
                        ))}
                      </React.Fragment>
                    ))}
                    </View>
                  </ScrollView>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.logCardList}>
                {logsByDay.map(({ date, rows }) => (
                  <React.Fragment key={date}>
                    <View
                      style={[
                        styles.dayHeaderCard,
                        {
                          backgroundColor:
                            theme.colors.surfaceVariant || "#eee",
                          borderLeftColor: theme.colors.primary || "#6f95ab",
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
                    </View>
                    {rows.map((row) => {
                      const resolvedType = getResolvedMaterialType(
                        row,
                        inventory,
                      );
                      const showCatalyst =
                        resolvedType !== "dye" && resolvedType !== "stain";
                      const catalystDisplay =
                        row.catalyst_oz != null
                          ? Number(row.catalyst_oz).toFixed(2)
                          : row.catalyst_gallons != null
                            ? (Number(row.catalyst_gallons) * 128).toFixed(2)
                            : "—";
                      return (
                        <View
                          key={row.id}
                          style={[
                            styles.logCard,
                            {
                              borderLeftWidth: 4,
                              borderLeftColor: getMaterialTypeColor(
                                getResolvedMaterialType(row, inventory),
                                theme,
                              ),
                            },
                          ]}
                        >
                          {/* Top row: time + user stacked on left */}
                          <View style={styles.logCardTopRow}>
                            <View style={styles.logCardTopLeft}>
                              <Text style={styles.logCardLabel}>Time</Text>
                              <Text style={styles.logCardValueMain}>
                                {formatTimeDisplay(row.entry_time)}
                              </Text>
                              <Text style={[styles.logCardLabel, { marginTop: 4 }]}>
                                User
                              </Text>
                              <Text
                                style={styles.logCardValueSecondary}
                                numberOfLines={1}
                              >
                                {row.user_name || "—"}
                              </Text>
                            </View>
                          </View>

                          {/* Second row: type and color inline */}
                          <View style={styles.logCardInlineRow}>
                            <View style={styles.logCardInlineCol}>
                              <Text style={styles.logCardLabel}>Type</Text>
                              <Text
                                style={[
                                  styles.logCardValueInline,
                                  {
                                    color: getMaterialTypeColor(
                                      resolvedType,
                                      theme,
                                    ),
                                    fontWeight: "600",
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {formatMaterialTypeLabel(resolvedType)}
                              </Text>
                            </View>
                            <View style={styles.logCardInlineCol}>
                              <Text style={styles.logCardLabel}>Color</Text>
                              <Text
                                style={styles.logCardValueInline}
                                numberOfLines={1}
                              >
                                {row.color_name || "—"}
                              </Text>
                            </View>
                          </View>

                          {/* Third row: qty and catalyst inline */}
                          <View style={styles.logCardInlineRow}>
                            <View style={styles.logCardInlineCol}>
                              <Text style={styles.logCardLabel}>
                                Qty ({row.cup_gun ? "oz" : "gal"})
                              </Text>
                              <Text style={styles.logCardValueInline}>
                                {formatQtyDisplay(row)}
                              </Text>
                            </View>
                            {showCatalyst && (
                              <View style={styles.logCardInlineCol}>
                                <Text style={styles.logCardLabel}>Cat (oz)</Text>
                                <Text style={styles.logCardValueInline}>
                                  {catalystDisplay}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Booth & Job row: inline columns */}
                          <View style={styles.logCardInlineRow}>
                            <View style={styles.logCardInlineCol}>
                              <Text style={styles.logCardLabel}>Booth</Text>
                              <Text style={styles.logCardValueInline}>
                                {row.booth}
                              </Text>
                            </View>
                            <View style={styles.logCardInlineCol}>
                              <Text style={styles.logCardLabel}>Job</Text>
                              <Text
                                style={styles.logCardValueInline}
                                numberOfLines={1}
                              >
                                {row.job_name || "—"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </React.Fragment>
                ))}
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
  container: {
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 8 : 40,
    paddingBottom: 8,
  },
  headerLeft: {
    minWidth: 80,
    alignItems: "flex-start",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    minWidth: 80,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  scrollContentDesktop: {
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  card: {
    marginBottom: 24,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },
  timeInputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    minWidth: 0,
  },
  timePartInput: {
    flex: 1,
    minWidth: 0,
  },
  ampmButton: {
    minWidth: 56,
  },
  input: {
    marginBottom: 12,
  },
  colorSection: {
    marginBottom: 12,
  },
  colorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  colorModalContent: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 8,
    padding: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  colorModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  colorModalHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  colorModalSearch: {
    marginBottom: 12,
  },
  colorModalClose: {
    marginTop: 12,
  },
  colorListInner: {
    maxHeight: 220,
  },
  colorRow: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
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
  },
  catalystLabel: {
    fontSize: 12,
    color: "#666",
  },
  catalystValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  filterButton: {
    marginRight: 0,
    marginBottom: 0,
  },
  submitBtn: {
    marginTop: 8,
    marginBottom: 15,
    paddingVertical: 8,
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
  },
  logCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.02)",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  logCardTopRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  logCardTopLeft: {
    flex: 1,
    paddingRight: 8,
  },
  logCardTopRight: {
    flexShrink: 1,
    maxWidth: "45%",
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
    marginTop: 2,
    textAlign: "left",
  },
  logCardBoothRow: {
    paddingTop: 4,
  },
  cupGunRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  cupGunLabel: {
    fontSize: 14,
    color: "#666",
  },
  logCardValueMain: {
    fontSize: 16,
    fontWeight: "600",
  },
  logCardValueSecondary: {
    fontSize: 14,
  },
  tableHorizontalWrap: {
    marginTop: 4,
  },
  tableContainer: {
    minWidth: 720,
    flex: 1,
  },
  tableWrap: {
    maxHeight: 520,
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
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  th: {
    fontWeight: "600",
    fontSize: 12,
  },
  td: {
    fontSize: 13,
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
  thDate: { width: 72 },
  thUser: { width: 80 },
  thJob: { width: 100 },
  thMaterialType: { width: 64 },
  thColor: { width: 120 },
  thQty: { width: 50 },
  thCat: { width: 58 },
  thBooth: { width: 75 },
  totalsSection: {
    marginTop: 16,
    marginBottom: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  totalsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  totalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
