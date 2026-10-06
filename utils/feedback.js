/**
 * In-app feedback / bug reports stored for admin review.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import config from "../config";

const API_URL = config.API_URL;
const FEEDBACK_SEEN_ID_KEY = "@app_feedback_admin_seen_id";

const listeners = new Set();
const changeListeners = new Set();

export function subscribeFeedback(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notify admin UI (badge / toast) that feedback data changed. */
export function subscribeFeedbackChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function emitFeedbackChanged() {
  changeListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn("feedbackChanged listener error:", e);
    }
  });
}

/**
 * Opens the Feedback form dialog. FeedbackHost must be mounted.
 * @param {{ userName?: string }} [opts]
 */
export function promptFeedback({ userName } = {}) {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      console.warn("promptFeedback: FeedbackHost is not mounted");
      resolve(false);
      return;
    }
    const payload = {
      userName: userName != null ? String(userName) : "",
      resolve,
    };
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.warn("promptFeedback listener error:", e);
        resolve(false);
      }
    });
  });
}

async function _fetch(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

/**
 * Submit feedback → stored for admin (and emailed if SMTP is set).
 */
export async function submitFeedback({
  message,
  userName,
  category = "feedback",
} = {}) {
  const body = String(message || "").trim();
  if (!body) {
    return { success: false, error: "Enter a message first." };
  }
  try {
    const data = await _fetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        message: body,
        userName: userName || "",
        category,
        platform: Platform.OS,
      }),
    });
    emitFeedbackChanged();
    return {
      success: true,
      message: data.message || "Sent to admin.",
      entry: data.entry,
    };
  } catch (e) {
    return {
      success: false,
      error: e?.message || "Could not reach the server.",
    };
  }
}

/** List messages — pass isAdmin for all, or userName for own history. */
export async function listFeedback({
  userName = "",
  isAdmin = false,
  status = null,
  limit = 200,
} = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (isAdmin) params.set("isAdmin", "true");
  else if (userName) params.set("userName", String(userName).trim());
  if (status) params.set("status", String(status));
  const data = await _fetch(`/api/feedback?${params.toString()}`);
  return {
    messages: Array.isArray(data?.messages) ? data.messages : [],
    pendingCount: data?.pendingCount,
  };
}

export async function updateFeedbackStatus(id, { status, closedBy } = {}) {
  const data = await _fetch(`/api/feedback/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, closedBy }),
  });
  emitFeedbackChanged();
  return data;
}

export async function getFeedbackStatus() {
  try {
    return await _fetch("/api/feedback/status");
  } catch {
    return { pendingCount: 0, inApp: true };
  }
}

async function getSeenFeedbackId() {
  try {
    const raw = await AsyncStorage.getItem(FEEDBACK_SEEN_ID_KEY);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Pending messages newer than the last time admin opened Messages. */
export async function getUnreadFeedbackCount() {
  try {
    const seenId = await getSeenFeedbackId();
    const data = await listFeedback({
      isAdmin: true,
      status: "pending",
      limit: 300,
    });
    const messages = data.messages || [];
    return messages.filter((m) => Number(m.id) > seenId).length;
  } catch {
    return 0;
  }
}

/** Clear highlight — mark all current messages as seen. */
export async function markFeedbackSeen() {
  try {
    const data = await listFeedback({ isAdmin: true, limit: 500 });
    const messages = data.messages || [];
    const maxId = messages.reduce(
      (max, m) => Math.max(max, Number(m.id) || 0),
      0,
    );
    const prev = await getSeenFeedbackId();
    const next = Math.max(prev, maxId);
    await AsyncStorage.setItem(FEEDBACK_SEEN_ID_KEY, String(next));
    emitFeedbackChanged();
    return next;
  } catch (e) {
    console.warn("markFeedbackSeen failed:", e?.message || e);
    return 0;
  }
}

export default promptFeedback;
