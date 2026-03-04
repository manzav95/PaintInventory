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

class Database {
  constructor() {
    this.pool = pool;
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      await this.initTables(client);
      client.release();
      console.log("Connected to PostgreSQL database");
    } catch (err) {
      console.error("Error connecting to database:", err);
      throw err;
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
    console.log("Orders tables ready");
  }

  async getAllItems() {
    const result = await this.pool.query("SELECT * FROM items ORDER BY id");
    return result.rows;
  }

  async getItem(itemId) {
    const result = await this.pool.query("SELECT * FROM items WHERE id = $1", [
      itemId,
    ]);
    return result.rows[0] || null;
  }

  async addItem(item) {
    const now = new Date().toISOString();
    const price = item.price != null && !isNaN(Number(item.price)) ? Number(item.price) : null;
    const type = item.type && ["paint", "primer", "clear", "stain", "dye"].includes(String(item.type).toLowerCase())
      ? String(item.type).toLowerCase()
      : null;
    const displayOrder = item.display_order != null && !isNaN(Number(item.display_order)) ? Number(item.display_order) : 0;
    await this.pool.query(
      `INSERT INTO items (id, name, quantity, description, location, "lastScanned", "lastScannedBy", "createdAt", "updatedAt", "minQuantity", price, "type", "display_order")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
      ],
    );
    return { success: true, item: { ...item, updatedAt: now, price, type, display_order: displayOrder } };
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
          key === "display_order"
            ? `"${key}"`
            : key;
        fields.push(`${col} = $${paramIndex}`);
        if (key === "price") {
          const v = updates[key];
          values.push(v == null || v === "" ? null : (isNaN(Number(v)) ? null : Number(v)));
        } else if (key === "type") {
          const v = updates[key];
          const allowed = ["paint", "primer", "clear", "stain", "dye"];
          values.push(v && allowed.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null);
        } else if (key === "display_order") {
          const v = updates[key];
          values.push(v == null || v === "" ? 0 : (isNaN(Number(v)) ? 0 : Number(v)));
        } else {
          values.push(updates[key]);
        }
        paramIndex++;
      }
    });

    fields.push(`"updatedAt" = $${paramIndex}`);
    values.push(now);
    paramIndex++;
    values.push(itemId);

    const result = await this.pool.query(
      `UPDATE items SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );

    if (result.rowCount === 0) {
      return { success: false, error: "Item not found" };
    }

    const item = await this.getItem(itemId);
    return { success: true, item };
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

  async createOrder(poNumber, leadTimeDays, lines, createdBy) {
    const now = new Date().toISOString();
    const result = await this.pool.query(
      `INSERT INTO orders (po_number, placed_at, lead_time_days, status, created_by)
       VALUES ($1, $2, $3, 'open', $4) RETURNING id`,
      [String(poNumber).trim(), now, leadTimeDays == null ? 5 : Math.max(0, parseInt(leadTimeDays, 10) || 5), createdBy || null],
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
    order.lines = linesResult.rows.map((r) => ({ itemId: r.item_id, quantity: r.quantity }));
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

  async updateOrder(orderId, poNumber, leadTimeDays, lines) {
    const id = typeof orderId === "string" ? parseInt(orderId, 10) : Number(orderId);
    if (!Number.isInteger(id) || id < 1) return { success: false, error: "Invalid order ID" };
    const order = await this.getOrderById(id);
    if (!order) return { success: false, error: "Order not found" };
    if (order.status !== "open") return { success: false, error: "Only open orders can be updated" };
    const updateResult = await this.pool.query(
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
      `SELECT ol.item_id, ol.quantity, o.placed_at, o.lead_time_days
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE o.status = 'open'
       ORDER BY o.placed_at ASC`,
    );
    const byItem = {};
    for (const row of result.rows) {
      const id = row.item_id;
      const placed = new Date(row.placed_at);
      const days = parseInt(row.lead_time_days, 10) || 5;
      const expected = new Date(placed);
      expected.setDate(expected.getDate() + days);
      if (!byItem[id]) {
        byItem[id] = { quantity: 0, expectedDate: expected.toISOString() };
      }
      byItem[id].quantity += parseInt(row.quantity, 10) || 0;
      if (expected > new Date(byItem[id].expectedDate)) byItem[id].expectedDate = expected.toISOString();
    }
    return byItem;
  }

  close() {
    return this.pool.end();
  }
}

const db = new Database();

module.exports = db;
