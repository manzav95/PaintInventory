"use strict";

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const TEMPLATE = path.join(__dirname, "fixtures", "master-blank.xlsm");

const BLOCKS = [
  { header: 8, cols: [1, 4, 7], last: 19 },
  { header: 20, cols: [1, 4, 7], last: 31 },
  { header: 32, cols: [1, 4, 7], last: 41 },
];

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function displayDate(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1].slice(-2)}`;
  return raw;
}

function woodLine(formula) {
  const species = text(formula.woodSpecies);
  const type = text(formula.woodType);
  const form = /^(solid|veneer)$/i.test(type) ? type : "";
  if (species && form && !species.toLowerCase().includes(form.toLowerCase())) {
    return `${species} ${form.charAt(0).toUpperCase()}${form.slice(1).toLowerCase()}`;
  }
  if (species) return species;
  if (form) return form.charAt(0).toUpperCase() + form.slice(1).toLowerCase();
  return type;
}

function colorStatus(formula) {
  const given = text(formula.colorStatus);
  if (given) return given;
  if (formula.reviewStatus === "approved") return "Approved";
  if (formula.reviewStatus === "pending") return "Pending";
  return "";
}

function ingredientLine(ing) {
  const raw = text(ing.rawLine);
  const name = text(ing.name);
  const qty = text(ing.quantityText);
  const unit = text(ing.unit);
  if (raw && (!qty || raw.toLowerCase().includes(qty.toLowerCase()))) return raw;
  return [qty, unit, name || raw].filter(Boolean).join(" ");
}

function stepLines(step) {
  const lines = [];
  (step.ingredients || []).forEach((ing) => {
    const line = ingredientLine(ing);
    if (line) lines.push(line);
  });
  [step.importantNotes, step.notes].forEach((block) => {
    String(block || "")
      .split(/\n/)
      .map((line) => text(line))
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  });
  return lines;
}

function setValue(sheet, row, col, value) {
  const next = text(value);
  if (!next) return;
  sheet.getCell(row, col).value = next;
}

async function fillMasterBlank(formula) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(TEMPLATE));
  const sheet = workbook.getWorksheet("Formula") || workbook.worksheets[0];
  if (!sheet) throw new Error("Master blank has no formula sheet.");

  setValue(sheet, 1, 3, colorStatus(formula));
  setValue(sheet, 1, 7, formula.salesperson);
  setValue(sheet, 1, 9, formula.formulaNumber);
  setValue(sheet, 2, 3, displayDate(formula.formulaDate));
  setValue(sheet, 2, 7, formula.doorStyle);
  setValue(sheet, 3, 3, formula.jobNumber);
  setValue(sheet, 3, 7, formula.constructionStyle);
  setValue(sheet, 4, 3, woodLine(formula));
  setValue(sheet, 4, 7, formula.sheen);
  setValue(sheet, 5, 3, formula.colorName);
  setValue(sheet, 5, 7, formula.glaze);
  setValue(sheet, 6, 3, formula.specialNotes);
  setValue(sheet, 6, 7, formula.distressing);
  setValue(sheet, 7, 3, formula.developer);
  if ((formula.images || []).length || formula.primaryImageId) {
    setValue(sheet, 7, 7, "Yes");
  }

  const steps = (formula.steps || []).filter((step) => text(step.processName) || stepLines(step).length);
  const slots = BLOCKS.flatMap((block) => block.cols.map((col) => ({ header: block.header, col, last: block.last })));
  steps.slice(0, slots.length).forEach((step, index) => {
    const slot = slots[index];
    setValue(sheet, slot.header + 1, slot.col, step.processName);
    const room = slot.last - (slot.header + 2) + 1;
    stepLines(step).slice(0, room).forEach((line, lineIndex) => {
      setValue(sheet, slot.header + 2 + lineIndex, slot.col, line);
    });
  });

  sheet.pageSetup.printArea = "A1:I41";
  return workbook.xlsx.writeBuffer();
}

module.exports = { fillMasterBlank };
