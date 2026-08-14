/**
 * Material-usage business day helpers.
 * Swing overnight (after midnight through end of swing) counts as the previous calendar day.
 */

/** Parse entry_time (e.g. "3:25 PM", "15:25", "12:30 AM") to minutes since midnight. */
export function parseMaterialUsageTimeToMinutes(entryTime) {
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

/**
 * Standard: day 6:00–15:25, swing 15:26–2:00 AM (overnight).
 * OT: day 6:00–16:25, swing 16:26–2:30 AM (overnight).
 */
export function getMaterialUsageShift(entryTime, isOvertime) {
  const M = parseMaterialUsageTimeToMinutes(entryTime);
  if (Number.isNaN(M)) return null;
  if (isOvertime) {
    if (M >= 360 && M <= 985) return "day";
    if (M >= 986 || M <= 150) return "swing";
  } else {
    if (M >= 360 && M <= 925) return "day";
    if (M >= 926 || M <= 120) return "swing";
  }
  return null;
}

/**
 * Date key for grouping/stats: swing entries after midnight through ~2am
 * count as the previous calendar day.
 * @param {{ entry_date?: string, entry_time?: string } | null | undefined} row
 * @param {boolean} [isOvertime]
 * @returns {string}
 */
export function getMaterialUsageBusinessDate(row, isOvertime = false) {
  const dateStr = String(row?.entry_date || "").trim();
  if (!dateStr) return dateStr;
  const shift = getMaterialUsageShift(row?.entry_time, isOvertime);
  if (shift !== "swing") return dateStr;
  const M = parseMaterialUsageTimeToMinutes(row?.entry_time);
  if (Number.isNaN(M)) return dateStr;
  const overnightEnd = isOvertime ? 150 : 120;
  if (M > overnightEnd) return dateStr;
  try {
    const d = new Date(`${dateStr}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}

/** Local midnight ms for a YYYY-MM-DD business date (for period range checks). */
export function businessDateToActivityMs(dateKey) {
  const key = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
  const d = new Date(`${key}T00:00:00`);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Activity instant used for dashboard period filters / day paging.
 * Material usage uses business date; other logs use timestamp.
 */
export function getHistoryActivityMs(log, isOvertime = false) {
  if (log?.action === "material_usage" || log?.details?._source === "material_usage") {
    const key = getMaterialUsageBusinessDate(
      {
        entry_date: log?.details?.entry_date,
        entry_time: log?.details?.entry_time,
      },
      isOvertime,
    );
    const ms = businessDateToActivityMs(key);
    if (ms) return ms;
  }
  return log?.timestamp ? new Date(log.timestamp).getTime() : 0;
}

/**
 * Clock time for mixed history lists (checks + usage interleaved).
 * Usage uses the entered date + time; checks use audit timestamp.
 */
export function getHistorySortMs(log, isOvertime = false) {
  if (log?.action === "material_usage" || log?.details?._source === "material_usage") {
    const dateStr = String(log?.details?.entry_date || "").trim();
    const minutes = parseMaterialUsageTimeToMinutes(log?.details?.entry_time);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && Number.isFinite(minutes)) {
      const d = new Date(`${dateStr}T00:00:00`);
      const t = d.getTime();
      if (!Number.isNaN(t)) return t + minutes * 60 * 1000;
    }
  }
  if (log?.timestamp) {
    const t = new Date(log.timestamp).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return getHistoryActivityMs(log, isOvertime);
}

/** Calendar day key for history lists (MU uses business date). */
export function getHistoryDayKey(log, isOvertime = false) {
  if (log?.action === "material_usage" || log?.details?._source === "material_usage") {
    const key = getMaterialUsageBusinessDate(
      {
        entry_date: log?.details?.entry_date,
        entry_time: log?.details?.entry_time,
      },
      isOvertime,
    );
    if (key) return key;
  }
  if (!log?.timestamp) return null;
  const d = new Date(log.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
