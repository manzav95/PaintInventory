/**
 * Suggested on-hand stock for standard colors + AP materials
 * (primer / clear / catalyst): enough for ~2 weeks based on the
 * last ~6 months of consumption.
 */

export const STOCK_ESTIMATE_TYPES = [
  "paint",
  "precat",
  "stain",
  "dye",
  "primer",
  "clear",
  "catalyst",
];

export const STOCK_ESTIMATE_LOOKBACK_DAYS = 182; // ~6 months
export const STOCK_ESTIMATE_TARGET_WEEKS = 2;

export function isStockEstimateEligible(itemOrType) {
  const t =
    itemOrType != null && typeof itemOrType === "object"
      ? String(itemOrType.type || "").toLowerCase().trim()
      : String(itemOrType || "").toLowerCase().trim();
  return STOCK_ESTIMATE_TYPES.includes(t);
}

/**
 * @param {number} consumedGal - gallons used/checked out in the lookback window
 * @param {number} [lookbackDays]
 * @param {number} [targetWeeks]
 * @returns {number} suggested gallons to keep on hand (0.1 precision, min 0)
 */
export function suggestedStockFromConsumption(
  consumedGal,
  lookbackDays = STOCK_ESTIMATE_LOOKBACK_DAYS,
  targetWeeks = STOCK_ESTIMATE_TARGET_WEEKS,
) {
  const total = Number(consumedGal);
  const days = Number(lookbackDays);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(days) || days <= 0) {
    return 0;
  }
  const avgPerDay = total / days;
  const suggested = avgPerDay * targetWeeks * 7;
  return Math.round(suggested * 10) / 10;
}
