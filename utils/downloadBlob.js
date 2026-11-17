import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import showToast from "./showToast";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

export function isPreviewable(filename, mime) {
  const m = String(mime || "").toLowerCase();
  const n = String(filename || "").toLowerCase();
  return (
    m.includes("pdf") ||
    m.startsWith("image/") ||
    m.startsWith("text/") ||
    n.endsWith(".pdf") ||
    /\.(png|jpe?g|gif|webp|txt)$/i.test(n)
  );
}

export function blobForView(blob, filename) {
  const current = blob?.type || "";
  if (current && current !== "application/octet-stream") return blob;
  const name = String(filename || "").toLowerCase();
  let type = current;
  if (name.endsWith(".pdf")) type = "application/pdf";
  else if (name.endsWith(".png")) type = "image/png";
  else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) type = "image/jpeg";
  else if (name.endsWith(".gif")) type = "image/gif";
  else if (name.endsWith(".webp")) type = "image/webp";
  else if (name.endsWith(".txt")) type = "text/plain";
  if (!type || type === current) return blob;
  try {
    return new Blob([blob], { type });
  } catch {
    return blob;
  }
}

export async function openBlob(blob, filename) {
  const name = String(filename || "download").replace(/[\\/]/g, "-");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const typed = blobForView(blob, name);
    const url = URL.createObjectURL(typed);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      await downloadBlob(blob, name);
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return;
  }
  await downloadBlob(blob, name);
}

export default async function downloadBlob(blob, filename) {
  const name = String(filename || "download").replace(/[\\/]/g, "-");
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const base64 = await blobToBase64(blob);
  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  showToast({ title: "Saved", message: name });
}
