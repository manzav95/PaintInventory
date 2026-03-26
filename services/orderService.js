import config from '../config';

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  console.log('[OrderService] Request:', (options.method || 'GET'), url);
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error(res.status === 0 ? 'Network error' : `Server error (${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || data.detail || `Request failed (${res.status})`);
    console.log('[OrderService] Success:', (options.method || 'GET'), endpoint);
    return data;
  } catch (err) {
    console.error('[OrderService] Failed:', (options.method || 'GET'), url, err.message);
    throw err;
  }
}

export default {
  async getOrders(limit = 100) {
    try {
      const data = await _fetch(`/api/orders?limit=${limit}`);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.orders)) return data.orders;
      return [];
    } catch (e) {
      console.error('OrderService getOrders:', e);
      return [];
    }
  },

  async getOnOrderSummary() {
    try {
      const summary = await _fetch('/api/orders/on-order-summary');
      return summary && typeof summary === 'object' ? summary : {};
    } catch (e) {
      console.error('OrderService getOnOrderSummary:', e);
      return {};
    }
  },

  async getBackOrderCount() {
    try {
      const data = await _fetch('/api/orders/back-order-count');
      return data && typeof data.count === 'number' ? data.count : 0;
    } catch (e) {
      console.error('OrderService getBackOrderCount:', e);
      return 0;
    }
  },

  async getLateOrderCount() {
    try {
      const data = await _fetch('/api/orders/late-order-count');
      return data && typeof data.count === 'number' ? data.count : 0;
    } catch (e) {
      console.error('OrderService getLateOrderCount:', e);
      return 0;
    }
  },

  async createOrder(poNumber, leadTimeDays, lines, userName, placedAt = null) {
    console.log('[OrderService] createOrder → API base:', API_URL);
    const body = {
      po_number: poNumber,
      lead_time_days: leadTimeDays,
      lines: lines || [],
      userName: userName || null,
    };
    if (placedAt) body.placed_at = placedAt;
    return _fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateOrder(orderId, poNumber, leadTimeDays, lines, placedAt = null) {
    console.log('[OrderService] updateOrder → API base:', API_URL);
    const body = {
      po_number: poNumber,
      lead_time_days: leadTimeDays,
      lines: lines || [],
    };
    if (placedAt) body.placed_at = placedAt;
    return _fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async markOrderReceived(orderId) {
    return _fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'received' }),
    });
  },

  async receiveOrderLine(orderId, itemId, quantity) {
    return _fetch(`/api/orders/${orderId}/receive`, {
      method: 'POST',
      body: JSON.stringify({ itemId, quantity }),
    });
  },

  async updateOrderReceivedLines(orderId, lines) {
    return _fetch(`/api/orders/${orderId}/received-lines`, {
      method: 'PUT',
      body: JSON.stringify({ lines }),
    });
  },
};
