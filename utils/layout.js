import { Platform, useWindowDimensions } from "react-native";

export const DESKTOP_BREAKPOINT = 700;
export const LANDSCAPE_SIDEBAR_MIN_WIDTH = 600;
/** Web viewports above this width hide the dedicated Check In / Out control (sidebar / home). */
export const CHECK_IN_OUT_HIDE_MIN_WIDTH = 1024;

/** Screens that stay full-screen (no persistent sidebar) on any layout. */
export const FULLSCREEN_ROUTES = new Set(["login", "scan"]);

export function useAppLayout() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isLandscape = width > height;
  const showPersistentSidebar =
    (isWeb && width >= DESKTOP_BREAKPOINT) ||
    (isLandscape && width >= LANDSCAPE_SIDEBAR_MIN_WIDTH);
  const isPortraitStack = !showPersistentSidebar;
  const isNarrowDesktop =
    isWeb && width >= DESKTOP_BREAKPOINT && width <= 1024;
  const isWebDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const showCheckInOutNav =
    !isWeb || width <= CHECK_IN_OUT_HIDE_MIN_WIDTH;

  return {
    width,
    height,
    isWeb,
    isLandscape,
    showPersistentSidebar,
    isPortraitStack,
    isNarrowDesktop,
    isWebDesktop,
    isDesktop: isWebDesktop,
    showCheckInOutNav,
  };
}

export function shouldUseShell(currentScreen, showPersistentSidebar) {
  if (!showPersistentSidebar) return false;
  if (FULLSCREEN_ROUTES.has(currentScreen)) return false;
  return true;
}
