import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Platform } from "react-native";
import { Portal, Dialog, Text, useTheme } from "react-native-paper";
import AppButton from "./ui/AppButton";
import { subscribeConfirm } from "../utils/confirmAction";
import { layout, radius } from "../theme/tokens";

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
      // Replace any in-flight confirm so we never leave a hung Promise.
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
    setOpts(null);
    if (typeof resolve === "function") {
      resolve(value);
    }
  };

  if (!opts) return null;

  return (
    <Portal>
      <Dialog
        visible={open}
        onDismiss={() => finish(false)}
        style={[
          styles.dialog,
          {
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Dialog.Title>{opts.title}</Dialog.Title>
        {opts.message ? (
          <Dialog.Content>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {opts.message}
            </Text>
          </Dialog.Content>
        ) : null}
        <Dialog.Actions>
          <AppButton onPress={() => finish(false)}>{opts.cancelLabel}</AppButton>
          <AppButton
            onPress={() => finish(true)}
            textColor={
              opts.destructive ? theme.colors.error : theme.colors.primary
            }
          >
            {opts.confirmLabel}
          </AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: "center",
    width: layout.modalMaxWidthSm,
    maxWidth: "90%",
    marginHorizontal: 24,
    borderRadius: radius.lg,
    ...(Platform.OS === "web"
      ? {
          boxSizing: "border-box",
        }
      : null),
  },
});
