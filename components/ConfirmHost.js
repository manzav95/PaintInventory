import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet from "./ui/AppSheet";
import { subscribeConfirm } from "../utils/confirmAction";

/**
 * Renders promise-based confirm dialogs from confirmAction().
 */
export default function ConfirmHost() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    return subscribeConfirm((payload) => {
      if (resolveRef.current) {
        try {
          resolveRef.current(false);
        } catch (_) {
          /* ignore */
        }
      }
      resolveRef.current = payload.resolve;
      setOpts(payload);
      setOpen(true);
    });
  }, []);

  const finish = (value) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    if (typeof resolve === "function") {
      resolve(value);
    }
  };

  return (
    <AppSheet
      visible={open && !!opts}
      onDismiss={() => finish(false)}
      title={opts?.title || "Confirm"}
      footer={
        opts ? (
          <View style={{ gap: 8 }}>
            <AppButton
              mode="contained"
              onPress={() => finish(true)}
              textColor={
                opts.destructive ? theme.colors.error : undefined
              }
            >
              {opts.confirmLabel}
            </AppButton>
            <AppButton mode="outlined" onPress={() => finish(false)}>
              {opts.cancelLabel}
            </AppButton>
          </View>
        ) : null
      }
    >
      {opts?.message ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, paddingTop: 4 }}>
          {opts.message}
        </Text>
      ) : null}
    </AppSheet>
  );
}
