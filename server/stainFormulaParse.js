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

function filenameNumbers(filename) {
  const base = String(filename || "").replace(/\.[^.]+$/, "");
  const found = [];
  const re = /#?(\d{3,6})(?!\d)/g;
  let match = re.exec(base);
  while (match) {
    if (!found.includes(match[1])) found.push(match[1]);
    match = re.exec(base);
  }
  return found;
}

function filenameNumber(filename) {
  return filenameNumbers(filename)[0] || "";
}

/** Wood, file, and status words. These are not a color name. */
const FILENAME_SKIP_WORDS = new Set([
  "solid", "veneer", "oak", "maple", "alder", "walnut", "cherry", "beech",
  "rift", "quarter", "sawn", "white", "red", "stain", "stains", "formula",
  "formulas", "sheen", "door", "shaker", "mini", "sample", "temp", "temporary",
  "hold", "pending", "delete", "deleted", "unused", "cancelled", "canceled",
  "cancel", "void", "copy", "final", "new", "old", "updated", "revised",
  "revision", "draft", "test", "demo", "do", "not", "use", "dont", "note",
  "notes", "see", "file", "files", "wood", "species", "custom", "standard",
  "paint", "process", "step", "steps", "job", "number", "no", "yes", "ok",
  "wip", "archive", "archived", "backup", "version", "ver", "edit", "edited",
  "fixed", "fix", "glaze", "toner", "dye", "clear", "sealer", "topcoat", "top",
  "coat", "base", "mix", "mixed", "customer", "special",
  "img", "image", "images", "photo", "photos", "picture", "pictures",
  "jpeg", "jpg", "png", "heic", "screenshot", "camera", "scan",
]);

/**
 * Former custom colors that are stock standard names now.
 * A short file-name match is listed under the word, not the old number.
 */
const STANDARD_COLOR_NAMES = new Set([
  "sand", "graphite", "honey", "honey oak", "acier", "truffle", "ebony",
  "slate", "taupe", "linen", "oatmeal", "pewter", "bronze", "chestnut",
  "espresso", "mocha", "sable", "mink", "driftwood", "charcoal", "ivory",
  "cream", "beige", "cocoa", "coffee", "umber", "sienna", "khaki", "greige",
  "stone", "ash", "smoke", "fog", "mist", "dune", "wheat", "caramel",
  "toffee", "cinnamon", "nutmeg", "pecan", "onyx", "steel", "nickel",
  "copper", "rust", "clay", "adobe", "blush", "rose", "natural", "hazel",
]);

function filenameTail(filename) {
  return String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/#?\d{3,6}(?!\d)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlePhrase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function standardColorName(text) {
  const words = String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (!words.length || words.length > 2) return "";
  const joined = words.join(" ");
  if (STANDARD_COLOR_NAMES.has(joined)) return titlePhrase(joined);
  const colors = words.filter((word) => STANDARD_COLOR_NAMES.has(word));
  const other = words.filter((word) => !STANDARD_COLOR_NAMES.has(word) && !FILENAME_SKIP_WORDS.has(word));
  if (colors.length && !other.length) return titlePhrase(colors.join(" "));
  return "";
}

function adoptStandardName(meta, name) {
  const previous = String(meta.formulaNumber || "").trim();
  if (previous && previous.toLowerCase() !== name.toLowerCase()) {
    const links = Array.isArray(meta.linkedNumbers) ? meta.linkedNumbers.slice() : [];
    if (!links.includes(previous)) links.unshift(previous);
    meta.linkedNumbers = links;
  }
  meta.formulaNumber = name;
}

/** Words after the custom number go in the color description. A known color name is listed as that standard color. */
function applyFilenameHint(meta, filename) {
  const tail = filenameTail(filename);
  const words = tail ? tail.split(/\s+/) : [];
  const sheetColor = String(meta.colorName || "").trim();
  const fileOnly = words.length > 0 && words.every((word) => {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    return !clean || FILENAME_SKIP_WORDS.has(clean);
  });
  if (tail && !fileOnly) {
    if (!sheetColor) meta.colorName = tail;
    else if (!sheetColor.toLowerCase().includes(tail.toLowerCase())) meta.colorName = `${sheetColor} · ${tail}`;
  }
  const named = (words.length <= 2 ? standardColorName(tail) : "") || standardColorName(sheetColor);
  if (named) {
    adoptStandardName(meta, named);
    return;
  }
  if (!String(meta.formulaNumber || "").trim() && tail && !fileOnly) {
    adoptStandardName(meta, titlePhrase(tail));
  }
}

