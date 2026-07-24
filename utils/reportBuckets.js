/**
 * Calendar-safe bucket keys for reports.
 * Business calendar is America/Los_Angeles so week/day boundaries match shop hours.
 * placed_at / entry_date stored as YYYY-MM-DD are parsed as calendar dates (no TZ shift).
 */
export const CUSTOM_COLORS_EARLIEST = "2026-01-01";
export const REPORT_TIMEZONE = "America/Los_Angeles";

/** Today as YYYY-MM-DD in report timezone (Pacific). */
export function todayReportIso(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Year/lifetime always start at app tracking epoch; week/month respect picker (clamped). */
export function resolveCustomColorsRange(fromDate, toDate, groupBy) {
  const today = todayReportIso();
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

/**
 * Calendar YYYY-MM-DD parts.
 * Plain dates stay as written; timestamps use Pacific wall-clock date.
 */
export function calendarDateParts(d) {
  if (d == null || d === "") return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && (s.length === 10 || s[10] === "T" || s[10] === " ")) {
    // For full timestamps, prefer Pacific wall date over the leading YMD (which may be UTC).
    if (s.length > 10 && /[T\s]\d{2}:/.test(s)) {
      const iso = todayReportIso(new Date(s));
      const [y, mo, day] = iso.split("-").map(Number);
      return { year: y, month: mo, day };
    }
    return { year: +m[1], month: +m[2], day: +m[3] };
  }
  const dt = d instanceof Date ? d : new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  // Postgres DATE values often arrive as UTC midnight — keep that calendar day.
  if (
    dt.getUTCHours() === 0 &&
    dt.getUTCMinutes() === 0 &&
    dt.getUTCSeconds() === 0 &&
    dt.getUTCMilliseconds() === 0
  ) {
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    };
  }
  const iso = todayReportIso(dt);
  const [y, mo, day] = iso.split("-").map(Number);
  return { year: y, month: mo, day };
}

/** Monday (ISO week start) as YYYY-MM-DD for the calendar date of `d`. */
export function weekMondayKey(d) {
  const parts = calendarDateParts(d);
  if (!parts) return "unknown";
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const dow = utc.getUTCDay(); // 0=Sun … 6=Sat
  utc.setUTCDate(utc.getUTCDate() - ((dow + 6) % 7));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function bucketKeyForCalendarDate(d, groupBy) {
  const parts = calendarDateParts(d);
  if (!parts) return "unknown";
  if (groupBy === "lifetime") return "lifetime";
  if (groupBy === "year") return String(parts.year);
  if (groupBy === "month") {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  }
  if (groupBy === "day") {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    return weekMondayKey(d);
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

/** Inclusive calendar compare for YYYY-MM-DD (or timestamp → Pacific date). */
export function calendarDateInRange(isoOrDate, from, to) {
  const parts = calendarDateParts(isoOrDate);
  if (!parts) return false;
  const key = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const f = String(from || "").slice(0, 10);
  const t = String(to || "").slice(0, 10);
  if (f && key < f) return false;
  if (t && key > t) return false;
  return true;
}
