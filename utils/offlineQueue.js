import AsyncStorage from "@react-native-async-storage/async-storage";
import InventoryService from "../services/inventoryService";
import OrderService from "../services/orderService";
import { createTransactionId, isNetworkError } from "./transactionId";

const QUEUE_KEY = "@pending_inventory_transactions";

// Safely parse JSON from storage
async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("OfflineQueue: failed to load queue", e);
    return [];
  }
}

async function saveQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
  } catch (e) {
    console.error("OfflineQueue: failed to save queue", e);
  }
}

/** Enqueue a pending quantity change / receiving action to be replayed when back online. */
export async function enqueueQuantityAction({
  itemId,
  change,
  userName,
  actionType,
  orderId,
  location,
  transactionId,
}) {
  const entry = {
    id: String(itemId ?? "").trim(),
    change: Number(change) || 0,
    userName: userName || null,
    actionType: actionType || null, // 'check_in' | 'check_out' | 'receiving' | 'recycled' | null
    orderId: orderId || null,
    location: location ? String(location).trim() : null,
    // Stable id so server ignores duplicate replays of the same user action
    transactionId: transactionId || createTransactionId(),
    createdAt: new Date().toISOString(),
  };
  if (!entry.id || !entry.change) return entry.transactionId;
  const queue = await loadQueue();
  // Avoid enqueueing the same transaction twice (e.g. double catch)
  if (
    entry.transactionId &&
    queue.some((q) => q && q.transactionId === entry.transactionId)
  ) {
    return entry.transactionId;
  }
  queue.push(entry);
  await saveQueue(queue);
  return entry.transactionId;
}

/** Try to sync all pending quantity changes. Returns { synced, failed, remaining }. */
export async function syncPendingQuantity(userNameFallback) {
  const queue = await loadQueue();
  if (!queue.length) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (let i = 0; i < queue.length; i += 1) {
    const entry = queue[i];
    const userName = entry.userName || userNameFallback || "offline";
    const extras = {
      ...(entry.location ? { location: entry.location } : {}),
      transactionId: entry.transactionId || createTransactionId(),
    };
    // Persist generated id back onto the entry for later retries
    if (!entry.transactionId) entry.transactionId = extras.transactionId;

    try {
      let result;
      if (entry.actionType === "receiving" && entry.orderId) {
        // Replay PO receiving: first record order receive, then update inventory quantity
        const receiveResult = await OrderService.receiveOrderLine(
          entry.orderId,
          entry.id,
          entry.change,
        );
        if (!receiveResult || !receiveResult.success) {
          throw new Error(receiveResult?.error || "PO receive replay failed");
        }
        result = await InventoryService.updateQuantity(
          entry.id,
          entry.change,
          userName,
          "receiving",
          extras,
        );
      } else {
        result = await InventoryService.updateQuantity(
          entry.id,
          entry.change,
          userName,
          entry.actionType || null,
          extras,
        );
      }
      if (result && result.success) {
        synced += 1;
        continue;
      }
      // Network-ish failure returned as success:false — keep for later
      if (result?.networkError || isNetworkError(result?.error)) {
        remaining.push(entry, ...queue.slice(i + 1));
        break;
      }
      // Business error (e.g. not enough stock) – drop but count as failed.
      failed += 1;
    } catch (e) {
      // Network-type error: stop here and keep this + rest for later.
      if (isNetworkError(e)) {
        remaining.push(entry, ...queue.slice(i + 1));
        break;
      }
      // Other errors: count as failed and continue.
      console.error("OfflineQueue sync error:", e);
      failed += 1;
    }
  }

  await saveQueue(remaining);
  return { synced, failed, remaining: remaining.length };
}
