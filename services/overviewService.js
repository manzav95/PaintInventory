import config from "../config";
import { authHeaders } from "../utils/authToken";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: authHeaders({
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...(options.headers || {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

class OverviewService {
  async get() {
    return _fetch("/api/overview");
  }

  async uploadSchedule({ csvText, filename }) {
    return _fetch("/api/overview/schedule", {
      method: "POST",
      body: JSON.stringify({ csvText, filename }),
    });
  }
}

export default new OverviewService();
