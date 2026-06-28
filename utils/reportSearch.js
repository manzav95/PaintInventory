/** Match inventory / report rows by name, ID, or external code. */
export function itemMatchesSearch(item, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return false;
  const name = String(item.name || item.itemName || "").toLowerCase();
  const id = String(item.itemId || item.id || "").toLowerCase();
  const ext = String(item.external_code || "").toLowerCase();
  return name.includes(q) || id.includes(q) || (ext && ext.includes(q));
}
