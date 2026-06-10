import config from "../config";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

class LoginLogService {
  async recordLogin(userName) {
    const trimmed = String(userName ?? "").trim();
    if (!trimmed) return { success: false };
    try {
      return await _fetch("/api/login-log", {
        method: "POST",
        body: JSON.stringify({ userName: trimmed }),
      });
    } catch (error) {
      console.error("Record login error:", error);
      return { success: false, error: error.message };
    }
  }

  async list(limit = 500) {
    try {
      const logs = await _fetch(`/api/login-log?limit=${limit}`);
      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      console.error("Login log list error:", error);
      throw error;
    }
  }
}

export default new LoginLogService();
