import { getMaterialTypeColor } from "./materialTypes";
import { isMaterialBaseItemName } from "./materialUsageBase";

/**
 * Material-usage helpers shared by MaterialUsageScreen and edit popover.
 */

export const MATERIAL_USAGE_COLOR_TYPES = [
  "paint",
  "custom_paint",
  "clear",
  "primer",
  "stain",
  "custom_stain",
  "dye",
];

/** Legacy name/id exclusions (also backfilled onto hide_from_material_usage). */
export const MATERIAL_USAGE_EXCLUDE_NAME_RE =
  /^(acetone|catalyst|slow\s*reducer)$/i;

export function isMaterialUsageEligibleItem(item) {
  if (!item) return false;
  if (
    item.hide_from_material_usage === true ||
    item.hide_from_material_usage === "true" ||
    item.hide_from_material_usage === 1
  ) {
    return false;
  }
  // Base stock (DYE Base, STAIN Base, etc.) is consumed automatically — not pickable.
  if (isMaterialBaseItemName(item.name) || isMaterialBaseItemName(item.id)) {
    return false;
  }
  const type = String(item.type || "").toLowerCase();
  if (!MATERIAL_USAGE_COLOR_TYPES.includes(type)) return false;
  const name = String(item.name || "").trim();
  const id = String(item.id || "").trim();
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(name)) return false;
  if (MATERIAL_USAGE_EXCLUDE_NAME_RE.test(id)) return false;
  return true;
}

/** Show "stain" after stain / custom_stain names when not already present. */
export function formatMaterialPickerLabel(item) {
  const name = String(item?.name || item?.id || "").trim();
  if (!name) return "";
  const type = String(item?.type || "").toLowerCase();
  if (
    (type === "stain" || type === "custom_stain") &&
    !/\bstain\b/i.test(name)
  ) {
    return `${name} stain`;
  }
  return name;
}

/**
 * If the user typed only a paint number (e.g. 4386 or #4386), match an
 * inventory paint / custom_paint / precat so the log links to that item.
 * Paints only for now (not stains/clears).
 */
export function resolvePaintItemFromNumericInput(text, inventory = []) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/^#/, "");
  if (!/^\d{1,6}$/.test(digits)) return null;

  const paintTypes = new Set(["paint", "custom_paint", "precat"]);
  const candidates = (inventory || []).filter((item) => {
    if (!isMaterialUsageEligibleItem(item)) return false;
    return paintTypes.has(String(item.type || "").toLowerCase());
  });
  if (!candidates.length) return null;

  const padded = digits.padStart(4, "0");
  const variants = [digits, padded, `#${digits}`, `#${padded}`].map((v) =>
    v.toLowerCase(),
  );

  const norm = (s) => String(s || "").trim().toLowerCase();

  for (const v of variants) {
    const hit = candidates.find((i) => norm(i.id) === v);
    if (hit) return hit;
  }
  for (const v of variants) {
    const hit = candidates.find((i) => norm(i.name) === v);
    if (hit) return hit;
  }
  for (const v of variants) {
    const hit = candidates.find((i) => norm(i.external_code) === v);
    if (hit) return hit;
  }
  return null;
}

/** Accent for the Material field outline/text (toner → clear/orange). */
export function getMaterialInputAccent(type, theme) {
  const t = String(type || "").toLowerCase();
  if (!t) return null;
  if (t === "primer") {
    // White on dark (brighter than muted body text); warm brown on light.
    return theme?.dark ? "#FFFFFF" : "#5d4037";
  }
  return getMaterialTypeColor(t, theme);
}
