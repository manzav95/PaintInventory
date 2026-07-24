/**
 * Soften harsh web UI: button/hover transitions + smooth scrolling.
 * Call once at app startup (web only).
 */
export function injectWebMotionStyles() {
  if (typeof document === "undefined") return;
  const id = "paint-inventory-motion-css";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    html {
      scroll-behavior: smooth;
    }

    button,
    [role="button"],
    a {
      transition:
        background-color 160ms ease,
        border-color 160ms ease,
        color 160ms ease,
        opacity 160ms ease,
        box-shadow 160ms ease,
        transform 140ms ease !important;
    }

    button:active,
    [role="button"]:active {
      transform: scale(0.985);
    }

    input,
    textarea,
    select {
      transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease !important;
    }
  `;
  document.head.appendChild(style);
}
