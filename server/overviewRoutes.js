"use strict";

const stainStore = require("./stainFormulasStore");
const overview = require("./overview");

function registerOverviewRoutes(app, db) {
  const pool = db.pool;

  async function requireAdmin(req, res) {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    const session = await stainStore.getSession(pool, token);
    if (!session) {
      res.status(401).json({ error: "Sign in again to view overview." });
      return null;
    }
    if (session.role !== "admin") {
      res.status(403).json({ error: "Admin only." });
      return null;
    }
    return session;
  }

  app.get("/api/overview", async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const data = await overview.getOverview(pool);
      res.json(data);
    } catch (error) {
      console.error("overview get:", error);
      res.status(500).json({ error: "Failed to load overview." });
    }
  });

  app.post("/api/overview/schedule", async (req, res) => {
    try {
      const session = await requireAdmin(req, res);
      if (!session) return;
      const body = req.body || {};
      const saved = await overview.saveProductionSchedule(pool, {
        csvText: body.csvText || body.csv || "",
        filename: body.filename || "schedule.csv",
        uploadedBy: session.userName || "Admin",
      });
      if (!saved.success) return res.status(400).json(saved);
      const data = await overview.getOverview(pool);
      res.json({ ...saved, overview: data });
    } catch (error) {
      console.error("overview schedule:", error);
      res.status(500).json({ error: "Failed to save production schedule." });
    }
  });
}

module.exports = { registerOverviewRoutes };
