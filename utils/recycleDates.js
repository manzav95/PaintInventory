/** Months after lot/order date until custom paint/stain must be recycled. */
export const CUSTOM_RECYCLE_MONTHS = 9;

/** Shown on custom color item forms — when recycle due date resets. */
export const RECYCLE_DUE_RESET_HINT =
  "Recycle is due 9 months after the lot date, and resets 9 months after check-out or receiving.";

export function normalizeDateInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    if (!isNaN(d.getTime())) return s;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export function recycleDueFromLotDate(lotDateStr) {
  const lot = normalizeDateInput(lotDateStr);
  if (!lot) return null;
  const d = new Date(`${lot}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + CUSTOM_RECYCLE_MONTHS);
  return d.toISOString().slice(0, 10);
}

export function formatDateDisplay(dateStr) {
  const normalized = normalizeDateInput(dateStr);
  if (!normalized) return "—";
  const d = new Date(`${normalized}T12:00:00`);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRecycleDueFromLotDate(lotDateStr) {
  return formatDateDisplay(recycleDueFromLotDate(lotDateStr));
}
