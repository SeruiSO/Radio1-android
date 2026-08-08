/**
 * App Module - Main application entry point
 */

import { initAudio, play, pause, togglePlay, isAudioPlaying, 
         getCurrentStationInfo, setVolumeLevel, getVolumeLevel,
         toggleMute, isAudioMuted, cleanup, on } from './audio.js';
import { loadStations, searchStations, addUserStation } from './stations.js';
import { initFavorites, getFavoritesList, toggleFavorite, isFavorite } from './favorites.js';
import { initHistory } from './history.js';
import { 
  renderStationList, selectStation, updateTrackInfo,
  showLoading, hideLoading, showToast, updatePlayButton,
  updateConnectionStatus, updateVolumeSlider, toggleSearch,
  getUIElements, loadTheme, toggleTheme, updatePlayerInfo
} from './ui.js';
import { setupMediaSessionHandlers, setPlaybackState } from './media-session.js';

// ===== DOM References =====

const dom = getUIElements();

// ===== App State =====

let isInitialized = false;
let currentTab = 'all';
let searchResults = [];

// ===== Initialize =====

export async function initApp() {
  if (isInitialized) return;

  showLoading();

  try {
    // Load theme
    loadTheme();

    // Init modules
    await loadStations();
    initFavorites();
    await initHistory();

    // Init audio
    const audio = initAudio();
    setupAudioListeners();

    // Setup media session
    setupMediaSession();

    // Render UI
    renderStationList('all');
    updateConnectionStatus(navigator.onLine);
    updateVolumeSlider(getVolumeLevel());

    // Setup event listeners
    setupEventListeners();

    // Restore last station
    const savedStation = localStorage.getItem('radio_so_currentStation');
    if (savedStation) {
      try {
        const station = JSON.parse(savedStation);
        if (station && station.name) {
          selectStation(station);
        }
      } catch (e) {
        // Ignore
      }
    }

    isInitialized = true;
    hideLoading();
    showToast('Радіо готове до роботи! 🎵', 'success');

  } catch (error) {
    console.error('Initialization failed:', error);
    hideLoading();
    showToast('Помилка завантаження додатку', 'error');
  }
}

// ===== Setup Audio Listeners =====

function setupAudioListeners() {
  on('onPlay', (station) => {
    updatePlayButton(true);
    setPlaybackState('playing');
    if (station) {
      selectStation(station);
      // Save last station
      localStorage.setItem('radio_so_currentStation', JSON.stringify(station));
    }
  });

  on('onPause', () => {
    updatePlayButton(false);
    setPlaybackState('paused');
  });

  on('onError', (error) => {
    console.warn('Audio error:', error);
    showToast('Помилка відтворення. Перепідключення...', 'error', 2000);
  });

  on('onBuffering', (isBuffering) => {
    if (isBuffering) {
      showToast('⏳ Завантаження...', 'info', 1000);
    }
  });

  on('onTrackChange', (direction) => {
    if (direction === 'next') {
      handleNext();
    } else if (direction === 'prev') {
      handlePrev();
    }
  });
}

// ===== Setup Media Session =====

function setupMediaSession() {
  setupMediaSessionHandlers({
    play: () => {
      const station = getCurrentStationInfo();
      if (station) {
        play(station);
      }
    },
    pause: () => {
      pause();
    },
    previoustrack: handlePrev,
    nexttrack: handleNext,
    stop: () => {
      pause();
      setPlaybackState('none');
    }
  });
}

// ===== Setup Event Listeners =====

