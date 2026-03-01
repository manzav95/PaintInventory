import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
  Pressable,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Card,
  Title,
  useTheme,
  Menu,
} from "react-native-paper";

const TYPE_OPTIONS = [
  { label: "Paint", value: "paint" },
  { label: "Primer", value: "primer" },
  { label: "Clear", value: "clear" },
  { label: "Stain", value: "stain" },
  { label: "Dye", value: "dye" },
];

const CONTAINER_OPTIONS = [
  { label: "White Container", value: "White Container" },
  { label: "Stock Container", value: "Stock Container" },
  { label: "Custom Container", value: "Custom Container" },
];

export default function AddItemScreen({ onSave, onCancel }) {
  const theme = useTheme();
  const isWeb = Platform.OS === "web";
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [itemId, setItemId] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Required Field", "Paint name is required.");
      return;
    }

    const minQ = minQuantity.trim() === "" ? undefined : parseInt(minQuantity, 10);
    if (minQuantity.trim() !== "" && (isNaN(minQ) || minQ < 0)) {
      Alert.alert("Invalid", "Minimum quantity must be 0 or greater.");
      return;
    }

    const priceNum = price.trim() === "" ? undefined : parseFloat(price);
    const typeVal = TYPE_OPTIONS.some((o) => o.value === type) ? type : undefined;
    const item = {
      ...(itemId.trim() && { id: itemId.trim() }),
      name: name.trim(),
      quantity: parseInt(quantity) || 0,
      location: location.trim(),
      createdAt: new Date().toISOString(),
      ...(minQ != null && !isNaN(minQ) && { minQuantity: minQ }),
      ...(priceNum != null && !isNaN(priceNum) && priceNum >= 0 && { price: priceNum }),
      ...(typeVal && { type: typeVal }),
    };

    onSave(item);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={isDesktop && styles.webContentContainer}
    >
      <View style={isDesktop && styles.webWrapper}>
        <Card style={[styles.card, isDesktop && styles.webCard]}>
          <Card.Content>
            <Title style={styles.title}>Add New Paint</Title>

            <TextInput
              label="Paint ID (optional - leave blank to auto-generate)"
              value={itemId}
              onChangeText={setItemId}
              mode="outlined"
              style={styles.input}
              placeholder="Any format (optional)"
            />
            <Text
              style={[
                styles.helpText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              Leave blank to auto-generate a default code
            </Text>

            <TextInput
              label="Paint Name *"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
              autoFocus={!itemId}
            />

            <TextInput
              label="Quantity (Gallons)"
              value={quantity}
              onChangeText={setQuantity}
              mode="outlined"
              style={styles.input}
              keyboardType="numeric"
              right={<TextInput.Affix text="gal" />}
            />

            <TextInput
              label="Minimum quantity (low stock threshold)"
              value={minQuantity}
              onChangeText={setMinQuantity}
              mode="outlined"
              style={styles.input}
              keyboardType="number-pad"
              placeholder="Optional - leave blank to use app default"
            />

            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <Text style={[styles.typeLabel, { color: theme.colors.onSurfaceVariant }]}>Type</Text>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 16,
                    borderRadius: 4,
                    border: `1px solid ${theme.colors.outline}`,
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.onSurface,
                  }}
                >
                  <option value="">Select type</option>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            ) : (
              <>
                <Text style={[styles.typeLabel, { color: theme.colors.onSurfaceVariant }]}>Type</Text>
                <Menu
                  visible={typeMenuOpen}
                  onDismiss={() => setTypeMenuOpen(false)}
                  anchor={
                    <Pressable
                      onPress={() => setTypeMenuOpen(true)}
                      style={[styles.typeTrigger, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }]}
                    >
                      <Text style={{ color: type ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                        {type ? TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type : "Select type"}
                      </Text>
                    </Pressable>
                  }
                >
                  {TYPE_OPTIONS.map((o) => (
                    <Menu.Item
                      key={o.value}
                      onPress={() => {
                        setType(o.value);
                        setTypeMenuOpen(false);
                      }}
                      title={o.label}
                    />
                  ))}
                </Menu>
              </>
            )}

            <Text style={[styles.typeLabel, { color: theme.colors.onSurfaceVariant }]}>Container</Text>
            {isWeb && isDesktop ? (
              <View style={styles.input}>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 16,
                    borderRadius: 4,
                    border: `1px solid ${theme.colors.outline}`,
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.onSurface,
                  }}
                >
                  <option value="">Select container</option>
                  {CONTAINER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </View>
            ) : (
              <>
                <Menu
                  visible={locationMenuOpen}
                  onDismiss={() => setLocationMenuOpen(false)}
                  anchor={
                    <Pressable
                      onPress={() => setLocationMenuOpen(true)}
                      style={[styles.typeTrigger, { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }]}
                    >
                      <Text style={{ color: location ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                        {location ? CONTAINER_OPTIONS.find((o) => o.value === location)?.label ?? location : "Select container"}
                      </Text>
                    </Pressable>
                  }
                >
                  {CONTAINER_OPTIONS.map((o) => (
                    <Menu.Item
                      key={o.value}
                      onPress={() => {
                        setLocation(o.value);
                        setLocationMenuOpen(false);
                      }}
                      title={o.label}
                    />
                  ))}
                </Menu>
              </>
            )}

            <TextInput
              label="Unit price (optional)"
              value={price}
              onChangeText={setPrice}
              mode="outlined"
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="e.g. 45.00"
              left={<TextInput.Affix text="$" />}
            />

            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                onPress={handleSave}
                style={[styles.button, styles.saveButton]}
                disabled={!name.trim()}
              >
                Save Item
              </Button>

              <Button mode="outlined" onPress={onCancel} style={styles.button}>
                Cancel
              </Button>
            </View>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    marginBottom: 15,
  },
  typeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  typeTrigger: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    marginTop: 10,
  },
  saveButton: {
    marginTop: 20,
  },
  helpText: {
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 4,
    fontStyle: "italic",
  },
  webContentContainer: {
    alignItems: "center",
    paddingTop: 12,
  },
  webWrapper: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  webCard: {
    width: "100%",
  },
});
