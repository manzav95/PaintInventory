"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { parseIngredientLine, classificationFromNumber, filenameNumbers, applyFilenameHint } = require("./stainFormulaParse");
const { matchColorant } = require("./colorantCatalog");

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function tidyProcessName(text) {
  const cleaned = String(text || "")
    .replace(/\btop\s*co[a-z]{2,8}\b/gi, "topcoat")
    .replace(/\bseal[a-z]{1,4}\b/gi, "sealer")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/\b([a-z])([a-z']*)/g, (_, first, rest) => first.toUpperCase() + rest);
}

function normalizeOcrLine(line) {
  return String(line || "")
    .replace(/[|]/g, " ")
    .replace(/\b(\d+(?:\.\d+)?)\s+[gqv][a-z]{2,8}\b/gi, "$1 grams")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLooseDate(text) {
  const month = String(text || "").match(
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

function catalogName(name) {
  const hit = matchColorant(name);
  return hit ? hit.name : String(name || "").trim();
}

function nameOnlyIngredient(name) {
  const text = catalogName(name);
  if (!text) return null;
  return {
    quantityText: "",
    quantity: null,
    unit: "",
    name: text,
    rawLine: text,
    uncertain: false,
    important: false,
  };
}

function stepFromLine(body) {
  const text = tidyProcessName(body);
  const split = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split && !parseIngredientLine(split[2])) {
    const ingredient = nameOnlyIngredient(split[2]);
    return {
      processName: tidyProcessName(split[1]),
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
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeOcrLine)
    .filter(Boolean);

  const warnings = [];
  let formulaDate = "";
  let formulaNumber = "";
  let developer = "";
  const steps = [];
  let seenStep = false;

  lines.forEach((line) => {
    const markedStep = line.match(/^(\d{1,2})\s*[.)]\s+(.+)$/);
    const looseStep = line.match(/^(\d{1,2})\s+(?!\d)(.+)$/);
    const stepMatch = markedStep || (looseStep && !parseIngredientLine(line) ? looseStep : null);
    if (stepMatch) {
      seenStep = true;
      const built = stepFromLine(stepMatch[2]);
      steps.push({
        stepNumber: steps.length + 1,
        processName: built.processName,
        notes: "",
        importantNotes: "",
        important: false,
        ingredients: built.ingredients,
      });
      return;
    }

    const ingredient = parseIngredientLine(line);
    if (ingredient && steps.length) {
      ingredient.important = false;
      ingredient.name = catalogName(ingredient.name);
      steps[steps.length - 1].ingredients.push(ingredient);
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
  if (!meta.formulaNumber) warnings.push("Type the custom number. It was not read from the photo.");
  if (!steps.length) warnings.push("No steps were read from the photo. Enter them before you save.");

  return {
    ok: !!(meta.formulaNumber || steps.length),
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
