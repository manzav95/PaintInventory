/** Custom paint/stain stacks: stored as C-A … C-Z; dropdown shows A–Z; cards show Custom-A. */

export const CUSTOM_TYPES = ["custom_paint", "custom_stain"];

export const DEFAULT_CUSTOM_STACK = "C-A";

export const CUSTOM_STACK_OPTIONS = Array.from({ length: 26 }, (_, i) => {
  const letter = String.fromCharCode(65 + i); // A–Z
  const value = `C-${letter}`;
  return { label: letter, value };
});

const STACK_VALUES = new Set(CUSTOM_STACK_OPTIONS.map((o) => o.value));

export function isCustomType(type) {
  return CUSTOM_TYPES.includes(String(type || "").toLowerCase());
}

export function isCustomStackLocation(location) {
  const upper = String(location || "").trim().toUpperCase();
  if (STACK_VALUES.has(upper)) return true;
  if (/^CUSTOM-[A-Z]$/.test(upper)) return true;
  if (/^C\s*-?\s*[A-Z]$/.test(upper)) return true;
  if (/^[A-Z]$/.test(upper)) return true;
  return false;
}

/** Letter only (A–Z) for dropdowns. */
export function stackLetterFromLocation(location) {
  const resolved = resolveCustomStackLocation(location);
  const m = String(resolved).toUpperCase().match(/^C-([A-Z])$/);
  return m ? m[1] : "A";
}

/** Inventory card / list display: Custom-A */
export function formatCustomStackDisplay(location) {
  return `Custom-${stackLetterFromLocation(location)}`;
}

/** Display helper for any item location. */
export function formatItemLocationDisplay(itemOrLocation, type) {
  if (itemOrLocation != null && typeof itemOrLocation === "object") {
    const loc = itemOrLocation.location;
    const t = itemOrLocation.type;
    if (isCustomType(t) || isCustomStackLocation(loc)) {
      return formatCustomStackDisplay(loc);
    }
    return loc != null && String(loc).trim() !== "" ? String(loc) : "";
  }
  const loc = itemOrLocation;
  if (isCustomType(type) || isCustomStackLocation(loc)) {
    return formatCustomStackDisplay(loc);
  }
  return loc != null && String(loc).trim() !== "" ? String(loc) : "";
}

/** Normalize legacy "Custom Container" (and blanks) to C-A; pass through valid C-X. */
export function resolveCustomStackLocation(location) {
  const raw = String(location || "").trim();
  if (!raw || raw.toLowerCase() === "custom container") {
    return DEFAULT_CUSTOM_STACK;
  }
  const upper = raw.toUpperCase();
  if (STACK_VALUES.has(upper)) return upper;
  // Custom-A (display form)
  let m = upper.match(/^CUSTOM\s*-?\s*([A-Z])$/);
  if (m) return `C-${m[1]}`;
  // Accept "A" / "CA" / "C A" / "C-A"
  m = upper.match(/^C\s*-?\s*([A-Z])$/);
  if (m) return `C-${m[1]}`;
  if (/^[A-Z]$/.test(upper)) return `C-${upper}`;
  return DEFAULT_CUSTOM_STACK;
}
