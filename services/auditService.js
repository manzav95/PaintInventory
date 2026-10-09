import config from '../config';

const API_URL = config.API_URL;

// Helper function for API calls
async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error(`API error (${endpoint}):`, error);
    throw error;
  }
}

class AuditService {
  async list(limit = 500, options = {}) {
    try {
      let opts = options;
      let lim = limit;
      if (limit && typeof limit === "object") {
        opts = limit;
        lim = opts.limit ?? 500;
      }
      const params = new URLSearchParams({ limit: String(lim) });
      const itemId = opts?.itemId || opts?.item_id;
      if (itemId) params.set("itemId", String(itemId));
      const logs = await _fetch(`/api/audit?${params.toString()}`);
      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      console.error('Audit list error:', error);
      return [];
    }
  }

  async log(event) {
    try {
      // Audit logging is handled by the server automatically
      // This method is kept for compatibility but doesn't need to do anything
      // The server logs audits when items are added/updated/deleted
      return { success: true, entry: { ...event, timestamp: new Date().toISOString() } };
    } catch (error) {
      console.error('Error logging audit:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new AuditService();
