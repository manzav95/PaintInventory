"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { parseIngredientLine, classificationFromNumber, filenameNumbers, applyFilenameHint } = require("./stainFormulaParse");
const { resolveShopMaterial } = require("./colorantCatalog");

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function tidyProcessName(text) {
  const cleaned = String(text || "")
    .replace(/\bdyet\b/gi, "dye")
    .replace(/\bstaun\b/gi, "stain")
    .replace(/\btoner[l1]\b/gi, "toner")
    .replace(/\bshee[a-z]\b/gi, "sheen")
    .replace(/\btop\s*co[a-z]{2,8}\b/gi, "topcoat")
    .replace(/\bseal[a-z]{1,4}\b/gi, "sealer")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/\b([a-z])([a-z']*)/g, (_, first, rest) => first.toUpperCase() + rest);
}

function gramToken(word) {
  const text = String(word || "");
  if (/^gal/i.test(text)) return false;
  return /^(?:grams?|g(?:u|r|q)?a[a-z]{1,8}|qua[a-z]{1,8}|qra[a-z]{1,8}|gia[a-z]{1,8})$/i.test(text);
}

function normalizeOcrLine(line) {
  let text = String(line || "")
    .replace(/[|]/g, " ")
    .replace(/\b(\d+),(\d+)\b/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
  text = text
    .replace(/\bq\s+(u?ams|uamus|uamns|rams)\b/gi, "q$1")
    .replace(/\bg\s+(rams|uams)\b/gi, "g$1");
  text = text.replace(/\b(\d+(?:\.\d+)?)([a-z]{3,10})\b/gi, (match, qty, word) => (
    gramToken(word) ? `${qty} grams` : match
  ));
  text = text.replace(/\b(\d+(?:\.\d+)?)\s+([a-z]{3,10})\b/gi, (match, qty, word) => {
    if (gramToken(word)) return `${qty} grams`;
    if (/^gal/i.test(word)) return `${qty} gallon`;
    return match;
  });
  return text.replace(/\s+/g, " ").trim();
}

function isQuantityOnly(line) {
  return /^\d+(?:\.\d+)?(?:\s+(?:grams?|gallon|g|gal))?$/i.test(String(line || "").trim());
}

function looksLikeProcess(text) {
  const line = String(text || "").trim();
  if (!line || parseIngredientLine(line) || isQuantityOnly(line)) return false;
  if (/^(?:dye|dyet|stain|staun|seal\w*|toner\w*|glaze|primer|paint)\b/i.test(line)) return true;
  if (/\btop\s*coat/i.test(line) || /^topcoat\b/i.test(line)) return true;
  if (/\bshee[a-z]\b/i.test(line) && line.split(/\s+/).length <= 6) return true;
  return false;
}

function processBody(line) {
  const marked = String(line || "").match(/^(\d{1,2})\s*[.)]\s+(.+)$/);
  if (marked && looksLikeProcess(marked[2])) return marked[2];
  if (/\bshee[a-z]\b/i.test(line) && looksLikeProcess(line)) return line;
  const loose = String(line || "").match(/^(\d{1,2})\s+(.+)$/);
  if (loose && looksLikeProcess(loose[2]) && !parseIngredientLine(line)) return loose[2];
  if (looksLikeProcess(line)) return line;
  return "";
}

function parseLooseDate(text) {
  const source = String(text || "").replace(/\b(?:vul|vui|ju1)\b/gi, "Jul");
  const month = source.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z.]*\s+(\d{1,2})[.,\s]+(\d{2,4})\b/i,
  );
  if (month) {
    const year = month[3].length === 2 ? `20${month[3]}` : month[3];
    return `${year}-${String(MONTHS[month[1].toLowerCase()]).padStart(2, "0")}-${month[2].padStart(2, "0")}`;
  }
  const slash = String(text || "").match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (!slash) return "";
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
}

function stripDate(text) {
  return String(text || "")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z.]*\s+\d{1,2}[.,\s]+\d{2,4}\b/gi, " ")
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function correctedName(name) {
  return String(name || "")
    .replace(/\bW[B6][5S]\b/gi, "W85")
    .replace(/\bB7[oO]\b/g, "B70")
    .replace(/\bNS0?2\b/gi, "N502")
    .replace(/\b3500\b/g, "B500")
    .replace(/\b4504\b/g, "Y504")
    .replace(/\bRS0?3\b/gi, "R503")
    .replace(/\bES0?1\b/gi, "E501")
    .trim();
}

function looksLikeMaterial(name) {
  const text = correctedName(name);
  if (!text || /^(?:i\s*)?g[vrn]?am[s]?$/i.test(text)) return false;
  if (text.length < 3 || text.length > 60) return false;
  if (/[A-Za-z]/.test(text) && /\d/.test(text)) return true;
  return text.split(/\s+/).filter((word) => /[A-Za-z]{3,}/.test(word)).length >= 2;
}

