import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
} from "react-native";
import {
  Card,
  Title,
  Text,
  Button,
  Switch,
  Divider,
  useTheme,
  TextInput,
} from "react-native-paper";
import { IconButton } from "react-native-paper";
import version from "../version";

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
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const [exportFromDate, setExportFromDate] = useState(() => formatDateForInput(new Date()));
  const [exportToDate, setExportToDate] = useState(() => formatDateForInput(new Date()));

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={onBack}
          iconColor={theme.colors.primary}
        />
        <Title style={styles.headerTitle}>Settings</Title>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.webScrollContent,
        ]}
      >
        <View style={isDesktop && styles.webWrapper}>
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface },
              isDesktop && styles.webCard,
            ]}
          >
            <Card.Content>
              <Title style={styles.sectionTitle}>Appearance</Title>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text
                    style={[
                      styles.settingLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Dark Mode
                  </Text>
                </View>
                <Switch
                  value={isDarkMode}
                  onValueChange={onToggleDarkMode}
                  color={theme.colors.primary}
                />
              </View>
            </Card.Content>
          </Card>

          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content>
              <Title style={styles.sectionTitle}>Account</Title>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text
                    style={[
                      styles.settingLabel,
                      { color: theme.colors.onSurface },
                    ]}
                  >
                    Current User
                  </Text>
                  <Text
                    style={[
                      styles.settingDescription,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    Logged in as: {" "}{userName || "Unknown"}
                  </Text>
                </View>
              </View>
              <Divider style={styles.divider} />
              <Button
                mode="outlined"
                onPress={onSwitchUser}
                style={styles.switchUserButton}
                icon="account-switch"
              >
                Switch User
              </Button>
            </Card.Content>
          </Card>

          {isAdmin && (
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
            >
              <Card.Content>
                <Title style={styles.sectionTitle}>Admin Settings</Title>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text
                      style={[
                        styles.settingLabel,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      Overtime
                    </Text>
                    <Text
                      style={[
                        styles.settingDescription,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      When on, Material Usage log day/swing shift times use OT boundaries (day 6am–4:25pm, swing 4:26pm–2:30am). When off, standard times (day 6am–3:25pm, swing 3:26pm–12:30am). Applies to all users.
                    </Text>
                  </View>
                  <Switch
                    value={materialUsageOvertime}
                    onValueChange={(v) => onSetMaterialUsageOvertime?.(v)}
                    color={theme.colors.primary}
                  />
                </View>
                <Divider style={styles.divider} />
                <Text
                  style={[
                    styles.settingDescription,
                    { color: theme.colors.onSurfaceVariant, marginBottom: 8 },
                  ]}
                >
                  Export current inventory to Excel file
                </Text>
                <Button
                  mode="outlined"
                  onPress={onExportExcel}
                  style={styles.adminButton}
                  icon="file-excel"
                >
                  Export inventory to Excel
                </Button>
                <Divider style={styles.divider} />
                <Text
                  style={[
                    styles.settingDescription,
                    { color: theme.colors.onSurfaceVariant, marginBottom: 8 },
                  ]}
                >
                  Export Material Usage log to Excel (choose date range)
                </Text>
                <TextInput
                  label="From date"
                  value={exportFromDate}
                  onChangeText={setExportFromDate}
                  mode="outlined"
                  placeholder="YYYY-MM-DD"
                  style={styles.adminInput}
                />
                <TextInput
                  label="To date"
                  value={exportToDate}
                  onChangeText={setExportToDate}
                  mode="outlined"
                  placeholder="YYYY-MM-DD"
                  style={styles.adminInput}
                />
                <Button
                  mode="outlined"
                  onPress={() => onExportMaterialUsageExcel?.(exportFromDate, exportToDate)}
                  style={styles.adminButton}
                  icon="file-excel"
                >
                  Export Material Usage to Excel
                </Button>
              </Card.Content>
            </Card>
          )}
          <View style={styles.footer}>
            <Text style={[styles.footerSignedIn, { color: theme.colors.onSurfaceVariant }]}>
              Signed in as {userName || "Unknown"}
            </Text>
            <Text style={[styles.footerVersion, { color: theme.colors.onSurfaceVariant }]}>
              v{version?.build ?? "?"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
  },
  divider: {
    marginVertical: 16,
  },
  switchUserButton: {
    marginTop: 8,
  },
  adminInput: {
    marginTop: 8,
    marginBottom: 12,
  },
  adminButton: {
    marginTop: 8,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
  webScrollContent: {
    alignItems: "center",
  },
  footer: {
    marginTop: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  footerSignedIn: {
    fontSize: 14,
  },
  footerVersion: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
});
