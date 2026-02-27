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
        "updatedAt" TEXT NOT NULL
      )
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
    await this.pool.query(
      `INSERT INTO items (id, name, quantity, description, location, "lastScanned", "lastScannedBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
      ],
    );
    return { success: true, item: { ...item, updatedAt: now } };
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
          key === "updatedAt"
            ? `"${key}"`
            : key;
        fields.push(`${col} = $${paramIndex}`);
        values.push(updates[key]);
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
    return result.rowCount > 0;
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

  close() {
    return this.pool.end();
  }
}

const db = new Database();

module.exports = db;
