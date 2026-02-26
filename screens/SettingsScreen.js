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

export default function SettingsScreen({
  onBack,
  userName,
  isDarkMode,
  onToggleDarkMode,
  onSwitchUser,
  isAdmin,
  nextIdNumber,
  nextIdFormatted,
  onSetNextIdNumber,
  onExportExcel,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [nextIdInput, setNextIdInput] = useState(
    nextIdFormatted || "H66AAA00001",
  );

  const validateIdFormat = (id) => {
    if (!id.trim()) {
      return false;
    }
    const formattedId = id.trim().toUpperCase();
    return /^H66[A-Z]{3}\d{5}$/.test(formattedId);
  };

  const handleIdBlur = () => {
    if (nextIdInput.trim() && !validateIdFormat(nextIdInput)) {
      Alert.alert(
        "Invalid Paint Code Format",
        "Paint ID must be in Sherwin Williams format:\n\nH66 + 3 letters + 5 numbers\n\nExample: H66ABC12345",
        [{ text: "OK" }],
      );
    }
  };

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
            {/* <Card.Content>
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
            </Card.Content> */}
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
                    Logged in as: {userName || "Unknown"}
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
                      Next Paint ID
                    </Text>
                    <Text
                      style={[
                        styles.settingDescription,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Current: {nextIdFormatted || "H66AAA00001"}
                    </Text>
                  </View>
                </View>
                <Divider style={styles.divider} />
                <TextInput
                  label="Set next paint ID (Sherwin Williams format: H66ABC12345)"
                  value={nextIdInput}
                  onChangeText={(t) => {
                    // Allow H66, 3 letters, 5 numbers
                    const upper = t.toUpperCase();
                    let filtered = upper.replace(/[^H0-9A-Z]/g, "");
                    // Ensure it starts with H66
                    if (filtered.length > 0 && filtered[0] !== "H") {
                      filtered = "H66" + filtered.replace(/^H66/, "");
                    }
                    if (filtered.length > 3 && !filtered.startsWith("H66")) {
                      filtered = "H66" + filtered.substring(3);
                    }
                    // Limit to 13 characters: H66 + 3 letters + 5 numbers
                    if (filtered.length > 13) filtered = filtered.slice(0, 13);
                    setNextIdInput(filtered);
                  }}
                  onBlur={handleIdBlur}
                  mode="outlined"
                  autoCapitalize="characters"
                  placeholder="H66ABC12345"
                  style={styles.adminInput}
                />
                <Button
                  mode="contained"
                  onPress={() => {
                    const formatted = nextIdInput.toUpperCase();
                    // Validate format
                    if (!/^H66[A-Z]{3}\d{5}$/.test(formatted)) {
                      Alert.alert(
                        "Invalid Format",
                        "Paint ID must be in Sherwin Williams format: H66(3 letters)(5 numbers), e.g., H66ABC12345",
                      );
                      return;
                    }
                    onSetNextIdNumber(formatted);
                  }}
                  style={styles.adminButton}
                  icon="content-save"
                >
                  Save Next ID
                </Button>
                <Divider style={styles.divider} />
                <Text
                  style={[
                    styles.settingDescription,
                    { color: theme.colors.onSurfaceVariant, marginBottom: 12 },
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
                  Export to Excel
                </Button>
              </Card.Content>
            </Card>
          )}
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
    padding: 16,
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
});
