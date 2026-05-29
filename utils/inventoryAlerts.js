export const CUSTOM_TYPES = ["custom_paint", "custom_stain"];

export function isRecycleDue(item) {
  const t = (item?.type || "").toLowerCase();
  if (!CUSTOM_TYPES.includes(t)) return false;
  const qty = item?.quantity || 0;
  if (qty <= 0) return false;
  const rd = item?.recycle_date;
  if (!rd) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recycleDate = new Date(rd);
  recycleDate.setHours(0, 0, 0, 0);
  return recycleDate.getTime() <= today.getTime();
}

export function getLowStockItems(inventory, minQuantity = 30) {
  const list = Array.isArray(inventory) ? inventory : [];
  return list.filter(
    (item) => (item?.quantity || 0) < (item?.minQuantity ?? minQuantity ?? 30),
  );
}
