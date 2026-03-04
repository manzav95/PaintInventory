import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Alert, Platform, useWindowDimensions, Modal, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme, ActivityIndicator, Text, Button } from 'react-native-paper';
// NFC support is available via NFCService, but NFC UI is currently hidden.
import NFCService from './services/nfcService';
import InventoryService from './services/inventoryService';
import AuditService from './services/auditService';
import OrderService from './services/orderService';
import config from './config';
import HomeScreen from './screens/HomeScreen';
import DashboardScreen from './screens/DashboardScreen';
import ScanScreen from './screens/ScanScreen';
import QRScanScreen from './screens/QRScanScreen';
import AddItemScreen from './screens/AddItemScreen';
import LoginScreen from './screens/LoginScreen';
import ItemDetailScreen from './screens/ItemDetailScreen';
import ItemTransactionHistoryScreen from './screens/ItemTransactionHistoryScreen';
import InventoryListScreen from './screens/InventoryListScreen';
import SettingsScreen from './screens/SettingsScreen';
import UpcomingOrdersScreen from './screens/UpcomingOrdersScreen';
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
  const desktopBreakpoint = 700;
  const isDesktop = isWeb && width >= desktopBreakpoint;
  const isNarrowDesktop = isWeb && width >= desktopBreakpoint && width <= 1024;
  
  const [currentScreen, setCurrentScreen] = useState('home');
  const [previousScreen, setPreviousScreen] = useState('home');
  const [nfcStatus, setNfcStatus] = useState({ isSupported: false, isEnabled: false });
  const [selectedItem, setSelectedItem] = useState(null);
  const [scannedItem, setScannedItem] = useState(null); // Item found from QR scan
  const [inventory, setInventory] = useState([]);
  const [nextIdNumber, setNextIdNumber] = useState(1);
  const [nextIdFormatted, setNextIdFormatted] = useState('H66AAA00001');
  const [minQuantity, setMinQuantity] = useState(30);
  const [userName, setUserName] = useState(null);
  const isAdmin = userName === 'admin123';
  const actorName = isAdmin ? 'Admin' : (userName || 'unknown');
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionLoadingMessage, setActionLoadingMessage] = useState('');
  const [showAdminItemDialog, setShowAdminItemDialog] = useState(false);
  const [onOrderSummary, setOnOrderSummary] = useState({});
  const paperTheme = isDarkMode ? darkTheme : lightTheme;

  useEffect(() => {
    initializeApp();
    loadInventory();
    loadUser();
    loadThemePreference();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Paint Inventory';
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const bg = paperTheme.colors.background;
      document.body.style.backgroundColor = bg;
      document.documentElement.style.backgroundColor = bg;
    }
  }, [paperTheme.colors.background]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'hide-desktop-scrollbars-style';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        body.hide-desktop-scrollbars ::-webkit-scrollbar { display: none; }
        body.hide-desktop-scrollbars * { scrollbar-width: none; -ms-overflow-style: none; }
      `;
      document.head.appendChild(style);
    }
    if (isDesktop) {
      document.body.classList.add('hide-desktop-scrollbars');
    } else {
      document.body.classList.remove('hide-desktop-scrollbars');
    }
    return () => document.body.classList.remove('hide-desktop-scrollbars');
  }, [isDesktop]);

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

  const runWithLoading = async (message, fn) => {
    setActionLoadingMessage(message || '');
    setIsActionLoading(true);
    try {
      await fn();
    } finally {
      setIsActionLoading(false);
      setActionLoadingMessage('');
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
      const minQ = await InventoryService.getMinQuantity();
      setMinQuantity(minQ);

      try {
        const summary = await OrderService.getOnOrderSummary();
        setOnOrderSummary(summary || {});
      } catch (e) {
        console.error('Error loading on-order summary:', e);
        setOnOrderSummary({});
      }
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
    await runWithLoading('Saving check-in...', async () => {
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
    });
  };

  const handleCheckOut = async (quantity) => {
    if (!scannedItem) return;
    await runWithLoading('Saving check-out...', async () => {
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
        const msg = result.error || 'Failed to check out quantity.';
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(`Cannot check out\n\n${msg}`);
        } else {
          Alert.alert('Cannot check out', msg);
        }
      }
    });
  };

  const handleAddItem = async (item) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can add new inventory items.');
      return;
    }
    await runWithLoading('Saving new item...', async () => {
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
    });
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
        location: item.location,
        userName: actorName,
        ...(item.hasOwnProperty('minQuantity') && { minQuantity: item.minQuantity }),
        ...(item.hasOwnProperty('price') && { price: item.price }),
        ...(item.hasOwnProperty('type') && { type: item.type }),
        ...(item.hasOwnProperty('display_order') && { display_order: item.display_order }),
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

  const performDelete = async (itemId) => {
    try {
      const result = await InventoryService.deleteItem(itemId, actorName);
      if (result && result.success) {
        setSelectedItem(null);
        await loadInventory();
        setCurrentScreen('home');
        Alert.alert('Success', 'Item deleted successfully.');
        await AuditService.log({
          type: 'delete_item',
          user: actorName,
          itemId,
        });
      } else {
        Alert.alert('Error', result?.error || 'Failed to delete item.');
      }
    } catch (err) {
      console.error('Delete item error:', err);
      Alert.alert('Error', err?.message || 'Failed to delete item.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can delete inventory.');
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this item?')) {
        await performDelete(itemId);
      }
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
          onPress: () => { performDelete(itemId); },
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
      Alert.alert('Saved', `Next paint ID set to ${nextFormatted}.`);
      await AuditService.log({
        type: 'set_next_id',
        user: actorName,
        nextIdNumber: next,
      });
    } else {
      Alert.alert('Admin', result.error || 'Failed to set next ID.');
    }
  };

  const handleSetMinQuantity = async (value) => {
    if (!isAdmin) return;
    const result = await InventoryService.setMinQuantity(value, actorName);
    if (result.success) {
      setMinQuantity(value);
      Alert.alert('Saved', `Minimum quantity (low stock threshold) set to ${value}.`);
    } else {
      Alert.alert('Error', result.error || 'Failed to set minimum quantity.');
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
    await runWithLoading('Updating quantity...', async () => {
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
    });
  };

  const handleChangeItemId = async (oldId, newId) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can change paint IDs.');
      return { success: false, error: 'Not allowed' };
    }
    return await runWithLoading('Updating paint ID...', async () => {
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
    });
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
              <View style={[styles.webSidebar, isNarrowDesktop && styles.webSidebarNarrow]}>
                <HomeScreen
                  onScanQR={handleScanQR}
                  onAddManual={handleAddManual}
                  onViewInventory={() => setCurrentScreen('list')}
                  inventory={inventory}
                  minQuantity={minQuantity}
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
                  onOpenUpcomingOrders={isAdmin ? () => {
                    setPreviousScreen('home');
                    setCurrentScreen('orders');
                  } : undefined}
                  isWeb={true}
                />
              </View>
              <View style={[styles.webMain, isNarrowDesktop && styles.webMainNarrow]}>
                <DashboardScreen
                  inventory={inventory}
                  minQuantity={minQuantity}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                  showTransactionTable={!isNarrowDesktop}
                  isAdmin={isAdmin}
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
            minQuantity={minQuantity}
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
            onOpenUpcomingOrders={isAdmin ? () => {
              setPreviousScreen('home');
              setCurrentScreen('orders');
            } : undefined}
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
            onOrderSummary={onOrderSummary}
          />
        );
      case 'list':
        return (
          <InventoryListScreen
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            inventory={inventory}
            minQuantity={minQuantity}
            isAdmin={isAdmin}
            onOrderSummary={onOrderSummary}
            onItemSelect={(item) => {
              setPreviousScreen('list');
              setSelectedItem(item);
              if (isAdmin) {
                setShowAdminItemDialog(true);
              } else {
                setCurrentScreen('itemHistory');
              }
            }}
            onBack={() => setCurrentScreen('home')}
          />
        );
      case 'itemHistory':
        return (
          <ItemTransactionHistoryScreen
            item={selectedItem}
            onBack={() => setCurrentScreen('list')}
          />
        );
      case 'orders':
        return (
          <UpcomingOrdersScreen
            onBack={() => setCurrentScreen(previousScreen)}
            inventory={inventory}
            userName={actorName}
            onOrdersChanged={loadInventory}
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
            minQuantity={minQuantity}
            onSetMinQuantity={handleSetMinQuantity}
            onExportExcel={handleExportExcel}
          />
        );
      default:
        return null;
    }
  };

  return (
    <PaperProvider theme={paperTheme}>
      <View style={[styles.container, isWeb && styles.containerWeb, { backgroundColor: paperTheme.colors.background }]}>
        <StatusBar style="auto" />
        {renderScreen()}
        {isActionLoading && (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={paperTheme.colors.primary} />
              {!!actionLoadingMessage && (
                <Text style={styles.loadingText}>{actionLoadingMessage}</Text>
              )}
            </View>
          </View>
        )}
        <Modal
          visible={showAdminItemDialog}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAdminItemDialog(false)}
        >
          <TouchableOpacity
            style={styles.adminDialogOverlay}
            activeOpacity={1}
            onPress={() => setShowAdminItemDialog(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.adminDialogCard, { backgroundColor: paperTheme.colors.surface }]}
            >
              <Text style={[styles.adminDialogTitle, { color: paperTheme.colors.onSurface }]}>
                Item
              </Text>
              <Text style={[styles.adminDialogMessage, { color: paperTheme.colors.onSurfaceVariant }]}>
                View transaction history or edit item details?
              </Text>
              <View style={styles.adminDialogButtons}>
                <Button
                  mode="contained"
                  onPress={() => {
                    setShowAdminItemDialog(false);
                    setCurrentScreen('itemHistory');
                  }}
                  style={styles.adminDialogButton}
                >
                  Transaction history
                </Button>
                <Button
                  mode="contained"
                  onPress={() => {
                    setShowAdminItemDialog(false);
                    setCurrentScreen('detail');
                  }}
                  style={styles.adminDialogButton}
                >
                  Edit item details
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => setShowAdminItemDialog(false)}
                  style={styles.adminDialogButton}
                >
                  Cancel
                </Button>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 8,
  },
  containerWeb: {
    width: '100%',
    minHeight: '100vh',
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
  webSidebarNarrow: {
    width: undefined,
    minWidth: 0,
    flex: 0.6,
  },
  webMain: {
    flex: 1,
    paddingLeft: 20,
    ...(Platform.OS === 'web'
      ? {
          overflowY: 'auto',
          overflowX: 'hidden',
        }
      : {
          overflow: 'hidden',
        }),
  },
  webMainNarrow: {
    flex: 0.4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#222',
    opacity: 0.95,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  adminDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  adminDialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 24,
    elevation: 4,
  },
  adminDialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  adminDialogMessage: {
    fontSize: 15,
    marginBottom: 20,
  },
  adminDialogButtons: {
    gap: 12,
  },
  adminDialogButton: {
    marginBottom: 8,
  },
});

