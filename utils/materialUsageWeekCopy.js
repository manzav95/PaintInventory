/**
 * Booth-specific weekly material usage grids for Excel paste (TSV).
 * Rows = Mon–Fri; columns = materials for that booth.
 */

import {
  weekMondayIso,
  formatWeekRangeLabel,
} from "./wasteDrumConversion";

export { weekMondayIso, formatWeekRangeLabel };

function addDaysIso(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, mo, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, day, 12));
  utc.setUTCDate(utc.getUTCDate() + days);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function roundTenths(n) {
  return (Math.round((Number(n) || 0) * 10) / 10).toFixed(1);
}

/** Normalize inventory / usage types into paint|clear|primer|stain|dye. */
export function normalizeUsageBucket(type) {
  const t = String(type || "")
    .toLowerCase()
    .trim();
  if (t === "paint" || t === "custom_paint" || t === "precat") return "paint";
  if (t === "clear") return "clear";
  if (t === "primer") return "primer";
  if (t === "stain" || t === "custom_stain") return "stain";
  if (t === "dye") return "dye";
  return "";
}

/**
 * Column order for weekly Excel copy by booth.
 * Booth 2: Paint, Clear, Primer, Dye
 * Booth 1&3: Paint, Clear, Primer, Stain
 * Booth 4: Paint, Clear, Primer, Dye, Stain
 */
export function boothUsageColumns(booth) {
  const b = String(booth || "").trim();
  if (b === "Booth 2") return ["paint", "clear", "primer", "dye"];
  if (b === "Booth 4") return ["paint", "clear", "primer", "dye", "stain"];
  // Booth 1&3 (default for 1/3)
  return ["paint", "clear", "primer", "stain"];
}

export function emptyBoothDayTotals(columns) {
  const out = {};
  for (const c of columns) out[c] = 0;
  return out;
}

/**
 * @param {Array} recordsInWeek
 * @param {string} weekMonday
 * @param {string} booth
 * @param {(row: object) => string} resolveType - returns material type for row
 * @param {(row: object) => string} resolveDate - returns YYYY-MM-DD for row
 */
export function formatBoothWeekUsageForExcel(
  recordsInWeek,
  weekMonday,
  booth,
  resolveType,
  resolveDate,
) {
  const columns = boothUsageColumns(booth);
  const byDay = {};
  for (const row of recordsInWeek || []) {
    const key = resolveDate?.(row) || "";
    if (!key) continue;
    if (!byDay[key]) byDay[key] = emptyBoothDayTotals(columns);
    const bucket = normalizeUsageBucket(resolveType?.(row));
    if (!bucket || !(bucket in byDay[key])) continue;
    byDay[key][bucket] += Number(row.qty_gallons) || 0;
  }
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    const day = addDaysIso(weekMonday, i);
    const t = byDay[day] || emptyBoothDayTotals(columns);
    lines.push(columns.map((c) => roundTenths(t[c])).join("\t"));
  }
  return lines.join("\n");
}

export function boothWeekCopyHint(booth) {
  const cols = boothUsageColumns(booth);
  const labels = cols.map(
    (c) => c.charAt(0).toUpperCase() + c.slice(1),
  );
  return `${labels.length} columns × 5 rows (Mon–Fri): ${labels.join(", ")}`;
}

/** Group usage rows into Monday-start weeks (newest first). */
export function bundleUsageByWeek(records, resolveDate) {
  const map = new Map();
  for (const row of records || []) {
    const dateKey = resolveDate?.(row) || "";
    const monday = weekMondayIso(dateKey);
    if (!monday) continue;
    if (!map.has(monday)) map.set(monday, []);
    map.get(monday).push(row);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([monday, rows]) => ({
      monday,
      friday: addDaysIso(monday, 4),
      label: formatWeekRangeLabel(monday),
      rows,
    }));
}
