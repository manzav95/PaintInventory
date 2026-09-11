/**
 * Client transaction / idempotency ids for inventory quantity mutations.
 * Same id must be reused on offline-queue replay so the server can ignore duplicates.
 */

export function createTransactionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {
    // fall through
  }
  // Fallback for older runtimes
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** True when an error/message looks like a connectivity failure (not a business rule). */
export function isNetworkError(errorOrMessage) {
  const msg =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || String(errorOrMessage || "");
  return /Network request failed|Failed to fetch|TypeError|NetworkError|network|offline|timed?\s*out|ECONNREFUSED|ENOTFOUND|AbortError/i.test(
    msg,
  );
}
