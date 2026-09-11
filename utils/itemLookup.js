/**
 * Resolve inventory items by ID, external code, or name — including light typo tolerance.
 * Scan / check-in paths must use exact match helpers only (no fuzzy).
 */

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactText(s) {
  return normalizeText(s).replace(/\s+/g, "");
}

/** Pad legacy 1–4 digit IDs to 4 digits (typed name search only — not barcode scan). */
export function normalizeItemIdQuery(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return "";
  if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0");
  return t;
}

/**
 * Sherwin container-size barcodes printed under the item-code barcode.
 * 16 ≈ 1 gal, 20 ≈ 5 gal — never identify a material.
 */
export const CONTAINER_SIZE_BARCODES = new Set(["16", "20"]);

/**
 * @returns {null | 'empty' | 'size_barcode' | 'too_short_numeric' | 'too_short'}
 */
export function getScanRejectReason(raw) {
  const t = String(raw || "").trim();
  if (!t) return "empty";

  if (/^\d+$/.test(t)) {
    const asInt = String(parseInt(t, 10));
    if (CONTAINER_SIZE_BARCODES.has(t) || CONTAINER_SIZE_BARCODES.has(asInt)) {
      return "size_barcode";
    }
    // Paint / custom IDs are 4+ digits; never pad "20" → "0020" for scan.
    if (t.length < 4) return "too_short_numeric";
  }

  if (t.length < 3) return "too_short";
  return null;
}

export function scanRejectMessage(reason, raw) {
  const shown = String(raw || "").trim() || "(empty)";
  switch (reason) {
    case "size_barcode":
      return {
        title: "Size Barcode",
        message:
          `"${shown}" is a container-size code (not a material ID).\n\n` +
          "Scan the item-code barcode above it, or type the full material ID.",
      };
    case "too_short_numeric":
      return {
        title: "Code Too Short",
        message:
          `"${shown}" is too short to identify a material.\n\n` +
          "Use the full item code (for example H66…) or a 4-digit paint ID.",
      };
    case "too_short":
      return {
        title: "Code Too Short",
        message:
          `"${shown}" is too short to identify a material.\n\n` +
          "Scan or enter the full item code.",
      };
    default:
      return {
        title: "Invalid Scan",
        message: "Could not read a material ID.",
      };
  }
}

/** True when input looks like an ID/barcode rather than a material name. */
export function looksLikeItemCode(raw) {
  const t = String(raw || "").trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (/^H66/i.test(t)) return true;
  // Mixed alphanumerics with digits (external codes / SKUs), not plain names
  if (/\d/.test(t) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t)) return true;
  return false;
}

/**
 * Exact ID / external_code match only (case-insensitive). No fuzzy, prefix, or includes.
 */
