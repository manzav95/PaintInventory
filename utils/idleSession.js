import AsyncStorage from "@react-native-async-storage/async-storage";

export const IDLE_LOGOUT_MS = 5 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "@inventory_last_activity_at";

export function isAdminUser(userName) {
  return userName === "admin123";
}

export async function recordUserActivity() {
  try {
    await AsyncStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch (error) {
    console.error("recordUserActivity error:", error);
  }
}

export async function getLastUserActivity() {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVITY_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (error) {
    console.error("getLastUserActivity error:", error);
    return null;
  }
}

export function isIdleExpired(lastActivityMs, now = Date.now()) {
  if (!lastActivityMs) return false;
  return now - lastActivityMs > IDLE_LOGOUT_MS;
}

export async function clearUserActivity() {
  try {
    await AsyncStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch (error) {
    console.error("clearUserActivity error:", error);
  }
}
