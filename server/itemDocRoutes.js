"use strict";

const stainStore = require("./stainFormulasStore");
const docs = require("./itemDocs");

const MAX_BYTES = 10 * 1024 * 1024;

function decodeUpload(body) {
  const filename = String(body?.filename || "upload").trim() || "upload";
  const raw = String(body?.dataBase64 || body?.base64 || "");
  const cleaned = raw.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!cleaned) return { error: "File data is required" };
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) return { error: "File was empty" };
  if (buffer.length > MAX_BYTES) return { error: "File is larger than 10 MB" };
  return { filename, buffer };
}

function setDownloadFilename(res, name) {
  const safe = String(name || "download").replace(/["\\\r\n]/g, "");
  res.set(
    "Content-Disposition",
    `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
  );
}

function registerItemDocRoutes(app, db) {
  const pool = db.pool;

  async function sessionFrom(req) {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return stainStore.getSession(pool, token);
  }

  async function requireUser(req, res) {
    const session = await sessionFrom(req);
    if (!session) {
      res.status(401).json({ error: "Sign in again to use safety sheets." });
      return null;
    }
    return session;
  }

  async function requireAdmin(req, res) {
    const session = await requireUser(req, res);
    if (!session) return null;
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only." });
      return null;
    }
    return session;
  }

  app.get("/api/safety-docs/summary", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const counts = {};
      const add = (itemType, kind, n) => {
        const type = docs.normalizeType(itemType);
        const k = docs.normalizeKind(kind);
        if (!type || !k) return;
        if (!counts[type]) counts[type] = { sds: 0, pds: 0, eds: 0 };
        counts[type][k] += Number(n) || 0;
      };
      const typeRows = await pool.query(
        `SELECT item_type, kind, COUNT(*)::int AS n
         FROM type_docs GROUP BY item_type, kind`,
      );
      typeRows.rows.forEach((row) => add(row.item_type, row.kind, row.n));
      const itemRows = await pool.query(
        `SELECT LOWER(TRIM(COALESCE(i."type", ''))) AS item_type,
                d.kind, COUNT(*)::int AS n
         FROM item_docs d
         JOIN items i ON i.id = d.item_id
         WHERE COALESCE(TRIM(i."type"), '') <> ''
         GROUP BY 1, 2`,
      );
      itemRows.rows.forEach((row) => add(row.item_type, row.kind, row.n));

      const extraRows = await pool.query(
        `SELECT e.id, e.name, d.kind, COUNT(d.id)::int AS n
         FROM data_sheet_extras e
         LEFT JOIN item_docs d ON d.item_id = $1 || e.id::text
         GROUP BY e.id, e.name, d.kind
         ORDER BY LOWER(e.name), e.id`,
        ["extra-"],
      );
      const extrasById = new Map();
      extraRows.rows.forEach((row) => {
        if (!extrasById.has(row.id)) {
          extrasById.set(row.id, {
            id: row.id,
            name: row.name,
            counts: { sds: 0, pds: 0, eds: 0 },
          });
        }
        const kind = docs.normalizeKind(row.kind);
        if (kind) extrasById.get(row.id).counts[kind] += Number(row.n) || 0;
      });

      const linkedRows = await pool.query(
        `SELECT d.item_id, d.kind, COUNT(*)::int AS n,
                i.name, i.color_label, i."type" AS item_type
         FROM item_docs d
         JOIN items i ON i.id = d.item_id
         WHERE d.item_id NOT LIKE 'extra-%'
         GROUP BY d.item_id, d.kind, i.name, i.color_label, i."type"
         ORDER BY LOWER(COALESCE(i.name, d.item_id)), d.item_id`,
      );
      const itemsById = new Map();
      linkedRows.rows.forEach((row) => {
        if (!itemsById.has(row.item_id)) {
          const color = String(row.color_label || "").trim();
          const name = String(row.name || row.item_id).trim() || row.item_id;
          itemsById.set(row.item_id, {
            itemId: row.item_id,
            name: color && color !== name ? `${name} · ${color}` : name,
            counts: { sds: 0, pds: 0, eds: 0 },
          });
        }
        const kind = docs.normalizeKind(row.kind);
        if (kind) itemsById.get(row.item_id).counts[kind] += Number(row.n) || 0;
      });

      res.json({
        counts,
        extras: Array.from(extrasById.values()),
        items: Array.from(itemsById.values()),
      });
    } catch (error) {
      console.error("safety docs summary:", error);
      res.status(500).json({ error: "Failed to load data sheets" });
    }
  });

  app.post("/api/safety-docs/extras", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "Enter a name." });
      const inserted = await pool.query(
        `INSERT INTO data_sheet_extras (name, created_by)
         VALUES ($1, $2)
         RETURNING id, name, created_by, created_at`,
        [name, session.userName],
      );
      const row = inserted.rows[0];
      res.json({
        extra: {
          id: row.id,
          name: row.name,
          counts: { sds: 0, pds: 0, eds: 0 },
        },
      });
    } catch (error) {
      console.error("safety extra create:", error);
      res.status(500).json({ error: "Failed to add item" });
    }
  });

  app.delete("/api/safety-docs/extras/:id", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "Item is required" });
      const itemId = docs.extraDocItemId(id);
      await pool.query(`DELETE FROM item_docs WHERE item_id = $1`, [itemId]);
      await pool.query(`DELETE FROM data_sheet_extras WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (error) {
      console.error("safety extra delete:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  app.get("/api/safety-docs/items/:itemId", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const itemId = String(req.params.itemId || "").trim();
      if (!itemId) return res.status(400).json({ error: "Item is required" });
      const result = await pool.query(
        `SELECT id, item_id, kind, filename, mime, uploaded_by, created_at
         FROM item_docs WHERE item_id = $1
         ORDER BY kind, created_at DESC, id DESC`,
        [itemId],
      );
      res.json({ files: result.rows.map((row) => docs.publicDoc(row, { itemId })) });
    } catch (error) {
      console.error("safety item list:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  app.post("/api/safety-docs/items/:itemId", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const itemId = String(req.params.itemId || "").trim();
      const kind = docs.normalizeKind(req.body?.kind);
      if (!itemId) return res.status(400).json({ error: "Item is required" });
      if (!kind) return res.status(400).json({ error: "Choose SDS, PDS, or EDS." });
      const decoded = decodeUpload(req.body || {});
      if (decoded.error) return res.status(400).json({ error: decoded.error });
      const mime = docs.mimeFromName(decoded.filename);
      const inserted = await pool.query(
        `INSERT INTO item_docs (item_id, kind, filename, mime, bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, item_id, kind, filename, mime, uploaded_by, created_at`,
        [itemId, kind, decoded.filename, mime, decoded.buffer, session.userName],
      );
      res.json({
        success: true,
        file: docs.publicDoc(inserted.rows[0], { itemId }),
      });
    } catch (error) {
      console.error("safety item upload:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/safety-docs/items/:itemId/files/:fileId", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const result = await pool.query(
        `SELECT filename, mime, bytes FROM item_docs WHERE id = $1 AND item_id = $2`,
        [Number(req.params.fileId), String(req.params.itemId || "").trim()],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "File not found" });
      res.set("Content-Type", row.mime || "application/octet-stream");
      setDownloadFilename(res, String(row.filename).replace(/"/g, ""));
      res.send(row.bytes);
    } catch (error) {
      console.error("safety item download:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.delete("/api/safety-docs/items/:itemId/files/:fileId", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      await pool.query(`DELETE FROM item_docs WHERE id = $1 AND item_id = $2`, [
        Number(req.params.fileId),
        String(req.params.itemId || "").trim(),
      ]);
      res.json({ success: true });
    } catch (error) {
      console.error("safety item delete:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/safety-docs/types/:itemType", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const itemType = docs.normalizeType(req.params.itemType);
      const aliases = docs.typeAliases(itemType);
      if (!itemType) return res.status(400).json({ error: "Choose an item type." });
      const result = await pool.query(
        `SELECT id, item_type, kind, filename, mime, uploaded_by, created_at
         FROM type_docs WHERE item_type = ANY($1::text[])
         ORDER BY kind, created_at DESC, id DESC`,
        [aliases],
      );
      res.json({
        files: result.rows.map((row) =>
          docs.publicDoc(row, { itemType: row.item_type, source: "type" }),
        ),
      });
    } catch (error) {
      console.error("safety type list:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  app.post("/api/safety-docs/types/:itemType", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const itemType = docs.normalizeType(req.params.itemType);
      const kind = docs.normalizeKind(req.body?.kind);
      if (!itemType) return res.status(400).json({ error: "Choose an item type." });
      if (!kind) return res.status(400).json({ error: "Choose SDS, PDS, or EDS." });
      const decoded = decodeUpload(req.body || {});
      if (decoded.error) return res.status(400).json({ error: decoded.error });
      const mime = docs.mimeFromName(decoded.filename);
      const inserted = await pool.query(
        `INSERT INTO type_docs (item_type, kind, filename, mime, bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, item_type, kind, filename, mime, uploaded_by, created_at`,
        [itemType, kind, decoded.filename, mime, decoded.buffer, session.userName],
      );
      res.json({
        success: true,
        file: docs.publicDoc(inserted.rows[0], {
          itemType,
          source: "type",
        }),
      });
    } catch (error) {
      console.error("safety type upload:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/safety-docs/types/:itemType/files/:fileId", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const itemType = docs.normalizeType(req.params.itemType);
      const aliases = docs.typeAliases(itemType);
      const result = await pool.query(
        `SELECT filename, mime, bytes, kind FROM type_docs
         WHERE id = $1 AND item_type = ANY($2::text[])`,
        [Number(req.params.fileId), aliases],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "File not found" });
      const ext = docs.extFromFilename(row.filename, row.mime);
      const name = `${docs.downloadBaseName(itemType, row.kind)}${ext}`;
      res.set("Content-Type", row.mime || "application/octet-stream");
      setDownloadFilename(res, name);
      res.send(row.bytes);
    } catch (error) {
      console.error("safety type download:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.delete("/api/safety-docs/types/:itemType/files/:fileId", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const itemType = docs.normalizeType(req.params.itemType);
      const aliases = docs.typeAliases(itemType);
      await pool.query(
        `DELETE FROM type_docs WHERE id = $1 AND item_type = ANY($2::text[])`,
        [Number(req.params.fileId), aliases],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("safety type delete:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/safety-docs/types/:itemType/download", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const itemType = docs.normalizeType(req.params.itemType);
      const aliases = docs.typeAliases(itemType);
      const kind = docs.normalizeKind(req.query.kind);
      if (!itemType) return res.status(400).json({ error: "Choose an item type." });
      if (!kind) return res.status(400).json({ error: "Choose SDS, PDS, or EDS." });
      const fileId = req.query.fileId != null ? Number(req.query.fileId) : 0;

      if (fileId > 0) {
        const one = await pool.query(
          `SELECT filename, mime, bytes, kind FROM type_docs
           WHERE id = $1 AND item_type = ANY($2::text[]) AND kind = $3`,
          [fileId, aliases, kind],
        );
        const row = one.rows[0];
        if (!row) return res.status(404).json({ error: "File not found" });
        const ext = docs.extFromFilename(row.filename, row.mime);
        res.set("Content-Type", row.mime || "application/octet-stream");
        setDownloadFilename(res, `${docs.downloadBaseName(itemType, kind)}${ext}`);
        return res.send(row.bytes);
      }

      const typeRows = await pool.query(
        `SELECT filename, mime, bytes FROM type_docs
         WHERE item_type = ANY($1::text[]) AND kind = $2
         ORDER BY created_at DESC, id DESC`,
        [aliases, kind],
      );
      const itemRows = await pool.query(
        `SELECT d.filename, d.mime, d.bytes, d.item_id
         FROM item_docs d
         JOIN items i ON i.id = d.item_id
         WHERE LOWER(COALESCE(i."type", '')) = ANY($1::text[]) AND d.kind = $2
         ORDER BY d.item_id, d.created_at DESC, d.id DESC`,
        [aliases, kind],
      );
      const files = [
        ...typeRows.rows.map((row) => ({
          filename: row.filename,
          mime: row.mime,
          bytes: row.bytes,
        })),
        ...itemRows.rows.map((row) => ({
          filename: `${row.item_id}-${row.filename}`,
          mime: row.mime,
          bytes: row.bytes,
        })),
      ];
      if (!files.length) {
        return res.status(404).json({ error: `No ${kind.toUpperCase()} files for this type.` });
      }
      const base = docs.downloadBaseName(itemType, kind);
      if (files.length === 1) {
        const ext = docs.extFromFilename(files[0].filename, files[0].mime);
        res.set("Content-Type", files[0].mime || "application/octet-stream");
        setDownloadFilename(res, `${base}${ext}`);
        return res.send(files[0].bytes);
      }
      const JSZip = require("jszip");
      const zip = new JSZip();
      const used = new Set();
      files.forEach((file, index) => {
        let name = String(file.filename || `file-${index + 1}`).replace(/[\\/]/g, "-");
        if (used.has(name)) name = `${index + 1}-${name}`;
        used.add(name);
        zip.file(name, file.bytes);
      });
      const packed = await zip.generateAsync({ type: "nodebuffer" });
      res.set("Content-Type", "application/zip");
      setDownloadFilename(res, `${base}.zip`);
      res.send(packed);
    } catch (error) {
      console.error("safety type bulk download:", error);
      res.status(500).json({ error: "Failed to download files" });
    }
  });
}

module.exports = { registerItemDocRoutes };
