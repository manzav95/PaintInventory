/** Page background (darkest) — do not use for cards/toolbars. */
export const DARK_SITE_BACKGROUND = "#181818";

/** Elevated surface — lighter than page background for visible card/toolbar contrast. */
export const DARK_SURFACE_ELEVATED = "#1f1f1f";

/** Nested row/card fill — slightly different from parent surfaceContainerHighest. */
export const DARK_NESTED_SURFACE = "#2a2a2a";
export const LIGHT_NESTED_SURFACE = "#f4f4f4";

export const DARK_BORDER = "#383838";

/** Bell notification count badge — saturated alert red. */
export const NOTIFICATION_BADGE_RED = "#e10600";

/** Fill for nested list rows/cards inside elevated parent surfaces. */
export function nestedSurfaceColor(theme) {
  return theme?.dark ? DARK_NESTED_SURFACE : LIGHT_NESTED_SURFACE;
}
