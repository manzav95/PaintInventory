"use strict";

/**
 * Read stain formula workbooks. Only columns A–G are the formula.
 * Anything to the right is leftover Excel dropdown data and is ignored.
 * Macros are never executed; SheetJS reads cell values only.
 */

const STEP_RE = /^step\s+(\d+)\s*$/i;
const QTY_RE =
  /^(\d+(?:\.\d+)?)\s*(gallons?|grams?|oz|g|gal|lbs?|ml|kg)\b\s*(.+)$/i;
const STUCK_RE = /^(\d+(?:\.\d+)?)(oz|gal|g|grams?)\s+(.+)$/i;

function cellText(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeUnit(unit) {
  const u = String(unit || "").toLowerCase();
  if (u === "g" || u.startsWith("gram")) return "g";
  if (u.startsWith("gal")) return "gal";
  if (u === "oz") return "oz";
  if (u.startsWith("lb")) return "lb";
  if (u === "ml") return "ml";
  if (u === "kg") return "kg";
  return u;
}

function parseIngredientLine(line) {
  const text = cellText(line);
  if (!text) return null;
  let m = text.match(QTY_RE) || text.match(STUCK_RE);
  if (!m) return null;
  return {
    quantityText: m[1],
    quantity: Number(m[1]),
    unit: normalizeUnit(m[2]),
    name: cellText(m[3]),
    rawLine: text,
    uncertain: false,
  };
}

function labelKey(label) {
  const s = cellText(label).replace(/:$/, "").toLowerCase();
  if (s.startsWith("color status")) return "colorStatus";
  if (s.startsWith("date")) return "formulaDate";
  if (s.startsWith("job")) return "jobNumber";
  if (s.startsWith("wood")) return "woodType";
  if (s.startsWith("color description")) return "colorName";
  if (s.startsWith("special")) return "specialNotes";
  if (s.startsWith("developer")) return "developer";
  if (s.startsWith("sales")) return "salesperson";
  if (s.startsWith("door")) return "doorStyle";
  if (s.startsWith("construction")) return "constructionStyle";
  if (s.startsWith("sheen")) return "sheen";
  if (s.startsWith("glaze")) return "glaze";
  if (s.startsWith("distress")) return "distressing";
  return "";
}

function materialFromWood(woodType) {
  const raw = cellText(woodType);
  const lower = raw.toLowerCase();
  let materialForm = "unknown";
  if (/\bveneer\b/.test(lower)) materialForm = "veneer";
  else if (/\bsolid\b/.test(lower)) materialForm = "solid";
  const species = raw
    .replace(/\bveneer\b/gi, "")
    .replace(/\bsolid\b/gi, "")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    materialForm,
    species,
    woodType: materialForm === "unknown" ? "" : materialForm,
  };
}

function filenameNumber(filename) {
  const m = String(filename || "").match(/(\d{3,6})/);
  return m ? m[1] : "";
}

