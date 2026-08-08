/**
 * UI Module - DOM manipulation and rendering
 */

import { 
  getStationsForTab, 
  getAllStations,
  getStationByName,
  removeStation,
  addUserStation 
} from './stations.js';
import { 
  getFavoritesList,
  toggleFavorite, 
  isFavorite, 
  getFavoriteStations,
  initFavorites 
} from './favorites.js';
import { 
  getHistoryList, 
  addToHistory, 
  removeHistoryItem,
  getStationFromHistory,
  clearAllHistory 
} from './history.js';
import { isAudioPlaying, getCurrentStationInfo, getVolumeLevel } from './audio.js';

let currentTab = 'all';
let currentIndex = 0;
let selectedStation = null;
let stationItems = [];
let toastTimeout = null;
let isLoading = false;

// ===== DOM References =====

const dom = {
  stationList: document.getElementById('stationList'),
  playerArtwork: document.getElementById('stationArtwork'),
  stationName: document.getElementById('stationName'),
  stationGenre: document.getElementById('stationGenre'),
  stationCountry: document.getElementById('stationCountry'),
  currentTrack: document.getElementById('currentTrack'),
  connectionStatus: document.getElementById('connectionStatus'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  volumeSlider: document.getElementById('volumeSlider'),
  muteBtn: document.getElementById('muteBtn'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  toastContainer: document.getElementById('toastContainer'),
  searchContainer: document.getElementById('searchContainer'),
  searchQuery: document.getElementById('searchQuery'),
  searchCountry: document.getElementById('searchCountry'),
  searchGenre: document.getElementById('searchGenre'),
  searchBtn: document.getElementById('searchBtn'),
  themeToggle: document.getElementById('themeToggle'),
  shareButton: document.getElementById('shareButton'),
  addTabBtn: document.getElementById('addTabBtn'),
  audioPlayer: document.getElementById('audioPlayer')
};

// ===== Render Station List =====

export function renderStationList(tab = currentTab, stations = null) {
  if (isLoading) return;

  currentTab = tab;

  if (!stations) {
    if (tab === 'favorites') {
      stations = getFavoriteStations();
    } else if (tab === 'history') {
      stations = getHistoryList().map(entry => getStationFromHistory(entry));
    } else if (tab === 'all') {
      stations = getAllStations();
    } else {
      stations = getStationsForTab(tab);
    }
  }

  const container = dom.stationList;
  const emptyMessage = getEmptyMessage(tab);

  if (!stations || stations.length === 0) {
    container.innerHTML = `<div class="station-item empty">${emptyMessage}</div>`;
    stationItems = [];
    return;
  }

  // Filter out stations without URL
  const validStations = stations.filter(s => s.value || s.url);
  
  if (validStations.length === 0) {
    container.innerHTML = `<div class="station-item empty">Немає доступних станцій</div>`;
    stationItems = [];
    return;
  }

  // Build HTML
  let html = '';
  const favorites = getFavoritesList();
  const currentStation = getCurrentStationInfo();
  const playingStation = currentStation?.name;

  for (let i = 0; i < validStations.length; i++) {
    const s = validStations[i];
    const isSelected = (s.name === playingStation || 
                       (selectedStation && s.name === selectedStation.name));
    const isFav = favorites.includes(s.name);
    
    html += `
      <div class="station-item ${isSelected ? 'selected' : ''}" 
           data-index="${i}" 
           data-name="${escapeHtml(s.name)}"
           data-value="${escapeHtml(s.value || s.url)}">
        <div class="station-icon">
          ${s.favicon ? `<img src="${escapeHtml(s.favicon)}" alt="" loading="lazy" onerror="this.parentElement.textContent='🎵'">` : '🎵'}
        </div>
        <div class="station-info">
          <div class="station-name">${escapeHtml(s.name)}</div>
          <div class="station-meta">${escapeHtml(s.genre || '')} • ${escapeHtml(s.country || '')}</div>
        </div>
        <div class="station-actions">
          <button class="favorite-btn ${isFav ? 'active' : ''}" 
                  data-name="${escapeHtml(s.name)}" 
                  aria-label="${isFav ? 'Видалити з обраного' : 'Додати в обране'}">
            ${isFav ? '⭐' : '☆'}
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  stationItems = container.querySelectorAll('.station-item');

  // Attach event listeners
  container.querySelectorAll('.station-item').forEach((item, index) => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      const station = findStationByName(name, validStations);
      if (station) {
        selectStation(station);
      }
    });

    const favBtn = item.querySelector('.favorite-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = favBtn.dataset.name;
        toggleFavoriteByName(name);
        renderStationList(currentTab);
      });
    }
  });

  // Restore current index if possible
  if (selectedStation) {
    const idx = validStations.findIndex(s => s.name === selectedStation.name);
    if (idx >= 0) currentIndex = idx;
  }
}

function getEmptyMessage(tab) {
  const messages = {
    'all': 'Немає доступних станцій',
    'favorites': 'Немає обраних станцій. Додайте станції до обраного!',
    'history': 'Історія прослуховування порожня. Послухайте щось!',
    'search': 'Введіть запит для пошуку станцій'
  };
  return messages[tab] || 'Немає станцій';
}

function findStationByName(name, stations) {
  return stations.find(s => s.name === name) || getStationByName(name);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Select Station =====

export function selectStation(station) {
  if (!station) return;
  
  selectedStation = station;
  selectedStation.value = selectedStation.value || selectedStation.url;
  
  // Update UI
  updatePlayerInfo(station);
  
  // Add to history
  addToHistory(station);
  
  // Emit event for audio module
  const event = new CustomEvent('stationSelected', { detail: { station } });
  document.dispatchEvent(event);
}

// ===== Update Player Info =====

export function updatePlayerInfo(station) {
  if (!station) return;

  dom.stationName.textContent = station.name || 'Unknown';
  dom.stationGenre.textContent = `жанр: ${station.genre || '-'}`;
  dom.stationCountry.textContent = `країна: ${station.country || '-'}`;
  
  // Artwork
  if (station.favicon) {
    dom.playerArtwork.innerHTML = `<img src="${escapeHtml(station.favicon)}" alt="${escapeHtml(station.name)}" loading="lazy" onerror="this.parentElement.textContent='🎵'">`;
  } else {
    dom.playerArtwork.textContent = '🎵';
  }

  // Highlight in list
  if (stationItems.length) {
    stationItems.forEach(item => {
      item.classList.toggle('selected', item.dataset.name === station.name);
    });
  }
}

// ===== Update Track Info =====

export function updateTrackInfo(track, isLoading = false) {
  const el = dom.currentTrack;
  if (!el) return;

  if (isLoading) {
    el.textContent = '🎵 Завантаження...';
    el.classList.add('loading');
    return;
  }

  if (track && track !== 'unknown' && track !== 'null') {
    let cleanTrack = track.replace(/^StreamTitle='|';$|'$/g, '').trim();
    if (cleanTrack) {
      el.textContent = `🎵 ${cleanTrack}`;
      el.classList.remove('loading');
      el.title = cleanTrack;
      return;
    }
  }

  // Fallback: show station name
  const station = getCurrentStationInfo();
  el.textContent = `🎵 ${station?.name || 'Невідомо'}`;
  el.classList.remove('loading');
}

// ===== Update Connection Status =====

export function updateConnectionStatus(online) {
  const el = dom.connectionStatus;
  if (!el) return;

  if (online) {
    el.textContent = '🟢 Онлайн';
    el.className = 'connection-status online';
  } else {
    el.textContent = '🔴 Офлайн';
    el.className = 'connection-status offline';
  }
}

// ===== Update Play/Pause Button =====

export function updatePlayButton(playing) {
  const btn = dom.playPauseBtn;
  if (!btn) return;

  if (playing) {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="40" height="40">
        <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
    `;
    btn.classList.add('playing');
    btn.setAttribute('aria-label', 'Пауза');
  } else {
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="40" height="40">
        <path fill="currentColor" d="M8 5v14l11-7z"/>
      </svg>
    `;
    btn.classList.remove('playing');
    btn.setAttribute('aria-label', 'Грати');
  }
}

// ===== Show/Hide Loading =====

export function showLoading() {
  isLoading = true;
  dom.loadingIndicator.style.display = 'block';
}

export function hideLoading() {
  isLoading = false;
  dom.loadingIndicator.style.display = 'none';
}

// ===== Toast Notifications =====

export function showToast(message, type = 'info', duration = 3000) {
  const el = dom.toastContainer;
  if (!el) return;

  el.textContent = message;
  el.className = 'toast-container show';
  
  if (type === 'success') el.classList.add('success');
  if (type === 'error') el.classList.add('error');

  if (toastTimeout) clearTimeout(toastTimeout);
  
  toastTimeout = setTimeout(() => {
    el.classList.remove('show');
    toastTimeout = null;
  }, duration);
}

// ===== Toggle Search =====

export function toggleSearch(show) {
  dom.searchContainer.style.display = show ? 'flex' : 'none';
}

// ===== Toggle Favorite =====

function toggleFavoriteByName(name) {
  toggleFavorite(name);
}

// ===== Volume Control =====

export function updateVolumeSlider(volume) {
  dom.volumeSlider.value = volume;
}

// ===== Theme Management =====

export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('radio_so_theme', newTheme);
  dom.themeToggle.textContent = isDark ? '☀️' : '🌙';
  return newTheme;
}

export function loadTheme() {
  const saved = localStorage.getItem('radio_so_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  dom.themeToggle.textContent = saved === 'dark' ? '🌙' : '☀️';
  return saved;
}

// ===== Export UI Controls Reference =====

export function getUIElements() {
  return dom;
}