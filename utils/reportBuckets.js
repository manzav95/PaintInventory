/**
 * Calendar-safe bucket keys for reports (avoids local TZ shifting year/month).
 * placed_at is stored as YYYY-MM-DD text — parse that directly when possible.
 */
export const CUSTOM_COLORS_EARLIEST = "2026-01-01";

/** Year/lifetime always start at app tracking epoch; week/month respect picker (clamped). */
export function resolveCustomColorsRange(fromDate, toDate, groupBy) {
  const today = new Date().toISOString().slice(0, 10);
  const to = toDate || today;
  if (groupBy === "year" || groupBy === "lifetime") {
    return { from: CUSTOM_COLORS_EARLIEST, to };
  }
  let from = fromDate || CUSTOM_COLORS_EARLIEST;
  if (from < CUSTOM_COLORS_EARLIEST) from = CUSTOM_COLORS_EARLIEST;
  return { from, to };
}

export function clampCustomColorsFrom(fromDate, groupBy) {
  if (groupBy === "year" || groupBy === "lifetime") {
    return CUSTOM_COLORS_EARLIEST;
  }
  const raw = String(fromDate || "").trim();
  if (!raw || raw < CUSTOM_COLORS_EARLIEST) return CUSTOM_COLORS_EARLIEST;
  return raw;
}

export function calendarDateParts(d) {
  if (d == null || d === "") return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return { year: +m[1], month: +m[2], day: +m[3] };
  }
  const dt = d instanceof Date ? d : new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function bucketKeyForCalendarDate(d, groupBy) {
  const parts = calendarDateParts(d);
  if (!parts) return "unknown";
  if (groupBy === "lifetime") return "lifetime";
  if (groupBy === "year") return String(parts.year);
  if (groupBy === "month") {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  }
  return null;
}

export function formatYearMonthBucketLabel(key, groupBy) {
  if (key === "lifetime" || groupBy === "lifetime") return "Lifetime";
  if (groupBy === "year" && /^\d{4}$/.test(String(key))) return String(key);
  if (groupBy === "month" && /^\d{4}-\d{2}$/.test(String(key))) {
    const [y, mo] = String(key).split("-");
    const d = new Date(`${y}-${mo}-01T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
  }
  return null;
}
