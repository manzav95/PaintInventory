import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, useWindowDimensions } from 'react-native';
import { TextInput, Button, Text, Card, Title, useTheme } from 'react-native-paper';

export default function AddItemScreen({ onSave, onCancel }) {
  const theme = useTheme();
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [itemId, setItemId] = useState('');

  const validateIdFormat = (id) => {
    if (!id.trim()) {
      return true; // Empty is OK (will auto-generate)
    }
    const formattedId = id.trim().toUpperCase();
    return /^H66[A-Z]{3}\d{5}$/.test(formattedId);
  };

  const handleIdBlur = () => {
    if (itemId.trim() && !validateIdFormat(itemId)) {
      Alert.alert(
        'Invalid Paint Code Format',
        'Paint ID must be in Sherwin Williams format:\n\nH66 + 3 letters + 5 numbers\n\nExample: H66ABC12345\n\nLeave blank to auto-generate a default code.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Paint name is required.');
      return;
    }

    // Validate ID format if provided
    if (itemId.trim()) {
      const formattedId = itemId.trim().toUpperCase();
      if (!/^H66[A-Z]{3}\d{5}$/.test(formattedId)) {
        Alert.alert('Invalid Format', 'Paint ID must be in Sherwin Williams format: H66(3 letters)(5 numbers), e.g., H66ABC12345\n\nLeave blank to auto-generate a default code.');
        return;
      }
    }

    const item = {
      // Include ID if provided, otherwise let service generate default
      ...(itemId.trim() && { id: itemId.trim().toUpperCase() }),
      name: name.trim(),
      quantity: parseInt(quantity) || 0,
      description: description.trim(),
      location: location.trim(),
      createdAt: new Date().toISOString(),
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
            label="Paint ID (Optional - leave blank for auto-generated)"
            value={itemId}
            onChangeText={(t) => {
              // Allow H66, 3 letters, 5 numbers
              const upper = t.toUpperCase();
              let filtered = upper.replace(/[^H0-9A-Z]/g, '');
              // Ensure it starts with H66
              if (filtered.length > 0 && filtered[0] !== 'H') {
                filtered = 'H66' + filtered.replace(/^H66/, '');
              }
              if (filtered.length > 3 && !filtered.startsWith('H66')) {
                filtered = 'H66' + filtered.substring(3);
              }
              // Limit to 13 characters: H66 + 3 letters + 5 numbers
              if (filtered.length > 13) filtered = filtered.slice(0, 13);
              setItemId(filtered);
            }}
            onBlur={handleIdBlur}
            mode="outlined"
            autoCapitalize="characters"
            style={styles.input}
            placeholder="H66ABC12345 (optional)"
          />
          <Text style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}>
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
            label="Description"
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={3}
          />

          <TextInput
            label="Location"
            value={location}
            onChangeText={setLocation}
            mode="outlined"
            style={styles.input}
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

            <Button
              mode="outlined"
              onPress={onCancel}
              style={styles.button}
            >
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
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
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
    fontStyle: 'italic',
  },
  webContentContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  webWrapper: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  webCard: {
    width: '100%',
  },
});

