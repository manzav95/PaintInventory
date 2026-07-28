/**
 * 5-gallon bucket stick measure → gallons.
 *
 * Standard tapered industrial pail (~10.3–11.9" diameter, ~14–14.5" tall).
 * Effective mid-height diameter ≈ 10.6" → π r² / 231 ≈ 0.37 gal/inch.
 * Also ≈ 5 gal / ~13.5" fill height to the marked capacity.
 */
export const GALLONS_PER_INCH = 0.37;

export const WASTE_MATERIALS = [
  { key: "paint", label: "Paint" },
  { key: "clear_toner", label: "Clear" },
  { key: "primer", label: "Primer" },
  { key: "acetone", label: "Acetone" },
];

/** Round gallons to tenths (1 decimal) for display / storage. */
export function roundGallonsTenths(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

/** Format gallons to tenths place (e.g. "1.5"). */
export function formatGallonsTenths(n) {
  return roundGallonsTenths(n).toFixed(1);
}

/** Round gallons to tenths for display / Excel paste. */
export function inchesToGallons(inches) {
  const n = parseFloat(String(inches ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundGallonsTenths(n * GALLONS_PER_INCH);
}

/** Whole-inch conversion chart rows for UI reference (bucket fill height). */
export function buildConversionChart(maxInches = 15) {
  const rows = [];
  for (let i = 1; i <= maxInches; i += 1) {
    rows.push({ inches: i, gallons: inchesToGallons(i) });
  }
  return rows;
}

/**
 * Tab-separated gallon values for pasting into 4 Excel cells in a row.
 * Order: paint, clear, primer, acetone
 */
export function formatGallonsForExcelPaste({
  paint,
  clear_toner,
  primer,
  acetone,
}) {
  const cells = [
    inchesToGallons(paint),
    inchesToGallons(clear_toner),
    inchesToGallons(primer),
    inchesToGallons(acetone),
  ].map((g) => formatGallonsTenths(g));
  return cells.join("\t");
}

/** Copy stored gallon fields from a waste record (same Excel column order). */
export function formatRecordGallonsForExcel(row) {
  const cells = [
    row?.paint_gallons,
    row?.clear_toner_gallons,
    row?.primer_gallons,
    row?.acetone_gallons,
  ].map((g) => formatGallonsTenths(g));
  return cells.join("\t");
}

/** Calendar date YYYY-MM-DD in America/Los_Angeles (Pacific). */
export function todayPacificIso(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Display dates as month/day/year (e.g. 07/22/2026).
 * Accepts YYYY-MM-DD or other parseable date strings.
 */
export function formatMonthDayYear(dateStr) {
  const raw = String(dateStr ?? "").trim();
  if (!raw) return "—";
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (ymd) {
    d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00`);
  } else {
    d = new Date(raw);
  }
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

/** YYYY-MM-DD from a waste row entry_date. */
export function wasteEntryDateKey(rowOrDate) {
  if (rowOrDate && typeof rowOrDate === "object") {
    return wasteEntryDateKey(rowOrDate.entry_date);
  }
  const raw = String(rowOrDate ?? "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return todayPacificIso(d);
}

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Monday · 07/21/2026" */
export function formatWeekdayBeforeDate(dateStr) {
  const key = wasteEntryDateKey(dateStr);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return formatMonthDayYear(dateStr);
  }
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return formatMonthDayYear(dateStr);
  const weekday = WEEKDAY_LONG[d.getDay()] || "";
  return `${weekday} · ${formatMonthDayYear(key)}`;
}

/** Monday YYYY-MM-DD for the calendar week containing dateStr (ISO week). */
export function weekMondayIso(dateStr) {
  const key = wasteEntryDateKey(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const [y, mo, day] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, day, 12));
  const dow = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - ((dow + 6) % 7));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function addDaysIso(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, mo, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, day, 12));
  utc.setUTCDate(utc.getUTCDate() + days);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function emptyWasteTotals() {
  return {
    paint: 0,
    clear_toner: 0,
    primer: 0,
    acetone: 0,
    total: 0,
  };
}

export function materialGallonsFromRow(row) {
  return {
    paint: roundGallonsTenths(row?.paint_gallons),
    clear_toner: roundGallonsTenths(row?.clear_toner_gallons),
    primer: roundGallonsTenths(row?.primer_gallons),
    acetone: roundGallonsTenths(row?.acetone_gallons),
  };
}

export function addWasteTotals(a, b) {
  const out = emptyWasteTotals();
  out.paint = roundGallonsTenths((a?.paint || 0) + (b?.paint || 0));
  out.clear_toner = roundGallonsTenths(
    (a?.clear_toner || 0) + (b?.clear_toner || 0),
  );
  out.primer = roundGallonsTenths((a?.primer || 0) + (b?.primer || 0));
  out.acetone = roundGallonsTenths((a?.acetone || 0) + (b?.acetone || 0));
  out.total = roundGallonsTenths(
    out.paint + out.clear_toner + out.primer + out.acetone,
  );
  return out;
}

export function sumWasteRecords(records) {
  return (records || []).reduce((acc, row) => {
    const m = materialGallonsFromRow(row);
    m.total = roundGallonsTenths(
      m.paint + m.clear_toner + m.primer + m.acetone,
    );
    return addWasteTotals(acc, m);
  }, emptyWasteTotals());
}

function formatShortMonthDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatWeekRangeLabel(mondayIso) {
  if (!mondayIso) return "Week";
  const friday = addDaysIso(mondayIso, 4);
  const sunday = addDaysIso(mondayIso, 6);
  const y = mondayIso.slice(0, 4);
  return `Week of ${formatShortMonthDay(mondayIso)} – ${formatShortMonthDay(friday)} (${y})`;
}

/**
 * Mon–Fri × Paint/Clear/Primer/Acetone as TSV (4 columns × 5 rows).
 * Multiple entries on the same day are summed. Empty days are 0.0.
 */
export function formatWeekGallonsGridForExcel(recordsInWeek, weekMondayIso) {
  const byDay = {};
  for (const row of recordsInWeek || []) {
    const key = wasteEntryDateKey(row);
    if (!key) continue;
    const prev = byDay[key] || emptyWasteTotals();
    const m = materialGallonsFromRow(row);
    byDay[key] = addWasteTotals(prev, m);
  }
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    const day = addDaysIso(weekMondayIso, i);
    const t = byDay[day] || emptyWasteTotals();
    lines.push(
      [
        formatGallonsTenths(t.paint),
        formatGallonsTenths(t.clear_toner),
        formatGallonsTenths(t.primer),
        formatGallonsTenths(t.acetone),
      ].join("\t"),
    );
  }
  return lines.join("\n");
}

/** Group records into Monday-start weeks (newest first). */
export function bundleWasteByWeek(records) {
  const map = new Map();
  for (const row of records || []) {
    const monday = weekMondayIso(row.entry_date);
    if (!monday) continue;
    if (!map.has(monday)) map.set(monday, []);
    map.get(monday).push(row);
  }
  const weeks = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([monday, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        const da = wasteEntryDateKey(a);
        const db = wasteEntryDateKey(b);
        if (da !== db) return da < db ? -1 : 1;
        return Number(b.id) - Number(a.id);
      });
      return {
        monday,
        friday: addDaysIso(monday, 4),
        sunday: addDaysIso(monday, 6),
        label: formatWeekRangeLabel(monday),
        rows: sorted,
        totals: sumWasteRecords(sorted),
      };
    });
  return weeks;
}

export function monthKeyFromDate(dateStr) {
  const key = wasteEntryDateKey(dateStr);
  return key && key.length >= 7 ? key.slice(0, 7) : "";
}

export function formatMonthLabel(yyyyMm) {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm || "—";
  const d = new Date(`${yyyyMm}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMm;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** YTD / this month / this week / previous period totals + month list. */
export function computeWasteSummary(records, todayIso = todayPacificIso()) {
  const today = wasteEntryDateKey(todayIso) || todayPacificIso();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const thisMonday = weekMondayIso(today);
  const prevMonday = addDaysIso(thisMonday, -7);
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  })();

  const ytd = [];
  const thisMonthRows = [];
  const prevMonthRows = [];
  const thisWeekRows = [];
  const prevWeekRows = [];
  const byMonth = new Map();

  for (const row of records || []) {
    const key = wasteEntryDateKey(row);
    if (!key) continue;
    if (key.slice(0, 4) === year) {
      ytd.push(row);
      const mk = key.slice(0, 7);
      if (!byMonth.has(mk)) byMonth.set(mk, []);
      byMonth.get(mk).push(row);
    }
    if (key.slice(0, 7) === month) thisMonthRows.push(row);
    if (key.slice(0, 7) === prevMonth) prevMonthRows.push(row);
    const wk = weekMondayIso(key);
    if (wk === thisMonday) thisWeekRows.push(row);
    if (wk === prevMonday) prevWeekRows.push(row);
  }

  const months = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, rows]) => ({
      key,
      label: formatMonthLabel(key),
      totals: sumWasteRecords(rows),
    }));

  return {
    today,
    thisMonday,
    prevMonday,
    month,
    prevMonth,
    ytd: sumWasteRecords(ytd),
    thisMonth: sumWasteRecords(thisMonthRows),
    prevMonthTotals: sumWasteRecords(prevMonthRows),
    thisWeek: sumWasteRecords(thisWeekRows),
    prevWeek: sumWasteRecords(prevWeekRows),
    months,
  };
}

const MATERIAL_ALERT_LABEL = {
  paint: "Paint",
  clear_toner: "Clear",
  primer: "Primer",
  acetone: "Acetone",
  total: "Total",
};

/**
 * Flag materials that jumped vs the prior period.
 * Triggers when: ≥50% higher and +0.8 gal, or (weeks only) prior ~0 and now ≥2.0 gal.
 */
export function detectWasteAnomalies(current, previous, periodLabel) {
  const alerts = [];
  const keys = ["paint", "clear_toner", "primer", "acetone", "total"];
  const allowZeroBaseline = periodLabel === "last week";
  for (const key of keys) {
    const cur = roundGallonsTenths(current?.[key] || 0);
    const prev = roundGallonsTenths(previous?.[key] || 0);
    if (cur <= 0) continue;
    let hit = false;
    let detail = "";
    if (allowZeroBaseline && prev <= 0.05 && cur >= 2.0) {
      hit = true;
      detail = `${formatGallonsTenths(cur)} gal (none prior)`;
    } else if (prev > 0.05) {
      const ratio = cur / prev;
      const delta = roundGallonsTenths(cur - prev);
      if (ratio >= 1.5 && delta >= 0.8) {
        hit = true;
        const pct = Math.round((ratio - 1) * 100);
        detail = `${formatGallonsTenths(prev)} → ${formatGallonsTenths(cur)} gal (+${pct}%, +${formatGallonsTenths(delta)})`;
      }
    }
    if (hit) {
      alerts.push({
        id: `${periodLabel}-${key}`,
        material: key,
        period: periodLabel,
        message: `${MATERIAL_ALERT_LABEL[key]} waste high vs ${periodLabel}: ${detail}`,
      });
    }
  }
  return alerts;
}

export function buildWasteAlerts(summary) {
  if (!summary) return [];
  const week = detectWasteAnomalies(
    summary.thisWeek,
    summary.prevWeek,
    "last week",
  );
  const month = detectWasteAnomalies(
    summary.thisMonth,
    summary.prevMonthTotals,
    "last month",
  );
  // Prefer material-specific alerts over duplicate "total" when both fire
  const merged = [...week, ...month];
  const materialHits = new Set(
    merged.filter((a) => a.material !== "total").map((a) => a.id),
  );
  return merged.filter((a) => {
    if (a.material !== "total") return true;
    const prefix = a.id.replace(/-total$/, "");
    return ![...materialHits].some((id) => id.startsWith(prefix));
  });
}

export function formatTotalsBreakdown(totals) {
  const t = totals || emptyWasteTotals();
  return `Paint ${formatGallonsTenths(t.paint)} · Clear ${formatGallonsTenths(t.clear_toner)} · Primer ${formatGallonsTenths(t.primer)} · Acetone ${formatGallonsTenths(t.acetone)}`;
}