function catalogName(name) {
  return resolveShopMaterial(correctedName(name));
}

function nameOnlyIngredient(name) {
  const known = catalogName(name);
  const text = known || (looksLikeMaterial(name) ? correctedName(name) : "");
  if (!text) return null;
  return {
    quantityText: "",
    quantity: null,
    unit: "",
    name: text,
    rawLine: text,
    uncertain: !known,
    important: false,
  };
}

function cleanProcessName(name) {
  return tidyProcessName(name)
    .replace(/\s*#\s*\d{3,6}\b/g, "")
    .replace(/^\d{1,2}\s*[.)]\s+/, "")
    .replace(/[:\-–—]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function baseProcess(name) {
  const text = String(name || "").toLowerCase();
  if (/\bdye base\b|\bsap\b/.test(text)) return "Dye";
  if (/\bstain base\b|\bt72\b/.test(text)) return "Stain";
  if (/\btop\s*coat\b|\bfh\s*143\b/.test(text)) return "Toner";
  return "";
}

function stepFromLine(body) {
  const text = cleanProcessName(body);
  const split = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split && !parseIngredientLine(split[2])) {
    const ingredient = nameOnlyIngredient(split[2]);
    return {
      processName: cleanProcessName(split[1]),
      ingredients: ingredient ? [ingredient] : [],
    };
  }
  return { processName: text, ingredients: [] };
}

/**
 * Handwritten sheet: number near the top, date at the upper left,
 * a short name at the upper right, then numbered steps and gram lines.
 */
function parseHandwrittenFormula(text, filename = "") {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeOcrLine)
    .filter(Boolean);
  const lines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    let line = rawLines[i];
    const next = rawLines[i + 1] || "";
    if (/^\d{1,2}\s+sheen$/i.test(line) && /top\s*coat/i.test(next)) {
      line = `${line} ${next}`;
      i += 1;
    }
    const chunks = line.split(/(?<![\d.])(?=\d+(?:\.\d+)?\s*(?:gallons?|grams?)\b)/i).map((part) => part.trim()).filter(Boolean);
    lines.push(...(chunks.length ? chunks : [line]));
  }

  const warnings = [];
  let formulaDate = "";
  let formulaNumber = "";
  let developer = "";
  const steps = [];
  let seenStep = false;
  let pendingQty = "";
  let pendingName = "";

  const isNameOnly = (line) => {
    const text = String(line || "").trim();
    if (!text || processBody(text) || parseIngredientLine(text) || isQuantityOnly(text)) return false;
    if (/^\d{3,6}$/.test(text) || /^=\s*#?\d{3,6}$/.test(text) || /^#\s*\d{3,6}$/.test(text)) return false;
    return looksLikeMaterial(text);
  };

  const startStep = (processName) => {
    const name = cleanProcessName(processName) || "Process";
    steps.push({
      stepNumber: steps.length + 1,
      processName: name,
      notes: "",
      importantNotes: "",
      important: false,
      ingredients: [],
    });
    seenStep = true;
  };

  const pushIngredient = (line) => {
    const ingredient = parseIngredientLine(line);
    if (!ingredient) return false;
    const known = catalogName(ingredient.name);
    if (!known && !looksLikeMaterial(ingredient.name)) return false;
    ingredient.important = false;
    ingredient.uncertain = !known;
    ingredient.name = known || correctedName(ingredient.name);
    const nextBase = baseProcess(ingredient.name);
    const current = steps[steps.length - 1];
    const currentBase = current
      ? (current.ingredients || []).map((item) => baseProcess(item.name)).find(Boolean)
      : "";
    if (nextBase && currentBase && nextBase !== currentBase) startStep(nextBase);
    if (!steps.length) startStep(nextBase || "Process");
    steps[steps.length - 1].ingredients.push(ingredient);
    return true;
  };

  const flushPending = () => {
    if (!pendingQty || !pendingName) return;
    pushIngredient(`${pendingQty} ${pendingName}`);
    pendingQty = "";
    pendingName = "";
  };

  lines.forEach((line) => {
    const header = processBody(line);
    if (header) {
      flushPending();
      pendingQty = "";
      pendingName = "";
      seenStep = true;
      const built = stepFromLine(header);
      startStep(built.processName);
      built.ingredients.forEach((ingredient) => steps[steps.length - 1].ingredients.push(ingredient));
      return;
    }

    if (/^=\s*#?\d{3,6}$/.test(line) || /^#\s*\d{3,6}$/.test(line)) return;

    if (seenStep && isQuantityOnly(line)) {
      if (pendingQty && !pendingName) pendingQty = "";
      if (pendingName && !pendingQty) {
        pendingQty = line;
        flushPending();
      } else {
        pendingQty = line;
      }
      return;
    }

    if (seenStep && isNameOnly(line)) {
      if (pendingName && !pendingQty) pendingName = "";
      if (pendingQty && !pendingName) {
        pendingName = line;
        flushPending();
      } else {
        pendingName = line;
      }
      return;
    }

    if (pendingQty || pendingName) {
      pendingQty = "";
      pendingName = "";
    }

    if (pushIngredient(line)) {
      return;
    }

    if (seenStep) return;

    if (!formulaDate) formulaDate = parseLooseDate(line);
    const withoutDate = stripDate(line);
    if (!formulaNumber && /^\d{3,6}$/.test(withoutDate)) {
      formulaNumber = withoutDate;
      return;
    }
    const words = withoutDate.split(/\s+/).filter((word) => /^[A-Za-z][A-Za-z.'-]{1,20}$/.test(word));
    if (!developer && words.length === 1 && !MONTHS[words[0].toLowerCase().slice(0, 3)]) {
      developer = words[0];
    }
  });

  if (!formulaNumber) {
    const fromName = filenameNumbers(filename);
    formulaNumber = fromName[0] || "";
  }
  const meta = { formulaNumber, linkedNumbers: [], colorName: "" };
  applyFilenameHint(meta, filename);
  const processNames = steps.map((step) => String(step.processName || "").toLowerCase());
  const adjustment = processNames.length > 0 && processNames.every((name) => /\btoner\b|\bglaze\b/.test(name));
  const noteBits = [];
  lines.forEach((line) => {
    const text = String(line || "").trim();
    if (!text || processBody(text) || parseIngredientLine(text) || isQuantityOnly(text)) return;
    if (/^\d{3,6}$/.test(text)) return;
    if (/\bto\s+fix\b|\bfix(?:ing)?\b/i.test(text)) noteBits.push(text);
    else if (/\b[a-z]{3,}\s+to\s+[a-z]{3,}\b/i.test(text)) noteBits.push(text);
  });
  const adjustmentNote = [...new Set(noteBits)].join(". ");
  if (adjustment) {
    steps.forEach((step) => {
      if (!step.importantNotes && adjustmentNote) {
        step.importantNotes = adjustmentNote;
        step.important = true;
      }
    });
  }

  if (!adjustment && !meta.formulaNumber) warnings.push("Type the custom number. It was not read from the photo.");
  if (!steps.length) warnings.push("No steps were read from the photo. Enter them before you save.");
  if (adjustment) warnings.push("This looks like a toner or glaze for an existing custom stain. Confirm which stain it belongs to.");

  return {
    ok: !!(meta.formulaNumber || steps.length),
    adjustment: adjustment ? { suggestedNumber: meta.formulaNumber || "", note: adjustmentNote } : null,
    warnings,
    draft: {
      formulaNumber: meta.formulaNumber,
      linkedNumbers: meta.linkedNumbers,
      colorName: meta.colorName,
      classification: classificationFromNumber(meta.formulaNumber),
      materialForm: "unknown",
      woodSpecies: "",
      woodType: "",
      formulaDate,
      jobNumber: "",
      doorStyle: "",
      constructionStyle: "",
      sheen: "",
      glaze: "",
      distressing: "",
      colorStatus: "",
      developer,
      salesperson: "",
      specialNotes: "",
      importantFields: [],
      reviewStatus: "needs_review",
      steps,
      sourceFilename: filename,
    },
  };
}

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require("tesseract.js");
      const worker = await createWorker("eng", 1, {
        cachePath: path.join(__dirname, ".tesseract-cache"),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
      });
      return worker;
    })();
  }
  return workerPromise;
}

function ocrWithVision(imageBuffer) {
  if (process.platform !== "darwin") return Promise.resolve("");
  const bin = path.join(__dirname, ".ocr-bin", "visionOcr");
  if (!fs.existsSync(bin)) return Promise.resolve("");
  const tmp = path.join(os.tmpdir(), `stain-ocr-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
  fs.writeFileSync(tmp, imageBuffer);
  return new Promise((resolve) => {
    execFile(bin, [tmp], { timeout: 30000 }, (error, stdout) => {
      fs.unlink(tmp, () => {});
      resolve(error ? "" : String(stdout || ""));
    });
  });
}

async function ocrHandwrittenFormula(imageBuffer) {
  const vision = await ocrWithVision(imageBuffer);
  if (vision.trim()) return vision;
  const worker = await getWorker();
  const { data } = await worker.recognize(imageBuffer);
  return String(data?.text || "");
}

module.exports = {
  parseHandwrittenFormula,
  ocrHandwrittenFormula,
  tidyProcessName,
};
