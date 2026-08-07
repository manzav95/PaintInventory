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
 * @param {string|number} raw
 * @param {string|boolean} typeOrAllowHalf - material type or legacy allowHalf flag
 * @param {{ allowZero?: boolean }} [options]
 * @returns {{ ok: boolean, value?: number, error?: string }}
 */
export function parseGallonQuantity(raw, typeOrAllowHalf, options = {}) {
  const allowZero = options?.allowZero === true;
  const allowHalf =
    typeof typeOrAllowHalf === "boolean"
      ? typeOrAllowHalf
      : allowsHalfGallon(typeOrAllowHalf);
  const s = String(raw ?? "").trim();
  if (!s) {
    if (allowZero) return { ok: true, value: 0 };
    return { ok: false, error: "Enter a quantity greater than 0." };
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Enter a valid quantity." };
  }
  if (n === 0) {
    if (allowZero) return { ok: true, value: 0 };
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

/** Floor gallons to whole 0.25 increments (no rounding up). */
export function floorQuarterGallons(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v * 4 + 1e-9) / 4;
}

/** @deprecated Prefer floorQuarterGallons for display math. */
export function roundQuarterGallons(n) {
  return floorQuarterGallons(n);
}

/** Format a quarter-gallon value (e.g. 1, 0.25, 1.5). */
export function formatQuarterGallons(n) {
  const q = Number(n);
  if (!Number.isFinite(q) || q <= 0) return "0";
  if (Math.abs(q - Math.round(q)) < 1e-9) return String(Math.round(q));
  const s = q.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

/**
 * Dashboard material-usage qty from an exact stored gallon amount:
 * - Whole 0.25-gal chunks shown as gallons (floored, never rounded up)
 * - Leftover under 0.25 gal shown as ounces
 *
 * Examples: 0.35 → "0.25 gal (12.8 oz)"; 0.1 → "12.8 oz"; 0.5 → "0.5 gal"
 *
 * @param {number} gal
 * @param {{ unit?: boolean }} [opts] unit=true → append " gal" on the gallon part
 */
export function formatMaterialUsageQtyDisplay(gal, { unit = true } = {}) {
  const raw = Number(gal);
  if (!Number.isFinite(raw) || raw <= 0) return "";

  const whole = floorQuarterGallons(raw);
  const remGal = Math.max(0, raw - whole);
  const oz = Math.round(remGal * 128 * 10) / 10;

  const formatOz = (v) =>
    Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1);

  const hasGal = whole > 1e-9;
  const hasOz = oz > 1e-6;

  if (hasGal && hasOz) {
    const galNum = formatQuarterGallons(whole);
    const galPart = unit ? `${galNum} gal` : galNum;
    return `${galPart}, ${formatOz(oz)} oz`;
  }
  if (hasGal) {
    const galNum = formatQuarterGallons(whole);
    return unit ? `${galNum} gal` : galNum;
  }
  if (hasOz) {
    return `${formatOz(oz)} oz`;
  }
  return "";
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
