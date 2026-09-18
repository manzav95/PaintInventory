import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Card,
  Text,
  useTheme,
  IconButton,
  ActivityIndicator,
  SegmentedButtons,
} from "react-native-paper";
import AuditService from "../services/auditService";
import MaterialUsageService from "../services/materialUsageService";
import { AppText, AppEmptyState } from "../components/ui";
import { getActionColor } from "../utils/actionColors";
import {
  formatCustomStackDisplay,
  isCustomStackLocation,
} from "../utils/customStacks";

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;

function formatLocationLabel(loc) {
  const s = String(loc || "").trim();
  if (!s) return "No stack";
  if (isCustomStackLocation(s)) return formatCustomStackDisplay(s);
  return s;
}

function isLocationChange(action, details) {
  if (action === "location_change") return true;
  if (action === "update" && details?._actionType === "location_change")
    return true;
  if (
    details &&
    (details.oldLocation != null || details.newLocation != null) &&
    String(details.oldLocation || "").trim() !==
      String(details.newLocation || "").trim()
  ) {
    return true;
  }
  return false;
}

function formatLocationChange(details) {
  if (!details) return null;
  if (details.oldLocation != null || details.newLocation != null) {
    return `${formatLocationLabel(details.oldLocation)} → ${formatLocationLabel(
      details.newLocation,
    )}`;
  }
  if (details.location != null && String(details.location).trim()) {
    return formatLocationLabel(details.location);
  }
  return null;
}

function getDayKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeader(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const md = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  return `${weekday} ${md}`;
}

function formatAction(action, details) {
  if (isLocationChange(action, details) && action === "location_change") {
    return "Location";
  }
  if (action === "update" && details?._actionType) {
    if (details._actionType === "check_in") return "Checked In";
    if (details._actionType === "check_out") return "Checked Out";
    if (details._actionType === "receiving") return "Receiving";
    if (details._actionType === "recycled") return "Recycled";
    if (details._actionType === "location_change") return "Location";
  }
  const map = {
    add: "New Entry",
    check_in: "Checked In",
    check_out: "Checked Out",
    receiving: "Receiving",
    recycled: "Recycled",
    location_change: "Location",
    update: "Manual Adjustment",
    delete: "Deleted",
    change_id: "ID Changed",
    set_next_id: "Next ID Set",
  };
  return map[action] ?? action;
}

function getQuantity(action, details) {
  if (!details) return "-";
  if (isLocationChange(action, details) && action === "location_change") {
    return "-";
  }
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
    const q = details.quantityChange ?? details._quantityChange;
    if (typeof q === "number") return Math.abs(q);
  }
  if (action === "update" && typeof details.quantityChange === "number") {
    return Math.abs(details.quantityChange);
  }
  if (action === "add" && typeof details.quantity === "number") return details.quantity;
  return "-";
}

function getTotalQuantity(action, details) {
  if (!details) return "-";
  if (action === "location_change" || details?._actionType === "location_change") {
    return "-";
  }
  if (typeof details.newQuantity === "number") return details.newQuantity;
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
  if (isCheckInOut && typeof details.quantity === "number") return details.quantity;
  if (action === "update" && typeof details.quantity === "number") return details.quantity;
  if (action === "add" && typeof details.quantity === "number") return details.quantity;
  if (action === "delete") return 0;
  return "-";
}

function getDisplayUserName(log) {
  const u = (log.userName || "").trim().toLowerCase();
  if (u && u !== "unknown") return log.userName;
  const adminOnly =
    ["add", "change_id", "set_next_id", "set_min_quantity", "delete"].includes(
      log.action,
    ) ||
    (log.action === "update" &&
      !(
        log.details?._actionType === "check_in" ||
        log.details?._actionType === "check_out" ||
        log.details?._actionType === "receiving" ||
        log.details?._actionType === "recycled" ||
        log.details?._actionType === "location_change"
      ));
  return adminOnly ? "Admin" : log.userName || "Unknown";
}

function filterToStandardUserVisible(logs) {
  return logs.filter((log) => {
    const a = log.action;
    const d = log.details;
    if (
      a === "check_in" ||
      a === "check_out" ||
      a === "receiving" ||
      a === "recycled" ||
      a === "delete" ||
      a === "location_change"
    )
      return true;
    if (
      a === "update" &&
      d?._actionType &&
      (d._actionType === "check_in" ||
        d._actionType === "check_out" ||
        d._actionType === "receiving" ||
        d._actionType === "recycled" ||
        d._actionType === "location_change")
    )
      return true;
    return false;
  });
}

