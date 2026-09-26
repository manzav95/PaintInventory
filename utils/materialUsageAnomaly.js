/**
 * Confirm unusually large material-usage quantities with plain language.
 * Uses past mix logs for that material when available; otherwise ~4 gal.
 */

function formatGal(n) {
  const x = Number(n) || 0;
  if (x >= 10) return String(Math.round(x * 10) / 10);
  if (Math.abs(x - Math.round(x)) < 0.05) return String(Math.round(x));
  if (x >= 1) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 100) / 100);
}

function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Pull past mix sizes for this material from usage logs.
 */
function historyForMaterial(logs, { itemId, colorName } = {}) {
  const id = itemId != null ? String(itemId).trim() : "";
  const color = normalizeKey(colorName);
  const gallons = [];
  for (const row of logs || []) {
    const rowId = row?.item_id != null ? String(row.item_id).trim() : "";
    const rowColor = normalizeKey(row?.color_name);
    const matchId = id && rowId && id === rowId;
    const matchColor = color && rowColor && color === rowColor;
    if (!matchId && !matchColor) continue;
    const g = Number(row?.qty_gallons) || 0;
    if (g > 0) gallons.push(g);
  }
  return gallons.sort((a, b) => a - b);
}

/**
 * Educated usual mix range from history (min / avg / max aware).
 * Returns null if not enough samples.
 */
function estimateUsualMix(sortedGallons) {
  if (!sortedGallons || sortedGallons.length < 3) return null;
  const count = sortedGallons.length;
  const min = sortedGallons[0];
  const max = sortedGallons[count - 1];
  const avg = mean(sortedGallons);
  const median = sortedGallons[Math.floor((count - 1) / 2)];

  // Prefer the cluster around median/avg; ignore a single wild max for "usual".
  const midHigh =
    count >= 5
      ? sortedGallons[Math.floor(count * 0.75)]
      : Math.max(median, avg);

  let low = Math.min(avg, median, midHigh);
  let high = Math.max(avg, median, midHigh);

  // Friendly whole-gallon band like "3–4"
  let lowR = Math.max(0.5, Math.floor(low + 0.0001));
  let highR = Math.max(lowR, Math.ceil(high - 0.0001));
  if (highR === lowR) {
    highR = lowR + 1;
  }
  // Keep band tight when mixes are consistently small
  if (max <= lowR + 0.25 && count >= 5) {
    lowR = Math.max(0.5, Math.floor(min));
    highR = Math.max(lowR, Math.ceil(max));
    if (highR === lowR) highR = lowR + 1;
  }

  return {
    count,
    min,
    max,
    avg,
    median,
    low: lowR,
    high: highR,
  };
}

function defaultTriggerGal(materialType) {
  const t = String(materialType || "").toLowerCase();
  if (t === "catalyst") return 1;
  if (t === "dye" || t === "stain" || t === "custom_stain") return 2;
  // paint / precat / clear / primer / custom / unknown — user baseline
  return 4;
}

/**
 * @param {{
 *   qtyGallons: number,
 *   materialType?: string|null,
 *   booth?: string|null,
 *   colorName?: string|null,
 *   itemId?: string|null,
 *   cupGun?: boolean,
 *   rawInput?: string|number|null,
 *   logs?: Array<{ qty_gallons?: number, booth?: string, color_name?: string, item_id?: string }>,
 * }} opts
 * @returns {null | { level: 'soft'|'hard'|'extreme', title: string, message: string, destructive: boolean }}
 */
export function assessMaterialUsageQty(opts) {
  const gal = Number(opts?.qtyGallons) || 0;
  if (!(gal > 0)) return null;

  const colorName =
    String(opts?.colorName || "").trim() || "this material";
  const materialType = opts?.materialType;
  const defaultOver = defaultTriggerGal(materialType);

  const hist = historyForMaterial(opts?.logs, {
    itemId: opts?.itemId,
    colorName: opts?.colorName,
  });
  const usual = estimateUsualMix(hist);

  let shouldAsk = false;
  if (gal > defaultOver) {
    shouldAsk = true;
  } else if (usual && usual.count >= 5 && gal > usual.high) {
    // History says people usually stay under this; still warn below the 4-gal default
    shouldAsk = true;
  } else if (usual && usual.count >= 5 && gal >= Math.max(usual.avg * 2, usual.max * 1.15)) {
    shouldAsk = true;
  }

  if (!shouldAsk) return null;

  const cupHint = opts?.cupGun
    ? ` (${String(opts.rawInput ?? "").trim() || "?"} oz cup-gun ≈ ${formatGal(gal)} gal)`
    : "";

  let usualLine;
  if (usual) {
    const avgWhole = Math.max(1, Math.round(usual.avg));
    usualLine = `Users usually mix only ${usual.low}–${usual.high} gallons of ${colorName} (average about ${avgWhole} gal).`;
  } else {
    const n = Math.round(Number(defaultOver) || 4);
    const unit = n === 1 ? "gallon" : "gallons";
    usualLine = `Users usually mix only about ${n} ${unit} or less of ${colorName}.`;
  }

  const qtyShown = Math.round(gal) === gal ? String(Math.round(gal)) : formatGal(gal);
  const message =
    `${usualLine} You're about to enter ${qtyShown} gal${cupHint}. Are you sure this quantity is correct?`;

  let level = "soft";
  if (gal >= defaultOver * 4 || (usual && gal >= Math.max(usual.max * 2, usual.avg * 5))) {
    level = "extreme";
  } else if (
    gal >= defaultOver * 2 ||
    (usual && gal >= Math.max(usual.high * 2, usual.avg * 3))
  ) {
    level = "hard";
  }

  const title =
    level === "extreme"
      ? "Very large quantity"
      : level === "hard"
        ? "Larger than usual"
        : "Double-check quantity";

  return {
    level,
    title,
    message,
    destructive: level === "extreme",
  };
}

export default assessMaterialUsageQty;
