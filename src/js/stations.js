/**
 * Stations Module - Load and manage radio stations
 */

import { 
  getUserStations, 
  setUserStations, 
  getDeletedStations,
  addDeletedStation,
  getCustomTabs
} from './storage.js';

let stationCache = {};
let isLoading = false;
let abortController = null;

// ===== Load Stations =====

export async function loadStations(forceRefresh = false) {
  if (isLoading) return stationCache;
  isLoading = true;

  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  try {
    const response = await fetch(`/stations.json?t=${Date.now()}`, {
      cache: forceRefresh ? 'no-store' : 'default',
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const deleted = getDeletedStations();
    const userStations = getUserStations();
    const customTabs = getCustomTabs();

    // Merge base stations with user stations
    const merged = {};
    
    // Process all tabs from base data
    for (const [tab, stations] of Object.entries(data)) {
      merged[tab] = mergeStations(stations, userStations[tab] || [], deleted);
    }

    // Process custom tabs
    for (const tab of customTabs) {
      if (!merged[tab]) {
        merged[tab] = mergeStations([], userStations[tab] || [], deleted);
      }
    }

    // Ensure all user stations are preserved even if tab is not in base
    for (const [tab, stations] of Object.entries(userStations)) {
      if (!merged[tab]) {
        merged[tab] = mergeStations([], stations, deleted);
      }
    }

    stationCache = merged;
    return stationCache;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Stations load aborted');
    } else {
      console.error('Failed to load stations:', error);
      throw error;
    }
    return stationCache;
  } finally {
    isLoading = false;
    abortController = null;
  }
}

function mergeStations(baseStations, userStations, deleted) {
  const map = new Map();

  // Add user stations first (priority)
  for (const station of userStations) {
    if (!deleted.includes(station.name)) {
      map.set(station.name, { ...station, isUserStation: true });
    }
  }

  // Add base stations (skip if already exists or deleted)
  for (const station of baseStations) {
    if (!deleted.includes(station.name) && !map.has(station.name)) {
      map.set(station.name, { ...station, isUserStation: false });
    }
  }

  return Array.from(map.values());
}

// ===== Get Stations for Tab =====

export function getStationsForTab(tab) {
  if (tab === 'all') {
    return getAllStations();
  }
  return stationCache[tab] || [];
}

export function getAllStations() {
  const all = [];
  for (const [tab, stations] of Object.entries(stationCache)) {
    for (const station of stations) {
      if (!all.some(s => s.name === station.name)) {
        all.push({ ...station, _tab: tab });
      }
    }
  }
  return all;
}

// ===== Get Station by Name =====

export function getStationByName(name) {
  for (const stations of Object.values(stationCache)) {
    const found = stations.find(s => s.name === name);
    if (found) return found;
  }
  return null;
}

// ===== Add User Station =====

export function addUserStation(tab, station) {
  if (!stationCache[tab]) {
    stationCache[tab] = [];
  }
  
  // Avoid duplicates
  if (stationCache[tab].some(s => s.name === station.name)) {
    return false;
  }

  const userStations = getUserStations();
  if (!userStations[tab]) userStations[tab] = [];
  
  // Check if already in user stations
  if (userStations[tab].some(s => s.name === station.name)) {
    return false;
  }

  const newStation = {
    ...station,
    isUserStation: true
  };

  stationCache[tab].unshift(newStation);
  userStations[tab].unshift(station);
  setUserStations(userStations);
  
  return true;
}

// ===== Remove Station =====

export function removeStation(tab, stationName) {
  const station = stationCache[tab]?.find(s => s.name === stationName);
  if (!station) return false;

  // Remove from cache
  stationCache[tab] = stationCache[tab].filter(s => s.name !== stationName);

  // If user station, remove from user storage
  if (station.isUserStation) {
    const userStations = getUserStations();
    if (userStations[tab]) {
      userStations[tab] = userStations[tab].filter(s => s.name !== stationName);
      setUserStations(userStations);
    }
  } else {
    // Add to deleted list
    addDeletedStation(stationName);
  }

  return true;
}

// ===== Search Stations via API =====

export async function searchStations(query, country = '', genre = '') {
  try {
    const params = new URLSearchParams();
    if (query) params.append('name', query);
    if (country) params.append('country', country);
    if (genre) params.append('tag', genre);
    params.append('order', 'clickcount');
    params.append('reverse', 'true');
    params.append('limit', '100');
    params.append('hidebroken', 'true');

    const url = `https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RadioSO/1.0' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let stations = await response.json();
    
    // Filter and normalize
    stations = stations
      .filter(s => s.url || s.url_resolved)
      .map(s => ({
        value: (s.url || s.url_resolved).replace('http://', 'https://'),
        name: s.name || 'Unknown',
        genre: s.tags || 'Unknown',
        country: s.country || 'Unknown',
        favicon: s.favicon ? s.favicon.replace('http://', 'https://') : '',
        clickCount: s.clickcount || 0,
        isFromSearch: true
      }));

    return stations;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}