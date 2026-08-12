/**
 * Warn when mixing a color that has no recent inventory check-out.
 * Primer / clear are exempt (always stocked in-booth).
 */

const SKIP_TYPES = new Set(["primer", "clear"]);
const CUSTOM_TYPES = new Set(["custom_paint", "custom_stain"]);

/** How far back a check-out still counts as "recent" for mixing. */
export const CHECKOUT_RECENCY_MS = 48 * 60 * 60 * 1000;

export function isCheckoutAuditLog(log) {
  if (!log) return false;
  if (log.action === "check_out") return true;
  return (
    log.action === "update" && log.details?._actionType === "check_out"
  );
}

function logItemId(log) {
  return String(log?.itemId ?? log?.item_id ?? "").trim();
}

function logTimestampMs(log) {
  const t = new Date(log?.timestamp || log?.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Latest check-out time (ms) per inventory item id.
 */
export function buildLastCheckoutMap(auditLogs = []) {
  const map = Object.create(null);
  for (const log of auditLogs || []) {
    if (!isCheckoutAuditLog(log)) continue;
    const id = logItemId(log);
    if (!id) continue;
    const t = logTimestampMs(log);
    if (!t) continue;
    if (!map[id] || t > map[id]) map[id] = t;
  }
  return map;
}

/**
 * @returns {null | { title: string, message: string, destructive: boolean }}
 */
export function assessMissingCheckout({
  item,
  materialType,
  auditLogs = [],
  now = Date.now(),
  windowMs = CHECKOUT_RECENCY_MS,
} = {}) {
  const type = String(materialType || item?.type || "")
    .toLowerCase()
    .trim();
  if (!type || SKIP_TYPES.has(type)) return null;

  const itemId = item?.id != null ? String(item.id).trim() : "";
  // Free-typed custom materials without an inventory row can't be verified.
  if (!itemId) return null;

  const cutoff = now - windowMs;
  const hasRecent = (auditLogs || []).some((log) => {
    if (!isCheckoutAuditLog(log)) return false;
    if (logItemId(log) !== itemId) return false;
    return logTimestampMs(log) >= cutoff;
  });
  if (hasRecent) return null;

  const isCustom = CUSTOM_TYPES.has(type);
  const name = String(item?.color_label || item?.name || itemId).trim();
  const hours = Math.round(windowMs / (60 * 60 * 1000));

  return {
    title: isCustom ? "Custom color not checked out" : "Color not checked out",
    message:
      `${name} has no inventory check-out in the last ${hours} hours. ` +
      (isCustom
        ? "Custom colors should be checked out before mixing. Continue only if this was checked out another way."
        : "Standard colors are usually checked out before mixing. Continue only if stock was already taken."),
    destructive: isCustom,
  };
}

export default assessMissingCheckout;