export function findExactInventoryScanMatch(inventory, query) {
  const raw = String(query || "").trim();
  if (!raw || getScanRejectReason(raw)) return null;

  const variants = new Set([raw, raw.toUpperCase(), raw.toLowerCase()]);
  // Full 4-digit paint IDs only — never invent padding from shorter scans
  if (/^\d{4}$/.test(raw)) {
    variants.add(raw.padStart(4, "0"));
  }

  const inv = Array.isArray(inventory) ? inventory : [];
  for (const item of inv) {
    if (!item) continue;
    const id = item.id != null ? String(item.id).trim() : "";
    const ext =
      item.external_code != null ? String(item.external_code).trim() : "";
    for (const v of variants) {
      if (id && id.toLowerCase() === v.toLowerCase()) return item;
      if (ext && ext.toLowerCase() === v.toLowerCase()) return item;
    }
  }
  return null;
}

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const cur = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    cur[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

function similarityRatio(a, b) {
  const s = compactText(a);
  const t = compactText(b);
  if (!s || !t) return 0;
  if (s === t) return 1;
  const dist = levenshtein(s, t);
  return 1 - dist / Math.max(s.length, t.length);
}

function tokenOverlap(a, b) {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  ta.forEach((tok) => {
    if (tb.has(tok)) hit += 1;
  });
  return hit / Math.max(ta.size, tb.size);
}

/**
 * Score how well an inventory item matches a typed query.
 * Higher is better. Returns 0 when it should not be suggested.
 * Queries shorter than 3 characters never match (avoids "20" → 42007).
 * For pure numeric queries, require 4+ digits (same as scan gate).
 */
export function scoreItemLookup(item, query) {
  const raw = String(query || "").trim();
  if (raw.length < 3) return 0;
  if (/^\d+$/.test(raw) && raw.length < 4) return 0;
  if (getScanRejectReason(raw) === "size_barcode") return 0;

  const qNorm = normalizeText(raw);
  const qCompact = compactText(raw);
  const qId = normalizeItemIdQuery(raw).toLowerCase();

  const id = String(item?.id || "").trim().toLowerCase();
  const ext = String(item?.external_code || "").trim().toLowerCase();
  const name = String(item?.name || "").trim();
  const nameNorm = normalizeText(name);
  const nameCompact = compactText(name);

  // Exact ID / code
  if (id && (id === qId || id === qNorm || id === qCompact)) return 1000;
  if (ext && (ext === qId || ext === qNorm || ext === qCompact)) return 980;

  // Exact name
  if (nameNorm && nameNorm === qNorm) return 960;

  // For item-code shaped queries, never soft-match (prefix / includes / fuzzy)
  if (looksLikeItemCode(raw)) {
    return 0;
  }

  // Prefix / includes — name search only
  let score = 0;
  if (nameNorm && nameNorm.startsWith(qNorm)) score = Math.max(score, 780);
  if (nameNorm && nameNorm.includes(qNorm)) score = Math.max(score, 680);

  // Fuzzy name (typos) — name search only
  if (qCompact.length >= 3) {
    const nameSim = similarityRatio(qCompact, nameCompact);
    const tok = tokenOverlap(qNorm, nameNorm);
    if (nameSim >= 0.72) score = Math.max(score, Math.round(520 + nameSim * 200));
    if (tok >= 0.5 && qNorm.length >= 4) {
      score = Math.max(score, Math.round(480 + tok * 180));
    }
    if (nameCompact.length >= 4) {
      const dist = levenshtein(qCompact, nameCompact);
      const maxDist = qCompact.length <= 5 ? 1 : qCompact.length <= 9 ? 2 : 3;
      if (dist > 0 && dist <= maxDist) {
        score = Math.max(score, 560 - dist * 40);
      }
    }
  }

  return score;
}

/**
 * Ranked matches for typed name lookup (not barcode scan).
 * @returns {Array<{ item: object, score: number }>}
 */
export function findInventoryLookupMatches(inventory, query, { limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  if (getScanRejectReason(q)) return [];
  const scored = [];
  for (const item of inventory || []) {
    if (!item) continue;
    const score = scoreItemLookup(item, q);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.item.name || a.item.id || "").localeCompare(
      String(b.item.name || b.item.id || ""),
    );
  });
  return scored.slice(0, limit);
}

/** Best single match for typed name search, or null if ambiguous / weak. */
export function resolveBestInventoryMatch(inventory, query) {
  const exact = findExactInventoryScanMatch(inventory, query);
  if (exact) return { item: exact, matches: [{ item: exact, score: 1000 }] };

  const matches = findInventoryLookupMatches(inventory, query, { limit: 5 });
  if (!matches.length) return { item: null, matches: [] };
  const top = matches[0];
  const second = matches[1];
  // Strong unique hit
  if (!second || top.score >= second.score + 80 || top.score >= 900) {
    return { item: top.item, matches };
  }
  // Close race — caller should let user pick
  if (second && second.score >= top.score - 40 && top.score < 900) {
    return { item: null, matches };
  }
  return { item: top.item, matches };
}
