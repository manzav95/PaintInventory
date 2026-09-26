/**
 * Parse Finish Quantities Report text (OCR or paste) into color + Cab LF rows.
 * Paint gallons = Cab LF / 6.
 */

export const CAB_LF_PER_GALLON = 6;

export function gallonsFromCabLf(cabLf) {
  const n = Number(cabLf);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / CAB_LF_PER_GALLON) * 10) / 10;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SKIP_LINE =
  /^(finish\s*quantit|start\s*date|end\s*date|cab\s*lf|baseline|wood\s*type|construction|frameless|framed|custom\s*job\s*footage|grand\s*total|finish\s*type|next\s*week|current\s*week|last\s*week|date\s*range|job\s*#|part\b)/i;

const SKIP_NAME =
  /finish\s*quantit|cab\s*lf|baseline|wood\s*type|construction|frameless|framed|custom\s*job\s*footage|paint\s*grade|grand\s*total|finish\s*type|job\s*#|^part\b/i;

const CUSTOM_RE = /^custom\s*#?\s*(\d+)\s*$/i;

/**
 * True if string looks like a finish color label (not a job # / hours).
 */
function looksLikeColorName(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length < 2 || s.length > 48) return false;
  if (/^\d+(\.\d+)?$/.test(s)) return false;
  if (/^\d{4,6}$/.test(s)) return false; // job #
  if (SKIP_NAME.test(s)) return false;
  if (CUSTOM_RE.test(s) || /^custom\s*#?\s*\d+/i.test(s)) return true;
  // At least one letter
  if (!/[a-zA-Z]/.test(s)) return false;
  return true;
}

function cleanColorName(raw) {
  let s = String(raw || "")
    .replace(/^[\s+\u2022\-\u2013\u2014*|]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  // "Custom # 4424" / "Custom 4428"
  const m = s.match(/^custom\s*#?\s*(\d+)/i);
  if (m) return `Custom # ${m[1]}`;
  // Drop trailing junk OCR sometimes glues on
  s = s.replace(/\s+(paint\s*grade|frameless|framed)\s*$/i, "").trim();
  return s;
}

/**
 * Extract color + Cab LF pairs from OCR / pasted report text.
 * When the same color appears multiple times (expanded jobs), LF values are summed.
 *
 * @param {string} text
 * @returns {{ color: string, cabLf: number, gallons: number }[]}
 */
export function parseFinishQuantitiesText(text) {
  const raw = String(text || "").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  /** @type {Map<string, { color: string, cabLf: number }>} */
  const byKey = new Map();

  const add = (color, cabLf) => {
    const name = cleanColorName(color);
    if (!looksLikeColorName(name)) return;
    const lf = Number(cabLf);
    if (!Number.isFinite(lf) || lf < 0) return;
    // Skip obvious hours-looking alone without LF context handled below
    const key = normalizeName(name);
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
      // Expanded job rows: sum LF. Near-duplicate totals: keep max.
      if (
        Math.abs(lf - prev.cabLf) < 0.05 ||
        (lf >= prev.cabLf * 0.95 && lf <= prev.cabLf * 1.05)
      ) {
        prev.cabLf = Math.max(prev.cabLf, lf);
      } else {
        prev.cabLf = Math.round((prev.cabLf + lf) * 100) / 100;
      }
    } else {
      byKey.set(key, { color: name, cabLf: lf });
    }
  };

  for (const line of lines) {
    if (SKIP_LINE.test(line) && !/^custom\s*#?\s*\d+/i.test(line)) continue;

    // "Black Horizon 33 14.44 Paint Grade" or "Custom # 4424 3 1.31 ..."
    let m = line.match(
      /^(?:[+\-\u2022*]\s*)?(custom\s*#?\s*\d+|[A-Za-z][A-Za-z0-9'\/\- ]{1,40}?)\s+(\d+\.?\d*)\s+(\d+\.?\d*)(?:\s|$)/i,
    );
    if (m && looksLikeColorName(m[1])) {
      // m[2] = Cab LF, m[3] = hours (usually)
      add(m[1], m[2]);
      continue;
    }

    // "ColorName 33" only
    m = line.match(
      /^(?:[+\-\u2022*]\s*)?(custom\s*#?\s*\d+|[A-Za-z][A-Za-z0-9'\/\- ]{1,40}?)\s+(\d+\.?\d*)\s*$/i,
    );
    if (m && looksLikeColorName(m[1])) {
      add(m[1], m[2]);
      continue;
    }

    // Tab / CSV: Color, LF
    m = line.match(
      /^(custom\s*#?\s*\d+|[A-Za-z][A-Za-z0-9'\/\- ]{1,40}?)\s*[,|;]\s*(\d+\.?\d*)\s*$/i,
    );
    if (m && looksLikeColorName(m[1])) {
      add(m[1], m[2]);
    }
  }

  return [...byKey.values()]
    .filter((r) => r.cabLf > 0)
    .map((r) => ({
      color: r.color,
      cabLf: Math.round(r.cabLf * 100) / 100,
      gallons: gallonsFromCabLf(r.cabLf),
    }))
    .sort((a, b) => a.color.localeCompare(b.color));
}

/**
 * Match a Finish Color label to an inventory item.
 */
export function matchFinishColorToInventory(colorName, inventory = []) {
  const name = cleanColorName(colorName);
  const key = normalizeName(name);
  const list = Array.isArray(inventory) ? inventory : [];

  const customNum = name.match(/^custom\s*#?\s*(\d+)/i)?.[1];
  if (customNum) {
    const hit =
      list.find((it) => {
        const id = String(it?.id || "");
        const n = String(it?.name || "");
        return (
          id === customNum ||
          id.endsWith(customNum) ||
          id.includes(customNum) ||
          /custom/i.test(n) && n.includes(customNum)
        );
      }) || null;
    if (hit) return hit;
  }

  const exact = list.find((it) => {
    const n = normalizeName(it?.name);
    const label = normalizeName(it?.color_label);
    return n === key || label === key;
  });
  if (exact) return exact;

  // Loose contains (avoid very short keys)
  if (key.length >= 4) {
    return (
      list.find((it) => {
        const n = normalizeName(it?.name);
        const label = normalizeName(it?.color_label);
        return n.includes(key) || key.includes(n) || label.includes(key);
      }) || null
    );
  }
  return null;
}

export default parseFinishQuantitiesText;
