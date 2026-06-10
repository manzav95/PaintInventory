export function getDayKey(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDayHeader(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const md = d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
  });
  return `${weekday} ${md}`;
}
