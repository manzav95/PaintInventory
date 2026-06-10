import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Alert, Platform, Modal, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme, ActivityIndicator, Text, Button } from 'react-native-paper';
// NFC support is available via NFCService, but NFC UI is currently hidden.
import NFCService from './services/nfcService';
import InventoryService from './services/inventoryService';
import AuditService from './services/auditService';
import { enqueueQuantityAction, syncPendingQuantity } from './utils/offlineQueue';
import OrderService from './services/orderService';
import MaterialUsageService from './services/materialUsageService';
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
import PlaceOrderScreen from './screens/PlaceOrderScreen';
import CheckInOutScreen from './screens/CheckInOutScreen';
import MaterialUsageScreen from './screens/MaterialUsageScreen';
import ReportsScreen from './screens/ReportsScreen';
import AppShell from './components/AppShell';
import AppSidebar from './components/AppSidebar';
import { useAppLayout, shouldUseShell } from './utils/layout';
import {
  DARK_SITE_BACKGROUND,
  DARK_SURFACE_ELEVATED,
  DARK_BORDER,
} from './utils/themeColors';
import {
  recordUserActivity,
  getLastUserActivity,
  isIdleExpired,
  clearUserActivity,
  isAdminUser,
} from './utils/idleSession';
import useIdleLogout from './utils/useIdleLogout';
import LoginLogService from './services/loginLogService';

const NEUTRAL_LIGHT = {
  bg: '#f0f0f0',
  elevated: '#fafafa',
  elevatedHigh: '#ffffff',
  border: '#d0d0d0',
};

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6f95ab',
    primaryContainer: '#d4e3eb',
    onPrimaryContainer: '#1a3a4a',
    background: NEUTRAL_LIGHT.bg,
    surface: NEUTRAL_LIGHT.bg,
    surfaceVariant: NEUTRAL_LIGHT.elevated,
    surfaceContainer: NEUTRAL_LIGHT.elevated,
    surfaceContainerHigh: NEUTRAL_LIGHT.elevated,
    surfaceContainerHighest: NEUTRAL_LIGHT.elevatedHigh,
    outlineVariant: NEUTRAL_LIGHT.border,
    elevation: {
      level0: NEUTRAL_LIGHT.bg,
      level1: NEUTRAL_LIGHT.elevated,
      level2: NEUTRAL_LIGHT.elevated,
      level3: NEUTRAL_LIGHT.elevatedHigh,
      level4: NEUTRAL_LIGHT.elevatedHigh,
      level5: NEUTRAL_LIGHT.elevatedHigh,
    },
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6f95ab',
    primaryContainer: '#3d5058',
    onPrimaryContainer: '#d0e4ed',
    secondaryContainer: DARK_SURFACE_ELEVATED,
    onSecondaryContainer: '#e8e8e8',
    background: DARK_SITE_BACKGROUND,
    surface: DARK_SITE_BACKGROUND,
    surfaceVariant: DARK_SURFACE_ELEVATED,
    surfaceContainer: DARK_SURFACE_ELEVATED,
    surfaceContainerHigh: DARK_SURFACE_ELEVATED,
    surfaceContainerHighest: DARK_SURFACE_ELEVATED,
    surfaceDisabled: DARK_SURFACE_ELEVATED,
    outline: DARK_BORDER,
    outlineVariant: DARK_BORDER,
    elevation: {
      level0: DARK_SITE_BACKGROUND,
      level1: DARK_SURFACE_ELEVATED,
      level2: DARK_SURFACE_ELEVATED,
      level3: DARK_SURFACE_ELEVATED,
      level4: DARK_SURFACE_ELEVATED,
      level5: DARK_SURFACE_ELEVATED,
    },
  },
};

