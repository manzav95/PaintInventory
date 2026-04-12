import AsyncStorage from "@react-native-async-storage/async-storage";
import InventoryService from "../services/inventoryService";
import OrderService from "../services/orderService";

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
export async function enqueueQuantityAction({ itemId, change, userName, actionType, orderId }) {
  const entry = {
    id: String(itemId ?? "").trim(),
    change: Number(change) || 0,
    userName: userName || null,
    actionType: actionType || null, // 'check_in' | 'check_out' | 'receiving' | null
    orderId: orderId || null,
    createdAt: new Date().toISOString(),
  };
  if (!entry.id || !entry.change) return;
  const queue = await loadQueue();
  queue.push(entry);
  await saveQueue(queue);
}

/** Try to sync all pending quantity changes. Returns { synced, failed, remaining }. */
export async function syncPendingQuantity(userNameFallback) {
  const queue = await loadQueue();
  if (!queue.length) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const entry of queue) {
    const userName = entry.userName || userNameFallback || "offline";
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
        );
      } else {
        result = await InventoryService.updateQuantity(
          entry.id,
          entry.change,
          userName,
          entry.actionType || null,
        );
      }
      if (result && result.success) {
        synced += 1;
        continue;
      }
      // Business error (e.g. not enough stock) – drop but count as failed.
      failed += 1;
    } catch (e) {
      const msg = e?.message || String(e);
      // Network-type error: stop here and keep this + rest for later.
      if (/Network request failed|Failed to fetch|TypeError|NetworkError/i.test(msg)) {
        remaining.push(entry, ...queue.slice(queue.indexOf(entry) + 1));
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