/** #1401 or 1401… is custom. A word name such as Honey Oak is standard. */
function classificationFromColor(colorName) {
  const stripped = String(colorName || "").trim().replace(/^#+\s*/, "");
  if (!stripped) return "custom";
  return /^\d/.test(stripped) ? "custom" : "standard";
}

function colLetter(index) {
  return String.fromCharCode(65 + index);
}

/**
 * Cells whose font is pure red (Excel rgb FFFF0000).
 * Only columns A–G. Dropdown columns are ignored.
 */
async function redCellSet(buffer) {
  const red = new Set();
  try {
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const stylesFile = zip.file("xl/styles.xml");
    const sheetFile =
      zip.file("xl/worksheets/sheet1.xml") ||
      Object.keys(zip.files)
        .filter((name) => /xl\/worksheets\/sheet/i.test(name))
        .map((name) => zip.file(name))[0];
    if (!stylesFile || !sheetFile) return red;
    const styles = await stylesFile.async("string");
    const fonts = styles.match(/<font\b[\s\S]*?<\/font>/g) || [];
    const redFonts = new Set();
    fonts.forEach((font, index) => {
      if (/rgb="FFFF0000"/i.test(font)) redFonts.add(index);
    });
    const cellXfs = (styles.split("<cellXfs")[1] || "").split("</cellXfs")[0] || "";
    const xfFonts = [...cellXfs.matchAll(/fontId="(\d+)"/g)].map((match) => Number(match[1]));
    const redXf = new Set();
    xfFonts.forEach((fontId, index) => {
      if (redFonts.has(fontId)) redXf.add(index);
    });
    const sheet = await sheetFile.async("string");
    const cells = [...sheet.matchAll(/<c r="([A-G]\d+)"([^>]*)>/g)];
    cells.forEach((cell) => {
      const styleMatch = cell[2].match(/\ss="(\d+)"/);
      const style = styleMatch ? Number(styleMatch[1]) : 0;
      if (redXf.has(style)) red.add(cell[1]);
    });
  } catch (error) {
    console.warn("Red font scan skipped:", error?.message || error);
  }
  return red;
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {string} filename
 */
function parseStainWorkbook(workbook, filename = "", redCells = new Set()) {
  const warnings = [];
  const sheetName =
    workbook.SheetNames.find((n) => /formula/i.test(n)) || workbook.SheetNames[0];
  if (!sheetName) {
    return { ok: false, warnings: ["Workbook has no sheets."], draft: null };
  }
  const XLSX = require("xlsx");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });

  const meta = {
    formulaNumber: "",
    formulaDate: "",
    jobNumber: "",
    woodType: "",
    colorName: "",
    specialNotes: "",
    developer: "",
    salesperson: "",
    doorStyle: "",
    constructionStyle: "",
    sheen: "",
    glaze: "",
    distressing: "",
    colorStatus: "",
    importantFields: [],
  };

  const headerRows = Math.min(rows.length, 12);
  for (let r = 0; r < headerRows; r += 1) {
    const row = rows[r] || [];
    if (STEP_RE.test(cellText(row[0]))) break;
    for (const [labelCol, valueCol] of [
      [0, 2],
      [4, 6],
    ]) {
      const key = labelKey(row[labelCol]);
      if (!key) continue;
      const value = cellText(row[valueCol]);
      if (value) meta[key] = value;
      if (value && redCells.has(`${colLetter(valueCol)}${r + 1}`)) {
        meta.importantFields.push(key);
      }
    }
  }

  meta.formulaNumber = filenameNumber(filename);

  const wood = materialFromWood(meta.woodType);
  if (!meta.formulaNumber) {
    warnings.push("Custom number was not found in the filename.");
  }

  const stepCols = [0, 3, 6];
  const steps = [];
  let active = null;

  const closeActive = () => {
    active = null;
  };

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const headerHits = stepCols
      .map((col) => {
        const m = cellText(row[col]).match(STEP_RE);
        return m ? { col, number: Number(m[1]) } : null;
      })
      .filter(Boolean);
    if (headerHits.length) {
      closeActive();
      const nextRow = rows[r + 1] || [];
      headerHits.forEach((hit) => {
        const processName = cellText(nextRow[hit.col]);
        const nameCell = `${colLetter(hit.col)}${r + 2}`;
        const step = {
          stepNumber: hit.number,
          processName: STEP_RE.test(processName) ? "" : processName,
          important: redCells.has(nameCell) && !STEP_RE.test(processName),
          notes: "",
          importantNotes: "",
          ingredients: [],
          col: hit.col,
        };
        steps.push(step);
      });
      active = steps.slice(-headerHits.length);
      r += 1;
      continue;
    }
    if (!active) continue;
    let any = false;
    active.forEach((step) => {
      const text = cellText(row[step.col]);
      if (!text) return;
      any = true;
      const important = redCells.has(`${colLetter(step.col)}${r + 1}`);
      const ingredient = parseIngredientLine(text);
      if (ingredient) {
        ingredient.important = important;
        step.ingredients.push(ingredient);
      } else if (important) {
        step.importantNotes = step.importantNotes
          ? `${step.importantNotes}\n${text}`
          : text;
      } else {
        step.notes = step.notes ? `${step.notes}\n${text}` : text;
      }
    });
    if (!any && active.every((s) => s.ingredients.length || s.notes || s.processName)) {
      /* keep scanning; blank row does not end the block because later rows may fill a column */
    }
  }

  steps.forEach((step) => {
    delete step.col;
  });
  steps.sort((a, b) => a.stepNumber - b.stepNumber);

  if (!steps.length) {
    warnings.push("No processing steps were found. Enter them manually.");
  }

  return {
    ok: true,
    warnings,
    draft: {
      formulaNumber: meta.formulaNumber,
      colorName: meta.colorName,
      classification: classificationFromColor(meta.colorName),
      materialForm: wood.materialForm,
      woodSpecies: wood.species,
      woodType: wood.woodType,
      formulaDate: /^\d{4}-\d{2}-\d{2}$/.test(meta.formulaDate) ? meta.formulaDate : meta.formulaDate,
      jobNumber: meta.jobNumber,
      doorStyle: meta.doorStyle,
      constructionStyle: meta.constructionStyle,
      sheen: meta.sheen,
      glaze: meta.glaze,
      distressing: meta.distressing,
      colorStatus: meta.colorStatus,
      developer: meta.developer,
      salesperson: meta.salesperson,
      specialNotes: meta.specialNotes,
      importantFields: meta.importantFields,
      reviewStatus: "needs_review",
      steps,
      sourceFilename: filename,
    },
  };
}

async function parseStainExcelBuffer(buffer, filename) {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    bookVBA: false,
  });
  const redCells = await redCellSet(buffer);
  return parseStainWorkbook(workbook, filename, redCells);
}

module.exports = {
  parseStainWorkbook,
  parseStainExcelBuffer,
  parseIngredientLine,
  classificationFromColor,
  cellText,
};
