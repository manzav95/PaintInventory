/**
 * Imperative confirm dialog API. ConfirmHost must be mounted under PaperProvider.
 * Avoids window.confirm / RN Alert on web, which freeze or fail on mobile browsers.
 */

const listeners = new Set();

export function subscribeConfirm(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {string} title
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, destructive?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export default function confirmAction(
  title,
  message,
  { confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false } = {},
) {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      // Host not mounted — fail closed so callers don't hang forever.
      console.warn("confirmAction: ConfirmHost is not mounted");
      resolve(false);
      return;
    }
    const payload = {
      title: String(title || "Confirm"),
      message: String(message || ""),
      confirmLabel,
      cancelLabel,
      destructive: !!destructive,
      resolve,
    };
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.warn("confirmAction listener error:", e);
        resolve(false);
      }
    });
  });
}
