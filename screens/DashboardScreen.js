import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import {
  Card,
  Text,
  Title,
  Paragraph,
  Button,
  useTheme,
  DataTable,
  Chip,
  ActivityIndicator,
  Icon,
  IconButton,
  Divider,
} from "react-native-paper";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import DashboardGreeting from "../components/DashboardGreeting";
import ScrollFrame from "../components/ScrollFrame";
import { getDayKey, formatDayHeader } from "../utils/transactionDayUtils";
import { logMatchesShift, SHIFT_LABELS } from "../utils/shiftUtils";
import { useAppLayout } from "../utils/layout";
import {
  colors,
  fontFamily,
  mutedTextColor,
  space,
  radius,
} from "../theme/tokens";
import { AppBadge, AppEmptyState } from "../components/ui";
import { getActionColor } from "../utils/actionColors";
import { getLowStockItems } from "../utils/inventoryAlerts";
import { materialUsageToHistoryEvent } from "../utils/materialUsageHistory";
import {
  getMaterialTypeColor,
  getMaterialTypeLabel,
  getBoothColor,
} from "../utils/materialTypes";

const CUSTOM_TYPES = ["custom_paint", "custom_stain"];

function resolveActionType(log) {
  if (log?.action === "update" && log?.details?._actionType) {
    return log.details._actionType;
  }
  return log?.action;
}

function logQtyAbs(log) {
  const d = log?.details || {};
  const q = d.quantityChange ?? d._quantityChange;
  return typeof q === "number" ? Math.abs(q) : 0;
}

function logBelongsToUser(log, userName) {
  const target = String(userName || "")
    .trim()
    .toLowerCase();
  if (!target || target === "admin123") return false;
  const u = String(log?.userName || "")
    .trim()
    .toLowerCase();
  return u === target;
}

function isRecycleDue(item) {
  const t = (item.type || "").toLowerCase();
  if (!CUSTOM_TYPES.includes(t)) return false;
  const qty = item.quantity || 0;
  if (qty <= 0) return false;
  const rd = item.recycle_date;
  if (!rd) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recycleDate = new Date(rd);
  recycleDate.setHours(0, 0, 0, 0);
  return recycleDate.getTime() <= today.getTime();
}

