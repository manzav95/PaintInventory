import { Linking, Platform } from "react-native";
import config from "../config";

const LOW_STOCK_ALERT_TO = "manuelzavala@precisioncabinets.com";

async function _fetch(endpoint, options = {}) {
  const url = `${config.API_URL}${endpoint}`;
  const method = options.method || "GET";
  const hasBody = options.body != null && options.body !== "";
  const headers = { ...(options.headers || {}) };
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...options, headers });
  let data = {};
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? "Invalid server response" : `Request failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

function buildMailtoUrl(items, requestedBy) {
  const subject = `Low paint stock — ${items.length} item${items.length === 1 ? "" : "s"}`;
  const lines = items.map((it) => {
    const name = it.name || "Unnamed";
    const id = it.id != null ? String(it.id) : "—";
    const qty = it.quantity ?? 0;
    const min = it.minQuantity ?? 30;
    return `• ${name} (ID ${id}): ${qty} gal on hand (min ${min} gal)`;
  });
  const body = [
    `Low stock reported by ${requestedBy || "Inventory user"}.`,
    `Date: ${new Date().toLocaleString()}`,
    "",
    ...lines,
  ].join("\n");
  const to = encodeURIComponent(LOW_STOCK_ALERT_TO);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default {
  async sendLowStockAlert({ items = [], requestedBy = "" } = {}) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      return { success: false, error: "No low-stock items to report." };
    }

    try {
      const data = await _fetch("/api/notifications/low-stock-alert", {
        method: "POST",
        body: JSON.stringify({ items: list, requestedBy }),
      });
      if (data.success) {
        return { success: true, message: data.message };
      }
      if (data.mailtoUrl) {
        const opened = await Linking.openURL(data.mailtoUrl);
        return {
          success: opened,
          usedMailto: true,
          message: opened
            ? "Opened your email app with the low-stock list."
            : "Could not open email app.",
        };
      }
      return { success: false, error: data.error || "Could not send alert." };
    } catch (e) {
      const mailtoUrl = buildMailtoUrl(list, requestedBy);
      try {
        const opened = await Linking.openURL(mailtoUrl);
        if (opened) {
          return {
            success: true,
            usedMailto: true,
            message:
              Platform.OS === "web"
                ? "Opened your email app with the low-stock list."
                : "Opened email with the low-stock list.",
          };
        }
      } catch {
        /* fall through */
      }
      return {
        success: false,
        error: e?.message || "Could not send alert. Try again or use email manually.",
        mailtoUrl,
      };
    }
  },
};
