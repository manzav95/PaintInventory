import React, { useState } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Card, Title, Paragraph, TextInput, Button, Switch, useTheme } from 'react-native-paper';

export default function LoginScreen({ onLogin, isDarkMode, onToggleDarkMode }) {
  const theme = useTheme();
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onLogin(trimmed);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={isDesktop && styles.webWrapper}>
        <Card style={[styles.card, isDesktop && styles.webCard]}>
        <Card.Content>
          <Title style={styles.title}>Paint Inventory Tracker</Title>
          <Paragraph style={styles.subtitle}>
            Enter your name to continue.
          </Paragraph>

          <TextInput
            label="Name"
            value={name}
            onChangeText={setName}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={submit}
          />

          <Button
            mode="contained"
            onPress={submit}
            disabled={!name.trim()}
            style={styles.button}
          >
            Continue
          </Button>
        </Card.Content>
      </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  mono: {
    fontFamily: 'monospace',
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toggleLabel: {
    color: '#666',
  },
  webWrapper: {
    width: '100%',
    maxWidth: 450,
    alignSelf: 'center',
  },
  webCard: {
    width: '100%',
  },
});


