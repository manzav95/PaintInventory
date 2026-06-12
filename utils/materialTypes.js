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
  if (t === "paint" || t === "custom_paint" || t === "precat") return "#1565c0";
  if (t === "clear") return "#e65100";
  if (t === "stain" || t === "custom_stain") return "#2e7d32";
  if (t === "primer") return theme?.dark ? "#f5f5dc" : "#5d4037";
  if (t === "dye") return "#7e57c2";
  if (t === "catalyst") return "#9a7b00";
  return theme?.dark ? "#fff" : "#666";
}