export default function App() {
  const isWeb = Platform.OS === 'web';
  const {
    showPersistentSidebar,
    isNarrowDesktop,
    isWebDesktop,
    showCheckInOutNav,
  } = useAppLayout();

  const [currentScreen, setCurrentScreen] = useState('home');
  const [previousScreen, setPreviousScreen] = useState('home');
  const [nfcStatus, setNfcStatus] = useState({ isSupported: false, isEnabled: false });
  const [selectedItem, setSelectedItem] = useState(null);
  const [scannedItem, setScannedItem] = useState(null); // Item found from QR scan
  const [inventory, setInventory] = useState([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [materialUsageOvertime, setMaterialUsageOvertime] = useState(false);
  const [userName, setUserName] = useState(null);
  const isAdmin = userName === 'admin123';
  const actorName = isAdmin ? 'Admin' : (userName || 'unknown');
  const idleLogoutTriggeredRef = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionLoadingMessage, setActionLoadingMessage] = useState('');
  const [scanLookupLoading, setScanLookupLoading] = useState(false);
  const [showAdminItemDialog, setShowAdminItemDialog] = useState(false);
  const [onOrderSummary, setOnOrderSummary] = useState({});
  /** Cached PO list (Receive PO modal + Purchase Orders page) — background load, refresh on demand. */
  const [receiveOrdersCache, setReceiveOrdersCache] = useState(null);
  const [receiveOrdersLoading, setReceiveOrdersLoading] = useState(false);
  const receiveOrdersFetchStarted = useRef(false);
  /** Cached audit logs (dashboard stats, inventory analytics, transaction history). */
  const [auditLogsCache, setAuditLogsCache] = useState(null);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const recycleSyncInFlight = useRef(false);
  const jobHistorySyncInFlight = useRef(false);
  const [recycleDueFilter, setRecycleDueFilter] = useState(false);
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [ordersInitialFilter, setOrdersInitialFilter] = useState(null); // null | 'existing' | 'back_orders' | 'late_orders' | 'completed'
  const [inventoryViewState, setInventoryViewState] = useState({
    viewMode: 'inventory', // 'inventory' | 'colorBook'
    bookFilter: 'standard', // 'standard' | 'custom'
    scrollOffset: 0,
  });
  const paperTheme = isDarkMode ? darkTheme : lightTheme;
  const embeddedInShell = shouldUseShell(currentScreen, showPersistentSidebar);

  const navigateTo = (screen, options = {}) => {
    if (screen === 'reports' && !isAdmin) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'ordersInitialFilter')) {
      setOrdersInitialFilter(options.ordersInitialFilter);
    } else if (screen === 'orders') {
      setOrdersInitialFilter(null);
    }
    if (screen === 'materialUsage' && isWeb && typeof window !== 'undefined') {
      window.location.hash = '#/material-usage';
    } else if (screen === 'reports' && isWeb && typeof window !== 'undefined') {
      window.location.hash = '#/reports';
    } else if (
      (screen === 'home' || screen === 'list') &&
      isWeb &&
      typeof window !== 'undefined'
    ) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (window.location.search || ''),
      );
    }
    setPreviousScreen(currentScreen);
    setCurrentScreen(screen);
  };

  // When we have a logged-in user, try to sync any offline check-in/out actions.
  useEffect(() => {
    if (!actorName) return;
    (async () => {
      try {
        const result = await syncPendingQuantity(actorName);
        if (result.synced > 0) {
          await loadInventory();
        }
      } catch (e) {
        console.error('Error syncing offline transactions:', e);
      }
    })();
  }, [actorName]);

  useEffect(() => {
    initializeApp();
    loadInventory();
    loadUser();
    loadThemePreference();
  }, []);

  useEffect(() => {
    if (currentScreen === 'reports' && userName && !isAdmin) {
      setCurrentScreen('home');
    }
  }, [currentScreen, userName, isAdmin]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const titles = {
        materialUsage: 'Material Usage',
        orders: 'Purchase Orders',
        placeOrder: 'Place Order',
        list: 'Inventory',
        reports: 'Reports',
        settings: 'Settings',
        home: 'Dashboard',
      };
      document.title = titles[currentScreen] || 'Paint Inventory';
    }
  }, [currentScreen]);

  // Hash routing: #/material-usage opens Material Usage (all users)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const applyHash = () => {
      const hash = (window.location.hash || '').replace(/^#/, '') || '/';
      const path = hash.startsWith('/') ? hash : `/${hash}`;
      if (path === '/material-usage' && userName != null) {
        setCurrentScreen('materialUsage');
      } else if (path === '/reports' && userName != null && userName === 'admin123') {
        setCurrentScreen('reports');
      }
    };
    applyHash();
    const onHashChange = () => {
      const h = (window.location.hash || '').replace(/^#/, '') || '/';
      const p = h.startsWith('/') ? h : `/${h}`;
      if (p === '/material-usage' && userName != null) {
        setCurrentScreen('materialUsage');
      } else if (p === '/reports' && userName != null && userName === 'admin123') {
        setCurrentScreen('reports');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [userName]);

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
    if (isWebDesktop) {
      document.body.classList.add('hide-desktop-scrollbars');
    } else {
      document.body.classList.remove('hide-desktop-scrollbars');
    }
    return () => document.body.classList.remove('hide-desktop-scrollbars');
  }, [isWebDesktop]);

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
        if (!isAdminUser(stored)) {
          const last = await getLastUserActivity();
          if (isIdleExpired(last)) {
            await AsyncStorage.removeItem('@inventory_user_name');
            await clearUserActivity();
            setCurrentScreen('login');
            return;
          }
          if (!last) {
            await recordUserActivity();
          }
        }
        idleLogoutTriggeredRef.current = false;
        setUserName(stored);
        setCurrentScreen(stored === 'admin123' ? 'home' : 'list');
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
    await recordUserActivity();
    LoginLogService.recordLogin(trimmed).catch(() => {});
    idleLogoutTriggeredRef.current = false;
    setUserName(trimmed);
    setCurrentScreen(trimmed === 'admin123' ? 'home' : 'list');
  };

  const handleSwitchUser = async () => {
    await AsyncStorage.removeItem('@inventory_user_name');
    await clearUserActivity();
    setUserName(null);
    setSelectedItem(null);
    setPreviousScreen('home');
    setCurrentScreen('login');
  };

  const handleIdleLogout = useCallback(async () => {
    if (idleLogoutTriggeredRef.current) return;
    idleLogoutTriggeredRef.current = true;
    await AsyncStorage.removeItem('@inventory_user_name');
    await clearUserActivity();
    setUserName(null);
    setSelectedItem(null);
    setPreviousScreen('home');
    setCurrentScreen('login');
    Alert.alert(
      'Session ended',
      'You were logged out after 5 hours of inactivity.',
    );
  }, []);

  const idleTouchCaptureProps = useIdleLogout(userName, handleIdleLogout);

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

  const refreshReceiveOrders = useCallback(async (force = false) => {
    if (receiveOrdersLoading && !force) return;
    if (!force && receiveOrdersCache !== null) return;
    setReceiveOrdersLoading(true);
    try {
      const list = await OrderService.getOrders(200);
      setReceiveOrdersCache(Array.isArray(list) ? list : []);
      receiveOrdersFetchStarted.current = true;
    } catch (e) {
      console.error('Error prefetching receive PO list:', e);
      if (force) {
        Alert.alert('Error', e?.message || 'Could not load orders.');
      }
    } finally {
      setReceiveOrdersLoading(false);
    }
  }, [receiveOrdersCache, receiveOrdersLoading]);

  const refreshAuditLogs = useCallback(async (force = false) => {
    if (auditLogsLoading && !force) return;
    if (!force && auditLogsCache !== null) return;
    setAuditLogsLoading(true);
    try {
      const logs = await AuditService.list(1000);
      setAuditLogsCache(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error('Error prefetching audit logs:', e);
      if (force) {
        Alert.alert('Error', e?.message || 'Could not load activity history.');
      }
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditLogsCache, auditLogsLoading]);

  // Background prefetch for logged-in session (no-op if caches already warm).
  useEffect(() => {
    if (!userName) return;
    refreshReceiveOrders(false);
    refreshAuditLogs(false);
  }, [userName, refreshReceiveOrders, refreshAuditLogs]);

  const loadInventory = async (showLoading = false, { refreshCaches = false } = {}) => {
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

      // Background prefetch — skipped on later visits unless refreshCaches / cache empty.
      refreshReceiveOrders(refreshCaches);
      refreshAuditLogs(refreshCaches);

      const needsRecycleBackfill = items.some((i) => {
        const t = (i.type || '').toLowerCase();
        const isCustom = t === 'custom_paint' || t === 'custom_stain';
        const hasRecycle =
          i.recycle_date != null && String(i.recycle_date).trim() !== '';
        return isCustom && !hasRecycle;
      });
      if (needsRecycleBackfill && !recycleSyncInFlight.current) {
        recycleSyncInFlight.current = true;
        InventoryService.syncRecycleDatesFromAudit()
          .then(async (r) => {
            if (r?.success && (r.updated || 0) > 0) {
              const fresh = await InventoryService.getAllItems();
              setInventory(fresh);
            }
          })
          .catch((e) => console.error('Recycle date sync:', e))
          .finally(() => {
            recycleSyncInFlight.current = false;
          });
      }

      if (!jobHistorySyncInFlight.current) {
        jobHistorySyncInFlight.current = true;
        InventoryService.syncJobHistoryFromOrders()
          .then(async (r) => {
            if (r?.success && (r.updated || 0) > 0) {
              const summary = await OrderService.getOnOrderSummary();
              setOnOrderSummary(summary || {});
            }
          })
          .catch((e) => console.error('Job history sync:', e))
          .finally(() => {
            jobHistorySyncInFlight.current = false;
          });
      }

      try {
        const ot = await MaterialUsageService.getOvertime();
        setMaterialUsageOvertime(ot);
      } catch (e) {
        console.error('Error loading overtime setting:', e);
      }
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
      setInventoryLoaded(true);
      if (showLoading) {
        setIsRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    loadInventory(true, { refreshCaches: true });
  };

  const handleScanNFC = async () => {
    // NFC scanning is disabled in the current UI; keep handler as a no-op.
    Alert.alert('Not Available', 'NFC scanning is currently disabled. Use QR codes instead.');
  };

  const handleScanQR = () => {
    navigateTo('qrscan');
  };

  const exitCheckInFlow = () => {
    setScannedItem(null);
    setCurrentScreen(previousScreen || 'home');
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
      setCurrentScreen(previousScreen || 'home');
      return;
    }

    setScanLookupLoading(true);
    try {
      const normalizedId = (() => {
        const raw = itemId.toString().trim().toUpperCase();
        // If it's a 1-4 digit number (legacy format), pad it to 4 digits for backward compatibility
        if (/^\d{1,4}$/.test(raw)) return raw.padStart(4, '0');
        // If it's already in Sherwin Williams format, return as-is
        if (/^H66[A-Z]{3}\d{5}$/.test(raw)) return raw;
        // Otherwise return as-is (could be partial or other format)
        return raw;
      })();

      let item = null;
      try {
        // Online lookup first
        item = await InventoryService.getItem(normalizedId);
      } catch (err) {
        const msg = err?.message || String(err);
        // Likely offline or server unreachable – fall back to local inventory
        if (/Network request failed|Failed to fetch|TypeError|NetworkError|HTTP 502|HTTP 503|HTTP 504/i.test(msg)) {
          const norm = normalizedId.toLowerCase();
          item =
            inventory.find(
              (i) =>
                String(i.id ?? '')
                  .trim()
                  .toLowerCase() === norm ||
                String(i.external_code ?? '')
                  .trim()
                  .toLowerCase() === norm,
            ) || null;
        } else {
          throw err;
        }
      }

      if (!item) {
        const title = 'Paint Not Found';
        const msg =
          `No paint found with ID: ${normalizedId}.\n\n` +
          'If you are offline, make sure the paint exists in this device’s inventory first (via a full sync while online).';

        // RN Web `Alert.alert` can be unreliable/suppressed; use browser-native alert.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`${title}\n\n${msg}`);
          setCurrentScreen('list');
        } else {
          Alert.alert(title, msg, [
            { text: 'OK', onPress: () => setCurrentScreen('list') },
          ]);
        }
        return;
      }

      // Item exists - show check in/out screen
      setScannedItem(item);
      setCurrentScreen('checkinout');
    } finally {
      setScanLookupLoading(false);
    }
  };

  const handleCheckIn = async (quantity) => {
    if (!scannedItem) return;
    await runWithLoading('Saving check-in...', async () => {
      try {
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
        } else {
          Alert.alert('Error', result.error || 'Failed to check in quantity.');
          return;
        }
      } catch (err) {
        // Likely offline – enqueue for later sync instead of failing the user flow
        await enqueueQuantityAction({
          itemId: scannedItem.id,
          change: quantity,
          userName: actorName,
          actionType: 'check_in',
        });
        Alert.alert(
          'Saved offline',
          `Check-in for "${scannedItem.name}" will sync when you are back online.`
        );
      }
      setScannedItem(null);
      const target = previousScreen || 'list';
      setCurrentScreen(target);
    });
  };

  const handleReceiveDelivery = async (orderId, quantity) => {
    if (!scannedItem) return;
    await runWithLoading('Recording delivery...', async () => {
      try {
        const receiveResult = await OrderService.receiveOrderLine(orderId, scannedItem.id, quantity);
        if (!receiveResult.success) throw new Error(receiveResult.error || 'Failed to record PO receive');
        const result = await InventoryService.updateQuantity(scannedItem.id, quantity, actorName, 'receiving');
        if (!result.success) throw new Error(result.error || 'Failed to update inventory');
        await loadInventory();
        await refreshReceiveOrders(true);
        Alert.alert(
          'Success',
          `Received ${quantity} gallons for "${scannedItem.name}".\n\nNew quantity: ${result.item.quantity} gallons`
        );
        await AuditService.log({
          type: 'receiving',
          user: actorName,
          itemId: scannedItem.id,
          quantity,
          newQuantity: result.item.quantity,
          orderId,
        });
      } catch (err) {
        // Likely offline – enqueue for later sync instead of failing the user flow
        await enqueueQuantityAction({
          itemId: scannedItem.id,
          change: quantity,
          userName: actorName,
          actionType: 'receiving',
          orderId,
        });
        Alert.alert(
          'Saved offline',
          `Receiving for "${scannedItem.name}" will sync when you are back online.`
        );
      }
      setScannedItem(null);
      const target = previousScreen || 'home';
      setCurrentScreen(target);
    });
  };

  const handleCheckOut = async (quantity) => {
    if (!scannedItem) return;
    await runWithLoading('Saving check-out...', async () => {
      try {
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
        } else {
          const msg = result.error || 'Failed to check out quantity.';
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
            window.alert(`Cannot check out\n\n${msg}`);
          } else {
            Alert.alert('Cannot check out', msg);
          }
          return;
        }
      } catch (err) {
        // Likely offline – enqueue for later sync instead of failing the user flow
        await enqueueQuantityAction({
          itemId: scannedItem.id,
          change: -quantity,
          userName: actorName,
          actionType: 'check_out',
        });
        Alert.alert(
          'Saved offline',
          `Check-out for "${scannedItem.name}" will sync when you are back online.`
        );
      }
      setScannedItem(null);
      const target = previousScreen || 'list';
      setCurrentScreen(target);
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
    const idForApi = String(item.id ?? selectedItem?.id ?? '').trim();

    let result;
    if (isExistingItem) {
      const updates = {
        name: item.name,
        quantity: item.quantity,
        location: item.location,
        userName: actorName,
        ...(Object.prototype.hasOwnProperty.call(item, 'is_mixing') && {
          is_mixing: item.is_mixing,
        }),
        // Backward-compatible fallback: older servers might not persist is_mixing yet.
        ...(Object.prototype.hasOwnProperty.call(item, 'is_mixing') && {
          po_label_ap: item.is_mixing === false,
          po_label_mixing: item.is_mixing !== false,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'minQuantity') && {
          minQuantity: item.minQuantity,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'price') && { price: item.price }),
        ...(Object.prototype.hasOwnProperty.call(item, 'type') && { type: item.type }),
        ...(Object.prototype.hasOwnProperty.call(item, 'display_order') && {
          display_order: item.display_order,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'hex_color') && {
          hex_color: item.hex_color,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'lot_date') && {
          lot_date: item.lot_date,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'external_code') && {
          external_code: item.external_code,
        }),
        ...(Object.prototype.hasOwnProperty.call(item, 'rex') && {
          rex: item.rex,
        }),
      };
      result = await InventoryService.updateItem(idForApi, updates);
    } else {
      result = await InventoryService.addItem({
        ...item,
        userName: actorName,
      });
    }
    
    if (result.success) {
      await loadInventory();
      setCurrentScreen(previousScreen);
      if (isExistingItem && idForApi) {
        try {
          const fresh = await InventoryService.getItem(idForApi);
          if (fresh) {
            setSelectedItem(fresh);
          } else if (result.item) {
            setSelectedItem(result.item);
          }
        } catch (e) {
          if (result.item) setSelectedItem(result.item);
        }
      } else if (result.item) {
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

  const handleSetMaterialUsageOvertime = async (enabled) => {
    if (!isAdmin) return;
    try {
      await MaterialUsageService.setOvertime(enabled);
      setMaterialUsageOvertime(enabled);
      Alert.alert('Saved', `Overtime is now ${enabled ? 'on' : 'off'} for Material Usage shift times.`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save overtime setting.');
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
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        Alert.alert('Success', 'Excel file download started.');
      } else {
        Alert.alert('Export Excel', `Please visit this URL to download:\n${url}`, [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('Error exporting Excel:', error);
      Alert.alert('Error', 'Failed to export Excel file.');
    }
  };

  const handleExportMaterialUsageExcel = (fromDate, toDate) => {
    if (!isAdmin) return;
    const from = (fromDate || '').trim();
    const to = (toDate || '').trim();
    if (!from || !to) {
      Alert.alert('Required', 'Please select both From and To dates.');
      return;
    }
    const url = MaterialUsageService.getExportExcelUrl(from, to);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
      Alert.alert('Success', 'Material usage Excel download started.');
    } else {
      Alert.alert('Export', `Open this URL to download:\n${url}`);
    }
  };

  const handleQuantityChange = async (itemId, change) => {
    if (!isAdmin) {
      Alert.alert('Not Allowed', 'Only admin can change inventory quantities.');
      return;
    }
    const actionType = change > 0 ? 'check_in' : 'check_out';
    await runWithLoading('Updating quantity...', async () => {
      const result = await InventoryService.updateQuantity(itemId, change, actorName, actionType);
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
        if (embeddedInShell) {
          return (
            <DashboardScreen
              inventory={inventory}
              inventoryLoaded={inventoryLoaded}
              minQuantity={30}
              auditLogs={auditLogsCache ?? []}
              auditLogsLoaded={auditLogsCache !== null}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              showTransactionTable={!isNarrowDesktop}
              isAdmin={isAdmin}
              userName={userName}
              embeddedInShell={embeddedInShell}
              onOpenRecycleDue={() => {
                setRecycleDueFilter(true);
                navigateTo('list');
              }}
            />
          );
        }
        return (
          <HomeScreen
            onScanQR={handleScanQR}
            onAddManual={handleAddManual}
            onViewInventory={() => setCurrentScreen('list')}
            onOpenRecycleDue={() => {
              setRecycleDueFilter(true);
              setCurrentScreen('list');
            }}
            inventory={inventory}
            inventoryLoaded={inventoryLoaded}
            minQuantity={30}
            nfcEnabled={nfcStatus.isEnabled}
            userName={userName}
            isAdmin={isAdmin}
            onSwitchUser={handleSwitchUser}
            isDarkMode={isDarkMode}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onToggleDarkMode={toggleDarkMode}
            onOpenSettings={() => {
              setPreviousScreen('home');
              setCurrentScreen('settings');
            }}
            onOpenPlaceOrder={isAdmin ? () => {
              setPreviousScreen('home');
              setCurrentScreen('placeOrder');
            } : undefined}
            onOpenUpcomingOrders={isAdmin ? () => {
              setOrdersInitialFilter(null);
              setPreviousScreen('home');
              setCurrentScreen('orders');
            } : undefined}
            onOpenBackOrders={isAdmin ? () => {
              setOrdersInitialFilter('back_orders');
              setPreviousScreen('home');
              setCurrentScreen('orders');
            } : undefined}
            onOpenLateOrders={isAdmin ? () => {
              setOrdersInitialFilter('late_orders');
              setPreviousScreen('home');
              setCurrentScreen('orders');
            } : undefined}
            onOpenMaterialUsage={() => navigateTo('materialUsage')}
            onOpenReports={isAdmin ? () => navigateTo('reports') : undefined}
            onOpenLowStock={() => {
              setLowStockFilter(true);
              setCurrentScreen('list');
            }}
            auditLogs={auditLogsCache ?? []}
            auditLogsLoaded={auditLogsCache !== null}
            onRefreshAuditLogs={() => refreshAuditLogs(true)}
          />
        );
      case 'reports':
        if (!isAdmin) {
          return null;
        }
        return (
          <ReportsScreen
            embeddedInShell={embeddedInShell}
            onBack={() => navigateTo('home')}
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
            embeddedInShell={embeddedInShell}
            onScanResult={handleScanResult}
            onCancel={exitCheckInFlow}
          />
        );
      case 'checkinout':
        return (
          <CheckInOutScreen
            embeddedInShell={embeddedInShell}
            item={scannedItem}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onCancel={exitCheckInFlow}
            onOrderSummary={onOrderSummary}
            onReceiveDelivery={handleReceiveDelivery}
            receiveOrdersList={receiveOrdersCache ?? []}
            receiveOrdersLoaded={receiveOrdersCache !== null}
            receiveOrdersLoading={receiveOrdersLoading}
            onRefreshReceiveOrders={refreshReceiveOrders}
          />
        );
      case 'add':
        return (
          <AddItemScreen
            inventory={inventory}
            onSave={handleAddItem}
            onCancel={() => navigateTo(embeddedInShell ? 'list' : 'home')}
            embeddedInShell={embeddedInShell}
            onBack={() => navigateTo(embeddedInShell ? 'list' : 'home')}
          />
        );
      case 'detail':
        return (
          <ItemDetailScreen
            item={selectedItem}
            inventory={inventory}
            onSave={handleSaveItem}
            onDelete={handleDeleteItem}
            onChangeId={handleChangeItemId}
            onWriteTag={handleWriteTag}
            onQuantityChange={handleQuantityChange}
            onBack={() => setCurrentScreen(previousScreen)}
            isAdmin={isAdmin}
            onOrderSummary={onOrderSummary}
            embeddedInShell={embeddedInShell}
          />
        );
      case 'list':
        return (
          <InventoryListScreen
            embeddedInShell={embeddedInShell}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            inventory={inventory}
            minQuantity={30}
            isAdmin={isAdmin}
            onOrderSummary={onOrderSummary}
            receiveOrdersList={receiveOrdersCache ?? []}
            receiveOrdersLoaded={receiveOrdersCache !== null}
            receiveOrdersLoading={receiveOrdersLoading}
            onRefreshReceiveOrders={refreshReceiveOrders}
            onReceivePoCompleted={() => {
              refreshReceiveOrders(true);
              refreshAuditLogs(true);
              loadInventory();
            }}
            recycleDueFilter={recycleDueFilter}
            onClearRecycleDueFilter={() => setRecycleDueFilter(false)}
            initialStockFilter={lowStockFilter ? 'lowStock' : null}
            onClearStockFilter={() => setLowStockFilter(false)}
            auditLogs={auditLogsCache ?? []}
            auditLogsLoaded={auditLogsCache !== null}
            initialViewMode={inventoryViewState.viewMode}
            initialBookFilter={inventoryViewState.bookFilter}
            initialScrollOffset={inventoryViewState.scrollOffset}
            onViewStateChange={(state) => setInventoryViewState(state)}
            onItemSelect={(item) => {
              setPreviousScreen('list');
              setSelectedItem(item);
              if (isAdmin) {
                setShowAdminItemDialog(true);
              } else {
                setCurrentScreen('itemHistory');
              }
            }}
            onScanCode={(code) => {
              // Remember that scan came from the list, so cancel / completion returns here
              setPreviousScreen('list');
              handleScanResult(code);
            }}
            actorName={actorName}
            onBack={() => navigateTo(embeddedInShell ? 'home' : 'home')}
          />
        );
      case 'itemHistory':
        return (
          <ItemTransactionHistoryScreen
            item={selectedItem}
            onBack={() => setCurrentScreen('list')}
            isAdmin={isAdmin}
          />
        );
      case 'orders':
        return (
          <UpcomingOrdersScreen
            embeddedInShell={embeddedInShell}
            onBack={() => {
              setOrdersInitialFilter(null);
              navigateTo(embeddedInShell ? 'home' : previousScreen || 'home');
            }}
            inventory={inventory}
            userName={actorName}
            orders={receiveOrdersCache ?? []}
            ordersLoaded={receiveOrdersCache !== null}
            ordersLoading={receiveOrdersLoading}
            onRefreshOrders={() => refreshReceiveOrders(true)}
            onOrdersChanged={async () => {
              await refreshReceiveOrders(true);
              try {
                const summary = await OrderService.getOnOrderSummary();
                setOnOrderSummary(summary || {});
              } catch (e) {
                console.error('Error refreshing on-order summary:', e);
              }
            }}
            initialFilter={ordersInitialFilter}
          />
        );
      case 'placeOrder':
        return (
          <PlaceOrderScreen
            inventory={inventory}
            userName={actorName}
            embeddedInShell={embeddedInShell}
            onBack={() => navigateTo('home')}
            onOrderCreated={() => {
              loadInventory();
              refreshReceiveOrders(true);
              refreshAuditLogs(true);
            }}
          />
        );
      case 'materialUsage':
        return (
          <MaterialUsageScreen
            inventory={inventory}
            userName={actorName}
            isAdmin={isAdmin}
            materialUsageOvertime={materialUsageOvertime}
            embeddedInShell={embeddedInShell}
            onBack={() => navigateTo('home')}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            embeddedInShell={embeddedInShell}
            onBack={() => navigateTo(embeddedInShell ? 'home' : previousScreen || 'home')}
            userName={actorName}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
            onSwitchUser={handleSwitchUser}
            isAdmin={isAdmin}
            materialUsageOvertime={materialUsageOvertime}
            onSetMaterialUsageOvertime={handleSetMaterialUsageOvertime}
            onExportExcel={handleExportExcel}
            onExportMaterialUsageExcel={handleExportMaterialUsageExcel}
          />
        );
      default:
        return null;
    }
  };

  const mainContent = renderScreen();
  const shellWrapped =
    embeddedInShell && userName ? (
      <AppShell
        isNarrowDesktop={isNarrowDesktop}
        sidebar={
          <AppSidebar
            currentScreen={currentScreen}
            ordersInitialFilter={ordersInitialFilter}
            isAdmin={isAdmin}
            userName={userName}
            inventory={inventory}
            inventoryLoaded={inventoryLoaded}
            isRefreshing={isRefreshing}
            onNavigate={navigateTo}
            onAddManual={
              isAdmin
                ? () => {
                    setPreviousScreen('home');
                    navigateTo('add');
                  }
                : undefined
            }
            onRefresh={handleRefresh}
            onOpenSettings={() => navigateTo('settings')}
            onToggleDarkMode={toggleDarkMode}
            onSwitchUser={handleSwitchUser}
            minQuantity={30}
            onOpenRecycleDue={() => {
              setRecycleDueFilter(true);
              navigateTo('list');
            }}
            onOpenBackOrders={
              isAdmin
                ? () => navigateTo('orders', { ordersInitialFilter: 'back_orders' })
                : undefined
            }
            onOpenLateOrders={
              isAdmin
                ? () => navigateTo('orders', { ordersInitialFilter: 'late_orders' })
                : undefined
            }
            onOpenLowStock={() => {
              setLowStockFilter(true);
              navigateTo('list');
            }}
            showCheckInOutNav={showCheckInOutNav}
          />
        }
      >
        {mainContent}
      </AppShell>
    ) : (
      mainContent
    );

  return (
    <PaperProvider theme={paperTheme}>
      <View
        {...idleTouchCaptureProps}
        style={[styles.container, isWeb && styles.containerWeb, { backgroundColor: paperTheme.colors.background }]}
      >
        <StatusBar style="auto" />
        {shellWrapped}
        {isActionLoading && (
          <View style={[styles.loadingOverlay, { pointerEvents: "auto" }]}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={paperTheme.colors.primary} />
              {!!actionLoadingMessage && (
                <Text style={styles.loadingText}>{actionLoadingMessage}</Text>
              )}
            </View>
          </View>
        )}
        {scanLookupLoading && (
          <View style={[styles.loadingOverlay, { pointerEvents: "auto" }]}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={paperTheme.colors.primary} />
              <Text style={styles.loadingText}>Looking up material…</Text>
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
              style={[
                styles.adminDialogCard,
                { backgroundColor: paperTheme.colors.surfaceContainerHighest },
              ]}
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
    backgroundColor: DARK_SURFACE_ELEVATED,
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

