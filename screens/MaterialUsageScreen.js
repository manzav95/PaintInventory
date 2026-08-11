import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
  RefreshControl,
  Modal,
  LayoutAnimation,
  UIManager,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Card,
  Text,
  TextInput,
  useTheme,
  Dialog,
  Portal,
  ActivityIndicator,
  Checkbox,
  SegmentedButtons,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import DateField from "../components/DateField";
import TimeField from "../components/TimeField";
import PageHeader from "../components/PageHeader";
import ShakeView from "../components/ShakeView";
import FormHelp from "../components/FormHelp";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import {
  bundleUsageByWeek,
  formatBoothWeekUsageForExcel,
  boothWeekCopyHint,
} from "../utils/materialUsageWeekCopy";
import StaggerItem from "../components/StaggerItem";
import { SkeletonStack } from "../components/SkeletonBlock";
import ScrollFrame from "../components/ScrollFrame";
import { MATERIAL_USAGE_FORM_HELP } from "../constants/formHelpContent";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import { nestedSurfaceColor } from "../utils/themeColors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialUsageService, {
  BOOTH_OPTIONS,
  computeCatalystOz,
  resolveCatalystPercent,
  materialNeedsCatalyst,
  formatCatalystPercentLabel,
  formatTenths,
} from "../services/materialUsageService";
import {
  formatMonthDayYear,
  todayPacificIso,
  weekMondayIso,
  formatWeekRangeLabel,
  addDaysIso,
} from "../utils/wasteDrumConversion";
import {
  getMaterialUsageBusinessDate as getLogDate,
  getMaterialUsageShift as getShift,
} from "../utils/materialUsageDay";
import { getMaterialTypeColor } from "../utils/materialTypes";
import {
  colors,
  mutedTextColor,
} from "../theme/tokens";
import { AppEmptyState } from "../components/ui";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import MaterialUsageEditPopover from "../components/MaterialUsageEditPopover";

const STORAGE_KEYS = {
  booth: "@material_usage_booth",
  boothFilter: "@material_usage_booth_filter",
  shiftFilter: "@material_usage_shift_filter",
};

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateFilterChange = () => {
  LayoutAnimation.configureNext({
    duration: 220,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
};

const USAGE_TYPE_ORDER = [
  {
    key: "paint",
    label: "Paint",
    soft: "rgba(15, 22, 36, 0.08)",
  },
  {
    key: "clear",
    label: "Clear",
    soft: "rgba(230, 81, 0, 0.12)",
  },
  {
    key: "primer",
    label: "Primer",
    softLight: "rgba(93, 64, 55, 0.12)",
    softDark: "rgba(245, 245, 220, 0.2)",
  },
  {
    key: "stain",
    label: "Stain",
    soft: "rgba(46, 125, 50, 0.12)",
  },
  {
    key: "dye",
    label: "Dye",
    soft: "rgba(126, 87, 194, 0.12)",
  },
];

function emptyUsageTotals() {
  return { paint: 0, clear: 0, primer: 0, stain: 0, dye: 0, total: 0 };
}

function addUsageQty(totals, type, qty) {
  const t = totals || emptyUsageTotals();
  const n = Number(qty) || 0;
  if (type === "paint" || type === "custom_paint" || type === "precat")
    t.paint += n;
  else if (type === "clear") t.clear += n;
  else if (type === "primer") t.primer += n;
  else if (type === "stain" || type === "custom_stain") t.stain += n;
  else if (type === "dye") t.dye += n;
  t.total = t.paint + t.clear + t.primer + t.stain + t.dye;
  return t;
}

function UsageTypeChips({ totals, theme, compact = false, twoRows = false }) {
  const renderChip = (meta) => {
    const color = getMaterialTypeColor(meta.key, theme);
    const soft = meta.soft
      ? meta.soft
      : theme.dark
        ? meta.softDark
        : meta.softLight;
    const qty = Number(totals?.[meta.key]) || 0;
    return (
      <View
        key={meta.key}
        style={[
          styles.typeChip,
          compact && styles.typeChipCompact,
          twoRows && styles.typeChipTwoRows,
          { backgroundColor: soft },
        ]}
      >
        <Text
          style={[
            styles.typeChipLabel,
            compact && styles.typeChipLabelCompact,
            { color },
          ]}
        >
          {meta.label}
        </Text>
        <Text
          style={[
            styles.typeChipQty,
            compact && styles.typeChipQtyCompact,
            { color },
          ]}
        >
          {qty.toFixed(2)}
        </Text>
        <Text
          style={[
            styles.typeChipUnit,
            compact && styles.typeChipUnitCompact,
            { color },
          ]}
        >
          gal
        </Text>
      </View>
    );
  };

  if (twoRows) {
    const topRow = USAGE_TYPE_ORDER.filter((m) =>
      ["paint", "clear", "primer"].includes(m.key),
    );
    const bottomRow = USAGE_TYPE_ORDER.filter((m) =>
      ["stain", "dye"].includes(m.key),
    );
    return (
      <View style={styles.typeChipsStack}>
        <View
          style={[styles.typeChipsRow, compact && styles.typeChipsRowCompact]}
        >
          {topRow.map(renderChip)}
        </View>
        <View
          style={[styles.typeChipsRow, compact && styles.typeChipsRowCompact]}
        >
          {bottomRow.map(renderChip)}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.typeChipsRow, compact && styles.typeChipsRowCompact]}>
      {USAGE_TYPE_ORDER.map(renderChip)}
    </View>
  );
}

/** Capitalize the first letter of each whitespace-separated word. */
function titleCaseWords(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

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
  const key = entryDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return entryDate;
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return entryDate;
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} · ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Inventory types shown in the material picker. Excludes acetone/catalyst/slow reducer. */
const MATERIAL_USAGE_COLOR_TYPES = [
  "paint",
  "custom_paint",
  "clear",
  "primer",
  "stain",
  "custom_stain",
];

const MATERIAL_USAGE_EXCLUDE_NAME_RE =
  /^(acetone|catalyst|slow\s*reducer)$/i;

function isMaterialUsageEligibleItem(item) {
  const type = String(item?.type || "").toLowerCase();
  if (!MATERIAL_USAGE_COLOR_TYPES.includes(type)) return false;
  const name = String(item?.name || "").trim();
  const id = String(item?.id || "").trim();
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(name)) return false;
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(id)) return false;
  return true;
}

