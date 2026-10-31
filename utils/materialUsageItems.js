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

const TYPE_WORD_RE = /\b(custom|stain|dye|toner|paint|primer|clear)\b/gi;

/** Color name without stain/dye/type words — "Espresso Stain" → "espresso". */
export function materialColorBase(name) {
  return String(name || "")
    .replace(TYPE_WORD_RE, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Show "stain" / "dye" after those types when the name does not already say it. */
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
  if (type === "dye" && !/\bdye\b/i.test(name)) {
    return `${name} dye`;
  }
  return name;
}

export function isSyntheticDyeSuggestion(item) {
  return !!item?._syntheticDye;
}

export function customColorFromSyntheticDye(item) {
  const base = String(item?._colorBase || item?.name || "").trim();
  if (!base) return "dye";
  return /\bdye\b/i.test(base) ? base : `${base} dye`;
}

function itemMatchesMaterialQuery(item, q) {
  if (!q) return true;
  const hay = [
    item?.name,
    item?.id,
    item?.color_label,
    formatMaterialPickerLabel(item),
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return hay.includes(q);
}

/**
 * Inventory matches for the material picker. Standard stains also surface
 * the same color as dye (real dye item if it exists, otherwise a dye option).
 */
export function buildMaterialUsageSuggestions(
  inventory,
  query,
  { selectedItem, lastActivityByItemId = {}, limit } = {},
) {
  if (selectedItem) return [];
  const eligible = (inventory || []).filter(isMaterialUsageEligibleItem);
  const q = String(query || "").trim().toLowerCase();
  const filtered = q
    ? eligible.filter((item) => itemMatchesMaterialQuery(item, q))
    : eligible.slice();
  const typeOnly = /^(stain|dye|toner|paint|primer|clear)$/.test(q);
  if (q && !typeOnly) {
    const typeBaseKey = (item) =>
      `${String(item?.type || "").toLowerCase()}|${materialColorBase(item?.name)}`;
    const seen = new Set(filtered.map(typeBaseKey));
    const dyes = eligible.filter(
      (item) => String(item.type || "").toLowerCase() === "dye",
    );
    const stains = filtered.filter((item) => {
      const t = String(item.type || "").toLowerCase();
      return t === "stain" || t === "custom_stain";
    });
    for (const stain of stains) {
      const base = materialColorBase(stain.name);
      if (!base || seen.has(`dye|${base}`)) continue;
      const realDye = dyes.find((dye) => materialColorBase(dye.name) === base);
      if (realDye) {
        if (!filtered.some((item) => String(item.id) === String(realDye.id))) {
          filtered.push(realDye);
        }
        seen.add(`dye|${base}`);
        continue;
      }
      const title = String(stain.name || "")
        .replace(/\bstain\b/gi, "")
        .replace(/\s+/g, " ")
        .trim() || String(stain.name || "").trim();
      filtered.push({
        id: `__dye__${stain.id}`,
        name: title,
        type: "dye",
        _syntheticDye: true,
        _colorBase: title,
      });
      seen.add(`dye|${base}`);
    }
  }
  filtered.sort((a, b) => {
    const aName = (a.name || a.id || "").toLowerCase();
    const bName = (b.name || b.id || "").toLowerCase();
    const aLabel = formatMaterialPickerLabel(a).toLowerCase();
    const bLabel = formatMaterialPickerLabel(b).toLowerCase();
    if (q) {
      const aStarts =
        aName.startsWith(q) || aLabel.startsWith(q) ? 0 : 1;
      const bStarts =
        bName.startsWith(q) || bLabel.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    const aBase = materialColorBase(a.name);
    const bBase = materialColorBase(b.name);
    if (aBase && bBase && aBase === bBase) {
      const rank = (item) => {
        const t = String(item?.type || "").toLowerCase();
        if (t === "stain" || t === "custom_stain") return 0;
        if (t === "dye") return 1;
        return 2;
      };
      const d = rank(a) - rank(b);
      if (d) return d;
    }
    const ta = lastActivityByItemId[String(a.id)] || 0;
    const tb = lastActivityByItemId[String(b.id)] || 0;
    if (tb !== ta) return tb - ta;
    return aLabel.localeCompare(bLabel);
  });
  if (Number.isFinite(limit) && limit > 0) return filtered.slice(0, limit);
  return filtered;
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
