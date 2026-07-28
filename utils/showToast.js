/**
 * Imperative toast API. ToastHost must be mounted under PaperProvider.
 */

const listeners = new Set();
let seq = 0;

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {string | { message: string, title?: string, type?: 'success'|'error'|'info', duration?: number }} messageOrOpts
 * @param {'success'|'error'|'info'} [type]
 */
export default function showToast(messageOrOpts, type = "success") {
  const opts =
    typeof messageOrOpts === "string"
      ? { message: messageOrOpts, type }
      : { type: "success", ...messageOrOpts };

  const toast = {
    id: ++seq,
    title: opts.title || "",
    message: String(opts.message || "").trim(),
    type: opts.type || "success",
    duration: opts.duration ?? (opts.type === "error" ? 3600 : 2800),
  };
  if (!toast.message && !toast.title) return toast.id;
  listeners.forEach((fn) => {
    try {
      fn(toast);
    } catch (_) {
      /* ignore */
    }
  });
  return toast.id;
}
