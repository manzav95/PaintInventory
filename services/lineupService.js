import config from "../config";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    headers: { "Content-Type": "application/json" },
  };
  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    console.error(`Lineup API (${endpoint}):`, error);
    throw error;
  }
}

export const LINEUP_PIECE_TYPE_OPTIONS = [
  { value: "cabs", label: "Cabs" },
  { value: "door/drawers", label: "Door/Drawers" },
  { value: "molding", label: "Molding" },
];

export function parseLineupPieceTypes(raw) {
  const allowed = new Set(LINEUP_PIECE_TYPE_OPTIONS.map((o) => o.value));
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => allowed.has(s));
}

export function formatLineupPieceTypesLabel(raw) {
  const values = parseLineupPieceTypes(raw);
  if (!values.length) return "—";
  return values
    .map((v) => {
      const opt = LINEUP_PIECE_TYPE_OPTIONS.find((o) => o.value === v);
      return opt ? opt.label : v;
    })
    .join(" · ");
}

class LineupService {
  async list(limit = 100, userName = "") {
    const params = new URLSearchParams({ limit: String(limit) });
    if (userName) params.set("userName", userName);
    const data = await _fetch(`/api/lineup?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  }

  async latest() {
    return _fetch("/api/lineup/latest");
  }

  async create(entry) {
    return _fetch("/api/lineup", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  }

  async update(id, entry) {
    return _fetch(`/api/lineup/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(entry),
    });
  }

  async delete(id, userName) {
    const qs = userName
      ? `?userName=${encodeURIComponent(userName)}`
      : "";
    return _fetch(`/api/lineup/${encodeURIComponent(id)}${qs}`, {
      method: "DELETE",
    });
  }

  async setMixed(id, userName, mixed) {
    return _fetch(`/api/lineup/${encodeURIComponent(id)}/mixed`, {
      method: "PUT",
      body: JSON.stringify({ user_name: userName, mixed }),
    });
  }
}

export default new LineupService();
