import { colors } from "../theme/tokens";

export const MATERIAL_TYPE_LABELS = {
  paint: "Paint",
  primer: "Primer",
  clear: "Clear",
  catalyst: "Catalyst",
  stain: "Stain",
  dye: "Dye",
  custom_paint: "Custom Paint",
  custom_stain: "Custom Stain",
  precat: "PreCat",
};

export const MATERIAL_TYPE_OPTIONS = [
  { label: "Paint", value: "paint" },
  { label: "Primer", value: "primer" },
  { label: "Clear", value: "clear" },
  { label: "Catalyst", value: "catalyst" },
  { label: "Stain", value: "stain" },
  { label: "Dye", value: "dye" },
  { label: "PreCat", value: "precat" },
  { label: "Custom Paint", value: "custom_paint" },
  { label: "Custom Stain", value: "custom_stain" },
];

export const STANDARD_MATERIAL_TYPES = [
  "paint",
  "primer",
  "clear",
  "catalyst",
  "stain",
  "dye",
  "precat",
];

export function getMaterialTypeLabel(type) {
  const t = String(type || "").toLowerCase();
  if (MATERIAL_TYPE_LABELS[t]) return MATERIAL_TYPE_LABELS[t];
  if (!type) return "";
  const raw = String(type);
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function getMaterialTypeColor(type, theme) {
  const t = String(type || "").toLowerCase();
  const mt = colors.materialType;
  if (t === "paint" || t === "custom_paint" || t === "precat") {
    return theme?.dark ? colors.brand.primaryOnDark : mt.paint;
  }
  if (t === "clear") return mt.clear;
  if (t === "stain" || t === "custom_stain") return mt.stain;
  if (t === "primer") return mt.primer || (theme?.dark ? mt.primerDark : mt.primerLight);
  if (t === "dye") return mt.dye;
  if (t === "catalyst") return mt.catalyst;
  return theme?.dark ? "#fff" : colors.light.textMuted;
}

/** Booth chip / accent color for material-usage rows. */
export function getBoothColor(booth) {
  const key = String(booth || "").trim();
  const map = colors.booth || {};
  return map[key] || map.default || "#78909c";
}
