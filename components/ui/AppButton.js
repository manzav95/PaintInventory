import React from "react";
import { Button as PaperButton } from "react-native-paper";
import { colors } from "../../theme/tokens";

const FILLED_MODES = new Set(["contained", "elevated"]);

/**
 * Paper Button with dark-brown contained fill + press ripple
 * (logo/sidebar-adjacent), applied app-wide.
 */
export default function AppButton({
  mode = "text",
  buttonColor,
  textColor,
  rippleColor,
  ...rest
}) {
  const filled = FILLED_MODES.has(mode);
  return (
    <PaperButton
      mode={mode}
      buttonColor={buttonColor ?? (filled ? colors.brand.buttonFill : undefined)}
      textColor={textColor ?? (filled ? colors.brand.onButton : undefined)}
      rippleColor={rippleColor ?? colors.brand.buttonRipple}
      {...rest}
    />
  );
}
