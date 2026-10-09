/** Shown name for the master account. Login stays admin123. */
export function displayUserName(name, fallback = "") {
  const text = String(name ?? "").trim();
  if (!text) return fallback;
  if (text.toLowerCase() === "admin123") return "ADMIN";
  return text;
}
