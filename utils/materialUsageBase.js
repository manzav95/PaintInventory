/**
 * Material-usage → base stock consumption.
 * Dye (any) → DYE Base; custom stain → STAIN Base.
 * Toner does not consume a base (sheen/clear varies).
 */

/** Name patterns for base inventory items (case-insensitive). */
export const MATERIAL_BASE_NAME_PATTERNS = {
  dye: /^dye\s*base$/i,
  stain: /^stain\s*base$/i,
  // Still recognized so "Toner Base" stays hidden from MU pickers if present.
  toner: /^toner\s*base$/i,
};

export function isMaterialBaseItemName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  return Object.values(MATERIAL_BASE_NAME_PATTERNS).some((re) => re.test(n));
}

/**
 * MU is intentionally not linked to inventory stock for now.
 * @returns {null}
 */
export function resolveMaterialBaseKey(_materialType, _colorName, _itemId) {
  return null;
}
