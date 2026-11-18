import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import { Text, IconButton, Divider, useTheme, ActivityIndicator } from "react-native-paper";
import downloadBlob, {
  blobForView,
  isPreviewable,
} from "../utils/downloadBlob";
import ItemDocService from "../services/itemDocService";
import { SAFETY_DOC_KINDS, kindLabel } from "../utils/safetyDocKinds";
import { getMaterialTypeLabel } from "../utils/materialTypes";
import showToast from "../utils/showToast";

const PANEL_WIDTH = 280;

function MenuRow({ title, detail, disabled, onPress, theme }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.menuRow,
        pressed &&
          !disabled && {
            backgroundColor: theme.dark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
          },
      ]}
    >
      <View style={styles.menuRowText}>
        <Text
          style={[
            styles.menuTitle,
            {
              color: disabled
                ? theme.colors.onSurfaceVariant
                : theme.colors.onSurface,
            },
          ]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={[styles.menuDetail, { color: theme.colors.onSurfaceVariant }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ItemDataSheetsPopover({
  visible,
  anchor = { pageX: 0, pageY: 0 },
  item,
  onClose,
}) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [view, setView] = useState("menu");
  const [pickedKind, setPickedKind] = useState("");
  const [itemFiles, setItemFiles] = useState([]);
  const [typeFiles, setTypeFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const itemId = item?.id != null ? String(item.id) : "";
  const itemType = String(item?.type || "").toLowerCase();
  const typeLabel = getMaterialTypeLabel(itemType) || "Type";

  useEffect(() => {
    if (!visible) {
      setView("menu");
      setPickedKind("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      itemId
        ? ItemDocService.listItem(itemId).catch(() => ({ files: [] }))
        : Promise.resolve({ files: [] }),
      itemType
        ? ItemDocService.listType(itemType).catch(() => ({ files: [] }))
        : Promise.resolve({ files: [] }),
    ])
      .then(([itemData, typeData]) => {
        if (cancelled) return;
        setItemFiles(itemData.files || []);
        setTypeFiles(typeData.files || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, itemId, itemType]);

  const filesForKind = useCallback(
    (kind) => {
      const own = (itemFiles || []).filter((f) => String(f.kind) === kind);
      if (own.length) {
        return own.map((f) => ({ ...f, source: "item" }));
      }
      return (typeFiles || [])
        .filter((f) => String(f.kind) === kind)
        .map((f) => ({ ...f, source: "type" }));
    },
    [itemFiles, typeFiles],
  );

  const closePreview = () => {
    if (preview?.url && typeof URL !== "undefined") {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  const viewFile = async (file) => {
    try {
      const loaded =
        file.source === "type"
          ? await ItemDocService.downloadTypeKind(itemType, file.kind, file.id)
          : await ItemDocService.downloadItem(itemId, file.id, file.filename);
      if (
        Platform.OS === "web" &&
        typeof URL !== "undefined" &&
        isPreviewable(
          file.filename || loaded.filename,
          file.mime || loaded.blob?.type,
        )
      ) {
        const typed = blobForView(loaded.blob, loaded.filename);
        const url = URL.createObjectURL(typed);
        setPreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return {
            url,
            filename: loaded.filename,
            mime: typed.type || loaded.blob?.type || "",
            blob: loaded.blob,
          };
        });
        return;
      }
      await downloadBlob(loaded.blob, loaded.filename);
    } catch (e) {
      showToast({
        type: "error",
        title: "Sheets",
        message: e?.message || "Could not open.",
      });
    }
  };

  const availableKinds = useMemo(
    () =>
      SAFETY_DOC_KINDS.filter((meta) => filesForKind(meta.key).length > 0),
    [filesForKind],
  );

  const openKind = (kind) => {
    const list = filesForKind(kind);
    if (!list.length) return;
    if (list.length === 1) {
      viewFile(list[0]);
      return;
    }
    setPickedKind(kind);
    setView("files");
  };

  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, windowWidth - 16));
  const panelPos = useMemo(() => {
    const gap = 10;
    const caretSize = 10;
    const margin = 8;
    const x = Number(anchor?.pageX) || windowWidth / 2;
    const y = Number(anchor?.pageY) || 80;
    const preferredHeight = 220;
    const spaceBelow = windowHeight - y - margin;
    const spaceAbove = y - margin;
    const placement =
      spaceBelow < preferredHeight && spaceAbove > spaceBelow
        ? "above"
        : "below";
    const available = placement === "above" ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(320, available - gap - caretSize));
    const left = Math.max(
      margin,
      Math.min(x - panelWidth / 2, windowWidth - panelWidth - margin),
    );
    const caretLeft = Math.max(12, Math.min(x - left - caretSize, panelWidth - 24));
    if (placement === "above") {
      return {
        placement,
        bottom: Math.max(margin, windowHeight - y + gap),
        left,
        caretLeft,
        maxHeight,
      };
    }
    return {
      placement,
      top: Math.max(margin + caretSize, y + gap),
      left,
      caretLeft,
      maxHeight,
    };
  }, [anchor?.pageX, anchor?.pageY, panelWidth, windowWidth, windowHeight]);

  if (!visible) return null;

  const above = panelPos.placement === "above";
  const pickedList = filesForKind(pickedKind);
  const panelFill = theme.colors.surfaceContainerHighest;

  return (
    <>
      <Modal
        visible={visible && !preview}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.panelAnchor,
              {
                left: panelPos.left,
                width: panelWidth,
                pointerEvents: "box-none",
                ...(above ? { bottom: panelPos.bottom } : { top: panelPos.top }),
              },
            ]}
          >
            {!above ? (
              <>
                <View
                  style={[
                    styles.caret,
                    {
                      left: panelPos.caretLeft,
                      borderBottomColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.caretInner,
                    {
                      left: panelPos.caretLeft + 1,
                      borderBottomColor: panelFill,
                    },
                  ]}
                />
              </>
            ) : null}
            <View
              style={[
                styles.panel,
                {
                  backgroundColor: panelFill,
                  borderColor: theme.colors.outlineVariant,
                  maxHeight: panelPos.maxHeight,
                },
              ]}
            >
              <View style={styles.panelHeader}>
                {view === "files" ? (
                  <IconButton
                    icon="arrow-left"
                    size={18}
                    onPress={() => {
                      setView("menu");
                      setPickedKind("");
                    }}
                    style={styles.headerBtn}
                    accessibilityLabel="Back"
                  />
                ) : (
                  <View style={styles.headerBtnSpacer} />
                )}
                <Text
                  style={[styles.title, { color: theme.colors.onSurface }]}
                  numberOfLines={1}
                >
                  {view === "files" ? kindLabel(pickedKind) : "Data sheets"}
                </Text>
                <IconButton
                  icon="close"
                  size={18}
                  onPress={onClose}
                  style={styles.headerBtn}
                  accessibilityLabel="Close"
                />
              </View>
              {loading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} />
              ) : view === "files" ? (
                <View>
                  {pickedList.map((file, idx) => (
                    <React.Fragment key={file.id}>
                      {idx > 0 ? <Divider /> : null}
                      <MenuRow
                        theme={theme}
                        title={file.filename}
                        detail={
                          file.source === "type" ? `${typeLabel} sheet` : null
                        }
                        onPress={() => viewFile(file)}
                      />
                    </React.Fragment>
                  ))}
                </View>
              ) : availableKinds.length === 0 ? (
                <Text
                  style={[
                    styles.empty,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  No data sheets available
                </Text>
              ) : (
                <View>
                  {availableKinds.map((meta, idx) => {
                    const list = filesForKind(meta.key);
                    const fromType = list.every((f) => f.source === "type");
                    return (
                      <React.Fragment key={meta.key}>
                        {idx > 0 ? <Divider /> : null}
                        <MenuRow
                          theme={theme}
                          title={meta.label}
                          detail={
                            fromType
                              ? `${typeLabel} ${meta.label}`
                              : list.length === 1
                                ? list[0].filename
                                : `${list.length} files`
                          }
                          onPress={() => openKind(meta.key)}
                        />
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>
            {above ? (
              <>
                <View
                  style={[
                    styles.caretDownInner,
                    {
                      left: panelPos.caretLeft + 1,
                      borderTopColor: panelFill,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.caretDown,
                    {
                      left: panelPos.caretLeft,
                      borderTopColor: theme.colors.outlineVariant,
                    },
                  ]}
                />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!preview}
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View
          style={[
            styles.previewRoot,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={[styles.previewBar, { backgroundColor: panelFill }]}>
            <Text
              style={[styles.previewTitle, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {preview?.filename || "Data sheet"}
            </Text>
            <IconButton icon="close" onPress={closePreview} />
          </View>
          {preview?.mime?.startsWith("image/") ? (
            <Image
              source={{ uri: preview.url }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : Platform.OS === "web" && preview?.url ? (
            <iframe
              src={preview.url}
              title={preview.filename}
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                background: "#fff",
              }}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  panelAnchor: { position: "absolute" },
  caret: {
    position: "absolute",
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  caretInner: {
    position: "absolute",
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  caretDown: {
    position: "absolute",
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 2,
  },
  caretDownInner: {
    position: "absolute",
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 3,
  },
  panel: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    width: "100%",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          boxSizing: "border-box",
          boxShadow: "0px 8px 24px rgba(0,0,0,0.28)",
        }
      : {
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.22,
          shadowRadius: 10,
        }),
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    marginBottom: 4,
  },
  headerBtn: { margin: 0 },
  headerBtnSpacer: { width: 34 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  menuRowText: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 15, fontWeight: "600" },
  menuDetail: { fontSize: 12, marginTop: 2 },
  empty: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  previewRoot: { flex: 1 },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
  },
  previewTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  previewImage: { flex: 1, width: "100%" },
});
