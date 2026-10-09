import AsyncStorage from "@react-native-async-storage/async-storage";
import config from "../config";
import localVersion from "../version";
import releaseNotes from "../release-notes.json";

const SEEN_RELEASE_KEY = "@cure_seen_release_build";

export function getLocalAppBuild() {
  const n = Number(localVersion?.build);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function userFacingChanges(list) {
  return (Array.isArray(list) ? list : [])
    .map((line) => String(line || "").trim())
    .filter((line) => line && !/^admin\b/i.test(line));
}

export function getLocalReleaseChanges() {
  return userFacingChanges(releaseNotes?.changes);
}

export async function fetchRemoteAppVersion() {
  const url = `${config.API_URL}/api/app-version`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const n = Number(data?.build);
  const changes = userFacingChanges(data?.changes);
  return {
    build: Number.isFinite(n) && n > 0 ? n : 0,
    changes,
  };
}

export async function getSeenReleaseBuild() {
  try {
    const raw = await AsyncStorage.getItem(SEEN_RELEASE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function markReleaseSeen(build) {
  const n = Number(build);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    await AsyncStorage.setItem(SEEN_RELEASE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function reloadAppToLatest() {
  if (typeof window !== "undefined" && window.location) {
    window.location.reload();
    return;
  }
}
