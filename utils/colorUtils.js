/**
 * Relative luminance (WCAG) for sRGB hex. 0 = black, 1 = white.
 */
function hexLuminance(hex) {
  if (!hex || typeof hex !== "string" || !/^#([0-9A-Fa-f]{3}){1,2}$/.test(hex)) return 0.5;
  let s = hex.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const [rs, gs, bs] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Returns text colors that contrast with the given hex background.
 * Use for any text drawn on top of a paint/hex color so it works in both light and dark app themes.
 * @param {string} hex - e.g. "#ffffff" or "#1a1a1a"
 * @returns {{ primary: string, secondary: string }}
 */
export function getContrastingTextColors(hex) {
  if (!hex) {
    return { primary: "#1a1a1a", secondary: "rgba(0,0,0,0.7)" };
  }
  const lum = hexLuminance(hex);
  const useDarkText = lum > 0.4;
  return useDarkText
    ? { primary: "#1a1a1a", secondary: "rgba(0,0,0,0.7)" }
    : { primary: "#ffffff", secondary: "rgba(255,255,255,0.85)" };
}
