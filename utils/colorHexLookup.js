/**
 * Look up a hex color for a paint / color-book name using free public APIs.
 * Tries CompositePaint (real paint decks) then color.pizza (general names).
 */

function normalizeHex(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s.toUpperCase();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function lookupCompositePaint(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  const url = `https://compositepaint.com/api/colors/search?q=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  for (const row of results) {
    const hex = normalizeHex(row?.hex);
    if (hex) return { hex, source: "compositepaint", name: row?.name || q };
  }
  return null;
}

async function lookupColorPizza(query) {
  const q = String(query || "").trim();
  if (q.length < 3) return null;
  const url = `https://api.color.pizza/v1/names/?name=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const colors = Array.isArray(data?.colors) ? data.colors : [];
  // Prefer highest similarity when present
  const sorted = [...colors].sort(
    (a, b) => Number(b?.similarity || 0) - Number(a?.similarity || 0),
  );
  for (const row of sorted) {
    const hex = normalizeHex(row?.hex);
    if (hex) return { hex, source: "color.pizza", name: row?.name || q };
  }
  return null;
}

/**
 * Build search queries for a custom inventory item (name, color label, code).
 */
export function buildColorLookupQueries(item) {
  const queries = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (!queries.some((q) => q.toLowerCase() === s.toLowerCase())) {
      queries.push(s);
    }
  };
  push(item?.color_label);
  push(item?.name);
  // Combine code + name when both exist (e.g. "SW 7029 Agreeable Gray")
  const code = String(item?.external_code || item?.rex || "").trim();
  const name = String(item?.name || item?.color_label || "").trim();
  if (code && name && !name.toLowerCase().includes(code.toLowerCase())) {
    push(`${code} ${name}`);
  }
  push(code);
  return queries;
}

/**
 * @param {string|string[]} queryOrQueries
 * @returns {Promise<{ hex: string, source: string, name: string } | null>}
 */
export async function lookupColorHex(queryOrQueries) {
  const list = Array.isArray(queryOrQueries)
    ? queryOrQueries
    : [queryOrQueries];
  for (const q of list) {
    const query = String(q || "").trim();
    if (query.length < 2) continue;
    try {
      const paint = await lookupCompositePaint(query);
      if (paint?.hex) return paint;
    } catch {
      /* try next */
    }
    try {
      const pizza = await lookupColorPizza(query);
      if (pizza?.hex) return pizza;
    } catch {
      /* try next */
    }
  }
  return null;
}

export { normalizeHex };