/** Show "stain" after stain / custom_stain names when not already present. */
function formatMaterialPickerLabel(item) {
  const name = String(item?.name || item?.id || "").trim();
  if (!name) return "";
  const type = String(item?.type || "").toLowerCase();
  if (
    (type === "stain" || type === "custom_stain") &&
    !/\bstain\b/i.test(name)
  ) {
    return `${name} stain`;
  }
  return name;
}

/** Accent for the Material field outline/text (toner → clear/orange). */
function getMaterialInputAccent(type, theme) {
  const t = String(type || "").toLowerCase();
  if (!t) return null;
  if (t === "primer") {
    // White / neutral — slightly muted on light surfaces so the outline stays visible.
    return theme?.dark ? "#eceff1" : "#8A8478";
  }
  return getMaterialTypeColor(t, theme);
}

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

function formatQtyDisplay(row) {
  const gal = Number(row.qty_gallons) || 0;
  if (row.cup_gun) {
    const oz = Math.round(gal * 128 * 10) / 10;
    return `${oz} oz`;
  }
  return `${gal} gal`;
}

function dayTotalsFromRows(rows, inventory) {
  const t = emptyUsageTotals();
  (rows || []).forEach((row) => {
    addUsageQty(
      t,
      getResolvedMaterialType(row, inventory),
      row.qty_gallons,
    );
  });
  return t;
}

