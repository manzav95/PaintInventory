import { colors } from "../theme/tokens";

/** Page background (darkest) — do not use for cards/toolbars. */
export const DARK_SITE_BACKGROUND = colors.dark.background;

/** Elevated surface — lighter than page background for visible card/toolbar contrast. */
export const DARK_SURFACE_ELEVATED = colors.dark.elevated;

/** Nested row/card fill — slightly different from parent surfaceContainerHighest. */
export const DARK_NESTED_SURFACE = colors.dark.nested;
export const LIGHT_NESTED_SURFACE = colors.light.nested;

export const DARK_BORDER = colors.dark.border;

/** Bell notification count badge — saturated alert red. */
export const NOTIFICATION_BADGE_RED = colors.semantic.notificationBadge;

/** Fill for nested list rows/cards inside elevated parent surfaces. */
export function nestedSurfaceColor(theme) {
  return theme?.dark ? DARK_NESTED_SURFACE : LIGHT_NESTED_SURFACE;
}
