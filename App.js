import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Alert, Platform, Modal, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider as PaperProvider, ActivityIndicator, Text, Button } from 'react-native-paper';
import {
  normalizeItemIdQuery,
  resolveBestInventoryMatch,
} from './utils/itemLookup';
import showAlert from './utils/showAlert';
import showToast from './utils/showToast';
import { injectWebMotionStyles } from './utils/injectWebMotionStyles';
import { injectWebFonts } from './utils/injectWebFonts';
import ScreenTransition from './components/ScreenTransition';
import KeepAlivePane from './components/KeepAlivePane';
import FadeOverlay from './components/FadeOverlay';
import FadeIn from './components/FadeIn';
import ToastHost from './components/ToastHost';
// NFC support is available via NFCService, but NFC UI is currently hidden.
import NFCService from './services/nfcService';
import InventoryService from './services/inventoryService';
import AuditService from './services/auditService';
import { enqueueQuantityAction, syncPendingQuantity } from './utils/offlineQueue';
import OrderService from './services/orderService';
import MaterialUsageService from './services/materialUsageService';
import config from './config';
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
import WasteTrackingScreen from './screens/WasteTrackingScreen';
import ReportsScreen from './screens/ReportsScreen';
import AppShell from './components/AppShell';
import AppSidebar from './components/AppSidebar';
import NotificationsBell from './components/NotificationsBell';
import { useAppLayout, shouldUseShell, getScreenTitle } from './utils/layout';
import { lightTheme, darkTheme } from './theme/createAppTheme';
import { colors } from './theme/tokens';
import {
  recordUserActivity,
  getLastUserActivity,
  isIdleExpired,
  clearUserActivity,
  isAdminUser,
} from './utils/idleSession';
import useIdleLogout from './utils/useIdleLogout';
import LoginLogService from './services/loginLogService';

