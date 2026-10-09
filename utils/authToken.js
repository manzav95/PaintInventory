import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@inventory_auth_token";
let memory = "";

export function getAuthToken() {
  return memory;
}

export async function loadAuthToken() {
  try {
    memory = (await AsyncStorage.getItem(KEY)) || "";
  } catch {
    memory = "";
  }
  return memory;
}

export async function setAuthToken(token) {
  memory = token ? String(token) : "";
  try {
    if (memory) await AsyncStorage.setItem(KEY, memory);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function clearAuthToken() {
  await setAuthToken("");
}

export function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (memory) headers.Authorization = `Bearer ${memory}`;
  return headers;
}
