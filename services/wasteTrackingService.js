import config from "../config";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    headers: { "Content-Type": "application/json" },
  };
  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    console.error(`Waste tracking API (${endpoint}):`, error);
    throw error;
  }
}

class WasteTrackingService {
  async list(limit = 100) {
    const params = new URLSearchParams({ limit: String(limit) });
    const data = await _fetch(`/api/waste-tracking?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  }

  async create(entry) {
    return _fetch("/api/waste-tracking", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  }

  async update(id, entry) {
    return _fetch(`/api/waste-tracking/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(entry),
    });
  }

  async delete(id) {
    return _fetch(`/api/waste-tracking/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async getUnreadCount() {
    const data = await _fetch("/api/waste-tracking/unread-count");
    return Number(data?.count) || 0;
  }

  async markSeen() {
    return _fetch("/api/waste-tracking/mark-seen", { method: "POST" });
  }
}

export default new WasteTrackingService();
