import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Web virtual-keyboard inset using Visual Viewport.
 * react-native-keyboard-controller is a no-op on web; this fills that gap
 * so phone/tablet browsers still lift fields above the keys.
 * Desktop hardware keyboards report 0.
 */
export default function useKeyboardBottomInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const scrollFocusedIntoView = () => {
      const el = document.activeElement;
      if (!el) return;
      const tag = String(el.tagName || "").toLowerCase();
      if (tag !== "input" && tag !== "textarea") return;
      try {
        el.scrollIntoView({ block: "center", inline: "nearest" });
      } catch {
        /* ignore */
      }
    };

    const update = () => {
      const next = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
      );
      setInset(next);
      if (next > 0) scrollFocusedIntoView();
    };
    const onFocusIn = (event) => {
      const el = event.target;
      if (!el || typeof el.tagName !== "string") return;
      const tag = el.tagName.toLowerCase();
      if (tag !== "input" && tag !== "textarea") return;
      window.setTimeout(scrollFocusedIntoView, 50);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return inset;
}