const AUDIT_LOGS_CACHE_KEY = '@paint_inventory_audit_logs_v1';
const AUDIT_LOGS_FETCH_LIMIT = 750;

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
  const [materialUsageVisited, setMaterialUsageVisited] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const paperTheme = isDarkMode ? darkTheme : lightTheme;
  const embeddedInShell = shouldUseShell(currentScreen);

  useEffect(() => {
    if (currentScreen === 'materialUsage') {
      setMaterialUsageVisited(true);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (showPersistentSidebar) setNavDrawerOpen(false);
  }, [showPersistentSidebar]);

  const navigateTo = (screen, options = {}) => {
    setNavDrawerOpen(false);
    if (screen === 'reports' && !isAdmin) {
      return;
    }
    if (screen === 'materialUsage') {
      setMaterialUsageVisited(true);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'ordersInitialFilter')) {
      setOrdersInitialFilter(options.ordersInitialFilter);
    } else if (screen === 'orders') {
      setOrdersInitialFilter(null);
    }
    if (screen === 'materialUsage' && isWeb && typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search || ''}#/material-usage`,
      );
    } else if (screen === 'wasteTracking' && isWeb && typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search || ''}#/waste-tracking`,
      );
    } else if (screen === 'reports' && isWeb && typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search || ''}#/reports`,
      );
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
    if (Platform.OS === 'web') {
      injectWebFonts();
      injectWebMotionStyles();
    }
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
        wasteTracking: 'Waste Tracking',
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
        setMaterialUsageVisited(true);
        setCurrentScreen('materialUsage');
      } else if (path === '/waste-tracking' && userName != null) {
        setCurrentScreen('wasteTracking');
      } else if (path === '/reports' && userName != null && userName === 'admin123') {
        setCurrentScreen('reports');
      }
    };
    applyHash();
    const onHashChange = () => {
      const h = (window.location.hash || '').replace(/^#/, '') || '/';
      const p = h.startsWith('/') ? h : `/${h}`;
      if (p === '/material-usage' && userName != null) {
        setMaterialUsageVisited(true);
        setCurrentScreen('materialUsage');
      } else if (p === '/waste-tracking' && userName != null) {
        setCurrentScreen('wasteTracking');
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
    setMaterialUsageVisited(false);
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
    setMaterialUsageVisited(false);
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
      const logs = await AuditService.list(AUDIT_LOGS_FETCH_LIMIT);
      const next = Array.isArray(logs) ? logs : [];
      setAuditLogsCache(next);
      AsyncStorage.setItem(AUDIT_LOGS_CACHE_KEY, JSON.stringify(next)).catch(
        () => {},
      );
    } catch (e) {
      console.error('Error prefetching audit logs:', e);
      if (force) {
        Alert.alert('Error', e?.message || 'Could not load activity history.');
      }
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditLogsCache, auditLogsLoading]);

  // Hydrate audit cache from disk, then refresh from network in background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUDIT_LOGS_CACHE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setAuditLogsCache((prev) => (prev == null ? parsed : prev));
          }
        }
      } catch (_) {
        /* ignore corrupt cache */
      }
      if (!cancelled) {
        refreshAuditLogs(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount — refreshAuditLogs identity changes; we force-refresh once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const rawQuery = itemId.toString().trim();
      const normalizedId = normalizeItemIdQuery(rawQuery);

      let item = null;
      try {
        // Online lookup by ID first (exact)
        item = await InventoryService.getItem(normalizedId);
      } catch (err) {
        // Network / server errors — fall through to local name/fuzzy search
        console.warn('Item ID lookup failed, trying local search:', err?.message || err);
      }

      if (!item) {
        const { item: localBest, matches } = resolveBestInventoryMatch(
          inventory,
          rawQuery,
        );
        if (localBest) {
          item = localBest;
        } else if (matches.length > 0) {
          item = matches[0]?.item || null;
        }
      }

      if (!item) {
        const title = 'Material Not Found';
        const msg =
          `No material matched "${rawQuery}".\n\n` +
          'Try the full name, ID, or pick a suggestion from the list. If you are offline, sync inventory while online first.';

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`${title}\n\n${msg}`);
          setCurrentScreen('qrscan');
        } else {
          showAlert(title, msg, [
            { text: 'OK', onPress: () => setCurrentScreen('qrscan') },
          ]);
        }
        return;
      }

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
          showToast({
            title: 'Checked in',
            message: `${quantity} gal · ${scannedItem.name} → ${result.item.quantity} gal`,
          });
          await AuditService.log({
            type: 'check_in',
            user: actorName,
            itemId: scannedItem.id,
            quantity: quantity,
            newQuantity: result.item.quantity,
          });
          await refreshAuditLogs(true);
        } else {
          showAlert('Cannot check in', result.error || 'Failed to check in quantity.');
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
        showToast({
          type: 'info',
          title: 'Saved offline',
          message: `Check-in for "${scannedItem.name}" will sync when online.`,
        });
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
        if (!receiveResult.success) {
          showAlert(
            'Cannot receive',
            receiveResult.error || 'Failed to record PO receive.',
          );
          return;
        }
        const result = await InventoryService.updateQuantity(scannedItem.id, quantity, actorName, 'receiving');
        if (!result.success) {
          showAlert(
            'Cannot receive',
            result.error || 'Failed to update inventory.',
          );
          return;
        }
        await loadInventory();
        await refreshReceiveOrders(true);
        showToast({
          title: 'Received',
          message: `${quantity} gal · ${scannedItem.name} → ${result.item.quantity} gal`,
        });
        await AuditService.log({
          type: 'receiving',
          user: actorName,
          itemId: scannedItem.id,
          quantity,
          newQuantity: result.item.quantity,
          orderId,
        });
        await refreshAuditLogs(true);
      } catch (err) {
        // Likely offline – enqueue for later sync instead of failing the user flow
        await enqueueQuantityAction({
          itemId: scannedItem.id,
          change: quantity,
          userName: actorName,
          actionType: 'receiving',
          orderId,
        });
        showToast({
          type: 'info',
          title: 'Saved offline',
          message: `Receiving for "${scannedItem.name}" will sync when online.`,
        });
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
          showToast({
            title: 'Checked out',
            message: `${quantity} gal · ${scannedItem.name} → ${result.item.quantity} gal`,
          });
          await AuditService.log({
            type: 'check_out',
            user: actorName,
            itemId: scannedItem.id,
            quantity: quantity,
            newQuantity: result.item.quantity,
          });
          await refreshAuditLogs(true);
        } else {
          showAlert(
            'Cannot check out',
            result.error || 'Failed to check out quantity.',
          );
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
        showToast({
          type: 'info',
          title: 'Saved offline',
          message: `Check-out for "${scannedItem.name}" will sync when online.`,
        });
      }
      setScannedItem(null);
      const target = previousScreen || 'list';
      setCurrentScreen(target);
    });
  };

  const handleRecyclePaint = async (quantity) => {
    if (!scannedItem || !isAdmin) return;
    const t = String(scannedItem.type || '').toLowerCase();
    if (t !== 'custom_paint' && t !== 'custom_stain') return;
    await runWithLoading('Recording recycle...', async () => {
      try {
        const result = await InventoryService.updateQuantity(
          scannedItem.id,
          -quantity,
          actorName,
          'recycled',
        );
        if (result.success) {
          await loadInventory();
          showToast({
            title: 'Recycled',
            message: `${quantity} gal · ${scannedItem.name} → ${result.item.quantity} gal`,
          });
          await AuditService.log({
            type: 'recycled',
            user: actorName,
            itemId: scannedItem.id,
            quantity,
            newQuantity: result.item.quantity,
          });
          await refreshAuditLogs(true);
        } else {
          showAlert(
            'Cannot recycle',
            result.error || 'Failed to record recycle.',
          );
          return;
        }
      } catch (err) {
        await enqueueQuantityAction({
          itemId: scannedItem.id,
          change: -quantity,
          userName: actorName,
          actionType: 'recycled',
        });
        showToast({
          type: 'info',
          title: 'Saved offline',
          message: `Recycle for "${scannedItem.name}" will sync when online.`,
        });
      }
      setScannedItem(null);
      const target = previousScreen || 'list';
      setCurrentScreen(target);
    });
  };

  const handleAddItem = async (item) => {
    if (!isAdmin) {
      showAlert('Not Allowed', 'Only admin can add new inventory items.');
      return;
    }
    await runWithLoading('Saving new item...', async () => {
      try {
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
          showToast({ title: 'Saved', message: 'Item added successfully.' });
          await AuditService.log({
            type: 'add_item',
            user: actorName,
            itemId: result.item?.id,
            name: result.item?.name,
            quantity: result.item?.quantity,
          });
          await refreshAuditLogs(true);
        } else {
          showAlert('Cannot add item', result.error || 'Failed to add item.');
        }
      } catch (err) {
        showAlert(
          'Cannot add item',
          err?.message || 'Failed to add item.',
        );
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
      showAlert('Not Allowed', 'Only admin can make changes to inventory items.');
      return false;
    }

    const isExistingItem = !!selectedItem;
    const idForApi = String(item.id ?? selectedItem?.id ?? '').trim();

    let result;
    try {
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
    } catch (err) {
      showAlert(
        'Cannot save item',
        err?.message || 'Failed to save item.',
      );
      return false;
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
      showToast({ title: 'Saved', message: 'Item saved successfully.' });
      await AuditService.log({
        type: isExistingItem ? 'edit_item' : 'add_item',
        user: actorName,
        itemId: result.item?.id,
        name: result.item?.name,
        quantity: result.item?.quantity,
      });
      await refreshAuditLogs(true);
      return true;
    } else {
      showAlert('Cannot save item', result.error || 'Failed to save item.');
      return false;
    }
  };

  const performDelete = async (itemId) => {
    try {
      const result = await InventoryService.deleteItem(itemId, actorName);
      if (result && result.success) {
        setSelectedItem(null);
        await loadInventory();
        setCurrentScreen('home');
        showToast({ title: 'Deleted', message: 'Item deleted successfully.' });
        await AuditService.log({
          type: 'delete_item',
          user: actorName,
          itemId,
        });
        await refreshAuditLogs(true);
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
        showToast({ title: 'Export', message: 'Excel file download started.' });
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
      showToast({
        title: 'Export',
        message: 'Material usage Excel download started.',
      });
    } else {
      Alert.alert('Export', `Open this URL to download:\n${url}`);
    }
  };

  const handleQuantityChange = async (itemId, change) => {
    if (!isAdmin) {
      showAlert('Not Allowed', 'Only admin can change inventory quantities.');
      return;
    }
    await runWithLoading('Updating quantity...', async () => {
      const result = await InventoryService.updateQuantity(itemId, change, actorName, null);
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
        await refreshAuditLogs(true);
      } else {
        showAlert(
          'Cannot update quantity',
          result.error || 'Failed to update quantity.',
        );
      }
    });
  };

  const handleChangeItemId = async (oldId, newId) => {
    if (!isAdmin) {
      showAlert('Not Allowed', 'Only admin can change paint IDs.');
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
        await refreshAuditLogs(true);
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
        // Dashboard stays mounted separately for instant return visits.
        return null;
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
            inventory={inventory}
            onScanResult={handleScanResult}
            onCancel={exitCheckInFlow}
          />
        );
      case 'checkinout':
        return (
          <CheckInOutScreen
            embeddedInShell={embeddedInShell}
            item={scannedItem}
            isAdmin={isAdmin}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onRecyclePaint={handleRecyclePaint}
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
            onBack={() =>
              setCurrentScreen(previousScreen === 'home' ? 'home' : 'list')
            }
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
        // Kept mounted separately for instant navigation.
        return null;
      case 'wasteTracking':
        return (
          <WasteTrackingScreen
            userName={actorName}
            isAdmin={isAdmin}
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

  const isHomeScreen = currentScreen === 'home';
  const isMaterialUsageScreen = currentScreen === 'materialUsage';
  const dashboardKeepAlive =
    userName && embeddedInShell ? (
      <KeepAlivePane active={isHomeScreen}>
        <DashboardScreen
          inventory={inventory}
          inventoryLoaded={inventoryLoaded}
          minQuantity={30}
          auditLogs={auditLogsCache ?? []}
          auditLogsLoaded={auditLogsCache !== null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          showTransactionTable={true}
          isAdmin={isAdmin}
          userName={userName}
          embeddedInShell={embeddedInShell}
          showCheckInOutNav={showCheckInOutNav}
          onOpenRecycleDue={() => {
            setRecycleDueFilter(true);
            navigateTo('list');
          }}
          onOpenInventory={() => navigateTo('list')}
          onOpenMaterialUsage={() => navigateTo('materialUsage')}
          onOpenWasteTracking={() => navigateTo('wasteTracking')}
          onOpenCheckInOut={() => navigateTo('qrscan')}
          onItemSelect={
            isAdmin
              ? (item) => {
                  setPreviousScreen('home');
                  setSelectedItem(item);
                  setShowAdminItemDialog(true);
                }
              : undefined
          }
        />
      </KeepAlivePane>
    ) : null;

  const materialUsageKeepAlive =
    userName && materialUsageVisited ? (
      <KeepAlivePane active={isMaterialUsageScreen}>
        <MaterialUsageScreen
          inventory={inventory}
          userName={actorName}
          isAdmin={isAdmin}
          materialUsageOvertime={materialUsageOvertime}
          embeddedInShell
          onBack={() => navigateTo('home')}
        />
      </KeepAlivePane>
    ) : null;

  const mainContent = (
    <View style={styles.mainStack}>
      {dashboardKeepAlive}
      {materialUsageKeepAlive}
      {(!isHomeScreen || !dashboardKeepAlive) &&
      (!isMaterialUsageScreen || !materialUsageKeepAlive) ? (
        <ScreenTransition
          screenKey={`${userName ? 'in' : 'out'}:${currentScreen}`}
        >
          {renderScreen()}
        </ScreenTransition>
      ) : null}
    </View>
  );
  const shellWrapped =
    embeddedInShell && userName ? (
      <AppShell
        isNarrowDesktop={isNarrowDesktop}
        showPersistentSidebar={showPersistentSidebar}
        title={getScreenTitle(currentScreen)}
        userName={userName}
        drawerOpen={navDrawerOpen}
        onOpenDrawer={() => setNavDrawerOpen(true)}
        onCloseDrawer={() => setNavDrawerOpen(false)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onOpenSettings={() => navigateTo('settings')}
        onSignOut={handleSwitchUser}
        notifications={
          <NotificationsBell
            inventory={inventory}
            inventoryLoaded={inventoryLoaded}
            minQuantity={30}
            isAdmin={isAdmin}
            userName={userName}
            onOpenRecycleDue={() => {
              setRecycleDueFilter(true);
              navigateTo('list');
            }}
            onOpenBackOrders={
              isAdmin
                ? () =>
                    navigateTo('orders', {
                      ordersInitialFilter: 'back_orders',
                    })
                : undefined
            }
            onOpenLateOrders={
              isAdmin
                ? () =>
                    navigateTo('orders', {
                      ordersInitialFilter: 'late_orders',
                    })
                : undefined
            }
            onOpenLowStock={() => {
              setLowStockFilter(true);
              navigateTo('list');
            }}
            onOpenWasteTracking={() => navigateTo('wasteTracking')}
          />
        }
        sidebar={
          <AppSidebar
            currentScreen={currentScreen}
            ordersInitialFilter={ordersInitialFilter}
            isAdmin={isAdmin}
            inDrawer={!showPersistentSidebar}
            onNavigate={navigateTo}
            onAddManual={
              isAdmin
                ? () => {
                    setPreviousScreen('home');
                    navigateTo('add');
                  }
                : undefined
            }
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
        <FadeOverlay visible={isActionLoading} style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={paperTheme.colors.primary} />
            {!!actionLoadingMessage && (
              <Text style={styles.loadingText}>{actionLoadingMessage}</Text>
            )}
          </View>
        </FadeOverlay>
        <FadeOverlay visible={scanLookupLoading} style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={paperTheme.colors.primary} />
            <Text style={styles.loadingText}>Looking up material…</Text>
          </View>
        </FadeOverlay>
        <ToastHost />
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
            <FadeIn fromY={8} duration={220}>
              <Text style={[styles.adminDialogTitle, { color: paperTheme.colors.onSurface }]}>
                {selectedItem?.name || selectedItem?.id || "Item"}
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
            </FadeIn>
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
  mainStack: {
    flex: 1,
    width: '100%',
  },
  dashboardKeepAliveVisible: {
    flex: 1,
    width: '100%',
  },
  dashboardKeepAliveHidden: {
    display: 'none',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: colors.dark.elevated,
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

