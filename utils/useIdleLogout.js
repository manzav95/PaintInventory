import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import {
  recordUserActivity,
  getLastUserActivity,
  isIdleExpired,
  isAdminUser,
} from "./idleSession";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 30 * 1000;

export default function useIdleLogout(userName, onIdleLogout) {
  const onIdleLogoutRef = useRef(onIdleLogout);
  const bumpRef = useRef(() => {});

  onIdleLogoutRef.current = onIdleLogout;

  useEffect(() => {
    if (!userName || isAdminUser(userName)) return;

    let disposed = false;
    let lastBumpMs = 0;

    const bumpActivity = () => {
      const now = Date.now();
      if (now - lastBumpMs < ACTIVITY_THROTTLE_MS) return;
      lastBumpMs = now;
      recordUserActivity();
    };

    bumpRef.current = bumpActivity;

    const checkIdle = async () => {
      if (disposed) return;
      const last = await getLastUserActivity();
      if (isIdleExpired(last)) {
        onIdleLogoutRef.current?.();
      }
    };

    bumpActivity();
    checkIdle();

    const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkIdle();
        bumpActivity();
      }
    });

    const webCleanups = [];
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const events = [
        "mousedown",
        "mousemove",
        "keydown",
        "touchstart",
        "scroll",
        "click",
      ];
      events.forEach((event) => {
        document.addEventListener(event, bumpActivity, { passive: true });
        webCleanups.push(() =>
          document.removeEventListener(event, bumpActivity),
        );
      });
    }

    return () => {
      disposed = true;
      clearInterval(interval);
      webCleanups.forEach((cleanup) => cleanup());
      appStateSub.remove();
    };
  }, [userName]);

  const touchCaptureProps =
    Platform.OS === "web"
      ? {}
      : {
          onStartShouldSetResponderCapture: () => {
            bumpRef.current();
            return false;
          },
        };

  return touchCaptureProps;
}
