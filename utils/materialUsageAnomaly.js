/**
 * Detect unusually large material-usage quantities and build confirm copy.
 * Uses absolute thresholds by material type plus recent booth history when available.
 */

function formatGal(n) {
  const x = Number(n) || 0;
  if (x >= 10) return String(Math.round(x * 10) / 10);
  if (x >= 1) return String(Math.round(x * 100) / 100);
  return String(Math.round(x * 1000) / 1000);
}

function thresholdsForType(materialType) {
  const t = String(materialType || "").toLowerCase();
  // soft = ask once; hard = stronger wording; extreme = destructive confirm
  if (t === "dye" || t === "stain" || t === "custom_stain") {
    return { soft: 2, hard: 5, extreme: 10 };
  }
  if (t === "clear" || t === "primer") {
    return { soft: 5, hard: 10, extreme: 20 };
  }
  if (t === "catalyst") {
    return { soft: 1, hard: 2, extreme: 5 };
  }
  // paint / custom_paint / precat / unknown
  return { soft: 8, hard: 15, extreme: 25 };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * p)),
  );
  return sorted[i];
}

/**
 * @param {{
 *   qtyGallons: number,
 *   materialType?: string|null,
 *   booth?: string|null,
 *   colorName?: string|null,
 *   cupGun?: boolean,
 *   rawInput?: string|number|null,
 *   logs?: Array<{ qty_gallons?: number, booth?: string }>,
 * }} opts
 * @returns {null | { level: 'soft'|'hard'|'extreme', title: string, message: string, destructive: boolean }}
 */
export function assessMaterialUsageQty(opts) {
  const gal = Number(opts?.qtyGallons) || 0;
  if (!(gal > 0)) return null;

  const { soft, hard, extreme } = thresholdsForType(opts?.materialType);
  const booth = String(opts?.booth || "").trim();
  const colorName = String(opts?.colorName || "this material").trim();
  const unitHint = opts?.cupGun
    ? ` (${String(opts.rawInput ?? "").trim() || "?"} oz cup-gun ≈ ${formatGal(gal)} gal)`
    : "";

  const peers = (opts?.logs || [])
    .map((r) => Number(r?.qty_gallons) || 0)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);

  const boothPeers = (opts?.logs || [])
    .filter((r) => !booth || String(r?.booth || "") === booth)
    .map((r) => Number(r?.qty_gallons) || 0)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);

  const hist = boothPeers.length >= 8 ? boothPeers : peers.length >= 8 ? peers : [];
  let histUnusual = false;
  let histLine = "";
  if (hist.length >= 8) {
    const median = percentile(hist, 0.5);
    const p90 = percentile(hist, 0.9);
    const max = hist[hist.length - 1];
    histLine = ` Recent logs average around ${formatGal(median)} gal (90th %ile ${formatGal(p90)}, max ${formatGal(max)}).`;
    if (gal >= Math.max(soft, median * 4) || (gal > max * 1.25 && gal >= soft)) {
      histUnusual = true;
    }
  }

  const absoluteUnusual = gal >= soft;
  if (!absoluteUnusual && !histUnusual) return null;

  let level = "soft";
  if (gal >= extreme) level = "extreme";
  else if (gal >= hard || (histUnusual && gal >= soft)) level = "hard";

  const title =
    level === "extreme"
      ? "Very large quantity"
      : level === "hard"
        ? "Unusual quantity"
        : "Double-check quantity";

  const message =
    `You're about to log ${formatGal(gal)} gal of ${colorName}${unitHint} at ${booth || "this booth"}.` +
    (histLine || " That is higher than a typical mix.") +
    (level === "extreme"
      ? " Please confirm this is intentional before saving."
      : " Continue only if this amount is correct.");

  return {
    level,
    title,
    message,
    destructive: level === "extreme",
  };
}

export default assessMaterialUsageQty;
