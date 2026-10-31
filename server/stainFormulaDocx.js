"use strict";

const JSZip = require("jszip");
const {
  applyFilenameHint,
  classificationFromNumber,
  filenameNumbers,
  parseIngredientLine,
} = require("./stainFormulaParse");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function xmlText(xml) {
  const pieces = [];
  const re = /<w:(t|tab|br)\b[^>]*>([\s\S]*?)<\/w:\1>|<w:(tab|br)\b[^>]*\/>/gi;
  let match = re.exec(String(xml || ""));
  while (match) {
    const kind = match[1] || match[3];
    if (kind === "tab") pieces.push("\t");
    else if (kind === "br") pieces.push("\n");
    else pieces.push(decodeXml(match[2].replace(/<[^>]+>/g, "")));
    match = re.exec(String(xml || ""));
  }
  return pieces
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function tableRows(xml) {
  const rows = [];
  const rowMatches = String(xml || "").match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) || [];
  rowMatches.forEach((rowXml) => {
    const cells = (rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) || []).map(
      (cellXml) => {
        const paragraphs =
          cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/gi) || [cellXml];
        return paragraphs
          .map(xmlText)
          .filter(Boolean)
          .join("\n")
          .trim();
      },
    );
    if (cells.some(Boolean)) rows.push(cells);
  });
  return rows;
}

async function extractDocxContent(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Word document has no document.xml.");
  const xml = await documentFile.async("string");
  const body = (xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i) || [])[1] || xml;
  const blocks = [];
  const rows = [];
  const re = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/gi;
  let match = re.exec(body);
  while (match) {
    if (match[1].toLowerCase() === "tbl") {
      const table = tableRows(match[0]);
      if (table.length) {
        rows.push(...table);
        blocks.push(...table.map((row) => row.filter(Boolean).join(" | ")));
      }
    } else {
      const text = xmlText(match[0]);
      if (text) blocks.push(text);
    }
    match = re.exec(body);
  }
  return {
    rows,
    lines: blocks
      .flatMap((block) => String(block || "").split(/\n/))
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  const text = cleanText(value);
  let match = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function woodFields(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();
  const materialForm = /\bveneer\b/.test(lower)
    ? "veneer"
    : /\bsolid\b/.test(lower)
      ? "solid"
      : "unknown";
  const woodSpecies = text
    .replace(/\b(?:veneer|solid)\b/gi, "")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    materialForm,
    woodSpecies,
    woodType: materialForm === "unknown" ? "" : materialForm,
  };
}

const QTY_ONLY =
  /^(\d+(?:\.\d+)?)\s*(gallons?|grams?|ounces?|oz|g|gal|lbs?|ml|kg)\.?$/i;
const QTY_AT_END =
  /^([\s\S]*?)\s+(\d+(?:\.\d+)?)\s*(gallons?|grams?|ounces?|oz|g|gal|lbs?|ml|kg)\.?$/i;

function normalizeUnit(value) {
  const unit = String(value || "").toLowerCase();
  if (unit === "g" || unit.startsWith("gram")) return "g";
  if (unit === "oz" || unit.startsWith("ounce")) return "oz";
  if (unit.startsWith("gal")) return "gal";
  if (unit.startsWith("lb")) return "lb";
  return unit;
}

function typedIngredient(cell) {
  const original = String(cell || "").trim();
  const lines = original
    .split(/\n/)
    .map(cleanText)
    .filter(Boolean);
  if (!lines.length) return null;

  const joined = lines.join(" ");
  const leading = parseIngredientLine(joined);
  if (leading) {
    leading.rawLine = joined;
    leading.uncertain = false;
    leading.important = false;
    return leading;
  }

  let quantityText = "";
  let unit = "";
  let nameLines = lines.slice();
  const lastQty = lines[lines.length - 1].match(QTY_ONLY);
  if (lastQty && lines.length > 1) {
    quantityText = lastQty[1];
    unit = normalizeUnit(lastQty[2]);
    nameLines = lines.slice(0, -1);
  } else {
    const trailing = joined.match(QTY_AT_END);
    if (trailing && cleanText(trailing[1])) {
      quantityText = trailing[2];
      unit = normalizeUnit(trailing[3]);
      nameLines = [cleanText(trailing[1])];
    }
  }

  const name = cleanText(nameLines.join(" "));
  if (!name || (!quantityText && QTY_ONLY.test(name))) return null;
  return {
    quantityText,
    quantity: quantityText ? Number(quantityText) : null,
    unit,
    name,
    rawLine: joined,
    uncertain: false,
    important: false,
  };
}

function appendLine(target, key, value) {
  const text = cleanText(value);
  if (!text) return;
  target[key] = target[key] ? `${target[key]}\n${text}` : text;
}

