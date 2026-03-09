import config from '../config';

const API_URL = config.API_URL;

async function _fetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' },
  };
  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (error) {
    console.error(`Material usage API (${endpoint}):`, error);
    throw error;
  }
}

export const BOOTH_OPTIONS = [
  { label: 'Booth 1&3', value: 'Booth 1&3' },
  { label: 'Booth 2', value: 'Booth 2' },
  { label: 'Booth 4', value: 'Booth 4' },
];

export const CATALYST_PERCENT = 4;

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class MaterialUsageService {
  async list(boothFilter = null, limit = 500, options = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (boothFilter && boothFilter.trim() !== '' && boothFilter.toLowerCase() !== 'all') {
      params.set('booth', boothFilter.trim());
    }
    if (options.restrictToToday) {
      const today = todayYYYYMMDD();
      params.set('from', today);
      params.set('to', today);
    }
    const data = await _fetch(`/api/material-usage?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  }

  async create(entry) {
    return _fetch('/api/material-usage', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  async confirmCatalyzed(id, catalyzed) {
    return _fetch(`/api/material-usage/${id}/catalyzed`, {
      method: 'PATCH',
      body: JSON.stringify({ catalyzed: !!catalyzed }),
    });
  }

  async getOvertime() {
    try {
      const data = await _fetch('/api/settings/overtime');
      return data.overtime === true;
    } catch (e) {
      console.error('Material usage get overtime:', e);
      return false;
    }
  }

  async setOvertime(enabled) {
    return _fetch('/api/settings/overtime', {
      method: 'POST',
      body: JSON.stringify({ overtime: !!enabled }),
    });
  }

  getExportExcelUrl(fromDate, toDate) {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    return `${API_URL}/api/export/material-usage/excel?${params.toString()}`;
  }
}

export default new MaterialUsageService();
