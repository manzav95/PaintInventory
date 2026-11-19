import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  Image,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Text, useTheme, ActivityIndicator, Menu } from "react-native-paper";
import AppButton from "./ui/AppButton";
import AppSheet from "./ui/AppSheet";
import SwipeableRow from "./ui/SwipeableRow";
import { useAppLayout } from "../utils/layout";
import ItemDocService from "../services/itemDocService";
import pickFiles, { filesFromFileList } from "../utils/pickFiles";
import downloadBlob, {
  blobForView,
  isPreviewable,
} from "../utils/downloadBlob";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import {
  SAFETY_DOC_TYPE_OPTIONS,
  getMaterialTypeLabel,
} from "../utils/materialTypes";
import { SAFETY_DOC_KINDS } from "../utils/safetyDocKinds";
import { nestedSurfaceColor, popupSurfaceColor } from "../utils/themeColors";
import { radius, space } from "../theme/tokens";

const KINDS = SAFETY_DOC_KINDS;

function filesForKind(files, kind) {
  return (files || []).filter((f) => String(f.kind) === kind);
}

function TypeSelect({ value, onChange, theme }) {
  const [open, setOpen] = useState(false);
  const label = getMaterialTypeLabel(value) || "Type";
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          minWidth: 128,
          padding: 8,
          fontSize: 14,
          borderRadius: 4,
          border: `1px solid ${theme.colors.outline}`,
          backgroundColor: theme.colors.surface,
          color: theme.colors.onSurface,
        }}
      >
        {SAFETY_DOC_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Pressable
          onPress={() => setOpen(true)}
          style={[
            styles.typeTrigger,
            {
              borderColor: theme.colors.outline,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Text style={{ color: theme.colors.onSurface }}>{label}</Text>
        </Pressable>
      }
    >
      {SAFETY_DOC_TYPE_OPTIONS.map((o) => (
        <Menu.Item
          key={o.value}
          onPress={() => {
            onChange(o.value);
            setOpen(false);
          }}
          title={o.label}
        />
      ))}
    </Menu>
  );
}

function WebDropZone({ enabled, onHover, onFiles, children }) {
  if (Platform.OS !== "web" || !enabled) return children;
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onHover?.(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget)) onHover?.(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        onHover?.(false);
        const rows = await filesFromFileList(e.dataTransfer?.files);
        if (rows.length) onFiles(rows);
      }}
    >
      {children}
    </div>
  );
}

