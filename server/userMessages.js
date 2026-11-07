"use strict";

const EVERYONE = "*";

async function ensureUserMessageTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_messages (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'info'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_message_reads (
      message_id INTEGER NOT NULL REFERENCES user_messages(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      read_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (message_id, user_name)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_messages_to ON user_messages (to_user, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_message_reads_user ON user_message_reads (user_name)
  `);
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    fromUser: row.from_user,
    toUser: row.to_user,
    title: row.title || "",
    body: row.body || "",
    kind: row.kind === "reminder" ? "reminder" : "info",
    everyone: row.to_user === EVERYONE,
  };
}

async function sendMessage(pool, { fromUser, toUser, title, body, kind }) {
  const from = String(fromUser || "").trim();
  const to = String(toUser || "").trim();
  const text = String(body || "").trim();
  const heading = String(title || "").trim();
  if (!from) return { success: false, error: "Sign in again." };
  if (!text) return { success: false, error: "Type a message first." };
  if (!to) return { success: false, error: "Choose who should see this." };
  let target = EVERYONE;
  if (to !== EVERYONE) {
    const found = await pool.query(
      `SELECT user_name FROM app_users WHERE LOWER(user_name) = LOWER($1) LIMIT 1`,
      [to],
    );
    if (!found.rows[0]) return { success: false, error: "That user is not in the app." };
    target = found.rows[0].user_name;
  }
  const inserted = await pool.query(
    `INSERT INTO user_messages (from_user, to_user, title, body, kind)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      from,
      target,
      heading.slice(0, 120),
      text.slice(0, 2000),
      kind === "reminder" ? "reminder" : "info",
    ],
  );
  return { success: true, message: mapMessage(inserted.rows[0]) };
}

async function listUnread(pool, userName) {
  const name = String(userName || "").trim();
  if (!name) return [];
  const result = await pool.query(
    `SELECT m.*
     FROM user_messages m
     WHERE (m.to_user = $1 OR m.to_user = $2)
       AND LOWER(m.from_user) <> LOWER($1)
       AND NOT EXISTS (
         SELECT 1 FROM user_message_reads r
         WHERE r.message_id = m.id AND LOWER(r.user_name) = LOWER($1)
       )
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT 20`,
    [name, EVERYONE],
  );
  return result.rows.map(mapMessage);
}

async function markRead(pool, userName, messageId) {
  const name = String(userName || "").trim();
  const id = Number(messageId);
  if (!name || !Number.isInteger(id)) return { success: false, error: "Could not save that." };
  const visible = await pool.query(
    `SELECT id FROM user_messages
     WHERE id = $1 AND (to_user = $2 OR to_user = $3)
     LIMIT 1`,
    [id, name, EVERYONE],
  );
  if (!visible.rows[0]) return { success: false, error: "Message not found." };
  await pool.query(
    `INSERT INTO user_message_reads (message_id, user_name)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_name) DO NOTHING`,
    [id, name],
  );
  return { success: true };
}

async function listSent(pool, fromUser, limit = 40) {
  const name = String(fromUser || "").trim();
  if (!name) return [];
  const result = await pool.query(
    `SELECT * FROM user_messages
     WHERE LOWER(from_user) = LOWER($1)
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [name, Math.min(Math.max(Number(limit) || 40, 1), 100)],
  );
  return result.rows.map(mapMessage);
}

module.exports = {
  EVERYONE,
  ensureUserMessageTables,
  sendMessage,
  listUnread,
  markRead,
  listSent,
};
