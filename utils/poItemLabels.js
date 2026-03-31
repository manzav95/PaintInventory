/** AP vs mixing for PO cards and lead-time defaults — can be set per item (see Item Details). */

export const AP_TYPES = ["clear", "primer", "catalyst"];
export const MIXING_TYPES = [
  "paint",
  "dye",
  "custom_paint",
  "custom_stain",
  "stain",
];

export function inferApMixingFromType(type) {
  const t = type ? String(type).toLowerCase() : "";
  return {
    hasAp: AP_TYPES.includes(t),
    hasMixing: MIXING_TYPES.includes(t),
  };
}

/**
 * Effective AP/mixing flags for an item.
 * If both DB columns are null, infer from material type (legacy rows).
 * If both stored false, treat as mixing-only (user cleared both checkboxes).
 */
export function getItemApMixingFlags(item) {
  if (!item) return { hasAp: false, hasMixing: true };
  // Per-item override (if present), else infer from type.
  const ap = item.po_label_ap;
  const mix = item.po_label_mixing;
  if (ap === true && mix !== true) return { hasAp: true, hasMixing: false };
  if (mix === true && ap !== true) return { hasAp: false, hasMixing: true };
  if (ap != null || mix != null) return { hasAp: false, hasMixing: true };
  return inferApMixingFromType(item.type);
}

/** Lead time: AP-only lines → 3 days; mixing or mixed → 7 days. */
export function itemLeadTimePrefers7Days(item) {
  const { hasAp, hasMixing } = getItemApMixingFlags(item);
  if (hasAp && !hasMixing) return false;
  return true;
}
