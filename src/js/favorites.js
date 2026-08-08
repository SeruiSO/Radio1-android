/**
 * History Module - Manage listening history
 */

import { getHistory, addHistoryEntry, clearHistory, removeHistoryEntry } from './storage.js';

let historyCache = [];

// ===== Initialize =====

export async function initHistory() {
  historyCache = await getHistory(100);
  return historyCache;
}

// ===== Get History =====

export function getHistoryList() {
  return historyCache;
}

// ===== Add Entry =====

export async function addToHistory(station) {
  const entry = {
    stationName: station.name,
    stationValue: station.value,
    genre: station.genre || '',
    country: station.country || '',
    favicon: station.favicon || '',
    timestamp: Date.now(),
    listenedAt: new Date().toISOString()
  };

  // Remove duplicate if exists
  historyCache = historyCache.filter(h => h.stationName !== station.name);
  
  // Add to front
  historyCache.unshift(entry);
  
  // Limit to 100 entries
  if (historyCache.length > 100) {
    historyCache = historyCache.slice(0, 100);
  }

  // Save to IndexedDB
  await addHistoryEntry(entry);
  
  return historyCache;
}

// ===== Clear History =====

export async function clearAllHistory() {
  historyCache = [];
  await clearHistory();
  return historyCache;
}

// ===== Remove Entry =====

export async function removeHistoryItem(id) {
  historyCache = historyCache.filter(h => h.id !== id);
  await removeHistoryEntry(id);
  return historyCache;
}

// ===== Get Station from History =====

export function getStationFromHistory(entry) {
  return {
    name: entry.stationName,
    value: entry.stationValue,
    genre: entry.genre || 'Unknown',
    country: entry.country || 'Unknown',
    favicon: entry.favicon || ''
  };
}