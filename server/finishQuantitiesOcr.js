/**
 * OCR Finish Quantities Report screenshots → color + Cab LF rows.
 */
const { createWorker } = require("tesseract.js");
const path = require("path");

// Shared parser (CJS-compatible load of ESM util via dynamic import is awkward;
// keep a minimal duplicate of the parse entry for the server.)
function parseFinishQuantitiesText(text) {
  // Lazy require via compiled copy — inline the same logic by reading the util
  // through a sync eval path is fragile. Duplicate thin wrapper using regex
  // identical to utils/finishQuantitiesParse.js core.
  return parseTextImpl(text);
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

function looksLikeColorName(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length < 2 || s.length > 48) return false;
  if (/^\d+(\.\d+)?$/.test(s)) return false;
  if (/^\d{4,6}$/.test(s)) return false;
  if (SKIP_NAME.test(s)) return false;
  if (/^custom\s*#?\s*\d+/i.test(s)) return true;
  if (!/[a-zA-Z]/.test(s)) return false;
  return true;
}

function cleanColorName(raw) {
  let s = String(raw || "")
    .replace(/^[\s+\u2022\-\u2013\u2014*|]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = s.match(/^custom\s*#?\s*(\d+)/i);
  if (m) return `Custom # ${m[1]}`;
  s = s.replace(/\s+(paint\s*grade|frameless|framed)\s*$/i, "").trim();
  return s;
}

function gallonsFromCabLf(cabLf) {
  const n = Number(cabLf);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 6) * 10) / 10;
}

function parseTextImpl(text) {
  const raw = String(text || "").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const byKey = new Map();

  const add = (color, cabLf) => {
    const name = cleanColorName(color);
    if (!looksLikeColorName(name)) return;
    const lf = Number(cabLf);
    if (!Number.isFinite(lf) || lf < 0) return;
    const key = normalizeName(name);
    if (!key) return;
    const prev = byKey.get(key);
    if (prev) {
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

    let m = line.match(
      /^(?:[+\-\u2022*]\s*)?(custom\s*#?\s*\d+|[A-Za-z][A-Za-z0-9'\/\- ]{1,40}?)\s+(\d+\.?\d*)\s+(\d+\.?\d*)(?:\s|$)/i,
    );
    if (m && looksLikeColorName(m[1])) {
      add(m[1], m[2]);
      continue;
    }

    m = line.match(
      /^(?:[+\-\u2022*]\s*)?(custom\s*#?\s*\d+|[A-Za-z][A-Za-z0-9'\/\- ]{1,40}?)\s+(\d+\.?\d*)\s*$/i,
    );
    if (m && looksLikeColorName(m[1])) {
      add(m[1], m[2]);
      continue;
    }

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

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng", 1, {
        // Keep workers under server/node_modules cache
        cachePath: path.join(__dirname, ".tesseract-cache"),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: "6", // assume uniform block of text
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * @param {Buffer|string} imageInput - Buffer or data URL / base64
 * @returns {Promise<{ text: string, rows: Array<{color,cabLf,gallons}> }>}
 */
async function ocrFinishQuantitiesImage(imageInput) {
  let input = imageInput;
  if (typeof imageInput === "string") {
    const s = imageInput.trim();
    if (s.startsWith("data:")) {
      const b64 = s.split(",")[1] || "";
      input = Buffer.from(b64, "base64");
    } else if (/^[A-Za-z0-9+/=]+$/.test(s.slice(0, 80)) && s.length > 200) {
      input = Buffer.from(s, "base64");
    }
  }

  const worker = await getWorker();
  const { data } = await worker.recognize(input);
  const text = String(data?.text || "");
  const rows = parseTextImpl(text);
  return { text, rows };
}

module.exports = {
  ocrFinishQuantitiesImage,
  parseFinishQuantitiesText,
  gallonsFromCabLf,
};
