"use strict";

const stainStore = require("./stainFormulasStore");
const messages = require("./userMessages");

function registerUserMessageRoutes(app, db) {
  const pool = db.pool;

  async function sessionFrom(req) {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    return stainStore.getSession(pool, token);
  }

  async function requireUser(req, res) {
    const session = await sessionFrom(req);
    if (!session) {
      res.status(401).json({ error: "Sign in again to read messages." });
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

  app.get("/api/user-messages/unread", async (req, res) => {
    try {
      const session = await requireUser(req, res);
      if (!session) return;
      const unread = await messages.listUnread(pool, session.userName);
      res.json({ messages: unread, count: unread.length });
    } catch (error) {
      console.error("user-messages unread:", error);
      res.status(500).json({ error: "Failed to load messages." });
    }
  });

  app.post("/api/user-messages/:id/read", async (req, res) => {
    try {
      const session = await requireUser(req, res);
      if (!session) return;
      const saved = await messages.markRead(pool, session.userName, req.params.id);
      if (!saved.success) return res.status(400).json(saved);
      const unread = await messages.listUnread(pool, session.userName);
      res.json({ success: true, messages: unread, count: unread.length });
    } catch (error) {
      console.error("user-messages read:", error);
      res.status(500).json({ error: "Failed to save that." });
    }
  });

  app.get("/api/user-messages/sent", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const sent = await messages.listSent(pool, session.userName);
      res.json({ messages: sent });
    } catch (error) {
      console.error("user-messages sent:", error);
      res.status(500).json({ error: "Failed to load sent messages." });
    }
  });

  app.post("/api/user-messages", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const body = req.body || {};
      const saved = await messages.sendMessage(pool, {
        fromUser: session.userName,
        toUser: body.toUser || body.to_user,
        title: body.title,
        body: body.body || body.message,
        kind: body.kind,
      });
      if (!saved.success) return res.status(400).json(saved);
      res.json(saved);
    } catch (error) {
      console.error("user-messages send:", error);
      res.status(500).json({ error: "Failed to send message." });
    }
  });
}

module.exports = { registerUserMessageRoutes };
