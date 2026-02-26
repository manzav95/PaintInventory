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
    const counter = await this.getNextIdNumber();
    return IDGenerator.counterToId(counter);
  }

  async setNextIdNumber(nextIdNumber, userName) {
    // Accept either a counter number or a formatted ID string
    let counter;
    if (typeof nextIdNumber === 'string' && IDGenerator.isValidFormat(nextIdNumber)) {
      counter = IDGenerator.idToCounter(nextIdNumber);
      if (!counter) {
        return { success: false, error: 'Invalid Sherwin Williams format. Must be H66(3 letters)(5 numbers), e.g., H66AAA00001' };
      }
    } else {
      counter = typeof nextIdNumber === 'number' ? nextIdNumber : parseInt(String(nextIdNumber), 10);
      if (isNaN(counter) || counter < 1) {
        return { success: false, error: 'Next ID must be a valid number or Sherwin Williams format (H66AAA00001).' };
      }
    }

    try {
      // Check for collision
      const items = await this.getAllItems();
      const formatted = IDGenerator.counterToId(counter);
      const collision = items.some(item => (item.id?.toString() || '') === formatted);
      if (collision) {
        return { success: false, error: `ID ${formatted} is already used by an existing paint.` };
      }

      const result = await _fetch('/api/settings/next-id', {
        method: 'POST',
        body: JSON.stringify({ nextId: counter, userName }),
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async generateNextId() {
    try {
      const current = await this.getNextIdNumber();
      const formatted = IDGenerator.counterToId(current);

      // Increment counter for next time
      const next = current + 1;
      await this.setNextIdNumber(next, 'system');

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
      
      // If custom ID provided, validate format and check for collisions
      if (itemId) {
        const formattedId = itemId.trim().toUpperCase();
        if (!IDGenerator.isValidFormat(formattedId)) {
          return { success: false, error: 'Invalid ID format. Must be H66(3 letters)(5 numbers), e.g., H66ABC12345' };
        }
        
        // Check for collision
        const existing = await this.getItem(formattedId);
        if (existing) {
          return { success: false, error: `ID ${formattedId} is already in use by another paint.` };
        }
        
        itemId = formattedId;
      } else {
        // Generate default ID if not provided
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
      const result = await _fetch(`/api/items/${encodedId}`, {
        method: 'DELETE',
        body: JSON.stringify({ userName }),
      });

      return result;
    } catch (error) {
      console.error('Error deleting item:', error);
      return { success: false, error: error.message };
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
      const cleaned = (newIdRaw ?? '').toString().trim().toUpperCase();

      // Validate Sherwin Williams format
      if (!IDGenerator.isValidFormat(cleaned)) {
        return { success: false, error: 'New ID must be in Sherwin Williams format: H66(3 letters)(5 numbers), e.g., H66ABC12345' };
      }

      const newId = cleaned;
      if (newId === oldIdStr) {
        return { success: true, itemId: newId };
      }

      // Check for collision
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
