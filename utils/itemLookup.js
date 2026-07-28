/**
 * Resolve inventory items by ID, external code, or name — including light typo tolerance.
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

/** Pad legacy 1–4 digit IDs to 4 digits. */
export function normalizeItemIdQuery(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return "";
  if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0");
  return t;
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
 */
export function scoreItemLookup(item, query) {
  const raw = String(query || "").trim();
  if (!raw) return 0;
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

  // Prefix / includes
  let score = 0;
  if (id && (id.startsWith(qId) || id.startsWith(qCompact))) score = Math.max(score, 820);
  if (ext && (ext.startsWith(qId) || ext.startsWith(qCompact))) score = Math.max(score, 800);
  if (nameNorm && nameNorm.startsWith(qNorm)) score = Math.max(score, 780);
  if (id && id.includes(qCompact) && qCompact.length >= 2) score = Math.max(score, 720);
  if (ext && ext.includes(qCompact) && qCompact.length >= 2) score = Math.max(score, 700);
  if (nameNorm && nameNorm.includes(qNorm) && qNorm.length >= 2) score = Math.max(score, 680);

  // Fuzzy name / id (typos)
  if (qCompact.length >= 3) {
    const nameSim = similarityRatio(qCompact, nameCompact);
    const idSim = similarityRatio(qCompact, compactText(id));
    const tok = tokenOverlap(qNorm, nameNorm);
    if (nameSim >= 0.72) score = Math.max(score, Math.round(520 + nameSim * 200));
    if (idSim >= 0.78) score = Math.max(score, Math.round(500 + idSim * 200));
    if (tok >= 0.5 && qNorm.length >= 4) {
      score = Math.max(score, Math.round(480 + tok * 180));
    }
    // Allow one-char typos on short-ish names
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
 * Ranked matches for check-in/out lookup.
 * @returns {Array<{ item: object, score: number }>}
 */
export function findInventoryLookupMatches(inventory, query, { limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
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

/** Best single match, or null if ambiguous / weak. */
export function resolveBestInventoryMatch(inventory, query) {
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