function setupEventListeners() {
  // Play/Pause
  dom.playPauseBtn.addEventListener('click', () => {
    const station = getCurrentStationInfo();
    if (!station) {
      // If no station selected, try to play first in list
      const firstItem = document.querySelector('.station-item:not(.empty)');
      if (firstItem) {
        const name = firstItem.dataset.name;
        const stations = getStationsForTab(currentTab);
        const station = stations.find(s => s.name === name);
        if (station) {
          togglePlay(station);
        }
      }
      return;
    }
    togglePlay(station);
  });

  // Prev/Next
  dom.prevBtn.addEventListener('click', handlePrev);
  dom.nextBtn.addEventListener('click', handleNext);

  // Volume
  dom.volumeSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    setVolumeLevel(value);
  });

  dom.muteBtn.addEventListener('click', () => {
    const muted = toggleMute();
    dom.muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  // Theme
  dom.themeToggle.addEventListener('click', () => {
    const theme = toggleTheme();
    showToast(`Тема: ${theme === 'dark' ? 'Темна' : 'Світла'}`, 'info');
  });

  // Share
  dom.shareButton.addEventListener('click', handleShare);

  // Search
  dom.searchBtn.addEventListener('click', handleSearch);
  dom.searchQuery.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  // Navigation - using event delegation for tabs
  document.querySelector('.tab-nav').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (!tabBtn) return;

    if (tabBtn.id === 'addTabBtn') {
      showAddTabModal();
      return;
    }

    const tab = tabBtn.dataset.tab;
    if (!tab) return;

    switchTab(tab);
  });

  // Network status
  window.addEventListener('online', () => {
    updateConnectionStatus(true);
    showToast('З\'єднання відновлено ✅', 'success');
    // Try to resume playback if it was playing before
    const station = getCurrentStationInfo();
    if (station && isAudioPlaying()) {
      play(station);
    }
  });

  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
    showToast('Втрачено з\'єднання з мережею 📡', 'error');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      dom.playPauseBtn.click();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      dom.prevBtn.click();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      dom.nextBtn.click();
    }
  });

  // Handle station selected from list
  document.addEventListener('stationSelected', (e) => {
    const { station } = e.detail;
    play(station);
  });

  // Listen for metadata updates from audio module
  document.addEventListener('trackMetadata', (e) => {
    updateTrackInfo(e.detail.track);
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cleanup();
  });
}

// ===== Switch Tab =====

function switchTab(tab) {
  currentTab = tab;
  selectedStation = null;

  // Update tab buttons
  document.querySelectorAll('.tab-btn:not(#addTabBtn)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });

  // Show/hide search
  toggleSearch(tab === 'search');

  // Render appropriate list
  if (tab === 'search') {
    // Show search results or empty state
    renderStationList('search', searchResults.length ? searchResults : []);
    if (!searchResults.length) {
      dom.stationList.innerHTML = `<div class="station-item empty">${getEmptyMessage('search')}</div>`;
    }
  } else {
    renderStationList(tab);
  }

  // Save last tab
  localStorage.setItem('radio_so_currentTab', tab);
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

// ===== Search Handler =====

async function handleSearch() {
  const query = dom.searchQuery.value.trim();
  const country = dom.searchCountry.value.trim();
  const genre = dom.searchGenre.value.trim();

  if (!query && !country && !genre) {
    showToast('Введіть назву, країну або жанр', 'info');
    return;
  }

  showLoading();
  try {
    const results = await searchStations(query, country, genre);
    searchResults = results;
    
    if (results.length === 0) {
      dom.stationList.innerHTML = `<div class="station-item empty">Нічого не знайдено 😕</div>`;
      stationItems = [];
      showToast('Нічого не знайдено', 'info');
    } else {
      renderStationList('search', results);
      showToast(`Знайдено ${results.length} станцій`, 'success');
    }
  } catch (error) {
    console.error('Search failed:', error);
    showToast('Помилка пошуку', 'error');
  } finally {
    hideLoading();
  }
}

// ===== Prev/Next Handlers =====

function handlePrev() {
  const items = document.querySelectorAll('.station-item:not(.empty)');
  if (!items.length) return;

  let currentIdx = -1;
  const currentName = getCurrentStationInfo()?.name;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].dataset.name === currentName) {
      currentIdx = i;
      break;
    }
  }

  const prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
  const station = getStationFromItem(items[prevIdx]);
  if (station) {
    play(station);
  }
}

