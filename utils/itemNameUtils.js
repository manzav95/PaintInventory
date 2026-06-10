/** Prefix "#" when a saved name starts with a digit and does not already. */
export function normalizeItemNameForSave(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return trimmed;
  if (/^\d/.test(trimmed) && !trimmed.startsWith("#")) {
    return `#${trimmed}`;
  }
  return trimmed;
}
