const { Pool } = require("pg");

// Use DATABASE_URL from env (Supabase connection string). Never commit the real URL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Create server/.env with DATABASE_URL=postgresql://postgres:Dsz86yh38y5M6AXX@db.ybcupkvyecibieasbwim.supabase.co:5432/postgres",
  );
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("supabase")
    ? { rejectUnauthorized: false }
    : false,
});

/** Fill missing po_lane for API JSON — DB may have NULLs on legacy rows. Derive legacy booleans from po_lane so responses stay consistent. */
function normalizeItemPoFields(row) {
  if (!row) return row;
  if (row.po_lane === "ap" || row.po_lane === "mixing") {
    const ap = row.po_lane === "ap";
    return { ...row, po_label_ap: ap, po_label_mixing: !ap };
  }
  const t = row.type ? String(row.type).toLowerCase() : "";
  if (["clear", "primer", "catalyst"].includes(t)) {
    return { ...row, po_lane: "ap", po_label_ap: true, po_label_mixing: false };
  }
  return { ...row, po_lane: "mixing", po_label_ap: false, po_label_mixing: true };
}

class Database {
  constructor() {
    this.pool = pool;
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      await this.initTables(client);
      client.release();
      await this.backfillPoLaneDefaults();
      console.log("Connected to PostgreSQL database");
    } catch (err) {
      console.error("Error connecting to database:", err);
      throw err;
    }
  }

  /** Fill NULL po_lane / po_label_* so API responses are never all-null for legacy rows. */
  async backfillPoLaneDefaults() {
    const now = new Date().toISOString();
    try {
      await this.pool.query(
        `UPDATE items
         SET po_lane = 'ap', "updatedAt" = $1
         WHERE po_lane IS NULL
           AND lower(COALESCE("type", '')) IN ('clear', 'primer', 'catalyst')`,
        [now],
      );
      await this.pool.query(
        `UPDATE items
         SET po_lane = 'mixing', "updatedAt" = $1
         WHERE po_lane IS NULL`,
        [now],
      );
      console.log("[DB] po_lane / po_label columns backfilled where NULL");
    } catch (e) {
      console.error("[DB] po_lane backfill failed:", e?.message || e);
    }
  }

  async initTables(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        location TEXT DEFAULT '',
        "lastScanned" TEXT,
        "lastScannedBy" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        "minQuantity" INTEGER DEFAULT NULL
      )
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'minQuantity') THEN
          ALTER TABLE items ADD COLUMN "minQuantity" INTEGER DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'price') THEN
          ALTER TABLE items ADD COLUMN price REAL DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'type') THEN
          ALTER TABLE items ADD COLUMN "type" TEXT DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'display_order') THEN
          ALTER TABLE items ADD COLUMN "display_order" INTEGER DEFAULT 0;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'hex_color') THEN
          ALTER TABLE items ADD COLUMN hex_color TEXT DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'recycle_date') THEN
          ALTER TABLE items ADD COLUMN recycle_date TEXT DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'external_code') THEN
          ALTER TABLE items ADD COLUMN external_code TEXT UNIQUE DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'po_label_ap') THEN
          ALTER TABLE items ADD COLUMN po_label_ap BOOLEAN DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'po_label_mixing') THEN
          ALTER TABLE items ADD COLUMN po_label_mixing BOOLEAN DEFAULT NULL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'po_lane') THEN
          ALTER TABLE items ADD COLUMN po_lane TEXT DEFAULT NULL;
        END IF;
      END $$
    `);
    console.log("Items table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await client.query(`
      INSERT INTO settings (key, value) VALUES ('next_id', '1')
      ON CONFLICT (key) DO NOTHING
    `);
    await client.query(`
      INSERT INTO settings (key, value) VALUES ('min_quantity', '30')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log("Settings table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        "itemId" TEXT,
        "userName" TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL
      )
    `);
    console.log("Audit log table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        po_number TEXT NOT NULL,
        placed_at TEXT NOT NULL,
        lead_time_days INTEGER NOT NULL DEFAULT 5,
        status TEXT NOT NULL DEFAULT 'open',
        created_by TEXT DEFAULT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_lines (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0
      )
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_lines' AND column_name = 'received_quantity') THEN
          ALTER TABLE order_lines ADD COLUMN received_quantity INTEGER NOT NULL DEFAULT 0;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_lines' AND column_name = 'received_at') THEN
          ALTER TABLE order_lines ADD COLUMN received_at TEXT DEFAULT NULL;
        END IF;
      END $$
    `);
    console.log("Orders tables ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS material_usage (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        entry_date TEXT NOT NULL,
        entry_time TEXT NOT NULL,
        job_name TEXT NOT NULL DEFAULT '',
        item_id TEXT NOT NULL,
        color_name TEXT NOT NULL DEFAULT '',
        qty_gallons REAL NOT NULL,
        catalyst_gallons REAL NOT NULL,
        catalyst_oz REAL,
        catalyzed_confirmed BOOLEAN DEFAULT FALSE,
        catalyzed_confirmed_at TIMESTAMPTZ,
        booth TEXT NOT NULL,
        user_name TEXT NOT NULL DEFAULT ''
      )
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_usage' AND column_name = 'catalyst_oz') THEN
          ALTER TABLE material_usage ADD COLUMN catalyst_oz REAL;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_usage' AND column_name = 'material_type') THEN
          ALTER TABLE material_usage ADD COLUMN material_type TEXT;
        END IF;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'material_usage' AND column_name = 'cup_gun') THEN
          ALTER TABLE material_usage ADD COLUMN cup_gun BOOLEAN DEFAULT FALSE;
        END IF;
      END $$
    `);
    console.log("Material usage table ready");
  }

  async getAllItems() {
    const result = await this.pool.query("SELECT * FROM items ORDER BY id");
    return result.rows.map(normalizeItemPoFields);
  }

  async getItem(itemId) {
    const raw = itemId != null ? String(itemId).trim() : "";
    if (!raw) return null;

    // First try direct match on id or external_code
    let result = await this.pool.query(
      "SELECT * FROM items WHERE id = $1 OR external_code = $1 LIMIT 1",
      [raw],
    );
    if (result.rows[0]) return normalizeItemPoFields(result.rows[0]);

    // If not found, and a global paint suffix is configured, try stripping it
    const suffix = await this.getSetting("paint_external_suffix");
    const trimmedSuffix = suffix != null ? String(suffix).trim() : "";
    if (trimmedSuffix && raw.endsWith(trimmedSuffix)) {
      const base = raw.slice(0, -trimmedSuffix.length);
      if (base) {
        result = await this.pool.query(
          "SELECT * FROM items WHERE id = $1 OR external_code = $1 LIMIT 1",
          [base],
        );
        if (result.rows[0]) return normalizeItemPoFields(result.rows[0]);
      }
    }

    return null;
  }

  async addItem(item) {
    const now = new Date().toISOString();
    const price = item.price != null && !isNaN(Number(item.price)) ? Number(item.price) : null;
    const allowedTypes = ["paint", "primer", "clear", "stain", "dye", "catalyst", "custom_paint", "custom_stain"];
    const type = item.type && allowedTypes.includes(String(item.type).toLowerCase())
      ? String(item.type).toLowerCase()
      : null;
    const displayOrder = item.display_order != null && !isNaN(Number(item.display_order)) ? Number(item.display_order) : 0;
    const hexColor = item.hex_color != null && String(item.hex_color).trim() !== "" ? String(item.hex_color).trim() : null;
    const recycleDate = item.recycle_date != null && String(item.recycle_date).trim() !== "" ? String(item.recycle_date).trim() : null;
    let externalCode = item.external_code != null && String(item.external_code).trim() !== ""
      ? String(item.external_code).trim()
      : null;
    // If no explicit external code provided and this is a paint/custom_paint,
    // auto-derive one from the global suffix setting: <id><suffix>.
    if (!externalCode && (type === "paint" || type === "custom_paint")) {
      const suffix = await this.getSetting("paint_external_suffix");
      const trimmed = suffix != null ? String(suffix).trim() : "";
      if (trimmed) {
        externalCode = String(item.id).trim() + trimmed;
      }
    }
    const poLane =
      item.po_lane === "ap"
        ? "ap"
        : item.po_lane === "mixing"
          ? "mixing"
          : "mixing";
    await this.pool.query(
      `INSERT INTO items (id, name, quantity, description, location, "lastScanned", "lastScannedBy", "createdAt", "updatedAt", "minQuantity", price, "type", "display_order", hex_color, recycle_date, external_code, po_lane)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        item.id,
        item.name,
        item.quantity || 0,
        item.description || "",
        item.location || "",
        item.lastScanned || now,
        item.lastScannedBy || "",
        item.createdAt || now,
        now,
        item.minQuantity != null ? item.minQuantity : null,
        price,
        type,
        displayOrder,
        hexColor,
        recycleDate,
        externalCode,
        poLane,
      ],
    );
    return {
      success: true,
      item: {
        ...item,
        updatedAt: now,
        price,
        type,
        display_order: displayOrder,
        hex_color: hexColor,
        recycle_date: recycleDate,
        external_code: externalCode,
        po_lane: poLane,
      },
    };
  }

  async updateItem(itemId, updates) {
    const now = new Date().toISOString();
    const validColumns = [
      "name",
      "quantity",
      "description",
      "location",
      "lastScanned",
      "lastScannedBy",
      "createdAt",
      "updatedAt",
      "minQuantity",
      "price",
      "type",
      "display_order",
      "hex_color",
      "recycle_date",
      "external_code",
      "po_lane",
    ];
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach((key) => {
      if (key !== "id" && key !== "userName" && validColumns.includes(key)) {
        const col =
          key === "lastScanned" ||
          key === "lastScannedBy" ||
          key === "createdAt" ||
          key === "updatedAt" ||
          key === "minQuantity" ||
          key === "type" ||
          key === "display_order" ||
          key === "hex_color" ||
          key === "recycle_date"
            ? `"${key}"`
            : key;
        fields.push(`${col} = $${paramIndex}`);
        if (key === "price") {
          const v = updates[key];
          values.push(v == null || v === "" ? null : (isNaN(Number(v)) ? null : Number(v)));
        } else if (key === "type") {
          const v = updates[key];
          const allowed = ["paint", "primer", "clear", "stain", "dye", "catalyst", "custom_paint", "custom_stain"];
          values.push(v && allowed.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null);
        } else if (key === "display_order") {
          const v = updates[key];
          values.push(v == null || v === "" ? 0 : (isNaN(Number(v)) ? 0 : Number(v)));
        } else if (key === "hex_color") {
          const v = updates[key];
          values.push(v != null && String(v).trim() !== "" ? String(v).trim() : null);
        } else if (key === "recycle_date") {
          const v = updates[key];
          values.push(v != null && String(v).trim() !== "" ? String(v).trim() : null);
        } else if (key === "external_code") {
          const v = updates[key];
          values.push(v != null && String(v).trim() !== "" ? String(v).trim() : null);
        } else if (key === "po_lane") {
          const v = updates[key];
          const s = v != null ? String(v).toLowerCase().trim() : "";
          values.push(s === "ap" || s === "mixing" ? s : null);
        } else {
          values.push(updates[key]);
        }
        paramIndex++;
      }
    });

    fields.push(`"updatedAt" = $${paramIndex}`);
    values.push(now);
    paramIndex++;
    const idForWhere = String(itemId).trim();
    values.push(idForWhere);

    const result = await this.pool.query(
      `UPDATE items SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );

    if (result.rowCount === 0) {
      return { success: false, error: "Item not found" };
    }

    const item = await this.getItem(idForWhere);
    return { success: true, item };
  }

  /**
   * Authoritative PO lane: sets po_lane (TEXT) plus boolean columns in one UPDATE.
   * lane must be 'ap' or 'mixing'.
   */
  async updateItemPoLane(itemId, lane) {
    const now = new Date().toISOString();
    const id = String(itemId).trim();
    const laneNorm = lane === "ap" ? "ap" : "mixing";
    const r = await this.pool.query(
      `UPDATE items SET po_lane = $1, "updatedAt" = $2 WHERE id = $3`,
      [laneNorm, now, id],
    );
    if (r.rowCount === 0) {
      throw new Error("Item not found");
    }
  }

  async deleteItem(itemId) {
    const result = await this.pool.query("DELETE FROM items WHERE id = $1", [
      itemId,
    ]);
    return { success: result.rowCount > 0 };
  }

  async updateItemId(oldId, newId) {
    const result = await this.pool.query(
      'UPDATE items SET id = $1, "updatedAt" = $2 WHERE id = $3',
      [newId, new Date().toISOString(), oldId],
    );
    if (result.rowCount === 0) {
      return { success: false, error: "Item not found" };
    }
    return { success: true, itemId: newId };
  }

  async getNextIdNumber() {
    const result = await this.pool.query(
      "SELECT value FROM settings WHERE key = $1",
      ["next_id"],
    );
    const value = result.rows[0]?.value || "1";
    return parseInt(value, 10);
  }

  async setNextIdNumber(number) {
    await this.pool.query(
      `INSERT INTO settings (key, value) VALUES ('next_id', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(number)],
    );
    return { success: true };
  }

  async getSetting(key) {
    const result = await this.pool.query(
      "SELECT value FROM settings WHERE key = $1",
      [key],
    );
    return result.rows[0]?.value ?? null;
  }

  async setSetting(key, value) {
    await this.pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, String(value)],
    );
    return { success: true };
  }

  async addAuditLog(action, itemId, userName, details) {
    const result = await this.pool.query(
      `INSERT INTO audit_log (action, "itemId", "userName", details, timestamp)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        action,
        itemId || null,
        userName,
        JSON.stringify(details || {}),
        new Date().toISOString(),
      ],
    );
    return { success: true, id: result.rows[0].id };
  }

  async getAuditLogs(limit = 100) {
    const result = await this.pool.query(
      "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT $1",
      [limit],
    );
    return result.rows.map((row) => ({
      ...row,
      details:
        typeof row.details === "string"
          ? JSON.parse(row.details || "{}")
          : row.details || {},
    }));
  }

  async createOrder(poNumber, leadTimeDays, lines, createdBy, placedAt = null) {
    let placed;
    if (placedAt && typeof placedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(placedAt.trim())) {
      placed = placedAt.trim();
    } else if (placedAt && !Number.isNaN(new Date(placedAt).getTime())) {
      const d = new Date(placedAt);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      placed = `${y}-${m}-${day}`;
    } else {
      const d = new Date();
      placed = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
    const result = await this.pool.query(
      `INSERT INTO orders (po_number, placed_at, lead_time_days, status, created_by)
       VALUES ($1, $2, $3, 'open', $4) RETURNING id`,
      [String(poNumber).trim(), placed, leadTimeDays == null ? 5 : Math.max(0, parseInt(leadTimeDays, 10) || 5), createdBy || null],
    );
    const orderId = result.rows[0].id;
    for (const line of lines || []) {
      const itemId = line.itemId || line.item_id;
      const qty = Math.max(0, parseInt(line.quantity, 10) || 0);
      if (!itemId || qty <= 0) continue;
      await this.pool.query(
        `INSERT INTO order_lines (order_id, item_id, quantity) VALUES ($1, $2, $3)`,
        [orderId, String(itemId).trim(), qty],
      );
    }
    return this.getOrderById(orderId);
  }

  async getOrderById(orderId) {
    const orderResult = await this.pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [orderId],
    );
    const order = orderResult.rows[0] || null;
    if (!order) return null;
    const linesResult = await this.pool.query(
      "SELECT * FROM order_lines WHERE order_id = $1 ORDER BY id",
      [orderId],
    );
    order.lines = linesResult.rows.map((r) => ({
      itemId: r.item_id,
      quantity: r.quantity,
      received_quantity: r.received_quantity != null ? r.received_quantity : 0,
      received_at: r.received_at || null,
    }));
    return order;
  }

  async getOrders(limit = 100) {
    const result = await this.pool.query(
      "SELECT * FROM orders ORDER BY placed_at DESC LIMIT $1",
      [limit],
    );
    const orders = [];
    for (const row of result.rows) {
      const order = await this.getOrderById(row.id);
      if (order) orders.push(order);
    }
    return orders;
  }

  async updateOrderStatus(orderId, status) {
    if (status !== "open" && status !== "received") return { success: false, error: "Invalid status" };
    const result = await this.pool.query(
      "UPDATE orders SET status = $1 WHERE id = $2",
      [status, orderId],
    );
    if (result.rowCount === 0) return { success: false, error: "Order not found" };
    return { success: true, order: await this.getOrderById(orderId) };
  }

  async updateOrder(orderId, poNumber, leadTimeDays, lines, placedAt = null) {
    const id = typeof orderId === "string" ? parseInt(orderId, 10) : Number(orderId);
    if (!Number.isInteger(id) || id < 1) return { success: false, error: "Invalid order ID" };
    const order = await this.getOrderById(id);
    if (!order) return { success: false, error: "Order not found" };
    if (order.status !== "open") return { success: false, error: "Only open orders can be updated" };
    let placed = null;
    if (placedAt) {
      if (typeof placedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(placedAt.trim())) {
        placed = placedAt.trim();
      } else if (!Number.isNaN(new Date(placedAt).getTime())) {
        const d = new Date(placedAt);
        placed = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }
    }
    const updateResult = placed
      ? await this.pool.query(
          "UPDATE orders SET po_number = $1, lead_time_days = $2, placed_at = $3 WHERE id = $4",
          [String(poNumber).trim(), Math.max(0, parseInt(leadTimeDays, 10) || 5), placed, id],
        )
      : await this.pool.query(
          "UPDATE orders SET po_number = $1, lead_time_days = $2 WHERE id = $3",
          [String(poNumber).trim(), Math.max(0, parseInt(leadTimeDays, 10) || 5), id],
        );
    if (updateResult.rowCount === 0) return { success: false, error: "Order not found" };
    await this.pool.query("DELETE FROM order_lines WHERE order_id = $1", [id]);
    for (const line of lines || []) {
      const itemId = line.itemId || line.item_id;
      const qty = Math.max(0, parseInt(line.quantity, 10) || 0);
      if (!itemId || qty <= 0) continue;
      await this.pool.query(
        "INSERT INTO order_lines (order_id, item_id, quantity) VALUES ($1, $2, $3)",
        [id, String(itemId).trim(), qty],
      );
    }
    return { success: true, order: await this.getOrderById(id) };
  }

  async getOnOrderSummary() {
    const result = await this.pool.query(
      `SELECT ol.item_id, ol.quantity, ol.received_quantity, o.placed_at, o.lead_time_days, o.po_number
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE o.status = 'open'
       ORDER BY o.placed_at ASC`,
    );
    const byItem = {};
    for (const row of result.rows) {
      const id = row.item_id;
      const ordered = parseInt(row.quantity, 10) || 0;
      const received = parseInt(row.received_quantity, 10) || 0;
      const remaining = Math.max(0, ordered - received);
      if (remaining <= 0) continue;
      const placed = new Date(row.placed_at);
      const days = parseInt(row.lead_time_days, 10) || 5;
      const expected = new Date(placed);
      expected.setDate(expected.getDate() + days);
      const po =
        row.po_number != null && String(row.po_number).trim() !== ""
          ? String(row.po_number).trim()
          : null;
      const orderIsLate = (() => {
        const s =
          row.placed_at != null ? String(row.placed_at).trim().slice(0, 10) : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split("-").map(Number);
        const placedUtc = Date.UTC(y, m - 1, d);
        const lead = Math.max(0, parseInt(row.lead_time_days, 10) || 7);
        const expectedUtc = new Date(placedUtc);
        expectedUtc.setUTCDate(expectedUtc.getUTCDate() + lead);
        const dayAfterExpectedUtc = Date.UTC(
          expectedUtc.getUTCFullYear(),
          expectedUtc.getUTCMonth(),
          expectedUtc.getUTCDate() + 1,
        );
        const now = new Date();
        const todayUtcDay = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
        );
        return todayUtcDay >= dayAfterExpectedUtc;
      })();
      const lineIsBackOrdered = received > 0 && remaining > 0;
      if (!byItem[id]) {
        byItem[id] = {
          quantity: 0,
          expectedDate: expected.toISOString(),
          poNumber: po,
          late: false,
          backOrdered: false,
        };
      }
      byItem[id].quantity += remaining;
      if (orderIsLate) byItem[id].late = true;
      if (lineIsBackOrdered) byItem[id].backOrdered = true;
      if (expected > new Date(byItem[id].expectedDate)) {
        byItem[id].expectedDate = expected.toISOString();
        byItem[id].poNumber = po;
      }
    }
    return byItem;
  }

  async receiveOrderLine(orderId, itemId, quantity, userName) {
    const order = await this.getOrderById(orderId);
    if (!order) return { success: false, error: "Order not found" };
    if (order.status !== "open") return { success: false, error: "Order is not open for receiving" };
    const line = (order.lines || []).find((l) => String(l.itemId) === String(itemId));
    if (!line) return { success: false, error: "Item not on this order" };
    const ordered = parseInt(line.quantity, 10) || 0;
    const alreadyReceived = parseInt(line.received_quantity, 10) || 0;
    const receiveQty = Math.max(0, Math.min(quantity, ordered - alreadyReceived));
    if (receiveQty <= 0) return { success: false, error: "No quantity remaining to receive for this line" };
    const now = new Date().toISOString();
    const newReceived = alreadyReceived + receiveQty;
    await this.pool.query(
      `UPDATE order_lines SET received_quantity = $1, received_at = $2 WHERE order_id = $3 AND item_id = $4`,
      [newReceived, now, orderId, String(itemId).trim()],
    );
    const updatedOrder = await this.getOrderById(orderId);
    const allReceived = (updatedOrder.lines || []).every(
      (l) => (parseInt(l.received_quantity, 10) || 0) >= (parseInt(l.quantity, 10) || 0),
    );
    if (allReceived) {
      await this.pool.query("UPDATE orders SET status = $1 WHERE id = $2", ["received", orderId]);
      updatedOrder.status = "received";
    }
    return { success: true, receivedQuantity: receiveQty, order: await this.getOrderById(orderId) };
  }

  async getBackOrderCount() {
    const result = await this.pool.query(
      `SELECT COUNT(*) AS count FROM (
         SELECT o.id
         FROM orders o
         JOIN order_lines ol ON ol.order_id = o.id
         WHERE o.status = 'open'
         GROUP BY o.id
         HAVING SUM(COALESCE(ol.received_quantity, 0)) > 0
            AND SUM(ol.quantity - COALESCE(ol.received_quantity, 0)) > 0
       ) t`,
    );
    return result.rows[0] ? parseInt(result.rows[0].count, 10) : 0;
  }

  /**
   * Same UTC-based "late" rule as client isLateOrder: late when today (UTC)
   * is on or after the day after expected (UTC). Keeps home badge and deliveries tab in sync.
   */
  static isOrderLate(order) {
    if (!order || order.status !== "open") return false;
    const placedAt = order.placed_at;
    if (!placedAt) return false;
    const s = typeof placedAt === "string" ? placedAt.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const placedUtc = Date.UTC(y, m - 1, d);
    const days = Math.max(0, parseInt(order.lead_time_days, 10) || 7);
    const expectedUtc = new Date(placedUtc);
    expectedUtc.setUTCDate(expectedUtc.getUTCDate() + days);
    const dayAfterExpectedUtc = Date.UTC(
      expectedUtc.getUTCFullYear(),
      expectedUtc.getUTCMonth(),
      expectedUtc.getUTCDate() + 1,
    );
    const now = new Date();
    const todayUtcDay = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return todayUtcDay >= dayAfterExpectedUtc;
  }

  async getLateOrderCount() {
    const result = await this.pool.query(
      "SELECT id, placed_at, lead_time_days, status FROM orders WHERE status = 'open'",
    );
    let count = 0;
    for (const row of result.rows) {
      const order = {
        status: row.status,
        placed_at: row.placed_at,
        lead_time_days: row.lead_time_days,
      };
      if (Database.isOrderLate(order)) count += 1;
    }
    return count;
  }

  async updateOrderReceivedLines(orderId, lines) {
    const id = typeof orderId === "string" ? parseInt(orderId, 10) : Number(orderId);
    if (!Number.isInteger(id) || id < 1) return { success: false, error: "Invalid order ID" };
    const order = await this.getOrderById(id);
    if (!order) return { success: false, error: "Order not found" };
    if (order.status !== "received") return { success: false, error: "Only completed (received) orders can have received quantities adjusted" };
    for (const entry of lines || []) {
      const itemId = (entry.itemId != null ? entry.itemId : entry.item_id) != null ? String(entry.itemId != null ? entry.itemId : entry.item_id).trim() : null;
      const receivedQty = Math.max(0, parseInt(entry.received_quantity, 10) || 0);
      if (!itemId) continue;
      const line = (order.lines || []).find((l) => String(l.itemId) === String(itemId));
      if (!line) continue;
      const ordered = parseInt(line.quantity, 10) || 0;
      const newReceived = Math.min(receivedQty, ordered);
      const newReceivedAt = newReceived > 0 ? (line.received_at || new Date().toISOString()) : null;
      await this.pool.query(
        "UPDATE order_lines SET received_quantity = $1, received_at = $2 WHERE order_id = $3 AND item_id = $4",
        [newReceived, newReceivedAt, id, itemId],
      );
    }
    const updated = await this.getOrderById(id);
    const anyRemaining = (updated.lines || []).some(
      (l) => (parseInt(l.received_quantity, 10) || 0) < (parseInt(l.quantity, 10) || 0),
    );
    if (anyRemaining) {
      await this.pool.query("UPDATE orders SET status = $1 WHERE id = $2", ["open", id]);
      updated.status = "open";
    }
    return { success: true, order: await this.getOrderById(id) };
  }

  async addMaterialUsage(entry) {
    const qtyGallons = Number(entry.qty_gallons) || 0;
    const catalystOz = entry.catalyst_oz != null && !isNaN(Number(entry.catalyst_oz)) ? Number(entry.catalyst_oz) : (qtyGallons * 0.04 * 128);
    const catalystGallons = catalystOz / 128;
    const materialType = entry.material_type != null ? String(entry.material_type).trim() : null;
    const cupGun = entry.cup_gun === true;
    const result = await this.pool.query(
      `INSERT INTO material_usage (entry_date, entry_time, job_name, item_id, color_name, qty_gallons, catalyst_gallons, catalyst_oz, catalyzed_confirmed, booth, user_name, material_type, cup_gun)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, created_at`,
      [
        entry.entry_date || null,
        entry.entry_time || null,
        entry.job_name != null ? String(entry.job_name).trim() : "",
        entry.item_id != null ? String(entry.item_id).trim() : "",
        entry.color_name != null ? String(entry.color_name).trim() : "",
        qtyGallons,
        catalystGallons,
        catalystOz,
        entry.catalyzed_confirmed === true,
        entry.booth != null ? String(entry.booth).trim() : "",
        entry.user_name != null ? String(entry.user_name).trim() : "",
        materialType || null,
        cupGun,
      ],
    );
    const row = result.rows[0];
    return { success: true, id: row.id, created_at: row.created_at };
  }

  async getMaterialUsage(boothFilter = null, limit = 500, fromDate = null, toDate = null, excludeAdmin = false) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (excludeAdmin) {
      conditions.push(`(user_name IS NULL OR LOWER(TRIM(user_name)) NOT IN ('admin123', 'admin'))`);
    }
    if (boothFilter && boothFilter.trim() !== "" && boothFilter.toLowerCase() !== "all") {
      conditions.push(`booth = $${paramIndex}`);
      params.push(boothFilter.trim());
      paramIndex++;
    }
    if (fromDate && String(fromDate).trim() !== "") {
      conditions.push(`entry_date >= $${paramIndex}`);
      params.push(String(fromDate).trim());
      paramIndex++;
    }
    if (toDate && String(toDate).trim() !== "") {
      conditions.push(`entry_date <= $${paramIndex}`);
      params.push(String(toDate).trim());
      paramIndex++;
    }
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const query = `SELECT * FROM material_usage ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex}`;
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async updateMaterialUsageCatalyzed(id, confirmed) {
    const confirmedAt = confirmed ? new Date().toISOString() : null;
    const result = await this.pool.query(
      `UPDATE material_usage SET catalyzed_confirmed = $1, catalyzed_confirmed_at = $2 WHERE id = $3`,
      [Boolean(confirmed), confirmedAt, id],
    );
    if (result.rowCount === 0) return { success: false, error: "Not found" };
    return { success: true };
  }

  close() {
    return this.pool.end();
  }
}

const db = new Database();

module.exports = db;
