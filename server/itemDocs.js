"use strict";

const ALLOWED_KINDS = new Set(["sds", "pds", "tds"]);
const ALLOWED_TYPES = new Set([
  "paint",
  "primer",
  "clear",
  "catalyst",
  "stain",
  "dye",
  "precat",
  "custom_paint",
  "custom_stain",
]);

const TYPE_LABELS = {
  paint: "Paint",
  primer: "Primer",
  clear: "Clear",
  catalyst: "Catalyst",
  stain: "Stain",
  dye: "Dye",
  precat: "PreCat",
  custom_paint: "Custom Paint",
  custom_stain: "Custom Stain",
};

async function ensureItemDocTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_docs (
      id SERIAL PRIMARY KEY,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/pdf',
      bytes BYTEA NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS type_docs (
      id SERIAL PRIMARY KEY,
      item_type TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/pdf',
      bytes BYTEA NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_item_docs_item_kind ON item_docs (item_id, kind)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_type_docs_type_kind ON type_docs (item_type, kind)`,
  );
}

function normalizeKind(kind) {
  const k = String(kind || "")
    .trim()
    .toLowerCase();
  return ALLOWED_KINDS.has(k) ? k : "";
}

function normalizeType(type) {
  const t = String(type || "")
    .trim()
    .toLowerCase();
  if (t === "custom_paint") return "paint";
  if (t === "custom_stain") return "stain";
  return ALLOWED_TYPES.has(t) ? t : "";
}

function typeAliases(type) {
  const t = normalizeType(type);
  if (t === "paint") return ["paint", "custom_paint"];
  if (t === "stain") return ["stain", "custom_stain"];
  return t ? [t] : [];
}

function typeLabel(type) {
  const t = normalizeType(type);
  return TYPE_LABELS[t] || "Item";
}

function downloadBaseName(type, kind) {
  return `${typeLabel(type)} ${String(kind || "sds").toUpperCase()}`;
}

function extFromFilename(filename, mime) {
  const name = String(filename || "");
  const m = name.match(/(\.[a-z0-9]{2,8})$/i);
  if (m) return m[1];
  if (String(mime || "").includes("pdf")) return ".pdf";
  if (String(mime || "").includes("png")) return ".png";
  if (String(mime || "").includes("jpeg") || String(mime || "").includes("jpg"))
    return ".jpg";
  return "";
}

function mimeFromName(filename) {
  const n = String(filename || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

function publicDoc(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    ...extra,
  };
}

module.exports = {
  ensureItemDocTables,
  ALLOWED_KINDS,
  ALLOWED_TYPES,
  normalizeKind,
  normalizeType,
  typeAliases,
  typeLabel,
  downloadBaseName,
  extFromFilename,
  mimeFromName,
  publicDoc,
};
