/**
 * Catalyst mixing ratios and oz math for material usage.
 *
 * Paint / custom paint (H66): 3.9% → ~5 oz per gallon
 * Clear / primer: 4%
 * Per-item catalyst_percent overrides type defaults when set.
 */

export const CATALYST_PERCENT_PAINT = 3.9;
export const CATALYST_PERCENT_CLEAR = 4;
/** @deprecated Prefer type-specific helpers; kept for older imports. */
export const CATALYST_PERCENT = CATALYST_PERCENT_CLEAR;

const PAINT_TYPES = new Set(["paint", "custom_paint"]);
const CLEAR_TYPES = new Set(["clear", "primer"]);

/** Round to nearest tenth (4.99 → 5.0). */
export function roundTenths(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

/** Display at most one decimal place. */
export function formatTenths(n) {
  const v = roundTenths(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Default catalyst % for a material type (no item override).
 * @returns {number|null} null if type does not use catalyst
 */
export function defaultCatalystPercentForType(materialType) {
  const t = String(materialType || "").toLowerCase();
  if (PAINT_TYPES.has(t)) return CATALYST_PERCENT_PAINT;
  if (CLEAR_TYPES.has(t)) return CATALYST_PERCENT_CLEAR;
  return null;
}

/**
 * Resolve catalyst % for logging: item override → type default → null.
 * @param {string|null|undefined} materialType
 * @param {{ catalyst_percent?: number|null }|null} item
 */
export function resolveCatalystPercent(materialType, item = null) {
  const override = item?.catalyst_percent;
  if (override != null && override !== "") {
    const n = Number(override);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return defaultCatalystPercentForType(materialType);
}

export function materialNeedsCatalyst(materialType, item = null) {
  const pct = resolveCatalystPercent(materialType, item);
  return pct != null && pct > 0;
}

/**
 * Catalyst ounces for a qty entry.
 * @param {number} qty - gallons, or ounces when cupGun
 * @param {number} percent - e.g. 3.9 or 4
 * @param {boolean} cupGun
 */
export function computeCatalystOz(qty, percent, cupGun = false) {
  const n = Number(qty);
  const pct = Number(percent);
  if (!Number.isFinite(n) || n < 0 || !Number.isFinite(pct) || pct < 0) {
    return 0;
  }
  if (cupGun) {
    return roundTenths(n * (pct / 100));
  }
  return roundTenths(n * (pct / 100) * 128);
}

export function formatCatalystPercentLabel(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? `${n}%` : `${roundTenths(n)}%`;
}
