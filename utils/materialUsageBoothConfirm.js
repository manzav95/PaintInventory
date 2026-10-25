/**
 * Booth 2 almost never sprays stain — most mistaken entries should be dye.
 */

import confirmAction from "./confirmAction";

export function isStainUsageType(type) {
  const t = String(type || "")
    .toLowerCase()
    .trim();
  return t === "stain" || t === "custom_stain";
}

/**
 * If Booth 2 + stain, ask whether to log as dye instead.
 * @returns {Promise<string|null>} corrected type (same or "dye")
 */
export async function maybeConfirmBooth2StainAsDye(booth, materialType) {
  if (String(booth || "").trim() !== "Booth 2") return materialType;
  if (!isStainUsageType(materialType)) return materialType;
  const useDye = await confirmAction(
    "Use dye instead?",
    "Booth 2 almost never sprays stain. Most of the time this should be logged as dye.",
    { confirmLabel: "Use dye", cancelLabel: "Keep stain" },
  );
  return useDye ? "dye" : materialType;
}
