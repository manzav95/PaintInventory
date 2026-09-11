import { resolveBestInventoryMatch, findInventoryLookupMatches } from "./itemLookup";
import { getMaterialTypeColor } from "./materialTypes";

const LINEUP_ELIGIBLE_TYPES = new Set([
  "paint",
  "custom_paint",
  "precat",
  "clear",
  "primer",
  "stain",
  "custom_stain",
  "dye",
]);

const EXCLUDE_NAME_RE = /^(acetone|catalyst|slow\s*reducer)$/i;

/** Custom stain IDs: 4 digits starting with 1 (not in inventory). */
export function isCustomStainId(text) {
  const raw = String(text || "").trim().replace(/^#/, "");
  return /^1\d{3}$/.test(raw);
}

export function isLineupEligibleItem(item) {
  const type = String(item?.type || "").toLowerCase();
  if (!LINEUP_ELIGIBLE_TYPES.has(type)) return false;
  const name = String(item?.name || "").trim();
  const id = String(item?.id || "").trim();
  if (EXCLUDE_NAME_RE.test(name) || EXCLUDE_NAME_RE.test(id)) return false;
  return true;
}

export function normalizeLineupMaterialType(type) {
  const t = String(type || "").toLowerCase().trim();
  if (!t) return "";
  if (t === "custom_paint" || t === "precat") return "paint";
  if (t === "custom_stain") return "stain";
  return t;
}

function inferFromKeywords(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("dye")) return "dye";
  if (t.includes("stain")) return "stain";
  if (t.includes("toner") || t.includes("clear")) return "clear";
  if (t.includes("primer")) return "primer";
  const digits = String(text || "").trim().replace(/^#/, "");
  if (/^\d{4}$/.test(digits) && !isCustomStainId(digits)) return "paint";
  return "";
}

/** Resolve paint/clear/stain type from color text + inventory. */
export function resolveLineupMaterialType(colorInput, inventory = []) {
  const raw = String(colorInput || "").trim();
  if (!raw) {
    return { materialType: "", itemId: null, displayName: "" };
  }

  if (isCustomStainId(raw)) {
    return { materialType: "stain", itemId: null, displayName: raw };
  }

  const eligible = (inventory || []).filter(isLineupEligibleItem);
  const match = resolveBestInventoryMatch(eligible, raw);
  if (match?.item) {
    const type = normalizeLineupMaterialType(match.item.type);
    return {
      materialType: type,
      itemId: match.item.id,
      displayName: match.item.name || match.item.id,
    };
  }

  const keywordType = inferFromKeywords(raw);
  return {
    materialType: keywordType,
    itemId: null,
    displayName: raw,
  };
}

export function findLineupColorSuggestions(inventory, query, { limit = 8 } = {}) {
  const eligible = (inventory || []).filter(isLineupEligibleItem);
  return findInventoryLookupMatches(eligible, query, { limit });
}

export function formatLineupColorLabel(item) {
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

/** Lineup board accent — similar to material usage but slightly softer. */
export function getLineupMaterialAccent(type, theme) {
  const t = normalizeLineupMaterialType(type);
  if (!t) return null;
  if (t === "primer") {
    return theme?.dark ? "#eceff1" : "#8A8478";
  }
  return getMaterialTypeColor(t, theme);
}

export function getLineupMaterialSoftBg(type) {
  const t = normalizeLineupMaterialType(type);
  switch (t) {
    case "paint":
      return "rgba(25, 118, 210, 0.14)";
    case "clear":
      return "rgba(239, 108, 0, 0.14)";
    case "stain":
      return "rgba(46, 125, 50, 0.14)";
    case "primer":
      return "rgba(142, 136, 120, 0.12)";
    case "dye":
      return "rgba(142, 87, 194, 0.14)";
    default:
      return null;
  }
}

export function getLineupMaterialBorder(type) {
  const t = normalizeLineupMaterialType(type);
  switch (t) {
    case "paint":
      return "#1976d2";
    case "clear":
      return "#ef6c00";
    case "stain":
      return "#2e7d32";
    case "primer":
      return "#8A8478";
    case "dye":
      return "#8e24aa";
    default:
      return null;
  }
}

export function formatLineupMaterialLabel(type) {
  const t = normalizeLineupMaterialType(type);
  if (!t) return "";
  if (t === "paint") return "Paint";
  if (t === "clear") return "Clear";
  if (t === "stain") return "Stain";
  if (t === "primer") return "Primer";
  if (t === "dye") return "Dye";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
