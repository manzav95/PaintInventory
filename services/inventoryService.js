import config from '../config';
import IDGenerator from './idGenerator';

const API_URL = config.API_URL;

// Helper function for API calls
async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error(`API error (${endpoint}):`, error);
    throw error;
  }
}

// Sherwin Williams color code format: H66(3 letters)(5 numbers)
// Example: H66AAA00001, H66AAA00002, H66AAB00001
class InventoryService {
  async getAllItems() {
    try {
      const items = await _fetch('/api/items');
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('Error getting items:', error);
      return [];
    }
  }

  async getItem(itemId) {
    try {
      const encodedId = encodeURIComponent(itemId);
      const item = await _fetch(`/api/items/${encodedId}`);
      return item || null;
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }
      console.error('Error getting item:', error);
      return null;
    }
  }

  async getNextIdNumber() {
    try {
      const result = await _fetch('/api/settings/next-id');
      return result.nextId || 1;
    } catch (error) {
      console.error('Error getting next ID:', error);
      return 1;
    }
  }

  async getNextIdFormatted() {
    try {
      const result = await _fetch('/api/settings/next-id');
      if (result.nextIdFormatted && result.nextIdFormatted.trim()) {
        return result.nextIdFormatted.trim();
      }
      const counter = result.nextId ?? (await this.getNextIdNumber());
      return IDGenerator.counterToId(counter);
    } catch (error) {
      const counter = await this.getNextIdNumber();
      return IDGenerator.counterToId(counter);
    }
  }

  async setNextIdNumber(nextIdNumber, userName) {
    // Accept number or any non-empty string (no format restriction)
    const isNum = typeof nextIdNumber === 'number' || (typeof nextIdNumber === 'string' && /^\d+$/.test(String(nextIdNumber).trim()));
    const payload = isNum
      ? { nextId: typeof nextIdNumber === 'number' ? nextIdNumber : parseInt(String(nextIdNumber), 10), userName }
      : { nextId: String(nextIdNumber).trim(), userName };
    if (payload.nextId === '' || (isNum && (isNaN(payload.nextId) || payload.nextId < 1))) {
      return { success: false, error: 'Next ID must be a positive number or any non-empty string.' };
    }
    try {
      const result = await _fetch('/api/settings/next-id', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMinQuantity() {
    try {
      const result = await _fetch('/api/settings/min-quantity');
      const n = result.minQuantity != null ? parseInt(result.minQuantity, 10) : 30;
      return isNaN(n) ? 30 : n;
    } catch (error) {
      return 30;
    }
  }

  async setMinQuantity(value, userName) {
    try {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      if (isNaN(num) || num < 0) {
        return { success: false, error: 'Minimum quantity must be 0 or greater.' };
      }
      await _fetch('/api/settings/min-quantity', {
        method: 'POST',
        body: JSON.stringify({ minQuantity: num, userName }),
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async generateNextId() {
    try {
      const result = await _fetch('/api/settings/next-id');
      const custom = result.nextIdFormatted && String(result.nextIdFormatted).trim();
      if (custom) {
        // Use custom string once; clear it so next time we use counter (backend could clear, but we don't require that)
        return custom;
      }
      const current = result.nextId ?? (await this.getNextIdNumber());
      const formatted = IDGenerator.counterToId(current);
      await this.setNextIdNumber(current + 1, 'system');
      return formatted;
    } catch (error) {
      console.error('Error generating next ID:', error);
      return 'H66AAA00001';
    }
  }

  async migrateOldIds() {
    // Migration handled by server
    return { success: true, migrated: 0 };
  }

  async addItem(item) {
    try {
      let itemId = item.id;
      
      if (itemId != null && String(itemId).trim()) {
        itemId = String(itemId).trim();
        const existing = await this.getItem(itemId);
        if (existing) {
          return { success: false, error: `ID ${itemId} is already in use by another paint.` };
        }
      } else {
        itemId = await this.generateNextId();
      }
      
      const newItem = {
        id: itemId,
        name: item.name || 'Unnamed Item',
        quantity: item.quantity || 0,
        description: item.description || '',
        location: item.location || '',
        lastScanned: item.lastScanned || new Date().toISOString(),
        lastScannedBy: item.lastScannedBy || null,
        createdAt: item.createdAt || new Date().toISOString(),
        userName: item.userName || null,
        minQuantity: item.minQuantity != null ? item.minQuantity : undefined,
      };

      const result = await _fetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(newItem),
      });

      return result;
    } catch (error) {
      console.error('Error adding item:', error);
      return { success: false, error: error.message };
    }
  }

  async updateItem(itemId, updates, userName) {
    try {
      const encodedId = encodeURIComponent(itemId);
      const updateData = {
        ...updates,
        userName,
      };
      
      const result = await _fetch(`/api/items/${encodedId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      return result;
    } catch (error) {
      console.error('Error updating item:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteItem(itemId, userName) {
    try {
      const encodedId = encodeURIComponent(itemId);
      const qs = userName ? `?userName=${encodeURIComponent(userName)}` : '';
      const result = await _fetch(`/api/items/${encodedId}${qs}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      return result && result.success ? result : { success: false, error: result?.error || 'Delete failed' };
    } catch (error) {
      console.error('Error deleting item:', error);
      return { success: false, error: error.message || 'Failed to delete item' };
    }
  }

  async updateQuantity(itemId, change, userName, actionType = null) {
    try {
      const item = await this.getItem(itemId);
      if (!item) {
        return { success: false, error: 'Item not found' };
      }
      
      const newQuantity = Math.max(0, (item.quantity || 0) + change);
      const updateData = {
        quantity: newQuantity,
        lastScanned: new Date().toISOString(),
        lastScannedBy: userName || null,
        userName,
      };
      
      // Add action type flag for check_in/check_out
      if (actionType) {
        updateData._actionType = actionType;
        updateData._quantityChange = Math.abs(change); // Store the change amount
      }
      
      const result = await this.updateItem(itemId, updateData, userName);
      
      // If update succeeded but item is null, fetch it again
      if (result.success && !result.item) {
        const updatedItem = await this.getItem(itemId);
        if (updatedItem) {
          result.item = updatedItem;
        }
      }
      
      return result;
    } catch (error) {
      console.error('Error updating quantity:', error);
      return { success: false, error: error.message };
    }
  }

  async updateItemId(oldId, newIdRaw, userName) {
    try {
      const oldIdStr = (oldId ?? '').toString();
      const newId = (newIdRaw ?? '').toString().trim();
      if (!newId) {
        return { success: false, error: 'New ID cannot be empty.' };
      }
      if (newId === oldIdStr) {
        return { success: true, itemId: newId };
      }

      const existing = await this.getItem(newId);
      if (existing) {
        return { success: false, error: `ID ${newId} is already in use.` };
      }

      const encodedOldId = encodeURIComponent(oldIdStr);
      const result = await _fetch(`/api/items/${encodedOldId}/change-id`, {
        method: 'POST',
        body: JSON.stringify({ newId, userName }),
      });

      return result;
    } catch (error) {
      console.error('Error updating item id:', error);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const response = await fetch(`${API_URL}/api/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export default new InventoryService();
