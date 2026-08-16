import config from "../config";
import localVersion from "../version";

export function getLocalAppBuild() {
  const n = Number(localVersion?.build);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function fetchRemoteAppBuild() {
  const url = `${config.API_URL}/api/app-version`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const n = Number(data?.build);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function reloadAppToLatest() {
  if (typeof window !== "undefined" && window.location) {
    window.location.reload();
    return;
  }
}
