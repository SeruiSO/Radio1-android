// ============================================
// RADIO MUSIC S O - ULTRA MODERN SCRIPT 2025
// Glassmorphism UI + Enhanced Features
// ============================================

// ===== Constants =====
const CONSTANTS = {
  CACHE_NAME: 'radio-cache-v112',
  METADATA_UPDATE_INTERVAL: 15000,
  AUTO_PLAY_RETRY_COUNT: 2,
  AUTO_PLAY_DELAY: 1000,
  ERROR_LIMIT: 15,
  MAX_CUSTOM_TABS: 7,
  PAST_SEARCHES_LIMIT: 5,
  DRAG_THRESHOLD: 100,
  TOAST_DURATION: 3000,
  VOLUME_STORAGE_KEY: 'volume',
  THEME_STORAGE_KEY: 'selectedTheme',
  CURRENT_TAB_KEY: 'currentTab',
  IS_PLAYING_KEY: 'isPlaying',
  INTENDED_PLAYING_KEY: 'intendedPlaying',
  FAVORITES_KEY: 'favoriteStations',
  STATION_LISTS_KEY: 'stationLists',
  USER_ADDED_KEY: 'userAddedStations',
  PAST_SEARCHES_KEY: 'pastSearches',
  DELETED_STATIONS_KEY: 'deletedStations',
  CUSTOM_TABS_KEY: 'customTabs',
  LAST_STATION_KEY: 'lastStation_',
};

// ===== State =====
let state = {
  currentTab: localStorage.getItem(CONSTANTS.CURRENT_TAB_KEY) || 'techno',
  currentIndex: 0,
  favoriteStations: JSON.parse(localStorage.getItem(CONSTANTS.FAVORITES_KEY)) || [],
  isPlaying: localStorage.getItem(CONSTANTS.IS_PLAYING_KEY) === 'true' || false,
  intendedPlaying: localStorage.getItem(CONSTANTS.INTENDED_PLAYING_KEY) === 'true' || false,
  stationLists: JSON.parse(localStorage.getItem(CONSTANTS.STATION_LISTS_KEY)) || {},
  userAddedStations: JSON.parse(localStorage.getItem(CONSTANTS.USER_ADDED_KEY)) || {},
  stationItems: [],
  pastSearches: JSON.parse(localStorage.getItem(CONSTANTS.PAST_SEARCHES_KEY)) || [],
  deletedStations: JSON.parse(localStorage.getItem(CONSTANTS.DELETED_STATIONS_KEY)) || [],
  customTabs: JSON.parse(localStorage.getItem(CONSTANTS.CUSTOM_TABS_KEY)) || [],
  errorCount: 0,
  isAutoPlayPending: false,
  lastSuccessfulPlayTime: 0,
  autoPlayRequestId: 0,
  currentTrack: '',
  dragEnabled: false,
  dragStartIndex: null,
  longPressTimer: null,
  isPulling: false,
  viewTransitionSupported: document.startViewTransition ? true : false,
  metadataCheckInterval: null,
  metadataRetryTimeout: null,
  searchDebounceTimer: null,
  lazyLoadObserver: null,
  abortController: new AbortController(),
  streamAbortController: null,
  errorTimeout: null,
};

// ===== DOM Cache =====
let DOM = {};

function cacheDOM() {
  DOM = {
    audio: document.getElementById('audioPlayer'),
    stationList: document.getElementById('stationList'),
    playPauseBtn: document.querySelector('.controls .control-btn:nth-child(2)'),
    currentStationInfo: document.getElementById('currentStationInfo'),
    themeToggle: document.querySelector('.theme-toggle'),
    shareButton: document.querySelector('.share-button'),
    exportButton: document.querySelector('.export-button'),
    importButton: document.querySelector('.import-button'),
    importFileInput: document.getElementById('importFileInput'),
    searchInput: document.getElementById('searchInput'),
    searchQuery: document.getElementById('searchQuery'),
    searchCountry: document.getElementById('searchCountry'),
    searchGenre: document.getElementById('searchGenre'),
    searchBtn: document.querySelector('.search-btn'),
    pastSearchesList: document.getElementById('pastSearches'),
    tabsContainer: document.getElementById('tabs'),
    currentTrackElement: document.getElementById('currentTrack'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    toastContainer: document.getElementById('toastContainer'),
    pullIndicator: document.getElementById('pullIndicator'),
    waveVisualizer: document.querySelector('.wave-visualizer'),
    stationName: document.querySelector('#currentStationInfo .station-name'),
    stationGenre: document.querySelector('#currentStationInfo .station-genre'),
    stationCountry: document.querySelector('#currentStationInfo .station-country'),
    stationIcon: document.querySelector('#currentStationInfo .station-icon'),
  };
}

// ===== Utility Functions =====
function showToast(message, type = 'info', duration = CONSTANTS.TOAST_DURATION) {
  if (!DOM.toastContainer) return;
  
  DOM.toastContainer.textContent = message;
  DOM.toastContainer.className = 'toast-container show';
  
  if (type === 'error') {
    DOM.toastContainer.style.borderColor = '#FF5252';
  } else if (type === 'success') {
    DOM.toastContainer.style.borderColor = 'var(--accent)';
  } else {
    DOM.toastContainer.style.borderColor = 'var(--glass-border)';
  }
  
  clearTimeout(DOM.toastContainer._timeout);
  DOM.toastContainer._timeout = setTimeout(() => {
    DOM.toastContainer.classList.remove('show');
  }, duration);
}

function provideHapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

function showLoading() {
  if (DOM.loadingIndicator) {
    DOM.loadingIndicator.classList.add('show');
  }
}

function hideLoading() {
  if (DOM.loadingIndicator) {
    DOM.loadingIndicator.classList.remove('show');
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url;
  }
}

function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

function shortenGenre(tags) {
  if (!tags) return '';
  const genres = tags.split(',').map(g => g.trim()).filter(g => g);
  return genres.length > 4 ? genres.slice(0, 4).join(', ') + '...' : genres.join(', ');
}

function normalizeCountry(country) {
  if (!country) return '';
  const map = {
    'ukraine': 'Ukraine', 'italy': 'Italy', 'german': 'Germany',
    'germany': 'Germany', 'france': 'France', 'spain': 'Spain',
    'usa': 'United States', 'united states': 'United States',
    'uk': 'United Kingdom', 'united kingdom': 'United Kingdom',
    'netherlands': 'Netherlands', 'canada': 'Canada', 'australia': 'Australia',
    'switzerland': 'Switzerland', 'belgium': 'Belgium', 'poland': 'Poland',
    'austria': 'Austria', 'sweden': 'Sweden', 'norway': 'Norway',
    'denmark': 'Denmark', 'japan': 'Japan', 'south korea': 'South Korea',
    'new zealand': 'New Zealand'
  };
  const normalized = country.toLowerCase();
  return map[normalized] || country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
}

function supportsMetadata(stationUrl) {
  if (!stationUrl) return true;
  const noMetadataDomains = [
    'online.hitfm.ua',
    'online.radiorecord.com.ua',
    'cast.brg.ua',
    'icecast.luxnet.ua'
  ];
  try {
    const url = new URL(stationUrl);
    return !noMetadataDomains.some(domain => url.hostname.includes(domain));
  } catch {
    return true;
  }
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===== Metadata Functions =====
function updateTrackDisplay(track) {
  if (!DOM.currentTrackElement) return;
  
  DOM.currentTrackElement.classList.remove('loading', 'marquee');
  
  if (track && track !== 'unknown' && track !== 'loading...' && track !== 'null' && track !== 'undefined') {
    let cleanTrack = track.replace(/^StreamTitle='|';$|'$/g, '').trim();
    cleanTrack = cleanTrack.replace(/[^\x20-\x7E\u0400-\u04FF]/g, '');
    
    if (!cleanTrack || cleanTrack.length === 0) {
      const name = state.stationItems?.[state.currentIndex]?.dataset?.name || 'unknown';
      cleanTrack = name;
    }
    
    if (cleanTrack.includes(' - ')) {
      const parts = cleanTrack.split(' - ');
      if (parts.length >= 2) {
        cleanTrack = `${parts[0]} - ${parts[1]}`;
      }
    }
    
    if (cleanTrack.length > 50) {
      DOM.currentTrackElement.classList.add('marquee');
    }
    
    DOM.currentTrackElement.textContent = `🎵 ${cleanTrack}`;
    DOM.currentTrackElement.title = cleanTrack;
    state.currentTrack = cleanTrack;
  } else if (track === 'loading...') {
    DOM.currentTrackElement.textContent = '🎵 Завантаження треку...';
    DOM.currentTrackElement.classList.add('loading');
    state.currentTrack = '';
  } else {
    const name = state.stationItems?.[state.currentIndex]?.dataset?.name || 'unknown';
    DOM.currentTrackElement.textContent = `🎵 ${name}`;
    state.currentTrack = name;
  }
}

function stopMetadataStreaming() {
  if (state.metadataCheckInterval) {
    clearInterval(state.metadataCheckInterval);
    state.metadataCheckInterval = null;
  }
  if (state.metadataRetryTimeout) {
    clearTimeout(state.metadataRetryTimeout);
    state.metadataRetryTimeout = null;
  }
}

async function fetchTrackMetadata(stationUrl, stationName) {
  stopMetadataStreaming();
  
  if (!stationUrl || !state.isPlaying) {
    updateTrackDisplay('unknown');
    return;
  }
  
  updateTrackDisplay('loading...');
  
  if (!supportsMetadata(stationUrl)) {
    updateTrackDisplay(stationName);
    return;
  }
  
  try {
    const encodedUrl = encodeURIComponent(stationUrl);
    const searchUrl = `https://de1.api.radio-browser.info/json/stations/byurl/${encodedUrl}?limit=1&hidebroken=true`;
    
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'RadioMusicSO/1.0' }
    });
    
    if (response.ok) {
      const stations = await response.json();
      if (stations.length > 0 && stations[0].current_track) {
        updateTrackDisplay(stations[0].current_track);
        startPeriodicApiCheck(stations[0].id);
        return;
      }
    }
  } catch (error) {
    // Silently fail, try next method
  }
  
  try {
    const searchParams = new URLSearchParams({
      name: stationName,
      limit: 10,
      order: 'clickcount',
      reverse: 'true',
      hidebroken: 'true'
    });
    
    const searchUrl = `https://de1.api.radio-browser.info/json/stations/search?${searchParams.toString()}`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'RadioMusicSO/1.0' }
    });
    
    if (response.ok) {
      const stations = await response.json();
      const normalizedTarget = normalizeUrl(stationUrl);
      
      for (const station of stations) {
        if (station.url_resolved && normalizeUrl(station.url_resolved) === normalizedTarget) {
          if (station.current_track) {
            updateTrackDisplay(station.current_track);
            startPeriodicApiCheck(station.id);
            return;
          }
          break;
        }
      }
      
      if (stations.length > 0 && stations[0].current_track) {
        updateTrackDisplay(stations[0].current_track);
        startPeriodicApiCheck(stations[0].id);
        return;
      }
    }
  } catch (error) {
    // Silently fail
  }
  
  updateTrackDisplay(stationName);
}

