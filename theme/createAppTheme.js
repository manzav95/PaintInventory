import { MD3LightTheme, MD3DarkTheme, configureFonts } from "react-native-paper";
import { Platform } from "react-native";
import { colors, radius, fontFamily } from "./tokens";

function buildFonts() {
  if (Platform.OS !== "web") {
    return undefined;
  }
  // Flat config applies fontFamily to every MD3 typescale variant.
  return configureFonts({
    config: {
      fontFamily: fontFamily.sans,
    },
  });
}

export function createLightTheme() {
  const fonts = buildFonts();
  return {
    ...MD3LightTheme,
    roundness: radius.paperRoundness,
    ...(fonts ? { fonts } : {}),
    colors: {
      ...MD3LightTheme.colors,
      primary: colors.brand.navy,
      onPrimary: colors.brand.onPrimary,
      primaryContainer: colors.brand.primaryContainerLight,
      onPrimaryContainer: colors.brand.onPrimaryContainerLight,
      secondary: "#6A6358",
      onSecondary: "#FFFFFF",
      secondaryContainer: "#E8E2D6",
      onSecondaryContainer: "#2A261F",
      /** Logo gold — accent surfaces / rare CTAs, not body copy */
      tertiary: colors.brand.accent,
      onTertiary: colors.brand.navy,
      tertiaryContainer: "#F3E6C8",
      onTertiaryContainer: "#3D2E0A",
      background: colors.light.background,
      surface: colors.light.background,
      surfaceVariant: colors.light.elevated,
      surfaceContainer: colors.light.elevated,
      surfaceContainerHigh: colors.light.elevated,
      surfaceContainerHighest: colors.light.elevatedHigh,
      outlineVariant: colors.light.border,
      outline: colors.light.border,
      inversePrimary: colors.brand.primaryContainerLight,
      elevation: {
        level0: colors.light.background,
        level1: colors.light.elevated,
        level2: colors.light.elevated,
        level3: colors.light.elevatedHigh,
        level4: colors.light.elevatedHigh,
        level5: colors.light.elevatedHigh,
      },
    },
  };
}

export function createDarkTheme() {
  const fonts = buildFonts();
  return {
    ...MD3DarkTheme,
    roundness: radius.paperRoundness,
    ...(fonts ? { fonts } : {}),
    colors: {
      ...MD3DarkTheme.colors,
      primary: colors.brand.primaryOnDark,
      onPrimary: colors.brand.onPrimaryDark,
      primaryContainer: colors.brand.primaryContainerDark,
      onPrimaryContainer: colors.brand.onPrimaryContainerDark,
      secondary: "#B8B0A2",
      onSecondary: colors.brand.navy,
      secondaryContainer: colors.dark.elevated,
      onSecondaryContainer: colors.dark.onSecondaryContainer,
      /** Logo gold accent — not for body text */
      tertiary: colors.brand.accent,
      onTertiary: colors.brand.navy,
      tertiaryContainer: "#2E2814",
      onTertiaryContainer: "#E8D49A",
      background: colors.dark.background,
      surface: colors.dark.background,
      surfaceVariant: colors.dark.elevated,
      surfaceContainer: colors.dark.elevated,
      surfaceContainerHigh: colors.dark.elevated,
      surfaceContainerHighest: colors.dark.elevated,
      surfaceDisabled: colors.dark.elevated,
      onSurface: "#E8EEF7",
      onSurfaceVariant: colors.dark.textMuted,
      onBackground: "#E8EEF7",
      outline: colors.dark.border,
      outlineVariant: colors.dark.border,
      inversePrimary: colors.brand.primaryContainerDark,
      elevation: {
        level0: colors.dark.background,
        level1: colors.dark.elevated,
        level2: colors.dark.elevated,
        level3: colors.dark.nested,
        level4: colors.dark.nested,
        level5: colors.dark.nested,
      },
    },
  };
}

export const lightTheme = createLightTheme();
export const darkTheme = createDarkTheme();
