function parseDetails(details) {
  if (!details) return {};
  if (typeof details === "string") {
    try {
      return JSON.parse(details || "{}");
    } catch {
      return {};
    }
  }
  return details;
}

export function isCheckOutLog(log) {
  if (!log) return false;
  const action = log.action;
  const details = parseDetails(log.details);
  return (
    action === "check_out" ||
    (action === "update" && details._actionType === "check_out")
  );
}

export function getCheckOutQtyFromLog(log) {
  const details = parseDetails(log?.details);
  const q = details.quantityChange ?? details._quantityChange;
  return typeof q === "number" ? Math.abs(q) : 0;
}
