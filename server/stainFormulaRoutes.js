"use strict";

const store = require("./stainFormulasStore");
const { parseStainExcelBuffer } = require("./stainFormulaParse");
const { workbookToPdf } = require("./stainFormulaPdf");

const MAX_BYTES = 8 * 1024 * 1024;

function decodeUpload(body) {
  const filename = String(body?.filename || "upload").trim() || "upload";
  const raw = String(body?.dataBase64 || body?.base64 || "");
  const cleaned = raw.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!cleaned) return { error: "File data is required" };
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) return { error: "File was empty" };
  if (buffer.length > MAX_BYTES) return { error: "File is larger than 12 MB" };
  return { filename, buffer };
}

function isExcel(filename) {
  return /\.xls[xm]?$/i.test(filename);
}

function isImage(filename) {
  return /\.(png|jpe?g|webp)$/i.test(filename);
}

async function parseOne(pool, filename, buffer) {
  if (isExcel(filename)) {
    const parsed = await parseStainExcelBuffer(buffer, filename);
    const duplicates = parsed.draft
      ? await store.findPossibleDuplicates(pool, parsed.draft)
      : [];
    return {
      filename,
      ok: !!parsed.ok,
      warnings: parsed.warnings || [],
      draft: parsed.draft,
      duplicates,
      sourceBase64: buffer.toString("base64"),
    };
  }
  if (/\.pdf$/i.test(filename) || isImage(filename)) {
    return {
      filename,
      ok: true,
      warnings: [
        "This file was saved as the source. Text was not guessed from the image or PDF. Enter the formula, then approve it.",
      ],
      draft: {
        formulaNumber: (filename.match(/(\d{3,6})/) || [])[1] || "",
        colorName: "",
        classification: "custom",
        materialForm: "unknown",
        woodSpecies: "",
        woodType: "",
        formulaDate: "",
        jobNumber: "",
        doorStyle: "",
        constructionStyle: "",
        sheen: "",
        glaze: "",
        distressing: "",
        colorStatus: "",
        developer: "",
        salesperson: "",
        specialNotes: "",
        reviewStatus: "needs_review",
        steps: [],
        sourceFilename: filename,
      },
      duplicates: [],
      sourceBase64: buffer.toString("base64"),
    };
  }
  return {
    filename,
    ok: false,
    warnings: ["Use an Excel file (.xlsx, .xlsm, .xls), PDF, PNG, or JPG."],
    draft: null,
    duplicates: [],
  };
}

async function expandZip(filename, buffer) {
  let JSZip;
  try {
    JSZip = require("jszip");
  } catch {
    return { error: "ZIP import needs the jszip package on the server." };
  }
  const zip = await JSZip.loadAsync(buffer);
  const files = [];
  const names = Object.keys(zip.files);
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const base = name.split("/").pop();
    if (!base || base.startsWith(".")) continue;
    if (!isExcel(base) && !isImage(base) && !/\.pdf$/i.test(base)) continue;
    const content = await entry.async("nodebuffer");
    if (content.length > MAX_BYTES) {
      files.push({ filename: base, error: "File is larger than 12 MB" });
      continue;
    }
    files.push({ filename: base, buffer: content });
  }
  if (!files.length) {
    return { error: `${filename} did not contain Excel, PDF, or image formulas.` };
  }
  return { files };
}

