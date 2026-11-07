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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

const UserMessageService = {
  unread() {
    return _fetch("/api/user-messages/unread");
  },
  markRead(id) {
    return _fetch(`/api/user-messages/${id}/read`, { method: "POST" });
  },
  sent() {
    return _fetch("/api/user-messages/sent");
  },
  send({ toUser, title, body, kind }) {
    return _fetch("/api/user-messages", {
      method: "POST",
      body: JSON.stringify({ toUser, title, body, kind }),
    });
  },
};

export default UserMessageService;
