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
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error(`Users API (${endpoint}):`, error);
    throw error;
  }
}

class UserService {
  /** @returns {Promise<Array<{ id: number, user_name: string, role: string }>>} */
  async list() {
    const data = await _fetch("/api/users");
    return Array.isArray(data) ? data : [];
  }

  async create({ userName, role = "user" }) {
    return _fetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ userName, role }),
    });
  }

  async authenticate(userName, password) {
    return _fetch("/api/users/login", {
      method: "POST",
      body: JSON.stringify({ userName, password }),
    });
  }

  async changePassword(userName, password) {
    return _fetch("/api/users/change-password", {
      method: "POST",
      body: JSON.stringify({ userName, password }),
    });
  }

  async updateRole(userName, role) {
    return _fetch(
      `/api/users/${encodeURIComponent(userName)}/role`,
      {
        method: "POST",
        body: JSON.stringify({ role }),
      },
    );
  }

  async resetPassword(userName) {
    return _fetch(
      `/api/users/${encodeURIComponent(userName)}/reset-password`,
      { method: "POST" },
    );
  }

  async remove(userName) {
    return _fetch(`/api/users/${encodeURIComponent(userName)}`, {
      method: "DELETE",
    });
  }
}

export default new UserService();