export default function MaterialUsageScreen({
  inventory = [],
  userName,
  isAdmin = false,
  materialUsageOvertime = false,
  onBack,
  embeddedInShell = false,
  formRefreshKey = 0,
  onUsageDataChanged,
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
  const [copiedWeek, setCopiedWeek] = useState(null);
  const [shiftFilter, setShiftFilterState] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [expandedDays, setExpandedDays] = useState(() => new Set());
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());
  const daysSeededRef = useRef(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editAnchor, setEditAnchor] = useState({ pageX: 0, pageY: 0 });
  const [editSaving, setEditSaving] = useState(false);
  /** Admin: how many weeks of history are visible (1 = current week). */
  const [weeksShown, setWeeksShown] = useState(1);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  /** Mobile: 'form' | 'transactions' */
  const [mobilePane, setMobilePane] = useState("form");

  const todayIso = todayPacificIso();
  const thisWeekMonday = useMemo(() => weekMondayIso(todayIso), [todayIso]);
  const thisWeekSunday = useMemo(
    () => addDaysIso(thisWeekMonday, 6),
    [thisWeekMonday],
  );
  const thisWeekLabel = useMemo(
    () => formatWeekRangeLabel(thisWeekMonday),
    [thisWeekMonday],
  );

  const jobOptional = booth === "Booth 2";

  const syncFormDateTime = useCallback(() => {
    const n = new Date();
    setEntryDate(formatDateForInput(n));
    setEntryTime(formatTimeForInput(n));
  }, []);

  const setBooth = (value) => {
    setBoothState(value);
    AsyncStorage.setItem(STORAGE_KEYS.booth, value);
  };
  const setBoothFilter = (value) => {
    animateFilterChange();
    setBoothFilterState(value);
    AsyncStorage.setItem(STORAGE_KEYS.boothFilter, value);
  };
  const setShiftFilter = (value) => {
    animateFilterChange();
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

  const materialInputAccent = useMemo(
    () => getMaterialInputAccent(effectiveMaterialType, theme),
    [effectiveMaterialType, theme],
  );

  const materialFieldValue = selectedItem
    ? formatMaterialPickerLabel(selectedItem)
    : customColor || colorQuery;

  const needsCatalyst = useMemo(
    () => materialNeedsCatalyst(effectiveMaterialType, selectedItem),
    [effectiveMaterialType, selectedItem],
  );

  const catalystPercent = useMemo(
    () => resolveCatalystPercent(effectiveMaterialType, selectedItem),
    [effectiveMaterialType, selectedItem],
  );

  const catalystOz = useMemo(() => {
    if (!needsCatalyst || catalystPercent == null) return 0;
    const n = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(n) || n < 0) return 0;
    return computeCatalystOz(n, catalystPercent, cupGun);
  }, [qty, needsCatalyst, cupGun, catalystPercent]);

  const materialSuggestions = useMemo(() => {
    if (selectedItem) return [];
    const eligible = inventory.filter(isMaterialUsageEligibleItem);
    const q = (colorQuery || "").trim().toLowerCase();
    const filtered = q
      ? eligible.filter(
          (i) =>
            (i.name || "").toLowerCase().includes(q) ||
            (i.id || "").toLowerCase().includes(q),
        )
      : eligible;
    return filtered.sort((a, b) => {
      const aName = (a.name || a.id || "").toLowerCase();
      const bName = (b.name || b.id || "").toLowerCase();
      if (q) {
        const aStarts = aName.startsWith(q) ? 0 : 1;
        const bStarts = bName.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      return aName.localeCompare(bName);
    });
  }, [inventory, colorQuery, selectedItem]);

  const showMaterialSuggestions = materialFocused && !selectedItem;
  const filteredLogs = useMemo(() => {
    let list = logs;
    if (boothFilter && boothFilter !== "all") {
      list = list.filter((l) => l.booth === boothFilter);
    }

    if (isAdmin && shiftFilter && shiftFilter !== "all") {
      list = list.filter(
        (row) =>
          getShift(row.entry_time, materialUsageOvertime) === shiftFilter,
      );
    }

    if (isAdmin && logSearchQuery.trim()) {
      const q = logSearchQuery.trim().toLowerCase();
      list = list.filter((row) => {
        const color = String(row.color_name || "").toLowerCase();
        const job = String(row.job_name || "").toLowerCase();
        const user = String(row.user_name || "").toLowerCase();
        const typeRaw = String(
          getResolvedMaterialType(row, inventory) || "",
        ).toLowerCase();
        const typeLabel = formatMaterialTypeLabel(typeRaw).toLowerCase();
        return (
          color.includes(q) ||
          job.includes(q) ||
          user.includes(q) ||
          typeLabel.includes(q) ||
          typeRaw.includes(q)
        );
      });
    }

    const earliestMonday = isAdmin
      ? addDaysIso(thisWeekMonday, -(Math.max(1, weeksShown) - 1) * 7)
      : thisWeekMonday;
    list = list.filter((row) => {
      const d = getLogDate(row, materialUsageOvertime) || "";
      const mon = weekMondayIso(d);
      if (!mon) return false;
      if (mon > thisWeekMonday) return false;
      return mon >= earliestMonday;
    });

    return list;
  }, [
    logs,
    boothFilter,
    isAdmin,
    shiftFilter,
    materialUsageOvertime,
    logSearchQuery,
    inventory,
    weeksShown,
    thisWeekMonday,
  ]);

  /** Logs matching booth/shift/search but without the week window — for "load more". */
  const searchableLogs = useMemo(() => {
    let list = logs;
    if (boothFilter && boothFilter !== "all") {
      list = list.filter((l) => l.booth === boothFilter);
    }
    if (isAdmin && shiftFilter && shiftFilter !== "all") {
      list = list.filter(
        (row) =>
          getShift(row.entry_time, materialUsageOvertime) === shiftFilter,
      );
    }
    if (isAdmin && logSearchQuery.trim()) {
      const q = logSearchQuery.trim().toLowerCase();
      list = list.filter((row) => {
        const color = String(row.color_name || "").toLowerCase();
        const job = String(row.job_name || "").toLowerCase();
        const user = String(row.user_name || "").toLowerCase();
        const typeRaw = String(
          getResolvedMaterialType(row, inventory) || "",
        ).toLowerCase();
        const typeLabel = formatMaterialTypeLabel(typeRaw).toLowerCase();
        return (
          color.includes(q) ||
          job.includes(q) ||
          user.includes(q) ||
          typeLabel.includes(q) ||
          typeRaw.includes(q)
        );
      });
    }
    return list;
  }, [
    logs,
    boothFilter,
    isAdmin,
    shiftFilter,
    materialUsageOvertime,
    logSearchQuery,
    inventory,
  ]);

  const canLoadOlderWeek = useMemo(() => {
    if (!isAdmin) return false;
    const earliestMonday = addDaysIso(
      thisWeekMonday,
      -(Math.max(1, weeksShown) - 1) * 7,
    );
    return searchableLogs.some((row) => {
      const gal = Number(row.qty_gallons) || 0;
      if (gal <= 0) return false;
      const d = getLogDate(row, materialUsageOvertime) || "";
      const mon = weekMondayIso(d);
      return mon && mon < earliestMonday;
    });
  }, [
    isAdmin,
    searchableLogs,
    thisWeekMonday,
    weeksShown,
    materialUsageOvertime,
  ]);

  /** Jump to the nearest older week that actually has usage qty (skip empty weeks). */
  const handleShowPreviousWeekWithData = useCallback(() => {
    if (!isAdmin) return;
    const earliestMonday = addDaysIso(
      thisWeekMonday,
      -(Math.max(1, weeksShown) - 1) * 7,
    );
    let bestOlder = null;
    searchableLogs.forEach((row) => {
      const gal = Number(row.qty_gallons) || 0;
      if (gal <= 0) return;
      const d = getLogDate(row, materialUsageOvertime) || "";
      const mon = weekMondayIso(d);
      if (!mon || mon >= earliestMonday) return;
      if (!bestOlder || mon > bestOlder) bestOlder = mon;
    });
    if (!bestOlder) return;

    const from = new Date(`${bestOlder}T12:00:00`);
    const to = new Date(`${thisWeekMonday}T12:00:00`);
    const daySpan = Math.round((to - from) / (24 * 60 * 60 * 1000));
    const needed = Math.max(1, Math.floor(daySpan / 7) + 1);

    animateFilterChange();
    setWeeksShown((w) => Math.max(w + 1, needed));
  }, [
    isAdmin,
    searchableLogs,
    thisWeekMonday,
    weeksShown,
    materialUsageOvertime,
  ]);

  const logsByDay = useMemo(() => {
    const byDay = {};
    filteredLogs.forEach((row) => {
      const key = getLogDate(row, materialUsageOvertime) || "";
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(row);
    });
    return Object.keys(byDay)
      .sort((a, b) => (b || "").localeCompare(a || ""))
      .map((date) => ({
        date,
        rows: byDay[date],
        totals: dayTotalsFromRows(byDay[date], inventory),
      }));
  }, [filteredLogs, materialUsageOvertime, inventory]);

  const logsByWeekGrouped = useMemo(() => {
    const byWeek = new Map();
    logsByDay.forEach((day) => {
      const monday = weekMondayIso(day.date);
      if (!monday) return;
      if (!byWeek.has(monday)) {
        byWeek.set(monday, {
          monday,
          label: formatWeekRangeLabel(monday),
          days: [],
        });
      }
      byWeek.get(monday).days.push(day);
    });
    return [...byWeek.values()]
      .sort((a, b) => (b.monday || "").localeCompare(a.monday || ""))
      .map((week) => ({
        ...week,
        totals: dayTotalsFromRows(
          week.days.flatMap((d) => d.rows),
          inventory,
        ),
      }));
  }, [logsByDay, inventory]);

  useEffect(() => {
    if (!logsByDay.length || daysSeededRef.current) return;
    daysSeededRef.current = true;
    const seedDay = logsByDay.some((d) => d.date === todayIso)
      ? todayIso
      : logsByDay[0]?.date;
    setExpandedDays(seedDay ? new Set([seedDay]) : new Set());
    if (thisWeekMonday) setExpandedWeeks(new Set([thisWeekMonday]));
  }, [logsByDay, todayIso, thisWeekMonday]);

  // When admin loads an older week, expand that newly included week.
  useEffect(() => {
    if (!isAdmin || weeksShown <= 1) return;
    const earliestMonday = addDaysIso(
      thisWeekMonday,
      -(Math.max(1, weeksShown) - 1) * 7,
    );
    if (!earliestMonday) return;
    setExpandedWeeks((prev) => {
      if (prev.has(earliestMonday)) return prev;
      const next = new Set(prev);
      next.add(earliestMonday);
      return next;
    });
  }, [isAdmin, weeksShown, thisWeekMonday]);

  const toggleDay = (date) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleWeek = (monday) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  };

  const thisWeekTotalsLabel = (() => {
    const boothPart =
      !boothFilter || boothFilter === "all" ? "All" : boothFilter;
    if (!isAdmin) return `${boothPart} · This week`;
    const shiftPart =
      !shiftFilter || shiftFilter === "all"
        ? null
        : shiftFilter === "day"
          ? "Day"
          : "Swing";
    return shiftPart
      ? `${boothPart} · ${shiftPart} · This week`
      : `${boothPart} · This week`;
  })();

  const logsByWeek = useMemo(() => {
    if (!boothFilter || boothFilter === "all") return [];
    return bundleUsageByWeek(filteredLogs, (row) =>
      getLogDate(row, materialUsageOvertime),
    );
  }, [filteredLogs, boothFilter, materialUsageOvertime]);

  const handleCopyWeek = async (week) => {
    if (!week || !boothFilter || boothFilter === "all") return;
    const tsv = formatBoothWeekUsageForExcel(
      week.rows,
      week.monday,
      boothFilter,
      (row) => getResolvedMaterialType(row, inventory),
      (row) => getLogDate(row, materialUsageOvertime),
    );
    try {
      await Clipboard.setStringAsync(tsv);
      setCopiedWeek(week.monday);
      setTimeout(() => setCopiedWeek(null), 2000);
      showToast({
        title: "Week copied",
        message: `Paste into Excel — ${boothWeekCopyHint(boothFilter)}.`,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Copy failed",
        message: e?.message || "Could not copy.",
      });
    }
  };

  const thisWeekTotals = useMemo(() => {
    const t = emptyUsageTotals();
    filteredLogs.forEach((row) => {
      const d = getLogDate(row, materialUsageOvertime) || "";
      if (!d || d < thisWeekMonday || d > thisWeekSunday) return;
      addUsageQty(
        t,
        getResolvedMaterialType(row, inventory),
        row.qty_gallons,
      );
    });
    return t;
  }, [
    filteredLogs,
    inventory,
    materialUsageOvertime,
    thisWeekMonday,
    thisWeekSunday,
  ]);

  const thisWeekHasEntries = useMemo(() => {
    return filteredLogs.some((row) => {
      const d = getLogDate(row, materialUsageOvertime) || "";
      return d >= thisWeekMonday && d <= thisWeekSunday;
    });
  }, [filteredLogs, materialUsageOvertime, thisWeekMonday, thisWeekSunday]);

  const loadLogs = useCallback(async () => {
    try {
      // Always fetch all booths; booth/shift filters are applied client-side
      // so switching filters doesn't flash a reload.
      const limit = isAdmin ? 2000 : 500;
      const list = await MaterialUsageService.list(
        null,
        limit,
        isAdmin
          ? {}
          : {
              from: thisWeekMonday,
              to: thisWeekSunday,
              excludeAdmin: true,
            },
      );
      const next = Array.isArray(list) ? list : [];
      setLogs(next);
      daysSeededRef.current = false;
      if (isAdmin) setWeeksShown(1);
    } catch (e) {
      console.error("Material usage list:", e);
    } finally {
      setLogsLoaded(true);
      setRefreshing(false);
    }
  }, [isAdmin, thisWeekMonday, thisWeekSunday]);

  useEffect(() => {
    setLogsLoaded(false);
    loadLogs();
  }, [loadLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    syncFormDateTime();
    loadLogs();
  };

  // Header / shell pull-to-refresh (AppShell) — bump date & time to now.
  useEffect(() => {
    if (!formRefreshKey) return;
    syncFormDateTime();
    setRefreshing(true);
    loadLogs();
  }, [formRefreshKey, syncFormDateTime, loadLogs]);

  const clearFormFields = () => {
    setJobName("");
    setSelectedItem(null);
    setCustomColor("");
    setColorQuery("");
    setQty("");
    setCupGun(false);
    syncFormDateTime();
  };

  const startEditEntry = (row, evt) => {
    if (!isAdmin || !row?.id) return;
    const ne = evt?.nativeEvent || {};
    setEditAnchor({
      pageX: Number(ne.pageX ?? ne.clientX) || 0,
      pageY: Number(ne.pageY ?? ne.clientY) || 120,
    });
    setEditRow(row);
  };

  const closeEditPopover = () => {
    if (editSaving) return;
    setEditRow(null);
  };

  const notifyUsageDataChanged = useCallback(() => {
    if (typeof onUsageDataChanged === "function") {
      onUsageDataChanged();
    }
  }, [onUsageDataChanged]);

  const handleSaveEdit = async (payload) => {
    if (!editRow?.id) return;
    setEditSaving(true);
    try {
      await MaterialUsageService.update(editRow.id, payload);
      setEditRow(null);
      await loadLogs();
      notifyUsageDataChanged();
      showToast({ title: "Updated", message: "Material usage saved." });
    } catch (e) {
      showToast({
        type: "error",
        title: "Update failed",
        message: e?.message || "Could not save changes.",
      });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteEntry = async (row) => {
    if (!isAdmin || !row?.id) return;
    const ok = await confirmAction(
      "Delete entry?",
      `Remove ${row.color_name || "this"} log (${formatTimeDisplay(row.entry_time)})?`,
      { confirmLabel: "Delete", destructive: true },
    );
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await MaterialUsageService.delete(row.id);
      if (editRow?.id === row.id) setEditRow(null);
      await loadLogs();
      notifyUsageDataChanged();
      showToast({ title: "Deleted", message: "Material usage removed." });
    } catch (e) {
      showToast({
        type: "error",
        title: "Delete failed",
        message: e?.message || "Could not delete entry.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const submitEntry = async (entry) => {
    setSubmitting(true);
    try {
      await MaterialUsageService.create(entry);
      showToast({ title: "Saved", message: "Material usage logged." });
      clearFormFields();
      // Show the booth that was just logged so the new row is visible
      if (entry.booth) {
        setBoothFilter(entry.booth);
      }
      await loadLogs();
      notifyUsageDataChanged();
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
    const job = titleCaseWords(jobName || "");
    if (!job && !jobOptional) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Required",
        message: "Enter a job number.",
      });
      return;
    }
    const customTrim = titleCaseWords(customColor || colorQuery || "");
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
      // Qty entered in ounces; convert to gallons for storage (exact)
      qtyGallons = rawQty / 128;
      if (needsCatalyst && catalystPercent != null) {
        catOz = computeCatalystOz(rawQty, catalystPercent, true);
      }
    } else {
      // Exact gallons as entered (no rounding)
      qtyGallons = rawQty;
      if (needsCatalyst && catalystPercent != null) {
        catOz = computeCatalystOz(rawQty, catalystPercent, false);
      }
    }
    const itemId = selectedItem ? selectedItem.id : "";
    const colorName = selectedItem
      ? formatMaterialPickerLabel(selectedItem)
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
    (jobOptional || !!(jobName || "").trim()) &&
    hasColor &&
    parseFloat(String(qty).replace(/,/g, ""), 10) > 0 &&
    booth;

  const renderUsageEntry = (row) => {
    const typeColor = getMaterialTypeColor(
      getResolvedMaterialType(row, inventory),
      theme,
    );
    const busy = deletingId != null || submitting || editSaving;
    return (
      <View
        key={row.id}
        style={[
          styles.entryBlock,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <View style={styles.entryRow}>
          <View style={styles.entryTimeCol}>
            <Text
              style={[
                styles.entryTime,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {formatTimeDisplay(row.entry_time)}
            </Text>
            <Text
              style={[styles.entryType, { color: typeColor }]}
              numberOfLines={1}
            >
              {formatMaterialTypeLabel(
                getResolvedMaterialType(row, inventory),
              )}
            </Text>
          </View>
          <View style={styles.entryMain}>
            <View style={styles.entryUserBoothRow}>
              <Text
                style={[styles.entryUser, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {row.user_name || "—"}
              </Text>
              {row.booth ? (
                <View
                  style={[
                    styles.entryBoothPill,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(255, 255, 255, 0.12)"
                        : "rgba(15, 22, 36, 0.08)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.entryBoothText,
                      { color: theme.colors.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {row.booth}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[styles.entryLine, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              Job {row.job_name || "—"}
            </Text>
            <Text
              style={[
                styles.entryMeta,
                { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={1}
            >
              {row.color_name || "—"}
            </Text>
          </View>
          <Text style={[styles.entryQty, { color: theme.colors.onSurface }]}>
            {formatQtyDisplay(row)}
          </Text>
        </View>
        {isAdmin ? (
          <View style={styles.entryAdminActions}>
            <AppButton
              mode="text"
              compact
              onPress={(e) => startEditEntry(row, e)}
              disabled={busy}
            >
              Edit
            </AppButton>
            <AppButton
              mode="text"
              compact
              textColor={theme.colors.error}
              onPress={() => handleDeleteEntry(row)}
              loading={deletingId === row.id}
              disabled={busy}
            >
              Delete
            </AppButton>
          </View>
        ) : null}
      </View>
    );
  };

  const formCard = (
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
              <AppButton
                key={opt.value}
                mode={booth === opt.value ? "contained" : "outlined"}
                onPress={() => setBooth(opt.value)}
                style={styles.filterButton}
                compact
              >
                {opt.label}
              </AppButton>
            ))}
          </View>
          <TextInput
            label={
              jobOptional ? "Job Number (optional)" : "Job Number (required)"
            }
            value={jobName}
            onChangeText={setJobName}
            mode="outlined"
            style={styles.input}
            placeholder={jobOptional ? "Optional for Booth 2" : "e.g. 12345"}
          />
          <View style={styles.colorSection}>
            <TextInput
              label="Material"
              value={materialFieldValue}
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
              placeholder="Search inventory or type custom dye/toner"
              outlineColor={
                materialInputAccent ||
                theme.colors?.outlineVariant ||
                theme.colors?.outline
              }
              activeOutlineColor={
                materialInputAccent || theme.colors?.primary
              }
              textColor={
                materialInputAccent || theme.colors?.onSurface
              }
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
              <ScrollFrame maxHeight={220} style={styles.suggestBox}>
                {materialSuggestions.map((item) => {
                  const type = String(item.type || "").toLowerCase();
                  const rowColor = getMaterialInputAccent(type, theme);
                  const label = formatMaterialPickerLabel(item);
                  return (
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
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.colorRowText,
                          rowColor ? { color: rowColor } : null,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
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
                        {
                          fontStyle: "italic",
                          ...(materialInputAccent
                            ? { color: materialInputAccent }
                            : null),
                        },
                      ]}
                    >
                      Use custom: {(colorQuery || "").trim()}
                    </Text>
                  </Pressable>
                ) : null}
                {materialSuggestions.length === 0 &&
                !(colorQuery || "").trim() ? (
                  <AppEmptyState
                    title="No eligible materials in inventory"
                    style={styles.emptyList}
                  />
                ) : null}
                {materialSuggestions.length === 0 &&
                (colorQuery || "").trim() ? (
                  <AppEmptyState
                    title="No inventory matches — use custom above"
                    style={styles.emptyList}
                  />
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
              placeholder={cupGun ? "ounces" : "exact gallons"}
            />
            {needsCatalyst && (
              <View style={[styles.halfInput, styles.catalystDisplay]}>
                <Text
                  style={[
                    styles.catalystLabel,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  Catalyst ({formatCatalystPercentLabel(catalystPercent) || "—"})
                </Text>
                <Text
                  style={[
                    styles.catalystValue,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {formatTenths(catalystOz)} oz
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
          <View style={styles.actions}>
            <AppButton
              mode="contained"
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              loading={submitting}
              compact
              icon="send"
            >
              Submit
            </AppButton>
          </View>
        </Card.Content>
      </ShakeView>
    </Card>
  );

  const renderDayCard = (day, dayIndex) => {
    const open = expandedDays.has(day.date);
    const isToday = day.date === todayIso;
    return (
      <StaggerItem
        key={day.date}
        index={dayIndex}
        disabled={embeddedInShell}
      >
        <View
          style={[
            styles.dayCard,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Pressable
            onPress={() => toggleDay(day.date)}
            style={styles.dayHeaderPress}
          >
            <View style={styles.dayHeaderTop}>
              <Text
                style={[styles.dayTitle, { color: theme.colors.onSurface }]}
              >
                {open ? "▾ " : "▸ "}
                {formatLogDate(day.date)}
                {isToday ? " · Today" : ""}
              </Text>
              <Text
                style={[styles.dayTotalGal, { color: theme.colors.onSurface }]}
              >
                {day.totals.total.toFixed(2)} gal
              </Text>
            </View>
            <Text
              style={[
                styles.dayDateFull,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {formatMonthDayYear(day.date)}
            </Text>
            <UsageTypeChips
              totals={day.totals}
              theme={theme}
              compact
              twoRows={!isDesktop}
            />
            <Text
              style={[
                styles.dayToggleHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {open
                ? "Tap to collapse"
                : `Tap to expand · ${day.rows.length} entr${day.rows.length === 1 ? "y" : "ies"}`}
            </Text>
          </Pressable>
          {open ? (
            <View style={styles.dayExpanded}>
              {day.rows.map((row) => renderUsageEntry(row))}
            </View>
          ) : null}
        </View>
      </StaggerItem>
    );
  };

  const renderWeekGroup = (week, weekIndex) => {
    const open = expandedWeeks.has(week.monday);
    const isThisWeek = week.monday === thisWeekMonday;
    return (
      <View
        key={week.monday}
        style={[
          styles.groupCard,
          {
            backgroundColor: nestedSurfaceColor(theme),
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <Pressable
          onPress={() => toggleWeek(week.monday)}
          style={styles.groupHeaderPress}
        >
          <View style={styles.dayHeaderTop}>
            <Text
              style={[styles.groupTitle, { color: theme.colors.onSurface }]}
              numberOfLines={2}
            >
              {open ? "▾ " : "▸ "}
              {week.label}
              {isThisWeek ? " · This week" : ""}
            </Text>
            <Text
              style={[styles.dayTotalGal, { color: theme.colors.onSurface }]}
            >
              {week.totals.total.toFixed(2)} gal
            </Text>
          </View>
        </Pressable>
        {open ? (
          <View style={styles.groupExpanded}>
            {week.days.map((day, i) => renderDayCard(day, weekIndex * 10 + i))}
          </View>
        ) : null}
      </View>
    );
  };

  const logCard = (
    <Card style={surfaceCardStyle} mode="outlined">
      <Card.Content style={styles.form}>
        <View style={styles.logHeaderRow}>
          <View style={styles.logHeaderLeft}>
            <Text
              style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
            >
              {isAdmin ? "Transaction log" : "This week's usage"}
            </Text>
            <Text
              style={[styles.logDateBanner, { color: theme.colors.onSurface }]}
            >
              {isAdmin
                ? weeksShown <= 1
                  ? `Showing ${thisWeekLabel}`
                  : `Showing ${weeksShown} weeks through ${thisWeekLabel}`
                : `${thisWeekLabel} · Today ${formatMonthDayYear(todayIso)}`}
            </Text>
          </View>
          <View style={styles.logHeaderFilters}>
            {isAdmin ? (
              <View style={styles.shiftCornerRow}>
                {["all", "day", "swing"].map((sf) => (
                  <AppButton
                    key={sf}
                    mode={shiftFilter === sf ? "contained" : "outlined"}
                    onPress={() => setShiftFilter(sf)}
                    style={styles.shiftCornerBtn}
                    compact
                    labelStyle={styles.shiftCornerLabel}
                  >
                    {sf === "all" ? "All" : sf === "day" ? "Day" : "Swing"}
                  </AppButton>
                ))}
              </View>
            ) : null}
            <View style={styles.shiftCornerRow}>
              <AppButton
                mode={boothFilter === "all" ? "contained" : "outlined"}
                onPress={() => setBoothFilter("all")}
                style={styles.shiftCornerBtn}
                compact
                labelStyle={styles.shiftCornerLabel}
              >
                All
              </AppButton>
              {BOOTH_OPTIONS.map((opt) => (
                <AppButton
                  key={opt.value}
                  mode={boothFilter === opt.value ? "contained" : "outlined"}
                  onPress={() => setBoothFilter(opt.value)}
                  style={styles.shiftCornerBtn}
                  compact
                  labelStyle={styles.shiftCornerLabel}
                >
                  {opt.label}
                </AppButton>
              ))}
            </View>
          </View>
        </View>

        {logsLoaded && thisWeekHasEntries ? (
          <View
            style={[
              styles.usageSummaryCard,
              {
                backgroundColor: nestedSurfaceColor(theme),
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Text
              style={[
                styles.usageSummaryTitle,
                { color: theme.colors.onSurface },
              ]}
            >
              Totals ({thisWeekTotalsLabel})
            </Text>
            <UsageTypeChips
              totals={thisWeekTotals}
              theme={theme}
              twoRows={!isDesktop}
            />
          </View>
        ) : null}

        {isAdmin ? (
          <OutlinedSearchInput
            placeholder="Search color, type, job, or user…"
            value={logSearchQuery}
            onChangeText={setLogSearchQuery}
            style={styles.logSearch}
          />
        ) : null}

        {!logsLoaded ? (
          <SkeletonStack lines={5} style={{ marginTop: 8 }} />
        ) : filteredLogs.length === 0 ? (
          <AppEmptyState title="No entries" style={styles.emptyLogs} />
        ) : (
          <View style={styles.dayList}>
            {boothFilter && boothFilter !== "all" && logsByWeek.length > 0
              ? logsByWeek.map((week) => (
                  <View key={week.monday} style={styles.weekCopyBar}>
                    <Text
                      style={[
                        styles.weekCopyLabel,
                        { color: theme.colors.onSurface },
                      ]}
                      numberOfLines={2}
                    >
                      {week.label}
                    </Text>
                    <AppButton
                      mode="outlined"
                      compact
                      icon={
                        copiedWeek === week.monday ? "check" : "content-copy"
                      }
                      onPress={() => handleCopyWeek(week)}
                    >
                      {copiedWeek === week.monday ? "Copied" : "Copy week"}
                    </AppButton>
                  </View>
                ))
              : null}
            {!isAdmin
              ? logsByDay.map((day, i) => renderDayCard(day, i))
              : logsByWeekGrouped.map((week, i) => renderWeekGroup(week, i))}
            {isAdmin && canLoadOlderWeek ? (
              <AppButton
                mode="outlined"
                onPress={handleShowPreviousWeekWithData}
                style={styles.loadMoreBtn}
                icon="history"
              >
                Show previous week with usage
              </AppButton>
            ) : null}
            {isAdmin && !canLoadOlderWeek && weeksShown > 1 ? (
              <Text
                style={[
                  styles.loadMoreHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Earliest available entries are shown.
              </Text>
            ) : null}
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const pageHeader = (
    <PageHeader
      title="Material Usage"
      onBack={onBack}
      embeddedInShell={embeddedInShell}
    />
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={theme.colors.primary}
    />
  );

  return (
    <>
      <Modal
        visible={submitting}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View
          style={[styles.savingOverlay, { backgroundColor: colors.semantic.scrimLight }]}
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
        {isDesktop && isAdmin ? (
          <>
            <View style={styles.pageTop}>{pageHeader}</View>
            <View style={styles.splitRow}>
              <ScrollView
                style={styles.splitPane}
                contentContainerStyle={styles.splitPaneContent}
                keyboardShouldPersistTaps="handled"
              >
                {formCard}
              </ScrollView>
              <ScrollView
                style={styles.splitPane}
                contentContainerStyle={styles.splitPaneContent}
                refreshControl={refreshControl}
              >
                {logCard}
              </ScrollView>
            </View>
          </>
        ) : (
          <ScrollView
            style={{ width: "100%", maxWidth: "100%" }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
          >
            {pageHeader}
            {!isDesktop ? (
              <>
                <SegmentedButtons
                  value={mobilePane}
                  onValueChange={setMobilePane}
                  style={styles.mobileTabs}
                  buttons={[
                    {
                      value: "form",
                      label: "Log form",
                      icon: "clipboard-edit-outline",
                    },
                    {
                      value: "transactions",
                      label: "Transactions",
                      icon: "format-list-bulleted",
                    },
                  ]}
                />
                {mobilePane === "form" ? formCard : logCard}
              </>
            ) : (
              <>
                {formCard}
                {logCard}
              </>
            )}
          </ScrollView>
        )}

        <Portal>
          <Dialog
            visible={catalyzedDialogVisible}
            onDismiss={() => setCatalyzedDialogVisible(false)}
            style={styles.catalystDialog}
          >
            <Dialog.Title>Catalyst confirmation</Dialog.Title>
            <Dialog.Content>
              <Text>Was this batch catalyzed?</Text>
              <Text
                style={[
                  styles.catalystDialogSubtext,
                  { color: mutedTextColor(theme) },
                ]}
              >
                {formatCatalystPercentLabel(catalystPercent) || "—"} mixing ratio
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <AppButton
                mode="outlined"
                onPress={() => handleCatalyzed(false)}
                style={styles.dialogButton}
              >
                No
              </AppButton>
              <AppButton
                mode="contained"
                onPress={() => handleCatalyzed(true)}
                style={styles.dialogButton}
              >
                Yes
              </AppButton>
            </Dialog.Actions>
          </Dialog>
        </Portal>
        <MaterialUsageEditPopover
          visible={!!editRow}
          row={editRow}
          anchor={editAnchor}
          onClose={closeEditPopover}
          onSave={handleSaveEdit}
          saving={editSaving}
        />
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
  pageTop: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    maxWidth: "100%",
  },
  splitRow: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 0,
  },
  splitPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  splitPaneContent: {
    paddingBottom: 48,
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
  mobileTabs: {
    marginTop: 4,
    marginBottom: 12,
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
  },
  input: {
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
    flex: 0,
    padding: 12,
    justifyContent: "flex-start",
    alignItems: "flex-start",
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
    justifyContent: "flex-end",
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
    color: colors.dark.textDim,
  },
  emptyLogs: {
    flex: 0,
    padding: 24,
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
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
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
    color: colors.light.textMuted,
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
    borderBottomColor: colors.semantic.badgeBorder,
    backgroundColor: colors.semantic.filterIdle,
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
  usageSummaryCard: {
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  usageSummaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  typeChipsStack: {
    gap: 8,
    width: "100%",
  },
  typeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
  },
  typeChipsRowCompact: {
    gap: 6,
  },
  typeChip: {
    minWidth: 72,
    flexGrow: 1,
    flexBasis: "18%",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  typeChipTwoRows: {
    flexBasis: 0,
    minWidth: 0,
  },
  typeChipCompact: {
    minWidth: 64,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  typeChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  typeChipLabelCompact: {
    fontSize: 10,
  },
  typeChipQty: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  typeChipQtyCompact: {
    fontSize: 15,
    lineHeight: 18,
  },
  typeChipUnit: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  typeChipUnitCompact: {
    fontSize: 10,
  },
  logDateBanner: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 0,
  },
  logHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  logHeaderLeft: {
    flex: 1,
    minWidth: 120,
    gap: 2,
  },
  logHeaderFilters: {
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  shiftCornerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    flexShrink: 0,
    flexWrap: "wrap",
    maxWidth: "100%",
  },
  shiftCornerBtn: {
    minWidth: 0,
    margin: 0,
  },
  shiftCornerLabel: {
    fontSize: 12,
    marginHorizontal: 6,
    marginVertical: 2,
  },
  logSearch: {
    marginTop: 8,
    marginBottom: 0,
  },
  dayList: {
    gap: 12,
    marginTop: 10,
    width: "100%",
  },
  loadMoreBtn: {
    marginTop: 4,
    alignSelf: "stretch",
  },
  loadMoreHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  monthCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  groupHeaderPress: {
    gap: 8,
  },
  groupTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  monthTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  groupExpanded: {
    gap: 10,
    marginTop: 4,
  },
  dayDateFull: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: -4,
  },
  dayCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    overflow: "hidden",
  },
  dayHeaderPress: {
    gap: 8,
  },
  dayHeaderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  dayTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  dayTotalGal: {
    fontSize: 15,
    fontWeight: "700",
  },
  dayToggleHint: {
    fontSize: 11,
    marginTop: 2,
  },
  dayExpanded: {
    marginTop: 10,
    marginLeft: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.35)",
  },
  entryBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryAdminActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 4,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  entryTimeCol: {
    width: 72,
    flexShrink: 0,
  },
  entryTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  entryType: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  entryMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  entryUserBoothRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  entryUser: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  entryBoothPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  entryBoothText: {
    fontSize: 12,
    fontWeight: "700",
  },
  weekCopyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  weekCopyLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  entryLine: {
    fontSize: 13,
    fontWeight: "600",
  },
  entryMeta: {
    fontSize: 12,
  },
  entryQty: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 0,
    paddingTop: 2,
  },
});
