/** Material types that accept 0.5 gallon increments. */
export const HALF_GALLON_TYPES = new Set(["custom_paint", "precat"]);

export function allowsHalfGallon(type) {
  return HALF_GALLON_TYPES.has(String(type || "").toLowerCase());
}

export function isHalfGallonIncrement(n) {
  return Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}

/**
 * Parse a gallon quantity string for a given material type.
 * @returns {{ ok: boolean, value?: number, error?: string }}
 */
export function parseGallonQuantity(raw, typeOrAllowHalf) {
  const allowHalf =
    typeof typeOrAllowHalf === "boolean"
      ? typeOrAllowHalf
      : allowsHalfGallon(typeOrAllowHalf);
  const s = String(raw ?? "").trim();
  if (!s) {
    return { ok: false, error: "Enter a quantity greater than 0." };
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Enter a quantity greater than 0." };
  }
  if (allowHalf) {
    if (!isHalfGallonIncrement(n)) {
      return {
        ok: false,
        error: "Enter whole or half gallons (0.5 increments).",
      };
    }
    return { ok: true, value: Math.round(n * 2) / 2 };
  }
  if (!Number.isInteger(n) && Math.abs(n - Math.round(n)) > 1e-9) {
    return { ok: false, error: "Enter whole gallons only." };
  }
  return { ok: true, value: Math.round(n) };
}

/** Normalize a stored gallon value (supports halves). */
export function normalizeStoredGallons(val) {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 2) / 2;
}

/** Display gallons without trailing .0 */
export function formatGallonQuantity(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 2) / 2);
}

/** Sanitize text input while typing (digits + optional single decimal). */
export function sanitizeGallonInput(text, allowHalf) {
  let s = String(text ?? "").replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) {
    s = `${parts[0]}.${parts.slice(1).join("")}`;
  }
  if (!allowHalf) {
    return s.replace(/\./g, "");
  }
  return s;
}
