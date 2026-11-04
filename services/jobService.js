import config from "../config";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const isJson = (response.headers.get("content-type") || "").includes("json");
  const data = isJson ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data ?? response;
}

const JobService = {
  recent(limit = 24) {
    const params = new URLSearchParams({ limit: String(limit) });
    return _fetch(`/api/jobs?${params.toString()}`);
  },
  lookup(jobName) {
    return _fetch(`/api/jobs/${encodeURIComponent(String(jobName || "").trim())}`);
  },
  addPhoto(jobName, { filename, dataBase64, caption, userName }) {
    return _fetch(`/api/jobs/${encodeURIComponent(String(jobName || "").trim())}/photos`, {
      method: "POST",
      body: JSON.stringify({ filename, dataBase64, caption, userName }),
    });
  },
  async fetchPhotoUrl(jobName, photoId) {
    const response = await fetch(
      `${API_URL}/api/jobs/${encodeURIComponent(String(jobName || "").trim())}/photos/${photoId}`,
    );
    if (!response.ok) throw new Error("Photo failed");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  removePhoto(jobName, photoId) {
    return _fetch(
      `/api/jobs/${encodeURIComponent(String(jobName || "").trim())}/photos/${photoId}`,
      { method: "DELETE" },
    );
  },
};

export default JobService;
