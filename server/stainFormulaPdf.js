"use strict";

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

function displayValue(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    const year = value.getUTCFullYear();
    const fmt = String(cell.numFmt || "").toLowerCase();
    if (fmt.includes("yy")) return `${month}/${day}/${String(year).slice(-2)}`;
    return `${month}/${day}/${year}`;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.text != null) return String(value.text);
    if (value.result != null && typeof value.result !== "object") return String(value.result);
    return "";
  }
  return String(value);
}

function fontColor(font) {
  const argb = font?.color?.argb;
  if (argb && String(argb).length >= 6) return `#${String(argb).slice(-6)}`;
  return "#000000";
}

function fillColor(fill) {
  if (!fill || fill.pattern === "none" || fill.type === "none") return "";
  const argb = fill.fgColor?.argb;
  if (!argb || String(argb).length < 6) return "";
  const hex = String(argb).slice(-6).toUpperCase();
  if (hex === "FFFFFF") return "";
  return `#${hex}`;
}

function columnWidth(column) {
  const width = Number(column?.width) || 10;
  return width * 5.25;
}

function rowHeight(row) {
  const height = Number(row?.height);
  return height > 0 ? height : 18;
}

function columnNumber(letters) {
  return String(letters || "")
    .toUpperCase()
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function printBounds(sheet) {
  const area = String(sheet.pageSetup?.printArea || "").split(",")[0].trim();
  const match = area.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    minCol: columnNumber(match[1]),
    minRow: Number(match[2]),
    maxCol: columnNumber(match[3]),
    maxRow: Number(match[4]),
  };
}

async function workbookToPdf(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet =
    workbook.worksheets.find((item) => /formula/i.test(item.name)) || workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no sheets.");

  const bounds = printBounds(sheet);
  const columns = [];
  for (let index = 1; index <= sheet.columnCount; index += 1) {
    if (bounds && (index < bounds.minCol || index > bounds.maxCol)) continue;
    const column = sheet.getColumn(index);
    if (column.hidden) continue;
    columns.push({ index, width: columnWidth(column) });
  }
  const rows = [];
  for (let index = 1; index <= sheet.rowCount; index += 1) {
    if (bounds && (index < bounds.minRow || index > bounds.maxRow)) continue;
    const row = sheet.getRow(index);
    if (row.hidden) continue;
    rows.push({ index, height: rowHeight(row) });
  }
  if (!columns.length || !rows.length) throw new Error("Workbook sheet is empty.");

  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const margin = 8;
  const pageWidth = totalWidth + margin * 2;
  const pageHeight = totalHeight + margin * 2;

  const xAt = {};
  let cursor = 0;
  columns.forEach((column) => {
    xAt[column.index] = cursor;
    cursor += column.width;
  });
  const yAt = {};
  cursor = 0;
  rows.forEach((row) => {
    yAt[row.index] = cursor;
    cursor += row.height;
  });
  const colIndex = new Map(columns.map((column, index) => [column.index, index]));
  const rowIndex = new Map(rows.map((row, index) => [row.index, index]));

  function spanSize(startCol, endCol, startRow, endRow) {
    let width = 0;
    let height = 0;
    for (let col = startCol; col <= endCol; col += 1) {
      const found = columns.find((column) => column.index === col);
      if (found) width += found.width;
    }
    for (let row = startRow; row <= endRow; row += 1) {
      const found = rows.find((item) => item.index === row);
      if (found) height += found.height;
    }
    return { width, height };
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.save();
    doc.translate(margin, margin);

    rows.forEach((rowInfo) => {
      columns.forEach((columnInfo) => {
        const cell = sheet.getCell(rowInfo.index, columnInfo.index);
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        const merge = sheet._merges?.[cell.address];
        const model = merge?.model;
        const endCol = model ? model.right : columnInfo.index;
        const endRow = model ? model.bottom : rowInfo.index;
        if (!colIndex.has(columnInfo.index) || !rowIndex.has(rowInfo.index)) return;
        const { width, height } = spanSize(columnInfo.index, endCol, rowInfo.index, endRow);
        const x = xAt[columnInfo.index];
        const y = yAt[rowInfo.index];
        const background = fillColor(cell.fill);
        if (background) {
          doc.save();
          doc.rect(x, y, width, height).fill(background);
          doc.restore();
        }
        const border = cell.border || {};
        doc.save();
        doc.lineWidth(0.6).strokeColor("#222222");
        ["top", "bottom", "left", "right"].forEach((side) => {
          if (!border[side]?.style) return;
          if (side === "top") doc.moveTo(x, y).lineTo(x + width, y).stroke();
          if (side === "bottom") doc.moveTo(x, y + height).lineTo(x + width, y + height).stroke();
          if (side === "left") doc.moveTo(x, y).lineTo(x, y + height).stroke();
          if (side === "right") doc.moveTo(x + width, y).lineTo(x + width, y + height).stroke();
        });
        doc.restore();
        const text = displayValue(cell);
        if (!text) return;
        let size = Math.max(8, Number(cell.font?.size) || 11);
        const align = cell.alignment?.horizontal === "center"
          ? "center"
          : cell.alignment?.horizontal === "right"
            ? "right"
            : "left";
        const maxW = Math.max(4, width - 6);
        doc.save();
        doc.font(cell.font?.bold ? "Helvetica-Bold" : "Helvetica").fillColor(fontColor(cell.font));
        doc.fontSize(size);
        while (size > 6 && doc.widthOfString(text) > maxW) {
          size -= 0.5;
          doc.fontSize(size);
        }
        const textHeight = doc.currentLineHeight();
        const top = cell.alignment?.vertical === "middle"
          ? y + Math.max(1, (height - textHeight) / 2)
          : y + 2;
        doc.text(text, x + 3, top, {
          width: maxW,
          height: Math.max(4, height - 2),
          align,
          lineBreak: false,
        });
        doc.restore();
      });
    });

    doc.restore();
    doc.end();
  });
}

module.exports = { workbookToPdf };
