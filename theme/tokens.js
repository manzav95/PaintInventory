/**
 * Design tokens extracted from InventoryListScreen + shared chrome
 * (PageHeader, ToolbarCard, MetricStrip, AppShell).
 *
 * Use these instead of hardcoding hex / spacing on new UI.
 */

import { Platform } from "react-native";

/** Brand / surface palette — CURE navy + white chrome; gold as accent (not body text). */
export const colors = {
  brand: {
    /**
     * UI chrome defaults (icons, links, most buttons).
     * Light theme uses navy; dark theme overrides to white in createAppTheme.
     */
    primary: "#0F1624",
    primaryOnDark: "#FFFFFF",
    onPrimary: "#FFFFFF",
    onPrimaryDark: "#0F1624",
    /** Soft fills — white / navy nested, no steel blue wash */
    primaryContainerLight: "#FFFFFF",
    onPrimaryContainerLight: "#0F1624",
    primaryContainerDark: "#1C2638",
    onPrimaryContainerDark: "#F2F1EE",
    /** Logo gold — accents, highlights; use bold if applied to text */
    accent: "#C9972E",
    /** Brighter gold for dark-mode accent labels (still use bold) */
    accentBright: "#E0B84A",
    accentSoft: "rgba(201, 151, 46, 0.16)",
    accentSoftStrong: "rgba(201, 151, 46, 0.28)",
    /** Logo field */
    navy: "#0F1624",
    navyDeep: "#0B0E1A",
    /**
     * Contained / press fill — logo navy (matches mark field).
     */
    buttonFill: "#0F1624",
    buttonFillStrong: "#0B0E1A",
    onButton: "#F2F1EE",
    /** Ripple / underlay for all Paper buttons */
    buttonRipple: "rgba(15, 22, 36, 0.55)",
  },
  light: {
    background: "#F2F1EE",
    elevated: "#FAF9F7",
    elevatedHigh: "#FFFFFF",
    nested: "#EBEAE6",
    border: "#D2CFC7",
    textMuted: "#5E5A52",
    textDim: "#8A857A",
  },
  dark: {
    /** Main app canvas — logo navy */
    background: "#0F1624",
    /** Cards / elevated surfaces */
    elevated: "#161E2E",
    /** Nested rows inside elevated surfaces */
    nested: "#1C2638",
    /** Persistent / drawer sidebar */
    sidebar: "#0B0E1A",
    border: "#2A3344",
    onSecondaryContainer: "#E8EEF7",
    textMuted: "#9AA3B2",
    textDim: "#7A8494",
  },
  semantic: {
    lowStockText: "#ff6b6b",
    lowStockValue: "#ff9800",
    outOfStockValue: "#f44336",
    recycleDueDate: "#c62828",
    recycleBannerText: "#e65100",
    recycleBannerBg: "rgba(255, 152, 0, 0.15)",
    lateBadgeBg: "#ffebee",
    lateBadgeBorder: "#ffcdd2",
    backOrderBadgeBg: "#fff3e0",
    backOrderBadgeBorder: "#ffe0b2",
    badgeBg: "rgba(0, 0, 0, 0.06)",
    badgeBorder: "rgba(0, 0, 0, 0.12)",
    filterIdle: "rgba(0, 0, 0, 0.04)",
    filterActive: "rgba(0, 0, 0, 0.12)",
    /** Soft logo gold for selected / active chrome */
    activeTintLight: "rgba(201, 151, 46, 0.12)",
    activeTintDark: "rgba(201, 151, 46, 0.14)",
    scrim: "rgba(0, 0, 0, 0.5)",
    scrimLight: "rgba(0, 0, 0, 0.4)",
    notificationBadge: "#e10600",
    success: "#2e7d32",
    successSoft: "#b9f6ca",
    warning: "#f9a825",
    info: "#0F1624",
    infoSoft: "rgba(201, 151, 46, 0.18)",
    open: "#0F1624",
    partial: "#f9a825",
  },
  /** Material-type label colors (matches Inventory / materialTypes). */
  materialType: {
    paint: "#0F1624",
    clear: "#ef6c00",
    stain: "#2e7d32",
    /** Near-white; pair with dark text / outline for contrast on light surfaces. */
    primer: "#eceff1",
    primerLight: "#5d4037",
    primerDark: "#eceff1",
    dye: "#8e24aa",
    catalyst: "#C9972E",
  },
  /** Material-usage booth accents. */
  booth: {
    "Booth 1&3": "#C9972E",
    "Booth 2": "#00897b",
    "Booth 4": "#f9a825",
    default: "#78909c",
  },
  /** Audit / transaction action accents used on Home + Dashboard. */
  action: {
    checkIn: "#81c784",
    checkOut: "#e57373",
    adjust: "#C9972E",
    receive: "#558b2f",
    delete: "#f44336",
    create: "#ba68c8",
    update: "#ff5722",
    materialUsage: "#26a69a",
    unknown: "#757575",
  },
};

/** Theme-aware muted / dim body text. */
export function mutedTextColor(theme) {
  return theme?.dark ? colors.dark.textMuted : colors.light.textMuted;
}

export function dimTextColor(theme) {
  return theme?.dark ? colors.dark.textDim : colors.light.textDim;
}

export const space = {
  1: 4,
  2: 8,
  3: 10,
  4: 12,
  5: 14,
  6: 16,
  7: 18,
  8: 20,
  9: 24,
  10: 40,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  /** Paper MD3: Button radius = roundness * 5 → soft rectangle */
  paperRoundness: 2,
};

export const layout = {
  shellMaxWidth: 1600,
  contentMaxWidth: 1200,
  sidebarWidth: 280,
  sidebarNarrowWidth: 240,
  pagePadX: 20,
  pagePadY: 8,
  searchFieldHeight: 52,
  tableMinWidth: 1100,
  metricCardMinWidth: 120,
  metricCardMaxWidth: 220,
  analyticsCardMinWidth: 180,
  modalMaxWidthSm: 320,
  modalMaxWidthMd: 360,
  modalMaxWidthLg: 440,
};

export const elevation = {
  card: 2,
  modal: 4,
  overlay: 8,
};

export const motion = {
  fadeInMs: 280,
  pageHeaderMs: 240,
  dialogMs: 220,
  overlayInMs: 180,
  overlayOutMs: 150,
  webTransitionMs: 160,
  pressScale: 0.985,
};

/**
 * Inventory type scale. Prefer AppText variants over ad-hoc fontSize.
 */
export const type = {
  pageTitle: { fontSize: 26, fontWeight: "700", lineHeight: 32 },
  pageTitleLg: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  sectionTitle: { fontSize: 20, fontWeight: "700", lineHeight: 26 },
  itemName: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  body: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  bodyEmphasis: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  quantity: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  metricValue: { fontSize: 22, fontWeight: "400", lineHeight: 28 },
  analyticsValue: { fontSize: 24, fontWeight: "700", lineHeight: 30 },
  label: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  badge: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  mono: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  caption: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  empty: { fontSize: 18, fontWeight: "600", lineHeight: 24 },
  emptySub: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
};

/** Web: IBM Plex Sans (loaded in injectWebFonts). Native: system. */
export const fontFamily = {
  sans:
    Platform.OS === "web"
      ? '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
      : Platform.OS === "ios"
        ? "System"
        : "sans-serif",
  mono:
    Platform.OS === "ios"
      ? "Menlo"
      : Platform.OS === "web"
        ? '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
        : "monospace",
};

export const tokens = {
  colors,
  space,
  radius,
  layout,
  elevation,
  motion,
  type,
  fontFamily,
  mutedTextColor,
  dimTextColor,
};

export default tokens;