function startPeriodicApiCheck(stationId) {
  if (state.metadataCheckInterval) {
    clearInterval(state.metadataCheckInterval);
  }
  
  state.metadataCheckInterval = setInterval(async () => {
    if (!state.isPlaying) return;
    
    try {
      const response = await fetch(`https://de1.api.radio-browser.info/json/stations/byuuid/${stationId}`, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'RadioMusicSO/1.0' }
      });
      
      if (response.ok) {
        const stations = await response.json();
        if (stations.length > 0 && stations[0].current_track) {
          const newTrack = stations[0].current_track;
          if (newTrack !== state.currentTrack) {
            updateTrackDisplay(newTrack);
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }, CONSTANTS.METADATA_UPDATE_INTERVAL);
}

// ===== Station Management =====
async function loadStations() {
  console.time('loadStations');
  showLoading();
  DOM.stationList.innerHTML = '<div class="station-item empty">Завантаження...</div>';
  
  try {
    state.abortController.abort();
    state.abortController = new AbortController();
    
    const response = await fetch(`stations.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: state.abortController.signal
    });
    
    const mergedStationLists = {};
    
    if (response.ok) {
      const newStations = await response.json();
      Object.keys(newStations).forEach(tab => {
        const uniqueStations = new Map();
        (state.userAddedStations[tab] || []).forEach(s => {
          if (!state.deletedStations.includes(s.name)) {
            if (s.value) s.value = s.value.replace('http://', 'https://');
            if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
            uniqueStations.set(s.name, s);
          }
        });
        newStations[tab].forEach(s => {
          if (!state.deletedStations.includes(s.name)) {
            if (s.value) s.value = s.value.replace('http://', 'https://');
            if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
            uniqueStations.set(s.name, s);
          }
        });
        mergedStationLists[tab] = Array.from(uniqueStations.values());
      });
    }
    
    state.customTabs.forEach(tab => {
      const uniqueStations = new Map();
      (state.userAddedStations[tab] || []).forEach(s => {
        if (!state.deletedStations.includes(s.name)) {
          if (s.value) s.value = s.value.replace('http://', 'https://');
          if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
          uniqueStations.set(s.name, s);
        }
      });
      (state.stationLists[tab] || []).forEach(s => {
        if (!state.deletedStations.includes(s.name)) {
          if (s.value) s.value = s.value.replace('http://', 'https://');
          if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
          uniqueStations.set(s.name, s);
        }
      });
      mergedStationLists[tab] = Array.from(uniqueStations.values());
    });
    
    state.stationLists = mergedStationLists;
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    
    state.favoriteStations = state.favoriteStations.filter(name => 
      Object.values(state.stationLists).flat().some(s => s.name === name)
    );
    localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
    
    const validTabs = [...Object.keys(state.stationLists), 'best', 'search', ...state.customTabs];
    if (!validTabs.includes(state.currentTab)) {
      state.currentTab = validTabs[0] || 'techno';
      localStorage.setItem(CONSTANTS.CURRENT_TAB_KEY, state.currentTab);
    }
    
    state.currentIndex = parseInt(localStorage.getItem(`${CONSTANTS.LAST_STATION_KEY}${state.currentTab}`)) || 0;
    showToast('Станції успішно завантажено!', 'success');
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error loading stations:', error);
      DOM.stationList.innerHTML = '<div class="station-item empty">Не вдалося завантажити станції</div>';
      showToast('Не вдалося завантажити станції', 'error');
    }
  } finally {
    console.timeEnd('loadStations');
    hideLoading();
  }
}

function updateStationList() {
  if (!DOM.stationList) return;
  
  let stations = state.currentTab === 'best'
    ? state.favoriteStations
        .map(name => Object.values(state.stationLists).flat().find(s => s.name === name))
        .filter(s => s)
    : state.stationLists[state.currentTab] || [];
  
  if (!stations.length) {
    state.currentIndex = 0;
    state.stationItems = [];
    DOM.stationList.innerHTML = `<div class="station-item empty">${state.currentTab === 'best' ? 'Немає улюблених станцій' : 'Немає станцій у цій категорії'}</div>`;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  stations.forEach((station, index) => {
    const item = document.createElement('div');
    item.className = `station-item ${index === state.currentIndex ? 'selected' : ''}`;
    item.dataset.value = station.value;
    item.dataset.name = station.name;
    item.dataset.genre = shortenGenre(station.genre);
    item.dataset.country = station.country;
    item.dataset.favicon = station.favicon && isValidUrl(station.favicon) ? station.favicon.replace('http://', 'https://') : '';
    item.dataset.index = index;
    item.setAttribute('draggable', 'false');
    item.setAttribute('role', 'listitem');
    item.style.setProperty('--item-index', index);
    
    const iconHtml = item.dataset.favicon 
      ? `<img data-src="${item.dataset.favicon}" alt="${station.name} icon" onerror="this.outerHTML='🎵'">` 
      : '🎵';
    
    const isEditable = ['techno', 'trance', 'ukraine', 'pop', ...state.customTabs].includes(state.currentTab);
    const isDraggable = ['techno', 'trance', 'ukraine', 'pop', ...state.customTabs, 'best'].includes(state.currentTab);
    const isFavorited = state.favoriteStations.includes(station.name);
    
    item.innerHTML = `
      ${iconHtml}
      <span class="station-name">${station.name}</span>
      <div class="buttons-container">
        ${isDraggable ? `<button class="drag-handle" aria-label="Перетягнути">⋮⋮</button>` : ''}
        ${isEditable ? `<button class="delete-btn" aria-label="Видалити">🗑</button>` : ''}
        <button class="favorite-btn${isFavorited ? ' favorited' : ''}" aria-label="${isFavorited ? 'Видалити з улюблених' : 'Додати до улюблених'}">★</button>
      </div>
    `;
    fragment.appendChild(item);
  });
  
  DOM.stationList.innerHTML = '';
  DOM.stationList.appendChild(fragment);
  state.stationItems = DOM.stationList.querySelectorAll('.station-item');
  
  // Lazy load images
  state.stationItems.forEach(item => {
    const img = item.querySelector('img');
    if (img && state.lazyLoadObserver) {
      state.lazyLoadObserver.observe(img);
    }
  });
  
  setupDragAndDrop();
  
  // Click handler
  DOM.stationList.onclick = (e) => {
    const item = e.target.closest('.station-item');
    const favoriteBtn = e.target.closest('.favorite-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const dragHandle = e.target.closest('.drag-handle');
    
    if (item && !item.classList.contains('empty') && !dragHandle) {
      e.preventDefault();
      state.currentIndex = Array.from(state.stationItems).indexOf(item);
      changeStation(state.currentIndex);
      provideHapticFeedback();
    }
    if (favoriteBtn) {
      e.stopPropagation();
      e.preventDefault();
      toggleFavorite(item.dataset.name);
      provideHapticFeedback();
    }
    if (deleteBtn) {
      e.stopPropagation();
      e.preventDefault();
      if (confirm(`Ви впевнені, що хочете видалити станцію "${item.dataset.name}" зі списку?`)) {
        deleteStation(item.dataset.name);
        provideHapticFeedback();
      }
    }
  };
}

function changeStation(index) {
  if (!state.stationItems || index < 0 || index >= state.stationItems.length || state.stationItems[index].classList.contains('empty')) return;
  
  const item = state.stationItems[index];
  state.stationItems.forEach(i => i.classList.remove('selected'));
  item.classList.add('selected');
  state.currentIndex = index;
  
  // Animated transition
  if (DOM.currentStationInfo) {
    DOM.currentStationInfo.classList.add('fade-out');
    setTimeout(() => {
      updateCurrentStation(item);
      DOM.currentStationInfo.classList.remove('fade-out');
      DOM.currentStationInfo.classList.add('fade-in');
      setTimeout(() => DOM.currentStationInfo.classList.remove('fade-in'), 300);
    }, 150);
  } else {
    updateCurrentStation(item);
  }
  
  localStorage.setItem(`${CONSTANTS.LAST_STATION_KEY}${state.currentTab}`, index);
  
  if (state.intendedPlaying) {
    const normalizedCurrent = normalizeUrl(item.dataset.value);
    const normalizedAudio = normalizeUrl(DOM.audio.src);
    if (normalizedCurrent !== normalizedAudio || DOM.audio.paused || DOM.audio.error || DOM.audio.readyState < 2 || DOM.audio.currentTime === 0) {
      state.isAutoPlayPending = false;
      debouncedTryAutoPlay();
    }
  }
}

function updateCurrentStation(item) {
  if (!DOM.currentStationInfo || !item?.dataset) {
    resetStationInfo();
    return;
  }
  
  const name = item.dataset.name || '';
  const genre = item.dataset.genre || '';
  const country = item.dataset.country || '';
  const favicon = item.dataset.favicon || '';
  
  if (DOM.stationName) DOM.stationName.textContent = name;
  if (DOM.stationGenre) DOM.stationGenre.textContent = `жанр: ${genre}`;
  if (DOM.stationCountry) DOM.stationCountry.textContent = `країна: ${country}`;
  
  if (DOM.stationIcon) {
    if (favicon && isValidUrl(favicon)) {
      DOM.stationIcon.innerHTML = '';
      DOM.stationIcon.style.backgroundImage = `url(${favicon})`;
      DOM.stationIcon.style.backgroundSize = 'contain';
      DOM.stationIcon.style.backgroundRepeat = 'no-repeat';
      DOM.stationIcon.style.backgroundPosition = 'center';
      DOM.stationIcon.classList.add('has-image');
    } else {
      DOM.stationIcon.innerHTML = '🎵';
      DOM.stationIcon.style.backgroundImage = 'none';
      DOM.stationIcon.classList.remove('has-image');
    }
  }
  
  if (DOM.currentTrackElement) {
    DOM.currentTrackElement.textContent = '🎵 Трек: завантаження...';
    DOM.currentTrackElement.classList.add('loading');
  }
  
  stopMetadataStreaming();
  
  if (state.isPlaying) {
    fetchTrackMetadata(item.dataset.value, name);
  }
  
  // Media Session API
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: name || 'Unknown Station',
      artist: `${genre} | ${country}`,
      album: 'Radio Music S O',
      artwork: favicon && isValidUrl(favicon) ? [
        { src: favicon, sizes: '96x96', type: 'image/png' },
        { src: favicon, sizes: '128x128', type: 'image/png' },
        { src: favicon, sizes: '192x192', type: 'image/png' },
        { src: favicon, sizes: '256x256', type: 'image/png' },
        { src: favicon, sizes: '384x384', type: 'image/png' },
        { src: favicon, sizes: '512x512', type: 'image/png' }
      ] : []
    });
  }
}

function resetStationInfo() {
  if (DOM.stationName) DOM.stationName.textContent = 'Виберіть станцію';
  if (DOM.stationGenre) DOM.stationGenre.textContent = 'жанр: -';
  if (DOM.stationCountry) DOM.stationCountry.textContent = 'країна: -';
  if (DOM.stationIcon) {
    DOM.stationIcon.innerHTML = '🎵';
    DOM.stationIcon.style.backgroundImage = 'none';
    DOM.stationIcon.classList.remove('has-image');
  }
  if (DOM.currentTrackElement) {
    DOM.currentTrackElement.textContent = '🎵 Трек: невідомо';
    DOM.currentTrackElement.classList.remove('loading', 'marquee');
  }
}

function prevStation() {
  if (!state.stationItems?.length) return;
  state.currentIndex = state.currentIndex > 0 ? state.currentIndex - 1 : state.stationItems.length - 1;
  if (state.stationItems[state.currentIndex]?.classList.contains('empty')) state.currentIndex = 0;
  changeStation(state.currentIndex);
  provideHapticFeedback();
}

function nextStation() {
  if (!state.stationItems?.length) return;
  state.currentIndex = state.currentIndex < state.stationItems.length - 1 ? state.currentIndex + 1 : 0;
  if (state.stationItems[state.currentIndex]?.classList.contains('empty')) state.currentIndex = 0;
  changeStation(state.currentIndex);
  provideHapticFeedback();
}

function toggleFavorite(stationName) {
  const index = state.favoriteStations.indexOf(stationName);
  if (index > -1) {
    state.favoriteStations.splice(index, 1);
    showToast('Видалено з улюблених', 'info');
  } else {
    state.favoriteStations.unshift(stationName);
    showToast('Додано до улюблених', 'success');
  }
  localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
  if (state.currentTab === 'best') switchTab('best');
  else updateStationList();
}

function deleteStation(stationName) {
  const tab = state.currentTab;
  if (Array.isArray(state.stationLists[tab])) {
    const station = state.stationLists[tab].find(s => s.name === stationName);
    if (!station) return;
    
    state.stationLists[tab] = state.stationLists[tab].filter(s => s.name !== stationName);
    state.userAddedStations[tab] = state.userAddedStations[tab]?.filter(s => s.name !== stationName) || [];
    
    if (!station.isFromSearch && !state.deletedStations.includes(stationName)) {
      state.deletedStations.push(stationName);
      localStorage.setItem(CONSTANTS.DELETED_STATIONS_KEY, JSON.stringify(state.deletedStations));
    }
    
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
    
    state.favoriteStations = state.favoriteStations.filter(name => name !== stationName);
    localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
    
    if (state.stationLists[tab].length === 0) {
      state.currentIndex = 0;
    } else if (state.currentIndex >= state.stationLists[tab].length) {
      state.currentIndex = state.stationLists[tab].length - 1;
    }
    switchTab(tab);
    showToast('Станцію видалено', 'info');
  }
}

// ===== Search =====
async function searchStations(query, country, genre) {
  showLoading();
  DOM.stationList.innerHTML = '<div class="station-item empty">Пошук...</div>';
  
  try {
    state.abortController.abort();
    state.abortController = new AbortController();
    
    const params = new URLSearchParams();
    if (query) params.append('name', query);
    if (country) params.append('country', country);
    if (genre) params.append('tag', genre);
    params.append('order', 'clickcount');
    params.append('reverse', 'true');
    params.append('limit', '500');
    params.append('hidebroken', 'true');
    
    const url = `https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`;
    const response = await fetch(url, {
      signal: state.abortController.signal,
      headers: { 'User-Agent': 'RadioMusicSO/1.0' }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    let stations = await response.json();
    stations = stations.filter(station => {
      const url = station.url || station.url_resolved;
      return url && (url.startsWith('http://') || url.startsWith('https://'));
    }).map(station => {
      if (station.url && station.url.startsWith('http://')) {
        station.url = station.url.replace('http://', 'https://');
      }
      if (station.url_resolved && station.url_resolved.startsWith('http://')) {
        station.url_resolved = station.url_resolved.replace('http://', 'https://');
      }
      return station;
    });
    
    renderSearchResults(stations);
    showToast(`Знайдено ${stations.length} станцій`, 'success');
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error searching stations:', error);
      DOM.stationList.innerHTML = '<div class="station-item empty">Не вдалося знайти станції</div>';
      showToast('Помилка пошуку', 'error');
    }
  } finally {
    hideLoading();
  }
}

function renderSearchResults(stations) {
  if (!stations.length) {
    DOM.stationList.innerHTML = '<div class="station-item empty">Нічого не знайдено</div>';
    state.stationItems = [];
    return;
  }
  
  const fragment = document.createDocumentFragment();
  stations.forEach((station, index) => {
    const item = document.createElement('div');
    item.className = `station-item ${index === state.currentIndex ? 'selected' : ''}`;
    const stationUrl = station.url || station.url_resolved;
    item.dataset.value = stationUrl;
    item.dataset.name = station.name || 'Unknown';
    item.dataset.genre = shortenGenre(station.tags || 'Unknown');
    item.dataset.country = station.country || 'Unknown';
    item.dataset.favicon = station.favicon && isValidUrl(station.favicon) ? station.favicon.replace('http://', 'https://') : '';
    item.dataset.index = index;
    item.style.setProperty('--item-index', index);
    
    const iconHtml = item.dataset.favicon 
      ? `<img data-src="${item.dataset.favicon}" alt="${station.name} icon" onerror="this.outerHTML='🎵'">` 
      : '🎵';
    
    item.innerHTML = `
      ${iconHtml}
      <span class="station-name">${station.name}</span>
      <div class="buttons-container">
        <button class="add-btn" aria-label="Додати станцію">ADD</button>
      </div>
    `;
    fragment.appendChild(item);
  });
  
  DOM.stationList.innerHTML = '';
  DOM.stationList.appendChild(fragment);
  state.stationItems = DOM.stationList.querySelectorAll('.station-item');
  
  state.stationItems.forEach(item => {
    const img = item.querySelector('img');
    if (img && state.lazyLoadObserver) {
      state.lazyLoadObserver.observe(img);
    }
  });
  
  DOM.stationList.onclick = (e) => {
    const item = e.target.closest('.station-item');
    const addBtn = e.target.closest('.add-btn');
    if (item && !item.classList.contains('empty')) {
      e.preventDefault();
      state.currentIndex = Array.from(state.stationItems).indexOf(item);
      changeStation(state.currentIndex);
      provideHapticFeedback();
    }
    if (addBtn) {
      e.stopPropagation();
      e.preventDefault();
      showTabModal(item);
    }
  };
}

// ===== Tab Management =====
function switchTab(tab) {
  const validTabs = ['best', 'techno', 'trance', 'ukraine', 'pop', 'search', ...state.customTabs];
  if (!validTabs.includes(tab)) tab = 'techno';
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });
  
  if (state.viewTransitionSupported) {
    document.startViewTransition(() => performTabSwitch(tab));
  } else {
    DOM.stationList.classList.add('fade-out');
    setTimeout(() => {
      performTabSwitch(tab);
      DOM.stationList.classList.remove('fade-out');
      DOM.stationList.classList.add('fade-in');
      setTimeout(() => DOM.stationList.classList.remove('fade-in'), 300);
    }, 150);
  }
}

function performTabSwitch(tab) {
  state.currentTab = tab;
  localStorage.setItem(CONSTANTS.CURRENT_TAB_KEY, tab);
  
  const savedIndex = parseInt(localStorage.getItem(`${CONSTANTS.LAST_STATION_KEY}${tab}`)) || 0;
  let maxIndex = 0;
  
  if (tab === 'best') {
    maxIndex = state.favoriteStations.length - 1;
  } else if (tab === 'search') {
    maxIndex = 0;
  } else {
    maxIndex = (state.stationLists[tab]?.length || 0) - 1;
  }
  
  state.currentIndex = savedIndex <= maxIndex && savedIndex >= 0 ? savedIndex : 0;
  
  if (DOM.searchInput) {
    DOM.searchInput.style.display = tab === 'search' ? 'flex' : 'none';
    if (tab === 'search') {
      populateSearchSuggestions();
    }
  }
  
  updateStationList();
  renderTabs();
}

function renderTabs() {
  const fixedTabs = ['best', 'techno', 'trance', 'ukraine', 'pop'];
  const searchTab = 'search';
  
  DOM.tabsContainer.innerHTML = '';
  
  fixedTabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${state.currentTab === tab ? 'active' : ''}`;
    btn.dataset.tab = tab;
    btn.textContent = tab === 'best' ? 'Best' : tab === 'ukraine' ? 'UA' : tab.charAt(0).toUpperCase() + tab.slice(1);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', state.currentTab === tab ? 'true' : 'false');
    DOM.tabsContainer.appendChild(btn);
  });
  
  state.customTabs.forEach(tab => {
    if (typeof tab !== 'string' || !tab.trim()) return;
    const btn = document.createElement('button');
    btn.className = `tab-btn ${state.currentTab === tab ? 'active' : ''}`;
    btn.dataset.tab = tab;
    btn.textContent = tab.toUpperCase();
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', state.currentTab === tab ? 'true' : 'false');
    DOM.tabsContainer.appendChild(btn);
  });
  
  const searchBtn = document.createElement('button');
  searchBtn.className = `tab-btn ${state.currentTab === 'search' ? 'active' : ''}`;
  searchBtn.dataset.tab = 'search';
  searchBtn.textContent = 'SEARCH';
  searchBtn.setAttribute('role', 'tab');
  searchBtn.setAttribute('aria-selected', state.currentTab === 'search' ? 'true' : 'false');
  DOM.tabsContainer.appendChild(searchBtn);
  
  const addBtn = document.createElement('button');
  addBtn.className = 'add-tab-btn';
  addBtn.textContent = '+';
  addBtn.setAttribute('aria-label', 'Додати нову вкладку');
  DOM.tabsContainer.appendChild(addBtn);
  
  DOM.tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      provideHapticFeedback();
    });
    if (state.customTabs.includes(btn.dataset.tab)) {
      let longPressTimer;
      btn.addEventListener('pointerdown', () => {
        longPressTimer = setTimeout(() => {
          showEditTabModal(btn.dataset.tab);
          provideHapticFeedback();
        }, 500);
      });
      btn.addEventListener('pointerup', () => clearTimeout(longPressTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(longPressTimer));
    }
  });
  
  addBtn.addEventListener('click', showNewTabModal);
}