function formatUsageQty(row) {
  const gal = Number(row?.qty_gallons) || 0;
  if (row?.cup_gun) {
    const oz = Math.round(gal * 128 * 100) / 100;
    return `${oz} oz`;
  }
  return `${gal} gal`;
}

function formatUsageWhen(row) {
  const date = row?.entry_date || "";
  const time = row?.entry_time || "";
  if (date && time) return `${date} · ${time}`;
  return date || time || "—";
}

export default function ItemTransactionHistoryScreen({
  item,
  onBack,
  isAdmin = true,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktop = isWeb && width >= 700;
  const [activeTab, setActiveTab] = useState("checks");
  const [logs, setLogs] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cutoff = useMemo(() => Date.now() - THREE_MONTHS_MS, []);

  const loadChecks = useCallback(async () => {
    const all = await AuditService.list(2000);
    const itemId = item?.id != null ? String(item.id) : "";
    let filtered = (Array.isArray(all) ? all : [])
      .filter((log) => String(log.itemId) === itemId)
      .filter((log) => {
        const t = log.timestamp ? new Date(log.timestamp).getTime() : 0;
        return t >= cutoff;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!isAdmin) filtered = filterToStandardUserVisible(filtered);
    setLogs(filtered);
  }, [item?.id, isAdmin, cutoff]);

  const loadUsage = useCallback(async () => {
    const itemId = item?.id != null ? String(item.id) : "";
    const colorName =
      (item?.name && String(item.name).trim()) ||
      (item?.color && String(item.color).trim()) ||
      "";
    const list = await MaterialUsageService.list(null, 2000, {
      item_id: itemId || undefined,
      color_name: colorName || undefined,
      ...(isAdmin ? {} : { excludeAdmin: true }),
    });
    const cutoffIso = new Date(cutoff).toISOString().slice(0, 10);
    const filtered = (Array.isArray(list) ? list : [])
      .filter((row) => {
        const d = String(row.entry_date || "").slice(0, 10);
        return !d || d >= cutoffIso;
      })
      .sort((a, b) => {
        const ta = `${a.entry_date || ""} ${a.entry_time || ""}`;
        const tb = `${b.entry_date || ""} ${b.entry_time || ""}`;
        return tb.localeCompare(ta);
      });
    setUsageLogs(filtered);
  }, [item?.id, item?.name, item?.color, isAdmin, cutoff]);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        await Promise.all([loadChecks(), loadUsage()]);
      } catch (e) {
        console.error("ItemTransactionHistoryScreen load:", e);
        setLogs([]);
        setUsageLogs([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadChecks, loadUsage],
  );

  useEffect(() => {
    if (item) loadAll();
  }, [item?.id, isAdmin, loadAll]);

  if (!item) {
    return null;
  }

  const checksEmpty = logs.length === 0;
  const usageEmpty = usageLogs.length === 0;
  const tabEmpty = activeTab === "checks" ? checksEmpty : usageEmpty;

  const checksContent =
    checksEmpty ? (
      <AppEmptyState title="No check-in/out activity in the last 3 months" />
    ) : (
      logs.map((log, index) => {
        const showDayDividers = isAdmin && isDesktop;
        const dayKey = showDayDividers ? getDayKey(log.timestamp) : null;
        const prevKey =
          showDayDividers && index > 0
            ? getDayKey(logs[index - 1]?.timestamp)
            : null;
        const startsNewDay = showDayDividers && dayKey && dayKey !== prevKey;
        const actionText = formatAction(log.action, log.details);
        const color = getActionColor(log.action, log.details);
        const qty = getQuantity(log.action, log.details);
        const total = getTotalQuantity(log.action, log.details);
        const locationNote = formatLocationChange(log.details);
        const isLocOnly =
          log.action === "location_change" ||
          log.details?._actionType === "location_change";
        const dateStr = log.timestamp
          ? new Date(log.timestamp).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        return (
          <React.Fragment key={`${log.timestamp}-${index}`}>
            {startsNewDay && (
              <View style={styles.dayDivider}>
                <Text
                  style={[
                    styles.dayDividerText,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {formatDayHeader(log.timestamp)}
                </Text>
                <View
                  style={[
                    styles.dayDividerLine,
                    {
                      backgroundColor: theme.dark
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(0,0,0,0.12)",
                    },
                  ]}
                />
              </View>
            )}
            <View
              style={[
                styles.row,
                index < logs.length - 1 && styles.rowBorder,
                { borderBottomColor: theme.colors.outlineVariant },
              ]}
            >
              <View style={styles.rowLeft}>
                <Text
                  style={[
                    styles.time,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {dateStr}
                </Text>
                <Text
                  style={[
                    styles.user,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {getDisplayUserName(log)}
                </Text>
                {locationNote ? (
                  <Text
                    style={[
                      styles.locationNote,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                    numberOfLines={2}
                  >
                    {locationNote}
                  </Text>
                ) : null}
              </View>
              <View
                style={[styles.actionChip, { backgroundColor: color + "22" }]}
              >
                <Text style={[styles.actionText, { color }]}>{actionText}</Text>
              </View>
              <Text style={[styles.qty, { color: theme.colors.onSurface }]}>
                {isLocOnly ? "-" : qty !== "-" ? `${qty}` : "-"}
              </Text>
              <Text style={[styles.total, { color: theme.colors.onSurface }]}>
                {isLocOnly
                  ? "-"
                  : total !== "-"
                    ? `${total} gal`
                    : "-"}
              </Text>
            </View>
          </React.Fragment>
        );
      })
    );

  const usageContent =
    usageEmpty ? (
      <AppEmptyState title="No mix / usage history in the last 3 months" />
    ) : (
      usageLogs.map((row, index) => (
        <View
          key={row.id != null ? String(row.id) : `usage-${index}`}
          style={[
            styles.row,
            index < usageLogs.length - 1 && styles.rowBorder,
            { borderBottomColor: theme.colors.outlineVariant },
          ]}
        >
          <View style={styles.rowLeft}>
            <Text
              style={[styles.time, { color: theme.colors.onSurfaceVariant }]}
            >
              {formatUsageWhen(row)}
            </Text>
            <Text
              style={[styles.user, { color: theme.colors.onSurfaceVariant }]}
            >
              {row.user_name || "Unknown"}
              {row.booth ? ` · ${row.booth}` : ""}
            </Text>
            <Text
              style={[styles.user, { color: theme.colors.onSurfaceVariant }]}
            >
              Job {row.job_name || "—"}
            </Text>
          </View>
          <View
            style={[
              styles.actionChip,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Text
              style={[styles.actionText, { color: theme.colors.onPrimaryContainer }]}
            >
              Mixed
            </Text>
          </View>
          <Text style={[styles.total, { color: theme.colors.onSurface }]}>
            {formatUsageQty(row)}
          </Text>
        </View>
      ))
    );

  const content = (
    <>
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={onBack}
          iconColor={theme.colors.primary}
        />
        <AppText variant="sectionTitle" style={styles.title}>
          Item Transaction History
        </AppText>
        <View style={styles.placeholder} />
      </View>
      <View
        style={[
          styles.itemSummary,
          {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <Text style={[styles.itemName, { color: theme.colors.onSurface }]}>
          {item.name || "Unnamed"}
        </Text>
        <Text style={[styles.itemId, { color: theme.colors.onSurfaceVariant }]}>
          ID: {item.id} · Last 3 months
        </Text>
        <SegmentedButtons
          value={activeTab}
          onValueChange={setActiveTab}
          style={styles.tabs}
          buttons={[
            {
              value: "checks",
              label: "Checks",
              icon: "swap-vertical",
            },
            {
              value: "usage",
              label: "Usage",
              icon: "beaker-outline",
            },
          ]}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            tabEmpty && styles.scrollContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAll(true)}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Card
            style={[
              styles.card,
              tabEmpty && styles.cardEmpty,
              { backgroundColor: theme.colors.surfaceContainerHighest },
            ]}
          >
            <Card.Content
              style={[styles.cardContent, tabEmpty && styles.cardContentEmpty]}
            >
              {activeTab === "checks" ? checksContent : usageContent}
            </Card.Content>
          </Card>
        </ScrollView>
      )}
    </>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {isDesktop ? <View style={styles.webContainer}>{content}</View> : content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  itemSummary: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "600",
  },
  itemId: {
    fontSize: 13,
    marginTop: 4,
  },
  tabs: {
    marginTop: 14,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  card: {
    elevation: 2,
  },
  cardEmpty: {
    flex: 1,
  },
  cardContent: {
    paddingVertical: 8,
  },
  cardContentEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 220,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  dayDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  dayDividerText: {
    fontSize: 13,
    fontWeight: "700",
    marginRight: 12,
  },
  dayDividerLine: {
    height: 1,
    flex: 1,
    borderRadius: 1,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  time: {
    fontSize: 13,
    fontWeight: "500",
  },
  user: {
    fontSize: 12,
    marginTop: 2,
  },
  locationNote: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  qty: {
    fontSize: 14,
    fontWeight: "600",
    width: 48,
    textAlign: "right",
  },
  total: {
    fontSize: 14,
    fontWeight: "600",
    width: 64,
    textAlign: "right",
  },
});