export default function DashboardScreen({
  inventory,
  inventoryLoaded = true,
  minQuantity = 30,
  auditLogs: auditLogsFromApp = [],
  auditLogsLoaded: auditLogsLoadedFromApp = false,
  materialUsageLogs = [],
  onRefresh,
  isRefreshing = false,
  showTransactionTable = true,
  isAdmin = false,
  userName,
  embeddedInShell = false,
  onOpenRecycleDue,
  onItemSelect,
  onOpenInventory,
  onOpenMaterialUsage,
  onOpenWasteTracking,
  onOpenCheckInOut,
  showCheckInOutNav = true,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { showPersistentSidebar } = useAppLayout();
  const isMobileLayout = !showPersistentSidebar;
  const surfaceCardStyle = {
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderColor: theme.colors.outlineVariant,
    borderWidth: 1,
    overflow: "hidden",
  };
  const auditLogs = auditLogsFromApp;
  const auditLogsLoaded = auditLogsLoadedFromApp;

  /** Material usage as history-shaped events (kept separate from check-in/out). */
  const usageHistoryEvents = useMemo(
    () =>
      (Array.isArray(materialUsageLogs) ? materialUsageLogs : []).map(
        materialUsageToHistoryEvent,
      ),
    [materialUsageLogs],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState(null);
  const [reducedHistory, setReducedHistory] = useState(false);
  const [mostUsedByWeek, setMostUsedByWeek] = useState(true);
  const [galPeriodWeek, setGalPeriodWeek] = useState(true);
  const [checkedOutListOpen, setCheckedOutListOpen] = useState(false);
  const [checkedOutListIsWeek, setCheckedOutListIsWeek] = useState(true);
  const [shiftFilter, setShiftFilter] = useState(null);
  /** Admin activity period: today (default) → week → last 30 days. */
  const [activityPeriod, setActivityPeriod] = useState("today");
  /** Admin transaction history: start with ~2 weeks; "Show more" adds another 2. */
  const [historyWeeksShown, setHistoryWeeksShown] = useState(2);
  /** Standard-user needs-attention popup */
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionKind, setAttentionKind] = useState("lowStock"); // 'lowStock' | 'recycle'
  const [attentionPanelPos, setAttentionPanelPos] = useState({
    top: 80,
    left: 12,
    caretLeft: 24,
    placement: "below",
    maxHeight: 320,
  });
  /** My activity today popup */
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityKind, setActivityKind] = useState("checkedOut"); // 'checkedOut' | 'checkedIn' | 'actions'
  const [activityPanelPos, setActivityPanelPos] = useState({
    top: 80,
    left: 12,
    caretLeft: 24,
    placement: "below",
    maxHeight: 320,
  });
  const lowStockChipRef = useRef(null);
  const recycleChipRef = useRef(null);
  const checkedOutCardRef = useRef(null);
  const checkedInCardRef = useRef(null);
  const actionsCardRef = useRef(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const ATTENTION_PANEL_WIDTH = Math.min(
    isMobileLayout ? 340 : 400,
    Math.max(280, windowWidth - 48),
  );

  // Current week (Sun–Sat) and current month date ranges + labels
  const periodRange = useMemo(() => {
    const now = new Date();
    if (mostUsedByWeek) {
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - now.getDay());
      sunday.setHours(0, 0, 0, 0);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      saturday.setHours(23, 59, 59, 999);
      const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
      return {
        start: sunday.getTime(),
        end: saturday.getTime(),
        label: `${fmt(sunday)}–${fmt(saturday)}`,
      };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const monthLabel = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return {
      start: first.getTime(),
      end: last.getTime(),
      label: monthLabel,
    };
  }, [mostUsedByWeek]);

  // This week (Sun–Sat) range for "gallons used this week"
  const thisWeekRange = useMemo(() => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    return {
      start: sunday.getTime(),
      end: saturday.getTime(),
      label: `${fmt(sunday)}–${fmt(saturday)}`,
    };
  }, []);

  const thisMonthRange = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const label = now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    return {
      start: first.getTime(),
      end: last.getTime(),
      label,
    };
  }, []);

  const gallonsUsedThisWeek = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      total += getQty(log);
    });
    return total;
  }, [auditLogs, thisWeekRange]);

  const gallonsUsedThisMonth = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    let total = 0;
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisMonthRange.start || t > thisMonthRange.end) return;
      total += getQty(log);
    });
    return total;
  }, [auditLogs, thisMonthRange]);

  const getItemName = (itemId) => {
    const item = inventory.find((i) => i.id === itemId);
    return item?.name || itemId || "Unknown";
  };

  const getEventColorName = (log) => {
    if (log?.action === "material_usage") {
      const name = String(log?.details?.color_name || "").trim();
      if (name) return name;
    }
    return getItemName(log?.itemId);
  };

  const checkedOutByItemWeek = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const totals = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisWeekRange.start || t > thisWeekRange.end) return;
      const qty = getQty(log);
      if (qty <= 0) return;
      totals[log.itemId] = (totals[log.itemId] || 0) + qty;
    });
    return Object.entries(totals)
      .map(([itemId, qty]) => ({
        itemId,
        name: getItemName(itemId),
        qty,
      }))
      .sort(
        (a, b) =>
          b.qty - a.qty || String(a.itemId).localeCompare(String(b.itemId)),
      );
  }, [auditLogs, thisWeekRange, inventory]);

  const checkedOutByItemMonth = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const totals = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < thisMonthRange.start || t > thisMonthRange.end) return;
      const qty = getQty(log);
      if (qty <= 0) return;
      totals[log.itemId] = (totals[log.itemId] || 0) + qty;
    });
    return Object.entries(totals)
      .map(([itemId, qty]) => ({
        itemId,
        name: getItemName(itemId),
        qty,
      }))
      .sort(
        (a, b) =>
          b.qty - a.qty || String(a.itemId).localeCompare(String(b.itemId)),
      );
  }, [auditLogs, thisMonthRange, inventory]);

  const lowStockItems = useMemo(
    () => getLowStockItems(inventory, minQuantity),
    [inventory, minQuantity],
  );

  const lowStockCount = lowStockItems.length;

  const recycleDueItems = useMemo(
    () => inventory.filter((item) => isRecycleDue(item)),
    [inventory],
  );

  const recycleDueCount = recycleDueItems.length;

  /** Personal ops snapshot for standard users. */
  const myActivityToday = useMemo(() => {
    if (isAdmin || !userName) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    let checkedOut = 0;
    let checkedIn = 0;
    let actions = 0;
    let lastAt = null;
    const checkOutLogs = [];
    const checkInLogs = [];
    const actionLogs = [];
    for (const log of auditLogs) {
      if (!logBelongsToUser(log, userName)) continue;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (!t || t < startMs) continue;
      actions += 1;
      actionLogs.push(log);
      if (!lastAt || t > lastAt) lastAt = t;
      const type = resolveActionType(log);
      const qty = logQtyAbs(log);
      if (type === "check_out") {
        checkedOut += qty;
        checkOutLogs.push(log);
      }
      if (type === "check_in") {
        checkedIn += qty;
        checkInLogs.push(log);
      }
    }
    const byNewest = (a, b) =>
      (b.timestamp ? new Date(b.timestamp).getTime() : 0) -
      (a.timestamp ? new Date(a.timestamp).getTime() : 0);
    checkOutLogs.sort(byNewest);
    checkInLogs.sort(byNewest);
    actionLogs.sort(byNewest);
    const lastLabel = lastAt
      ? new Date(lastAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return {
      checkedOut,
      checkedIn,
      actions,
      lastLabel,
      checkOutLogs,
      checkInLogs,
      actionLogs,
    };
  }, [auditLogs, userName, isAdmin]);

  const myRecentColors = useMemo(() => {
    if (isAdmin || !userName) return [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const totals = new Map();
    for (const log of auditLogs) {
      if (!logBelongsToUser(log, userName)) continue;
      if (resolveActionType(log) !== "check_out") continue;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < weekAgo) continue;
      const id = String(log.itemId || "");
      if (!id) continue;
      const qty = logQtyAbs(log);
      if (qty <= 0) continue;
      totals.set(id, (totals.get(id) || 0) + qty);
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([itemId, gal]) => {
        const item = inventory.find((i) => String(i.id) === itemId);
        return {
          itemId,
          name: item?.name || itemId,
          gal,
          hex: item?.hex_color || item?.hex || null,
        };
      });
  }, [auditLogs, inventory, userName, isAdmin]);

  // Most used = color with largest qty checked out in the selected period (week or month)
  const mostUsedColor = useMemo(() => {
    const isCheckOut = (log) =>
      log.action === "check_out" ||
      (log.action === "update" && log.details?._actionType === "check_out");
    const getCheckOutQty = (log) => {
      if (!log.details) return 0;
      const q = log.details.quantityChange ?? log.details._quantityChange;
      return typeof q === "number" ? Math.abs(q) : 0;
    };
    const { start, end } = periodRange;

    const galByItemId = {};
    auditLogs.forEach((log) => {
      if (!log.itemId || !isCheckOut(log)) return;
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      if (t < start || t > end) return;
      const qty = getCheckOutQty(log);
      if (qty <= 0) return;
      galByItemId[log.itemId] = (galByItemId[log.itemId] || 0) + qty;
    });

    let bestItemId = null;
    let bestGal = 0;
    Object.entries(galByItemId).forEach(([id, gal]) => {
      if (gal > bestGal) {
        bestGal = gal;
        bestItemId = id;
      }
    });
    if (!bestItemId) return null;
    const item = inventory.find((i) => i.id === bestItemId);
    return {
      name: item?.name || bestItemId,
      totalGal: bestGal,
      periodLabel: periodRange.label,
      isWeek: mostUsedByWeek,
    };
  }, [auditLogs, inventory, mostUsedByWeek, periodRange]);

  const isStandardUserVisibleAction = (log) => {
    const a = log.action;
    const d = log.details;
    if (
      a === "check_in" ||
      a === "check_out" ||
      a === "receiving" ||
      a === "recycled" ||
      a === "delete"
    )
      return true;
    if (
      a === "update" &&
      d?._actionType &&
      (d._actionType === "check_in" ||
        d._actionType === "check_out" ||
        d._actionType === "receiving" ||
        d._actionType === "recycled")
    )
      return true;
    return false;
  };

  const logsByRole = useMemo(() => {
    if (!isAdmin) return auditLogs.filter(isStandardUserVisibleAction);
    return reducedHistory
      ? auditLogs.filter(isStandardUserVisibleAction)
      : auditLogs;
  }, [auditLogs, isAdmin, reducedHistory]);

  const getDisplayUserName = (log) => {
    const u = (log.userName || "").trim().toLowerCase();
    if (u && u !== "unknown") return log.userName;
    const adminOnly =
      [
        "add",
        "change_id",
        "set_next_id",
        "set_min_quantity",
        "delete",
      ].includes(log.action) ||
      (log.action === "update" &&
        !(
          log.details?._actionType === "check_in" ||
          log.details?._actionType === "check_out" ||
          log.details?._actionType === "receiving" ||
          log.details?._actionType === "recycled"
        ));
    return adminOnly ? "Admin" : log.userName || "Unknown";
  };

  // Filter audit logs by shift (admin), selected user (admin), and search
  const filteredLogs = useMemo(() => {
    let rows = logsByRole;
    if (isAdmin && shiftFilter) {
      rows = rows.filter((log) => logMatchesShift(log.timestamp, shiftFilter));
    }
    if (isAdmin && userFilter) {
      const target = String(userFilter).trim().toLowerCase();
      rows = rows.filter(
        (log) => getDisplayUserName(log).trim().toLowerCase() === target,
      );
    }
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter((log) => {
      const item = inventory.find((i) => i.id === log.itemId);
      const itemName = item?.name?.toLowerCase() || "";
      const colorName = String(log.details?.color_name || "").toLowerCase();
      const booth = String(log.details?.booth || "").toLowerCase();
      const userName = (log.userName || "").toLowerCase();
      const action = log.action?.toLowerCase() || "";
      const itemId = log.itemId?.toLowerCase() || "";

      return (
        itemName.includes(query) ||
        colorName.includes(query) ||
        booth.includes(query) ||
        userName.includes(query) ||
        action.includes(query) ||
        itemId.includes(query)
      );
    });
  }, [logsByRole, searchQuery, inventory, isAdmin, shiftFilter, userFilter]);

  const historyCutoffMs = useMemo(() => {
    if (!isAdmin) return 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - historyWeeksShown * 7);
    return d.getTime();
  }, [isAdmin, historyWeeksShown]);

  const visibleHistoryLogs = useMemo(() => {
    if (!isAdmin) return filteredLogs;
    return filteredLogs.filter((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t >= historyCutoffMs;
    });
  }, [filteredLogs, isAdmin, historyCutoffMs]);

  const isCheckInOutLog = (log) => {
    const type = resolveActionType(log);
    return type === "check_in" || type === "check_out";
  };

  /** Admin left column: check-in / check-out only. */
  const visibleCheckInOutLogs = useMemo(() => {
    return visibleHistoryLogs.filter(isCheckInOutLog);
  }, [visibleHistoryLogs]);

  /** Admin right column: material usage, same time / shift / user / search window. */
  const visibleUsageLogs = useMemo(() => {
    if (!isAdmin) return [];
    let rows = usageHistoryEvents;
    if (shiftFilter) {
      rows = rows.filter((log) => logMatchesShift(log.timestamp, shiftFilter));
    }
    if (userFilter) {
      const target = String(userFilter).trim().toLowerCase();
      rows = rows.filter(
        (log) =>
          String(log.userName || "")
            .trim()
            .toLowerCase() === target,
      );
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter((log) => {
        const colorName = String(log.details?.color_name || "").toLowerCase();
        const booth = String(log.details?.booth || "").toLowerCase();
        const userName = String(log.userName || "").toLowerCase();
        const job = String(log.details?.job_name || "").toLowerCase();
        return (
          colorName.includes(query) ||
          booth.includes(query) ||
          userName.includes(query) ||
          job.includes(query)
        );
      });
    }
    return rows.filter((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t >= historyCutoffMs;
    });
  }, [
    isAdmin,
    usageHistoryEvents,
    shiftFilter,
    userFilter,
    searchQuery,
    historyCutoffMs,
  ]);

  /** Admin desktop activity: today / this week / last 30 days. */
  const adminActivityRange = useMemo(() => {
    const now = new Date();
    const end = now.getTime();
    if (activityPeriod === "week") {
      return {
        start: thisWeekRange.start,
        end: thisWeekRange.end,
        label: `This week · ${thisWeekRange.label}`,
        shortLabel: "This week",
      };
    }
    if (activityPeriod === "days30") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 29);
      return {
        start: start.getTime(),
        end,
        label: "Last 30 days",
        shortLabel: "30 days",
      };
    }
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.getTime(),
      end,
      label: "Today",
      shortLabel: "Today",
    };
  }, [activityPeriod, thisWeekRange]);

  const adminPeriodCheckOutLogs = useMemo(() => {
    if (!isAdmin) return [];
    const { start, end } = adminActivityRange;
    return auditLogs
      .filter((log) => {
        const type = resolveActionType(log);
        if (type !== "check_out") return false;
        const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [isAdmin, auditLogs, adminActivityRange]);

  const adminPeriodCheckInLogs = useMemo(() => {
    if (!isAdmin) return [];
    const { start, end } = adminActivityRange;
    return auditLogs
      .filter((log) => {
        const type = resolveActionType(log);
        if (type !== "check_in") return false;
        const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [isAdmin, auditLogs, adminActivityRange]);

  const adminPeriodUsageLogs = useMemo(() => {
    if (!isAdmin) return [];
    const { start, end } = adminActivityRange;
    return usageHistoryEvents
      .filter((log) => {
        const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [isAdmin, usageHistoryEvents, adminActivityRange]);

  const adminPeriodTotals = useMemo(() => {
    const sumQty = (logs) =>
      logs.reduce((sum, log) => sum + logQtyAbs(log), 0);
    return {
      checkOut: sumQty(adminPeriodCheckOutLogs),
      checkIn: sumQty(adminPeriodCheckInLogs),
      usage: sumQty(adminPeriodUsageLogs),
    };
  }, [
    adminPeriodCheckOutLogs,
    adminPeriodCheckInLogs,
    adminPeriodUsageLogs,
  ]);

  const hasMoreHistory = useMemo(() => {
    if (!isAdmin) return false;
    const auditOlder = filteredLogs.some((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t > 0 && t < historyCutoffMs;
    });
    if (auditOlder) return true;
    return usageHistoryEvents.some((log) => {
      const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
      return t > 0 && t < historyCutoffMs;
    });
  }, [filteredLogs, usageHistoryEvents, isAdmin, historyCutoffMs]);

  const handleUserPress = (log) => {
    if (!isAdmin) return;
    const display = getDisplayUserName(log);
    if (!display || display === "Unknown") return;
    setUserFilter((prev) =>
      prev && prev.toLowerCase() === display.toLowerCase() ? null : display,
    );
  };

  const handleItemPress = (log) => {
    if (!isAdmin || !onItemSelect) return;
    const id = log.itemId != null ? String(log.itemId).trim() : "";
    if (!id) return;
    const item = inventory.find((i) => String(i.id) === id);
    if (item) onItemSelect(item);
  };

  const formatAction = (action, details, itemId) => {
    // Check if this is an old record with _actionType in details (for backward compatibility)
    if (action === "update" && details && details._actionType) {
      if (details._actionType === "check_in") {
        return "Checked In";
      } else if (details._actionType === "check_out") {
        return "Checked Out";
      } else if (details._actionType === "receiving") {
        return "Received";
      } else if (details._actionType === "recycled") {
        return "Recycled";
      }
    }

    // Map action types to display text
    if (action === "add") {
      return "New Entry";
    } else if (action === "check_in") {
      return "Checked In";
    } else if (action === "check_out") {
      return "Checked Out";
    } else if (action === "receiving") {
      return "Received";
    } else if (action === "recycled") {
      return "Recycled";
    } else if (action === "update") {
      // If it's an update with quantity change, it's a manual adjustment
      // (check_in/check_out are now logged separately)
      return "Manual Adjustment";
    } else if (action === "delete") {
      return "Deleted";
    } else if (action === "change_id") {
      return "ID Changed";
    } else if (action === "set_next_id") {
      return "Next ID Set";
    } else if (action === "material_usage") {
      const booth = details?.booth ? ` · ${details.booth}` : "";
      return `Material usage${booth}`;
    }
    return action;
  };

  /** Short verb for brief lists / popups: "checked out", "received", … */
  const formatBriefVerb = (log) => {
    const type = resolveActionType(log);
    if (type === "check_out") return "checked out";
    if (type === "check_in") return "checked in";
    if (type === "receiving") return "received";
    if (type === "recycled") return "recycled";
    if (type === "add") return "added";
    if (type === "delete") return "deleted";
    if (type === "material_usage") {
      return "used";
    }
    return formatAction(log.action, log.details, log.itemId).toLowerCase();
  };

  const formatBriefSummary = (log) => {
    const actionLabel = formatBriefVerb(log);
    const qty = getQuantity(log.action, log.details, log.itemId);
    const colorName = getEventColorName(log);
    const qtyPart =
      qty !== "-" && qty != null && qty !== "" ? `${qty} gal ` : "";
    return `${actionLabel} ${qtyPart}${colorName}`.replace(/\s+/g, " ").trim();
  };

  const briefRecentLogs = useMemo(() => {
    const source = Array.isArray(visibleHistoryLogs) ? visibleHistoryLogs : [];
    // Admin mobile: full week window (same as desktop table). Standard: last 10.
    if (isAdmin) return source;
    return source.slice(0, 10);
  }, [visibleHistoryLogs, isAdmin]);

  // Admin desktop: two-column brief (check-in/out | material usage).
  // Mobile: stacked brief list. Non-admin desktop: full table.
  const showAdminDualBrief =
    showTransactionTable && !isMobileLayout && isAdmin;
  const showFullHistoryTable =
    showTransactionTable && !isMobileLayout && !isAdmin;
  const showBriefRecent = showTransactionTable && isMobileLayout;

  const formatBriefTime = (timestamp) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const renderBriefLogRow = (log, index, { showBooth = false } = {}) => {
    const materialType = showBooth
      ? String(log.details?.material_type || "").trim()
      : "";
    const accent = showBooth
      ? getMaterialTypeColor(materialType, theme)
      : getActionColor(log.action, log.details);
    const user = getDisplayUserName(log);
    const actionLabel = formatBriefVerb(log);
    const qty = logQtyAbs(log);
    const colorName = getEventColorName(log);
    const booth = showBooth ? String(log.details?.booth || "").trim() : "";
    const job = showBooth ? String(log.details?.job_name || "").trim() : "";
    const boothColor = booth ? getBoothColor(booth) : null;
    const typeLabel = materialType ? getMaterialTypeLabel(materialType) : "";
    const isPrimer =
      String(materialType).toLowerCase() === "primer";
    return (
      <View
        key={`${log.id || log.timestamp}-${log.itemId}-${index}`}
        style={[
          styles.briefHistoryRow,
          index > 0 && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View
          style={[
            styles.briefHistoryAccent,
            {
              backgroundColor: accent,
              borderWidth: isPrimer ? 1 : 0,
              borderColor: isPrimer ? "rgba(0,0,0,0.2)" : "transparent",
            },
          ]}
        />
        <View style={styles.briefHistoryBody}>
          <View style={styles.briefHistoryTop}>
            <Text
              style={[
                styles.briefHistoryTime,
                { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={1}
            >
              {formatBriefTime(log.timestamp)}
            </Text>
            <Text
              style={[
                styles.briefHistoryUser,
                { color: theme.colors.onSurface },
              ]}
              numberOfLines={1}
            >
              {user}
            </Text>
          </View>
          {booth ? (
            <View style={styles.briefMetaRow}>
              <View
                style={[
                  styles.briefBoothPill,
                  {
                    backgroundColor: boothColor
                      ? `${boothColor}22`
                      : "rgba(38,166,154,0.14)",
                    borderWidth: 1,
                    borderColor: boothColor || colors.action.materialUsage,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.briefBoothText,
                    { color: boothColor || colors.action.materialUsage },
                  ]}
                  numberOfLines={1}
                >
                  {booth}
                </Text>
              </View>
              {typeLabel ? (
                <Text
                  style={[
                    styles.briefJobText,
                    {
                      color: isPrimer
                        ? theme.dark
                          ? "#eceff1"
                          : "#546e7a"
                        : accent,
                      fontWeight: "700",
                      ...(isPrimer
                        ? {
                            backgroundColor: theme.dark
                              ? "rgba(255,255,255,0.12)"
                              : "rgba(0,0,0,0.06)",
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 4,
                            overflow: "hidden",
                          }
                        : {}),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {typeLabel}
                </Text>
              ) : null}
              {job ? (
                <Text
                  style={[
                    styles.briefJobText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  Job {job}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text
            style={[
              styles.briefHistorySummary,
              { color: theme.colors.onSurface },
            ]}
            numberOfLines={2}
          >
            <Text
              style={{
                color: showBooth
                  ? isPrimer
                    ? theme.dark
                      ? "#eceff1"
                      : "#546e7a"
                    : accent
                  : accent,
                fontWeight: "700",
              }}
            >
              {actionLabel}
            </Text>
            {qty > 0 ? ` ${qty} gal ` : " "}
            <Text style={{ fontWeight: "700" }}>{colorName}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const getQuantity = (action, details, itemId) => {
    // Return the amount of gallons that were manipulated (changed)
    if (details) {
      if (
        action === "material_usage" &&
        typeof details.quantityChange === "number"
      ) {
        return Math.abs(details.quantityChange);
      }
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        action === "receiving" ||
        action === "recycled" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out" ||
            details._actionType === "receiving" ||
            details._actionType === "recycled"));

      if (isCheckInOut) {
        // For check_in/check_out/receiving/recycled, show the quantity change amount
        if (typeof details.quantityChange === "number") {
          return Math.abs(details.quantityChange);
        } else if (typeof details._quantityChange === "number") {
          // Old records might have _quantityChange
          return Math.abs(details._quantityChange);
        }
      }

      // For manual adjustment (update), show the quantity change
      if (action === "update" && typeof details.quantityChange === "number") {
        return Math.abs(details.quantityChange);
      }

      // For add, show the initial quantity added
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    return "-";
  };

  const getTotalQuantity = (action, details, itemId) => {
    // Get the total quantity of the item AT THE TIME OF THIS TRANSACTION
    // This is stored in the audit log details as newQuantity or quantity
    if (details) {
      // First check for newQuantity (the total after the transaction) - new format
      if (typeof details.newQuantity === "number") {
        return details.newQuantity;
      }

      // For old records: check_in/check_out/update actions, the quantity field contains the new total
      // Handle old records with _actionType in details (for backward compatibility)
      const isCheckInOut =
        action === "check_in" ||
        action === "check_out" ||
        action === "receiving" ||
        action === "recycled" ||
        (action === "update" &&
          details._actionType &&
          (details._actionType === "check_in" ||
            details._actionType === "check_out" ||
            details._actionType === "receiving" ||
            details._actionType === "recycled"));

      if (isCheckInOut && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For manual adjustment (update without _actionType), quantity is the new total
      if (action === "update" && typeof details.quantity === "number") {
        return details.quantity;
      }

      // For add actions, use the quantity field (initial quantity)
      if (action === "add" && typeof details.quantity === "number") {
        return details.quantity;
      }
    }

    // For delete actions, show 0 (after deletion, quantity is 0)
    if (action === "delete") {
      return 0;
    }

    return "-";
  };

  const placeAnchoredPanel = (x, y, w, h) => {
    const caretSize = 10;
    const margin = 12;
    const gap = 8;
    const minNeeded = 200;
    const spaceBelow = windowHeight - (y + h) - margin;
    const spaceAbove = y - margin;
    const placement =
      spaceBelow < minNeeded && spaceAbove > spaceBelow ? "above" : "below";
    const available = placement === "above" ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(420, available - gap));
    const preferredLeft = x + w / 2 - ATTENTION_PANEL_WIDTH / 2;
    const left = Math.max(
      margin,
      Math.min(preferredLeft, windowWidth - ATTENTION_PANEL_WIDTH - margin),
    );
    const centerX = x + w / 2;
    const rawCaret = centerX - left - caretSize;
    const caretLeft = Math.max(
      14,
      Math.min(rawCaret, ATTENTION_PANEL_WIDTH - caretSize * 2 - 14),
    );
    if (placement === "above") {
      return {
        placement,
        top: undefined,
        bottom: Math.max(margin, windowHeight - y + gap),
        left,
        caretLeft,
        maxHeight,
      };
    }
    return {
      placement,
      top: Math.max(margin, y + h + gap),
      bottom: undefined,
      left,
      caretLeft,
      maxHeight,
    };
  };

  const openAttentionPanel = (kind, chipRef) => {
    const node = chipRef?.current;
    setAttentionKind(kind);
    const fallback = () => {
      setAttentionPanelPos({
        placement: "below",
        top: 80,
        bottom: undefined,
        left: 12,
        caretLeft: 24,
        maxHeight: 320,
      });
      setAttentionOpen(true);
    };
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, w, h) => {
        setAttentionPanelPos(placeAnchoredPanel(x, y, w, h));
        setAttentionOpen(true);
      });
    } else {
      fallback();
    }
  };

  const openActivityPanel = (kind, cardRef) => {
    const node = cardRef?.current;
    setActivityKind(kind);
    const fallback = () => {
      setActivityPanelPos({
        placement: "below",
        top: 80,
        bottom: undefined,
        left: 12,
        caretLeft: 24,
        maxHeight: 320,
      });
      setActivityOpen(true);
    };
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, w, h) => {
        setActivityPanelPos(placeAnchoredPanel(x, y, w, h));
        setActivityOpen(true);
      });
    } else {
      fallback();
    }
  };

  const activityPopupConfig = useMemo(() => {
    if (!myActivityToday) return null;
    if (activityKind === "checkedOut") {
      return {
        title: "Checked out today",
        hint: "Gallons you checked out today.",
        accent: colors.action.checkOut,
        logs: myActivityToday.checkOutLogs || [],
        empty: "No check-outs yet today.",
      };
    }
    if (activityKind === "checkedIn") {
      return {
        title: "Checked in today",
        hint: "Gallons you checked in today.",
        accent: colors.action.checkIn,
        logs: myActivityToday.checkInLogs || [],
        empty: "No check-ins yet today.",
      };
    }
    return {
      title: "Actions today",
      hint: "Your inventory actions today.",
      accent: theme.colors.primary,
      logs: myActivityToday.actionLogs || [],
      empty: "No activity yet today.",
    };
  }, [activityKind, myActivityToday, theme.colors.primary]);

  const content = (
    <View
      style={[
        styles.dashboardContainer,
        showFullHistoryTable && styles.dashboardContainerWeb,
        showAdminDualBrief && styles.dashboardContainerWeb,
      ]}
    >
      {/* Needs attention — notification-style anchored popup */}
      <Modal
        visible={attentionOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttentionOpen(false)}
      >
        <View style={styles.attentionPopupRoot}>
          <Pressable
            style={styles.attentionPopupBackdrop}
            onPress={() => setAttentionOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.attentionPopupAnchor,
              {
                left: attentionPanelPos.left,
                width: ATTENTION_PANEL_WIDTH,
                ...(attentionPanelPos.placement === "above"
                  ? { bottom: attentionPanelPos.bottom }
                  : { top: attentionPanelPos.top }),
              },
            ]}
          >
            {attentionPanelPos.placement !== "above" ? (
              <>
                <View
                  style={[
                    styles.attentionPopupCaret,
                    {
                      left: attentionPanelPos.caretLeft,
                      borderBottomColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.attentionPopupCaretInner,
                    {
                      left: attentionPanelPos.caretLeft + 1,
                      borderBottomColor: theme.colors.surfaceContainerHighest,
                    },
                  ]}
                />
              </>
            ) : null}
            <View
              style={[
                styles.attentionPopupPanel,
                {
                  maxHeight: attentionPanelPos.maxHeight || 320,
                  backgroundColor: theme.colors.surfaceContainerHighest,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.attentionPopupHeader}>
                <Text
                  style={[
                    styles.attentionPopupTitle,
                    { color: theme.colors.onSurface },
                  ]}
                  numberOfLines={1}
                >
                  {attentionKind === "recycle"
                    ? "Paint needing recycle"
                    : "Low stock items"}
                </Text>
                <IconButton
                  icon="close"
                  size={18}
                  onPress={() => setAttentionOpen(false)}
                  style={styles.attentionPopupClose}
                  accessibilityLabel="Close"
                />
              </View>
              <Text
                style={[
                  styles.attentionPopupHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={2}
              >
                {attentionKind === "recycle"
                  ? "Custom colors past their recycle date with stock remaining."
                  : `Below minimum quantity (default ${minQuantity} gal).`}
              </Text>
              <ScrollFrame
                bordered={false}
                maxHeight={Math.max(
                  120,
                  (attentionPanelPos.maxHeight || 320) - 110,
                )}
                contentContainerStyle={styles.attentionPopupList}
              >
                {(attentionKind === "recycle"
                  ? recycleDueItems
                  : lowStockItems
                ).length === 0 ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>
                    None.
                  </Text>
                ) : (
                  (attentionKind === "recycle"
                    ? recycleDueItems
                    : lowStockItems
                  ).map((it, index) => {
                    const minQ = it.minQuantity ?? minQuantity;
                    return (
                      <React.Fragment key={String(it.id)}>
                        {index > 0 ? (
                          <Divider style={styles.attentionPopupDivider} />
                        ) : null}
                        <View style={styles.attentionPopupRow}>
                          <View
                            style={[
                              styles.attentionPopupPill,
                              {
                                backgroundColor:
                                  attentionKind === "recycle"
                                    ? colors.semantic.recycleBannerText
                                    : colors.semantic.lowStockValue,
                              },
                            ]}
                          >
                            <Text style={styles.attentionPopupPillText}>
                              {attentionKind === "recycle"
                                ? it.recycle_date
                                  ? String(it.recycle_date).slice(5, 10)
                                  : "Due"
                                : `${it.quantity ?? 0}`}
                            </Text>
                          </View>
                          <View style={styles.attentionPopupRowText}>
                            <Text
                              style={[
                                styles.attentionPopupRowTitle,
                                { color: theme.colors.onSurface },
                              ]}
                              numberOfLines={1}
                            >
                              {it.name || it.id}
                            </Text>
                            <Text
                              style={[
                                styles.attentionPopupRowDetail,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                              numberOfLines={1}
                            >
                              {attentionKind === "recycle"
                                ? `${it.quantity ?? 0} gal · ${it.type || "—"}`
                                : `${it.quantity ?? 0} / ${minQ} gal · ${it.id}`}
                            </Text>
                          </View>
                        </View>
                      </React.Fragment>
                    );
                  })
                )}
              </ScrollFrame>
              <View style={styles.attentionPopupActions}>
                <Button
                  mode="text"
                  compact
                  onPress={() => setAttentionOpen(false)}
                >
                  Close
                </Button>
              </View>
            </View>
            {attentionPanelPos.placement === "above" ? (
              <>
                <View
                  style={[
                    styles.attentionPopupCaretDownInner,
                    {
                      left: attentionPanelPos.caretLeft + 1,
                      borderTopColor: theme.colors.surfaceContainerHighest,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.attentionPopupCaretDown,
                    {
                      left: attentionPanelPos.caretLeft,
                      borderTopColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* My activity today — anchored popup */}
      <Modal
        visible={activityOpen && activityPopupConfig != null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityOpen(false)}
      >
        <View style={styles.attentionPopupRoot}>
          <Pressable
            style={styles.attentionPopupBackdrop}
            onPress={() => setActivityOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.attentionPopupAnchor,
              {
                left: activityPanelPos.left,
                width: ATTENTION_PANEL_WIDTH,
                ...(activityPanelPos.placement === "above"
                  ? { bottom: activityPanelPos.bottom }
                  : { top: activityPanelPos.top }),
              },
            ]}
          >
            {activityPanelPos.placement !== "above" ? (
              <>
                <View
                  style={[
                    styles.attentionPopupCaret,
                    {
                      left: activityPanelPos.caretLeft,
                      borderBottomColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.attentionPopupCaretInner,
                    {
                      left: activityPanelPos.caretLeft + 1,
                      borderBottomColor: theme.colors.surfaceContainerHighest,
                    },
                  ]}
                />
              </>
            ) : null}
            <View
              style={[
                styles.attentionPopupPanel,
                {
                  maxHeight: activityPanelPos.maxHeight || 320,
                  backgroundColor: theme.colors.surfaceContainerHighest,
                  borderColor: theme.colors.outlineVariant,
                  borderTopWidth: 3,
                  borderTopColor: activityPopupConfig?.accent,
                },
              ]}
            >
              <View style={styles.attentionPopupHeader}>
                <Text
                  style={[
                    styles.attentionPopupTitle,
                    { color: theme.colors.onSurface },
                  ]}
                  numberOfLines={1}
                >
                  {activityPopupConfig?.title}
                </Text>
                <IconButton
                  icon="close"
                  size={18}
                  onPress={() => setActivityOpen(false)}
                  style={styles.attentionPopupClose}
                  accessibilityLabel="Close"
                />
              </View>
              <Text
                style={[
                  styles.attentionPopupHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={2}
              >
                {activityPopupConfig?.hint}
              </Text>
              <ScrollFrame
                bordered={false}
                maxHeight={Math.max(
                  120,
                  (activityPanelPos.maxHeight || 320) - 110,
                )}
                contentContainerStyle={styles.attentionPopupList}
              >
                {(activityPopupConfig?.logs || []).length === 0 ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>
                    {activityPopupConfig?.empty}
                  </Text>
                ) : (
                  (activityPopupConfig?.logs || []).map((log, index) => {
                    const accent = getActionColor(log.action, log.details);
                    const time = log.timestamp
                      ? new Date(log.timestamp).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—";
                    const qty = logQtyAbs(log);
                    const name = getEventColorName(log);
                    const verb = formatBriefVerb(log);
                    const showVerb = activityKind === "actions";
                    return (
                      <React.Fragment
                        key={`${log.timestamp}-${log.itemId}-${index}`}
                      >
                        {index > 0 ? (
                          <Divider style={styles.attentionPopupDivider} />
                        ) : null}
                        <View style={styles.attentionPopupRow}>
                          <View
                            style={[
                              styles.attentionPopupPill,
                              { backgroundColor: accent },
                            ]}
                          >
                            <Text style={styles.attentionPopupPillText}>
                              {qty > 0 ? qty : "·"}
                            </Text>
                          </View>
                          <View style={styles.attentionPopupRowText}>
                            <Text
                              style={[
                                styles.attentionPopupRowTitle,
                                { color: theme.colors.onSurface },
                              ]}
                              numberOfLines={2}
                            >
                              {showVerb ? (
                                <Text style={{ color: accent, fontWeight: "700" }}>
                                  {verb}
                                </Text>
                              ) : null}
                              {showVerb && qty > 0 ? " " : null}
                              {qty > 0 ? `${qty} gal ` : showVerb ? " " : ""}
                              <Text style={{ fontWeight: "700" }}>{name}</Text>
                            </Text>
                            <Text
                              style={[
                                styles.attentionPopupRowDetail,
                                { color: theme.colors.onSurfaceVariant },
                              ]}
                              numberOfLines={1}
                            >
                              {time}
                            </Text>
                          </View>
                        </View>
                      </React.Fragment>
                    );
                  })
                )}
              </ScrollFrame>
              <View style={styles.attentionPopupActions}>
                <Button
                  mode="text"
                  compact
                  onPress={() => setActivityOpen(false)}
                >
                  Close
                </Button>
              </View>
            </View>
            {activityPanelPos.placement === "above" ? (
              <>
                <View
                  style={[
                    styles.attentionPopupCaretDownInner,
                    {
                      left: activityPanelPos.caretLeft + 1,
                      borderTopColor: theme.colors.surfaceContainerHighest,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.attentionPopupCaretDown,
                    {
                      left: activityPanelPos.caretLeft,
                      borderTopColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Checked out list modal */}
      <Modal
        visible={checkedOutListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCheckedOutListOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCheckedOutListOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.modalHeaderRow}>
              <Text
                style={[styles.modalTitle, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                Checked out this {checkedOutListIsWeek ? "week" : "month"}
              </Text>
              <Button compact onPress={() => setCheckedOutListOpen(false)}>
                Close
              </Button>
            </View>
            <Text
              style={[
                styles.modalSubhint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {checkedOutListIsWeek
                ? thisWeekRange.label
                : thisMonthRange.label}
            </Text>
            <ScrollFrame
              maxHeight={420}
              contentContainerStyle={styles.modalList}
            >
              {(checkedOutListIsWeek
                ? checkedOutByItemWeek
                : checkedOutByItemMonth
              ).length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  None.
                </Text>
              ) : (
                (checkedOutListIsWeek
                  ? checkedOutByItemWeek
                  : checkedOutByItemMonth
                ).map((it) => (
                  <View
                    key={String(it.itemId)}
                    style={[
                      styles.modalItemCard,
                      {
                        backgroundColor: theme.dark
                          ? colors.dark.nested
                          : colors.light.nested,
                        borderColor: theme.colors.outlineVariant,
                      },
                    ]}
                  >
                    <View style={styles.modalItemHeader}>
                      <Text
                        style={[
                          styles.modalItemName,
                          { color: theme.colors.onSurface },
                        ]}
                        numberOfLines={1}
                      >
                        {it.name}
                      </Text>
                      <Text
                        style={[
                          styles.modalItemValue,
                          { color: theme.colors.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {it.qty} gal
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.modalItemId,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                      numberOfLines={1}
                    >
                      ID: {it.itemId}
                    </Text>
                  </View>
                ))
              )}
            </ScrollFrame>
          </Pressable>
        </Pressable>
      </Modal>

      {embeddedInShell && (
        <DashboardGreeting isAdmin={isAdmin} userName={userName} />
      )}

      {/* Quick actions — mobile only (sidebar covers this on desktop) */}
      {isMobileLayout &&
        (onOpenInventory ||
        onOpenMaterialUsage ||
        onOpenWasteTracking ||
        onOpenCheckInOut) && (
        <View style={styles.quickActionsBlock}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Quick actions
          </Text>
          <View style={styles.quickActionsRow}>
            {showCheckInOutNav && onOpenCheckInOut ? (
              <Pressable
                onPress={onOpenCheckInOut}
                style={[styles.quickAction, surfaceCardStyle]}
                accessibilityRole="button"
                accessibilityLabel="Check in or out"
              >
                <Icon
                  source="keyboard"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.quickActionLabel,
                    { color: theme.colors.primary },
                  ]}
                  numberOfLines={1}
                >
                  In/Out
                </Text>
              </Pressable>
            ) : null}
            {onOpenInventory ? (
              <Pressable
                onPress={onOpenInventory}
                style={[styles.quickAction, surfaceCardStyle]}
                accessibilityRole="button"
                accessibilityLabel="Inventory"
              >
                <Icon
                  source="format-list-bulleted"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.quickActionLabel,
                    { color: theme.colors.primary },
                  ]}
                  numberOfLines={1}
                >
                  Inventory
                </Text>
              </Pressable>
            ) : null}
            {onOpenMaterialUsage ? (
              <Pressable
                onPress={onOpenMaterialUsage}
                style={[styles.quickAction, surfaceCardStyle]}
                accessibilityRole="button"
                accessibilityLabel="Material usage"
              >
                <Icon
                  source="chart-box"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.quickActionLabel,
                    { color: theme.colors.primary },
                  ]}
                  numberOfLines={1}
                >
                  Usage
                </Text>
              </Pressable>
            ) : null}
            {onOpenWasteTracking ? (
              <Pressable
                onPress={onOpenWasteTracking}
                style={[styles.quickAction, surfaceCardStyle]}
                accessibilityRole="button"
                accessibilityLabel="Waste tracking"
              >
                <Icon
                  source="delete-variant"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  style={[
                    styles.quickActionLabel,
                    { color: theme.colors.primary },
                  ]}
                  numberOfLines={1}
                >
                  Waste
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      {!isAdmin && myActivityToday ? (
        <View style={styles.myActivityBlock}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            My activity today
          </Text>
          {isMobileLayout ? (
            <View style={styles.myActivityGrid}>
              <View style={styles.myActivityTopRow}>
                <View
                  ref={checkedOutCardRef}
                  collapsable={false}
                  style={styles.statCardWrap}
                >
                  <Pressable
                    onPress={() =>
                      openActivityPanel("checkedOut", checkedOutCardRef)
                    }
                  >
                    <Card
                      style={[
                        styles.statCard,
                        styles.statCardCompact,
                        surfaceCardStyle,
                      ]}
                      mode="outlined"
                    >
                      <Card.Content style={styles.statCardContent}>
                        <Text
                          style={[
                            styles.statLabel,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Checked out
                        </Text>
                        <Title
                          style={[
                            styles.statValue,
                            { color: colors.action.checkOut },
                          ]}
                        >
                          {myActivityToday.checkedOut}
                          <Text
                            style={[
                              styles.statValueUnit,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {" "}
                            gal
                          </Text>
                        </Title>
                      </Card.Content>
                    </Card>
                  </Pressable>
                </View>
                <View
                  ref={checkedInCardRef}
                  collapsable={false}
                  style={styles.statCardWrap}
                >
                  <Pressable
                    onPress={() =>
                      openActivityPanel("checkedIn", checkedInCardRef)
                    }
                  >
                    <Card
                      style={[
                        styles.statCard,
                        styles.statCardCompact,
                        surfaceCardStyle,
                      ]}
                      mode="outlined"
                    >
                      <Card.Content style={styles.statCardContent}>
                        <Text
                          style={[
                            styles.statLabel,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Checked in
                        </Text>
                        <Title
                          style={[
                            styles.statValue,
                            { color: colors.action.checkIn },
                          ]}
                        >
                          {myActivityToday.checkedIn}
                          <Text
                            style={[
                              styles.statValueUnit,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                          >
                            {" "}
                            gal
                          </Text>
                        </Title>
                      </Card.Content>
                    </Card>
                  </Pressable>
                </View>
              </View>
              <View
                ref={actionsCardRef}
                collapsable={false}
                style={styles.myActivityActionsWrap}
              >
                <Pressable
                  onPress={() => openActivityPanel("actions", actionsCardRef)}
                >
                  <Card
                    style={[
                      styles.statCard,
                      styles.statCardCompact,
                      surfaceCardStyle,
                    ]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.statCardContent}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Actions
                      </Text>
                      <Title
                        style={[
                          styles.statValue,
                          { color: theme.colors.primary },
                        ]}
                      >
                        {myActivityToday.actions}
                      </Title>
                      {myActivityToday.lastLabel ? (
                        <Text
                          style={[
                            styles.statSubtext,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Last at {myActivityToday.lastLabel}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.statSubtext,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          No activity yet
                        </Text>
                      )}
                    </Card.Content>
                  </Card>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.statsRow}>
              <View
                ref={checkedOutCardRef}
                collapsable={false}
                style={styles.statCardWrap}
              >
                <Pressable
                  onPress={() =>
                    openActivityPanel("checkedOut", checkedOutCardRef)
                  }
                >
                  <Card
                    style={[styles.statCard, surfaceCardStyle]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.statCardContent}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Checked out
                      </Text>
                      <Title
                        style={[
                          styles.statValue,
                          { color: colors.action.checkOut },
                        ]}
                      >
                        {myActivityToday.checkedOut}
                        <Text
                          style={[
                            styles.statValueUnit,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {" "}
                          gal
                        </Text>
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              </View>
              <View
                ref={checkedInCardRef}
                collapsable={false}
                style={styles.statCardWrap}
              >
                <Pressable
                  onPress={() =>
                    openActivityPanel("checkedIn", checkedInCardRef)
                  }
                >
                  <Card
                    style={[styles.statCard, surfaceCardStyle]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.statCardContent}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Checked in
                      </Text>
                      <Title
                        style={[
                          styles.statValue,
                          { color: colors.action.checkIn },
                        ]}
                      >
                        {myActivityToday.checkedIn}
                        <Text
                          style={[
                            styles.statValueUnit,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {" "}
                          gal
                        </Text>
                      </Title>
                    </Card.Content>
                  </Card>
                </Pressable>
              </View>
              <View
                ref={actionsCardRef}
                collapsable={false}
                style={styles.statCardWrap}
              >
                <Pressable
                  onPress={() => openActivityPanel("actions", actionsCardRef)}
                >
                  <Card
                    style={[styles.statCard, surfaceCardStyle]}
                    mode="outlined"
                  >
                    <Card.Content style={styles.statCardContent}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Actions
                      </Text>
                      <Title
                        style={[
                          styles.statValue,
                          { color: theme.colors.primary },
                        ]}
                      >
                        {myActivityToday.actions}
                      </Title>
                      {myActivityToday.lastLabel ? (
                        <Text
                          style={[
                            styles.statSubtext,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          Last at {myActivityToday.lastLabel}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.statSubtext,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          No activity yet
                        </Text>
                      )}
                    </Card.Content>
                  </Card>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}

      {!isAdmin && (lowStockCount > 0 || recycleDueCount > 0) ? (
        <View style={styles.attentionBlock}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Needs attention
          </Text>
          <View style={styles.attentionRow}>
            {lowStockCount > 0 ? (
              <View ref={lowStockChipRef} collapsable={false} style={{ flexGrow: 1 }}>
                <Pressable
                  onPress={() =>
                    openAttentionPanel("lowStock", lowStockChipRef)
                  }
                  style={[styles.attentionChip, surfaceCardStyle]}
                >
                  <Text
                    style={[
                      styles.attentionValue,
                      { color: colors.semantic.lowStockValue },
                    ]}
                  >
                    {lowStockCount}
                  </Text>
                  <Text
                    style={[
                      styles.attentionLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Low stock
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {recycleDueCount > 0 ? (
              <View ref={recycleChipRef} collapsable={false} style={{ flexGrow: 1 }}>
                <Pressable
                  onPress={() =>
                    openAttentionPanel("recycle", recycleChipRef)
                  }
                  style={[styles.attentionChip, surfaceCardStyle]}
                >
                  <Text
                    style={[
                      styles.attentionValue,
                      { color: colors.semantic.recycleBannerText },
                    ]}
                  >
                    {recycleDueCount}
                  </Text>
                  <Text
                    style={[
                      styles.attentionLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Recycle due
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {!isAdmin && myRecentColors.length > 0 ? (
        <View style={styles.recentColorsBlock}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            Colors you used (7 days)
          </Text>
          <View style={styles.recentColorsRow}>
            {myRecentColors.map((c) => (
              <View
                key={c.itemId}
                style={[styles.recentColorChip, surfaceCardStyle]}
              >
                <View
                  style={[
                    styles.recentSwatch,
                    {
                      backgroundColor: c.hex || theme.colors.outlineVariant,
                      borderColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
                <View style={styles.recentColorText}>
                  <Text
                    style={[
                      styles.recentColorName,
                      { color: theme.colors.onSurface },
                    ]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  <Text
                    style={[
                      styles.recentColorGal,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {c.gal} gal
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Stats Cards — non-admin desktop / wide only (admin stats moved to Inventory) */}
      {!isMobileLayout && !isAdmin ? (
      <View style={styles.statsRow}>
        <Card style={[styles.statCard, surfaceCardStyle]} mode="outlined">
          <Card.Content style={styles.statCardContent}>
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={2}
            >
              Total Gallons
            </Text>
            {inventoryLoaded ? (
              <Text
                style={[styles.statValue, { color: theme.colors.primary }]}
                numberOfLines={1}
              >
                {inventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
              </Text>
            ) : (
              <View style={styles.statLoadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.statLoadingLabel}>Loading…</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Card
          style={[styles.statCard, surfaceCardStyle]}
          mode="outlined"
          onPress={() => setGalPeriodWeek((prev) => !prev)}
        >
          <Card.Content style={styles.statCardContent}>
            <Text
              style={[
                styles.statLabel,
                { color: theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={2}
            >
              Checked out this {galPeriodWeek ? "week" : "month"}
            </Text>
            {auditLogsLoaded ? (
              <>
                <Pressable
                  onPress={() => {
                    setCheckedOutListIsWeek(galPeriodWeek);
                    setCheckedOutListOpen(true);
                  }}
                  style={styles.statNumberPressable}
                >
                  <Text
                    style={[styles.statValue, { color: theme.colors.primary }]}
                    numberOfLines={1}
                  >
                    {galPeriodWeek ? gallonsUsedThisWeek : gallonsUsedThisMonth}
                    <Text
                      style={[
                        styles.statValueUnit,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {" "}
                      gal
                    </Text>
                  </Text>
                </Pressable>
                <Text
                  style={[
                    styles.statSubtext,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  {galPeriodWeek ? thisWeekRange.label : thisMonthRange.label}
                </Text>
              </>
            ) : (
              <View style={styles.statLoadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.statLoadingLabel}>Loading…</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {(!auditLogsLoaded || mostUsedColor) && (
          <Card
            style={[styles.statCard, surfaceCardStyle]}
            mode="outlined"
            onPress={
              auditLogsLoaded
                ? () => setMostUsedByWeek((prev) => !prev)
                : undefined
            }
          >
            <Card.Content style={styles.statCardContent}>
              <Text
                style={[
                  styles.statLabel,
                  { color: theme.colors.onSurfaceVariant },
                ]}
                numberOfLines={2}
              >
                Color most checked out
              </Text>
              {auditLogsLoaded && mostUsedColor ? (
                <>
                  <Text
                    style={[
                      styles.statValue,
                      styles.statValueCompact,
                      { color: theme.colors.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {mostUsedColor.name}
                  </Text>
                  <Text
                    style={[
                      styles.statSubtext,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                    numberOfLines={2}
                  >
                    {mostUsedColor.totalGal} gal —{" "}
                    {mostUsedColor.isWeek
                      ? `week of ${mostUsedColor.periodLabel}`
                      : mostUsedColor.periodLabel}
                  </Text>
                </>
              ) : (
                <View style={styles.statLoadingRow}>
                  <ActivityIndicator size="small" />
                  <Text style={styles.statLoadingLabel}>Loading…</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      </View>
      ) : null}

      {showBriefRecent ? (
        <View style={styles.briefHistoryBlock}>
          <Text
            style={[
              styles.sectionEyebrow,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {isAdmin ? "Transaction history" : "Recent activity"}
          </Text>
          {!auditLogsLoaded ? (
            <View style={styles.statLoadingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.statLoadingLabel}>Loading…</Text>
            </View>
          ) : briefRecentLogs.length === 0 ? (
            <Text
              style={[
                styles.briefHistoryEmpty,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              No recent transactions.
            </Text>
          ) : (
            <>
              <View style={[styles.briefHistoryCard, surfaceCardStyle]}>
                {briefRecentLogs.map((log, index) => {
                  const accent = getActionColor(log.action, log.details);
                  const time = log.timestamp
                    ? new Date(log.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "—";
                  const user = getDisplayUserName(log);
                  const actionLabel = formatBriefVerb(log);
                  const qty = logQtyAbs(log);
                  const colorName = getEventColorName(log);
                  return (
                    <View
                      key={`${log.timestamp}-${log.itemId}-${index}`}
                      style={[
                        styles.briefHistoryRow,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: theme.colors.outlineVariant,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.briefHistoryAccent,
                          { backgroundColor: accent },
                        ]}
                      />
                      <View style={styles.briefHistoryBody}>
                        <View style={styles.briefHistoryTop}>
                          <Text
                            style={[
                              styles.briefHistoryTime,
                              { color: theme.colors.onSurfaceVariant },
                            ]}
                            numberOfLines={1}
                          >
                            {time}
                          </Text>
                          <Text
                            style={[
                              styles.briefHistoryUser,
                              { color: theme.colors.onSurface },
                            ]}
                            numberOfLines={1}
                          >
                            {user}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.briefHistorySummary,
                            { color: theme.colors.onSurface },
                          ]}
                          numberOfLines={2}
                        >
                          <Text style={{ color: accent, fontWeight: "700" }}>
                            {actionLabel}
                          </Text>
                          {qty > 0 ? ` ${qty} gal ` : " "}
                          <Text style={{ fontWeight: "700" }}>{colorName}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              {isAdmin && hasMoreHistory ? (
                <Button
                  mode="outlined"
                  onPress={() => setHistoryWeeksShown((w) => w + 1)}
                  style={styles.briefHistoryMoreBtn}
                  compact
                >
                  Show more
                </Button>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {showAdminDualBrief ? (
        <View style={styles.dualBriefBlock}>
          <View style={styles.historyHeader}>
            <Title
              style={[
                styles.historyTitle,
                { color: theme.colors.onBackground },
              ]}
            >
              Activity
            </Title>
            <View style={styles.activityPeriodRow}>
              {[
                { key: "today", label: "Today" },
                { key: "week", label: "This week" },
                { key: "days30", label: "30 days" },
              ].map((opt) => (
                <Button
                  key={opt.key}
                  mode={activityPeriod === opt.key ? "contained" : "outlined"}
                  compact
                  onPress={() => setActivityPeriod(opt.key)}
                  style={styles.historyToggleBtn}
                  contentStyle={styles.historyToggleContent}
                  labelStyle={styles.historyToggleLabel}
                >
                  {opt.label}
                </Button>
              ))}
            </View>
            <Text
              style={[
                styles.activityPeriodHint,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {adminActivityRange.label}
            </Text>
          </View>

          {!auditLogsLoaded ? (
            <View style={styles.statLoadingRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.statLoadingLabel}>Loading…</Text>
            </View>
          ) : (
            <>
              <View style={styles.activityTotalsRow}>
                <View
                  style={[
                    styles.activityTotalCard,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.activityTotalLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Checked out
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalValue,
                      { color: colors.action.checkOut },
                    ]}
                  >
                    {adminPeriodTotals.checkOut}
                    <Text style={styles.activityTotalUnit}> gal</Text>
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalCount,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {adminPeriodCheckOutLogs.length} txn
                    {adminPeriodCheckOutLogs.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.activityTotalCard,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.activityTotalLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Checked in
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalValue,
                      { color: colors.action.checkIn },
                    ]}
                  >
                    {adminPeriodTotals.checkIn}
                    <Text style={styles.activityTotalUnit}> gal</Text>
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalCount,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {adminPeriodCheckInLogs.length} txn
                    {adminPeriodCheckInLogs.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.activityTotalCard,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.activityTotalLabel,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Material used
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalValue,
                      { color: colors.action.materialUsage },
                    ]}
                  >
                    {adminPeriodTotals.usage}
                    <Text style={styles.activityTotalUnit}> gal</Text>
                  </Text>
                  <Text
                    style={[
                      styles.activityTotalCount,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {adminPeriodUsageLogs.length} txn
                    {adminPeriodUsageLogs.length === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>

              <View style={styles.dualBriefRow}>
                <View
                  style={[
                    styles.dualBriefCol,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <View style={styles.dualBriefColHeader}>
                    <View
                      style={[
                        styles.dualBriefDot,
                        { backgroundColor: colors.action.checkOut },
                      ]}
                    />
                    <Text
                      style={[
                        styles.dualBriefColTitle,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Checked out
                    </Text>
                    <Text
                      style={[
                        styles.dualBriefCount,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {adminPeriodCheckOutLogs.length}
                    </Text>
                  </View>
                  {adminPeriodCheckOutLogs.length === 0 ? (
                    <Text
                      style={[
                        styles.briefHistoryEmpty,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      No check-outs in this period.
                    </Text>
                  ) : (
                    <ScrollFrame
                      fill
                      maxHeight={420}
                      contentContainerStyle={styles.dualBriefListContent}
                      style={styles.dualBriefScroll}
                    >
                      {adminPeriodCheckOutLogs.map((log, index) =>
                        renderBriefLogRow(log, index),
                      )}
                    </ScrollFrame>
                  )}
                </View>

                <View
                  style={[
                    styles.dualBriefCol,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <View style={styles.dualBriefColHeader}>
                    <View
                      style={[
                        styles.dualBriefDot,
                        { backgroundColor: colors.action.checkIn },
                      ]}
                    />
                    <Text
                      style={[
                        styles.dualBriefColTitle,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Checked in
                    </Text>
                    <Text
                      style={[
                        styles.dualBriefCount,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {adminPeriodCheckInLogs.length}
                    </Text>
                  </View>
                  {adminPeriodCheckInLogs.length === 0 ? (
                    <Text
                      style={[
                        styles.briefHistoryEmpty,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      No check-ins in this period.
                    </Text>
                  ) : (
                    <ScrollFrame
                      fill
                      maxHeight={420}
                      contentContainerStyle={styles.dualBriefListContent}
                      style={styles.dualBriefScroll}
                    >
                      {adminPeriodCheckInLogs.map((log, index) =>
                        renderBriefLogRow(log, index),
                      )}
                    </ScrollFrame>
                  )}
                </View>

                <View
                  style={[
                    styles.dualBriefCol,
                    surfaceCardStyle,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <View style={styles.dualBriefColHeader}>
                    <View
                      style={[
                        styles.dualBriefDot,
                        { backgroundColor: colors.action.materialUsage },
                      ]}
                    />
                    <Text
                      style={[
                        styles.dualBriefColTitle,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Material usage
                    </Text>
                    <Text
                      style={[
                        styles.dualBriefCount,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {adminPeriodUsageLogs.length}
                    </Text>
                  </View>
                  {adminPeriodUsageLogs.length === 0 ? (
                    <Text
                      style={[
                        styles.briefHistoryEmpty,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      No material usage in this period.
                    </Text>
                  ) : (
                    <ScrollFrame
                      fill
                      maxHeight={420}
                      contentContainerStyle={styles.dualBriefListContent}
                      style={styles.dualBriefScroll}
                    >
                      {adminPeriodUsageLogs.map((log, index) =>
                        renderBriefLogRow(log, index, { showBooth: true }),
                      )}
                    </ScrollFrame>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      ) : null}

      {showFullHistoryTable ? (
        <>
          {/* Transaction History */}
          <Card
            style={[
              styles.historyCard,
              styles.historyCardWeb,
              surfaceCardStyle,
            ]}
            mode="outlined"
          >
            <Card.Content
              style={[
                styles.historyCardContent,
                styles.historyCardContentWeb,
              ]}
            >
              <View style={styles.historyHeader}>
                <Title
                  style={[
                    styles.historyTitle,
                    { color: theme.colors.onBackground },
                  ]}
                >
                  Transaction History
                </Title>
                {isAdmin && isWeb && (
                  <View style={styles.historyAdminControls}>
                    <View style={styles.historyShiftGroup}>
                      <Button
                        mode={shiftFilter === "day" ? "contained" : "outlined"}
                        compact
                        onPress={() =>
                          setShiftFilter((f) => (f === "day" ? null : "day"))
                        }
                        style={styles.historyToggleBtn}
                        contentStyle={styles.historyToggleContent}
                        labelStyle={styles.historyToggleLabel}
                      >
                        {SHIFT_LABELS.day}
                      </Button>
                      <Button
                        mode={
                          shiftFilter === "swing" ? "contained" : "outlined"
                        }
                        compact
                        onPress={() =>
                          setShiftFilter((f) => (f === "swing" ? null : "swing"))
                        }
                        style={styles.historyToggleBtn}
                        contentStyle={styles.historyToggleContent}
                        labelStyle={styles.historyToggleLabel}
                      >
                        {SHIFT_LABELS.swing}
                      </Button>
                    </View>
                    <Button
                      mode={reducedHistory ? "contained" : "outlined"}
                      compact
                      onPress={() => setReducedHistory((p) => !p)}
                      style={styles.historyToggleBtn}
                      contentStyle={styles.historyToggleContent}
                      labelStyle={styles.historyToggleLabel}
                    >
                      {reducedHistory ? "Reduced" : "Standard"}
                    </Button>
                  </View>
                )}
                <OutlinedSearchInput
                  placeholder="Search transactions..."
                  onChangeText={setSearchQuery}
                  value={searchQuery}
                  style={styles.searchbar}
                />
                {isAdmin && userFilter ? (
                  <View style={styles.userFilterRow}>
                    <Chip
                      icon="account"
                      onClose={() => setUserFilter(null)}
                      style={styles.userFilterChip}
                    >
                      {userFilter}
                    </Chip>
                    <Text
                      style={{
                        color: theme.colors.onSurfaceVariant,
                        fontSize: 12,
                      }}
                    >
                      Showing this user's transactions
                    </Text>
                  </View>
                ) : null}
              </View>

              {!auditLogsLoaded ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator
                    size="small"
                    style={styles.transactionsLoadingSpinner}
                  />
                  <Text style={styles.transactionsLoadingText}>
                    Loading transactions…
                  </Text>
                </View>
              ) : visibleHistoryLogs.length === 0 ? (
                <View>
                  <AppEmptyState title="No transactions found" />
                  {isAdmin && hasMoreHistory ? (
                    <Pressable
                      onPress={() => setHistoryWeeksShown((w) => w + 2)}
                      hitSlop={8}
                      style={styles.showMoreHistoryLink}
                    >
                      <Text
                        style={[
                          styles.showMoreHistoryLinkText,
                          { color: theme.colors.primary },
                        ]}
                      >
                        Show more
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <ScrollFrame
                  fill
                  maxHeight={undefined}
                  contentContainerStyle={styles.tableScrollOuterContent}
                  style={styles.tableScrollOuterWeb}
                >
                  <ScrollView
                    horizontal
                    style={styles.tableScrollHorizontal}
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.tableScrollHorizontalContent}
                  >
                    <DataTable style={styles.dataTable}>
                      <DataTable.Header>
                        <DataTable.Title style={styles.timeCell}>
                          Time
                        </DataTable.Title>
                        <DataTable.Title style={styles.userCell}>
                          User
                        </DataTable.Title>
                        <DataTable.Title style={styles.qtyCell} numeric>
                          Qty (gal)
                        </DataTable.Title>
                        <DataTable.Title style={styles.actionCell}>
                          Action
                        </DataTable.Title>
                        <DataTable.Title style={styles.colorCell}>
                          Color
                        </DataTable.Title>
                        <DataTable.Title style={styles.totalCell} numeric>
                          Total (gal)
                        </DataTable.Title>
                      </DataTable.Header>

                      {visibleHistoryLogs.map((log, index) => {
                        const showDayDividers = isWeb;
                        const dayKey = showDayDividers
                          ? getDayKey(log.timestamp)
                          : null;
                        const prevKey =
                          showDayDividers && index > 0
                            ? getDayKey(visibleHistoryLogs[index - 1]?.timestamp)
                            : null;
                        const startsNewDay =
                          showDayDividers && dayKey && dayKey !== prevKey;
                        const actionText = formatAction(
                          log.action,
                          log.details,
                          log.itemId,
                        );
                        const quantity = getQuantity(
                          log.action,
                          log.details,
                          log.itemId,
                        );
                        const colorName = getEventColorName(log);
                        const totalQuantity = getTotalQuantity(
                          log.action,
                          log.details,
                          log.itemId,
                        );

                        return (
                          <React.Fragment key={index}>
                            {startsNewDay && (
                              <DataTable.Row style={styles.dayDividerRow}>
                                <DataTable.Cell style={styles.dayDividerCell}>
                                  <View style={styles.dayDividerWrap}>
                                    <Text style={styles.dayDividerText}>
                                      {formatDayHeader(log.timestamp)}
                                    </Text>
                                    <View style={styles.dayDividerLine} />
                                  </View>
                                </DataTable.Cell>
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                                <DataTable.Cell style={styles.dayDividerCell} />
                              </DataTable.Row>
                            )}
                            <DataTable.Row>
                              <DataTable.Cell style={styles.timeCell}>
                                <Text style={styles.timeText}>
                                  {new Date(log.timestamp).toLocaleString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.userCell}>
                                {isAdmin ? (
                                  <Pressable
                                    onPress={() => handleUserPress(log)}
                                    hitSlop={6}
                                  >
                                    <Text
                                      style={[
                                        styles.userText,
                                        styles.clickableText,
                                        {
                                          color: theme.dark
                                            ? "#fff"
                                            : mutedTextColor(theme),
                                        },
                                      ]}
                                    >
                                      {getDisplayUserName(log)}
                                    </Text>
                                  </Pressable>
                                ) : (
                                  <Text
                                    style={[
                                      styles.userText,
                                      {
                                        color: theme.dark
                                          ? "#fff"
                                          : mutedTextColor(theme),
                                      },
                                    ]}
                                  >
                                    {getDisplayUserName(log)}
                                  </Text>
                                )}
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.qtyCell} numeric>
                                <Text
                                  style={[
                                    styles.quantityText,
                                    { color: theme.dark ? "#fff" : "#000" },
                                  ]}
                                >
                                  {quantity !== "-" ? `${quantity}` : "-"}
                                </Text>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.actionCell}>
                                <Chip
                                  style={{
                                    backgroundColor:
                                      getActionColor(
                                        log.action,
                                        log.details,
                                      ) + "20",
                                  }}
                                  textStyle={{
                                    color: getActionColor(
                                      log.action,
                                      log.details,
                                    ),
                                    fontSize: 11,
                                  }}
                                >
                                  {actionText}
                                </Chip>
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.colorCell}>
                                {isAdmin && onItemSelect ? (
                                  <Pressable
                                    onPress={() => handleItemPress(log)}
                                    hitSlop={6}
                                  >
                                    <Text
                                      style={[
                                        styles.itemNameText,
                                        styles.clickableText,
                                        {
                                          color: theme.dark ? "#fff" : undefined,
                                        },
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {colorName}
                                    </Text>
                                  </Pressable>
                                ) : (
                                  <Text
                                    style={[
                                      styles.itemNameText,
                                      {
                                        color: theme.dark ? "#fff" : undefined,
                                      },
                                    ]}
                                  >
                                    {colorName}
                                  </Text>
                                )}
                              </DataTable.Cell>
                              <DataTable.Cell style={styles.totalCell} numeric>
                                <Text
                                  style={[
                                    styles.totalText,
                                    { color: theme.dark ? "#fff" : "#000" },
                                  ]}
                                >
                                  {totalQuantity !== "-"
                                    ? `${totalQuantity}`
                                    : "-"}
                                </Text>
                              </DataTable.Cell>
                            </DataTable.Row>
                          </React.Fragment>
                        );
                      })}
                    </DataTable>
                  </ScrollView>
                  {isAdmin && hasMoreHistory ? (
                    <Pressable
                      onPress={() => setHistoryWeeksShown((w) => w + 2)}
                      hitSlop={8}
                      style={styles.showMoreHistoryLink}
                    >
                      <Text
                        style={[
                          styles.showMoreHistoryLinkText,
                          { color: theme.colors.primary },
                        ]}
                      >
                        Show more
                      </Text>
                    </Pressable>
                  ) : null}
                </ScrollFrame>
              )}
            </Card.Content>
          </Card>
        </>
      ) : null}
    </View>
  );

  if (isWeb) {
    if (!showFullHistoryTable && !showAdminDualBrief) {
      return (
        <ScrollView
          style={[
            styles.container,
            styles.containerWeb,
            { backgroundColor: theme.colors.background },
          ]}
          contentContainerStyle={styles.scrollContentStatsOnly}
          showsVerticalScrollIndicator={true}
        >
          {content}
        </ScrollView>
      );
    }
    return (
      <View
        style={[
          styles.container,
          styles.containerWeb,
          { backgroundColor: theme.colors.background },
        ]}
      >
        {content}
      </View>
    );
  }

  // Native mobile: non-scrolling shell layout (history scrolls inside)
  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.scrollContent}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web" && { overflow: "hidden" }),
  },
  containerWeb: {
    padding: 20,
    paddingTop: 8,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    flexGrow: 1,
  },
  scrollContentStatsOnly: {
    padding: 20,
    paddingTop: 8,
  },
  dashboardContainer: {
    maxWidth: 1400,
    width: "100%",
    alignSelf: "center",
  },
  dashboardContainerWeb: {
    flex: 1,
    minHeight: 0,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
    alignItems: "stretch",
  },
  myActivityStatsRow: {
    flexWrap: "nowrap",
    gap: 8,
    alignItems: "stretch",
  },
  myActivityGrid: {
    gap: 8,
    marginBottom: 16,
  },
  myActivityTopRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  myActivityActionsWrap: {
    width: "100%",
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: space[2],
  },
  quickActionsBlock: {
    marginBottom: space[4],
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    alignItems: "stretch",
  },
  quickAction: {
    borderRadius: radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "48.5%",
    minWidth: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  myActivityBlock: {
    marginBottom: space[2],
  },
  attentionBlock: {
    marginBottom: space[5],
  },
  attentionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  attentionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 140,
  },
  attentionPopupRoot: {
    flex: 1,
  },
  attentionPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  attentionPopupAnchor: {
    position: "absolute",
  },
  attentionPopupCaret: {
    position: "absolute",
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  attentionPopupCaretInner: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  attentionPopupCaretDown: {
    position: "absolute",
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  attentionPopupCaretDownInner: {
    position: "absolute",
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  attentionPopupPanel: {
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    ...(Platform.OS === "web"
      ? {
          boxSizing: "border-box",
          boxShadow: "0px 8px 24px rgba(0,0,0,0.28)",
        }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 10,
        }),
  },
  attentionPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
    minWidth: 0,
  },
  attentionPopupClose: {
    margin: 0,
    marginRight: -6,
    flexShrink: 0,
  },
  attentionPopupTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  attentionPopupHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    minWidth: 0,
  },
  attentionPopupList: {
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  attentionPopupDivider: {
    marginVertical: 2,
    marginHorizontal: 0,
  },
  attentionPopupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    minWidth: 0,
  },
  attentionPopupPill: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  attentionPopupPillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  attentionPopupRowText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  attentionPopupRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
    lineHeight: 18,
  },
  attentionPopupRowDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  attentionPopupActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  attentionValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  attentionLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  recentColorsBlock: {
    marginBottom: space[5],
  },
  recentColorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  recentColorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: 220,
    minWidth: 140,
    flexGrow: 1,
  },
  recentSwatch: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  recentColorText: {
    flex: 1,
    minWidth: 0,
  },
  recentColorName: {
    fontSize: 13,
    fontWeight: "600",
  },
  recentColorGal: {
    fontSize: 11,
  },
  statCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    minWidth: 168,
    maxWidth: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  statCardCompact: {
    minWidth: 0,
    flexBasis: 0,
    width: "100%",
  },
  statCardWrap: {
    flex: 1,
    minWidth: 0,
  },
  statCardContent: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 0,
    ...(Platform.OS === "web" ? { boxSizing: "border-box" } : null),
  },
  statLabel: {
    fontSize: 11,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 15,
    minWidth: 0,
  },
  statLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  statLoadingLabel: {
    fontSize: 14,
    color: colors.dark.textDim,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    marginVertical: 0,
    minWidth: 0,
  },
  statValueCompact: {
    fontSize: 17,
    lineHeight: 22,
  },
  statValueUnit: {
    fontSize: 13,
    fontWeight: "600",
  },
  statSubtext: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 14,
    minWidth: 0,
  },
  statSubtextHint: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 14,
    fontStyle: "italic",
  },
  statNumberPressable: {
    alignSelf: "stretch",
    minWidth: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    minWidth: 0,
  },
  modalHint: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  modalSubhint: {
    fontSize: 13,
    marginBottom: 12,
  },
  modalList: {
    gap: 10,
    paddingBottom: 4,
  },
  modalItemCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
  },
  modalItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },
  modalItemName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "700",
  },
  modalItemValue: {
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 0,
  },
  modalItemId: {
    fontSize: 12,
    fontFamily: fontFamily.mono,
    marginTop: 2,
  },
  modalItemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  modalItemMeta: {
    fontSize: 13,
  },
  staleDaysInline: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  historyCard: {
    borderRadius: 12,
  },
  briefHistoryBlock: {
    marginBottom: space[5],
  },
  briefHistoryEmpty: {
    fontSize: 13,
    paddingVertical: space[2],
  },
  briefHistoryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  briefHistoryRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 0,
    gap: 0,
  },
  briefHistoryAccent: {
    width: 4,
    marginRight: 12,
    borderRadius: 2,
    alignSelf: "stretch",
  },
  briefHistoryBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  briefHistoryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  briefHistoryTime: {
    fontSize: 12,
    flexShrink: 1,
  },
  briefHistoryUser: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
  },
  briefHistorySummary: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  briefHistoryMoreBtn: {
    marginTop: space[3],
    alignSelf: "stretch",
  },
  dualBriefBlock: {
    flex: 1,
    minHeight: 0,
    marginBottom: space[5],
    gap: space[3],
  },
  dualBriefSearch: {
    minWidth: 180,
    flex: 1,
    maxWidth: 280,
  },
  activityPeriodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  activityPeriodHint: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },
  activityTotalsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  activityTotalCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activityTotalLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  activityTotalValue: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 32,
  },
  activityTotalUnit: {
    fontSize: 14,
    fontWeight: "600",
  },
  activityTotalCount: {
    fontSize: 11,
    marginTop: 2,
  },
  dualBriefRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    flex: 1,
    minHeight: 0,
  },
  dualBriefCol: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 4,
  },
  dualBriefColHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  dualBriefDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dualBriefDotPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dualBriefColTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  dualBriefCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  dualBriefScroll: {
    flex: 1,
    minHeight: 0,
  },
  dualBriefListContent: {
    paddingBottom: 8,
  },
  briefMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  briefBoothPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  briefBoothText: {
    fontSize: 11,
    fontWeight: "700",
  },
  briefJobText: {
    fontSize: 12,
    fontWeight: "500",
  },
  showMoreHistoryLink: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  showMoreHistoryLinkText: {
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  historyCardContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  historyCardWeb: {
    flex: 1,
    minHeight: 0,
  },
  historyCardContentWeb: {
    flex: 1,
    minHeight: 0,
  },
  historyHeader: {
    marginBottom: 16,
  },
  historyToggleBtn: {
    minWidth: 0,
  },
  historyToggleContent: {
    height: 34,
    paddingHorizontal: 10,
  },
  historyToggleLabel: {
    fontSize: 13,
    marginHorizontal: 4,
    lineHeight: 18,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  searchbar: {
    marginBottom: 0,
    elevation: 0,
  },
  searchbarInput: {
    fontSize: 14,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  transactionsLoadingSpinner: {
    marginBottom: 8,
  },
  transactionsLoadingText: {
    color: colors.dark.textDim,
    fontSize: 14,
  },
  tableScrollOuterWeb: {
    flex: 1,
    minHeight: 0,
  },
  tableScrollOuterContent: {
    flexGrow: 1,
  },
  tableScrollHorizontal: {
    flexGrow: 0,
  },
  tableScrollHorizontalContent: {
    flexGrow: 0,
  },
  dataTable: {
    minWidth: 900,
  },
  dayDividerRow: {
    borderBottomWidth: 0,
  },
  dayDividerCell: {
    paddingVertical: 0,
    paddingHorizontal: 12,
  },
  dayDividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 10,
  },
  historyAdminControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  historyShiftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayDividerText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.dark.textDim,
    marginRight: 12,
  },
  dayDividerLine: {
    height: 2,
    flex: 1,
    // Subtle neutral line; avoid theme access inside StyleSheet.
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 1,
  },
  // Fixed width cells based on content needs
  timeCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 120, // "Dec 25, 2:30 PM"
  },
  userCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 70, // User names are typically short
  },
  qtyCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 90, // "5 gal" or numbers
  },
  actionCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 140, // "Checked In", "Manual Adjustment", etc.
  },
  colorCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 250, // Paint color names can be longer - increased to show full text
    flexShrink: 0, // Prevent shrinking
  },
  totalCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: 100, // Total quantity numbers
  },
  timeText: {
    fontSize: 12,
    color: colors.light.textMuted,
  },
  itemNameText: {
    fontSize: 13,
    fontWeight: "500",
  },
  userText: {
    fontSize: 12,
    // Color is set inline based on theme
  },
  clickableText: {
    fontWeight: "700",
  },
  userFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  userFilterChip: {
    alignSelf: "flex-start",
  },
  quantityText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
  totalText: {
    fontSize: 13,
    fontWeight: "500",
    // Color is set inline based on theme
  },
});
