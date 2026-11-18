import config from "../config";
import { authHeaders } from "../utils/authToken";

const API_URL = config.API_URL;

function filenameFromDisposition(response) {
  const text = String(response?.headers?.get("content-disposition") || "");
  const star = text.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore malformed filename* */
    }
  }
  const quoted = text.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = text.match(/filename\s*=\s*([^;]+)/i);
  if (bare?.[1]) return bare[1].trim().replace(/^["']|["']$/g, "");
  return "";
}

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

async function downloadEndpoint(endpoint, fallbackName) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || "Download failed");
  }
  const blob = await response.blob();
  return {
    blob,
    filename: filenameFromDisposition(response) || fallbackName || "download",
  };
}

const ItemDocService = {
  summary() {
    return _fetch("/api/safety-docs/summary");
  },
  createExtra(name) {
    return _fetch("/api/safety-docs/extras", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  deleteExtra(id) {
    return _fetch(`/api/safety-docs/extras/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  listItem(itemId) {
    return _fetch(`/api/safety-docs/items/${encodeURIComponent(itemId)}`);
  },
  uploadItem(itemId, { kind, filename, dataBase64 }) {
    return _fetch(`/api/safety-docs/items/${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: JSON.stringify({ kind, filename, dataBase64 }),
    });
  },
  deleteItem(itemId, fileId) {
    return _fetch(
      `/api/safety-docs/items/${encodeURIComponent(itemId)}/files/${fileId}`,
      { method: "DELETE" },
    );
  },
  downloadItem(itemId, fileId, filename) {
    return downloadEndpoint(
      `/api/safety-docs/items/${encodeURIComponent(itemId)}/files/${fileId}`,
      filename || "download",
    );
  },
  listType(itemType) {
    return _fetch(`/api/safety-docs/types/${encodeURIComponent(itemType)}`);
  },
  uploadType(itemType, { kind, filename, dataBase64 }) {
    return _fetch(`/api/safety-docs/types/${encodeURIComponent(itemType)}`, {
      method: "POST",
      body: JSON.stringify({ kind, filename, dataBase64 }),
    });
  },
  deleteType(itemType, fileId) {
    return _fetch(
      `/api/safety-docs/types/${encodeURIComponent(itemType)}/files/${fileId}`,
      { method: "DELETE" },
    );
  },
  downloadTypeFile(itemType, fileId, filename) {
    return downloadEndpoint(
      `/api/safety-docs/types/${encodeURIComponent(itemType)}/files/${fileId}`,
      filename || "download",
    );
  },
  downloadTypeKind(itemType, kind, fileId) {
    const params = new URLSearchParams({ kind: String(kind || "sds") });
    if (fileId) params.set("fileId", String(fileId));
    const label = `${itemType} ${String(kind || "sds").toUpperCase()}`;
    return downloadEndpoint(
      `/api/safety-docs/types/${encodeURIComponent(itemType)}/download?${params.toString()}`,
      label,
    );
  },
};

export default ItemDocService;
