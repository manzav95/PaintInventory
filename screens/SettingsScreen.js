import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Switch,
  Divider,
  useTheme,
  TextInput,
  ActivityIndicator,
  SegmentedButtons,
  Menu,
  Icon,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
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

const PANEL = {
  root: { title: "Settings", parent: null },
  appearance: { title: "Appearance", parent: "root" },
  account: { title: "Account", parent: "root" },
  admin: { title: "Admin", parent: "root" },
  "admin-users": { title: "Users", parent: "admin" },
  "admin-export": { title: "Export", parent: "admin" },
  "admin-overtime": { title: "Overtime", parent: "admin" },
  "admin-zeros": { title: "Zero quantities", parent: "admin" },
  "admin-codes": { title: "External codes", parent: "admin" },
};

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

function SettingsMenuRow({
  icon,
  title,
  description,
  onPress,
  danger = false,
  selected = false,
  showChevron = true,
  compact = false,
}) {
  const theme = useTheme();
  const titleColor = danger
    ? theme.colors.error
    : selected
      ? theme.colors.primary
      : theme.colors.onSurface;
  const iconColor = danger
    ? theme.colors.error
    : selected
      ? theme.colors.primary
      : theme.colors.onSurfaceVariant;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        compact && styles.menuRowCompact,
        selected && {
          backgroundColor: theme.dark
            ? "rgba(255,255,255,0.1)"
            : "rgba(0,0,0,0.06)",
        },
        pressed &&
          !selected && {
            backgroundColor: theme.dark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
          },
      ]}
    >
      {icon ? (
        <Icon source={icon} size={compact ? 20 : 22} color={iconColor} />
      ) : (
        <View style={styles.menuIconSpacer} />
      )}
      <View style={styles.menuRowText}>
        <AppText variant="bodyStrong" style={{ color: titleColor }}>
          {title}
        </AppText>
        {description ? (
          <AppText
            variant="caption"
            tone="muted"
            style={styles.menuRowDescription}
          >
            {description}
          </AppText>
        ) : null}
      </View>
      {showChevron ? (
        <Icon
          source="chevron-right"
          size={22}
          color={theme.colors.onSurfaceVariant}
        />
      ) : null}
    </Pressable>
  );
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
  onZeroCustomQuantities,
  onZeroStaleCustomQuantities,
  embeddedInShell = false,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;
  const [panel, setPanel] = useState("root");
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

  // Desktop uses a persistent sidebar; land on a content panel (not a hub).
  useEffect(() => {
    if (!isDesktop) return;
    if (panel === "root" || panel === "admin") {
      setPanel("appearance");
    }
  }, [isDesktop, panel]);

  const panelMeta = PANEL[panel] || PANEL.root;
  const panelTitle = panelMeta.title;

  const goBackPanel = useCallback(() => {
    const parent = (PANEL[panel] || PANEL.root).parent;
    if (parent) {
      setPanel(parent);
      return;
    }
    onBack?.();
  }, [panel, onBack]);

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
    if (!isAdmin) {
      if (String(panel).startsWith("admin")) setPanel("root");
      return;
    }
    loadUsers();
    loadExportPeriods();
  }, [isAdmin]);

  useEffect(() => {
    if (panel === "admin-users" && isAdmin) loadUsers();
    if (panel === "admin-export" && isAdmin) loadExportPeriods();
  }, [panel, isAdmin]);

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

  const showPanelBack = !isDesktop && panel !== "root";
  const headerBack = showPanelBack ? goBackPanel : onBack;

  const renderDesktopSidebar = () => {
    const sideBg = theme.dark
      ? colors.dark.sidebar
      : theme.colors.surfaceContainerHighest;
    return (
      <View
        style={[
          styles.desktopSidebar,
          {
            backgroundColor: sideBg,
            borderRightColor: theme.dark
              ? colors.dark.border
              : theme.colors.outlineVariant,
          },
        ]}
      >
        <ScrollView
          style={styles.desktopSidebarScroll}
          contentContainerStyle={styles.desktopSidebarContent}
          showsVerticalScrollIndicator={false}
        >
          <AppText
            variant="caption"
            tone="muted"
            style={styles.desktopNavSection}
          >
            General
          </AppText>
          <SettingsMenuRow
            icon="palette-outline"
            title="Appearance"
            compact
            showChevron={false}
            selected={panel === "appearance"}
            onPress={() => setPanel("appearance")}
          />
          <SettingsMenuRow
            icon="account-outline"
            title="Account"
            compact
            showChevron={false}
            selected={panel === "account"}
            onPress={() => setPanel("account")}
          />
          {isAdmin ? (
            <>
              <AppText
                variant="caption"
                tone="muted"
                style={[styles.desktopNavSection, styles.desktopNavSectionSpaced]}
              >
                Admin
              </AppText>
              <SettingsMenuRow
                icon="account-group-outline"
                title="Users"
                compact
                showChevron={false}
                selected={panel === "admin-users"}
                onPress={() => setPanel("admin-users")}
              />
              <SettingsMenuRow
                icon="file-excel-outline"
                title="Export"
                compact
                showChevron={false}
                selected={panel === "admin-export"}
                onPress={() => setPanel("admin-export")}
              />
              <SettingsMenuRow
                icon="clock-outline"
                title="Overtime"
                compact
                showChevron={false}
                selected={panel === "admin-overtime"}
                onPress={() => setPanel("admin-overtime")}
              />
              <SettingsMenuRow
                icon="numeric-0-box-outline"
                title="Zero quantities"
                compact
                showChevron={false}
                danger
                selected={panel === "admin-zeros"}
                onPress={() => setPanel("admin-zeros")}
              />
              <SettingsMenuRow
                icon="barcode"
                title="External codes"
                compact
                showChevron={false}
                selected={panel === "admin-codes"}
                onPress={() => setPanel("admin-codes")}
              />
            </>
          ) : null}
        </ScrollView>
        <View style={styles.desktopSidebarFooter}>
          <AppText variant="caption" tone="muted">
            {userName || "Unknown"}
          </AppText>
          <AppText variant="caption" tone="dim" style={styles.footerVersion}>
            v1.{version?.build ?? "?"}
          </AppText>
        </View>
      </View>
    );
  };

  const renderRoot = () => (
    <AppSurface contentStyle={styles.menuSurfaceContent}>
      <SettingsMenuRow
        icon="palette-outline"
        title="Appearance"
        description="Theme and display"
        onPress={() => setPanel("appearance")}
      />
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
      <SettingsMenuRow
        icon="account-outline"
        title="Account"
        description={`Signed in as ${userName || "Unknown"}`}
        onPress={() => setPanel("account")}
      />
      {isAdmin ? (
        <>
          <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
          <SettingsMenuRow
            icon="shield-account-outline"
            title="Admin"
            description="Users, export, overtime, inventory tools"
            onPress={() => setPanel("admin")}
          />
        </>
      ) : null}
    </AppSurface>
  );

  const renderAppearance = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Appearance
      </AppText>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <AppText variant="bodyStrong">Dark Mode</AppText>
          <AppText
            variant="caption"
            tone="muted"
            style={styles.settingDescription}
          >
            Use a dark color scheme across the app
          </AppText>
        </View>
        <Switch
          value={isDarkMode}
          onValueChange={onToggleDarkMode}
          color={theme.colors.primary}
        />
      </View>
    </AppSurface>
  );

  const renderAccount = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Account
      </AppText>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <AppText variant="bodyStrong">Current user</AppText>
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
      <AppButton
        mode="outlined"
        onPress={onSwitchUser}
        style={styles.switchUserButton}
        icon="account-switch"
      >
        Sign out / Switch user
      </AppButton>
    </AppSurface>
  );

  const renderAdminHub = () => (
    <AppSurface contentStyle={styles.menuSurfaceContent}>
      <SettingsMenuRow
        icon="account-group-outline"
        title="Users"
        description="Create accounts, reset passwords, login history"
        onPress={() => setPanel("admin-users")}
      />
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
      <SettingsMenuRow
        icon="file-excel-outline"
        title="Export"
        description="Inventory and material usage Excel downloads"
        onPress={() => setPanel("admin-export")}
      />
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
      <SettingsMenuRow
        icon="clock-outline"
        title="Overtime"
        description="Material usage day / swing cutoffs"
        onPress={() => setPanel("admin-overtime")}
      />
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
      <SettingsMenuRow
        icon="numeric-0-box-outline"
        title="Zero quantities"
        description="Reset custom color stock to 0"
        onPress={() => setPanel("admin-zeros")}
        danger
      />
      <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
      <SettingsMenuRow
        icon="barcode"
        title="External codes"
        description="Paint barcode / external ID suffix"
        onPress={() => setPanel("admin-codes")}
      />
    </AppSurface>
  );

  const renderAdminUsers = () => (
    <>
      <AppSurface>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>
          User accounts
        </AppText>
        <AppText
          variant="caption"
          tone="muted"
          style={styles.settingDescription}
        >
          Create named accounts. Default password is "password"; on first login
          they must choose a new one. Reset sets it back to "password" and
          requires a change on next login.
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
        <AppButton
          mode="contained"
          onPress={handleCreateUser}
          loading={creatingUser}
          disabled={creatingUser || !newUserName.trim()}
          icon="account-plus"
          style={styles.userCreateBtn}
        >
          Create user
        </AppButton>
        {usersLoading ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : users.length === 0 ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 10 }}>
            No users yet. Created accounts appear in the login dropdown.
          </AppText>
        ) : (
          <View style={styles.userList}>
            {users.map((u) => (
              <View key={u.id || u.user_name} style={styles.userRow}>
                <View style={styles.userRowInfo}>
                  <AppText variant="bodyStrong">{u.user_name}</AppText>
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
                  <AppButton
                    mode="text"
                    compact
                    onPress={() => handleResetPassword(u.user_name)}
                  >
                    Reset
                  </AppButton>
                  <AppButton
                    mode="text"
                    compact
                    textColor={theme.colors.error}
                    onPress={() => handleDeleteUser(u.user_name)}
                  >
                    Delete
                  </AppButton>
                </View>
              </View>
            ))}
          </View>
        )}
      </AppSurface>
      <AppSurface>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>
          Login history
        </AppText>
        <AppText variant="caption" tone="muted" style={styles.blockHint}>
          View sign-in history for all users (timestamp per login).
        </AppText>
        <AppButton
          mode="outlined"
          onPress={() => setLoginHistoryOpen(true)}
          style={styles.adminButton}
          icon="account-clock"
        >
          User login history
        </AppButton>
      </AppSurface>
    </>
  );

  const renderAdminExport = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Inventory
      </AppText>
      <AppText variant="caption" tone="muted" style={styles.blockHint}>
        Export current inventory to an Excel file.
      </AppText>
      <AppButton
        mode="outlined"
        onPress={onExportExcel}
        style={styles.adminButton}
        icon="file-excel"
      >
        Export inventory to Excel
      </AppButton>
      <Divider
        style={[
          styles.divider,
          { backgroundColor: theme.colors.outlineVariant },
        ]}
      />
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Material usage
      </AppText>
      <AppText variant="caption" tone="muted" style={styles.blockHint}>
        Export by month or year (only periods with logged quantity are listed).
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
                style={[styles.adminInput, { pointerEvents: "none" }]}
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
                style={[styles.adminInput, { pointerEvents: "none" }]}
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
      <AppButton
        mode="outlined"
        onPress={handleExportMaterialUsage}
        style={styles.adminButton}
        icon="file-excel"
        disabled={
          exportPeriodsLoading ||
          (exportTab === "month" ? !selectedMonthKey : !selectedYearKey)
        }
      >
        Export Material Usage to Excel
      </AppButton>
    </AppSurface>
  );

  const renderAdminOvertime = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Overtime
      </AppText>
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <AppText variant="bodyStrong">Material Usage Overtime</AppText>
          <AppText
            variant="caption"
            tone="muted"
            style={styles.settingDescription}
          >
            On: Day 6:00am–4:25pm · Swing 4:26pm–2:30am
            {"\n"}
            Off: Day 6:00am–3:25pm · Swing 3:26pm–12:30am
          </AppText>
        </View>
        <Switch
          value={materialUsageOvertime}
          onValueChange={(v) => onSetMaterialUsageOvertime?.(v)}
          color={theme.colors.primary}
        />
      </View>
    </AppSurface>
  );

  const renderAdminZeros = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Zero quantities
      </AppText>
      <AppText variant="caption" tone="muted" style={styles.blockHint}>
        Sets every custom paint/stain quantity to 0. Does not delete items. Use
        after a physical recount reset.
      </AppText>
      <AppButton
        mode="outlined"
        onPress={onZeroCustomQuantities}
        style={styles.adminButton}
        icon="numeric-0-box"
        textColor={theme.colors.error}
      >
        Zero all custom color quantities
      </AppButton>
      <Divider
        style={[
          styles.divider,
          { backgroundColor: theme.colors.outlineVariant },
        ]}
      />
      <AppText variant="caption" tone="muted" style={styles.blockHint}>
        Zeros only custom paint/stain items with no check-in, check-out,
        receiving, or quantity change in the past 2 days. Skips recently active
        stock.
      </AppText>
      <AppButton
        mode="outlined"
        onPress={onZeroStaleCustomQuantities}
        style={styles.adminButton}
        icon="timer-sand"
        textColor={theme.colors.error}
      >
        Zero custom colors idle 2+ days
      </AppButton>
    </AppSurface>
  );

  const renderAdminCodes = () => (
    <AppSurface>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        Paint external code suffix
      </AppText>
      <AppText
        variant="caption"
        tone="muted"
        style={styles.settingDescription}
      >
        Optional ending sequence automatically appended to Paint and Custom
        Paint IDs (for bucket barcodes). Example:{" "}
        <Text style={{ fontFamily: fontFamily.mono }}>-794394</Text> turns ID{" "}
        <Text style={{ fontFamily: fontFamily.mono }}>H66LNL49323</Text> into
        external code{" "}
        <Text style={{ fontFamily: fontFamily.mono }}>H66LNL49323-794394</Text>.
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
      <AppButton
        mode="outlined"
        style={styles.adminButton}
        disabled={savingSuffix}
        onPress={async () => {
          try {
            setSavingSuffix(true);
            const result = await InventoryService.setPaintExternalSuffix(
              paintSuffix,
              userName || "unknown",
            );
            if (!result?.success) {
              Alert.alert("Error", result?.error || "Failed to save suffix.");
            } else {
              const confirmed =
                await InventoryService.getPaintExternalSuffix();
              setPaintSuffix(confirmed || "");
              Alert.alert("Saved", "Paint external suffix updated.");
            }
          } catch (e) {
            console.error("Save paint suffix error:", e);
            Alert.alert("Error", e?.message || "Failed to save suffix.");
          } finally {
            setSavingSuffix(false);
          }
        }}
      >
        {savingSuffix ? "Saving..." : "Save Suffix"}
      </AppButton>
    </AppSurface>
  );

  const renderPanelBody = () => {
    switch (panel) {
      case "appearance":
        return renderAppearance();
      case "account":
        return renderAccount();
      case "admin":
        return isAdmin ? renderAdminHub() : renderRoot();
      case "admin-users":
        return isAdmin ? renderAdminUsers() : renderRoot();
      case "admin-export":
        return isAdmin ? renderAdminExport() : renderRoot();
      case "admin-overtime":
        return isAdmin ? renderAdminOvertime() : renderRoot();
      case "admin-zeros":
        return isAdmin ? renderAdminZeros() : renderRoot();
      case "admin-codes":
        return isAdmin ? renderAdminCodes() : renderRoot();
      case "root":
      default:
        return renderRoot();
    }
  };

  if (isDesktop) {
    return (
      <View
        style={[
          styles.container,
          styles.desktopContainer,
          { backgroundColor: canvasBg },
        ]}
      >
        <View style={styles.desktopSplit}>
          {renderDesktopSidebar()}
          <ScrollView
            style={styles.desktopContentScroll}
            contentContainerStyle={styles.desktopContentInner}
          >
            {!embeddedInShell ? (
              <PageHeader title={panelTitle} onBack={onBack} />
            ) : null}
            <View style={styles.desktopContentBody}>{renderPanelBody()}</View>
          </ScrollView>
        </View>
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

  return (
    <View style={[styles.container, { backgroundColor: canvasBg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <PageHeader
          title={panelTitle}
          onBack={headerBack}
          embeddedInShell={embeddedInShell && panel === "root"}
        />
        {renderPanelBody()}
        {panel === "root" ? (
          <View style={styles.footer}>
            <AppText variant="caption" tone="muted">
              Signed in as {userName || "Unknown"}
            </AppText>
            <AppText variant="caption" tone="dim" style={styles.footerVersion}>
              v1.{version?.build ?? "?"}
            </AppText>
          </View>
        ) : null}
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
  desktopContainer: {
    minHeight: 0,
    ...(Platform.OS === "web" ? { height: "100%" } : null),
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
  menuSurfaceContent: {
    paddingVertical: space[1],
    paddingHorizontal: 0,
    gap: 0,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  menuIconSpacer: {
    width: 22,
  },
  menuRowText: {
    flex: 1,
    minWidth: 0,
  },
  menuRowDescription: {
    marginTop: 2,
  },
  menuRowCompact: {
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    marginHorizontal: space[2],
  },
  desktopSplit: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  desktopSidebar: {
    width: 260,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  desktopSidebarScroll: {
    flex: 1,
  },
  desktopSidebarContent: {
    paddingTop: space[3],
    paddingBottom: space[4],
  },
  desktopNavSection: {
    paddingHorizontal: space[4],
    marginBottom: space[1],
    marginTop: space[1],
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontSize: 11,
  },
  desktopNavSectionSpaced: {
    marginTop: space[4],
  },
  desktopSidebarFooter: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.25)",
    gap: 2,
  },
  desktopContentScroll: {
    flex: 1,
    minWidth: 0,
  },
  desktopContentInner: {
    padding: space[4],
    paddingTop: space[2],
    paddingBottom: space[8],
    maxWidth: 720,
  },
  desktopContentBody: {
    width: "100%",
  },
});