// ===== Modal Functions =====
function showTabModal(item) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <h2>Виберіть вкладку</h2>
    <div class="modal-tabs">
      <button class="modal-tab-btn" data-tab="techno">TECHNO</button>
      <button class="modal-tab-btn" data-tab="trance">TRANCE</button>
      <button class="modal-tab-btn" data-tab="ukraine">UA</button>
      <button class="modal-tab-btn" data-tab="pop">POP</button>
      ${state.customTabs.map(tab => `<button class="modal-tab-btn" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}
      <button class="modal-cancel-btn">Скасувати</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  
  const closeModal = () => {
    overlay.remove();
    modal.remove();
  };
  
  overlay.addEventListener('click', closeModal);
  modal.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      saveStation(item, targetTab);
      closeModal();
      provideHapticFeedback();
    });
  });
  modal.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);
}

function saveStation(item, targetTab) {
  const stationName = item.dataset.name;
  if (!state.stationLists[targetTab]) state.stationLists[targetTab] = [];
  if (!state.userAddedStations[targetTab]) state.userAddedStations[targetTab] = [];
  
  if (!state.stationLists[targetTab].some(s => s.name === stationName)) {
    const newStation = {
      value: item.dataset.value,
      name: item.dataset.name,
      genre: item.dataset.genre,
      country: item.dataset.country,
      favicon: item.dataset.favicon || '',
      isFromSearch: state.currentTab === 'search'
    };
    state.stationLists[targetTab].unshift(newStation);
    state.userAddedStations[targetTab].unshift(newStation);
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
    if (state.currentTab !== 'search') {
      updateStationList();
    }
    showToast(`Станцію додано до ${targetTab}`, 'success');
  } else {
    showToast('Станція вже існує в цій вкладці!', 'error');
  }
}

function showNewTabModal() {
  const overlay = document.querySelector('.new-tab-modal');
  const modal = overlay.querySelector('.modal');
  const input = document.getElementById('newTabName');
  const createBtn = document.getElementById('createTabBtn');
  const cancelBtn = modal.querySelector('.modal-cancel-btn');
  
  overlay.style.display = 'flex';
  input.value = '';
  input.focus();
  
  const closeModal = () => {
    overlay.style.display = 'none';
    createBtn.removeEventListener('click', createTabHandler);
    cancelBtn.removeEventListener('click', closeModal);
    overlay.removeEventListener('click', closeModal);
    input.removeEventListener('keypress', keypressHandler);
  };
  
  const createTabHandler = () => {
    const tabName = input.value.trim().toLowerCase();
    if (!tabName) {
      showToast('Введіть назву вкладки!', 'error');
      return;
    }
    if (['best', 'techno', 'trance', 'ukraine', 'pop', 'search'].includes(tabName) || state.customTabs.includes(tabName)) {
      showToast('Така назва вкладки вже існує!', 'error');
      return;
    }
    if (tabName.length > 10 || !/^[a-z0-9_-]+$/.test(tabName)) {
      showToast('Назва має бути до 10 символів (a-z, 0-9, -, _)', 'error');
      return;
    }
    if (state.customTabs.length >= CONSTANTS.MAX_CUSTOM_TABS) {
      showToast(`Досягнуто максимум ${CONSTANTS.MAX_CUSTOM_TABS} кастомних вкладок!`, 'error');
      return;
    }
    state.customTabs.push(tabName);
    state.stationLists[tabName] = [];
    state.userAddedStations[tabName] = [];
    localStorage.setItem(CONSTANTS.CUSTOM_TABS_KEY, JSON.stringify(state.customTabs));
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
    renderTabs();
    switchTab(tabName);
    closeModal();
    showToast(`Вкладку "${tabName}" створено!`, 'success');
  };
  
  const keypressHandler = (e) => {
    if (e.key === 'Enter') createBtn.click();
  };
  
  createBtn.addEventListener('click', createTabHandler);
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  input.addEventListener('keypress', keypressHandler);
}

function showEditTabModal(tab) {
  const overlay = document.querySelector('.edit-tab-modal');
  const modal = overlay.querySelector('.modal');
  const input = document.getElementById('renameTabName');
  const renameBtn = document.getElementById('renameTabBtn');
  const deleteBtn = document.getElementById('deleteTabBtn');
  const cancelBtn = modal.querySelector('.modal-cancel-btn');
  
  overlay.style.display = 'flex';
  input.value = tab;
  input.focus();
  
  const closeModal = () => {
    overlay.style.display = 'none';
    renameBtn.removeEventListener('click', renameTabHandler);
    deleteBtn.removeEventListener('click', deleteTabHandler);
    cancelBtn.removeEventListener('click', closeModal);
    overlay.removeEventListener('click', closeModal);
    input.removeEventListener('keypress', keypressHandler);
  };
  
  const renameTabHandler = () => {
    const newName = input.value.trim().toLowerCase();
    if (!newName) {
      showToast('Введіть нову назву вкладки!', 'error');
      return;
    }
    if (['best', 'techno', 'trance', 'ukraine', 'pop', 'search'].includes(newName) || state.customTabs.includes(newName)) {
      showToast('Така назва вкладки вже існує!', 'error');
      return;
    }
    if (newName.length > 10 || !/^[a-z0-9_-]+$/.test(newName)) {
      showToast('Назва має бути до 10 символів (a-z, 0-9, -, _)', 'error');
      return;
    }
    const index = state.customTabs.indexOf(tab);
    state.customTabs[index] = newName;
    state.stationLists[newName] = state.stationLists[tab] || [];
    state.userAddedStations[newName] = state.userAddedStations[tab] || [];
    delete state.stationLists[tab];
    delete state.userAddedStations[tab];
    localStorage.setItem(CONSTANTS.CUSTOM_TABS_KEY, JSON.stringify(state.customTabs));
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
    if (state.currentTab === tab) switchTab(newName);
    renderTabs();
    closeModal();
    showToast(`Вкладку перейменовано на "${newName}"`, 'success');
  };
  
  const deleteTabHandler = () => {
    if (confirm(`Ви впевнені, що хочете видалити вкладку "${tab.toUpperCase()}"?`)) {
      state.customTabs = state.customTabs.filter(t => t !== tab);
      delete state.stationLists[tab];
      delete state.userAddedStations[tab];
      localStorage.setItem(CONSTANTS.CUSTOM_TABS_KEY, JSON.stringify(state.customTabs));
      localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
      localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
      if (state.currentTab === tab) {
        const newTab = state.customTabs.length > 0 ? state.customTabs[0] : 'techno';
        switchTab(newTab);
      }
      renderTabs();
      closeModal();
      showToast(`Вкладку "${tab}" видалено`, 'success');
    }
  };
  
  const keypressHandler = (e) => {
    if (e.key === 'Enter') renameBtn.click();
  };
  
  renameBtn.addEventListener('click', renameTabHandler);
  deleteBtn.addEventListener('click', deleteTabHandler);
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  input.addEventListener('keypress', keypressHandler);
}

// ===== Drag & Drop =====
function setupDragAndDrop() {
  state.stationItems.forEach((item, index) => {
    const dragHandle = item.querySelector('.drag-handle');
    if (!dragHandle) return;
    
    // Remove old listeners
    dragHandle.removeEventListener('pointerdown', handleDragHandleClick);
    dragHandle.removeEventListener('touchstart', handleLongPress);
    dragHandle.removeEventListener('pointerup', handlePointerUp);
    dragHandle.removeEventListener('pointerleave', handlePointerLeave);
    item.removeEventListener('dragstart', handleDragStart);
    item.removeEventListener('dragend', handleDragEnd);
    item.removeEventListener('dragover', handleDragOver);
    item.removeEventListener('dragleave', handleDragLeave);
    item.removeEventListener('drop', handleDrop);
    
    // Add new listeners
    dragHandle.addEventListener('pointerdown', handleDragHandleClick);
    dragHandle.addEventListener('touchstart', handleLongPress, { passive: true });
    dragHandle.addEventListener('pointerup', handlePointerUp);
    dragHandle.addEventListener('pointerleave', handlePointerLeave);
    
    item.setAttribute('draggable', state.dragEnabled ? 'true' : 'false');
    item.dataset.index = index;
    
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
  });
}

function enableDragMode() {
  state.dragEnabled = true;
  showToast('Режим перетягування увімкнено. Перетягуйте за ручку.', 'info', 2000);
  state.stationItems.forEach(item => {
    item.setAttribute('draggable', 'true');
    item.style.userSelect = 'none';
    item.style.webkitUserSelect = 'none';
  });
}

function disableDragMode() {
  state.dragEnabled = false;
  state.dragStartIndex = null;
  state.stationItems.forEach(item => {
    item.setAttribute('draggable', 'false');
    item.style.userSelect = '';
    item.style.webkitUserSelect = '';
  });
}

function handleDragHandleClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!state.dragEnabled) {
    enableDragMode();
    provideHapticFeedback();
    const item = e.target.closest('.station-item');
    if (item) {
      setTimeout(() => {
        const dragEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer()
        });
        item.dispatchEvent(dragEvent);
      }, 50);
    }
  }
}

function handleDragStart(e) {
  if (!state.dragEnabled) {
    e.preventDefault();
    return;
  }
  const item = e.target.closest('.station-item');
  if (!item) return;
  state.dragStartIndex = parseInt(item.dataset.index);
  item.classList.add('dragging');
  e.dataTransfer.setData('text/plain', state.dragStartIndex);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setDragImage(item, 20, 20);
  provideHapticFeedback();
}

function handleDragEnd(e) {
  const item = e.target.closest('.station-item');
  if (item) item.classList.remove('dragging');
  document.querySelectorAll('.station-item').forEach(i => i.classList.remove('drag-over'));
  state.dragStartIndex = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const item = e.target.closest('.station-item');
  if (item && state.dragEnabled && item !== state.stationItems[state.dragStartIndex]) {
    item.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const item = e.target.closest('.station-item');
  if (item) item.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const targetItem = e.target.closest('.station-item');
  if (!targetItem || state.dragStartIndex === null || !state.dragEnabled) return;
  targetItem.classList.remove('drag-over');
  const dragEndIndex = parseInt(targetItem.dataset.index);
  if (state.dragStartIndex === dragEndIndex) return;
  reorderStations(state.dragStartIndex, dragEndIndex);
  document.querySelectorAll('.station-item').forEach(item => {
    item.classList.remove('dragging', 'drag-over');
  });
  state.dragStartIndex = null;
  disableDragMode();
  provideHapticFeedback();
  showToast('Порядок станцій оновлено!', 'success');
}

function handleLongPress(e) {
  e.preventDefault();
  e.stopPropagation();
  const item = e.target.closest('.station-item');
  if (!item) return;
  clearTimeout(state.longPressTimer);
  state.longPressTimer = setTimeout(() => {
    if (!state.dragEnabled) {
      enableDragMode();
      item.classList.add('long-press');
      setTimeout(() => item.classList.remove('long-press'), 500);
      provideHapticFeedback();
      setTimeout(() => {
        const dragEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer()
        });
        item.dispatchEvent(dragEvent);
      }, 50);
    }
  }, 500);
}

function handlePointerUp() {
  clearTimeout(state.longPressTimer);
}

function handlePointerLeave() {
  clearTimeout(state.longPressTimer);
}

function reorderStations(fromIndex, toIndex) {
  if (state.currentTab === 'best') {
    const [movedStation] = state.favoriteStations.splice(fromIndex, 1);
    state.favoriteStations.splice(toIndex, 0, movedStation);
    localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
  } else {
    const stations = state.stationLists[state.currentTab];
    if (!stations) return;
    const [movedStation] = stations.splice(fromIndex, 1);
    stations.splice(toIndex, 0, movedStation);
    if (state.userAddedStations[state.currentTab]) {
      const userStationIndex = state.userAddedStations[state.currentTab].findIndex(s => s.name === movedStation.name);
      if (userStationIndex !== -1) {
        const [movedUserStation] = state.userAddedStations[state.currentTab].splice(userStationIndex, 1);
        state.userAddedStations[state.currentTab].splice(toIndex, 0, movedUserStation);
      }
    }
    localStorage.setItem(CONSTANTS.STATION_LISTS_KEY, JSON.stringify(state.stationLists));
    localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
  }
  
  if (state.viewTransitionSupported) {
    document.startViewTransition(() => updateStationList());
  } else {
    DOM.stationList.classList.add('fade-out');
    setTimeout(() => {
      updateStationList();
      DOM.stationList.classList.remove('fade-out');
      DOM.stationList.classList.add('fade-in');
      setTimeout(() => DOM.stationList.classList.remove('fade-in'), 300);
    }, 150);
  }
}

// ===== Auto Play =====
let autoPlayTimeout = null;

function debouncedTryAutoPlay(retryCount = CONSTANTS.AUTO_PLAY_RETRY_COUNT, delay = CONSTANTS.AUTO_PLAY_DELAY) {
  if (state.isAutoPlayPending) return;
  const now = Date.now();
  const currentStationUrl = state.stationItems?.[state.currentIndex]?.dataset?.value;
  const normalizedCurrentUrl = normalizeUrl(currentStationUrl);
  const normalizedAudioSrc = normalizeUrl(DOM.audio.src);
  if (now - state.lastSuccessfulPlayTime < 500 && normalizedAudioSrc === normalizedCurrentUrl) return;
  if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
  state.autoPlayRequestId++;
  const currentRequestId = state.autoPlayRequestId;
  autoPlayTimeout = setTimeout(() => tryAutoPlay(retryCount, delay, currentRequestId), 0);
}

async function tryAutoPlay(retryCount = CONSTANTS.AUTO_PLAY_RETRY_COUNT, delay = CONSTANTS.AUTO_PLAY_DELAY, requestId) {
  if (state.isAutoPlayPending) return;
  if (requestId !== state.autoPlayRequestId) return;
  state.isAutoPlayPending = true;
  
  try {
    if (!navigator.onLine) return;
    if (!state.intendedPlaying || !state.stationItems?.length || state.currentIndex >= state.stationItems.length) {
      updateWaveVisualizer(false);
      return;
    }
    
    const currentStationUrl = state.stationItems[state.currentIndex].dataset.value;
    const initialStationUrl = currentStationUrl;
    const normalizedCurrentUrl = normalizeUrl(currentStationUrl);
    const normalizedAudioSrc = normalizeUrl(DOM.audio.src);
    
    if (normalizedAudioSrc === normalizedCurrentUrl && !DOM.audio.paused && !DOM.audio.error && DOM.audio.readyState >= 2 && DOM.audio.currentTime > 0) {
      return;
    }
    
    if (!isValidUrl(currentStationUrl)) {
      state.errorCount++;
      if (state.errorCount >= CONSTANTS.ERROR_LIMIT) resetStationInfo();
      return;
    }
    
    const attemptPlay = async (attemptsLeft) => {
      if (state.streamAbortController) {
        state.streamAbortController.abort();
        state.streamAbortController = null;
      }
      if (state.stationItems[state.currentIndex]?.dataset?.value !== initialStationUrl) return;
      if (requestId !== state.autoPlayRequestId) return;
      
      state.streamAbortController = new AbortController();
      DOM.audio.pause();
      DOM.audio.src = null;
      DOM.audio.load();
      
      const secureUrl = currentStationUrl.replace('http://', 'https://') + '?nocache=' + Date.now();
      DOM.audio.src = secureUrl;
      
      try {
        await DOM.audio.play();
        state.errorCount = 0;
        state.isPlaying = true;
        state.lastSuccessfulPlayTime = Date.now();
        updateWaveVisualizer(true);
        if (DOM.playPauseBtn) DOM.playPauseBtn.classList.add('playing');
        localStorage.setItem(CONSTANTS.IS_PLAYING_KEY, state.isPlaying);
        if (state.stationItems[state.currentIndex]) {
          updateCurrentStation(state.stationItems[state.currentIndex]);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        updateWaveVisualizer(false);
        if (DOM.playPauseBtn) DOM.playPauseBtn.classList.remove('playing');
        if (attemptsLeft > 1) {
          if (state.stationItems[state.currentIndex]?.dataset?.value !== initialStationUrl) return;
          if (requestId !== state.autoPlayRequestId) return;
          await new Promise(resolve => setTimeout(resolve, delay));
          await attemptPlay(attemptsLeft - 1);
        } else {
          state.errorCount++;
          if (state.errorCount >= CONSTANTS.ERROR_LIMIT) resetStationInfo();
        }
      } finally {
        state.streamAbortController = null;
      }
    };
    
    await attemptPlay(retryCount);
  } finally {
    state.isAutoPlayPending = false;
    state.streamAbortController = null;
  }
}

// ===== Player Controls =====
function togglePlayPause() {
  if (!DOM.playPauseBtn || !DOM.audio) return;
  
  if (DOM.audio.paused) {
    state.isPlaying = true;
    state.intendedPlaying = true;
    debouncedTryAutoPlay();
    DOM.playPauseBtn.textContent = '⏸';
    DOM.playPauseBtn.setAttribute('aria-label', 'Пауза');
    DOM.playPauseBtn.classList.add('playing');
    updateWaveVisualizer(true);
  } else {
    DOM.audio.pause();
    state.isPlaying = false;
    state.intendedPlaying = false;
    DOM.playPauseBtn.textContent = '▶';
    DOM.playPauseBtn.setAttribute('aria-label', 'Грати');
    DOM.playPauseBtn.classList.remove('playing');
    updateWaveVisualizer(false);
    stopMetadataStreaming();
    if (DOM.currentTrackElement) {
      DOM.currentTrackElement.textContent = '🎵 Трек: невідомо';
      DOM.currentTrackElement.classList.remove('loading', 'marquee');
    }
  }
  localStorage.setItem(CONSTANTS.IS_PLAYING_KEY, state.isPlaying);
  localStorage.setItem(CONSTANTS.INTENDED_PLAYING_KEY, state.intendedPlaying);
}

function updateWaveVisualizer(playing) {
  if (!DOM.waveVisualizer) return;
  DOM.waveVisualizer.classList.toggle('playing', playing);
}

// ===== Theme =====
const themes = {
  'shadow-pulse': { accent: '#00E676', accentRgb: '0, 230, 118' },
  'dark-abyss': { accent: '#B388FF', accentRgb: '179, 136, 255' },
  'emerald-glow': { accent: '#2EC4B6', accentRgb: '46, 196, 182' },
  'retro-wave': { accent: '#FF69B4', accentRgb: '255, 105, 180' },
  'neon-pulse': { accent: '#00E5FF', accentRgb: '0, 229, 255' },
  'lime-surge': { accent: '#B2FF59', accentRgb: '178, 255, 89' },
  'flamingo-flash': { accent: '#FF4081', accentRgb: '255, 64, 129' },
  'aqua-glow': { accent: '#26C6DA', accentRgb: '38, 198, 218' },
  'aurora-haze': { accent: '#64FFDA', accentRgb: '100, 255, 218' },
  'starlit-amethyst': { accent: '#B388FF', accentRgb: '179, 136, 255' },
  'lunar-frost': { accent: '#40C4FF', accentRgb: '64, 196, 255' }
};

let currentTheme = localStorage.getItem(CONSTANTS.THEME_STORAGE_KEY) || 'shadow-pulse';
if (!themes[currentTheme]) {
  currentTheme = 'shadow-pulse';
  localStorage.setItem(CONSTANTS.THEME_STORAGE_KEY, currentTheme);
}

function applyTheme(theme) {
  if (!themes[theme]) {
    theme = 'shadow-pulse';
    localStorage.setItem(CONSTANTS.THEME_STORAGE_KEY, theme);
  }
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme = theme;
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', themes[theme].accent);
  }
}

function toggleTheme() {
  const themesOrder = [
    'shadow-pulse', 'dark-abyss', 'emerald-glow', 'retro-wave',
    'neon-pulse', 'lime-surge', 'flamingo-flash', 'aqua-glow',
    'aurora-haze', 'starlit-amethyst', 'lunar-frost'
  ];
  const nextTheme = themesOrder[(themesOrder.indexOf(currentTheme) + 1) % themesOrder.length];
  applyTheme(nextTheme);
  provideHapticFeedback();
  showToast(`Тему змінено на ${nextTheme}`, 'info');
}

// ===== Import/Export =====
function exportSettings() {
  const settings = {
    selectedTheme: localStorage.getItem(CONSTANTS.THEME_STORAGE_KEY) || 'shadow-pulse',
    customTabs: state.customTabs,
    userAddedStations: state.userAddedStations,
    favoriteStations: state.favoriteStations,
    pastSearches: state.pastSearches,
    deletedStations: state.deletedStations,
    currentTab: state.currentTab
  };
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'radio_settings.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Налаштування успішно експортовано!', 'success');
}

function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const settings = JSON.parse(e.target.result);
      if (!settings || typeof settings !== 'object') {
        showToast('Невірний файл налаштувань!', 'error');
        return;
      }
      const validThemes = Object.keys(themes);
      if (settings.selectedTheme && validThemes.includes(settings.selectedTheme)) {
        localStorage.setItem(CONSTANTS.THEME_STORAGE_KEY, settings.selectedTheme);
        applyTheme(settings.selectedTheme);
      }
      if (Array.isArray(settings.customTabs)) {
        const validTabs = settings.customTabs.filter(tab => 
          typeof tab === 'string' && tab.trim() && tab.length <= 10 && 
          /^[a-z0-9_-]+$/.test(tab) &&
          !['best', 'techno', 'trance', 'ukraine', 'pop', 'search'].includes(tab) &&
          !state.customTabs.includes(tab)
        );
        if (validTabs.length + state.customTabs.length <= CONSTANTS.MAX_CUSTOM_TABS) {
          state.customTabs = validTabs;
          localStorage.setItem(CONSTANTS.CUSTOM_TABS_KEY, JSON.stringify(state.customTabs));
        } else {
          showToast('Забагато кастомних вкладок, імпорт пропущено', 'error');
        }
      }
      if (settings.userAddedStations && typeof settings.userAddedStations === 'object') {
        const validStations = {};
        Object.keys(settings.userAddedStations).forEach(tab => {
          if (['techno', 'trance', 'ukraine', 'pop', ...state.customTabs].includes(tab)) {
            const stations = Array.isArray(settings.userAddedStations[tab]) 
              ? settings.userAddedStations[tab].filter(s => 
                  s && typeof s === 'object' && s.name && typeof s.name === 'string' && 
                  s.value && isValidUrl(s.value)
                )
              : [];
            validStations[tab] = stations;
          }
        });
        state.userAddedStations = validStations;
        localStorage.setItem(CONSTANTS.USER_ADDED_KEY, JSON.stringify(state.userAddedStations));
      }
      if (Array.isArray(settings.favoriteStations)) {
        state.favoriteStations = settings.favoriteStations.filter(name => typeof name === 'string');
        localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
      }
      if (Array.isArray(settings.pastSearches)) {
        state.pastSearches = settings.pastSearches.filter(search => typeof search === 'string').slice(0, CONSTANTS.PAST_SEARCHES_LIMIT);
        localStorage.setItem(CONSTANTS.PAST_SEARCHES_KEY, JSON.stringify(state.pastSearches));
        updatePastSearches();
      }
      if (Array.isArray(settings.deletedStations)) {
        state.deletedStations = settings.deletedStations.filter(name => typeof name === 'string');
        localStorage.setItem(CONSTANTS.DELETED_STATIONS_KEY, JSON.stringify(state.deletedStations));
      }
      if (settings.currentTab && typeof settings.currentTab === 'string') {
        const validTabs = ['best', 'techno', 'trance', 'ukraine', 'pop', 'search', ...state.customTabs];
        if (validTabs.includes(settings.currentTab)) {
          state.currentTab = settings.currentTab;
          localStorage.setItem(CONSTANTS.CURRENT_TAB_KEY, state.currentTab);
        }
      }
      loadStations();
      switchTab(state.currentTab);
      showToast('Налаштування успішно імпортовано!', 'success');
    } catch (error) {
      console.error('Error importing settings:', error);
      showToast('Помилка імпорту. Перевірте формат файлу.', 'error');
    }
    DOM.importFileInput.value = '';
  };
  reader.readAsText(file);
}

// ===== Search Suggestions =====
function populateSearchSuggestions() {
  const suggestedCountries = [
    'Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Netherlands',
    'Switzerland', 'Belgium', 'Sweden', 'Norway', 'Denmark', 'Austria',
    'Poland', 'Ukraine', 'Canada', 'United States', 'Australia', 'Japan',
    'South Korea', 'New Zealand'
  ];
  const suggestedGenres = [
    'Pop', 'Rock', 'Dance', 'Electronic', 'Techno', 'Trance', 'House',
    'EDM', 'Hip-Hop', 'Rap', 'Jazz', 'Classical', 'Country', 'Reggae',
    'Blues', 'Folk', 'Metal', 'R&B', 'Soul', 'Ambient'
  ];
  
  const countryDatalist = document.getElementById('suggestedCountries');
  const genreDatalist = document.getElementById('suggestedGenres');
  
  if (countryDatalist) {
    countryDatalist.innerHTML = suggestedCountries.map(c => `<option value="${c}">`).join('');
  }
  if (genreDatalist) {
    genreDatalist.innerHTML = suggestedGenres.map(g => `<option value="${g}">`).join('');
  }
}

function updatePastSearches() {
  if (!DOM.pastSearchesList) return;
  DOM.pastSearchesList.innerHTML = '';
  state.pastSearches.forEach(search => {
    const option = document.createElement('option');
    option.value = search;
    DOM.pastSearchesList.appendChild(option);
  });
}

// ===== Pull to Refresh =====
function setupPullToRefresh() {
  let touchStartY = 0;
  const threshold = CONSTANTS.DRAG_THRESHOLD;
  
  if (!DOM.stationList || !DOM.pullIndicator) return;
  
  DOM.stationList.addEventListener('touchstart', (e) => {
    if (DOM.stationList.scrollTop === 0) {
      touchStartY = e.touches[0].clientY;
      DOM.pullIndicator.style.display = 'flex';
    }
  }, { passive: true });
  
  DOM.stationList.addEventListener('touchmove', (e) => {
    if (touchStartY && DOM.stationList.scrollTop === 0) {
      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - touchStartY;
      if (pullDistance > 0 && pullDistance < threshold) {
        state.isPulling = true;
        DOM.pullIndicator.style.transform = `translateY(${pullDistance}px)`;
        DOM.pullIndicator.classList.add('pulling');
      } else if (pullDistance >= threshold) {
        state.isPulling = true;
        DOM.pullIndicator.style.transform = `translateY(${threshold}px)`;
        DOM.pullIndicator.classList.add('pulling');
      }
    }
  }, { passive: true });
  
  DOM.stationList.addEventListener('touchend', (e) => {
    if (touchStartY && DOM.stationList.scrollTop === 0) {
      const endY = e.changedTouches[0].clientY;
      const pullDistance = endY - touchStartY;
      if (pullDistance >= threshold) {
        showLoading();
        loadStations().finally(() => {
          hideLoading();
          showToast('Станції оновлено!', 'success');
        });
      }
      touchStartY = 0;
      state.isPulling = false;
      DOM.pullIndicator.classList.remove('pulling');
      DOM.pullIndicator.style.transform = '';
      setTimeout(() => {
        DOM.pullIndicator.style.display = 'none';
      }, 300);
    }
  }, { passive: true });
}

// ===== Lazy Loading =====
function setupLazyLoading() {
  state.lazyLoadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          const secureSrc = src.replace('http://', 'https://');
          img.src = secureSrc;
          img.classList.add('loaded');
          state.lazyLoadObserver.unobserve(img);
        }
      }
    });
  }, { rootMargin: '50px' });
}

// ===== Service Worker =====
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        registration.update();
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                if (confirm('Доступна нова версія радіо. Оновити?')) {
                  window.location.reload();
                }
              }
            });
          }
        });
      })
      .catch(error => console.log('ServiceWorker registration failed: ', error));
    
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'CACHE_UPDATED') {
        const currentCacheVersion = localStorage.getItem('cacheVersion') || '0';
        if (currentCacheVersion !== event.data.cacheVersion) {
          state.favoriteStations = state.favoriteStations.filter(name =>
            Object.values(state.stationLists).flat().some(s => s.name === name)
          );
          localStorage.setItem(CONSTANTS.FAVORITES_KEY, JSON.stringify(state.favoriteStations));
          localStorage.setItem('cacheVersion', event.data.cacheVersion);
          loadStations();
          showToast('Додаток оновлено!', 'success');
        }
      }
      if (event.data.type === 'NETWORK_STATUS' && event.data.online && state.intendedPlaying && state.stationItems?.length && state.currentIndex < state.stationItems.length) {
        debouncedTryAutoPlay();
      }
    });
  }
}

// ===== Event Listeners =====
function setupEventListeners() {
  const audio = DOM.audio;
  const playPauseBtn = DOM.playPauseBtn;
  
  // Audio events
  audio.addEventListener('playing', () => {
    state.isPlaying = true;
    if (playPauseBtn) {
      playPauseBtn.textContent = '⏸';
      playPauseBtn.setAttribute('aria-label', 'Пауза');
      playPauseBtn.classList.add('playing');
    }
    updateWaveVisualizer(true);
    localStorage.setItem(CONSTANTS.IS_PLAYING_KEY, state.isPlaying);
    if (state.errorTimeout) {
      clearTimeout(state.errorTimeout);
      state.errorTimeout = null;
    }
    if (state.stationItems && state.stationItems[state.currentIndex]) {
      fetchTrackMetadata(
        state.stationItems[state.currentIndex].dataset.value,
        state.stationItems[state.currentIndex].dataset.name
      );
    }
  });
  
  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    if (playPauseBtn) {
      playPauseBtn.textContent = '▶';
      playPauseBtn.setAttribute('aria-label', 'Грати');
      playPauseBtn.classList.remove('playing');
    }
    updateWaveVisualizer(false);
    localStorage.setItem(CONSTANTS.IS_PLAYING_KEY, state.isPlaying);
    stopMetadataStreaming();
    if (DOM.currentTrackElement) {
      DOM.currentTrackElement.textContent = '🎵 Трек: невідомо';
      DOM.currentTrackElement.classList.remove('loading', 'marquee');
    }
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  });
  
  audio.addEventListener('error', () => {
    updateWaveVisualizer(false);
    if (playPauseBtn) playPauseBtn.classList.remove('playing');
    stopMetadataStreaming();
    if (DOM.currentTrackElement) {
      DOM.currentTrackElement.textContent = '🎵 Трек: помилка';
      DOM.currentTrackElement.classList.remove('loading', 'marquee');
    }
    if (state.intendedPlaying && state.errorCount < CONSTANTS.ERROR_LIMIT && !state.errorTimeout) {
      state.errorCount++;
      state.errorTimeout = setTimeout(() => {
        debouncedTryAutoPlay();
        state.errorTimeout = null;
      }, 1000);
    } else if (state.errorCount >= CONSTANTS.ERROR_LIMIT) {
      resetStationInfo();
    }
  });
  
  audio.addEventListener('volumechange', () => {
    localStorage.setItem(CONSTANTS.VOLUME_STORAGE_KEY, audio.volume);
  });
  
  // Control buttons
  document.querySelector('.controls .control-btn:nth-child(1)')?.addEventListener('click', () => {
    prevStation();
    provideHapticFeedback();
  });
  
  document.querySelector('.controls .control-btn:nth-child(2)')?.addEventListener('click', () => {
    togglePlayPause();
    provideHapticFeedback();
  });
  
  document.querySelector('.controls .control-btn:nth-child(3)')?.addEventListener('click', () => {
    nextStation();
    provideHapticFeedback();
  });
  
  // Theme toggle
  DOM.themeToggle?.addEventListener('click', toggleTheme);
  
  // Share button
  DOM.shareButton?.addEventListener('click', () => {
    const name = DOM.stationName?.textContent || 'Radio S O';
    const shareData = {
      title: 'Radio Music S O',
      text: `Слухаю ${name} на Radio S O! Приєднуйся до моїх улюблених радіостанцій!`,
      url: window.location.href
    };
    if (navigator.share) {
      navigator.share(shareData)
        .then(() => showToast('Поділилися успішно!', 'success'))
        .catch(error => {
          console.error('Error sharing:', error);
          showToast('Помилка поширення', 'error');
        });
    } else {
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
        .then(() => showToast('Посилання скопійовано в буфер обміну!', 'success'))
        .catch(() => alert(`Функція поширення не підтримується. Скопіюйте: ${shareData.text} ${shareData.url}`));
    }
  });
  
  // Export/Import
  DOM.exportButton?.addEventListener('click', exportSettings);
  DOM.importButton?.addEventListener('click', () => DOM.importFileInput?.click());
  DOM.importFileInput?.addEventListener('change', importSettings);
  
  // Search
  DOM.searchBtn?.addEventListener('click', () => {
    const query = DOM.searchQuery?.value.trim() || '';
    const country = normalizeCountry(DOM.searchCountry?.value.trim() || '');
    const genre = DOM.searchGenre?.value.trim().toLowerCase() || '';
    
    if (query || country || genre) {
      if (query && !state.pastSearches.includes(query)) {
        state.pastSearches.unshift(query);
        if (state.pastSearches.length > CONSTANTS.PAST_SEARCHES_LIMIT) state.pastSearches.pop();
        localStorage.setItem(CONSTANTS.PAST_SEARCHES_KEY, JSON.stringify(state.pastSearches));
        updatePastSearches();
      }
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = setTimeout(() => {
        searchStations(query, country, genre);
      }, 300);
    } else {
      DOM.stationList.innerHTML = "<div class='station-item empty'>Введіть назву станції, країну або жанр</div>";
    }
  });
  
  DOM.searchQuery?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') DOM.searchBtn?.click();
  });
  
  DOM.searchCountry?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') DOM.searchBtn?.click();
  });
  
  DOM.searchGenre?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') DOM.searchBtn?.click();
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevStation();
      provideHapticFeedback();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextStation();
      provideHapticFeedback();
    }
    if (e.key === ' ') {
      e.preventDefault();
      togglePlayPause();
      provideHapticFeedback();
    }
    if (e.key === 'Escape' && state.dragEnabled) {
      disableDragMode();
      showToast('Режим перетягування вимкнено', 'info');
    }
  });
  
  // Visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !state.intendedPlaying || !navigator.onLine || !state.stationItems?.length || state.currentIndex >= state.stationItems.length) return;
    const normalizedCurrent = normalizeUrl(state.stationItems[state.currentIndex].dataset.value);
    const normalizedAudio = normalizeUrl(DOM.audio.src);
    if (normalizedCurrent !== normalizedAudio || DOM.audio.paused || DOM.audio.error || DOM.audio.readyState < 2 || DOM.audio.currentTime === 0) {
      state.isAutoPlayPending = false;
      debouncedTryAutoPlay();
    }
  });
  
  // Network events
  window.addEventListener('online', () => {
    showToast('Мережу відновлено', 'success');
    if (state.intendedPlaying && state.stationItems?.length && state.currentIndex < state.stationItems.length) {
      state.isAutoPlayPending = false;
      debouncedTryAutoPlay();
    }
  });
  
  window.addEventListener('offline', () => {
    showToast('З\'єднання з мережею втрачено', 'error');
    updateWaveVisualizer(false);
    if (DOM.playPauseBtn) DOM.playPauseBtn.classList.remove('playing');
    state.errorCount = 0;
    stopMetadataStreaming();
  });
  
  // Media Session API
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      if (!state.intendedPlaying) togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (state.isPlaying) togglePlayPause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', prevStation);
    navigator.mediaSession.setActionHandler('nexttrack', nextStation);
  }
}

// ===== Initialization =====
function init() {
  cacheDOM();
  
  if (!DOM.audio || !DOM.stationList || !DOM.playPauseBtn || !DOM.currentStationInfo || !DOM.themeToggle || !DOM.shareButton || !DOM.exportButton || !DOM.importButton || !DOM.importFileInput || !DOM.searchInput || !DOM.searchQuery || !DOM.searchCountry || !DOM.searchGenre || !DOM.searchBtn || !DOM.pastSearchesList || !DOM.tabsContainer) {
    console.error('Required DOM elements not found, retrying...');
    setTimeout(init, 100);
    return;
  }
  
  // Initialize
  DOM.audio.preload = 'auto';
  DOM.audio.volume = parseFloat(localStorage.getItem(CONSTANTS.VOLUME_STORAGE_KEY)) || 0.9;
  
  state.customTabs = Array.isArray(state.customTabs) ? state.customTabs.filter(tab => typeof tab === 'string' && tab.trim()) : [];
  
  updatePastSearches();
  populateSearchSuggestions();
  renderTabs();
  setupPullToRefresh();
  setupLazyLoading();
  setupServiceWorker();
  setupEventListeners();
  
  // Load stations and switch to current tab
  loadStations().then(() => {
    switchTab(state.currentTab);
  });
  
  // Apply theme
  applyTheme(currentTheme);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}