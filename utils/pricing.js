/** Default unit price when blank / missing on save. */
export const DEFAULT_UNIT_PRICE = 55.56;

/**
 * Resolve a unit price for save. Blank / null / invalid → default.
 * Explicit 0 is kept as 0.
 */
export function resolveUnitPrice(value) {
  if (value == null) return DEFAULT_UNIT_PRICE;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "" || raw === undefined) return DEFAULT_UNIT_PRICE;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return DEFAULT_UNIT_PRICE;
  return n;
}
