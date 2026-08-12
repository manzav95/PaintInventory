import React, { useState } from "react";
import { Button as PaperButton } from "react-native-paper";
import { colors } from "../../theme/tokens";

const FILLED_MODES = new Set(["contained", "elevated"]);

/**
 * Paper Button: subtle gold when engaged (contained), brighter gold on press.
 */
export default function AppButton({
  mode = "text",
  buttonColor,
  textColor,
  rippleColor,
  style,
  onPressIn,
  onPressOut,
  ...rest
}) {
  const [pressed, setPressed] = useState(false);
  const filled = FILLED_MODES.has(mode);
  const customFill = buttonColor != null;

  let resolvedButtonColor = buttonColor;
  let resolvedTextColor = textColor;
  let resolvedStyle = style;

  if (filled && !customFill) {
    // Engaged = muted gold; press = full logo gold
    resolvedButtonColor = pressed
      ? colors.brand.buttonPressFill
      : colors.brand.buttonFill;
    resolvedTextColor = pressed
      ? colors.brand.onButtonPress
      : textColor ?? colors.brand.onButton;
  } else if (filled && customFill && pressed) {
    resolvedButtonColor = colors.brand.buttonPressFill;
    resolvedTextColor = colors.brand.onButtonPress;
  } else if (filled && customFill && !pressed) {
    // Custom engaged colors (check-in green, etc.): keep fill, add soft gold wash
    resolvedStyle = [style, { borderColor: colors.brand.accent, borderWidth: 1.5 }];
  } else if (!filled && pressed) {
    resolvedStyle = [
      style,
      { backgroundColor: colors.brand.buttonPressSoft },
    ];
  }

  return (
    <PaperButton
      mode={mode}
      buttonColor={
        filled
          ? resolvedButtonColor ?? colors.brand.buttonFill
          : resolvedButtonColor
      }
      textColor={
        filled
          ? resolvedTextColor ?? colors.brand.onButton
          : resolvedTextColor
      }
      rippleColor={rippleColor ?? colors.brand.buttonRipple}
      style={resolvedStyle}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      {...rest}
    />
  );
}
