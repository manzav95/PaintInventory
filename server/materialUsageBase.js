/**
 * Material-usage → base stock consumption (server).
 * Dye (any) → DYE Base; custom stain → STAIN Base.
 * Toner does not consume a base (sheen/clear varies).
 */

const MATERIAL_BASE_NAME_PATTERNS = {
  dye: /^dye\s*base$/i,
  stain: /^stain\s*base$/i,
  // Still recognized so "Toner Base" stays hidden from MU pickers if present.
  toner: /^toner\s*base$/i,
};

function isMaterialBaseItemName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  return Object.values(MATERIAL_BASE_NAME_PATTERNS).some((re) => re.test(n));
}

/**
 * @returns {'dye'|'stain'|null}
 */
function resolveMaterialBaseKey(materialType, colorName, itemId) {
  const type = String(materialType || "").toLowerCase().trim();

  if (type === "dye") return "dye";
  if (type === "custom_stain") return "stain";
  return null;
}

module.exports = {
  MATERIAL_BASE_NAME_PATTERNS,
  isMaterialBaseItemName,
  resolveMaterialBaseKey,
};
