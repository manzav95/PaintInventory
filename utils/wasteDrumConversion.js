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
