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
      primary: colors.brand.primary,
      primaryContainer: colors.brand.primaryContainerLight,
      onPrimaryContainer: colors.brand.onPrimaryContainerLight,
      background: colors.light.background,
      surface: colors.light.background,
      surfaceVariant: colors.light.elevated,
      surfaceContainer: colors.light.elevated,
      surfaceContainerHigh: colors.light.elevated,
      surfaceContainerHighest: colors.light.elevatedHigh,
      outlineVariant: colors.light.border,
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
      primary: colors.brand.primary,
      primaryContainer: colors.brand.primaryContainerDark,
      onPrimaryContainer: colors.brand.onPrimaryContainerDark,
      secondaryContainer: colors.dark.elevated,
      onSecondaryContainer: colors.dark.onSecondaryContainer,
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
