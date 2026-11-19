import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
} from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";
import PageHeader from "../components/PageHeader";
import AppButton from "../components/ui/AppButton";
import SwipeableRow from "../components/ui/SwipeableRow";
import { useAppLayout } from "../utils/layout";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import SafetyDocsPanel from "../components/SafetyDocsPanel";
import ItemDocService from "../services/itemDocService";
import { SAFETY_DOC_TYPE_OPTIONS } from "../utils/materialTypes";
import {
  extraDocItemId,
  EMPTY_KIND_COUNTS,
  SAFETY_DOC_KINDS,
} from "../utils/safetyDocKinds";
import { nestedSurfaceColor, popupSurfaceColor } from "../utils/themeColors";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import { space, radius } from "../theme/tokens";

const GRID_GAP = 8;
const MIN_BOX = 112;
const DEFAULT_TYPE = SAFETY_DOC_TYPE_OPTIONS[0]?.value || "paint";

function countLine(counts) {
  const row = counts || EMPTY_KIND_COUNTS;
  const parts = SAFETY_DOC_KINDS.filter((k) => Number(row[k.key]) > 0).map(
    (k) => k.label,
  );
  return parts.length ? parts.join(" · ") : "None yet";
}

function itemLabel(item) {
  const name = String(item?.name || item?.id || "").trim();
  const color = String(item?.color_label || "").trim();
  if (color && color !== name) return `${name} · ${color}`;
  return name || item?.id || "Item";
}

