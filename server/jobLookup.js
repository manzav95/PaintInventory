"use strict";

const MAX_BYTES = 8 * 1024 * 1024;

function normalizeJobKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^job\s*/, "")
    .replace(/[^a-z0-9]/g, "");
}

function jobKeySql(column) {
  return `regexp_replace(regexp_replace(LOWER(TRIM(COALESCE(${column}, ''))), '^job\\s*', ''), '[^a-z0-9]', '', 'g')`;
}

function colorCode(value) {
  const digits = String(value || "").match(/\d{3,6}/);
  return digits ? digits[0] : "";
}

function decodeUpload(body) {
  const filename = String(body?.filename || "photo.jpg").trim() || "photo.jpg";
  const raw = String(body?.dataBase64 || body?.base64 || "");
  const cleaned = raw.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!cleaned) return { error: "Photo data is required" };
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) return { error: "Photo was empty" };
  if (buffer.length > MAX_BYTES) return { error: "Photo is larger than 8 MB" };
  return { filename, buffer };
}

function isImage(filename, mime) {
  if (/^image\/(png|jpe?g|webp)$/i.test(String(mime || ""))) return true;
  return /\.(png|jpe?g|webp)$/i.test(String(filename || ""));
}

function mimeFromUpload(filename, mime) {
  if (/png/i.test(String(mime || "")) || /\.png$/i.test(filename)) return "image/png";
  if (/webp/i.test(String(mime || "")) || /\.webp$/i.test(filename)) return "image/webp";
  return "image/jpeg";
}

async function safeQuery(pool, sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (error?.code === "42P01") return { rows: [] };
    throw error;
  }
}

function mapUsage(row) {
  return {
    id: row.id,
    entryDate: row.entry_date,
    entryTime: row.entry_time,
    colorName: row.color_name || "",
    materialType: row.material_type || "",
    qtyGallons: Number(row.qty_gallons) || 0,
    booth: row.booth || "",
    userName: row.user_name || "",
    itemId: row.item_id || "",
  };
}

function summarizeUsage(rows) {
  const byColor = new Map();
  let totalGallons = 0;
  for (const row of rows) {
    const gal = Number(row.qtyGallons) || 0;
    totalGallons += gal;
    const key = [
      String(row.colorName || row.itemId || "Material").trim().toLowerCase(),
      String(row.materialType || "").trim().toLowerCase(),
    ].join("|");
    const current = byColor.get(key) || {
      colorName: row.colorName || row.itemId || "Material",
      materialType: row.materialType || "",
      gallons: 0,
      entries: 0,
    };
    current.gallons += gal;
    current.entries += 1;
    byColor.set(key, current);
  }
  return {
    totalGallons: Math.round(totalGallons * 10) / 10,
    byColor: [...byColor.values()]
      .map((row) => ({
        ...row,
        gallons: Math.round(row.gallons * 10) / 10,
      }))
      .sort((a, b) => b.gallons - a.gallons),
  };
}

