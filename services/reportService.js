import { Platform } from "react-native";
import config from "../config";
import AuditService from "./auditService";
import OrderService from "./orderService";
import MaterialUsageService from "./materialUsageService";
import InventoryService from "./inventoryService";

const API_URL = config.API_URL;

function getWeekStart(d) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const daysToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - daysToMonday);
  return date;
}

function bucketKeyForDate(date, groupBy) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "unknown";
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return getWeekStart(d).toISOString();
}

function formatBucketLabel(key, groupBy) {
  if (key === "unknown") return "—";
  const d = new Date(key);
  if (Number.isNaN(d.getTime())) return key;
  if (groupBy === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

async function fetchSummaryFromApi(baseUrl, from, to, groupBy) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("groupBy", groupBy === "month" ? "month" : "week");
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
  const trunc = groupBy === "month" ? "month" : "week";
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
  for (const item of items || []) {
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
      const q = parseInt(line.quantity, 10) || 0;
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
    b.materialUsageGallons += parseFloat(row.qty_gallons) || 0;
    b.materialUsageCount += 1;
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
      return acc;
    },
    {
      checkoutGallons: 0,
      receivingGallons: 0,
      orderQuantity: 0,
      orderValue: 0,
      materialUsageGallons: 0,
      materialUsageCount: 0,
    },
  );

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
    totals,
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
  async getSummary({ from, to, groupBy = "week" } = {}) {
    const fromDate =
      from || new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    const gb = groupBy === "month" ? "month" : "week";

    let lastErr;
    for (const base of alternateApiBases()) {
      try {
        const data = await fetchSummaryFromApi(base, fromDate, toDate, gb);
        return data;
      } catch (e) {
        lastErr = e;
        console.warn(`Reports API failed (${base}):`, e?.message || e);
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
