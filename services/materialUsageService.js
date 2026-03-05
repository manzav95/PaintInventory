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

class MaterialUsageService {
  async list(boothFilter = null, limit = 500) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (boothFilter && boothFilter.trim() !== '' && boothFilter.toLowerCase() !== 'all') {
      params.set('booth', boothFilter.trim());
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
}

export default new MaterialUsageService();
