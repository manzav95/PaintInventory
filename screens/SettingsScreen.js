import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
  Pressable,
} from "react-native";
import {
  Text,
  Button,
  Switch,
  Divider,
  useTheme,
  TextInput,
  ActivityIndicator,
  SegmentedButtons,
  Menu,
} from "react-native-paper";
import PageHeader from "../components/PageHeader";
import version from "../version";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import InventoryService from "../services/inventoryService";
import UserService from "../services/userService";
import MaterialUsageService from "../services/materialUsageService";
import LoginHistoryModal from "../components/LoginHistoryModal";
import { AppSurface, AppText } from "../components/ui";
import { colors, fontFamily, space, radius } from "../theme/tokens";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatGal(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} gal`;
}

function formatMonthLabel(ym, totalGal) {
  const [y, m] = String(ym || "").split("-");
  const monthIdx = Math.max(0, (parseInt(m, 10) || 1) - 1);
  const name = MONTH_NAMES[monthIdx] || ym;
  return `${name} ${y} · ${formatGal(totalGal)}`;
}

function formatYearLabel(year, totalGal) {
  return `${year} · ${formatGal(totalGal)}`;
}

/** Inclusive YYYY-MM-DD range for a calendar month key (YYYY-MM). */
function rangeForMonth(ym) {
  const [ys, ms] = String(ym || "").split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m || m < 1 || m > 12) return null;
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ys}-${ms}-01`,
    to: `${ys}-${ms}-${String(last).padStart(2, "0")}`,
  };
}

