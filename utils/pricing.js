/** Default unit price when blank / missing on save. */
export const DEFAULT_UNIT_PRICE = 55.56;

/**
 * Resolve a unit price for save. Blank / null / invalid → default.
 * Explicit 0 is kept as 0.
 */
export function resolveUnitPrice(value) {
  if (value == null) return DEFAULT_UNIT_PRICE;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "" || raw === undefined) return DEFAULT_UNIT_PRICE;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return DEFAULT_UNIT_PRICE;
  return n;
}

export function formatCurrency(amount) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function positivePrices(items) {
  return (items || [])
    .map((item) => Number(item?.price))
    .filter((p) => Number.isFinite(p) && p > 0);
}

/** Mean catalog unit price. 0 when nothing matches. */
export function averageUnitPrice(items) {
  const prices = positivePrices(items);
  if (!prices.length) return 0;
  return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}

function itemsOfType(inventory, types) {
  const set = new Set(types);
  return (inventory || []).filter((item) =>
    set.has(String(item?.type || "").toLowerCase()),
  );
}

/**
 * $/gal for waste buckets, from inventory unit prices of the matching type.
 * Acetone matches name / id when there is no dedicated type.
 */
export function wasteCategoryUnitPrices(inventory = []) {
  const acetone = (inventory || []).filter((item) =>
    /acetone/i.test(
      `${item?.name || ""} ${item?.id || ""} ${item?.color || ""} ${item?.type || ""}`,
    ),
  );
  return {
    paint: averageUnitPrice(itemsOfType(inventory, ["paint", "custom_paint"])),
    clear_toner: averageUnitPrice(itemsOfType(inventory, ["clear"])),
    primer: averageUnitPrice(itemsOfType(inventory, ["primer"])),
    acetone: averageUnitPrice(acetone),
  };
}

export function wasteTotalsDollars(totals, prices) {
  if (!totals || !prices) return 0;
  const keys = ["paint", "clear_toner", "primer", "acetone"];
  return keys.reduce((sum, key) => {
    const gal = Number(totals[key]) || 0;
    const unit = Number(prices[key]) || 0;
    return sum + gal * unit;
  }, 0);
}

export function findInventoryItem(inventory, { itemId, colorName } = {}) {
  const list = Array.isArray(inventory) ? inventory : [];
  const id = itemId != null ? String(itemId).trim() : "";
  if (id) {
    const byId = list.find((item) => String(item.id) === id);
    if (byId) return byId;
  }
  const name = String(colorName || "").trim().toLowerCase();
  if (!name) return null;
  return (
    list.find((item) => String(item.name || "").trim().toLowerCase() === name) ||
    null
  );
}

/** Gallon qty × that item's unit price. */
export function usageRowDollars(row, inventory) {
  const gal = Number(row?.qty_gallons) || 0;
  if (gal <= 0) return 0;
  const item = findInventoryItem(inventory, {
    itemId: row?.item_id,
    colorName: row?.color_name,
  });
  const price = Number(item?.price);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return gal * price;
}