async function lookupJob(pool, rawJob) {
  const display = String(rawJob || "").trim();
  const key = normalizeJobKey(display);
  if (!key) {
    return { success: false, error: "Enter a job number." };
  }

  const usageRes = await safeQuery(
    pool,
    `SELECT id, entry_date, entry_time, color_name, material_type, qty_gallons,
            booth, user_name, item_id, job_name
     FROM material_usage
     WHERE ${jobKeySql("job_name")} = $1
     ORDER BY entry_date DESC NULLS LAST, entry_time DESC NULLS LAST, id DESC
     LIMIT 250`,
    [key],
  );
  const usage = usageRes.rows.map(mapUsage);

  const itemsRes = await safeQuery(
    pool,
    `SELECT h.item_id, h.job_name, h.first_seen_at, h.last_seen_at,
            i.name, i.type, i.quantity, i.location, i.hex_color
     FROM item_job_history h
     LEFT JOIN items i ON i.id = h.item_id
     WHERE ${jobKeySql("h.job_name")} = $1
     ORDER BY h.last_seen_at DESC NULLS LAST`,
    [key],
  );

  const extraIds = [
    ...new Set(
      usage
        .map((row) => String(row.itemId || "").trim())
        .filter((id) => id && !itemsRes.rows.some((row) => String(row.item_id) === id)),
    ),
  ];
  let extraItems = [];
  if (extraIds.length) {
    const extraRes = await safeQuery(
      pool,
      `SELECT id AS item_id, name, type, quantity, location, hex_color,
              NULL::text AS first_seen_at, NULL::text AS last_seen_at, $2::text AS job_name
       FROM items
       WHERE id = ANY($1::text[])`,
      [extraIds, display],
    );
    extraItems = extraRes.rows;
  }

  const itemRows = [...itemsRes.rows, ...extraItems];
  const codes = [
    ...new Set(
      itemRows
        .flatMap((row) => [colorCode(row.item_id), colorCode(row.name)])
        .filter(Boolean),
    ),
  ];

  const formulaRes = await safeQuery(
    pool,
    `SELECT f.id, f.formula_number, f.color_name, f.material_form, f.wood_species,
            f.job_number, f.classification,
            (
              SELECT img.id FROM stain_formula_images img
              WHERE img.formula_id = f.id
              ORDER BY img.is_primary DESC, img.sort_index ASC, img.id ASC
              LIMIT 1
            ) AS primary_image_id
     FROM stain_formulas f
     WHERE COALESCE(f.is_demo, FALSE) IS NOT TRUE
       AND (
         ${jobKeySql("f.job_number")} = $1
         ${codes.length ? "OR regexp_replace(COALESCE(f.formula_number, ''), '[^0-9]', '', 'g') = ANY($2::text[])" : ""}
       )
     ORDER BY f.formula_number ASC
     LIMIT 80`,
    codes.length ? [key, codes] : [key],
  );

  const formulas = formulaRes.rows.map((row) => ({
    id: row.id,
    formulaNumber: row.formula_number || "",
    colorName: row.color_name || "",
    materialForm: row.material_form || "",
    woodSpecies: row.wood_species || "",
    jobNumber: row.job_number || "",
    classification: row.classification || "",
    primaryImageId: row.primary_image_id || null,
  }));

  const formulaByCode = new Map();
  for (const formula of formulas) {
    const code = colorCode(formula.formulaNumber);
    if (code && !formulaByCode.has(code)) formulaByCode.set(code, formula);
  }

  const items = itemRows.map((row) => {
    const code = colorCode(row.item_id) || colorCode(row.name);
    const formula = code ? formulaByCode.get(code) : null;
    return {
      itemId: row.item_id,
      name: row.name || row.item_id,
      type: row.type || "",
      quantity: row.quantity == null ? null : Number(row.quantity),
      location: row.location || "",
      hexColor: row.hex_color || "",
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      formulaId: formula?.id || null,
      formulaNumber: formula?.formulaNumber || "",
    };
  });

  const lineupRes = await safeQuery(
    pool,
    `SELECT l.id, l.job_name, l.color_name, l.material_type, l.item_id, l.cars_qty,
            l.laps, l.cart_number, l.user_name, l.created_at, i.name AS item_name
     FROM lineup l
     LEFT JOIN items i ON i.id = l.item_id
     WHERE ${jobKeySql("l.job_name")} = $1
     ORDER BY l.created_at DESC
     LIMIT 80`,
    [key],
  );

  const ordersRes = await safeQuery(
    pool,
    `SELECT o.id, o.po_number, o.placed_at, o.status, ol.quantity, ol.received_quantity,
            ol.item_id, ol.job_name, i.name AS item_name
     FROM order_lines ol
     JOIN orders o ON o.id = ol.order_id
     LEFT JOIN items i ON i.id = ol.item_id
     WHERE ${jobKeySql("ol.job_name")} = $1
     ORDER BY o.placed_at DESC NULLS LAST
     LIMIT 80`,
    [key],
  );

  const photosRes = await safeQuery(
    pool,
    `SELECT id, job_name, caption, mime, uploaded_by, created_at
     FROM job_photos
     WHERE ${jobKeySql("job_name")} = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 80`,
    [key],
  );

  const usageSummary = summarizeUsage(usage);
  const found =
    usage.length +
      items.length +
      formulas.length +
      lineupRes.rows.length +
      ordersRes.rows.length +
      photosRes.rows.length >
    0;

  return {
    success: true,
    found,
    jobName: display,
    jobKey: key,
    usage,
    usageSummary,
    items,
    formulas,
    lineup: lineupRes.rows.map((row) => ({
      id: row.id,
      jobName: row.job_name,
      colorName: row.color_name || row.item_name || "",
      materialType: row.material_type || "",
      itemId: row.item_id,
      carsQty: Number(row.cars_qty) || 0,
      laps: Number(row.laps) || 1,
      cartNumber: row.cart_number || "",
      userName: row.user_name || "",
      createdAt: row.created_at,
    })),
    orders: ordersRes.rows.map((row) => ({
      id: row.id,
      poNumber: row.po_number,
      placedAt: row.placed_at,
      status: row.status,
      quantity: Number(row.quantity) || 0,
      receivedQuantity: Number(row.received_quantity) || 0,
      itemId: row.item_id,
      itemName: row.item_name || row.item_id,
      jobName: row.job_name,
    })),
    photos: photosRes.rows.map((row) => ({
      id: row.id,
      jobName: row.job_name,
      caption: row.caption || "",
      mime: row.mime || "image/jpeg",
      uploadedBy: row.uploaded_by || "",
      createdAt: row.created_at,
    })),
  };
}

