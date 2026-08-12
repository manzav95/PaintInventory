import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { Text, IconButton, Divider, useTheme } from "react-native-paper";

const PANEL_WIDTH = 280;

function MenuRow({ title, detail, trailing, onPress, theme }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && {
          backgroundColor: theme.dark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.04)",
        },
      ]}
    >
      <View style={styles.menuRowText}>
        <Text style={[styles.menuTitle, { color: theme.colors.onSurface }]}>
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.menuDetail,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/**
 * Caret popup (same idea as NotificationsBell) for inventory item actions.
 * Custom: Related jobs + Transactions (+ Edit for admin).
 * Standard admin: Transactions + Edit.
 */
export default function ItemActionPopover({
  visible,
  anchor = { pageX: 0, pageY: 0 },
  itemName,
  jobs = [],
  showRelatedJobs = true,
  showEditDetails = false,
  onClose,
  onViewTransactions,
  onEditDetails,
}) {
  const theme = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [view, setView] = useState("menu"); // 'menu' | 'jobs'

  useEffect(() => {
    if (visible) setView("menu");
  }, [visible]);

  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, windowWidth - 16));
  const jobCount = Array.isArray(jobs) ? jobs.length : 0;

  const panelPos = useMemo(() => {
    const gap = 10;
    const caretSize = 10;
    const margin = 8;
    const x = Number(anchor?.pageX) || windowWidth / 2;
    const y = Number(anchor?.pageY) || 80;

    let estimate = 56 + 16; // header + padding
    if (showRelatedJobs) estimate += 68;
    estimate += 68; // transactions
    if (showEditDetails) estimate += 68;
    const preferredHeight = Math.min(360, estimate);

    const spaceBelow = windowHeight - y - margin;
    const spaceAbove = y - margin;
    const placement =
      spaceBelow < preferredHeight && spaceAbove > spaceBelow
        ? "above"
        : "below";
    const available = placement === "above" ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(
      140,
      Math.min(360, available - gap - caretSize),
    );

    const preferredLeft = x - panelWidth / 2;
    const left = Math.max(
      margin,
      Math.min(preferredLeft, windowWidth - panelWidth - margin),
    );
    const caretLeft = Math.max(
      12,
      Math.min(x - left - caretSize, panelWidth - 24),
    );

    if (placement === "above") {
      return {
        placement,
        top: undefined,
        bottom: Math.max(margin, windowHeight - y + gap),
        left,
        caretLeft,
        maxHeight,
      };
    }
    return {
      placement,
      top: Math.max(margin + caretSize, y + gap),
      bottom: undefined,
      left,
      caretLeft,
      maxHeight,
    };
  }, [
    anchor?.pageX,
    anchor?.pageY,
    panelWidth,
    windowWidth,
    windowHeight,
    showRelatedJobs,
    showEditDetails,
  ]);

  const close = () => {
    setView("menu");
    onClose?.();
  };

  if (!visible) return null;

  const menuRows = [];
  if (showRelatedJobs) {
    menuRows.push(
      <MenuRow
        key="jobs"
        theme={theme}
        title="Related jobs"
        detail={
          jobCount === 0
            ? "No job numbers yet"
            : jobCount === 1
              ? "1 job number"
              : `${jobCount} job numbers`
        }
        onPress={() => setView("jobs")}
        trailing={
          <View
            style={[
              styles.countPill,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text style={styles.countPillText}>{jobCount}</Text>
          </View>
        }
      />,
    );
  }
  menuRows.push(
    <MenuRow
      key="transactions"
      theme={theme}
      title="Transactions"
      detail="View check-in / check-out history"
      onPress={() => {
        close();
        onViewTransactions?.();
      }}
    />,
  );
  if (showEditDetails) {
    menuRows.push(
      <MenuRow
        key="edit"
        theme={theme}
        title="Edit item details"
        detail="Open item settings"
        onPress={() => {
          close();
          onEditDetails?.();
        }}
      />,
    );
  }

  const above = panelPos.placement === "above";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.panelAnchor,
            {
              left: panelPos.left,
              width: panelWidth,
              pointerEvents: "box-none",
              ...(above
                ? { bottom: panelPos.bottom }
                : { top: panelPos.top }),
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
                    borderBottomColor: theme.colors.surfaceContainerHighest,
                  },
                ]}
              />
            </>
          ) : null}
          <View
            style={[
              styles.panel,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
                maxHeight: panelPos.maxHeight,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              {view === "jobs" ? (
                <IconButton
                  icon="arrow-left"
                  size={18}
                  onPress={() => setView("menu")}
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
                {view === "jobs" ? "Related jobs" : itemName || "Item"}
              </Text>
              <IconButton
                icon="close"
                size={18}
                onPress={close}
                style={styles.headerBtn}
                accessibilityLabel="Close"
              />
            </View>

            {view === "menu" ? (
              <View style={styles.menuList}>
                {menuRows.map((row, idx) => (
                  <React.Fragment key={row.key || idx}>
                    {idx > 0 ? <Divider /> : null}
                    {row}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <ScrollView
                style={styles.jobsScroll}
                contentContainerStyle={styles.jobsContent}
                keyboardShouldPersistTaps="handled"
              >
                {jobCount === 0 ? (
                  <Text
                    style={[
                      styles.emptyJobs,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    No related job numbers for this item.
                  </Text>
                ) : (
                  jobs.map((job, idx) => (
                    <View key={`${job}-${idx}`}>
                      {idx > 0 ? <Divider /> : null}
                      <View style={styles.jobRow}>
                        <Text
                          style={[
                            styles.jobText,
                            { color: theme.colors.onSurface },
                          ]}
                        >
                          {job}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
          {above ? (
            <>
              <View
                style={[
                  styles.caretDownInner,
                  {
                    left: panelPos.caretLeft + 1,
                    borderTopColor: theme.colors.surfaceContainerHighest,
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
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  panelAnchor: {
    position: "absolute",
  },
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
    paddingHorizontal: 0,
    marginBottom: 4,
    minHeight: 36,
  },
  headerBtn: {
    margin: 0,
  },
  headerBtnSpacer: {
    width: 34,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  menuList: {
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  menuRowText: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  menuDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  countPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  countPillText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  jobsScroll: {
    maxHeight: 260,
  },
  jobsContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  emptyJobs: {
    fontSize: 13,
    paddingVertical: 16,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  jobRow: {
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  jobText: {
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
