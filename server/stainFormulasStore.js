"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseStainExcelBuffer, classificationFromColor } = require("./stainFormulaParse");

const SPECIES = [
  "White Oak",
  "Maple",
  "Alder",
  "Walnut",
  "Cherry",
  "Beech",
  "Red Oak",
];

async function ensureStainTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formulas (
      id SERIAL PRIMARY KEY,
      formula_number TEXT NOT NULL DEFAULT '',
      color_name TEXT NOT NULL DEFAULT '',
      classification TEXT NOT NULL DEFAULT 'custom',
      material_form TEXT NOT NULL DEFAULT 'unknown',
      wood_species TEXT NOT NULL DEFAULT '',
      wood_type TEXT NOT NULL DEFAULT '',
      formula_date DATE,
      job_number TEXT NOT NULL DEFAULT '',
      door_style TEXT NOT NULL DEFAULT '',
      construction_style TEXT NOT NULL DEFAULT '',
      sheen TEXT NOT NULL DEFAULT '',
      glaze TEXT NOT NULL DEFAULT '',
      distressing TEXT NOT NULL DEFAULT '',
      color_status TEXT NOT NULL DEFAULT '',
      developer TEXT NOT NULL DEFAULT '',
      salesperson TEXT NOT NULL DEFAULT '',
      special_notes TEXT NOT NULL DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'needs_review',
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_steps (
      id SERIAL PRIMARY KEY,
      formula_id INTEGER NOT NULL REFERENCES stain_formulas(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      process_name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_index INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_ingredients (
      id SERIAL PRIMARY KEY,
      step_id INTEGER NOT NULL REFERENCES stain_formula_steps(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      quantity_text TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      raw_line TEXT NOT NULL DEFAULT '',
      uncertain BOOLEAN NOT NULL DEFAULT FALSE,
      sort_index INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_images (
      id SERIAL PRIMARY KEY,
      formula_id INTEGER NOT NULL REFERENCES stain_formulas(id) ON DELETE CASCADE,
      caption TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT 'image/jpeg',
      bytes BYTEA NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_notes (
      id SERIAL PRIMARY KEY,
      formula_id INTEGER NOT NULL REFERENCES stain_formulas(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      critical BOOLEAN NOT NULL DEFAULT FALSE,
      author_user TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_files (
      id SERIAL PRIMARY KEY,
      formula_id INTEGER NOT NULL REFERENCES stain_formulas(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT 'application/octet-stream',
      bytes BYTEA NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_revisions (
      id SERIAL PRIMARY KEY,
      formula_id INTEGER NOT NULL REFERENCES stain_formulas(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL,
      edited_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_formula_imports (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      formula_id INTEGER,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stain_formulas_number ON stain_formulas (formula_number)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stain_formulas_species ON stain_formulas (wood_species)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stain_steps_formula ON stain_formula_steps (formula_id, sort_index)`);
  await pool.query(`ALTER TABLE stain_formula_ingredients ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE stain_formula_steps ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE stain_formula_steps ADD COLUMN IF NOT EXISTS important_notes TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE stain_formula_revisions ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE stain_formulas ADD COLUMN IF NOT EXISTS important_fields JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE stain_formula_images ADD COLUMN IF NOT EXISTS sort_index INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stain_color_links (
      id SERIAL PRIMARY KEY,
      color_a TEXT NOT NULL,
      color_b TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (color_a, color_b)
    )
  `);
  console.log("Stain formula tables ready");
}

async function createSession(pool, userName, role) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO app_sessions (token, user_name, role, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, userName, role || "user", expires.toISOString()],
  );
  return token;
}

async function getSession(pool, token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const result = await pool.query(
    `SELECT user_name, role, expires_at FROM app_sessions WHERE token = $1`,
    [raw],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query(`DELETE FROM app_sessions WHERE token = $1`, [raw]);
    return null;
  }
  const userName = row.user_name;
  const role = userName === "admin123" ? "admin" : row.role || "user";
  return { userName, role };
}

function publicUserName(name) {
  const text = String(name ?? "").trim();
  if (text.toLowerCase() === "admin123") return "ADMIN";
  return text;
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function normalizeWood(woodType, woodSpecies, materialForm) {
  const rawType = String(woodType || "").trim();
  const rawSpecies = String(woodSpecies || "").trim();
  const given = String(materialForm || "").trim().toLowerCase();
  let form = given === "solid" || given === "veneer" ? given : "";
  const lower = rawType.toLowerCase();
  if (!form) {
    if (lower === "veneer" || /\bveneer\b/.test(lower)) form = "veneer";
    else if (lower === "solid" || /\bsolid\b/.test(lower)) form = "solid";
  }
  let species = rawSpecies;
  const stripped = rawType
    .replace(/\bveneer\b/gi, "")
    .replace(/\bsolid\b/gi, "")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && stripped.toLowerCase() !== "solid" && stripped.toLowerCase() !== "veneer") {
    if (
      !species ||
      (stripped.toLowerCase() !== species.toLowerCase() &&
        stripped.toLowerCase().includes(species.toLowerCase()))
    ) {
      species = stripped;
    }
  }
  return {
    woodType: form,
    woodSpecies: species,
    materialForm: form || "unknown",
  };
}

function visibleWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [];
  return list.filter((warning) => {
    const text = String(warning || "").toLowerCase();
    if (text.includes("filename says")) return false;
    if (text.includes("standard vs custom")) return false;
    if (text.includes("left as custom")) return false;
    return true;
  });
}

function mapFormulaRow(row) {
  if (!row) return null;
  const wood = normalizeWood(row.wood_type, row.wood_species, row.material_form);
  return {
    id: row.id,
    formulaNumber: row.formula_number,
    colorName: row.color_name,
    classification: row.classification,
    materialForm: wood.materialForm,
    woodSpecies: wood.woodSpecies,
    woodType: wood.woodType,
    formulaDate: dateOnly(row.formula_date),
    jobNumber: row.job_number,
    doorStyle: row.door_style,
    constructionStyle: row.construction_style,
    sheen: row.sheen,
    glaze: row.glaze,
    distressing: row.distressing,
    colorStatus: row.color_status,
    developer: row.developer,
    salesperson: row.salesperson,
    specialNotes: row.special_notes,
    importantFields: Array.isArray(row.important_fields) ? row.important_fields : [],
    reviewStatus: row.review_status,
    isDemo: !!row.is_demo,
    warnings: visibleWarnings(row.warnings),
    createdBy: publicUserName(row.created_by),
    updatedBy: publicUserName(row.updated_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    primaryImageId: row.primary_image_id || null,
  };
}

async function listFormulas(pool, query) {
  const q = String(query.q || "").trim().toLowerCase();
  const classification = String(query.classification || "").trim().toLowerCase();
  const material = String(query.material || "").trim().toLowerCase();
  const species = String(query.species || "").trim();
  const sort = String(query.sort || "newest");
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 40, 1), 100);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    const n = params.length;
    where.push(`(
      LOWER(formula_number) LIKE $${n}
      OR LOWER(color_name) LIKE $${n}
      OR LOWER(job_number) LIKE $${n}
      OR LOWER(wood_species) LIKE $${n}
      OR LOWER(wood_type) LIKE $${n}
      OR LOWER(special_notes) LIKE $${n}
    )`);
  }
  if (classification === "standard" || classification === "custom") {
    params.push(classification);
    where.push(`classification = $${params.length}`);
  }
  if (material === "solid" || material === "veneer") {
    params.push(material);
    where.push(`material_form = $${params.length}`);
  }
  if (species) {
    params.push(`%${species.toLowerCase()}%`);
    where.push(`LOWER(wood_species) LIKE $${params.length}`);
  }
  const order =
    sort === "oldest"
      ? "created_at ASC"
      : sort === "alpha"
        ? "LOWER(color_name) ASC, formula_number ASC"
        : sort === "updated"
          ? "updated_at DESC"
          : "created_at DESC";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await pool.query(
    `SELECT COUNT(*)::int AS n FROM stain_formulas ${whereSql}`,
    params,
  );
  params.push(limit, offset);
  const rows = await pool.query(
    `SELECT f.*, (
        SELECT id FROM stain_formula_images i
        WHERE i.formula_id = f.id
        ORDER BY i.is_primary DESC, i.sort_index ASC, i.id ASC
        LIMIT 1
      ) AS primary_image_id
     FROM stain_formulas f
     ${whereSql}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total: count.rows[0]?.n || 0,
    formulas: rows.rows.map(mapFormulaRow),
    speciesOptions: SPECIES,
  };
}

async function loadSteps(pool, formulaId) {
  const steps = await pool.query(
    `SELECT * FROM stain_formula_steps WHERE formula_id = $1 ORDER BY sort_index, step_number, id`,
    [formulaId],
  );
  const ids = steps.rows.map((s) => s.id);
  let ingredients = [];
  if (ids.length) {
    const ing = await pool.query(
      `SELECT * FROM stain_formula_ingredients WHERE step_id = ANY($1::int[]) ORDER BY sort_index, id`,
      [ids],
    );
    ingredients = ing.rows;
  }
  return steps.rows.map((step) => ({
    id: step.id,
    stepNumber: step.step_number,
    processName: step.process_name,
    notes: step.notes,
    important: !!step.important,
    importantNotes: step.important_notes || "",
    ingredients: ingredients
      .filter((row) => row.step_id === step.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        quantityText: row.quantity_text,
        unit: row.unit,
        rawLine: row.raw_line,
        uncertain: !!row.uncertain,
        important: !!row.important,
      })),
  }));
}

async function getFormula(pool, id) {
  const result = await pool.query(
    `SELECT f.*, (
        SELECT id FROM stain_formula_images i
        WHERE i.formula_id = f.id
        ORDER BY i.is_primary DESC, i.sort_index ASC, i.id ASC
        LIMIT 1
      ) AS primary_image_id
     FROM stain_formulas f WHERE f.id = $1`,
    [id],
  );
  const formula = mapFormulaRow(result.rows[0]);
  if (!formula) return null;
  formula.steps = await loadSteps(pool, id);
  const images = await pool.query(
    `SELECT id, caption, mime, is_primary, uploaded_by, created_at
     FROM stain_formula_images WHERE formula_id = $1
     ORDER BY is_primary DESC, sort_index ASC, id ASC`,
    [id],
  );
  formula.images = images.rows.map((row) => ({
    id: row.id,
    caption: row.caption,
    mime: row.mime,
    isPrimary: !!row.is_primary,
    uploadedBy: publicUserName(row.uploaded_by),
    createdAt: row.created_at,
  }));
  const notes = await pool.query(
    `SELECT * FROM stain_formula_notes WHERE formula_id = $1
     ORDER BY pinned DESC, created_at DESC`,
    [id],
  );
  formula.notes = notes.rows.map((row) => ({
    id: row.id,
    body: row.body,
    category: row.category,
    pinned: !!row.pinned,
    critical: !!row.critical,
    authorUser: row.author_user,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    edited: new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000,
  }));
  const files = await pool.query(
    `SELECT id, filename, mime, uploaded_by, created_at
     FROM stain_formula_files WHERE formula_id = $1 ORDER BY id`,
    [id],
  );
  formula.files = files.rows;
  const revs = await pool.query(
    `SELECT id, edited_by, created_at, summary FROM stain_formula_revisions
     WHERE formula_id = $1 ORDER BY id DESC LIMIT 20`,
    [id],
  );
  formula.revisions = revs.rows.map((row) => ({
    id: row.id,
    editedBy: publicUserName(row.edited_by),
    createdAt: row.created_at,
    summary: row.summary || "",
  }));
  formula.linkedNumbers = await linkedNumbers(pool, formula.formulaNumber);
  const familyNumbers = [formula.formulaNumber, ...formula.linkedNumbers].filter(Boolean);
  const family = await pool.query(
    `SELECT id, formula_number, color_name, material_form, wood_type, wood_species
     FROM stain_formulas
     WHERE formula_number = ANY($1::text[])
     ORDER BY formula_number, material_form, id`,
    [familyNumbers],
  );
  formula.family = family.rows.map((row) => {
    const wood = normalizeWood(row.wood_type, row.wood_species, row.material_form);
    return {
      id: row.id,
      formulaNumber: row.formula_number,
      colorName: row.color_name,
      materialForm: wood.materialForm,
      woodType: wood.woodType,
      woodSpecies: wood.woodSpecies,
    };
  });
  return formula;
}

function pairKey(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b || a === b) return null;
  return a < b ? [a, b] : [b, a];
}

async function linkedNumbers(pool, formulaNumber) {
  const number = String(formulaNumber || "").trim();
  if (!number) return [];
  const result = await pool.query(
    `SELECT color_a, color_b FROM stain_color_links
     WHERE color_a = $1 OR color_b = $1`,
    [number],
  );
  return result.rows.map((row) => (row.color_a === number ? row.color_b : row.color_a));
}

async function linkColors(pool, left, right, userName) {
  const pair = pairKey(left, right);
  if (!pair) return { success: false, error: "Enter a different color number." };
  await pool.query(
    `INSERT INTO stain_color_links (color_a, color_b, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (color_a, color_b) DO NOTHING`,
    [pair[0], pair[1], userName || ""],
  );
  return { success: true, linkedNumbers: await linkedNumbers(pool, left) };
}

async function setPrimaryImage(pool, formulaId, imageId) {
  const images = await pool.query(
    `SELECT id FROM stain_formula_images
     WHERE formula_id = $1
     ORDER BY is_primary DESC, sort_index ASC, id ASC`,
    [formulaId],
  );
  const ids = images.rows.map((row) => row.id);
  const chosen = Number(imageId);
  if (!ids.includes(chosen)) return { success: false, error: "Photo not found" };
  const ordered = [chosen, ...ids.filter((id) => id !== chosen)];
  for (let index = 0; index < ordered.length; index += 1) {
    await pool.query(
      `UPDATE stain_formula_images
       SET is_primary = $3, sort_index = $4
       WHERE id = $1 AND formula_id = $2`,
      [ordered[index], formulaId, index === 0, index],
    );
  }
  return { success: true };
}

async function unlinkColors(pool, left, right) {
  const pair = pairKey(left, right);
  if (!pair) return { success: false, error: "Invalid link" };
  await pool.query(
    `DELETE FROM stain_color_links WHERE color_a = $1 AND color_b = $2`,
    pair,
  );
  return { success: true };
}

function cleanDraft(body) {
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const wood = normalizeWood(body.woodType, body.woodSpecies, body.materialForm);
  return {
    formulaNumber: String(body.formulaNumber || body.formula_number || "").trim(),
    colorName: String(body.colorName || "").trim(),
    classification: classificationFromColor(body.colorName),
    materialForm: wood.materialForm,
    woodSpecies: wood.woodSpecies,
    woodType: wood.woodType,
    formulaDate: String(body.formulaDate || "").slice(0, 10),
    jobNumber: String(body.jobNumber || "").trim(),
    doorStyle: String(body.doorStyle || "").trim(),
    constructionStyle: String(body.constructionStyle || "").trim(),
    sheen: String(body.sheen || "").trim(),
    glaze: String(body.glaze || "").trim(),
    distressing: String(body.distressing || "").trim(),
    colorStatus: String(body.colorStatus || "").trim(),
    developer: String(body.developer || "").trim(),
    salesperson: String(body.salesperson || "").trim(),
    specialNotes: String(body.specialNotes || "").trim(),
    importantFields: Array.isArray(body.importantFields) ? body.importantFields.map(String) : [],
    reviewStatus: body.reviewStatus === "approved" ? "approved" : "needs_review",
    warnings: visibleWarnings(Array.isArray(body.warnings) ? body.warnings.map(String) : []),
    isDemo: !!body.isDemo,
    steps: steps.map((step, index) => ({
      stepNumber: Number(step.stepNumber),
      processName: String(step.processName || "").trim(),
      notes: String(step.notes || "").trim(),
      important: !!step.important,
      importantNotes: String(step.importantNotes || "").trim(),
      sortIndex: index,
      ingredients: (step.ingredients || []).map((ing, i) => ({
        name: String(ing.name || "").trim(),
        quantityText: String(ing.quantityText ?? ing.quantity ?? "").trim(),
        unit: String(ing.unit || "").trim(),
        rawLine: String(ing.rawLine || "").trim(),
        uncertain: !!ing.uncertain,
        important: !!ing.important,
        sortIndex: i,
      })),
    })).filter((step) => Number.isInteger(step.stepNumber)),
  };
}

async function insertSteps(client, formulaId, steps) {
  for (const step of steps) {
    const inserted = await client.query(
      `INSERT INTO stain_formula_steps (formula_id, step_number, process_name, notes, important_notes, sort_index, important)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        formulaId,
        step.stepNumber,
        step.processName,
        step.notes,
        step.importantNotes || "",
        step.sortIndex,
        !!(step.important || step.importantNotes),
      ],
    );
    const stepId = inserted.rows[0].id;
    for (const ing of step.ingredients) {
      await client.query(
        `INSERT INTO stain_formula_ingredients
         (step_id, name, quantity_text, unit, raw_line, uncertain, important, sort_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [stepId, ing.name, ing.quantityText, ing.unit, ing.rawLine, ing.uncertain, ing.important, ing.sortIndex],
      );
    }
  }
}

async function saveFormula(pool, body, userName, existingId) {
  const draft = cleanDraft(body);
  if (!draft.formulaNumber) return { success: false, error: "Formula number is required" };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let id = existingId ? Number(existingId) : null;
    if (id) {
      const current = await getFormula(pool, id);
      if (!current) {
        await client.query("ROLLBACK");
        return { success: false, error: "Not found" };
      }
      const summary = describeChanges(current, draft);
      await client.query(
        `INSERT INTO stain_formula_revisions (formula_id, snapshot, edited_by, summary)
         VALUES ($1, $2::jsonb, $3, $4)`,
        [id, JSON.stringify({ steps: current.steps, colorName: current.colorName, reviewStatus: current.reviewStatus }), userName, summary],
      );
      await client.query(
        `UPDATE stain_formulas SET
           formula_number = $2, color_name = $3, classification = $4, material_form = $5,
           wood_species = $6, wood_type = $7, formula_date = $8, job_number = $9,
           door_style = $10, construction_style = $11, sheen = $12, glaze = $13,
           distressing = $14, color_status = $15, developer = $16, salesperson = $17,
           special_notes = $18, important_fields = $19::jsonb, review_status = $20, warnings = $21::jsonb,
           updated_by = $22, updated_at = NOW()
         WHERE id = $1`,
        [
          id, draft.formulaNumber, draft.colorName, draft.classification, draft.materialForm,
          draft.woodSpecies, draft.woodType, draft.formulaDate || null, draft.jobNumber,
          draft.doorStyle, draft.constructionStyle, draft.sheen, draft.glaze,
          draft.distressing, draft.colorStatus, draft.developer, draft.salesperson,
          draft.specialNotes, JSON.stringify(draft.importantFields), draft.reviewStatus, JSON.stringify(draft.warnings), userName,
        ],
      );
      await client.query(`DELETE FROM stain_formula_steps WHERE formula_id = $1`, [id]);
    } else {
      const inserted = await client.query(
        `INSERT INTO stain_formulas (
           formula_number, color_name, classification, material_form, wood_species, wood_type,
           formula_date, job_number, door_style, construction_style, sheen, glaze, distressing,
           color_status, developer, salesperson, special_notes, important_fields, review_status, is_demo, warnings,
           created_by, updated_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22::jsonb,$23,$23
         ) RETURNING id`,
        [
          draft.formulaNumber, draft.colorName, draft.classification, draft.materialForm,
          draft.woodSpecies, draft.woodType, draft.formulaDate || null, draft.jobNumber,
          draft.doorStyle, draft.constructionStyle, draft.sheen, draft.glaze, draft.distressing,
          draft.colorStatus, draft.developer, draft.salesperson, draft.specialNotes,
          JSON.stringify(draft.importantFields), draft.reviewStatus, draft.isDemo, JSON.stringify(draft.warnings), userName,
        ],
      );
      id = inserted.rows[0].id;
    }
    await insertSteps(client, id, draft.steps);
    await client.query("COMMIT");
    return { success: true, formula: await getFormula(pool, id) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findPossibleDuplicates(pool, draft) {
  const result = await pool.query(
    `SELECT id, formula_number, material_form, wood_species, job_number, formula_date, color_name
     FROM stain_formulas
     WHERE formula_number = $1
     LIMIT 20`,
    [String(draft.formulaNumber || "").trim()],
  );
  return result.rows.map((row) => ({
    id: row.id,
    formulaNumber: row.formula_number,
    materialForm: row.material_form,
    woodSpecies: row.wood_species,
    jobNumber: row.job_number,
    formulaDate: row.formula_date ? String(row.formula_date).slice(0, 10) : "",
    colorName: row.color_name,
    sameJob: String(row.job_number || "") === String(draft.jobNumber || ""),
    sameMaterial: row.material_form === draft.materialForm,
  }));
}

function describeChanges(prev, next) {
  const lines = [];
  const fields = [
    ["formulaNumber", "Custom number"],
    ["colorName", "Color"],
    ["formulaDate", "Formula date"],
    ["jobNumber", "Job number"],
    ["woodType", "Wood type"],
    ["materialForm", "Material"],
    ["sheen", "Sheen"],
    ["doorStyle", "Door style"],
    ["developer", "Developer"],
    ["salesperson", "Salesperson"],
    ["specialNotes", "Special notes"],
    ["reviewStatus", "Status"],
  ];
  fields.forEach(([key, label]) => {
    const before = String(prev?.[key] || "");
    const after = String(next?.[key] || "");
    if (before !== after) lines.push(`${label}: ${before || "—"} → ${after || "—"}`);
  });
  const prevSteps = new Map((prev?.steps || []).map((step) => [step.stepNumber, step]));
  const nextSteps = new Map((next?.steps || []).map((step) => [step.stepNumber, step]));
  nextSteps.forEach((step, num) => {
    const old = prevSteps.get(num);
    if (!old) {
      lines.push(`Added step ${num}${step.processName ? ` ${step.processName}` : ""}`);
      return;
    }
    if ((old.processName || "") !== (step.processName || "")) {
      lines.push(`Step ${num} name: ${old.processName || "—"} → ${step.processName || "—"}`);
    }
    const oldIngs = old.ingredients || [];
    const newIngs = step.ingredients || [];
    const count = Math.max(oldIngs.length, newIngs.length);
    for (let i = 0; i < count; i += 1) {
      const a = oldIngs[i];
      const b = newIngs[i];
      const label = (ing) => `${ing.quantityText || ""} ${ing.unit || ""} ${ing.name || ""}`.trim();
      if (!a && b) lines.push(`Step ${num}: added ${label(b)}`);
      else if (a && !b) lines.push(`Step ${num}: removed ${label(a)}`);
      else if (a && b && label(a) !== label(b)) {
        lines.push(`Step ${num}: ${label(a)} → ${label(b)}`);
      }
    }
  });
  prevSteps.forEach((step, num) => {
    if (!nextSteps.has(num)) {
      lines.push(`Removed step ${num}${step.processName ? ` ${step.processName}` : ""}`);
    }
  });
  return lines.join("\n") || "Saved with no field changes.";
}

async function seedDemoFormula(pool) {
  const existing = await pool.query(
    `SELECT id FROM stain_formulas WHERE is_demo = TRUE AND formula_number = '1526' LIMIT 1`,
  );
  if (!existing.rows[0]) {
  const filePath = path.join(__dirname, "fixtures", "1526 - Solid.xlsm");
  if (!fs.existsSync(filePath)) return;
  const buffer = fs.readFileSync(filePath);
  const parsed = await parseStainExcelBuffer(buffer, "1526 - Solid.xlsm");
  if (!parsed.draft) return;
  const saved = await saveFormula(
    pool,
    { ...parsed.draft, warnings: parsed.warnings, isDemo: true, reviewStatus: "needs_review" },
    "system",
  );
  if (!saved.success) return;
  await pool.query(
    `INSERT INTO stain_formula_files (formula_id, filename, mime, bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      saved.formula.id,
      "1526 - Solid.xlsm",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      buffer,
      "system",
    ],
  );
  console.log("Seeded demo stain formula 1526");
  }
  await linkColors(pool, "1526", "1401", "system");
  await linkColors(pool, "1526", "1536", "system");
  await pool.query(`
    UPDATE stain_formulas
    SET warnings = COALESCE((
      SELECT jsonb_agg(item)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(warnings) = 'array' THEN warnings ELSE '[]'::jsonb END) AS item
      WHERE NOT (
        item #>> '{}' ILIKE '%filename says%'
        OR item #>> '{}' ILIKE '%standard vs custom%'
        OR item #>> '{}' ILIKE '%left as custom%'
      )
    ), '[]'::jsonb)
  `);
  const rows = await pool.query(`SELECT id, color_name, classification FROM stain_formulas`);
  for (const row of rows.rows) {
    const next = classificationFromColor(row.color_name);
    if (next !== row.classification) {
      await pool.query(`UPDATE stain_formulas SET classification = $2 WHERE id = $1`, [row.id, next]);
    }
  }
}

module.exports = {
  ensureStainTables,
  createSession,
  getSession,
  listFormulas,
  getFormula,
  saveFormula,
  findPossibleDuplicates,
  seedDemoFormula,
  linkColors,
  unlinkColors,
  setPrimaryImage,
  SPECIES,
};