function registerStainFormulaRoutes(app, db) {
  const pool = db.pool;

  async function sessionFrom(req) {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return store.getSession(pool, token);
  }

  async function requireUser(req, res) {
    const session = await sessionFrom(req);
    if (!session) {
      res.status(401).json({ error: "Sign in again to use stain formulas." });
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

  app.get("/api/stain-formulas", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const data = await store.listFormulas(pool, req.query || {});
      res.json(data);
    } catch (error) {
      console.error("stain list:", error);
      res.status(500).json({ error: "Failed to list formulas" });
    }
  });

  app.get("/api/stain-formulas/:id", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const formula = await store.getFormula(pool, Number(req.params.id));
      if (!formula) return res.status(404).json({ error: "Not found" });
      res.json(formula);
    } catch (error) {
      console.error("stain get:", error);
      res.status(500).json({ error: "Failed to load formula" });
    }
  });

  app.post("/api/stain-formulas", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const saved = await store.saveFormula(pool, req.body || {}, session.userName);
      if (!saved.success) return res.status(400).json(saved);
      const file = req.body?.sourceFile;
      if (file?.dataBase64 && saved.formula?.id) {
        const decoded = decodeUpload(file);
        if (!decoded.error) {
          await pool.query(
            `INSERT INTO stain_formula_files (formula_id, filename, mime, bytes, uploaded_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [saved.formula.id, decoded.filename, "application/octet-stream", decoded.buffer, session.userName],
          );
        }
      }
      res.json(saved);
    } catch (error) {
      console.error("stain create:", error);
      res.status(500).json({ error: "Failed to save formula" });
    }
  });

  app.put("/api/stain-formulas/:id", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const saved = await store.saveFormula(pool, req.body || {}, session.userName, req.params.id);
      if (!saved.success) {
        return res.status(saved.error === "Not found" ? 404 : 400).json(saved);
      }
      res.json(saved);
    } catch (error) {
      console.error("stain update:", error);
      res.status(500).json({ error: "Failed to update formula" });
    }
  });

  app.delete("/api/stain-formulas/:id", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const result = await pool.query(`DELETE FROM stain_formulas WHERE id = $1`, [Number(req.params.id)]);
      res.json({ success: true, deleted: result.rowCount || 0 });
    } catch (error) {
      console.error("stain delete:", error);
      res.status(500).json({ error: "Failed to delete formula" });
    }
  });

  app.post("/api/stain-formulas/import", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const decoded = decodeUpload(req.body || {});
      if (decoded.error) return res.status(400).json({ error: decoded.error });
      if (/\.zip$/i.test(decoded.filename)) {
        const expanded = await expandZip(decoded.filename, decoded.buffer);
        if (expanded.error) return res.status(400).json({ error: expanded.error });
        const results = [];
        for (const file of expanded.files) {
          if (file.error) {
            results.push({ filename: file.filename, ok: false, warnings: [file.error], draft: null, duplicates: [] });
            continue;
          }
          try {
            results.push(await parseOne(pool, file.filename, file.buffer));
          } catch (error) {
            results.push({
              filename: file.filename,
              ok: false,
              warnings: [error.message || "Could not read this file"],
              draft: null,
              duplicates: [],
            });
          }
        }
        return res.json({ batch: true, results });
      }
      const one = await parseOne(pool, decoded.filename, decoded.buffer);
      res.json({ batch: false, results: [one] });
    } catch (error) {
      console.error("stain import:", error);
      res.status(500).json({ error: error.message || "Import failed" });
    }
  });

  app.get("/api/stain-formulas/:id/pdf", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const formula = await store.getFormula(pool, Number(req.params.id));
      if (!formula) return res.status(404).json({ error: "Not found" });
      const file = await pool.query(
        `SELECT bytes FROM stain_formula_files
         WHERE formula_id = $1 AND filename ~* '\\.xls[xm]?$'
         ORDER BY id DESC LIMIT 1`,
        [formula.id],
      );
      if (!file.rows[0]) {
        return res.status(404).json({ error: "No Excel file is stored for this formula." });
      }
      const pdf = await workbookToPdf(file.rows[0].bytes);
      const name = `${String(formula.formulaNumber || "formula").replace(/[^\w.-]+/g, "") || "formula"}.pdf`;
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="${name}"`);
      res.send(pdf);
    } catch (error) {
      console.error("stain pdf:", error);
      res.status(500).json({ error: "Failed to build formula PDF" });
    }
  });

  app.get("/api/stain-formulas/:id/files/:fileId", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const result = await pool.query(
        `SELECT filename, mime, bytes FROM stain_formula_files WHERE id = $1 AND formula_id = $2`,
        [Number(req.params.fileId), Number(req.params.id)],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "File not found" });
      res.set("Content-Type", row.mime || "application/octet-stream");
      res.set("Content-Disposition", `attachment; filename="${String(row.filename).replace(/"/g, "")}"`);
      res.send(row.bytes);
    } catch (error) {
      console.error("stain file:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.get("/api/stain-formulas/:id/images/:imageId", async (req, res) => {
    try {
      if (!(await requireUser(req, res))) return;
      const result = await pool.query(
        `SELECT mime, bytes FROM stain_formula_images WHERE id = $1 AND formula_id = $2`,
        [Number(req.params.imageId), Number(req.params.id)],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).end();
      res.set("Content-Type", row.mime || "image/jpeg");
      res.set("Cache-Control", "private, max-age=3600");
      res.send(row.bytes);
    } catch (error) {
      res.status(500).end();
    }
  });

  app.post("/api/stain-formulas/:id/images", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const decoded = decodeUpload(req.body || {});
      if (decoded.error) return res.status(400).json({ error: decoded.error });
      if (!isImage(decoded.filename) && !/^image\//.test(String(req.body?.mime || ""))) {
        return res.status(400).json({ error: "Upload a PNG or JPG photo." });
      }
      const mime = /\.png$/i.test(decoded.filename) ? "image/png" : "image/jpeg";
      const caption = String(req.body?.caption || "").slice(0, 240);
      const makePrimary = req.body?.isPrimary === true;
      if (makePrimary) {
        await pool.query(`UPDATE stain_formula_images SET is_primary = FALSE WHERE formula_id = $1`, [Number(req.params.id)]);
      }
      const inserted = await pool.query(
        `INSERT INTO stain_formula_images (formula_id, caption, mime, bytes, is_primary, uploaded_by, sort_index)
         VALUES ($1, $2, $3, $4, $5, $6, 1000) RETURNING id, caption, mime, is_primary, uploaded_by, created_at`,
        [Number(req.params.id), caption, mime, decoded.buffer, false, session.userName],
      );
      const row = inserted.rows[0];
      if (makePrimary) {
        await store.setPrimaryImage(pool, Number(req.params.id), row.id);
        row.is_primary = true;
      }
      res.json({
        success: true,
        image: {
          id: row.id,
          caption: row.caption,
          mime: row.mime,
          isPrimary: row.is_primary,
          uploadedBy: row.uploaded_by,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      console.error("stain image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  app.post("/api/stain-formulas/:id/images/:imageId/primary", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const result = await store.setPrimaryImage(pool, Number(req.params.id), Number(req.params.imageId));
      if (!result.success) return res.status(404).json(result);
      res.json(await store.getFormula(pool, Number(req.params.id)));
    } catch (error) {
      res.status(500).json({ error: "Failed to set main photo" });
    }
  });

  app.delete("/api/stain-formulas/:id/images/:imageId", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      await pool.query(
        `DELETE FROM stain_formula_images WHERE id = $1 AND formula_id = $2`,
        [Number(req.params.imageId), Number(req.params.id)],
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete image" });
    }
  });

  app.post("/api/stain-formulas/:id/links", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const formula = await store.getFormula(pool, Number(req.params.id));
      if (!formula) return res.status(404).json({ error: "Not found" });
      const result = await store.linkColors(pool, formula.formulaNumber, req.body?.number, session.userName);
      if (!result.success) return res.status(400).json(result);
      res.json(await store.getFormula(pool, formula.id));
    } catch (error) {
      res.status(500).json({ error: "Failed to link color" });
    }
  });

  app.delete("/api/stain-formulas/:id/links/:number", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const formula = await store.getFormula(pool, Number(req.params.id));
      if (!formula) return res.status(404).json({ error: "Not found" });
      await store.unlinkColors(pool, formula.formulaNumber, req.params.number);
      res.json(await store.getFormula(pool, formula.id));
    } catch (error) {
      res.status(500).json({ error: "Failed to unlink color" });
    }
  });

  app.post("/api/stain-formulas/:id/notes", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const body = String(req.body?.body || "").trim();
      if (!body) return res.status(400).json({ error: "Note is empty" });
      const category = String(req.body?.category || "general").slice(0, 40);
      const inserted = await pool.query(
        `INSERT INTO stain_formula_notes (formula_id, body, category, pinned, critical, author_user)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          Number(req.params.id),
          body,
          category,
          !!req.body?.pinned,
          !!req.body?.critical,
          session.userName,
        ],
      );
      res.json({ success: true, note: inserted.rows[0] });
    } catch (error) {
      res.status(500).json({ error: "Failed to add note" });
    }
  });

  app.put("/api/stain-formulas/:id/notes/:noteId", async (req, res) => {
    try {
      const session = await requireUser(req, res);
      if (!session) return;
      const existing = await pool.query(
        `SELECT author_user FROM stain_formula_notes WHERE id = $1 AND formula_id = $2`,
        [Number(req.params.noteId), Number(req.params.id)],
      );
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (String(row.author_user).toLowerCase() !== String(session.userName).toLowerCase()) {
        return res.status(403).json({ error: "You can only edit your own notes." });
      }
      const body = String(req.body?.body || "").trim();
      if (!body) return res.status(400).json({ error: "Note is empty" });
      await pool.query(
        `UPDATE stain_formula_notes
         SET body = $3, category = $4, pinned = $5, critical = $6, updated_at = NOW()
         WHERE id = $1 AND formula_id = $2`,
        [
          Number(req.params.noteId),
          Number(req.params.id),
          body,
          String(req.body?.category || "general").slice(0, 40),
          !!req.body?.pinned,
          !!req.body?.critical,
        ],
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  app.delete("/api/stain-formulas/:id/notes/:noteId", async (req, res) => {
    try {
      const session = await requireUser(req, res);
      if (!session) return;
      const existing = await pool.query(
        `SELECT author_user FROM stain_formula_notes WHERE id = $1 AND formula_id = $2`,
        [Number(req.params.noteId), Number(req.params.id)],
      );
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (String(row.author_user).toLowerCase() !== String(session.userName).toLowerCase()) {
        return res.status(403).json({ error: "You can only delete your own notes." });
      }
      await pool.query(`DELETE FROM stain_formula_notes WHERE id = $1`, [Number(req.params.noteId)]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note" });
    }
  });
}

module.exports = { registerStainFormulaRoutes };
