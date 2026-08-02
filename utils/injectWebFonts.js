/**
 * Load Inventory kit brand fonts on web (IBM Plex Sans + Mono).
 * Safe no-op on native / SSR.
 */
export function injectWebFonts() {
  if (typeof document === "undefined") return;
  const id = "paint-inventory-fonts";
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);

  const styleId = "paint-inventory-font-css";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html, body, #root {
        font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      code, pre, .mono, [data-mono="true"] {
        font-family: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
      }
    `;
    document.head.appendChild(style);
  }
}
