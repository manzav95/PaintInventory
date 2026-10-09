import config from "../config";
import { authHeaders } from "../utils/authToken";

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: authHeaders({
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    }),
  });
  const isJson = (response.headers.get("content-type") || "").includes("json");
  const data = isJson ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data ?? response;
}

function toQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

const StainFormulaService = {
  list(params) {
    return _fetch(`/api/stain-formulas${toQuery(params)}`);
  },
  get(id) {
    return _fetch(`/api/stain-formulas/${id}`);
  },
  create(body) {
    return _fetch("/api/stain-formulas", { method: "POST", body: JSON.stringify(body) });
  },
  update(id, body) {
    return _fetch(`/api/stain-formulas/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  remove(id) {
    return _fetch(`/api/stain-formulas/${id}`, { method: "DELETE" });
  },
  importFile({ filename, dataBase64 }) {
    return _fetch("/api/stain-formulas/import", {
      method: "POST",
      body: JSON.stringify({ filename, dataBase64 }),
    });
  },
  addNote(id, note) {
    return _fetch(`/api/stain-formulas/${id}/notes`, {
      method: "POST",
      body: JSON.stringify(note),
    });
  },
  updateNote(id, noteId, note) {
    return _fetch(`/api/stain-formulas/${id}/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify(note),
    });
  },
  linkColor(id, number) {
    return _fetch(`/api/stain-formulas/${id}/links`, {
      method: "POST",
      body: JSON.stringify({ number }),
    });
  },
  unlinkColor(id, number) {
    return _fetch(`/api/stain-formulas/${id}/links/${encodeURIComponent(number)}`, {
      method: "DELETE",
    });
  },
  deleteNote(id, noteId) {
    return _fetch(`/api/stain-formulas/${id}/notes/${noteId}`, { method: "DELETE" });
  },
  addImage(id, { filename, dataBase64, caption, isPrimary }) {
    return _fetch(`/api/stain-formulas/${id}/images`, {
      method: "POST",
      body: JSON.stringify({ filename, dataBase64, caption, isPrimary }),
    });
  },
  setPrimaryImage(id, imageId) {
    return _fetch(`/api/stain-formulas/${id}/images/${imageId}/primary`, { method: "POST" });
  },
  deleteImage(id, imageId) {
    return _fetch(`/api/stain-formulas/${id}/images/${imageId}`, { method: "DELETE" });
  },
  async fetchImageUrl(formulaId, imageId) {
    const response = await fetch(
      `${API_URL}/api/stain-formulas/${formulaId}/images/${imageId}`,
      { headers: authHeaders() },
    );
    if (!response.ok) throw new Error("Image failed");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  async fetchPdf(formulaId) {
    const response = await fetch(`${API_URL}/api/stain-formulas/${formulaId}/pdf`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw new Error("Could not build the formula PDF");
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob, filename: match?.[1] || "formula.pdf" };
  },
  async downloadSource(formulaId, fileId, filename) {
    const response = await fetch(
      `${API_URL}/api/stain-formulas/${formulaId}/files/${fileId}`,
      { headers: authHeaders() },
    );
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "formula";
    link.click();
    URL.revokeObjectURL(url);
  },
};

export default StainFormulaService;
