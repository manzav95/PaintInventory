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
    const list = await _fetch(`/api/orders?limit=${limit}`);
    return Array.isArray(list) ? list : [];
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

  async createOrder(poNumber, leadTimeDays, lines, userName) {
    console.log('[OrderService] createOrder → API base:', API_URL);
    return _fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        po_number: poNumber,
        lead_time_days: leadTimeDays,
        lines: lines || [],
        userName: userName || null,
      }),
    });
  },

  async updateOrder(orderId, poNumber, leadTimeDays, lines) {
    console.log('[OrderService] updateOrder → API base:', API_URL);
    return _fetch(`/api/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({
        po_number: poNumber,
        lead_time_days: leadTimeDays,
        lines: lines || [],
      }),
    });
  },

  async markOrderReceived(orderId) {
    return _fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'received' }),
    });
  },
};
