/**
 * Storage Module - Abstraction layer for localStorage and IndexedDB
 */

const STORAGE_PREFIX = 'radio_so_';

// ===== LocalStorage Helpers =====

export function getItem(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + key);
    if (value === null) return defaultValue;
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to read "${key}" from localStorage:`, error);
    return defaultValue;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Failed to write "${key}" to localStorage:`, error);
    return false;
  }
}

export function removeItem(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove "${key}" from localStorage:`, error);
    return false;
  }
}

// ===== IndexedDB Helpers =====

let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open('RadioSODB', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // History store
      if (!db.objectStoreNames.contains('history')) {
        const store = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('stationName', 'stationName', { unique: false });
      }
      
      // Favorites store (backup for large data)
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'stationName' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export async function addHistoryEntry(entry) {
  try {
    const db = await openDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    const result = await new Promise((resolve, reject) => {
      const request = store.add({
        ...entry,
        timestamp: entry.timestamp || Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return result;
  } catch (error) {
    console.warn('Failed to add history entry:', error);
    return null;
  }
}

export async function getHistory(limit = 50) {
  try {
    const db = await openDB();
    const tx = db.transaction('history', 'readonly');
    const store = tx.objectStore('history');
    const index = store.index('timestamp');
    
    const entries = await new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];
      let count = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && count < limit) {
          results.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
    
    return entries;
  } catch (error) {
    console.warn('Failed to get history:', error);
    return [];
  }
}

export async function clearHistory() {
  try {
    const db = await openDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return true;
  } catch (error) {
    console.warn('Failed to clear history:', error);
    return false;
  }
}

export async function removeHistoryEntry(id) {
  try {
    const db = await openDB();
    const tx = db.transaction('history', 'readwrite');
    const store = tx.objectStore('history');
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return true;
  } catch (error) {
    console.warn('Failed to remove history entry:', error);
    return false;
  }
}

// ===== Legacy Favorites (sync with localStorage) =====

export function getFavorites() {
  return getItem('favorites', []);
}

export function setFavorites(favorites) {
  return setItem('favorites', favorites);
}

export function toggleFavorite(stationName) {
  const favorites = getFavorites();
  const index = favorites.indexOf(stationName);
  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.unshift(stationName);
  }
  setFavorites(favorites);
  return favorites;
}

// ===== User Stations =====

export function getUserStations() {
  return getItem('userStations', {});
}

export function setUserStations(stations) {
  return setItem('userStations', stations);
}

export function addUserStation(tab, station) {
  const stations = getUserStations();
  if (!stations[tab]) stations[tab] = [];
  // Avoid duplicates by name
  if (!stations[tab].some(s => s.name === station.name)) {
    stations[tab].unshift(station);
    setUserStations(stations);
    return true;
  }
  return false;
}

export function removeUserStation(tab, stationName) {
  const stations = getUserStations();
  if (stations[tab]) {
    stations[tab] = stations[tab].filter(s => s.name !== stationName);
    setUserStations(stations);
    return true;
  }
  return false;
}

// ===== Deleted Stations =====

export function getDeletedStations() {
  return getItem('deletedStations', []);
}

export function setDeletedStations(stations) {
  return setItem('deletedStations', stations);
}

export function addDeletedStation(stationName) {
  const deleted = getDeletedStations();
  if (!deleted.includes(stationName)) {
    deleted.push(stationName);
    setDeletedStations(deleted);
    return true;
  }
  return false;
}

// ===== Custom Tabs =====

export function getCustomTabs() {
  return getItem('customTabs', []);
}

export function setCustomTabs(tabs) {
  return setItem('customTabs', tabs);
}

// ===== Theme =====

export function getTheme() {
  return getItem('theme', 'dark');
}

export function setTheme(theme) {
  return setItem('theme', theme);
}

// ===== Volume =====

export function getVolume() {
  return getItem('volume', 0.9);
}

export function setVolume(volume) {
  return setItem('volume', volume);
}

// ===== Current Station =====

export function getCurrentStation() {
  return getItem('currentStation', null);
}

export function setCurrentStation(station) {
  return setItem('currentStation', station);
}

// ===== Last Station Index =====

export function getLastStationIndex(tab) {
  return getItem(`lastIndex_${tab}`, 0);
}

export function setLastStationIndex(tab, index) {
  return setItem(`lastIndex_${tab}`, index);
}