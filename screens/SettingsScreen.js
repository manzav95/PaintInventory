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
  minQuantity = 30,
  onSetMinQuantity,
  onExportExcel,
}) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [nextIdInput, setNextIdInput] = useState(nextIdFormatted || "");
  const [minQuantityInput, setMinQuantityInput] = useState(
    String(minQuantity ?? 30),
  );

  useEffect(() => {
    setNextIdInput(nextIdFormatted || "");
  }, [nextIdFormatted]);
  useEffect(() => {
    setMinQuantityInput(String(minQuantity ?? 30));
  }, [minQuantity]);

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
                      Minimum quantity (low stock)
                    </Text>
                    <Text
                      style={[
                        styles.settingDescription,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      Items below this count are shown as low stock. Current: {minQuantity}
                    </Text>
                  </View>
                </View>
                <TextInput
                  label="Minimum quantity"
                  value={minQuantityInput}
                  onChangeText={setMinQuantityInput}
                  keyboardType="number-pad"
                  mode="outlined"
                  style={styles.adminInput}
                />
                <Button
                  mode="contained"
                  onPress={() => {
                    const num = parseInt(minQuantityInput, 10);
                    if (isNaN(num) || num < 0) {
                      Alert.alert(
                        "Invalid",
                        "Minimum quantity must be 0 or greater.",
                      );
                      return;
                    }
                    onSetMinQuantity?.(num);
                  }}
                  style={styles.adminButton}
                  icon="content-save"
                >
                  Save minimum level
                </Button>
                <Divider style={styles.divider} />
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
                      Current: {nextIdFormatted || "(auto)"}
                    </Text>
                  </View>
                </View>
                <Divider style={styles.divider} />
                <TextInput
                  label="Set next paint ID (any format)"
                  value={nextIdInput}
                  onChangeText={setNextIdInput}
                  mode="outlined"
                  placeholder="e.g. H66ABC12345 or CUSTOM-001"
                  style={styles.adminInput}
                />
                <Button
                  mode="contained"
                  onPress={() => {
                    const trimmed = nextIdInput.trim();
                    if (!trimmed) {
                      Alert.alert("Invalid", "Next paint ID cannot be empty.");
                      return;
                    }
                    onSetNextIdNumber(trimmed);
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
});
