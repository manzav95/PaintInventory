import { Platform } from "react-native";
import config from "../config";
import AuditService from "./auditService";
import OrderService from "./orderService";
import MaterialUsageService from "./materialUsageService";
import InventoryService from "./inventoryService";
import {
  bucketKeyForCalendarDate,
  calendarDateParts,
  formatYearMonthBucketLabel,
  resolveCustomColorsRange,
} from "../utils/reportBuckets";

const API_URL = config.API_URL;

function getWeekStart(d) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const daysToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - daysToMonday);
  return date;
}

function normalizeGroupBy(groupBy) {
  if (groupBy === "month") return "month";
  if (groupBy === "day") return "day";
  if (groupBy === "year") return "year";
  if (groupBy === "lifetime") return "lifetime";
  return "week";
}

function normalizeTimelineGroupBy(groupBy) {
  if (groupBy === "year" || groupBy === "lifetime") {
    return normalizeCustomColorsGroupBy(groupBy);
  }
  return normalizeGroupBy(groupBy);
}

/** Custom colors report supports week, month, year, and lifetime buckets. */
function normalizeCustomColorsGroupBy(groupBy) {
  if (groupBy === "month") return "month";
  if (groupBy === "year") return "year";
  if (groupBy === "lifetime") return "lifetime";
  return "week";
}