function eventTime(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function preferredJobName(current, next) {
  const a = String(current || "").trim();
  const b = String(next || "").trim();
  if (!a) return b;
  if (!b) return a;
  const aDigits = /^\d/.test(a.replace(/^job\s*/i, ""));
  const bDigits = /^\d/.test(b.replace(/^job\s*/i, ""));
  if (bDigits && !aDigits) return b;
  return a;
}

async function listRecentJobs(pool, { limit = 24 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 48);
  const [usageRes, lineupRes, formulaRes, photoRes, historyRes] = await Promise.all([
    safeQuery(
      pool,
      `SELECT TRIM(job_name) AS job_name, created_at, qty_gallons, color_name
       FROM material_usage
       WHERE TRIM(COALESCE(job_name, '')) <> ''
       ORDER BY created_at DESC NULLS LAST
       LIMIT 500`,
    ),
    safeQuery(
      pool,
      `SELECT TRIM(job_name) AS job_name, created_at, color_name
       FROM lineup
       WHERE TRIM(COALESCE(job_name, '')) <> ''
       ORDER BY created_at DESC NULLS LAST
       LIMIT 200`,
    ),
    safeQuery(
      pool,
      `SELECT TRIM(job_number) AS job_name, updated_at AS created_at, color_name
       FROM stain_formulas
       WHERE TRIM(COALESCE(job_number, '')) <> ''
         AND COALESCE(is_demo, FALSE) IS NOT TRUE
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 200`,
    ),
    safeQuery(
      pool,
      `SELECT TRIM(job_name) AS job_name, created_at
       FROM job_photos
       WHERE TRIM(COALESCE(job_name, '')) <> ''
       ORDER BY created_at DESC NULLS LAST
       LIMIT 200`,
    ),
    safeQuery(
      pool,
      `SELECT TRIM(job_name) AS job_name, last_seen_at AS created_at
       FROM item_job_history
       WHERE TRIM(COALESCE(job_name, '')) <> ''
       ORDER BY last_seen_at DESC NULLS LAST
       LIMIT 200`,
    ),
  ]);

  const byKey = new Map();
  const take = (row, source) => {
    const name = String(row.job_name || "").trim();
    const key = normalizeJobKey(name);
    if (!key) return;
    const lastAt = eventTime(row.created_at);
    const current = byKey.get(key) || {
      jobKey: key,
      jobName: name,
      lastAt: 0,
      gallons: 0,
      colors: [],
      colorSeen: new Set(),
      usageCount: 0,
      lineupCount: 0,
      formulaCount: 0,
      photoCount: 0,
    };
    current.jobName = preferredJobName(current.jobName, name);
    if (lastAt > current.lastAt) current.lastAt = lastAt;
    if (source === "usage") {
      current.gallons += Number(row.qty_gallons) || 0;
      current.usageCount += 1;
    } else if (source === "lineup") current.lineupCount += 1;
    else if (source === "formula") current.formulaCount += 1;
    else if (source === "photo") current.photoCount += 1;
    const color = String(row.color_name || "").trim();
    if (color && !current.colorSeen.has(color.toLowerCase())) {
      current.colorSeen.add(color.toLowerCase());
      current.colors.push(color);
    }
    byKey.set(key, current);
  };

  for (const row of usageRes.rows) take(row, "usage");
  for (const row of lineupRes.rows) take(row, "lineup");
  for (const row of formulaRes.rows) take(row, "formula");
  for (const row of photoRes.rows) take(row, "photo");
  for (const row of historyRes.rows) take(row, "item");

  const jobs = [...byKey.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, lim)
    .map((job) => ({
      jobName: job.jobName,
      jobKey: job.jobKey,
      lastAt: job.lastAt ? new Date(job.lastAt).toISOString() : null,
      gallons: Math.round(job.gallons * 10) / 10,
      colors: job.colors.slice(0, 4),
      extraColors: Math.max(0, job.colors.length - 4),
      usageCount: job.usageCount,
      lineupCount: job.lineupCount,
      formulaCount: job.formulaCount,
      photoCount: job.photoCount,
    }));

  return { success: true, jobs };
}

function registerJobLookupRoutes(app, db) {
  const pool = db.pool;

  app.get("/api/jobs", async (req, res) => {
    try {
      const data = await listRecentJobs(pool, { limit: req.query.limit });
      res.json(data);
    } catch (error) {
      console.error("recent jobs:", error);
      res.status(500).json({ error: "Failed to load recent jobs." });
    }
  });

  app.get("/api/jobs/:jobName", async (req, res) => {
    try {
      const data = await lookupJob(pool, decodeURIComponent(req.params.jobName || ""));
      if (!data.success) return res.status(400).json(data);
      res.json(data);
    } catch (error) {
      console.error("job lookup:", error);
      res.status(500).json({ error: "Failed to look up that job." });
    }
  });

  app.post("/api/jobs/:jobName/photos", async (req, res) => {
    try {
      const jobName = String(decodeURIComponent(req.params.jobName || "")).trim();
      if (!normalizeJobKey(jobName)) {
        return res.status(400).json({ error: "Enter a job number." });
      }
      const decoded = decodeUpload(req.body || {});
      if (decoded.error) return res.status(400).json({ error: decoded.error });
      if (!isImage(decoded.filename, req.body?.mime)) {
        return res.status(400).json({ error: "Upload a PNG or JPG photo." });
      }
      const mime = mimeFromUpload(decoded.filename, req.body?.mime);
      const caption = String(req.body?.caption || "").slice(0, 240);
      const uploadedBy = String(req.body?.userName || req.body?.uploadedBy || "").trim();
      const inserted = await pool.query(
        `INSERT INTO job_photos (job_name, caption, mime, bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, job_name, caption, mime, uploaded_by, created_at`,
        [jobName, caption, mime, decoded.buffer, uploadedBy],
      );
      res.json({ success: true, photo: inserted.rows[0] });
    } catch (error) {
      console.error("job photo upload:", error);
      res.status(500).json({ error: "Failed to save photo." });
    }
  });

  app.get("/api/jobs/:jobName/photos/:photoId", async (req, res) => {
    try {
      const jobName = decodeURIComponent(req.params.jobName || "");
      const photoId = Number(req.params.photoId);
      if (!Number.isInteger(photoId) || photoId < 1) {
        return res.status(400).json({ error: "Invalid photo." });
      }
      const result = await pool.query(
        `SELECT mime, bytes FROM job_photos
         WHERE id = $1 AND ${jobKeySql("job_name")} = $2`,
        [photoId, normalizeJobKey(jobName)],
      );
      const row = result.rows[0];
      if (!row) return res.status(404).end();
      res.set("Content-Type", row.mime || "image/jpeg");
      res.set("Cache-Control", "private, max-age=3600");
      res.send(row.bytes);
    } catch (error) {
      console.error("job photo:", error);
      res.status(500).end();
    }
  });

  app.delete("/api/jobs/:jobName/photos/:photoId", async (req, res) => {
    try {
      const jobName = decodeURIComponent(req.params.jobName || "");
      const photoId = Number(req.params.photoId);
      if (!Number.isInteger(photoId) || photoId < 1) {
        return res.status(400).json({ error: "Invalid photo." });
      }
      const result = await pool.query(
        `DELETE FROM job_photos
         WHERE id = $1 AND ${jobKeySql("job_name")} = $2`,
        [photoId, normalizeJobKey(jobName)],
      );
      if (!result.rowCount) {
        return res.status(404).json({ success: false, error: "Photo not found." });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("job photo delete:", error);
      res.status(500).json({ error: "Failed to delete photo." });
    }
  });
}

module.exports = {
  registerJobLookupRoutes,
  normalizeJobKey,
};