/** The boxed custom number sits to the right of the header, outside columns A–G. */
function sheetFormulaNumber(rows) {
  let best = "";
  let bestCol = -1;
  const limit = Math.min(rows.length, 10);
  for (let r = 0; r < limit; r += 1) {
    const row = rows[r] || [];
    const width = Math.min(row.length, 12);
    for (let c = 0; c < width; c += 1) {
      const text = cellText(row[c]);
      if (!/^\d{3,6}$/.test(text)) continue;
      const nearby = [row[c - 1], row[c - 2], row[c + 1]].map((cell) => cellText(cell)).join(" ");
      if (/job/i.test(nearby)) continue;
      if (c >= bestCol) {
        best = text;
        bestCol = c;
      }
    }
  }
  return best;
}

/** A leading letter is standard. A number starting with 3 or 4 is a paint process. Anything else is custom. */
function classificationFromNumber(formulaNumber) {
  const raw = String(formulaNumber || "").trim();
  if (/^[A-Za-z]/.test(raw)) return "standard";
  const text = raw.replace(/^#+/, "");
  if (/^[34]/.test(text)) return "paint";
  return "custom";
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
    }
  }

  const fromName = filenameNumbers(filename);
  const fromSheet = sheetFormulaNumber(rows);
  if (fromName.length > 1) {
    meta.formulaNumber = fromName[0];
    meta.linkedNumbers = fromName.slice(1);
    if (fromSheet && fromSheet !== meta.formulaNumber && !meta.linkedNumbers.includes(fromSheet)) {
      meta.linkedNumbers.push(fromSheet);
    }
  } else {
    meta.formulaNumber = fromSheet || fromName[0] || "";
    meta.linkedNumbers = [];
  }
  applyFilenameHint(meta, filename);

  const wood = materialFromWood(meta.woodType);
  if (!meta.formulaNumber) {
    warnings.push("Type the custom number. It was not in the sheet header or the file name.");
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
        const step = {
          stepNumber: hit.number,
          processName: STEP_RE.test(processName) ? "" : processName,
          important: false,
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
    const colorants = (step.ingredients || []).filter((ing) =>
      String(ing.name || ing.rawLine || ing.quantityText || "").trim(),
    );
    const lines = [step.importantNotes, step.notes]
      .flatMap((text) => String(text || "").split(/\n/))
      .map((text) => text.trim())
      .filter(Boolean);
    if (colorants.length || !lines.length) return;
    step.ingredients = lines.map((name) => ({
      quantityText: "",
      quantity: null,
      unit: "",
      name,
      rawLine: name,
      uncertain: false,
      important: false,
    }));
    step.importantNotes = "";
    step.notes = "";
    step.important = false;
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
      linkedNumbers: meta.linkedNumbers,
      colorName: meta.colorName,
      classification: classificationFromNumber(meta.formulaNumber),
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
      importantFields: [],
      reviewStatus: "needs_review",
      steps,
      sourceFilename: filename,
    },
  };
}

const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Photos embedded in the workbook. Tiny leftover icons are skipped. */
async function workbookImages(buffer) {
  let JSZip;
  try {
    JSZip = require("jszip");
  } catch {
    return [];
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [];
  }
  const referenced = new Set();
  const relNames = Object.keys(zip.files).filter((name) => /xl\/(?:drawings|worksheets)\/_rels\/.+\.rels$/i.test(name));
  for (const name of relNames) {
    const xml = await zip.files[name].async("string");
    const matches = xml.match(/media\/[^"']+/gi) || [];
    matches.forEach((match) => referenced.add(match.split("/").pop().toLowerCase()));
  }
  const names = Object.keys(zip.files)
    .filter((name) => /^xl\/media\//i.test(name) && !zip.files[name].dir)
    .sort();
  const images = [];
  for (const name of names) {
    const base = name.split("/").pop() || "image";
    if (referenced.size && !referenced.has(base.toLowerCase())) continue;
    const ext = (base.split(".").pop() || "").toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) continue;
    const bytes = await zip.files[name].async("nodebuffer");
    if (bytes.length < 4096) continue;
    images.push({ filename: base, mime, bytes });
    if (images.length >= 8) break;
  }
  return images;
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
  classificationFromNumber,
  filenameNumbers,
  applyFilenameHint,
  workbookImages,
  cellText,
};