function bucketKeyForDate(date, groupBy) {
  const gb =
    groupBy === "lifetime" || groupBy === "year" || groupBy === "month"
      ? groupBy
      : normalizeGroupBy(groupBy);
  const calKey = bucketKeyForCalendarDate(date, gb);
  if (calKey) return calKey;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "unknown";
  if (gb === "day") {
    const parts = calendarDateParts(date);
    if (parts) {
      return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return getWeekStart(d).toISOString();
}

function parseBucketDate(key, groupBy) {
  const gb =
    groupBy === "lifetime" || groupBy === "year"
      ? groupBy
      : normalizeGroupBy(groupBy);
  const s = String(key);
  if (gb === "lifetime") return new Date(`${new Date().getFullYear()}-01-01T12:00:00`);
  if (gb === "year" && /^\d{4}$/.test(s)) {
    return new Date(`${s}-01-01T12:00:00`);
  }
  if (gb === "day" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  if (gb === "month" && /^\d{4}-\d{2}$/.test(s)) {
    return new Date(`${s}-01T12:00:00`);
  }
  return new Date(key);
}

function formatBucketLabel(key, groupBy) {
  if (key === "unknown") return "—";
  const ymLabel = formatYearMonthBucketLabel(key, groupBy);
  if (ymLabel) return ymLabel;
  const gb = groupBy === "year" ? "year" : normalizeGroupBy(groupBy);
  const d = parseBucketDate(key, gb);
  if (Number.isNaN(d.getTime())) return String(key);
  if (gb === "day") {
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function inDateRange(isoOrDate, from, to) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return false;
  const t = d.getTime();
  const f = new Date(`${from}T00:00:00`).getTime();
  const te = new Date(`${to}T23:59:59`).getTime();
  return t >= f && t <= te;
}

function emptyUsageByType() {
  return { paint: 0, primer: 0, clear: 0, stain: 0 };
}

function normalizeUsageType(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (t === "custom_paint" || t === "precat") return "paint";
  if (t === "custom_stain") return "stain";
  if (["paint", "primer", "clear", "stain"].includes(t)) return t;
  return null;
}

function resolveUsageMaterialType(row, itemById) {
  const stored = normalizeUsageType(row.material_type);
  if (stored) return stored;
  const itemId = String(row.item_id || row.itemId || "");
  const item = itemById[itemId];
  return normalizeUsageType(item?.type);
}

function addUsageByType(target, type, gallons) {
  if (!type || !Number.isFinite(gallons) || gallons <= 0) return;
  target[type] = (target[type] || 0) + gallons;
}

/** Every period from from→to, including the current incomplete month/week/day. */
function enumerateBucketKeys(from, to, groupBy) {
  if (groupBy === "lifetime") return ["lifetime"];
  const gb = groupBy === "year" ? "year" : normalizeGroupBy(groupBy);
  const keys = [];
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys;

  if (gb === "year") {
    let y = start.getFullYear();
    const endY = end.getFullYear();
    while (y <= endY) {
      keys.push(String(y));
      y += 1;
    }
    return keys;
  }

  if (gb === "day") {
    const cur = new Date(start);
    while (cur <= end) {
      keys.push(bucketKeyForDate(cur, gb));
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }

  if (gb === "month") {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);
    while (cur <= endMonth) {
      keys.push(bucketKeyForDate(cur, gb));
      cur.setMonth(cur.getMonth() + 1);
    }
    return keys;
  }

  let cur = getWeekStart(start);
  const endWeek = getWeekStart(end);
  while (cur <= endWeek) {
    keys.push(bucketKeyForDate(cur, gb));
    const next = new Date(cur);
    next.setDate(next.getDate() + 7);
    cur = next;
  }
  return keys;
}

function roundUsageByType(obj) {
  const out = emptyUsageByType();
  for (const k of Object.keys(out)) {
    out[k] = Math.round((obj[k] || 0) * 10) / 10;
  }
  return out;
}

function aggregateCustomColorLines(lines, trunc, from, to) {
  const byJobMap = new Map();
  const byColorMap = new Map();
  const bucketMap = new Map();
  let totalQuantity = 0;
  let lineCount = 0;

  const ensureJob = (jobName) => {
    const key = jobName || "(No job)";
    if (!byJobMap.has(key)) {
      byJobMap.set(key, {
        jobName: key,
        totalQuantity: 0,
        colors: new Map(),
      });
    }
    return byJobMap.get(key);
  };

  const ensureColor = (itemId, itemName, itemType) => {
    const id = String(itemId);
    if (!byColorMap.has(id)) {
      byColorMap.set(id, {
        itemId: id,
        itemName: itemName || id,
        type: itemType || "custom_paint",
        totalQuantity: 0,
        jobs: new Map(),
      });
    }
    return byColorMap.get(id);
  };

  const ensureBucketKey = (key) => {
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        label: formatBucketLabel(key, trunc),
        totalQuantity: 0,
        colors: new Map(),
        jobs: new Map(),
      });
    }
    return bucketMap.get(key);
  };

  const ensureBucket = (placedAt) => {
    if (trunc === "lifetime") return ensureBucketKey("lifetime");
    return ensureBucketKey(bucketKeyForDate(placedAt, trunc));
  };

  for (const row of lines) {
    const qty = Math.round(parseFloat(row.quantity) * 2) / 2 || 0;
    if (qty <= 0) continue;
    lineCount += 1;
    totalQuantity += qty;

    const itemId = String(row.itemId);
    const itemName = row.itemName || itemId;
    const itemType = (row.itemType || "custom_paint").toLowerCase();
    const jobName =
      row.jobName != null && String(row.jobName).trim() !== ""
        ? String(row.jobName).trim()
        : "(No job)";

    const job = ensureJob(jobName);
    job.totalQuantity += qty;
    const jobColor = job.colors.get(itemId) || {
      itemId,
      itemName,
      type: itemType,
      quantity: 0,
    };
    jobColor.quantity += qty;
    job.colors.set(itemId, jobColor);

    const color = ensureColor(itemId, itemName, itemType);
    color.totalQuantity += qty;
    color.jobs.set(jobName, (color.jobs.get(jobName) || 0) + qty);

    const bucket = ensureBucket(row.placedAt);
    bucket.totalQuantity += qty;
    bucket.colors.set(itemId, (bucket.colors.get(itemId) || 0) + qty);
    bucket.jobs.set(jobName, (bucket.jobs.get(jobName) || 0) + qty);
  }

  const byJob = [...byJobMap.values()]
    .map((j) => ({
      jobName: j.jobName,
      totalQuantity: j.totalQuantity,
      colors: [...j.colors.values()].sort((a, b) =>
        String(a.itemName).localeCompare(String(b.itemName)),
      ),
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  const byColor = [...byColorMap.values()]
    .map((c) => ({
      itemId: c.itemId,
      itemName: c.itemName,
      type: c.type,
      totalQuantity: c.totalQuantity,
      jobs: [...c.jobs.entries()]
        .map(([jobName, quantity]) => ({ jobName, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  if (from && to) {
    for (const key of enumerateBucketKeys(from, to, trunc)) {
      ensureBucketKey(key);
    }
  }

  const sortedBuckets = [...bucketMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const bucketDetails = sortedBuckets.map((b) => ({
    label: b.label,
    totalQuantity: b.totalQuantity,
    colors: [...b.colors.entries()]
      .map(([itemId, quantity]) => {
        const c = byColorMap.get(itemId);
        return {
          itemId,
          itemName: c?.itemName || itemId,
          quantity,
        };
      })
      .sort((a, b) => b.quantity - a.quantity),
    jobs: [...b.jobs.entries()]
      .map(([jobName, quantity]) => ({ jobName, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
  }));

  return {
    totals: {
      totalQuantity,
      lineCount,
      colorCount: byColorMap.size,
      jobCount: byJobMap.size,
    },
    byJob,
    byColor,
    buckets: sortedBuckets.map((b) => b.label),
    bucketTotals: sortedBuckets.map((b) => b.totalQuantity),
    bucketDetails,
  };
}

async function buildClientCustomColorsReport(from, to, groupBy) {
  const trunc = normalizeCustomColorsGroupBy(groupBy);
  const [orders, items] = await Promise.all([
    OrderService.getOrders(500),
    InventoryService.getAllItems().catch(() => []),
  ]);

  const customTypes = new Set(["custom_paint", "custom_stain"]);
  const itemById = {};
  for (const item of items || []) {
    if (item?.id != null) itemById[String(item.id)] = item;
  }

  const lines = [];
  for (const order of orders || []) {
    const placed = order.placed_at || order.placedAt;
    if (!inDateRange(placed, from, to)) continue;
    for (const line of order.lines || []) {
      const itemId = String(line.itemId || line.item_id || "");
      const inv = itemById[itemId];
      const type = (inv?.type || "").toLowerCase();
      if (!customTypes.has(type)) continue;
      lines.push({
        placedAt: placed,
        itemId,
        itemName: inv?.name || itemId,
        itemType: type,
        quantity: line.quantity,
        jobName: line.job_name ?? line.jobName ?? "",
      });
    }
  }

  const agg = aggregateCustomColorLines(lines, trunc, from, to);
  return {
    from,
    to,
    groupBy: trunc,
    ...agg,
    source: "client",
  };
}

async function fetchCustomColorsFromApi(baseUrl, from, to, groupBy) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("groupBy", normalizeCustomColorsGroupBy(groupBy));
  const url = `${baseUrl.replace(/\/$/, "")}/api/reports/custom-colors?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    throw new Error("Custom colors report API not available on this server.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid response from custom colors report API.");
  }
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function fetchSummaryFromApi(baseUrl, from, to, groupBy) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("groupBy", normalizeGroupBy(groupBy));
  const url = `${baseUrl.replace(/\/$/, "")}/api/reports/summary?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    throw new Error("Reports API not available on this server (redeploy backend or use local server).");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid response from reports API.");
  }
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function buildClientSummary(from, to, groupBy) {
  const trunc = normalizeGroupBy(groupBy);
  const bucketMap = new Map();

  const ensureBucket = (key) => {
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        label: formatBucketLabel(key, trunc),
        checkoutGallons: 0,
        receivingGallons: 0,
        orderQuantity: 0,
        orderValue: 0,
        materialUsageGallons: 0,
        materialUsageCount: 0,
        materialUsageByType: emptyUsageByType(),
      });
    }
    return bucketMap.get(key);
  };

  const [auditLogs, orders, usageRows, items] = await Promise.all([
    AuditService.list(2000),
    OrderService.getOrders(500),
    MaterialUsageService.list(null, 2000, { from, to }),
    InventoryService.getAllItems().catch(() => []),
  ]);

  const priceById = {};
  const itemById = {};
  for (const item of items || []) {
    if (item?.id != null) itemById[String(item.id)] = item;
    const p = item.price != null ? Number(item.price) : 0;
    if (item.id != null && !Number.isNaN(p)) priceById[String(item.id)] = p;
  }

  for (const row of auditLogs || []) {
    const ts = row.timestamp;
    if (!inDateRange(ts, from, to)) continue;
    const key = bucketKeyForDate(ts, trunc);
    const b = ensureBucket(key);
    let details = row.details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details || "{}");
      } catch {
        details = {};
      }
    }
    const qty = Math.abs(parseFloat(details?.quantityChange) || 0);
    const action = row.action;
    const actionType = details?._actionType;
    const isCheckout =
      action === "check_out" ||
      (action === "update" && actionType === "check_out");
    const isReceiving =
      action === "receiving" ||
      (action === "update" && actionType === "receiving");
    if (isCheckout) b.checkoutGallons += qty;
    if (isReceiving) b.receivingGallons += qty;
  }

  for (const order of orders || []) {
    const placed = order.placed_at || order.placedAt;
    if (!inDateRange(placed, from, to)) continue;
    const key = bucketKeyForDate(placed, trunc);
    const b = ensureBucket(key);
    for (const line of order.lines || []) {
      const q = Math.round(parseFloat(line.quantity) * 2) / 2 || 0;
      const itemId = String(line.itemId || line.item_id || "");
      b.orderQuantity += q;
      b.orderValue += q * (priceById[itemId] || 0);
    }
  }

  for (const row of usageRows || []) {
    const ed = row.entry_date;
    if (!inDateRange(ed, from, to)) continue;
    const key = bucketKeyForDate(`${ed}T12:00:00`, trunc);
    const b = ensureBucket(key);
    const gal = parseFloat(row.qty_gallons) || 0;
    b.materialUsageGallons += gal;
    b.materialUsageCount += 1;
    const matType = resolveUsageMaterialType(row, itemById);
    addUsageByType(b.materialUsageByType, matType, gal);
  }

  for (const key of enumerateBucketKeys(from, to, trunc)) {
    ensureBucket(key);
  }

  const sorted = [...bucketMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const totals = sorted.reduce(
    (acc, b) => {
      acc.checkoutGallons += b.checkoutGallons;
      acc.receivingGallons += b.receivingGallons;
      acc.orderQuantity += b.orderQuantity;
      acc.orderValue += b.orderValue;
      acc.materialUsageGallons += b.materialUsageGallons;
      acc.materialUsageCount += b.materialUsageCount;
      for (const k of Object.keys(acc.materialUsageByType)) {
        acc.materialUsageByType[k] += b.materialUsageByType[k] || 0;
      }
      return acc;
    },
    {
      checkoutGallons: 0,
      receivingGallons: 0,
      orderQuantity: 0,
      orderValue: 0,
      materialUsageGallons: 0,
      materialUsageCount: 0,
      materialUsageByType: emptyUsageByType(),
    },
  );
  totals.materialUsageByType = roundUsageByType(totals.materialUsageByType);

  const bucketDetails = sorted.map((b) => ({
    label: b.label,
    checkoutGallons: Math.round(b.checkoutGallons * 10) / 10,
    receivingGallons: Math.round(b.receivingGallons * 10) / 10,
    orderQuantity: Math.round(b.orderQuantity),
    orderValue: Math.round(b.orderValue * 100) / 100,
    materialUsageGallons: Math.round(b.materialUsageGallons * 10) / 10,
    materialUsageCount: b.materialUsageCount,
    materialUsageByType: roundUsageByType(b.materialUsageByType),
  }));

  return {
    from,
    to,
    groupBy: trunc,
    buckets: sorted.map((b) => b.label),
    checkoutGallons: sorted.map((b) => Math.round(b.checkoutGallons * 10) / 10),
    receivingGallons: sorted.map((b) => Math.round(b.receivingGallons * 10) / 10),
    orderQuantity: sorted.map((b) => Math.round(b.orderQuantity)),
    orderValue: sorted.map((b) => Math.round(b.orderValue * 100) / 100),
    materialUsageGallons: sorted.map(
      (b) => Math.round(b.materialUsageGallons * 10) / 10,
    ),
    materialUsageCount: sorted.map((b) => b.materialUsageCount),
    bucketDetails,
    totals,
    source: "client",
  };
}

async function buildItemActivityReport(from, to) {
  const [auditLogs, orders, usageRows, items] = await Promise.all([
    AuditService.list(2000),
    OrderService.getOrders(500),
    MaterialUsageService.list(null, 2000, { from, to }),
    InventoryService.getAllItems().catch(() => []),
  ]);

  const priceById = {};
  const stats = new Map();

  const ensure = (itemId) => {
    const id = String(itemId || "").trim();
    if (!id) return null;
    if (!stats.has(id)) {
      const inv = (items || []).find((i) => String(i.id) === id);
      stats.set(id, {
        itemId: id,
        name: inv?.name || id,
        type: inv?.type || "",
        external_code: inv?.external_code || "",
        checkoutGallons: 0,
        receivingGallons: 0,
        orderQuantity: 0,
        orderValue: 0,
        usageGallons: 0,
      });
    }
    return stats.get(id);
  };

  for (const item of items || []) {
    if (item?.id != null) ensure(String(item.id));
    const p = item.price != null ? Number(item.price) : 0;
    if (item.id != null && !Number.isNaN(p)) priceById[String(item.id)] = p;
  }

  for (const row of auditLogs || []) {
    const ts = row.timestamp;
    if (!inDateRange(ts, from, to)) continue;
    const itemId = String(row.itemId ?? row.item_id ?? "").trim();
    const entry = ensure(itemId);
    if (!entry) continue;
    let details = row.details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details || "{}");
      } catch {
        details = {};
      }
    }
    const qty = Math.abs(parseFloat(details?.quantityChange) || 0);
    const action = row.action;
    const actionType = details?._actionType;
    const isCheckout =
      action === "check_out" ||
      (action === "update" && actionType === "check_out");
    const isReceiving =
      action === "receiving" ||
      (action === "update" && actionType === "receiving");
    if (isCheckout) entry.checkoutGallons += qty;
    if (isReceiving) entry.receivingGallons += qty;
  }

  for (const order of orders || []) {
    const placed = order.placed_at || order.placedAt;
    if (!inDateRange(placed, from, to)) continue;
    for (const line of order.lines || []) {
      const itemId = String(line.itemId || line.item_id || "").trim();
      const entry = ensure(itemId);
      if (!entry) continue;
      const q = Math.round(parseFloat(line.quantity) * 2) / 2 || 0;
      entry.orderQuantity += q;
      entry.orderValue += q * (priceById[itemId] || 0);
    }
  }

  for (const row of usageRows || []) {
    const ed = row.entry_date;
    if (!inDateRange(ed, from, to)) continue;
    const itemId = String(row.item_id ?? row.itemId ?? "").trim();
    const entry = ensure(itemId);
    if (!entry) continue;
    entry.usageGallons += parseFloat(row.qty_gallons) || 0;
  }

  return [...stats.values()]
    .map((row) => ({
      ...row,
      checkoutGallons: Math.round(row.checkoutGallons * 10) / 10,
      receivingGallons: Math.round(row.receivingGallons * 10) / 10,
      orderQuantity: Math.round(row.orderQuantity * 10) / 10,
      orderValue: Math.round(row.orderValue * 100) / 100,
      usageGallons: Math.round(row.usageGallons * 10) / 10,
    }))
    .sort((a, b) =>
      String(a.name || a.itemId).localeCompare(String(b.name || b.itemId)),
    );
}

async function buildItemTimelineReport(itemId, from, to, groupBy) {
  const id = String(itemId || "").trim();
  if (!id) return null;

  const trunc = normalizeTimelineGroupBy(groupBy);
  const range =
    trunc === "year" || trunc === "lifetime"
      ? resolveCustomColorsRange(from, to, trunc)
      : {
          from:
            from ||
            new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10),
          to: to || new Date().toISOString().slice(0, 10),
        };
  const fromDate = range.from;
  const toDate = range.to;

  const bucketMap = new Map();
  const ensureBucketKey = (key) => {
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        label: formatBucketLabel(key, trunc),
        checkoutGallons: 0,
        receivingGallons: 0,
        orderQuantity: 0,
        usageGallons: 0,
      });
    }
    return bucketMap.get(key);
  };

  const ensureBucketForDate = (date) => {
    if (trunc === "lifetime") return ensureBucketKey("lifetime");
    return ensureBucketKey(bucketKeyForDate(date, trunc));
  };

  for (const key of enumerateBucketKeys(fromDate, toDate, trunc)) {
    ensureBucketKey(key);
  }

  const [auditLogs, orders, usageRows, items] = await Promise.all([
    AuditService.list(2000),
    OrderService.getOrders(500),
    MaterialUsageService.list(null, 2000, { from: fromDate, to: toDate }),
    InventoryService.getAllItems().catch(() => []),
  ]);

  const inv = (items || []).find((i) => String(i.id) === id);

  for (const row of auditLogs || []) {
    const rowId = String(row.itemId ?? row.item_id ?? "").trim();
    if (rowId !== id) continue;
    const ts = row.timestamp;
    if (!inDateRange(ts, fromDate, toDate)) continue;
    let details = row.details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details || "{}");
      } catch {
        details = {};
      }
    }
    const qty = Math.abs(parseFloat(details?.quantityChange) || 0);
    const action = row.action;
    const actionType = details?._actionType;
    const isCheckout =
      action === "check_out" ||
      (action === "update" && actionType === "check_out");
    const isReceiving =
      action === "receiving" ||
      (action === "update" && actionType === "receiving");
    const bucket = ensureBucketForDate(ts);
    if (isCheckout) bucket.checkoutGallons += qty;
    if (isReceiving) bucket.receivingGallons += qty;
  }

  for (const order of orders || []) {
    const placed = order.placed_at || order.placedAt;
    if (!inDateRange(placed, fromDate, toDate)) continue;
    for (const line of order.lines || []) {
      const lineId = String(line.itemId || line.item_id || "").trim();
      if (lineId !== id) continue;
      const q = Math.round(parseFloat(line.quantity) * 2) / 2 || 0;
      ensureBucketForDate(placed).orderQuantity += q;
    }
  }

  for (const row of usageRows || []) {
    const rowId = String(row.item_id ?? row.itemId ?? "").trim();
    if (rowId !== id) continue;
    const ed = row.entry_date;
    if (!inDateRange(ed, fromDate, toDate)) continue;
    ensureBucketForDate(ed).usageGallons += parseFloat(row.qty_gallons) || 0;
  }

  const sorted = [...bucketMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const roundGal = (n) => Math.round(n * 10) / 10;
  const checkoutGallons = sorted.map((b) => roundGal(b.checkoutGallons));
  const receivingGallons = sorted.map((b) => roundGal(b.receivingGallons));
  const orderQuantity = sorted.map((b) => roundGal(b.orderQuantity));
  const usageGallons = sorted.map((b) => roundGal(b.usageGallons));

  const sum = (arr) => roundGal(arr.reduce((a, v) => a + v, 0));

  return {
    itemId: id,
    name: inv?.name || id,
    type: inv?.type || "",
    external_code: inv?.external_code || "",
    from: fromDate,
    to: toDate,
    groupBy: trunc,
    buckets: sorted.map((b) => b.label),
    checkoutGallons,
    receivingGallons,
    orderQuantity,
    usageGallons,
    totals: {
      checkoutGallons: sum(checkoutGallons),
      receivingGallons: sum(receivingGallons),
      orderQuantity: sum(orderQuantity),
      usageGallons: sum(usageGallons),
    },
    source: "client",
  };
}

