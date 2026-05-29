import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "@inventory_notifications_dismissed_v2_";

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Stable per-account key (admin vs each standard user). */
export function normalizeUserKey(userName) {
  const u = String(userName ?? "unknown").trim().toLowerCase();
  const safe = u.replace(/[^a-z0-9_-]/g, "_");
  return safe || "unknown";
}

function storageKey(userName) {
  return `${STORAGE_PREFIX}${normalizeUserKey(userName)}`;
}

export async function getDismissedState(userName) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userName));
    if (!raw) return { date: null, ids: [] };
    const parsed = JSON.parse(raw);
    return {
      date: parsed?.date ?? null,
      ids: Array.isArray(parsed?.ids) ? parsed.ids : [],
    };
  } catch {
    return { date: null, ids: [] };
  }
}

export async function getDismissedIdsToday(userName) {
  const state = await getDismissedState(userName);
  if (state.date !== localDateKey()) return [];
  return state.ids;
}

export async function areNotificationsDismissedToday(userName) {
  const ids = await getDismissedIdsToday(userName);
  return ids.length > 0;
}

/** Dismiss only the alert types passed (this user's visible alerts). */
export async function dismissAlertsForToday(userName, alertIds) {
  const ids = [...new Set((alertIds || []).map(String))];
  try {
    await AsyncStorage.setItem(
      storageKey(userName),
      JSON.stringify({ date: localDateKey(), ids }),
    );
    return true;
  } catch {
    return false;
  }
}
