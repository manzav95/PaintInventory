import React, { useEffect, useState } from "react";
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
  Button,
  useTheme,
  Menu,
  Text,
  ActivityIndicator,
} from "react-native-paper";
import FadeIn from "../components/FadeIn";
import ShakeView from "../components/ShakeView";
import showToast from "../utils/showToast";
import UserService from "../services/userService";
import { colors, space } from "../theme/tokens";
import { AppText } from "../components/ui";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await UserService.list();
        if (!cancelled) {
          const names = (list || [])
            .map((u) => u.user_name)
            .filter(Boolean);
          // Always offer legacy admin in the list.
          if (!names.some((n) => n.toLowerCase() === "admin123")) {
            names.unshift("admin123");
          }
          setUsers(names);
        }
      } catch (e) {
        if (!cancelled) {
          setUsers(["admin123"]);
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

  const submit = async () => {
    const name = selectedName.trim();
    const pin = password.trim();
    if (!name) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "User required",
        message: "Select your name from the list.",
      });
      return;
    }
    if (!pin) {
      setShakeTick((n) => n + 1);
      showToast({
        type: "error",
        title: "Password required",
        message: "Enter your quick password.",
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

  const changingPassword = !!pendingUser;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FadeIn
        fromY={16}
        duration={360}
        style={isDesktop ? styles.webWrapper : undefined}
      >
        <ShakeView trigger={shakeTick}>
          <Card style={[styles.card, isDesktop && styles.webCard]}>
            <Card.Content>
              <AppText variant="pageTitle" style={styles.title}>
                Paint Inventory Tracker
              </AppText>

              {changingPassword ? (
                <>
                  <AppText variant="body" tone="muted" style={styles.subtitle}>
                    Welcome, {pendingUser.user_name}. Choose a new password
                    before continuing (min 3 characters).
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
                  <Button
                    mode="contained"
                    onPress={submitPasswordChange}
                    style={styles.button}
                    loading={submitting}
                    disabled={submitting}
                  >
                    Save password & continue
                  </Button>
                  <Button
                    mode="text"
                    onPress={cancelPasswordChange}
                    disabled={submitting}
                    style={styles.cancelBtn}
                  >
                    Back to login
                  </Button>
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
                    <Menu
                      visible={menuOpen}
                      onDismiss={() => setMenuOpen(false)}
                      anchor={
                        <Pressable onPress={() => setMenuOpen(true)}>
                          <TextInput
                            label="Name"
                            value={selectedName}
                            mode="outlined"
                            editable={false}
                            pointerEvents="none"
                            style={styles.input}
                            right={<TextInput.Icon icon="menu-down" />}
                            error={shakeTick > 0 && !selectedName.trim()}
                          />
                        </Pressable>
                      }
                      style={styles.menu}
                    >
                      {users.map((name) => (
                        <Menu.Item
                          key={name}
                          onPress={() => {
                            setSelectedName(name);
                            setMenuOpen(false);
                          }}
                          title={name === "admin123" ? "Admin" : name}
                        />
                      ))}
                    </Menu>
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

                  <Button
                    mode="contained"
                    onPress={submit}
                    style={styles.button}
                    loading={submitting}
                    disabled={submitting || usersLoading}
                  >
                    Continue
                  </Button>

                  {users.length <= 1 ? (
                    <Text
                      style={[
                        styles.hint,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Admin can create user accounts in Settings after signing
                      in.
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
  },
  card: {
    elevation: 4,
  },
  title: {
    marginBottom: space[2],
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
  },
  webCard: {
    width: "100%",
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
  menu: {
    marginTop: 48,
  },
  hint: {
    marginTop: 14,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },
});