function alternateApiBases() {
  const bases = [API_URL];
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (
      (host === "localhost" || host === "127.0.0.1") &&
      !bases.includes("http://localhost:3000")
    ) {
      bases.push("http://localhost:3000");
    }
    if (
      host.match(/^\d+\.\d+\.\d+\.\d+$/) &&
      !bases.includes(`http://${host}:3000`)
    ) {
      bases.push(`http://${host}:3000`);
    }
  }
  return bases;
}

class ReportService {
  async getCustomColorsOverview({ from, to, groupBy = "week" } = {}) {
    const gb = normalizeCustomColorsGroupBy(groupBy);
    const range = resolveCustomColorsRange(from, to, gb);
    const fromDate = range.from;
    const toDate = range.to;

    let lastErr;
    for (const base of alternateApiBases()) {
      try {
        return await fetchCustomColorsFromApi(base, fromDate, toDate, gb);
      } catch (e) {
        lastErr = e;
        console.warn(`Custom colors API failed (${base}):`, e?.message || e);
      }
    }

    try {
      return await buildClientCustomColorsReport(fromDate, toDate, gb);
    } catch (e) {
      console.error("Custom colors client fallback failed:", e);
      throw lastErr || e;
    }
  }

  async getItemActivity({ from, to } = {}) {
    const fromDate =
      from || new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    return buildItemActivityReport(fromDate, toDate);
  }

  async getItemTimeline({ itemId, from, to, groupBy = "week" } = {}) {
    return buildItemTimelineReport(itemId, from, to, groupBy);
  }

  async getSummary({ from, to, groupBy = "week" } = {}) {
    const gb = normalizeGroupBy(groupBy);
    const range =
      gb === "year" || gb === "lifetime"
        ? resolveCustomColorsRange(from, to, gb)
        : {
            from:
              from ||
              new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10),
            to: to || new Date().toISOString().slice(0, 10),
          };
    const fromDate = range.from;
    const toDate = range.to;

    const useClientOnly = gb === "year" || gb === "lifetime";
    let lastErr;
    if (!useClientOnly) {
      for (const base of alternateApiBases()) {
        try {
          const data = await fetchSummaryFromApi(base, fromDate, toDate, gb);
          return data;
        } catch (e) {
          lastErr = e;
          console.warn(`Reports API failed (${base}):`, e?.message || e);
        }
      }
    }

    try {
      return await buildClientSummary(fromDate, toDate, gb);
    } catch (e) {
      console.error("Reports client fallback failed:", e);
      throw lastErr || e;
    }
  }
}

export default new ReportService();
