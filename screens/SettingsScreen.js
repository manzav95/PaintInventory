import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
} from "react-native";
import {
  Text,
  Button,
  Switch,
  Divider,
  useTheme,
  TextInput,
  ActivityIndicator,
} from "react-native-paper";
import DateField from "../components/DateField";
import PageHeader from "../components/PageHeader";
import version from "../version";
import { DESKTOP_BREAKPOINT } from "../utils/layout";
import InventoryService from "../services/inventoryService";
import UserService from "../services/userService";
import LoginHistoryModal from "../components/LoginHistoryModal";
import { AppSurface, AppText } from "../components/ui";
import { colors, fontFamily, space, radius } from "../theme/tokens";
import showToast from "../utils/showToast";

function formatDateForInput(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [exportFromDate, setExportFromDate] = useState(() =>
    formatDateForInput(new Date()),
  );
  const [exportToDate, setExportToDate] = useState(() =>
    formatDateForInput(new Date()),
  );
  const [paintSuffix, setPaintSuffix] = useState("");
  const [savingSuffix, setSavingSuffix] = useState(false);
  const [loginHistoryOpen, setLoginHistoryOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
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
  }, [isAdmin]);

  const handleCreateUser = async () => {
    const name = newUserName.trim();
    const pin = newUserPassword.trim();
    if (!name || pin.length < 3) {
      showToast({
        type: "error",
        title: "Required",
        message: "Enter a name and a password (min 3 characters).",
      });
      return;
    }
    setCreatingUser(true);
    try {
      const result = await UserService.create({
        userName: name,
        password: pin,
      });
      if (!result?.success) {
        throw new Error(result?.error || "Could not create user");
      }
      setNewUserName("");
      setNewUserPassword("");
      showToast({
        title: "User created",
        message: `${name} can now sign in from the login dropdown.`,
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

  const handleDeleteUser = (name) => {
    Alert.alert(
      "Delete user?",
      `Remove ${name} from the login list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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
          },
        },
      ],
    );
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
                Create named accounts with a quick password (min 3 characters).
                New users must set their own password on first login. Passwords
                are shown below for admin reference.
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
              <TextInput
                label="Temporary password"
                value={newUserPassword}
                onChangeText={setNewUserPassword}
                mode="outlined"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.userInput}
              />
              <Button
                mode="contained"
                onPress={handleCreateUser}
                loading={creatingUser}
                disabled={creatingUser}
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
                      <Button
                        mode="text"
                        compact
                        textColor={theme.colors.error}
                        onPress={() => handleDeleteUser(u.user_name)}
                      >
                        Delete
                      </Button>
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
                Export Material Usage log to Excel (choose date range)
              </AppText>
              <DateField
                label="From date"
                value={exportFromDate}
                onChange={setExportFromDate}
                style={styles.adminInput}
              />
              <DateField
                label="To date"
                value={exportToDate}
                onChange={setExportToDate}
                style={styles.adminInput}
              />
              <Button
                mode="outlined"
                onPress={() =>
                  onExportMaterialUsageExcel?.(exportFromDate, exportToDate)
                }
                style={styles.adminButton}
                icon="file-excel"
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