export default function SafetyDocsPanel({
  scope = "item",
  itemId = "",
  itemType = "",
  isAdmin = false,
  compact = false,
  hideTitle = false,
  hideTypePicker = false,
  kindCounts = null,
  readOnly = false,
  onChanged,
}) {
  const theme = useTheme();
  const { isMobilePortrait } = useAppLayout();
  const isType = scope === "type";
  const [type, setType] = useState(itemType || "paint");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKind, setBusyKind] = useState("");
  const [preview, setPreview] = useState(null);
  const [hoverKind, setHoverKind] = useState("");
  const [batch, setBatch] = useState(null);
  const { width } = useWindowDimensions();
  const assignWide = width >= 700;

  useEffect(() => {
    if (itemType) setType(itemType);
  }, [itemType]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (isType) {
        if (!type) {
          setFiles([]);
          return;
        }
        const data = await ItemDocService.listType(type);
        setFiles(data.files || []);
      } else {
        if (!itemId) {
          setFiles([]);
          return;
        }
        const data = await ItemDocService.listItem(itemId);
        setFiles(data.files || []);
      }
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not load sheets",
        message: e?.message || "Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [isType, itemId, type]);

  useEffect(() => {
    load();
  }, [load]);

  const runKind = async (kind, fn) => {
    setBusyKind(kind);
    try {
      await fn();
    } catch (e) {
      showToast({
        type: "error",
        title: "Sheets",
        message: e?.message || "Could not finish.",
      });
    } finally {
      setBusyKind("");
    }
  };

  const upload = (kind) =>
    runKind(kind, async () => {
      const picked = await pickFiles(
        ".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf",
        true,
      );
      if (!picked.length) return;
      if (isType && picked.length > 1) {
        openBatch(kind, picked);
        return;
      }
      for (const file of picked) {
        if (isType) {
          await ItemDocService.uploadType(type, { kind, ...file });
        } else {
          await ItemDocService.uploadItem(itemId, { kind, ...file });
        }
      }
      await load();
      onChanged?.();
      showToast({
        title: "Uploaded",
        message: `${picked.length} ${kind.toUpperCase()} file${picked.length === 1 ? "" : "s"}.`,
      });
    });

  const fetchOne = async (file) =>
    isType
      ? ItemDocService.downloadTypeKind(type, file.kind, file.id)
      : ItemDocService.downloadItem(itemId, file.id, file.filename);

  const closePreview = () => {
    if (preview?.url && typeof URL !== "undefined") {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  const viewOne = (file) =>
    runKind(file.kind, async () => {
      const loaded = await fetchOne(file);
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
    });

  const removeFile = (file) =>
    runKind(file.kind, async () => {
      const ok = await confirmAction(
        "Delete file",
        `Remove ${file.filename}?`,
        { confirmLabel: "Delete", destructive: true },
      );
      if (!ok) return;
      if (isType) await ItemDocService.deleteType(type, file.id);
      else await ItemDocService.deleteItem(itemId, file.id);
      await load();
      onChanged?.();
    });

  const openBatch = (kind, rows) => {
    setBatch({
      kind,
      rows: rows.map((row, index) => ({
        key: `${row.filename}-${index}`,
        filename: row.filename,
        dataBase64: row.dataBase64,
        itemType: type || "paint",
      })),
    });
  };

  const uploadBatch = () =>
    runKind(batch?.kind || "", async () => {
      const rows = batch?.rows || [];
      const kind = batch?.kind;
      if (!kind || !rows.length) return;
      for (const row of rows) {
        await ItemDocService.uploadType(row.itemType, {
          kind,
          filename: row.filename,
          dataBase64: row.dataBase64,
        });
      }
      setBatch(null);
      await load();
      onChanged?.();
      showToast({
        title: "Uploaded",
        message: `${rows.length} ${kind.toUpperCase()} file${rows.length === 1 ? "" : "s"}.`,
      });
    });

  const canManage = isAdmin && !readOnly && (isType || !!itemId);

  const previewFrame = (
    <View style={styles.previewFill}>
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
            height: "100%",
            border: "none",
            background: "#fff",
          }}
        />
      ) : null}
    </View>
  );

  if (readOnly && !loading && !(files || []).length) {
    return null;
  }

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        hideTitle && styles.wrapFlush,
      ]}
    >
      {hideTitle ? null : (
        <>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {isType ? "Safety sheets by type" : "Safety sheets"}
          </Text>
        </>
      )}

      {isType && !hideTypePicker ? (
        <View style={styles.typeRow}>
          <TypeSelect
            value={type}
            onChange={setType}
            theme={theme}
          />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : (
        KINDS.map((meta) => {
          const list = filesForKind(files, meta.key);
          const busy = busyKind === meta.key;
          const dropping = hoverKind === meta.key;
          const showDrop = canManage;
          if (readOnly && list.length === 0) return null;
          if (!showDrop && list.length === 0) return null;
          const kindCard = (
            <View
              style={[
                styles.kindCard,
                {
                  backgroundColor: nestedSurfaceColor(theme),
                  borderColor: dropping
                    ? theme.colors.primary
                    : theme.colors.outlineVariant,
                  borderStyle: dropping || (showDrop && list.length === 0)
                    ? "dashed"
                    : "solid",
                },
              ]}
            >
              <Text
                style={[styles.kindTitle, { color: theme.colors.onSurface }]}
              >
                {meta.label}
              </Text>
              {list.length === 0 ? (
                <Pressable
                  onPress={() => !busy && upload(meta.key)}
                  disabled={busy}
                  style={styles.dropHit}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${meta.label}`}
                >
                  <Text
                    style={[
                      styles.empty,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Drop or tap to add {meta.label}
                  </Text>
                </Pressable>
              ) : (
                <>
                  {list.map((file) => {
                    const row = (
                      <View style={styles.fileRow}>
                        <Pressable
                          onPress={() => viewOne(file)}
                          disabled={busy}
                          style={styles.fileNamePress}
                        >
                          <Text
                            style={[
                              styles.fileName,
                              { color: theme.colors.onSurface },
                            ]}
                            numberOfLines={1}
                          >
                            {file.filename}
                          </Text>
                        </Pressable>
                        {!isMobilePortrait && canManage ? (
                          <AppButton
                            mode="text"
                            compact
                            textColor={theme.colors.error}
                            onPress={() => removeFile(file)}
                            disabled={busy}
                          >
                            Delete
                          </AppButton>
                        ) : null}
                      </View>
                    );
                    if (!isMobilePortrait || readOnly) {
                      return <View key={file.id}>{row}</View>;
                    }
                    return (
                      <SwipeableRow
                        key={file.id}
                        style={styles.swipeFile}
                        leftAction={
                          canManage
                            ? {
                                key: "delete",
                                label: "Delete",
                                tone: "danger",
                                onPress: () => removeFile(file),
                              }
                            : null
                        }
                        rightAction={{
                          key: "view",
                          label: "View",
                          tone: "gold",
                          onPress: () => viewOne(file),
                        }}
                      >
                        {row}
                      </SwipeableRow>
                    );
                  })}
                  {showDrop ? (
                    <Pressable
                      onPress={() => !busy && upload(meta.key)}
                      disabled={busy}
                      style={styles.dropHitSlim}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${meta.label}`}
                    >
                      <Text
                        style={[
                          styles.empty,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                      >
                        Drop or tap to add
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          );
          return (
            <WebDropZone
              key={meta.key}
              enabled={showDrop}
              onHover={(on) => setHoverKind(on ? meta.key : "")}
              onFiles={(rows) => {
                if (isType && rows.length > 1) {
                  openBatch(meta.key, rows);
                  return;
                }
                runKind(meta.key, async () => {
                  for (const file of rows) {
                    if (isType) {
                      await ItemDocService.uploadType(type, {
                        kind: meta.key,
                        ...file,
                      });
                    } else {
                      await ItemDocService.uploadItem(itemId, {
                        kind: meta.key,
                        ...file,
                      });
                    }
                  }
                  await load();
                  onChanged?.();
                });
              }}
            >
              {kindCard}
            </WebDropZone>
          );
        })
      )}

      <Modal
        visible={!!batch}
        transparent
        animationType="fade"
        onRequestClose={() => !busyKind && setBatch(null)}
      >
        <Pressable
          style={styles.assignOverlay}
          onPress={() => !busyKind && setBatch(null)}
        >
          <Pressable
            style={[
              styles.assignCard,
              assignWide && styles.assignCardWide,
              { backgroundColor: popupSurfaceColor(theme) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={[styles.assignTitle, { color: theme.colors.onSurface }]}
            >
              {`Assign ${String(batch?.kind || "").toUpperCase()} files`}
            </Text>
            <View style={styles.assignAllRow}>
              <Text
                style={[
                  styles.assignHint,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                Set all to
              </Text>
              <TypeSelect
                value={batch?.rows?.[0]?.itemType || type || "paint"}
                onChange={(next) =>
                  setBatch((prev) =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map((row) => ({
                            ...row,
                            itemType: next,
                          })),
                        }
                      : prev,
                  )
                }
                theme={theme}
              />
            </View>
            <ScrollView style={styles.assignList}>
              {(batch?.rows || []).map((row) => (
                <View
                  key={row.key}
                  style={[
                    styles.assignRow,
                    { borderColor: theme.colors.outlineVariant },
                  ]}
                >
                  <Text
                    style={[
                      styles.assignName,
                      { color: theme.colors.onSurface },
                    ]}
                    numberOfLines={2}
                  >
                    {row.filename}
                  </Text>
                  <TypeSelect
                    value={row.itemType}
                    onChange={(next) =>
                      setBatch((prev) =>
                        prev
                          ? {
                              ...prev,
                              rows: prev.rows.map((item) =>
                                item.key === row.key
                                  ? { ...item, itemType: next }
                                  : item,
                              ),
                            }
                          : prev,
                      )
                    }
                    theme={theme}
                  />
                  <AppButton
                    mode="text"
                    compact
                    textColor={theme.colors.error}
                    disabled={!!busyKind}
                    onPress={() =>
                      setBatch((prev) => {
                        if (!prev) return prev;
                        const rows = prev.rows.filter(
                          (item) => item.key !== row.key,
                        );
                        return rows.length ? { ...prev, rows } : null;
                      })
                    }
                  >
                    Remove
                  </AppButton>
                </View>
              ))}
            </ScrollView>
            <View style={styles.assignActions}>
              <AppButton
                mode="outlined"
                onPress={() => setBatch(null)}
                disabled={!!busyKind}
              >
                Cancel
              </AppButton>
              <AppButton
                mode="contained"
                onPress={uploadBatch}
                loading={!!busyKind}
                disabled={!!busyKind || !(batch?.rows || []).length}
              >
                {`Upload ${batch?.rows?.length || 0}`}
              </AppButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {isMobilePortrait ? (
        <AppSheet
          visible={!!preview}
          onDismiss={closePreview}
          title={preview?.filename || "Data sheet"}
          snap
          scroll={false}
          footer={
            preview?.blob ? (
              <AppButton
                mode="contained"
                onPress={() =>
                  downloadBlob(preview.blob, preview.filename)
                }
              >
                Download
              </AppButton>
            ) : null
          }
        >
          {previewFrame}
        </AppSheet>
      ) : (
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
            <View
              style={[
                styles.previewBar,
                { backgroundColor: popupSurfaceColor(theme) },
              ]}
            >
              <Text
                style={[styles.previewTitle, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {preview?.filename || "Data sheet"}
              </Text>
              {preview?.blob ? (
                <AppButton
                  mode="outlined"
                  compact
                  onPress={() =>
                    downloadBlob(preview.blob, preview.filename)
                  }
                >
                  Download
                </AppButton>
              ) : null}
              <AppButton mode="contained" compact onPress={closePreview}>
                Close
              </AppButton>
            </View>
            {previewFrame}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space[4],
    gap: space[3],
  },
  wrapCompact: {
    marginTop: space[2],
  },
  wrapFlush: {
    marginTop: 0,
  },
  fileNamePress: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeTrigger: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  kindCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space[3],
    gap: space[2],
  },
  kindHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  kindTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  kindActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  empty: {
    fontSize: 13,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 48,
    paddingVertical: 6,
  },
  fileName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
  },
  fileActions: {
    flexDirection: "row",
    flexShrink: 0,
  },
  dropHit: {
    minHeight: 72,
    justifyContent: "center",
    paddingVertical: space[3],
  },
  dropHitSlim: {
    minHeight: 40,
    justifyContent: "center",
    paddingVertical: space[2],
  },
  swipeFile: {
    marginTop: 4,
  },
  previewFill: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  previewRoot: {
    flex: 1,
  },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
  },
  previewImage: {
    flex: 1,
    width: "100%",
  },
  assignOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  assignCard: {
    borderRadius: radius.md,
    padding: space[4],
    gap: space[3],
    maxHeight: "90%",
  },
  assignCardWide: {
    width: 640,
    maxWidth: "100%",
    alignSelf: "center",
  },
  assignTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  assignHint: {
    fontSize: 13,
    fontWeight: "600",
  },
  assignAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  assignList: {
    maxHeight: 360,
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 8,
    marginBottom: 8,
  },
  assignName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
  },
  assignActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
});
