import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  Card,
  TextInput,
  useTheme,
  Text,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import FadeIn from "../components/FadeIn";
import ShakeView from "../components/ShakeView";
import ScrollFrame from "../components/ScrollFrame";
import showToast from "../utils/showToast";
import UserService from "../services/userService";
import { colors, space, radius } from "../theme/tokens";
import { AppText } from "../components/ui";
import BrandLogo from "../components/BrandLogo";
import { elevationShadow } from "../utils/rnWebStyles";

const HIDDEN_ADMIN_NAME = "admin123";
const TRACKER_DOUBLE_TAP_MS = 550;
/** ~5 name rows visible; scroll for the rest. */
const NAME_LIST_MAX_HEIGHT = 5 * 44;

function isHiddenAdminName(name) {
  return String(name || "").trim().toLowerCase() === HIDDEN_ADMIN_NAME;
}

function openAdminGateFromTracker(setAdminGate, setSelectedName, setPassword, setMenuOpen) {
  setAdminGate(true);
  setSelectedName("");
  setPassword("");
  setMenuOpen(false);
}

export default function LoginScreen({ onLogin }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedName, setSelectedName] = useState("");
  const [password, setPassword] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shakeTick, setShakeTick] = useState(0);
  /** After first login with must_change_password, force a new password. */
  const [pendingUser, setPendingUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /** Double-tap "Tracker" unlocks hidden admin password gate. */
  const [adminGate, setAdminGate] = useState(false);
  const lastTrackerTapRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await UserService.list();
        if (!cancelled) {
          const names = (list || [])
            .map((u) => u.user_name)
            .filter((n) => n && !isHiddenAdminName(n));
          setUsers(names);
        }
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishLogin = (userName) => {
    onLogin(userName);
  };

  const changingPassword = !!pendingUser;

  const filteredUsers = useMemo(() => {
    const q = selectedName.trim().toLowerCase();
    if (!q) return users;
    return users.filter((name) => String(name).toLowerCase().includes(q));
  }, [users, selectedName]);

  const blurCloseTimerRef = useRef(null);

  const openNameList = () => {
    if (blurCloseTimerRef.current) {
      clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
    setMenuOpen(true);
  };

  const scheduleCloseNameList = () => {
    if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    // Delay so a name-row press can register before the list unmounts.
    blurCloseTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      blurCloseTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (blurCloseTimerRef.current) clearTimeout(blurCloseTimerRef.current);
    };
  }, []);

  const pickName = (name) => {
    if (blurCloseTimerRef.current) {
      clearTimeout(blurCloseTimerRef.current);
      blurCloseTimerRef.current = null;
    }
    setSelectedName(name);
    setMenuOpen(false);
  };

  const handleTrackerPress = () => {
    if (changingPassword) return;
    const now = Date.now();
    if (now - lastTrackerTapRef.current < TRACKER_DOUBLE_TAP_MS) {
      lastTrackerTapRef.current = 0;
      openAdminGateFromTracker(
        setAdminGate,
        setSelectedName,
        setPassword,
        setMenuOpen,
      );
      return;
    }
    lastTrackerTapRef.current = now;
  };

  const handleTrackerDoubleClick = () => {
    if (changingPassword) return;
    lastTrackerTapRef.current = 0;
    openAdminGateFromTracker(
      setAdminGate,
      setSelectedName,
      setPassword,
      setMenuOpen,
    );
  };

  const submit = async () => {
    const name = adminGate ? HIDDEN_ADMIN_NAME : selectedName.trim();
    const pin = password.trim();
    if (!adminGate && !name) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "User required",
        message: "Select or type your name from the list.",
      });
      return;
    }
    if (!pin) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Password required",
        message: adminGate
          ? "Enter the admin password."
          : "Enter your quick password.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await UserService.authenticate(name, pin);
      if (!result?.success || !result?.user?.user_name) {
        throw new Error(result?.error || "Login failed");
      }
      if (result.user.must_change_password) {
        setPendingUser(result.user);
        setNewPassword("");
        setConfirmPassword("");
        setPassword("");
        setAdminGate(false);
        return;
      }
      finishLogin(result.user.user_name);
    } catch (e) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Login failed",
        message: e?.message || "Invalid name or password.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitPasswordChange = async () => {
    const name = pendingUser?.user_name;
    const pin = newPassword.trim();
    const confirm = confirmPassword.trim();
    if (!name) return;
    if (pin.length < 3) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Password too short",
        message: "Use at least 3 characters.",
      });
      return;
    }
    if (pin === "password") {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Choose a new password",
        message: 'Pick something other than the default "password".',
      });
      return;
    }
    if (pin !== confirm) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Passwords do not match",
        message: "Re-enter the same new password.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await UserService.changePassword(name, pin);
      if (!result?.success) {
        throw new Error(result?.error || "Could not update password");
      }
      showToast({
        title: "Password updated",
        message: "You can use your new password next time.",
      });
      finishLogin(name);
    } catch (e) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Could not update password",
        message: e?.message || "Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelPasswordChange = () => {
    setPendingUser(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  const exitAdminGate = () => {
    setAdminGate(false);
    setPassword("");
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FadeIn
        fromY={16}
        duration={360}
        style={isDesktop ? styles.webWrapper : undefined}
      >
        <ShakeView trigger={shakeTick} clip={!menuOpen}>
          <Card
            style={[
              styles.card,
              isDesktop && styles.webCard,
              menuOpen && styles.cardMenuOpen,
            ]}
            mode="outlined"
          >
            <Card.Content
              style={menuOpen ? styles.cardContentMenuOpen : undefined}
            >
              <BrandLogo
                variant="login"
                mark="full"
                onPress={handleTrackerPress}
                onDoubleClick={
                  Platform.OS === "web" ? handleTrackerDoubleClick : undefined
                }
              />

              {changingPassword ? (
                <>
                  <AppText variant="body" tone="muted" style={styles.subtitle}>
                    Welcome, {pendingUser.user_name}. You signed in with the
                    default password — choose a new one before continuing (min 3
                    characters; not "password").
                  </AppText>
                  <TextInput
                    label="New password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    mode="outlined"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    error={shakeTick > 0 && newPassword.trim().length < 3}
                  />
                  <TextInput
                    label="Confirm password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    mode="outlined"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    onSubmitEditing={submitPasswordChange}
                    error={
                      shakeTick > 0 &&
                      confirmPassword.trim() !== newPassword.trim()
                    }
                  />
                  <AppButton
                    mode="contained"
                    onPress={submitPasswordChange}
                    style={styles.button}
                    loading={submitting}
                    disabled={submitting}
                  >
                    Save password & continue
                  </AppButton>
                  <AppButton
                    mode="text"
                    onPress={cancelPasswordChange}
                    disabled={submitting}
                    style={styles.cancelBtn}
                  >
                    Back to login
                  </AppButton>
                </>
              ) : adminGate ? (
                <>
                  <AppText variant="body" tone="muted" style={styles.subtitle}>
                    Enter the admin password to continue.
                  </AppText>
                  <TextInput
                    label="Admin password"
                    value={password}
                    onChangeText={setPassword}
                    mode="outlined"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    style={styles.input}
                    onSubmitEditing={submit}
                    error={shakeTick > 0 && !password.trim()}
                  />
                  <AppButton
                    mode="contained"
                    onPress={submit}
                    style={styles.button}
                    loading={submitting}
                    disabled={submitting}
                  >
                    Continue
                  </AppButton>
                  <AppButton
                    mode="text"
                    onPress={exitAdminGate}
                    disabled={submitting}
                    style={styles.cancelBtn}
                  >
                    Back to login
                  </AppButton>
                </>
              ) : (
                <>
                  <AppText variant="body" tone="muted" style={styles.subtitle}>
                    Select your name and enter your password.
                  </AppText>

                  {usersLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator />
                    </View>
                  ) : (
                    <View style={styles.nameFieldWrap}>
                      <TextInput
                        label="Name"
                        value={selectedName}
                        onChangeText={(t) => {
                          setSelectedName(t);
                          setMenuOpen(true);
                        }}
                        onFocus={openNameList}
                        onBlur={scheduleCloseNameList}
                        mode="outlined"
                        autoCapitalize="words"
                        autoCorrect={false}
                        style={styles.nameInput}
                        right={
                          <TextInput.Icon
                            icon={menuOpen ? "menu-up" : "menu-down"}
                            onPress={() => {
                              if (menuOpen) {
                                setMenuOpen(false);
                              } else {
                                openNameList();
                              }
                            }}
                          />
                        }
                        error={shakeTick > 0 && !selectedName.trim()}
                      />
                      {menuOpen ? (
                        <View
                          style={[
                            styles.nameList,
                            {
                              backgroundColor: theme.dark
                                ? colors.dark.nested
                                : colors.light.elevatedHigh,
                              borderColor: theme.dark
                                ? colors.dark.border
                                : colors.light.border,
                            },
                          ]}
                        >
                          <ScrollFrame
                            maxHeight={NAME_LIST_MAX_HEIGHT}
                            bordered={false}
                            nested={false}
                            fadeColor={
                              theme.dark
                                ? colors.dark.nested
                                : colors.light.elevatedHigh
                            }
                            style={styles.nameListScroll}
                          >
                            {filteredUsers.length === 0 ? (
                              <Text
                                style={[
                                  styles.nameListEmpty,
                                  { color: theme.colors.onSurfaceVariant },
                                ]}
                              >
                                {selectedName.trim()
                                  ? "No matching names"
                                  : "No users"}
                              </Text>
                            ) : (
                              filteredUsers.map((name) => (
                                <Pressable
                                  key={name}
                                  onPress={() => pickName(name)}
                                  style={({ pressed }) => [
                                    styles.nameRow,
                                    pressed && {
                                      backgroundColor: theme.dark
                                        ? "rgba(255,255,255,0.08)"
                                        : "rgba(0,0,0,0.06)",
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.nameRowText,
                                      { color: theme.colors.onSurface },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {name}
                                  </Text>
                                </Pressable>
                              ))
                            )}
                          </ScrollFrame>
                        </View>
                      ) : null}
                    </View>
                  )}

                  <TextInput
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    mode="outlined"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                    onSubmitEditing={submit}
                    error={shakeTick > 0 && !password.trim()}
                  />

                  <AppButton
                    mode="contained"
                    onPress={submit}
                    style={styles.button}
                    loading={submitting}
                    disabled={submitting || usersLoading}
                  >
                    Continue
                  </AppButton>

                  {users.length === 0 && !usersLoading ? (
                    <Text
                      style={[
                        styles.hint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      No user accounts yet. An admin can create them in Settings
                      after signing in.
                    </Text>
                  ) : null}
                </>
              )}
            </Card.Content>
          </Card>
        </ShakeView>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
    justifyContent: "center",
    padding: space[8],
    overflow: "visible",
  },
  card: {
    ...elevationShadow({ offsetY: 2, blur: 8, opacity: 0.12, elevation: 4 }),
    overflow: "visible",
  },
  cardMenuOpen: {
    zIndex: 10,
    overflow: "visible",
  },
  cardContentMenuOpen: {
    overflow: "visible",
    zIndex: 10,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: space[2],
  },
  trackerHit: {
    paddingVertical: 10,
    paddingLeft: 0,
    paddingRight: 8,
    marginVertical: -10,
    ...(Platform.OS === "web" ? { cursor: "default" } : null),
  },
  title: {
    marginBottom: 0,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: space[6],
  },
  input: {
    marginBottom: space[4],
  },
  button: {
    marginTop: space[2],
  },
  cancelBtn: {
    marginTop: space[2],
  },
  webWrapper: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    overflow: "visible",
  },
  webCard: {
    width: "100%",
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
  nameFieldWrap: {
    position: "relative",
    zIndex: 20,
    marginBottom: space[4],
  },
  nameInput: {
    marginBottom: 0,
  },
  nameList: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "100%",
    marginTop: 4,
    zIndex: 30,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    ...elevationShadow({ offsetY: 8, blur: 20, opacity: 0.22, elevation: 8 }),
  },
  nameListScroll: {
    maxWidth: "100%",
  },
  nameListEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  nameRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
  },
  nameRowText: {
    fontSize: 16,
  },
  hint: {
    marginTop: 14,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});
