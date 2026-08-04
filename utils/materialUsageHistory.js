/**
 * Map a material_usage DB row into an audit-log-shaped event for the dashboard.
 */
export function materialUsageToHistoryEvent(row) {
  const id = row?.id != null ? String(row.id) : "";
  const entryDate = row?.entry_date ? String(row.entry_date).trim() : "";
  const created =
    row?.created_at != null
      ? new Date(row.created_at).toISOString()
      : entryDate
        ? `${entryDate}T12:00:00.000Z`
        : new Date().toISOString();
  const qty = Number(row?.qty_gallons) || 0;
  return {
    id: `mu-${id}`,
    action: "material_usage",
    itemId: row?.item_id ? String(row.item_id) : null,
    userName: row?.user_name || "Unknown",
    timestamp: created,
    details: {
      _source: "material_usage",
      booth: row?.booth || "",
      job_name: row?.job_name || "",
      color_name: row?.color_name || "",
      material_type: row?.material_type || "",
      quantityChange: qty,
      entry_time: row?.entry_time || "",
      entry_date: entryDate,
      cup_gun: !!row?.cup_gun,
    },
  };
}

export function mergeAuditAndMaterialUsage(auditLogs, materialUsageRows) {
  const audit = Array.isArray(auditLogs) ? auditLogs : [];
  const usage = (Array.isArray(materialUsageRows) ? materialUsageRows : []).map(
    materialUsageToHistoryEvent,
  );
  return [...audit, ...usage].sort((a, b) => {
    const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
}
