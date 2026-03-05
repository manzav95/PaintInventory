import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  FlatList,
  Pressable,
  RefreshControl,
  Modal,
} from "react-native";
import {
  Card,
  Text,
  TextInput,
  Button,
  Title,
  useTheme,
  Dialog,
  Portal,
  ActivityIndicator,
  IconButton,
} from "react-native-paper";
import MaterialUsageService, { BOOTH_OPTIONS, CATALYST_PERCENT } from "../services/materialUsageService";

function formatDateForInput(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeForInput(d) {
  const date = d instanceof Date ? d : new Date(d);
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatTimeDisplay(t) {
  if (!t || typeof t !== "string") return t || "—";
  const s = t.trim();
  const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = match24[2];
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${h12}:${m} ${ampm}`;
  }
  return s;
}

export default function MaterialUsageScreen({ inventory = [], userName, onBack }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= 700;

  const now = useMemo(() => new Date(), []);
  const [entryDate, setEntryDate] = useState(() => formatDateForInput(now));
  const [entryTime, setEntryTime] = useState(() => formatTimeForInput(now));
  const [jobName, setJobName] = useState("");
  const [colorQuery, setColorQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showColorList, setShowColorList] = useState(false);
  const [qty, setQty] = useState("");
  const [booth, setBooth] = useState(BOOTH_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [catalyzedDialogVisible, setCatalyzedDialogVisible] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [boothFilter, setBoothFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const catalystOz = useMemo(() => {
    const n = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(n) || n < 0) return 0;
    return Math.round((n * (CATALYST_PERCENT / 100) * 128) * 100) / 100;
  }, [qty]);

  const filteredInventory = useMemo(() => {
    const q = (colorQuery || "").trim().toLowerCase();
    if (!q) return inventory.slice(0, 50);
    return inventory.filter(
      (i) => (i.name || "").toLowerCase().includes(q) || (i.id || "").toLowerCase().includes(q)
    ).slice(0, 50);
  }, [inventory, colorQuery]);

  const filteredLogs = useMemo(() => {
    if (!boothFilter || boothFilter === "all") return logs;
    return logs.filter((l) => l.booth === boothFilter);
  }, [logs, boothFilter]);

  const loadLogs = async () => {
    try {
      const boothParam = boothFilter === "all" ? null : boothFilter;
      const list = await MaterialUsageService.list(boothParam, 500);
      setLogs(list);
    } catch (e) {
      console.error("Material usage list:", e);
    } finally {
      setLogsLoaded(true);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [boothFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const handleSubmit = () => {
    const job = (jobName || "").trim();
    if (!job) return;
    if (!selectedItem) return;
    const rawQty = parseFloat(String(qty).replace(/,/g, ""), 10);
    if (isNaN(rawQty) || rawQty <= 0) return;
    const qtyNum = Math.round(rawQty * 4) / 4;
    const catOz = Math.round((qtyNum * (CATALYST_PERCENT / 100) * 128) * 100) / 100;
    setPendingEntry({
      entry_date: entryDate,
      entry_time: entryTime,
      job_name: job,
      item_id: selectedItem.id,
      color_name: selectedItem.name || selectedItem.id,
      qty_gallons: qtyNum,
      catalyst_oz: catOz,
      booth,
      user_name: userName || "unknown",
    });
    setCatalyzedDialogVisible(true);
  };

  const handleCatalyzed = async (confirmed) => {
    if (!pendingEntry) {
      setCatalyzedDialogVisible(false);
      setPendingEntry(null);
      return;
    }
    if (!confirmed) {
      setCatalyzedDialogVisible(false);
      setPendingEntry(null);
      return;
    }
    setSubmitting(true);
    try {
      await MaterialUsageService.create({ ...pendingEntry, catalyzed_confirmed: true });
      setJobName("");
      setSelectedItem(null);
      setColorQuery("");
      setQty("");
      setEntryDate(formatDateForInput(new Date()));
      setEntryTime(formatTimeForInput(new Date()));
      await loadLogs();
    } catch (e) {
      console.error("Submit material usage:", e);
    } finally {
      setSubmitting(false);
      setPendingEntry(null);
      setCatalyzedDialogVisible(false);
    }
  };

  const canSubmit = (jobName || "").trim() && selectedItem && parseFloat(String(qty).replace(/,/g, ""), 10) > 0 && booth;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Button icon="arrow-left" onPress={onBack} mode="text">
            Back
          </Button>
        </View>
        <View style={styles.headerCenter}>
          <Title style={styles.title}>Material Usage</Title>
          <Text style={styles.subtitle}>Air quality / permit tracking</Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="refresh"
            size={24}
            onPress={() => {
              setRefreshing(true);
              loadLogs();
            }}
            iconColor={theme.colors.primary}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />
        }
      >
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>Log mix</Title>
            <View style={styles.row}>
              <TextInput
                label="Date"
                value={entryDate}
                onChangeText={setEntryDate}
                mode="outlined"
                style={styles.halfInput}
                placeholder="YYYY-MM-DD"
              />
              <TextInput
                label="Time"
                value={entryTime}
                onChangeText={setEntryTime}
                mode="outlined"
                style={styles.halfInput}
                placeholder="e.g. 3:00 PM"
              />
            </View>
            <TextInput
              label="Job name"
              value={jobName}
              onChangeText={setJobName}
              mode="outlined"
              style={styles.input}
              placeholder="e.g. Smith kitchen"
            />
            <View style={styles.colorSection}>
              <TextInput
                label="Color"
                value={selectedItem ? selectedItem.name || selectedItem.id : colorQuery}
                onChangeText={(t) => {
                  setColorQuery(t);
                  if (selectedItem) setSelectedItem(null);
                  setShowColorList(true);
                }}
                onFocus={() => setShowColorList(true)}
                mode="outlined"
                style={styles.input}
                placeholder="Search color from inventory"
                right={selectedItem ? <TextInput.Icon icon="close" onPress={() => { setSelectedItem(null); setColorQuery(""); }} /> : null}
              />
            </View>
            <Modal
              visible={showColorList}
              transparent
              animationType="fade"
              onRequestClose={() => setShowColorList(false)}
            >
              <Pressable style={styles.colorModalOverlay} onPress={() => setShowColorList(false)}>
                <Pressable style={[styles.colorModalContent, { backgroundColor: theme.colors.surface }]} onPress={(e) => e.stopPropagation()}>
                  <Text style={styles.colorModalTitle}>Choose color</Text>
                  <TextInput
                    mode="outlined"
                    placeholder="Search..."
                    value={colorQuery}
                    onChangeText={(t) => {
                      setColorQuery(t);
                      if (selectedItem) setSelectedItem(null);
                    }}
                    style={styles.colorModalSearch}
                    autoFocus
                  />
                  <FlatList
                    data={filteredInventory}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    style={styles.colorListInner}
                    nestedScrollEnabled
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          setSelectedItem(item);
                          setColorQuery("");
                          setShowColorList(false);
                        }}
                        style={({ pressed }) => [styles.colorRow, pressed && styles.colorRowPressed]}
                      >
                        <Text numberOfLines={1} style={styles.colorRowText}>{item.name || item.id}</Text>
                      </Pressable>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyList}>No matching colors</Text>}
                  />
                  <Button mode="outlined" onPress={() => setShowColorList(false)} style={styles.colorModalClose}>
                    Cancel
                  </Button>
                </Pressable>
              </Pressable>
            </Modal>
            <View style={styles.row}>
              <TextInput
                label="Qty (gal)"
                value={qty}
                onChangeText={setQty}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.halfInput}
                placeholder="0.25 increments"
              />
              <View style={[styles.halfInput, styles.catalystDisplay]}>
                <Text style={styles.catalystLabel}>Catalyst (4%)</Text>
                <Text style={styles.catalystValue}>{catalystOz} oz</Text>
              </View>
            </View>
            <Text style={styles.statLabel}>Booth</Text>
            <View style={styles.buttonRow}>
              {BOOTH_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  mode={booth === opt.value ? "contained" : "outlined"}
                  onPress={() => setBooth(opt.value)}
                  style={styles.filterButton}
                >
                  {opt.label}
                </Button>
              ))}
            </View>
            <Button
              mode="contained"
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              loading={submitting}
              style={styles.submitBtn}
              icon="send"
            >
              Submit mix
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.cardTitle}>Transaction log</Title>
            <Text style={styles.statLabel}>Filter by booth</Text>
            <View style={styles.buttonRow}>
              {["all", "Booth 1&3", "Booth 2", "Booth 4"].map((bf) => (
                <Button
                  key={bf}
                  mode={boothFilter === bf ? "contained" : "outlined"}
                  onPress={() => setBoothFilter(bf)}
                  style={styles.filterButton}
                >
                  {bf === "all" ? "All" : bf}
                </Button>
              ))}
            </View>
            {!logsLoaded ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : filteredLogs.length === 0 ? (
              <Text style={styles.emptyLogs}>No entries</Text>
            ) : isDesktop ? (
              <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, styles.thDate]}>Date</Text>
                    <Text style={[styles.th, styles.thTime]}>Time</Text>
                    <Text style={[styles.th, styles.thJob]}>Job</Text>
                    <Text style={[styles.th, styles.thColor]}>Color</Text>
                    <Text style={[styles.th, styles.thQty]}>Qty</Text>
                    <Text style={[styles.th, styles.thCat]}>Cat (oz)</Text>
                    <Text style={[styles.th, styles.thBooth]}>Booth</Text>
                    <Text style={[styles.th, styles.thCatalyzed]}>Catalyzed</Text>
                  </View>
                  {filteredLogs.slice(0, 200).map((row) => (
                    <View key={row.id} style={styles.tableRow}>
                      <Text style={[styles.td, styles.thDate]} numberOfLines={1}>{row.entry_date}</Text>
                      <Text style={[styles.td, styles.thTime]} numberOfLines={1}>{formatTimeDisplay(row.entry_time)}</Text>
                      <Text style={[styles.td, styles.thJob]} numberOfLines={1}>{row.job_name || "—"}</Text>
                      <Text style={[styles.td, styles.thColor]} numberOfLines={1}>{row.color_name || "—"}</Text>
                      <Text style={[styles.td, styles.thQty]}>{row.qty_gallons}</Text>
                      <Text style={[styles.td, styles.thCat]}>{row.catalyst_oz != null ? Number(row.catalyst_oz).toFixed(2) : (row.catalyst_gallons != null ? (Number(row.catalyst_gallons) * 128).toFixed(2) : "—")}</Text>
                      <Text style={[styles.td, styles.thBooth]} numberOfLines={1}>{row.booth}</Text>
                      <Text style={[styles.td, styles.thCatalyzed]}>{row.catalyzed_confirmed ? "Yes" : "No"}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.logCardList}>
                {filteredLogs.slice(0, 200).map((row) => (
                  <View key={row.id} style={styles.logCard}>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Date</Text>
                      <Text style={styles.logCardValue}>{row.entry_date}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Time</Text>
                      <Text style={styles.logCardValue}>{formatTimeDisplay(row.entry_time)}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Job</Text>
                      <Text style={styles.logCardValue} numberOfLines={1}>{row.job_name || "—"}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Color</Text>
                      <Text style={styles.logCardValue} numberOfLines={1}>{row.color_name || "—"}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Qty</Text>
                      <Text style={styles.logCardValue}>{row.qty_gallons} gal</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Cat (oz)</Text>
                      <Text style={styles.logCardValue}>{row.catalyst_oz != null ? Number(row.catalyst_oz).toFixed(2) : (row.catalyst_gallons != null ? (Number(row.catalyst_gallons) * 128).toFixed(2) : "—")}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Booth</Text>
                      <Text style={styles.logCardValue}>{row.booth}</Text>
                    </View>
                    <View style={styles.logCardRow}>
                      <Text style={styles.logCardLabel}>Catalyzed</Text>
                      <Text style={styles.logCardValue}>{row.catalyzed_confirmed ? "Yes" : "No"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={catalyzedDialogVisible} onDismiss={() => setCatalyzedDialogVisible(false)} style={styles.catalystDialog}>
          <Dialog.Title>Catalyst confirmation</Dialog.Title>
          <Dialog.Content>
            <Text>Was this batch catalyzed?</Text>
            <Text style={styles.catalystDialogSubtext}>4% mixing ratio</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button mode="outlined" onPress={() => handleCatalyzed(false)} style={styles.dialogButton}>
              No
            </Button>
            <Button mode="contained" onPress={() => handleCatalyzed(true)} style={styles.dialogButton}>
              Yes
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 8 : 40,
    paddingBottom: 8,
  },
  headerLeft: {
    minWidth: 80,
    alignItems: "flex-start",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    minWidth: 80,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  scrollContentDesktop: {
    maxWidth: 900,
    alignSelf: "center",
    width: "100%",
  },
  card: {
    marginBottom: 24,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  halfInput: {
    flex: 1,
  },
  input: {
    marginBottom: 12,
  },
  colorSection: {
    marginBottom: 12,
  },
  colorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  colorModalContent: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 8,
    padding: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  colorModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  colorModalSearch: {
    marginBottom: 12,
  },
  colorModalClose: {
    marginTop: 12,
  },
  colorListInner: {
    maxHeight: 220,
  },
  colorRow: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  colorRowPressed: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  colorRowText: {
    fontSize: 15,
  },
  emptyList: {
    padding: 12,
    color: "#888",
    fontSize: 14,
  },
  catalystDisplay: {
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  catalystLabel: {
    fontSize: 12,
    color: "#666",
  },
  catalystValue: {
    fontSize: 18,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  filterButton: {
    marginRight: 0,
    marginBottom: 0,
  },
  submitBtn: {
    marginTop: 8,
    marginBottom: 15,
    paddingVertical: 8,
  },
  catalystDialog: {
    alignSelf: "center",
    maxWidth: 320,
    width: "100%",
  },
  catalystDialogSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: "#666",
  },
  dialogButton: {
    marginLeft: 8,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },
  emptyLogs: {
    padding: 24,
    color: "#888",
    fontSize: 14,
  },
  logCardList: {
    gap: 12,
  },
  logCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  logCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  logCardLabel: {
    fontSize: 12,
    color: "#666",
    marginRight: 8,
  },
  logCardValue: {
    fontSize: 14,
    flex: 1,
    textAlign: "right",
  },
  tableWrap: {
    maxHeight: 400,
  },
  table: {
    minWidth: 720,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  th: {
    fontWeight: "600",
    fontSize: 12,
  },
  td: {
    fontSize: 13,
  },
  thDate: { width: 90 },
  thTime: { width: 55 },
  thJob: { width: 100 },
  thColor: { width: 120 },
  thQty: { width: 50 },
  thCat: { width: 58 },
  thBooth: { width: 75 },
  thCatalyzed: { width: 70 },
});
