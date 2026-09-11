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
 * Which base key (if any) should be consumed for this MU entry.
 * @returns {'dye'|'stain'|null}
 */
export function resolveMaterialBaseKey(materialType, colorName, itemId) {
  const type = String(materialType || "").toLowerCase().trim();

  if (type === "dye") return "dye";
  if (type === "custom_stain") return "stain";
  return null;
}