/** Inclusive YYYY-MM-DD range for a calendar year. */
function rangeForYear(year) {
  const y = String(year || "").trim();
  if (!/^\d{4}$/.test(y)) return null;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export default function SettingsScreen({
  onBack,
  userName,
  isDarkMode,
  onToggleDarkMode,
  onSwitchUser,
  isAdmin,
  materialUsageOvertime = false,
  onSetMaterialUsageOvertime,
  onExportExcel,
  onExportMaterialUsageExcel,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const [exportTab, setExportTab] = useState("month");
  const [exportMonths, setExportMonths] = useState([]);
  const [exportYears, setExportYears] = useState([]);
  const [exportPeriodsLoading, setExportPeriodsLoading] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [selectedYearKey, setSelectedYearKey] = useState("");
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [paintSuffix, setPaintSuffix] = useState("");
  const [savingSuffix, setSavingSuffix] = useState(false);
  const [loginHistoryOpen, setLoginHistoryOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const loadUsers = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const list = await UserService.list();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("Load users error:", e);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadExportPeriods = async () => {
    if (!isAdmin) return;
    setExportPeriodsLoading(true);
    try {
      let months = [];
      let years = [];
      try {
        const data = await MaterialUsageService.getExportPeriods();
        months = Array.isArray(data?.months) ? data.months : [];
        years = Array.isArray(data?.years) ? data.years : [];
      } catch (apiErr) {
        // Older servers / failed route — derive from recent usage rows.
        console.warn(
          "export-periods API unavailable, falling back to usage list:",
          apiErr?.message || apiErr,
        );
        const rows = await MaterialUsageService.list(null, 2000, {
          excludeAdmin: true,
        });
        const monthMap = new Map();
        const yearMap = new Map();
        for (const row of rows || []) {
          const d = String(row.entry_date || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
          const mk = d.slice(0, 7);
          const yk = d.slice(0, 4);
          const gal = Number(row.qty_gallons) || 0;
          const m = monthMap.get(mk) || { key: mk, entryCount: 0, totalGal: 0 };
          m.entryCount += 1;
          m.totalGal += gal;
          monthMap.set(mk, m);
          const y = yearMap.get(yk) || { key: yk, entryCount: 0, totalGal: 0 };
          y.entryCount += 1;
          y.totalGal += gal;
          yearMap.set(yk, y);
        }
        months = [...monthMap.values()]
          .map((m) => ({
            ...m,
            totalGal: Math.round(m.totalGal * 100) / 100,
          }))
          .sort((a, b) => b.key.localeCompare(a.key));
        years = [...yearMap.values()]
          .map((y) => ({
            ...y,
            totalGal: Math.round(y.totalGal * 100) / 100,
          }))
          .sort((a, b) => b.key.localeCompare(a.key));
      }

      setExportMonths(months);
      setExportYears(years);

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const currentYear = String(now.getFullYear());

      setSelectedMonthKey((prev) => {
        if (prev && months.some((m) => m.key === prev)) return prev;
        if (months.some((m) => m.key === currentMonth)) return currentMonth;
        return months[0]?.key || "";
      });
      setSelectedYearKey((prev) => {
        if (prev && years.some((y) => y.key === prev)) return prev;
        if (years.some((y) => y.key === currentYear)) return currentYear;
        return years[0]?.key || "";
      });
    } catch (e) {
      console.error("Load export periods error:", e);
      setExportMonths([]);
      setExportYears([]);
      showToast({
        type: "error",
        title: "Could not load export periods",
        message: e?.message || "Try refreshing Settings.",
      });
    } finally {
      setExportPeriodsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const suffix = await InventoryService.getPaintExternalSuffix();
        setPaintSuffix(suffix || "");
      } catch (e) {
        console.error("Load paint suffix error:", e);
      }
    })();
  }, []);

  useEffect(() => {
    loadUsers();
    loadExportPeriods();
  }, [isAdmin]);

  const selectedMonthLabel = useMemo(() => {
    const row = exportMonths.find((m) => m.key === selectedMonthKey);
    if (!row) return "Select month";
    return formatMonthLabel(row.key, row.totalGal);
  }, [exportMonths, selectedMonthKey]);

  const selectedYearLabel = useMemo(() => {
    const row = exportYears.find((y) => y.key === selectedYearKey);
    if (!row) return "Select year";
    return formatYearLabel(row.key, row.totalGal);
  }, [exportYears, selectedYearKey]);

  const handleExportMaterialUsage = () => {
    if (exportTab === "month") {
      const range = rangeForMonth(selectedMonthKey);
      if (!range) {
        showToast({
          type: "error",
          title: "Select a month",
          message: "Choose a month that has material usage to export.",
        });
        return;
      }
      onExportMaterialUsageExcel?.(range.from, range.to);
      return;
    }
    const range = rangeForYear(selectedYearKey);
    if (!range) {
      showToast({
        type: "error",
        title: "Select a year",
        message: "Choose a year that has material usage to export.",
      });
      return;
    }
    onExportMaterialUsageExcel?.(range.from, range.to);
  };

  const handleCreateUser = async () => {
    const name = newUserName.trim();
    if (!name) {
      showToast({
        type: "error",
        title: "Required",
        message: "Enter a user name.",
      });
      return;
    }
    setCreatingUser(true);
    try {
      const result = await UserService.create({
        userName: name,
      });
      if (!result?.success) {
        throw new Error(result?.error || "Could not create user");
      }
      setNewUserName("");
      showToast({
        title: "User created",
        message: `${name} signs in with password "password", then must set a new one.`,
      });
      await loadUsers();
    } catch (e) {
      showToast({
        type: "error",
        title: "Could not create user",
        message: e?.message || "Try a different name.",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (name) => {
    const ok = await confirmAction(
      "Delete user?",
      `Remove ${name} from the login list? This cannot be undone.`,
      { confirmLabel: "Delete", destructive: true },
    );
    if (!ok) return;
    try {
      await UserService.remove(name);
      await loadUsers();
      showToast({ title: "Deleted", message: `${name} removed.` });
    } catch (e) {
      showToast({
        type: "error",
        title: "Delete failed",
        message: e?.message || "Could not delete user.",
      });
    }
  };

  const handleResetPassword = async (name) => {
    const ok = await confirmAction(
      "Reset password?",
      `Set ${name}'s password back to "password"? They will be prompted to choose a new one on next login.`,
      { confirmLabel: "Reset" },
    );
    if (!ok) return;
    try {
      const result = await UserService.resetPassword(name);
      if (!result?.success) {
        throw new Error(result?.error || "Could not reset password");
      }
      await loadUsers();
      showToast({
        title: "Password reset",
        message: `${name} can sign in with "password", then must change it.`,
      });
    } catch (e) {
      showToast({
        type: "error",
        title: "Reset failed",
        message: e?.message || "Could not reset password.",
      });
    }
  };

  const canvasBg = theme.dark
    ? colors.dark.background
    : theme.colors.background;

  return (
    <View style={[styles.container, { backgroundColor: canvasBg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.webScrollContent,
        ]}
      >
        <PageHeader
          title="Settings"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />
        <View style={isDesktop && styles.webWrapper}>
          <AppSurface>
            <AppText variant="sectionTitle" style={styles.sectionTitle}>
              Appearance
            </AppText>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <AppText variant="bodyStrong">Dark Mode</AppText>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={onToggleDarkMode}
                color={theme.colors.primary}
              />
            </View>
          </AppSurface>

          <AppSurface>
            <AppText variant="sectionTitle" style={styles.sectionTitle}>
              Account
            </AppText>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <AppText variant="bodyStrong">Current User</AppText>
                <AppText
                  variant="caption"
                  tone="muted"
                  style={styles.settingDescription}
                >
                  Logged in as: {userName || "Unknown"}
                </AppText>
              </View>
            </View>
            <Divider
              style={[
                styles.divider,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
            <Button
              mode="outlined"
              onPress={onSwitchUser}
              style={styles.switchUserButton}
              icon="account-switch"
            >
              Switch User
            </Button>
          </AppSurface>

          {isAdmin && (
            <AppSurface>
              <AppText variant="sectionTitle" style={styles.sectionTitle}>
                User accounts
              </AppText>
              <AppText
                variant="caption"
                tone="muted"
                style={styles.settingDescription}
              >
                Create named accounts. Default password is "password"; on first
                login they must choose a new one. Reset sets it back to
                "password" and requires a change on next login. Current
                passwords are shown below for admin reference.
              </AppText>
              <TextInput
                label="New user name"
                value={newUserName}
                onChangeText={setNewUserName}
                mode="outlined"
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.userInput}
              />
              <Button
                mode="contained"
                onPress={handleCreateUser}
                loading={creatingUser}
                disabled={creatingUser || !newUserName.trim()}
                icon="account-plus"
                style={styles.userCreateBtn}
              >
                Create user
              </Button>
              {usersLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : users.length === 0 ? (
                <AppText
                  variant="caption"
                  tone="muted"
                  style={{ marginTop: 10 }}
                >
                  No users yet. Created accounts appear in the login dropdown.
                </AppText>
              ) : (
                <View style={styles.userList}>
                  {users.map((u) => (
                    <View key={u.id || u.user_name} style={styles.userRow}>
                      <View style={styles.userRowInfo}>
                        <AppText variant="bodyStrong">
                          {u.user_name}
                        </AppText>
                        <AppText
                          variant="caption"
                          tone="muted"
                          style={styles.userPasswordLine}
                        >
                          Password:{" "}
                          {u.password_plain
                            ? String(u.password_plain)
                            : "— (unknown until next change)"}
                          {u.must_change_password ? " · must change" : ""}
                        </AppText>
                      </View>
                      <View style={styles.userRowActions}>
                        <Button
                          mode="text"
                          compact
                          onPress={() => handleResetPassword(u.user_name)}
                        >
                          Reset
                        </Button>
                        <Button
                          mode="text"
                          compact
                          textColor={theme.colors.error}
                          onPress={() => handleDeleteUser(u.user_name)}
                        >
                          Delete
                        </Button>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </AppSurface>
          )}

          {isAdmin && (
            <AppSurface>
              <AppText variant="sectionTitle" style={styles.sectionTitle}>
                Admin Settings
              </AppText>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <AppText variant="bodyStrong">Overtime</AppText>
                  <AppText
                    variant="caption"
                    tone="muted"
                    style={styles.settingDescription}
                  >
                    Material Usage Overtime
                    {"\n"}On: Day 6:00am–4:25pm · Swing 4:26pm–2:30am
                    {"\n"}Off: Day 6:00am–3:25pm · Swing 3:26pm–12:30am
                  </AppText>
                </View>
                <Switch
                  value={materialUsageOvertime}
                  onValueChange={(v) => onSetMaterialUsageOvertime?.(v)}
                  color={theme.colors.primary}
                />
              </View>
              <Divider
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <AppText variant="caption" tone="muted" style={styles.blockHint}>
                View sign-in history for all users (timestamp per login).
              </AppText>
              <Button
                mode="outlined"
                onPress={() => setLoginHistoryOpen(true)}
                style={styles.adminButton}
                icon="account-clock"
              >
                User login history
              </Button>
              <Divider
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <AppText variant="caption" tone="muted" style={styles.blockHint}>
                Export current inventory to Excel file
              </AppText>
              <Button
                mode="outlined"
                onPress={onExportExcel}
                style={styles.adminButton}
                icon="file-excel"
              >
                Export inventory to Excel
              </Button>
              <Divider
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <AppText variant="caption" tone="muted" style={styles.blockHint}>
                Export Material Usage to Excel — by month or by year (only
                periods with logged quantity are listed).
              </AppText>
              <SegmentedButtons
                value={exportTab}
                onValueChange={setExportTab}
                style={styles.exportTabs}
                buttons={[
                  { value: "month", label: "Month" },
                  { value: "year", label: "Year" },
                ]}
              />
              {exportPeriodsLoading ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : exportTab === "month" ? (
                <Menu
                  visible={monthMenuOpen}
                  onDismiss={() => setMonthMenuOpen(false)}
                  anchor={
                    <Pressable onPress={() => setMonthMenuOpen(true)}>
                      <TextInput
                        label="Month"
                        value={selectedMonthLabel}
                        mode="outlined"
                        editable={false}
                        pointerEvents="none"
                        style={styles.adminInput}
                        right={<TextInput.Icon icon="menu-down" />}
                      />
                    </Pressable>
                  }
                  contentStyle={styles.exportMenuContent}
                >
                  {exportMonths.length === 0 ? (
                    <Menu.Item disabled title="No months with usage yet" />
                  ) : (
                    exportMonths.map((m) => (
                      <Menu.Item
                        key={m.key}
                        onPress={() => {
                          setSelectedMonthKey(m.key);
                          setMonthMenuOpen(false);
                        }}
                        title={formatMonthLabel(m.key, m.totalGal)}
                      />
                    ))
                  )}
                </Menu>
              ) : (
                <Menu
                  visible={yearMenuOpen}
                  onDismiss={() => setYearMenuOpen(false)}
                  anchor={
                    <Pressable onPress={() => setYearMenuOpen(true)}>
                      <TextInput
                        label="Year"
                        value={selectedYearLabel}
                        mode="outlined"
                        editable={false}
                        pointerEvents="none"
                        style={styles.adminInput}
                        right={<TextInput.Icon icon="menu-down" />}
                      />
                    </Pressable>
                  }
                  contentStyle={styles.exportMenuContent}
                >
                  {exportYears.length === 0 ? (
                    <Menu.Item disabled title="No years with usage yet" />
                  ) : (
                    exportYears.map((y) => (
                      <Menu.Item
                        key={y.key}
                        onPress={() => {
                          setSelectedYearKey(y.key);
                          setYearMenuOpen(false);
                        }}
                        title={formatYearLabel(y.key, y.totalGal)}
                      />
                    ))
                  )}
                </Menu>
              )}
              <Button
                mode="outlined"
                onPress={handleExportMaterialUsage}
                style={styles.adminButton}
                icon="file-excel"
                disabled={
                  exportPeriodsLoading ||
                  (exportTab === "month"
                    ? !selectedMonthKey
                    : !selectedYearKey)
                }
              >
                Export Material Usage to Excel
              </Button>
              <Divider
                style={[
                  styles.divider,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
              <AppText variant="bodyStrong">Paint external code suffix</AppText>
              <AppText
                variant="caption"
                tone="muted"
                style={styles.settingDescription}
              >
                Optional ending sequence automatically appended to Paint and
                Custom Paint IDs (for bucket barcodes). Example:{" "}
                <Text style={{ fontFamily: fontFamily.mono }}>-794394</Text>{" "}
                turns ID{" "}
                <Text style={{ fontFamily: fontFamily.mono }}>H66LNL49323</Text>{" "}
                into external code{" "}
                <Text style={{ fontFamily: fontFamily.mono }}>
                  H66LNL49323-794394
                </Text>
                .
              </AppText>
              <TextInput
                label="Suffix (optional)"
                value={paintSuffix}
                onChangeText={setPaintSuffix}
                mode="outlined"
                style={styles.adminInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder=""
                editable={!savingSuffix}
              />
              <Button
                mode="outlined"
                style={styles.adminButton}
                disabled={savingSuffix}
                onPress={async () => {
                  try {
                    setSavingSuffix(true);
                    const result =
                      await InventoryService.setPaintExternalSuffix(
                        paintSuffix,
                        userName || "unknown",
                      );
                    if (!result?.success) {
                      Alert.alert(
                        "Error",
                        result?.error || "Failed to save suffix.",
                      );
                    } else {
                      const confirmed =
                        await InventoryService.getPaintExternalSuffix();
                      setPaintSuffix(confirmed || "");
                      Alert.alert("Saved", "Paint external suffix updated.");
                    }
                  } catch (e) {
                    console.error("Save paint suffix error:", e);
                    Alert.alert(
                      "Error",
                      e?.message || "Failed to save suffix.",
                    );
                  } finally {
                    setSavingSuffix(false);
                  }
                }}
              >
                {savingSuffix ? "Saving..." : "Save Suffix"}
              </Button>
            </AppSurface>
          )}
          <View style={styles.footer}>
            <AppText variant="caption" tone="muted">
              Signed in as {userName || "Unknown"}
            </AppText>
            <AppText variant="caption" tone="dim" style={styles.footerVersion}>
              v1.{version?.build ?? "?"}
            </AppText>
          </View>
        </View>
      </ScrollView>
      {savingSuffix && (
        <View
          style={[
            styles.suffixSavingOverlay,
            { backgroundColor: colors.semantic.scrimLight },
          ]}
        >
          <View
            style={[
              styles.suffixSavingBox,
              {
                backgroundColor: theme.colors.surfaceContainerHighest,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <AppText variant="body" style={styles.suffixSavingText}>
              Saving suffix…
            </AppText>
          </View>
        </View>
      )}
      <LoginHistoryModal
        visible={loginHistoryOpen}
        onDismiss={() => setLoginHistoryOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: space[4],
    paddingTop: space[2],
    paddingBottom: space[8],
  },
  sectionTitle: {
    marginBottom: space[2],
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[2],
  },
  settingInfo: {
    flex: 1,
    marginRight: space[4],
  },
  settingDescription: {
    marginTop: space[1],
  },
  blockHint: {
    marginBottom: space[2],
  },
  divider: {
    marginVertical: space[4],
  },
  switchUserButton: {
    marginTop: space[2],
  },
  adminInput: {
    marginTop: space[2],
    marginBottom: space[3],
  },
  exportTabs: {
    marginBottom: space[2],
  },
  exportMenuContent: {
    maxHeight: 280,
  },
  adminButton: {
    marginTop: space[2],
  },
  userInput: {
    marginTop: space[2],
  },
  userCreateBtn: {
    marginTop: space[3],
  },
  userList: {
    marginTop: space[4],
    gap: space[1],
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  userRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  userRowActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  userPasswordLine: {
    marginTop: 2,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  webScrollContent: {
    alignItems: "center",
  },
  footer: {
    marginTop: space[6],
    marginBottom: space[4],
    alignItems: "center",
    gap: space[1],
  },
  footerVersion: {
    opacity: 0.85,
  },
  suffixSavingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  suffixSavingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  suffixSavingText: {
    marginLeft: space[1],
  },
});