function parseStepRows(rows) {
  const steps = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const headers = row.map((cell, col) => {
      const match = cleanText(cell).match(/^step\s+(\d+)\b/i);
      return match ? { col, stepNumber: Number(match[1]) } : null;
    });
    if (!headers.some(Boolean)) continue;

    const processRow = rows[rowIndex + 1] || [];
    const active = headers.map((header) => {
      if (!header) return null;
      const step = {
        stepNumber: header.stepNumber,
        processName: cleanText(processRow[header.col]) || "Process",
        notes: "",
        importantNotes: "",
        important: false,
        ingredients: [],
      };
      steps.push(step);
      return step;
    });
    rowIndex += 1;

    while (rowIndex + 1 < rows.length) {
      const next = rows[rowIndex + 1] || [];
      if (next.some((cell) => /^step\s+\d+\b/i.test(cleanText(cell)))) break;
      rowIndex += 1;
      next.forEach((cell, col) => {
        const step = active[col];
        const text = String(cell || "").trim();
        if (!step || !text) return;
        const pieces = text
          .split(/\n(?=\s*(?:note|important)\s*:)/i)
          .map((piece) => piece.trim())
          .filter(Boolean);
        pieces.forEach((piece) => {
          const note = piece.match(/^(?:note|important)\s*:\s*([\s\S]*)$/i);
          if (note) {
            appendLine(step, "notes", note[1]);
            return;
          }
          const ingredient = typedIngredient(piece);
          if (ingredient) step.ingredients.push(ingredient);
          else appendLine(step, "notes", piece);
        });
      });
    }
  }
  return steps
    .filter(
      (step) =>
        step.processName !== "Process" ||
        step.ingredients.length ||
        step.notes ||
        step.importantNotes,
    )
    .sort((a, b) => a.stepNumber - b.stepNumber);
}

function valueAfterLabel(line, label) {
  const match = cleanText(line).match(
    new RegExp(`^${label}\\s*(?:#|:|-)?\\s*(.*)$`, "i"),
  );
  return match ? cleanText(match[1]) : "";
}

async function parseTypedDocx(buffer, filename = "") {
  const content = await extractDocxContent(buffer);
  const lines = content.lines;
  const firstStep = lines.findIndex((line) => /^step\s+\d+\b/i.test(line));
  const headerLines = firstStep >= 0 ? lines.slice(0, firstStep) : lines;
  const fromName = filenameNumbers(filename);
  const meta = {
    formulaNumber: fromName[0] || "",
    linkedNumbers: fromName.slice(1),
    colorName: "",
    formulaDate: "",
    jobNumber: "",
    wood: "",
    specialNotes: "",
    colorStatus: "",
    developer: "",
    salesperson: "",
    doorStyle: "",
    constructionStyle: "",
    sheen: "",
    glaze: "",
    distressing: "",
  };

  let captureDescription = false;
  headerLines.forEach((line) => {
    const text = cleanText(line);
    const custom = text.match(
      /custom\s+color(?:\s+custom\s+color)?\s*#?\s*(\d{3,6})\s*[\/-]\s*(.+)$/i,
    );
    if (custom) {
      meta.formulaNumber = custom[1];
      meta.colorName = cleanText(custom[2]);
      captureDescription = false;
      return;
    }
    const labels = [
      ["formulaDate", "date"],
      ["jobNumber", "job(?:\\s*#|\\s*number)?"],
      ["wood", "wood(?:\\s*type)?"],
      ["colorStatus", "color\\s*status"],
      ["developer", "developer"],
      ["salesperson", "sales(?:person)?"],
      ["doorStyle", "door(?:\\s*style)?"],
      ["constructionStyle", "construction(?:\\s*style)?"],
      ["sheen", "sheen"],
      ["glaze", "glaze"],
      ["distressing", "distress(?:ing)?"],
    ];
    for (const [key, label] of labels) {
      if (!new RegExp(`^${label}\\b`, "i").test(text)) continue;
      meta[key] = valueAfterLabel(text, label);
      captureDescription = false;
      return;
    }
    if (/^color\s+description\b/i.test(text)) {
      appendLine(
        meta,
        "specialNotes",
        valueAfterLabel(text, "color\\s+description"),
      );
      captureDescription = true;
      return;
    }
    if (
      captureDescription &&
      !/^developer['’]?s?\s+signature\b/i.test(text)
    ) {
      appendLine(meta, "specialNotes", text);
    }
  });

  if (!meta.colorName) applyFilenameHint(meta, filename);
  const wood = woodFields(meta.wood);
  const steps = parseStepRows(content.rows);
  const warnings = [];
  if (!meta.formulaNumber) {
    warnings.push("The custom number was not found in the document.");
  }
  if (!steps.length) {
    warnings.push("No processing steps were found in the Word document.");
  }

  return {
    ok: !!(meta.formulaNumber || steps.length),
    warnings,
    draft: {
      formulaNumber: meta.formulaNumber,
      linkedNumbers: meta.linkedNumbers,
      colorName: meta.colorName,
      classification: classificationFromNumber(meta.formulaNumber),
      materialForm: wood.materialForm,
      woodSpecies: wood.woodSpecies,
      woodType: wood.woodType,
      formulaDate: normalizeDate(meta.formulaDate),
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
    text: lines.join("\n"),
  };
}

module.exports = { extractDocxContent, parseTypedDocx };