function handleNext() {
  const items = document.querySelectorAll('.station-item:not(.empty)');
  if (!items.length) return;

  let currentIdx = -1;
  const currentName = getCurrentStationInfo()?.name;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].dataset.name === currentName) {
      currentIdx = i;
      break;
    }
  }

  const nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
  const station = getStationFromItem(items[nextIdx]);
  if (station) {
    play(station);
  }
}

function getStationFromItem(item) {
  const name = item.dataset.name;
  const stations = getStationsForTab(currentTab);
  return stations.find(s => s.name === name) || { name, value: item.dataset.value };
}

// ===== Share Handler =====

function handleShare() {
  const station = getCurrentStationInfo();
  if (!station) {
    showToast('Спочатку виберіть станцію', 'info');
    return;
  }

  const shareData = {
    title: `Radio S O - ${station.name}`,
    text: `🎵 Слухаю "${station.name}" на Radio S O! Приєднуйтесь!`,
    url: window.location.href
  };

  if (navigator.share) {
    navigator.share(shareData)
      .then(() => showToast('Поділились успішно! 📤', 'success'))
      .catch(() => showToast('Скасовано або помилка', 'info'));
  } else {
    // Fallback
    const text = `${shareData.text} ${shareData.url}`;
    navigator.clipboard.writeText(text)
      .then(() => showToast('Посилання скопійовано! 📋', 'success'))
      .catch(() => showToast('Копіювання не вдалося', 'error'));
  }
}

// ===== Add Tab Modal =====

function showAddTabModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Додати нову вкладку</h2>
      <input type="text" id="newTabInput" placeholder="Назва (a-z, 0-9, -, _)" maxlength="10" pattern="[a-z0-9_-]+">
      <div class="modal-actions">
        <button class="modal-confirm" id="confirmAddTab">Додати</button>
        <button class="modal-cancel" id="cancelAddTab">Скасувати</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#newTabInput');
  input.focus();

  overlay.querySelector('#confirmAddTab').addEventListener('click', () => {
    const name = input.value.trim().toLowerCase();
    if (!name) {
      showToast('Введіть назву', 'error');
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(name) || name.length > 10) {
      showToast('Назва: тільки a-z, 0-9, -, _ (до 10 символів)', 'error');
      return;
    }
    
    const customTabs = JSON.parse(localStorage.getItem('radio_so_customTabs') || '[]');
    if (customTabs.includes(name) || ['all', 'favorites', 'history', 'search'].includes(name)) {
      showToast('Така вкладка вже існує', 'error');
      return;
    }
    if (customTabs.length >= 7) {
      showToast('Максимум 7 власних вкладок', 'error');
      return;
    }

    customTabs.push(name);
    localStorage.setItem('radio_so_customTabs', JSON.stringify(customTabs));
    
    // Add tab button
    const nav = document.querySelector('.tab-nav');
    const addBtn = document.getElementById('addTabBtn');
    const tabBtn = document.createElement('button');
    tabBtn.className = 'tab-btn';
    tabBtn.dataset.tab = name;
    tabBtn.textContent = name.toUpperCase();
    nav.insertBefore(tabBtn, addBtn);
    
    overlay.remove();
    showToast(`Вкладка "${name}" створена ✅`, 'success');
    switchTab(name);
  });

  overlay.querySelector('#cancelAddTab').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ===== Export for debugging =====

export function getAppState() {
  return {
    isInitialized,
    currentTab,
    currentStation: getCurrentStationInfo(),
    isPlaying: isAudioPlaying(),
    favorites: getFavoritesList()
  };
}

// ===== Start App =====

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Expose to window for debugging
window.__radio = {
  initApp,
  getAppState,
  play,
  pause,
  togglePlay,
  getFavoritesList,
  toggleFavorite,
  isFavorite
};