export default function DataSheetsScreen({
  isAdmin = false,
  inventory = [],
  embeddedInShell = false,
  onBack,
}) {
  const theme = useTheme();
  const { isMobilePortrait } = useAppLayout();
  const [counts, setCounts] = useState({});
  const [extras, setExtras] = useState([]);
  const [linkedItems, setLinkedItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [gridW, setGridW] = useState(0);
  const [selected, setSelected] = useState({
    kind: "type",
    itemType: DEFAULT_TYPE,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [pickedInventory, setPickedInventory] = useState(null);
  const [saving, setSaving] = useState(false);

  const cols = Math.max(
    1,
    Math.floor((gridW + GRID_GAP) / (MIN_BOX + GRID_GAP)) || 1,
  );
  const boxW = gridW > 0 ? (gridW - GRID_GAP * (cols - 1)) / cols : MIN_BOX;

  const loadSummary = useCallback(async () => {
    try {
      const data = await ItemDocService.summary();
      setCounts(data.counts || {});
      setExtras(data.extras || []);
      setLinkedItems(data.items || []);
    } catch {
      setCounts({});
      setExtras([]);
      setLinkedItems([]);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const matches = useMemo(() => {
    const q = String(addQuery || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(inventory) ? inventory : [];
    if (!q) return list.slice(0, 12);
    return list
      .filter((item) => {
        const hay = `${item.name || ""} ${item.id || ""} ${item.color_label || ""} ${item.type || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [inventory, addQuery]);

  const openAdd = () => {
    setAddName("");
    setAddQuery("");
    setPickedInventory(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (pickedInventory?.id) {
      setAddOpen(false);
      setSelected({
        kind: "item",
        itemId: String(pickedInventory.id),
        title: itemLabel(pickedInventory),
      });
      return;
    }
    const name = String(addName || "").trim();
    if (!name) {
      showToast({ type: "error", title: "Required", message: "Enter a name." });
      return;
    }
    setSaving(true);
    try {
      const data = await ItemDocService.createExtra(name);
      setAddOpen(false);
      await loadSummary();
      const extra = data.extra;
      setSelected({
        kind: "extra",
        extraId: extra?.id,
        itemId: extraDocItemId(extra.id),
        title: extra?.name || name,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not add",
        message: e?.message || "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeExtra = async (extra) => {
    const ok = await confirmAction(
      "Remove item",
      `Remove ${extra.name} and its files from Data sheets?`,
      { confirmLabel: "Remove", destructive: true },
    );
    if (!ok) return;
    try {
      await ItemDocService.deleteExtra(extra.id);
      if (
        selected.kind === "extra" &&
        String(selected.extraId) === String(extra.id)
      ) {
        setSelected({ kind: "type", itemType: DEFAULT_TYPE });
      }
      await loadSummary();
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not remove",
        message: e?.message || "Try again.",
      });
    }
  };

  const isTypeSelected = (value) =>
    selected.kind === "type" && selected.itemType === value;
  const isExtraSelected = (extra) =>
    selected.kind === "extra" && String(selected.extraId) === String(extra.id);
  const isItemSelected = (item) =>
    selected.kind === "item" && String(selected.itemId) === String(item.itemId);

  const renderCard = (key, label, meta, active, onPress, onLongPress) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={isAdmin ? onLongPress : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[
        styles.chip,
        {
          width: boxW,
          backgroundColor: active
            ? theme.colors.primaryContainer
            : nestedSurfaceColor(theme),
          borderColor: active
            ? theme.colors.primary
            : theme.colors.outlineVariant,
        },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          {
            color: active
              ? theme.colors.onPrimaryContainer
              : theme.colors.onSurface,
          },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.chipMeta,
          {
            color: active
              ? theme.colors.onPrimaryContainer
              : theme.colors.onSurfaceVariant,
          },
        ]}
        numberOfLines={1}
      >
        {countLine(meta)}
      </Text>
    </Pressable>
  );

  const selectedTitle =
    selected.kind === "type"
      ? SAFETY_DOC_TYPE_OPTIONS.find((o) => o.value === selected.itemType)
          ?.label || "Files"
      : selected.title || "Files";

  const selectedItemId =
    selected.kind === "extra"
      ? extraDocItemId(selected.extraId)
      : selected.itemId;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <PageHeader
          title="Data sheets"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />
        <View
          style={styles.chipWrap}
          onLayout={(e) => {
            const next = Math.round(e.nativeEvent.layout.width);
            if (next && next !== gridW) setGridW(next);
          }}
        >
          {SAFETY_DOC_TYPE_OPTIONS.map((option) =>
            renderCard(
              option.value,
              option.label,
              counts[option.value],
              isTypeSelected(option.value),
              () =>
                setSelected({ kind: "type", itemType: option.value }),
            ),
          )}
        </View>

        <View style={styles.sectionHead}>
          <Text
            style={[styles.overviewTitle, { color: theme.colors.onSurface }]}
          >
            {selectedTitle}
          </Text>
          {selected.kind === "extra" && isAdmin ? (
            <AppButton
              mode="outlined"
              compact
              textColor={theme.colors.error}
              onPress={() => {
                const extra = extras.find(
                  (row) => String(row.id) === String(selected.extraId),
                );
                if (extra) removeExtra(extra);
              }}
            >
              Remove
            </AppButton>
          ) : null}
        </View>
        {selected.kind === "type" ? (
          <SafetyDocsPanel
            key={`type-${selected.itemType}`}
            scope="type"
            itemType={selected.itemType}
            isAdmin={isAdmin}
            hideTypePicker
            hideTitle
            kindCounts={counts[selected.itemType]}
            onChanged={loadSummary}
          />
        ) : (
          <SafetyDocsPanel
            key={`item-${selectedItemId}`}
            scope="item"
            itemId={selectedItemId}
            isAdmin={isAdmin}
            hideTitle
            onChanged={loadSummary}
          />
        )}

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Other
          </Text>
          {isAdmin ? (
            <AppButton mode="contained" compact icon="plus" onPress={openAdd}>
              Add item
            </AppButton>
          ) : null}
        </View>
        <View style={styles.chipWrap}>
          {extras.map((extra) => {
            const card = renderCard(
              `extra-${extra.id}`,
              extra.name,
              extra.counts,
              isExtraSelected(extra),
              () =>
                setSelected({
                  kind: "extra",
                  extraId: extra.id,
                  itemId: extraDocItemId(extra.id),
                  title: extra.name,
                }),
              () => removeExtra(extra),
            );
            if (!isAdmin || !isMobilePortrait) return card;
            return (
              <SwipeableRow
                key={`extra-swipe-${extra.id}`}
                style={{ width: boxW }}
                leftAction={{
                  key: "delete",
                  label: "Delete",
                  tone: "danger",
                  onPress: () => removeExtra(extra),
                }}
              >
                {card}
              </SwipeableRow>
            );
          })}
          {linkedItems.map((item) =>
            renderCard(
              `item-${item.itemId}`,
              item.name,
              item.counts,
              isItemSelected(item),
              () =>
                setSelected({
                  kind: "item",
                  itemId: String(item.itemId),
                  title: item.name,
                }),
            ),
          )}
          {!extras.length && !linkedItems.length ? (
            <Text
              style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}
            >
              {isAdmin
                ? "Add MAK, retarder, pump liquid, or link an inventory item."
                : "No extra sheets yet."}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setAddOpen(false)}>
          <Pressable
            style={[
              styles.addCard,
              { backgroundColor: popupSurfaceColor(theme) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.addTitle, { color: theme.colors.onSurface }]}>
              Add data sheet item
            </Text>
            <TextInput
              mode="outlined"
              label="Name"
              value={pickedInventory ? itemLabel(pickedInventory) : addName}
              onChangeText={(t) => {
                setPickedInventory(null);
                setAddName(t);
              }}
              placeholder="MAK, Topcoat Retarder…"
            />
            <Text
              style={[styles.addHint, { color: theme.colors.onSurfaceVariant }]}
            >
              Or pick an inventory item to link sheets to it.
            </Text>
            <OutlinedSearchInput
              value={addQuery}
              onChangeText={setAddQuery}
              placeholder="Search inventory"
            />
            <ScrollView style={styles.matchList}>
              {matches.map((item) => {
                const active =
                  pickedInventory &&
                  String(pickedInventory.id) === String(item.id);
                return (
                  <Pressable
                    key={String(item.id)}
                    onPress={() => {
                      setPickedInventory(item);
                      setAddName(itemLabel(item));
                    }}
                    style={[
                      styles.matchRow,
                      {
                        backgroundColor: active
                          ? theme.colors.primaryContainer
                          : nestedSurfaceColor(theme),
                        borderColor: active
                          ? theme.colors.primary
                          : theme.colors.outlineVariant,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active
                          ? theme.colors.onPrimaryContainer
                          : theme.colors.onSurface,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {itemLabel(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.addActions}>
              <AppButton mode="outlined" onPress={() => setAddOpen(false)}>
                Cancel
              </AppButton>
              <AppButton
                mode="contained"
                onPress={submitAdd}
                loading={saving}
                disabled={saving}
              >
                {pickedInventory ? "Link item" : "Add"}
              </AppButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: space[4],
    paddingBottom: 48,
    gap: space[3],
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
    width: "100%",
    alignSelf: "stretch",
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 64,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  chipMeta: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  overviewTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: space[1],
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space[2],
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  empty: {
    fontSize: 13,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  addCard: {
    borderRadius: radius.md,
    padding: space[4],
    gap: space[3],
    width: 440,
    maxWidth: "100%",
    maxHeight: "90%",
    alignSelf: "center",
  },
  addTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  addHint: {
    fontSize: 13,
  },
  matchList: {
    maxHeight: 220,
  },
  matchRow: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  addActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
});
