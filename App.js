import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Alert, Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
// NFC support is available via NFCService, but NFC UI is currently hidden.
import NFCService from './services/nfcService';
import InventoryService from './services/inventoryService';
import AuditService from './services/auditService';
import config from './config';
import HomeScreen from './screens/HomeScreen';
import DashboardScreen from './screens/DashboardScreen';
import ScanScreen from './screens/ScanScreen';
import QRScanScreen from './screens/QRScanScreen';
import AddItemScreen from './screens/AddItemScreen';
import LoginScreen from './screens/LoginScreen';
import ItemDetailScreen from './screens/ItemDetailScreen';
import InventoryListScreen from './screens/InventoryListScreen';
import SettingsScreen from './screens/SettingsScreen';
import CheckInOutScreen from './screens/CheckInOutScreen';

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6f95ab',
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6f95ab',
  },
};

export default function App() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const isDesktop = isWeb && width > 768;
  
  const [currentScreen, setCurrentScreen] = useState('home');
  const [previousScreen, setPreviousScreen] = useState('home');
  const [nfcStatus, setNfcStatus] = useState({ isSupported: false, isEnabled: false });
  const [selectedItem, setSelectedItem] = useState(null);
  const [scannedItem, setScannedItem] = useState(null); // Item found from QR scan
  const [inventory, setInventory] = useState([]);
  const [nextIdNumber, setNextIdNumber] = useState(1);
  const [nextIdFormatted, setNextIdFormatted] = useState('H66AAA00001');
  const [userName, setUserName] = useState(null);
  const isAdmin = userName === 'admin123';
  const actorName = isAdmin ? 'Admin' : (userName || 'unknown');
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [isRefreshing, setIsRefreshing] = useState(false);
  const paperTheme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    initializeApp();
    loadInventory();
    loadUser();
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const raw = await AsyncStorage.getItem('@inventory_dark_mode');
      if (raw === null) {
        // Default to dark mode if no preference is stored
        setIsDarkMode(true);
        return;
      }
      setIsDarkMode(raw === 'true');
    } catch (error) {
      console.error('Load theme preference error:', error);
      // Default to dark mode on error
      setIsDarkMode(true);
    }
  };

  const toggleDarkMode = async () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    try {
      await AsyncStorage.setItem('@inventory_dark_mode', String(next));
    } catch (error) {
      console.error('Save theme preference error:', error);
    }
  };

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem('@inventory_user_name');
      if (stored) {
        setUserName(stored);
      } else {
        setCurrentScreen('login');
      }
    } catch (error) {
      console.error('Load user error:', error);
      setCurrentScreen('login');
    }
  };

  const handleLogin = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    await AsyncStorage.setItem('@inventory_user_name', trimmed);
    setUserName(trimmed);
    setCurrentScreen('home');
  };

  const handleSwitchUser = async () => {
    await AsyncStorage.removeItem('@inventory_user_name');
    setUserName(null);
    setSelectedItem(null);
    setPreviousScreen('home');
    setCurrentScreen('login');
  };

  const initializeApp = async () => {
    try {
      // NFC initialization is disabled for now; app runs as QR + manual only.
      setNfcStatus({ isSupported: false, isEnabled: false });
    } catch (error) {
      console.error('App initialization error:', error);
      setNfcStatus({ isSupported: false, isEnabled: false, error: error.message });
    }
  };

  const loadInventory = async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsRefreshing(true);
      }

      // Test API connection
      const isConnected = await InventoryService.testConnection();
      if (!isConnected) {
        Alert.alert(
          'Connection Error',
          `Cannot connect to server at ${config.API_URL}. Please ensure the server is running.`,
          [{ text: 'OK' }]
        );
        if (showLoading) {
          setIsRefreshing(false);
        }
        return;
      }

      // Ensure any legacy IDs get converted first
      await InventoryService.migrateOldIds();

      const items = await InventoryService.getAllItems();
      setInventory(items);

      const next = await InventoryService.getNextIdNumber();
      setNextIdNumber(next);
      const formatted = await InventoryService.getNextIdFormatted();
      setNextIdFormatted(formatted);
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Error', `Failed to load inventory: ${error.message}`);
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    loadInventory(true);
  };

  const handleScanNFC = async () => {
    // NFC scanning is disabled in the current UI; keep handler as a no-op.
    Alert.alert('Not Available', 'NFC scanning is currently disabled. Use QR codes instead.');
  };

  const handleScanQR = () => {
    setCurrentScreen('qrscan');
  };

  const handleAddManual = () => {
    if (!userName) {
      setCurrentScreen('login');
      return;
    }
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can add new inventory items.');
      return;
    }
    setCurrentScreen('add');
  };

  const handleScanResult = async (itemId) => {
    if (!itemId) {
      Alert.alert('Scan Failed', 'Could not read item ID.');
      setCurrentScreen('home');
      return;
    }

    const normalizedId = (() => {
      const raw = itemId.toString().trim().toUpperCase();
      // If it's a 1-4 digit number (legacy format), pad it to 4 digits for backward compatibility
      if (/^\d{1,4}$/.test(raw)) return raw.padStart(4, '0');
      // If it's already in Sherwin Williams format, return as-is
      if (/^H66[A-Z]{3}\d{5}$/.test(raw)) return raw;
      // Otherwise return as-is (could be partial or other format)
      return raw;
    })();

    // Check if item exists
    let item = await InventoryService.getItem(normalizedId);
    
    if (!item) {
      Alert.alert(
        'Paint Not Found',
        `No paint found with ID: ${normalizedId}. Please add the paint manually first, then scan to update quantity.`,
        [{ text: 'OK', onPress: () => setCurrentScreen('home') }]
      );
      return;
    }

    // Item exists - show check in/out screen
    setScannedItem(item);
    setCurrentScreen('checkinout');
  };

  const handleCheckIn = async (quantity) => {
    if (!scannedItem) return;
    
    // All users can check in via QR scan
    const result = await InventoryService.updateQuantity(scannedItem.id, quantity, actorName, 'check_in');
    if (result.success) {
      await loadInventory();
      Alert.alert(
        'Success',
        `Checked in ${quantity} gallons for "${scannedItem.name}".\n\nNew quantity: ${result.item.quantity} gallons`
      );
      await AuditService.log({
        type: 'check_in',
        user: actorName,
        itemId: scannedItem.id,
        quantity: quantity,
        newQuantity: result.item.quantity,
      });
      setScannedItem(null);
      setPreviousScreen('home');
      setCurrentScreen('list');
    } else {
      Alert.alert('Error', 'Failed to check in quantity.');
    }
  };

  const handleCheckOut = async (quantity) => {
    if (!scannedItem) return;
    
    // All users can check out via QR scan
    const result = await InventoryService.updateQuantity(scannedItem.id, -quantity, actorName, 'check_out');
    if (result.success) {
      await loadInventory();
      Alert.alert(
        'Success',
        `Checked out ${quantity} gallons for "${scannedItem.name}".\n\nNew quantity: ${result.item.quantity} gallons`
      );
      await AuditService.log({
        type: 'check_out',
        user: actorName,
        itemId: scannedItem.id,
        quantity: quantity,
        newQuantity: result.item.quantity,
      });
      setScannedItem(null);
      setPreviousScreen('home');
      setCurrentScreen('list');
    } else {
      Alert.alert('Error', 'Failed to check out quantity.');
    }
  };

  const handleAddItem = async (item) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can add new inventory items.');
      return;
    }

    const result = await InventoryService.addItem({
      ...item,
      // Treat manual creation as an initial "last scanned" event so the UI isn't blank
      lastScanned: new Date().toISOString(),
      lastScannedBy: actorName,
      userName: actorName,
    });
    if (result.success) {
      await loadInventory();
      setCurrentScreen('home');
      setPreviousScreen('home');
      Alert.alert('Success', 'Item added successfully.');
      await AuditService.log({
        type: 'add_item',
        user: actorName,
        itemId: result.item?.id,
        name: result.item?.name,
        quantity: result.item?.quantity,
      });
    } else {
      Alert.alert('Error', result.error || 'Failed to add item.');
    }
  };

  const handleWriteTag = async (itemId) => {
    if (!nfcStatus.isEnabled) {
      Alert.alert('NFC Disabled', 'Please enable NFC in your device settings.');
      return;
    }

    Alert.alert(
      'Write to Tag',
      'Hold your device near an NFC tag to write the item ID.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Write',
          onPress: async () => {
            const result = await NFCService.writeTag(itemId);
            if (result.success) {
              Alert.alert('Success', 'Item ID written to tag successfully.');
            } else {
              Alert.alert('Error', result.error || result.message || 'Failed to write to tag.');
            }
          },
        },
      ]
    );
  };

  const handleSaveItem = async (item) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can make changes to inventory items.');
      return;
    }

    const isExistingItem = !!selectedItem;
    
    let result;
    if (isExistingItem) {
      const updates = {
        name: item.name,
        quantity: item.quantity,
        description: item.description,
        location: item.location,
        userName: actorName,
      };
      result = await InventoryService.updateItem(item.id || selectedItem?.id, updates);
    } else {
      result = await InventoryService.addItem({
        ...item,
        userName: actorName,
      });
    }
    
    if (result.success) {
      await loadInventory();
      setCurrentScreen(previousScreen);
      if (result.item) {
        setSelectedItem(result.item);
      }
      Alert.alert('Success', 'Item saved successfully.');
      await AuditService.log({
        type: isExistingItem ? 'edit_item' : 'add_item',
        user: actorName,
        itemId: result.item?.id,
        name: result.item?.name,
        quantity: result.item?.quantity,
      });
    } else {
      Alert.alert('Error', result.error || 'Failed to save item.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can delete inventory.');
      return;
    }
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await InventoryService.deleteItem(itemId, actorName);
            if (result.success) {
              await loadInventory();
              setCurrentScreen('home');
              Alert.alert('Success', 'Item deleted successfully.');
              await AuditService.log({
                type: 'delete_item',
                user: actorName,
                itemId,
              });
            } else {
              Alert.alert('Error', result.error || 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const handleSetNextIdNumber = async (newNextIdNumber) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can change the next ID.');
      return;
    }
    const result = await InventoryService.setNextIdNumber(newNextIdNumber, actorName);
    if (result.success) {
      const next = await InventoryService.getNextIdNumber();
      setNextIdNumber(next);
      const nextFormatted = await InventoryService.getNextIdFormatted();
      setNextIdFormatted(nextFormatted);
      Alert.alert('Admin', `Next paint ID set to ${nextFormatted}.`);
      await AuditService.log({
        type: 'set_next_id',
        user: actorName,
        nextIdNumber: next,
      });
    } else {
      Alert.alert('Admin', result.error || 'Failed to set next ID.');
    }
  };

  const handleExportExcel = async () => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can export Excel files.');
      return;
    }
    
    try {
      const API_URL = config.API_URL;
      const url = `${API_URL}/api/export/excel`;
      
      // For web, open in new tab
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        Alert.alert('Success', 'Excel file download started.');
      } else {
        // For mobile, we'd need to use a library like expo-file-system
        // For now, show the URL
        Alert.alert(
          'Export Excel',
          `Please visit this URL to download:\n${url}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      Alert.alert('Error', 'Failed to export Excel file.');
    }
  };

  const handleQuantityChange = async (itemId, change) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can change inventory quantities.');
      return;
    }

    const result = await InventoryService.updateQuantity(itemId, change, actorName);
    if (result.success) {
      await loadInventory();
      if (selectedItem && selectedItem.id === itemId) {
        setSelectedItem(result.item);
      }
      await AuditService.log({
        type: 'qty_adjust',
        user: actorName,
        itemId,
        delta: change,
      });
    }
  };

  const handleChangeItemId = async (oldId, newId) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can change paint IDs.');
      return { success: false, error: 'Not allowed' };
    }
    const result = await InventoryService.updateItemId(oldId, newId, actorName);
    if (result.success) {
      await loadInventory();
      if (selectedItem && selectedItem.id === oldId) {
        const updatedItem = await InventoryService.getItem(newId);
        if (updatedItem) {
          setSelectedItem(updatedItem);
        }
      }
      await AuditService.log({
        type: 'change_item_id',
        user: actorName,
        from: (oldId ?? '').toString(),
        to: result.itemId || newId,
      });
      return result;
    } else {
      return result;
    }
  };

  const renderScreen = () => {
    if (!userName && currentScreen !== 'login') {
      return <LoginScreen onLogin={handleLogin} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />;
    }

    switch (currentScreen) {
      case 'login':
        return <LoginScreen onLogin={handleLogin} isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />;
      case 'home':
        // Show dashboard on web/desktop, regular home on mobile
        if (isDesktop) {
          return (
            <View style={styles.webContainer}>
              <View style={styles.webSidebar}>
                <HomeScreen
                  onScanQR={handleScanQR}
                  onAddManual={handleAddManual}
                  onViewInventory={() => setCurrentScreen('list')}
                  inventory={inventory}
                  userName={isAdmin ? 'Admin' : userName}
                  isAdmin={isAdmin}
                  onSwitchUser={handleSwitchUser}
                  nextIdNumber={nextIdNumber}
                  onSetNextIdNumber={handleSetNextIdNumber}
                  isDarkMode={isDarkMode}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                  onToggleDarkMode={toggleDarkMode}
                  onOpenSettings={() => {
                    setPreviousScreen('home');
                    setCurrentScreen('settings');
                  }}
                  isWeb={true}
                />
              </View>
              <View style={styles.webMain}>
                <DashboardScreen
                  inventory={inventory}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                />
              </View>
            </View>
          );
        }
        return (
          <HomeScreen
            onScanQR={handleScanQR}
            onAddManual={handleAddManual}
            onViewInventory={() => setCurrentScreen('list')}
            inventory={inventory}
            nfcEnabled={nfcStatus.isEnabled}
            userName={userName}
            isAdmin={isAdmin}
            onSwitchUser={handleSwitchUser}
            nextIdNumber={nextIdNumber}
            onSetNextIdNumber={handleSetNextIdNumber}
            isDarkMode={isDarkMode}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleDarkMode={toggleDarkMode}
            onOpenSettings={() => {
              setPreviousScreen('home');
              setCurrentScreen('settings');
            }}
          />
        );
      case 'scan':
        return (
          <ScanScreen
            onScanResult={handleScanResult}
            onCancel={() => setCurrentScreen('home')}
          />
        );
      case 'qrscan':
        return (
          <QRScanScreen
            onScanResult={handleScanResult}
            onCancel={() => setCurrentScreen('home')}
          />
        );
      case 'checkinout':
        return (
          <CheckInOutScreen
            item={scannedItem}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onCancel={() => {
              setScannedItem(null);
              setCurrentScreen('home');
            }}
          />
        );
      case 'add':
        return (
          <AddItemScreen
            onSave={handleAddItem}
            onCancel={() => setCurrentScreen('home')}
          />
        );
      case 'detail':
        return (
          <ItemDetailScreen
            item={selectedItem}
            onSave={handleSaveItem}
            onDelete={handleDeleteItem}
            onChangeId={handleChangeItemId}
            onWriteTag={handleWriteTag}
            onQuantityChange={handleQuantityChange}
            onBack={() => setCurrentScreen(previousScreen)}
            isAdmin={isAdmin}
          />
        );
      case 'list':
        return (
          <InventoryListScreen
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            inventory={inventory}
            isAdmin={isAdmin}
            onItemSelect={(item) => {
              setPreviousScreen('list');
              setSelectedItem(item);
              setCurrentScreen('detail');
            }}
            onBack={() => setCurrentScreen('home')}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            onBack={() => setCurrentScreen(previousScreen)}
            userName={actorName}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
            onSwitchUser={handleSwitchUser}
            isAdmin={isAdmin}
            nextIdNumber={nextIdNumber}
            nextIdFormatted={nextIdFormatted}
            onSetNextIdNumber={handleSetNextIdNumber}
            onExportExcel={handleExportExcel}
          />
        );
      default:
        return null;
    }
  };

  return (
    <PaperProvider theme={paperTheme}>
      <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
        <StatusBar style="auto" />
        {renderScreen()}
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 25,
  },
  webContainer: {
    flex: 1,
    flexDirection: 'row',
    maxWidth: 1600,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  webSidebar: {
    width: 350,
    minWidth: 350,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    paddingRight: 16,
  },
  webMain: {
    flex: 1,
    paddingLeft: 20,
    overflow: 'hidden',
  },
});

