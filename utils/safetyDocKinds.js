export const SAFETY_DOC_KINDS = [
  { key: "pds", label: "PDS" },
  { key: "sds", label: "SDS" },
  { key: "eds", label: "EDS" },
];

export const EMPTY_KIND_COUNTS = { pds: 0, sds: 0, eds: 0 };

export function extraDocItemId(id) {
  return `extra-${Number(id)}`;
}

export function isExtraDocItemId(itemId) {
  return /^extra-\d+$/.test(String(itemId || ""));
}

export function kindLabel(kind) {
  const key = String(kind || "").toLowerCase();
  const match = SAFETY_DOC_KINDS.find((row) => row.key === key);
  return match?.label || String(kind || "").toUpperCase();
}
