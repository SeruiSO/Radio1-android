let currentTab = localStorage.getItem("currentTab") || "techno";
if (currentTab === "history") { currentTab = "techno"; localStorage.setItem("currentTab", "techno"); }
let currentIndex = 0;
let favoriteStations = JSON.parse(localStorage.getItem("favoriteStations")) || [];
let isPlaying = false; /* NATIVE_NO_LS_PLAY */
let _lsPlayHint = localStorage.getItem("isPlaying") === "true";
let intendedPlaying = false; /* NATIVE_NO_LS_PLAY */
let _lsIntendedHint = localStorage.getItem("intendedPlaying") === "true";
let stationLists = JSON.parse(localStorage.getItem("stationLists")) || {};
let userAddedStations = JSON.parse(localStorage.getItem("userAddedStations")) || {};
let stationItems = [];
let abortController = new AbortController();
let errorCount = 0;
const ERROR_LIMIT = 15;
let pastSearches = JSON.parse(localStorage.getItem("pastSearches")) || [];
let deletedStations = JSON.parse(localStorage.getItem("deletedStations")) || [];
let customTabs = JSON.parse(localStorage.getItem("customTabs")) || [];
let isAutoPlayPending = false;
let lastSuccessfulPlayTime = 0;
let streamAbortController = null;
let errorTimeout = null;
let autoPlayRequestId = 0;
let metadataCheckInterval = null;
let currentTrack = "";
let dragEnabled = false;
let dragStartIndex = null;
let longPressTimer = null;
let pullToRefreshStartY = 0;
let pullToRefreshThreshold = 100;
let isPulling = false;
let viewTransitionSupported = document.startViewTransition ? true : false;
let searchDebounceTimer = null;
let lazyLoadObserver = null;
let metadataReaderController = null;
let metadataRetryTimeout = null;
let lastStationUrl = localStorage.getItem("lastStationUrl") || "";
let lastStationName = localStorage.getItem("lastStationName") || "";
let recentStations = [];
try { recentStations = JSON.parse(localStorage.getItem("recentStations") || "[]"); if (!Array.isArray(recentStations)) recentStations = []; } catch (e) { recentStations = []; }
let sleepTimerId = null;
let searchPanelOpen = false;

function setPlaybackStatus(text, active) {
  try {
    var el = document.getElementById("playbackStatus");
    if (!el) return;
    el.textContent = text || "";
    if (active) el.classList.add("is-active"); else el.classList.remove("is-active");
  } catch (e) {}
}


function updateWaveVisualizerGlobal(playing) {
  const waveVisualizer = document.querySelector(".wave-visualizer");
  if (!waveVisualizer) return;
  if (playing) waveVisualizer.classList.add("playing");
  else waveVisualizer.classList.remove("playing");
}
function syncPlaybackUi(playing) {
  isPlaying = !!playing;
  intendedPlaying = !!playing;
  localStorage.setItem("isPlaying", playing ? "true" : "false");
  localStorage.setItem("intendedPlaying", playing ? "true" : "false");
  const btn = document.querySelector(".controls .control-btn:nth-child(2)");
  if (btn) {
    if (playing) {
      btn.textContent = "⏸";
      btn.classList.add("playing");
      btn.setAttribute("aria-label", "Пауза");
    } else {
      btn.textContent = "▶";
      btn.classList.remove("playing");
      btn.setAttribute("aria-label", "Грати");
    }
  }
  updateWaveVisualizerGlobal(playing);
}
window.addEventListener("native-playback", function (ev) {
  try {
    const playing = !!(ev && ev.detail && ev.detail.playing);
    syncPlaybackUi(playing);
    if (playing) setPlaybackStatus("", false);
  } catch (e) {}
});
window.addEventListener("native-status", function (ev) {
  try {
    var st = (ev && ev.detail && ev.detail.status) || "";
    var attempt = (ev && ev.detail && ev.detail.attempt) || 0;
    if (st === "connecting") setPlaybackStatus("Підключення…", true);
    else if (st === "buffering") setPlaybackStatus("Буферизація…", true);
    else if (st === "reconnecting") setPlaybackStatus("Перепідключення" + (attempt ? (" " + attempt) : "") + "…", true);
    else if (st === "offline") setPlaybackStatus("Немає мережі", true);
    else if (st === "playing") setPlaybackStatus("", false);
    else setPlaybackStatus(st || "", !!st);
  } catch (e) {}
});

function getNativeAutoPlay() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothAutoPlay)
      ? window.Capacitor.Plugins.BluetoothAutoPlay
      : null;
  } catch (e) {
    return null;
  }
}
function restorePlayHintsIfWeb() {
  /* WEB_LS_PLAY_RESTORE */
  if (isNativeApp()) return;
  try {
    if (typeof _lsPlayHint !== "undefined" && _lsPlayHint) isPlaying = true;
    if (typeof _lsIntendedHint !== "undefined" && _lsIntendedHint) intendedPlaying = true;
  } catch (e) {}
}
function isNativeApp() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) {
    return !!getNativeAutoPlay();
  }
}
function nativeSaveStation(url, name) {
  const plugin = getNativeAutoPlay();
  if (!plugin || !url) return;
  plugin.saveStation({ url: url, name: name || "" }).catch(function () {});
}
function nativeSetPlaying(value) {
  const plugin = getNativeAutoPlay();
  if (!plugin) return;
  plugin.setIntendedPlaying({ value: !!value }).catch(function () {});
}
function nativeRequestReady() {
  const plugin = getNativeAutoPlay();
  if (!plugin) return;
  plugin.requestReady().catch(function () {});
}
function nativePlay(url, name) {
  const plugin = getNativeAutoPlay();
  if (!plugin) return Promise.resolve();
  const opts = {};
  if (url) opts.url = url;
  if (name) opts.name = name;
  return plugin.play(opts).catch(function () {});
}
function nativePause() {
  const plugin = getNativeAutoPlay();
  if (!plugin) return Promise.resolve();
  return plugin.pause().catch(function () {});
}
function nativeStop() {
  const plugin = getNativeAutoPlay();
  if (!plugin) return Promise.resolve();
  return plugin.stop().catch(function () {});
}
function nativeGetPlaybackState() {
  const plugin = getNativeAutoPlay();
  if (!plugin || !plugin.getPlaybackState) return Promise.resolve(null);
  return plugin.getPlaybackState().catch(function () { return null; });
}
function applyNativePlaybackState(state) {
  if (!state || !state.url) return false;
  const url = state.url;
  const name = state.name || "";
  const idx = typeof state.queueIndex === "number" ? state.queueIndex : -1;
  const reallyPlaying = (typeof state.isPlaying === "boolean")
    ? state.isPlaying
    : !!state.intendedPlaying;
  lastStationUrl = url;
  lastStationName = name;
  localStorage.setItem("lastStationUrl", lastStationUrl);
  localStorage.setItem("lastStationName", lastStationName);
  if (reallyPlaying || state.intendedPlaying) {
    intendedPlaying = true;
    isPlaying = !!reallyPlaying;
    localStorage.setItem("intendedPlaying", "true");
    localStorage.setItem("isPlaying", isPlaying ? "true" : "false");
  } else {
    intendedPlaying = false;
    isPlaying = false;
    localStorage.setItem("intendedPlaying", "false");
    localStorage.setItem("isPlaying", "false");
  }
  let found = -1;
  if (stationItems && stationItems.length) {
    for (let i = 0; i < stationItems.length; i++) {
      if (stationItems[i].dataset && stationItems[i].dataset.value === url) {
        found = i;
        break;
      }
    }
  }
  if (found < 0 && idx >= 0 && stationItems && idx < stationItems.length) {
    // підтвердити URL з черги
    const byIdx = stationItems[idx];
    if (byIdx && byIdx.dataset && byIdx.dataset.value === url) found = idx;
    else if (found < 0 && byIdx) found = idx;
  }
  if (found >= 0 && stationItems[found]) {
    currentIndex = found;
    stationItems.forEach(function (el) { el.classList.remove("selected"); });
    stationItems[found].classList.add("selected");
    try { stationItems[found].scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
  }
  // Інфо-панель ЗАВЖДИ з DOM-рядка або з name/url (updateCurrentStation недоступний тут)
  try {
    const info = document.getElementById("currentStationInfo");
    if (info) {
      const item = (found >= 0 && stationItems[found]) ? stationItems[found] : null;
      const nameEl = info.querySelector(".station-name");
      const genreEl = info.querySelector(".station-genre");
      const countryEl = info.querySelector(".station-country");
      const iconEl = info.querySelector(".station-icon");
      const dispName = (item && item.dataset.name) || name || lastStationName || "";
      if (nameEl && dispName) nameEl.textContent = dispName;
      if (genreEl) genreEl.textContent = "жанр: " + ((item && item.dataset.genre) || "-");
      if (countryEl) countryEl.textContent = "країна: " + ((item && item.dataset.country) || "-");
      if (iconEl) {
        const fav = item && item.dataset.favicon ? item.dataset.favicon : "";
        if (fav && (fav.indexOf("http://") === 0 || fav.indexOf("https://") === 0)) {
          iconEl.innerHTML = "";
          iconEl.style.backgroundImage = "url(" + fav + ")";
          iconEl.style.backgroundSize = "contain";
          iconEl.style.backgroundRepeat = "no-repeat";
          iconEl.style.backgroundPosition = "center";
        } else if (!iconEl.style.backgroundImage || iconEl.style.backgroundImage === "none") {
          iconEl.innerHTML = "🎵";
          iconEl.style.backgroundImage = "none";
        }
      }
    }
  } catch (e) { console.log("applyNative info", e); }
  const btn = document.querySelector(".controls .control-btn:nth-child(2)");
  const uiPlaying = (typeof state.isPlaying === "boolean") ? state.isPlaying : !!state.intendedPlaying;
  if (btn) {
    if (uiPlaying) {
      btn.textContent = "⏸";
      btn.classList.add("playing");
      btn.setAttribute("aria-label", "Пауза");
    } else {
      btn.textContent = "▶";
      btn.classList.remove("playing");
      btn.setAttribute("aria-label", "Грати");
    }
  }
  try { updateWaveVisualizerGlobal(!!uiPlaying); } catch (e) {}
  try {
    if (state.track && typeof state.track === "string" && state.track.trim()) {
      const el = document.getElementById("currentTrack");
      if (el && typeof window.__updateTrackDisplay === "function") {
        window.__updateTrackDisplay(state.track.trim());
      } else if (el) {
        el.classList.remove("loading", "is-empty");
        el.textContent = "🎵 Трек: " + state.track.trim();
      }
    }
  } catch (e) {}
  
  var factPlaying = (typeof state.isPlaying === "boolean")
    ? !!state.isPlaying
    : !!state.intendedPlaying;
  intendedPlaying = !!state.intendedPlaying;
  isPlaying = factPlaying;
  try {
    localStorage.setItem("intendedPlaying", intendedPlaying ? "true" : "false");
    localStorage.setItem("isPlaying", isPlaying ? "true" : "false");
  } catch (e) {}
  try { if (typeof syncPlaybackUi === "function") syncPlaybackUi(isPlaying); } catch (e) {}

  return true;
}

function nativeSetBtWatch(value) {
  const plugin = getNativeAutoPlay();
  if (!plugin || !plugin.setBtWatch) return Promise.resolve();
  return plugin.setBtWatch({ value: !!value }).catch(function () {});
}
function nativeGetBtWatch() {
  const plugin = getNativeAutoPlay();
  if (!plugin || !plugin.getBtWatch) return Promise.resolve(true);
  return plugin.getBtWatch().then(function (r) {
    return r && r.value !== false;
  }).catch(function () { return true; });
}
function nativeSaveQueue(urls, names, index) {
  const plugin = getNativeAutoPlay();
  if (!plugin) return;
  plugin.saveQueue({
    urls: JSON.stringify(urls || []),
    names: JSON.stringify(names || []),
    index: index || 0
  }).catch(function () {});
}
function syncQueueToNative() {
  if (!isNativeApp()) return;
  const urls = [];
  const names = [];
  (stationItems || []).forEach(function (item) {
    if (item && item.dataset && item.dataset.value && !item.classList.contains("empty")) {
      urls.push(item.dataset.value);
      names.push(item.dataset.name || "");
    }
  });
  if (urls.length === 0 && lastStationUrl) {
    urls.push(lastStationUrl);
    names.push(lastStationName || "");
  }
  const idx = Math.max(0, Math.min(currentIndex || 0, urls.length - 1));
  nativeSaveQueue(urls, names, idx);
}






// Список станцій, які не підтримують метадані
const noMetadataStations = [
  'online.hitfm.ua',
  'online.radiorecord.com.ua',
  'cast.brg.ua',
  'icecast.luxnet.ua'
];

customTabs = Array.isArray(customTabs) ? customTabs.filter(tab => typeof tab === "string" && tab.trim()) : [];

document.addEventListener("DOMContentLoaded", () => {
  const audio = document.getElementById("audioPlayer");
  const stationList = document.getElementById("stationList");
  const playPauseBtn = document.querySelector(".controls .control-btn:nth-child(2)");
  const currentStationInfo = document.getElementById("currentStationInfo");
  const themeToggle = document.querySelector(".theme-toggle");
  const moreMenuBtn = document.getElementById("moreMenuBtn");
  const moreDropdown = document.getElementById("moreDropdown");
  const shareButton = document.querySelector(".share-button");
  const exportButton = document.querySelector(".export-button");
  const importButton = document.querySelector(".import-button");
  const importFileInput = document.getElementById("importFileInput");
  const searchInput = document.getElementById("searchInput");
  const searchQuery = document.getElementById("searchQuery");
  const searchCountry = document.getElementById("searchCountry");
  const searchGenre = document.getElementById("searchGenre");
  const searchBtn = document.querySelector(".search-btn");
  const pastSearchesList = document.getElementById("pastSearches");
  const tabsContainer = document.getElementById("tabs");
  const currentTrackElement = document.getElementById("currentTrack");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const toastContainer = document.getElementById("toastContainer");
  const pullIndicator = document.getElementById("pullIndicator");
  const waveVisualizer = document.querySelector('.wave-visualizer');

  if (!audio || !stationList || !playPauseBtn || !currentStationInfo || !themeToggle || !shareButton || !exportButton || !importButton || !importFileInput || !searchInput || !searchQuery || !searchCountry || !searchGenre || !searchBtn || !pastSearchesList || !tabsContainer) {
    console.error("One of required DOM elements not found");
    setTimeout(initializeApp, 100);
    return;
  }

  initializeApp();

  function initializeApp() {
    try { restorePlayHintsIfWeb(); } catch (e) {}

    try { localStorage.removeItem("recentStations"); } catch (e) {} /* recentStations_cleanup */

    if (isNativeApp() && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k); });
        }).catch(function () {});
      }
    }
    nativeRequestReady();
    // Native: НЕ перезаписуємо KEY_PLAY з localStorage — сервіс (BT/skip) є source of truth
    if (!isNativeApp()) {
      if (lastStationUrl) nativeSaveStation(lastStationUrl, lastStationName);
      nativeSetPlaying(intendedPlaying);
    }
    if (isNativeApp()) {
      audio.muted = true;
      audio.volume = 0;
    }
    audio.preload = "auto";
    audio.volume = parseFloat(localStorage.getItem("volume")) || 0.9;

    // Важливо для resume після Bluetooth
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");

    updatePastSearches();
    populateSearchSuggestions();
    renderTabs();
    /* setupPullToRefresh disabled (native) */;
    setupLazyLoading();
    
    // Завантажуємо станції одразу
    loadStations().then(() => {
// Після завантаження перемикаємося на поточний таб
      switchTab(currentTab);
      setTimeout(function(){ syncQueueToNative(); }, 400);
      /* NATIVE_RESUME_SYNC */
      if (isNativeApp()) {
        setTimeout(function () {
          nativeGetPlaybackState().then(function (st) {
            if (st) applyNativePlaybackState(st);
          });
        }, 550);
      }

      // ===== ГЛИБОКИЙ АВТОЗАПУСК ДЛЯ АВТО =====
      // Якщо користувач востаннє слухав — готуємо відтворення максимально агресивно
      if (intendedPlaying) {
        // Native: ExoPlayer/BT самі стартують — одна м'яка спроба UI-синку
        // PWA: кілька retry як раніше
        if (isNativeApp()) {
          setTimeout(() => {
            // лише оновити UI, без повторного nativePlay якщо сервіс уже грає
            if (playPauseBtn && intendedPlaying) {
              playPauseBtn.textContent = "⏸";
              playPauseBtn.classList.add("playing");
              updateWaveVisualizer(true);
            }
            if (lastStationName) {
              const nameEl = currentStationInfo && currentStationInfo.querySelector(".station-name");
              if (nameEl && (!nameEl.textContent || nameEl.textContent === "Виберіть станцію")) {
                nameEl.textContent = lastStationName;
              }
            }
          }, 600);
        } else {
          setTimeout(() => {
            isAutoPlayPending = false;
            debouncedTryAutoPlay(5, 600);
          }, 800);
          setTimeout(() => {
            if (intendedPlaying && (audio.paused || audio.error)) {
              isAutoPlayPending = false;
              debouncedTryAutoPlay(4, 900);
            }
          }, 2500);
          setTimeout(() => {
            if (intendedPlaying && (audio.paused || audio.error)) {
              isAutoPlayPending = false;
              debouncedTryAutoPlay(3, 1200);
            }
          }, 5000);
        }
      }
    });

    shareButton.addEventListener("click", () => {
      const stationName = currentStationInfo.querySelector(".station-name").textContent || "Radio S O";
      const shareData = {
        title: "Radio S O",
        text: `Слухаю ${stationName} на Radio S O! Приєднуйся до моїх улюблених радіостанцій!`,
        url: window.location.href
      };
      if (navigator.share) {
        navigator.share(shareData)
          .then(() => showToast("Поділилися успішно!", "success"))
          .catch(error => {
            console.error("Error sharing:", error);
            showToast("Помилка поширення", "error");
          });
      } else {
        navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
          .then(() => showToast("Посилання скопійовано в буфер обміну!", "success"))
          .catch(() => alert(`Функція поширення не підтримується. Скопіюйте: ${shareData.text} ${shareData.url}`));
      }
    });

    exportButton.addEventListener("click", exportSettings);
    importButton.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", importSettings);

    function closeMoreMenu() {
      if (!moreDropdown || !moreMenuBtn) return;
      moreDropdown.hidden = true;
      moreMenuBtn.setAttribute("aria-expanded", "false");
    }

    function refreshBtWatchLabel() {
      const btn = document.getElementById("btWatchBtn");
      if (!btn) return;
      nativeGetBtWatch().then(function (on) {
        btn.textContent = on ? "🔵 BT стеження: увімк" : "⚪ BT стеження: вимк";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    const btWatchBtn = document.getElementById("btWatchBtn");
    if (btWatchBtn) {
      btWatchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        nativeGetBtWatch().then(function (on) {
          const next = !on;
          return nativeSetBtWatch(next).then(function () {
            btWatchBtn.textContent = next ? "🔵 BT стеження: увімк" : "⚪ BT стеження: вимк";
            btWatchBtn.setAttribute("aria-pressed", next ? "true" : "false");
            showToast(next ? "BT стеження увімкнено" : "BT стеження вимкнено — автозапуск з BT не буде", next ? "success" : "info");
          });
        });
      });
      refreshBtWatchLabel();
    }

    function clearSleepTimer() {
      if (sleepTimerId) { clearTimeout(sleepTimerId); sleepTimerId = null; }
      const b = document.getElementById("sleepTimerBtn");
      if (b) b.textContent = "⏱ Таймер сну";
    }
    function armSleepTimer(mins) {
      clearSleepTimer();
      const b = document.getElementById("sleepTimerBtn");
      if (b) b.textContent = "⏱ Сон: " + mins + " хв";
      showToast("Таймер сну: " + mins + " хв", "info");
      sleepTimerId = setTimeout(function () {
        sleepTimerId = null;
        intendedPlaying = false;
        isPlaying = false;
        localStorage.setItem("intendedPlaying", "false");
        localStorage.setItem("isPlaying", "false");
        if (typeof nativePause === "function") nativePause();
        nativeSetPlaying(false);
        try {
          if (playPauseBtn) {
            playPauseBtn.textContent = "▶";
            playPauseBtn.classList.remove("playing");
          }
          updateWaveVisualizerGlobal(false);
        } catch (e) {}
        const b2 = document.getElementById("sleepTimerBtn");
        if (b2) b2.textContent = "⏱ Таймер сну";
        showToast("Таймер сну: пауза", "info");
      }, mins * 60 * 1000);
    }
    const sleepTimerBtn = document.getElementById("sleepTimerBtn");
    const sleepTimerMenu = document.getElementById("sleepTimerMenu");
    function closeSleepMenu() {
      if (sleepTimerMenu) sleepTimerMenu.hidden = true;
      if (sleepTimerBtn) sleepTimerBtn.setAttribute("aria-expanded", "false");
    }
    if (sleepTimerBtn && sleepTimerMenu) {
      sleepTimerBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = sleepTimerMenu.hidden;
        sleepTimerMenu.hidden = !open;
        sleepTimerBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      sleepTimerMenu.querySelectorAll(".sleep-opt").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          const mins = parseInt(btn.getAttribute("data-mins"), 10) || 0;
          closeSleepMenu();
          if (mins <= 0) {
            clearSleepTimer();
            showToast("Таймер сну вимкнено", "info");
          } else {
            armSleepTimer(mins);
          }
          // закрити ⋯ лише після вибору
          try { if (typeof closeMoreMenu === "function") closeMoreMenu(); } catch (err) {}
          try {
            if (moreDropdown) moreDropdown.hidden = true;
            if (moreMenuBtn) moreMenuBtn.setAttribute("aria-expanded", "false");
          } catch (err) {}
        });
      });
      document.addEventListener("click", function (e) {
        if (!sleepTimerMenu.hidden && !sleepTimerMenu.contains(e.target) && e.target !== sleepTimerBtn) {
          closeSleepMenu();
        }
      });
    }

    if (moreMenuBtn && moreDropdown) {
      moreMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = moreDropdown.hidden;
        moreDropdown.hidden = !open;
        moreMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", (e) => {
        if (!moreDropdown.hidden && !moreDropdown.contains(e.target) && e.target !== moreMenuBtn) {
          closeMoreMenu();
        }
      });
      moreDropdown.querySelectorAll(".more-item").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          // таймер сну — лишаємо меню відкритим, щоб вибрати хвилини
          if (btn.id === "sleepTimerBtn" || btn.closest(".sleep-wrap")) {
            ev.stopPropagation();
            return;
          }
          setTimeout(closeMoreMenu, 50);
        });
      });
    }


    document.querySelector(".controls .control-btn:nth-child(1)").addEventListener("click", () => {
      prevStation();
      provideHapticFeedback();
    });
    document.querySelector(".controls .control-btn:nth-child(2)").addEventListener("click", () => {
      togglePlayPause();
      provideHapticFeedback();
    });
    document.querySelector(".controls .control-btn:nth-child(3)").addEventListener("click", () => {
      nextStation();
      provideHapticFeedback();
    });

    // Debounced search
    
    (function bindSearchToggleOnce() {
      var bar = document.getElementById("searchToggleBar");
      if (!bar || bar._radioSearchBound) return;
      bar._radioSearchBound = true;
      bar.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (searchPanelOpen) collapseSearchPanel();
          else expandSearchPanel();
        } catch (err) {
          // fallback: toggle fields visibility
          var fields = document.getElementById("searchFields");
          if (fields) {
            fields.hidden = !fields.hidden;
            bar.setAttribute("aria-expanded", fields.hidden ? "false" : "true");
          }
        }
      });
    })();

searchBtn.addEventListener("click", () => {
      const query = searchQuery.value.trim();
      const country = normalizeCountry(searchCountry.value.trim());
      const genre = searchGenre.value.trim().toLowerCase();
      
      if (query || country || genre) {
        if (query && !pastSearches.includes(query)) {
          pastSearches.unshift(query);
          if (pastSearches.length > 5) pastSearches.pop();
          localStorage.setItem("pastSearches", JSON.stringify(pastSearches));
          updatePastSearches();
        }
        
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          searchStations(query, country, genre);
        }, 300);
      } else {
        stationList.innerHTML = "<div class='station-item empty'>Введіть запит і натисніть Знайти</div>";
      }
    });

    searchQuery.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchBtn.click();
    });

    searchCountry.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchBtn.click();
    });

    searchGenre.addEventListener("keypress", (e) => {
      if (e.key === "Enter") searchBtn.click();
    });

    function showToast(message, type = "info", duration = 3000) {
      if (!toastContainer) return;
      toastContainer.textContent = message;
      toastContainer.classList.remove("toast-success", "toast-error", "toast-info");
      toastContainer.classList.add("show");
      toastContainer.classList.add(type === "error" ? "toast-error" : (type === "success" ? "toast-success" : "toast-info"));
      toastContainer.style.backgroundColor = "";
      toastContainer.setAttribute("aria-label", message);
      setTimeout(() => {
        toastContainer.classList.remove("show", "toast-success", "toast-error", "toast-info");
        toastContainer.textContent = "";
      }, duration);
    }

    function provideHapticFeedback() {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }

    function setupPullToRefresh() {
      /* disabled in native app */
    }

    function setupLazyLoading() {
      lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
              // Перевіряємо протокол для HTTPS
              const secureSrc = src.replace('http://', 'https://');
              img.src = secureSrc;
              img.classList.add('loaded');
              lazyLoadObserver.unobserve(img);
            }
          }
        });
      }, {
        rootMargin: '50px'
      });
    }

    function updateWaveVisualizer(playing) {
      if (!waveVisualizer) return;
      
      if (playing) {
        waveVisualizer.classList.add('playing');
      } else {
        waveVisualizer.classList.remove('playing');
      }
    }

    function showLoading() {
      if (loadingIndicator) {
        loadingIndicator.classList.add("show");
      }
    }

    function hideLoading() {
      if (loadingIndicator) {
        loadingIndicator.classList.remove("show");
      }
    }

    async function exportSettings() {
      const settings = {
        selectedTheme: localStorage.getItem("selectedTheme") || "shadow-pulse",
        customTabs: JSON.parse(localStorage.getItem("customTabs")) || [],
        userAddedStations: JSON.parse(localStorage.getItem("userAddedStations")) || {},
        favoriteStations: JSON.parse(localStorage.getItem("favoriteStations")) || [],
        pastSearches: JSON.parse(localStorage.getItem("pastSearches")) || [],
        deletedStations: JSON.parse(localStorage.getItem("deletedStations")) || [],
        stationLists: JSON.parse(localStorage.getItem("stationLists")) || {},
        currentTab: localStorage.getItem("currentTab") || "techno",
        lastStationUrl: localStorage.getItem("lastStationUrl") || "",
        lastStationName: localStorage.getItem("lastStationName") || "",
        intendedPlaying: localStorage.getItem("intendedPlaying") === "true"
      };
      // Порядок станцій по вкладках
      try {
        const order = {};
        Object.keys(stationLists || {}).forEach(tab => {
          order[tab] = (stationLists[tab] || []).map(s => s.name);
        });
        settings.stationOrder = order;
      } catch (e) {}

      const json = JSON.stringify(settings, null, 2);

      if (isNativeApp() && window.Capacitor && window.Capacitor.Plugins) {
        try {
          const FS = window.Capacitor.Plugins.Filesystem;
          const Share = window.Capacitor.Plugins.Share;
          if (FS) {
            await FS.writeFile({
              path: "radio_settings.json",
              data: json,
              directory: "CACHE",
              encoding: "UTF8"
            });
            const uriResult = await FS.getUri({
              path: "radio_settings.json",
              directory: "CACHE"
            });
            if (Share && uriResult && uriResult.uri) {
              await Share.share({
                title: "Radio S O settings",
                url: uriResult.uri,
                dialogTitle: "Зберегти налаштування"
              });
              showToast("Налаштування експортовано!", "success");
              return;
            }
          }
        } catch (e) {
          console.error("Native export failed", e);
        }
      }

      // Fallback (браузер / якщо Share недоступний)
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "radio_settings.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Налаштування експортовано!", "success");
    }

    function importSettings(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        showToast("Файл не вибрано", "error");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => showToast("Не вдалося прочитати файл", "error");
      reader.onload = (e) => {
        try {
          let raw = e.target.result;
          if (typeof raw !== "string") {
            showToast("Невірний вміст файлу", "error");
            return;
          }
          raw = raw.replace(/^\uFEFF/, "").trim();

          let settings = null;
          // 1) звичайний JSON
          try {
            settings = JSON.parse(raw);
          } catch (e1) {
            // 2) base64 (якщо Share/Filesystem віддав закодований файл)
            try {
              let decoded = raw;
              // прибрати data: префікс якщо є
              if (decoded.indexOf("base64,") !== -1) {
                decoded = decoded.split("base64,").pop();
              }
              decoded = decoded.replace(/\s/g, "");
              const bin = atob(decoded);
              // UTF-8 з бінарного
              try {
                decoded = decodeURIComponent(escape(bin));
              } catch (_) {
                decoded = bin;
              }
              settings = JSON.parse(decoded);
            } catch (e2) {
              // 3) інколи файл = JSON всередині лапок / з BOM / з HTML
              const start = raw.indexOf("{");
              const end = raw.lastIndexOf("}");
              if (start !== -1 && end > start) {
                settings = JSON.parse(raw.slice(start, end + 1));
              } else {
                throw e1;
              }
            }
          }

          if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
            showToast("Невірний файл налаштувань!", "error");
            return;
          }

          const validThemes = [
            "shadow-pulse", "dark-abyss", "emerald-glow", "retro-wave",
            "neon-pulse", "lime-surge", "flamingo-flash", "aqua-glow",
            "aurora-haze", "starlit-amethyst", "lunar-frost"
          ];
          if (settings.selectedTheme && validThemes.includes(settings.selectedTheme)) {
            localStorage.setItem("selectedTheme", settings.selectedTheme);
            applyTheme(settings.selectedTheme);
          }

          if (Array.isArray(settings.customTabs)) {
            customTabs = settings.customTabs.filter(tab =>
              typeof tab === "string" &&
              tab.trim() &&
              tab.length <= 10 &&
              /^[a-z0-9_-]+$/.test(tab) &&
              !["best", "techno", "trance", "ukraine", "pop", "search"].includes(tab)
            ).slice(0, 7);
            localStorage.setItem("customTabs", JSON.stringify(customTabs));
          }

          const tabOk = (tab) =>
            ["techno", "trance", "ukraine", "pop"].includes(tab) || customTabs.includes(tab);

          const normalizeStation = (s) => {
            if (!s || typeof s !== "object") return null;
            const name = (s.name || s.title || "").toString().trim();
            const value = (s.value || s.url || s.stream || "").toString().trim();
            if (!name || !value) return null;
            if (!isValidUrl(value)) return null;
            return {
              value: value,
              name: name,
              genre: typeof s.genre === "string" ? s.genre : (s.genre || "Unknown"),
              country: typeof s.country === "string" ? s.country : (s.country || "Unknown"),
              favicon: typeof s.favicon === "string" ? s.favicon : "",
              isFromSearch: !!s.isFromSearch
            };
          };

          if (settings.userAddedStations && typeof settings.userAddedStations === "object") {
            const validStations = {};
            Object.keys(settings.userAddedStations).forEach(tab => {
              if (!tabOk(tab)) return;
              const stations = Array.isArray(settings.userAddedStations[tab])
                ? settings.userAddedStations[tab].map(normalizeStation).filter(Boolean)
                : [];
              validStations[tab] = stations;
            });
            userAddedStations = validStations;
            localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
          }

          if (settings.stationLists && typeof settings.stationLists === "object") {
            const lists = {};
            Object.keys(settings.stationLists).forEach(tab => {
              if (!tabOk(tab) && tab !== "best") return;
              if (!Array.isArray(settings.stationLists[tab])) return;
              lists[tab] = settings.stationLists[tab].map(normalizeStation).filter(Boolean);
            });
            stationLists = lists;
            localStorage.setItem("stationLists", JSON.stringify(stationLists));
          }

          if (Array.isArray(settings.favoriteStations)) {
            favoriteStations = settings.favoriteStations
              .map(x => typeof x === "string" ? x : (x && x.name ? x.name : null))
              .filter(Boolean);
            localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
          }
          if (Array.isArray(settings.pastSearches)) {
            pastSearches = settings.pastSearches.filter(s => typeof s === "string").slice(0, 5);
            localStorage.setItem("pastSearches", JSON.stringify(pastSearches));
            updatePastSearches();
          }
          if (Array.isArray(settings.deletedStations)) {
            deletedStations = settings.deletedStations.filter(name => typeof name === "string");
            localStorage.setItem("deletedStations", JSON.stringify(deletedStations));
          }
          if (settings.currentTab && typeof settings.currentTab === "string") {
            const validTabs = ["best", "techno", "trance", "ukraine", "pop", "search", ...customTabs];
            if (validTabs.includes(settings.currentTab)) {
              currentTab = settings.currentTab;
              localStorage.setItem("currentTab", currentTab);
            }
          }
          if (settings.lastStationUrl && isValidUrl(settings.lastStationUrl)) {
            lastStationUrl = settings.lastStationUrl;
            localStorage.setItem("lastStationUrl", lastStationUrl);
            nativeSaveStation(lastStationUrl, settings.lastStationName || "");
          }
          if (settings.lastStationName && typeof settings.lastStationName === "string") {
            lastStationName = settings.lastStationName;
            localStorage.setItem("lastStationName", lastStationName);
          }
          if (typeof settings.intendedPlaying === "boolean") {
            intendedPlaying = settings.intendedPlaying;
            localStorage.setItem("intendedPlaying", String(intendedPlaying));
            nativeSetPlaying(intendedPlaying);
          }

          renderTabs();
          loadStations().then(() => {
            switchTab(currentTab);
            syncQueueToNative();
            showToast("Налаштування успішно імпортовано!", "success");
          });
        } catch (error) {
          console.error("Error importing settings:", error);
          showToast("Помилка імпорту: " + (error && error.message ? error.message : "формат файлу"), "error");
        }
        importFileInput.value = "";
      };
      reader.readAsText(file, "UTF-8");
    }

    function populateSearchSuggestions() {
      const suggestedCountries = [
        "Germany", "France", "United Kingdom", "Italy", "Spain", "Netherlands",
        "Switzerland", "Belgium", "Sweden", "Norway", "Denmark", "Austria",
        "Poland", "Ukraine", "Canada", "United States", "Australia", "Japan",
        "South Korea", "New Zealand"
      ];
      const suggestedGenres = [
        "Pop", "Rock", "Dance", "Electronic", "Techno", "Trance", "House",
        "EDM", "Hip-Hop", "Rap", "Jazz", "Classical", "Country", "Reggae",
        "Blues", "Folk", "Metal", "R&B", "Soul", "Ambient"
      ];

      const countryDatalist = document.getElementById("suggestedCountries");
      const genreDatalist = document.getElementById("suggestedGenres");

      if (countryDatalist) {
        countryDatalist.innerHTML = suggestedCountries.map(country => `<option value="${country}">`).join("");
      }
      if (genreDatalist) {
        genreDatalist.innerHTML = suggestedGenres.map(genre => `<option value="${genre}">`).join("");
      }
    }

    function updatePastSearches() {
      pastSearchesList.innerHTML = "";
      pastSearches.forEach(search => {
        const option = document.createElement("option");
        option.value = search;
        pastSearchesList.appendChild(option);
      });
    }

    function normalizeCountry(country) {
      if (!country) return "";
      const countryMap = {
        "ukraine": "Ukraine", "italy": "Italy", "german": "Germany",
        "germany": "Germany", "france": "France", "spain": "Spain",
        "usa": "United States", "united states": "United States",
        "uk": "United Kingdom", "united kingdom": "United Kingdom",
        "netherlands": "Netherlands", "canada": "Canada", "australia": "Australia",
        "switzerland": "Switzerland", "belgium": "Belgium", "poland": "Poland",
        "austria": "Austria", "sweden": "Sweden", "norway": "Norway",
        "denmark": "Denmark", "japan": "Japan", "south korea": "South Korea",
        "new zealand": "New Zealand"
      };
      const normalized = country.toLowerCase();
      return countryMap[normalized] || country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();
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

    function normalizeUrl(url) {
      if (!url) return "";
      try {
        const urlObj = new URL(url);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return url;
      }
    }

    function resetStationInfo() {
      const stationNameElement = currentStationInfo.querySelector(".station-name");
      const stationGenreElement = currentStationInfo.querySelector(".station-genre");
      const stationCountryElement = currentStationInfo.querySelector(".station-country");
      const stationIconElement = currentStationInfo.querySelector(".station-icon");
      const currentTrackElement = document.getElementById("currentTrack");
      if (stationNameElement) stationNameElement.textContent = "Виберіть станцію";
      if (stationGenreElement) stationGenreElement.textContent = "жанр: -";
      if (stationCountryElement) stationCountryElement.textContent = "країна: -";
      if (stationIconElement) {
        stationIconElement.innerHTML = "🎵";
        stationIconElement.style.backgroundImage = "none";
      }
      if (currentTrackElement) {
        currentTrackElement.textContent = "🎵 Трек: невідомо";
      }
    }

    // Функція для перевірки, чи підтримує станція метадані
    function supportsMetadata(stationUrl) {
      try {
        const url = new URL(stationUrl);
        return !noMetadataStations.some(domain => url.hostname.includes(domain));
      } catch {
        return true;
      }
    }

    // --- ПОКРАЩЕНА ФУНКЦІЯ ДЛЯ ОТРИМАННЯ МЕТАДАНИХ ТРЕКУ ---
    async function fetchTrackMetadata(stationUrl, stationName) {
      // Зупиняємо попереднє читання потоку
      stopMetadataStreaming();
      
      if (!stationUrl || !isPlaying) {
        updateTrackDisplay("unknown");
        return;
      }

      updateTrackDisplay("loading...");

      // Перевіряємо, чи підтримує станція метадані
      if (!supportsMetadata(stationUrl)) {
        console.log("Station doesn't support metadata, showing station name as track");
        updateTrackDisplay(stationName);
        return;
      }

      // Спочатку пробуємо отримати метадані через API радіобраузера за URL
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
            
            // Запускаємо періодичну перевірку через API
            startPeriodicApiCheck(stations[0].id);
            return;
          }
        }
      } catch (error) {
        console.log("API by URL failed:", error.message);
      }

      // Якщо не вдалося за URL, пробуємо знайти станцію за назвою
      try {
        const searchParams = new URLSearchParams({
          name: stationName,
          limit: 10,
          order: "clickcount",
          reverse: "true",
          hidebroken: "true"
        });
        
        const searchUrl = `https://de1.api.radio-browser.info/json/stations/search?${searchParams.toString()}`;
        const response = await fetch(searchUrl, {
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'RadioMusicSO/1.0' }
        });

        if (response.ok) {
          const stations = await response.json();
          
          // Шукаємо станцію з найближчим URL
          for (const station of stations) {
            if (station.url_resolved && normalizeUrl(station.url_resolved) === normalizeUrl(stationUrl)) {
              if (station.current_track) {
                updateTrackDisplay(station.current_track);
                startPeriodicApiCheck(station.id);
                return;
              }
              break;
            }
          }
          
          // Якщо точної не знайшли, беремо першу з високим рейтингом
          if (stations.length > 0 && stations[0].current_track) {
            updateTrackDisplay(stations[0].current_track);
            startPeriodicApiCheck(stations[0].id);
            return;
          }
        }
      } catch (error) {
        console.log("API by name failed:", error.message);
      }

      // Якщо API не дало результату — у нативці чекаємо ICY з ExoPlayer, інакше назва станції
      if (isNativeApp()) {
        updateTrackDisplay("—");
      } else {
        updateTrackDisplay(stationName);
      }
    }

    // Періодична перевірка через API
    function startPeriodicApiCheck(stationId) {
      if (metadataCheckInterval) {
        clearInterval(metadataCheckInterval);
      }

      metadataCheckInterval = setInterval(async () => {
        if (!isPlaying) return;

        try {
          const response = await fetch(`https://de1.api.radio-browser.info/json/stations/byuuid/${stationId}`, {
            signal: AbortSignal.timeout(3000),
            headers: { 'User-Agent': 'RadioMusicSO/1.0' }
          });

          if (response.ok) {
            const stations = await response.json();
            if (stations.length > 0 && stations[0].current_track) {
              const newTrack = stations[0].current_track;
              if (newTrack !== currentTrack) {
                updateTrackDisplay(newTrack);
              }
            }
          }
        } catch (error) {
          console.log("Periodic API check failed:", error.message);
        }
      }, 15000); // Кожні 15 секунд
    }

    function updateTrackDisplay(track) {
      try { window.__updateTrackDisplay = updateTrackDisplay; } catch (e) {}
      const currentTrackElement = document.getElementById("currentTrack");
      if (!currentTrackElement) return;

      currentTrackElement.classList.remove('loading', 'marquee');

      if (track && track !== "unknown" && track !== "loading..." && track !== 'null' && track !== 'undefined') {
        let cleanTrack = track.replace(/^StreamTitle='|';$|'$/g, '').trim();
        
        // Видаляємо зайві символи
        cleanTrack = cleanTrack.replace(/[^\x20-\x7E\u0400-\u04FF]/g, '');
        
        // Якщо трек виявився пустим, показуємо назву станції
        if (!cleanTrack || cleanTrack.length === 0) {
          const stationName = stationItems?.[currentIndex]?.dataset?.name || "unknown";
          cleanTrack = stationName;
        }
        
        // Розділяємо на виконавця і трек якщо є " - "
        if (cleanTrack.includes(' - ')) {
          const parts = cleanTrack.split(' - ');
          if (parts.length >= 2) {
            cleanTrack = `${parts[0]} - ${parts[1]}`;
          }
        }
        
        if (cleanTrack.length > 50) {
          currentTrackElement.classList.remove('is-empty');
          currentTrackElement.classList.remove('marquee');
          currentTrackElement.classList.remove("is-empty");
        currentTrackElement.classList.remove("marquee");
        currentTrackElement.textContent = `🎵 ${cleanTrack}`;
        } else {
          currentTrackElement.classList.remove("is-empty");
        currentTrackElement.classList.remove("marquee");
        currentTrackElement.textContent = `🎵 ${cleanTrack}`;
        }
        
        currentTrackElement.title = cleanTrack;
        currentTrack = cleanTrack;
      } else if (track === "loading...") {
        currentTrackElement.textContent = "🎵 Завантаження треку...";
        currentTrackElement.classList.add("loading");
        currentTrack = "";
      } else if (track === "—" || track === "-") {
        currentTrackElement.classList.add("is-empty");
        currentTrackElement.classList.remove("marquee");
        currentTrackElement.textContent = "🎵 Трек: —";
        currentTrack = "";
      } else {
        // Якщо трек не визначено
        if (isNativeApp()) {
          currentTrackElement.classList.add("is-empty");
        currentTrackElement.classList.remove("marquee");
        currentTrackElement.textContent = "🎵 Трек: —";
          currentTrack = "";
        } else {
          const stationName = stationItems?.[currentIndex]?.dataset?.name || "unknown";
          currentTrackElement.textContent = `🎵 ${stationName}`;
          currentTrack = stationName;
        }
      }
    }

    function stopMetadataStreaming() {
      if (metadataCheckInterval) {
        clearInterval(metadataCheckInterval);
        metadataCheckInterval = null;
      }
      if (metadataRetryTimeout) {
        clearTimeout(metadataRetryTimeout);
        metadataRetryTimeout = null;
      }
    }
    // --- КІНЕЦЬ ПОКРАЩЕНОЇ ФУНКЦІЇ ---

    // Покращений пошук станцій
    async function searchStations(query, country, genre) {
      showLoading();
      stationList.innerHTML = "<div class='station-item empty'>Пошук...</div>";
      
      try {
        abortController.abort();
        abortController = new AbortController();
        
        const params = new URLSearchParams();
        if (query) params.append("name", query);
        if (country) params.append("country", country);
        if (genre) params.append("tag", genre);
        
        params.append("order", "clickcount");
        params.append("reverse", "true");
        params.append("limit", "500");
        params.append("hidebroken", "true");
        
        const url = `https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`;
        console.log("Search URL:", url);
        
        const response = await fetch(url, {
          signal: abortController.signal,
          headers: { 'User-Agent': 'RadioMusicSO/1.0' }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        let stations = await response.json();
        
        // М'якша фільтрація - перевіряємо наявність URL
        stations = stations.filter(station => {
          const url = station.url || station.url_resolved;
          return url && (url.startsWith('http://') || url.startsWith('https://'));
        });
        
        // Конвертуємо HTTP в HTTPS для безпеки
        stations = stations.map(station => {
          if (station.url && station.url.startsWith('http://')) {
            station.url = station.url.replace('http://', 'https://');
          }
          if (station.url_resolved && station.url_resolved.startsWith('http://')) {
            station.url_resolved = station.url_resolved.replace('http://', 'https://');
          }
          return station;
        });
        
        console.log(`Знайдено ${stations.length} станцій`);
        renderSearchResults(stations);
        collapseSearchPanel();
        updateSearchToggleLabel();
        showToast(`Знайдено ${stations.length} станцій`, "success");
        
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Error searching stations:", error);
          stationList.innerHTML = "<div class='station-item empty'>Не вдалося знайти станції</div>";
          showToast("Помилка пошуку", "error");
        }
      } finally {
        hideLoading();
      }
    }

    function renderSearchResults(stations) {
      if (!stations.length) {
        stationList.innerHTML = "<div class='station-item empty'>Нічого не знайдено</div>";
        stationItems = [];
        return;
      }
      
      const fragment = document.createDocumentFragment();
      stations.forEach((station, index) => {
        const item = document.createElement("div");
        item.className = `station-item ${index === currentIndex ? "selected" : ""}`;
        const stationUrl = station.url || station.url_resolved;
        item.dataset.value = stationUrl;
        item.dataset.name = station.name || "Unknown";
        item.dataset.genre = shortenGenre(station.tags || "Unknown");
        item.dataset.country = station.country || "Unknown";
        item.dataset.favicon = station.favicon && isValidUrl(station.favicon) ? station.favicon.replace('http://', 'https://') : "";
        item.dataset.index = index;
        item.style.setProperty('--item-index', index);
        
        const iconHtml = item.dataset.favicon 
          ? `<img data-src="${item.dataset.favicon}" alt="${station.name} icon" style="width: 32px; height: 32px; object-fit: contain; margin-right: 10px;" onerror="this.outerHTML='🎵 '">` 
          : "🎵 ";
        
        item.innerHTML = `
          ${iconHtml}
          <span class="station-name">${station.name}</span>
          <div class="buttons-container">
            <button class="add-btn" aria-label="Додати станцію">ADD</button>
          </div>`;
        
        fragment.appendChild(item);
      });
      
      stationList.innerHTML = "";
      stationList.appendChild(fragment);
      stationItems = document.querySelectorAll(".station-item");
      
      // Налаштовуємо lazy loading для зображень
      stationItems.forEach(item => {
        const img = item.querySelector('img');
        if (img) {
          lazyLoadObserver.observe(img);
        }
      });
      
      stationList.onclick = e => {
        const item = e.target.closest(".station-item");
        const addBtn = e.target.closest(".add-btn");
        if (item && !item.classList.contains("empty")) {
          e.preventDefault();
          currentIndex = Array.from(stationItems).indexOf(item);
          changeStation(currentIndex);
          provideHapticFeedback();
        }
        if (addBtn) {
          e.stopPropagation();
          e.preventDefault();
          showTabModal(item);
        }
      };
    }

    function shortenGenre(tags) {
      const genres = tags.split(",").map(g => g.trim()).filter(g => g);
      return genres.length > 4 ? genres.slice(0, 4).join(", ") + "..." : genres.join(", ");
    }

    function showTabModal(item) {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = `
        <h2>Виберіть вкладку</h2>
        <div class="modal-tabs">
          <button class="modal-tab-btn" data-tab="techno">TECHNO</button>
          <button class="modal-tab-btn" data-tab="trance">TRANCE</button>
          <button class="modal-tab-btn" data-tab="ukraine">UA</button>
          <button class="modal-tab-btn" data-tab="pop">POP</button>
          ${customTabs.map(tab => `<button class="modal-tab-btn" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}
          <button class="modal-cancel-btn">Скасувати</button>
        </div>
      `;
      document.body.appendChild(overlay);
      document.body.appendChild(modal);
      const closeModal = () => {
        overlay.remove();
        modal.remove();
      };
      overlay.addEventListener("click", closeModal);
      modal.querySelectorAll(".modal-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const targetTab = btn.dataset.tab;
          saveStation(item, targetTab);
          closeModal();
          provideHapticFeedback();
        });
      });
      modal.querySelector(".modal-cancel-btn").addEventListener("click", closeModal);
    }

    function saveStation(item, targetTab) {
      const stationName = item.dataset.name;
      if (!stationLists[targetTab]) stationLists[targetTab] = [];
      if (!userAddedStations[targetTab]) userAddedStations[targetTab] = [];
      if (!stationLists[targetTab].some(s => s.name === stationName)) {
        const newStation = {
          value: item.dataset.value,
          name: item.dataset.name,
          genre: item.dataset.genre,
          country: item.dataset.country,
          favicon: item.dataset.favicon || "",
          isFromSearch: currentTab === "search"
        };
        stationLists[targetTab].unshift(newStation);
        userAddedStations[targetTab].unshift(newStation);
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
        if (currentTab !== "search") {
          updateStationList();
        }
        showToast(`Станцію додано до ${targetTab}`, "success");
      } else {
        showToast("Станція вже існує в цій вкладці!", "error");
      }
    }

    function renderTabs() {
      const fixedTabs = ["best", "techno", "trance", "ukraine", "pop"];
      const searchTab = "search";
      
      tabsContainer.innerHTML = "";
      
      // Спочатку фіксовані таби
      fixedTabs.forEach(tab => {
        const btn = document.createElement("button");
        btn.className = `tab-btn ${currentTab === tab ? "active" : ""}`;
        btn.dataset.tab = tab;
        btn.textContent = tab === "best" ? "Best" : tab === "ukraine" ? "UA" : tab.charAt(0).toUpperCase() + tab.slice(1);
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", currentTab === tab ? "true" : "false");
        btn.setAttribute("aria-label", `${tab} tab`);
        tabsContainer.appendChild(btn);
      });
      
      // Потім кастомні таби
      customTabs.forEach(tab => {
        if (typeof tab !== "string" || !tab.trim()) return;
        const btn = document.createElement("button");
        btn.className = `tab-btn ${currentTab === tab ? "active" : ""}`;
        btn.dataset.tab = tab;
        btn.textContent = tab.toUpperCase();
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", currentTab === tab ? "true" : "false");
        btn.setAttribute("aria-label", `${tab} tab`);
        tabsContainer.appendChild(btn);
      });
      
      // Search tab завжди останній
      const searchBtn = document.createElement("button");
      searchBtn.className = `tab-btn ${currentTab === "search" ? "active" : ""}`;
      searchBtn.dataset.tab = "search";
      searchBtn.textContent = "SEARCH";
      searchBtn.setAttribute("role", "tab");
      searchBtn.setAttribute("aria-selected", currentTab === "search" ? "true" : "false");
      searchBtn.setAttribute("aria-label", "Search tab");
      tabsContainer.appendChild(searchBtn);
      
      // Кнопка додавання табу
      const addBtn = document.createElement("button");
      addBtn.className = "add-tab-btn";
      addBtn.textContent = "+";
      addBtn.setAttribute("aria-label", "Додати нову вкладку");
      tabsContainer.appendChild(addBtn);

      tabsContainer.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          switchTab(btn.dataset.tab);
          provideHapticFeedback();
        });
        if (customTabs.includes(btn.dataset.tab)) {
          let longPressTimer;
          btn.addEventListener("pointerdown", () => {
            longPressTimer = setTimeout(() => {
              showEditTabModal(btn.dataset.tab);
              provideHapticFeedback([100]);
            }, 500);
          });
          btn.addEventListener("pointerup", () => clearTimeout(longPressTimer));
          btn.addEventListener("pointerleave", () => clearTimeout(longPressTimer));
        }
      });

      addBtn.addEventListener("click", showNewTabModal);
    }

    function showNewTabModal() {
      const overlay = document.querySelector(".new-tab-modal");
      const modal = overlay.querySelector(".modal");
      const input = document.getElementById("newTabName");
      const createBtn = document.getElementById("createTabBtn");
      const cancelBtn = modal.querySelector(".modal-cancel-btn");

      overlay.style.display = "block";
      input.value = "";
      input.focus();

      const closeModal = () => {
        overlay.style.display = "none";
        createBtn.removeEventListener("click", createTabHandler);
        cancelBtn.removeEventListener("click", closeModal);
        overlay.removeEventListener("click", closeModal);
        input.removeEventListener("keypress", keypressHandler);
      };

      const createTabHandler = () => {
        const tabName = input.value.trim().toLowerCase();
        if (!tabName) {
          showToast("Введіть назву вкладки!", "error");
          return;
        }
        if (["best", "techno", "trance", "ukraine", "pop", "search"].includes(tabName) || customTabs.includes(tabName)) {
          showToast("Така назва вкладки вже існує!", "error");
          return;
        }
        if (tabName.length > 10 || !/^[a-z0-9_-]+$/.test(tabName)) {
          showToast("Назва вкладки не може перевищувати 10 символів і має містити лише латинські літери, цифри, дефіс або підкреслення.", "error");
          return;
        }
        if (customTabs.length >= 7) {
          showToast("Досягнуто максимум 7 кастомних вкладок!", "error");
          return;
        }
        customTabs.push(tabName);
        stationLists[tabName] = [];
        userAddedStations[tabName] = [];
        localStorage.setItem("customTabs", JSON.stringify(customTabs));
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
        renderTabs();
        switchTab(tabName);
        closeModal();
        showToast(`Вкладку "${tabName}" створено!`, "success");
      };

      const keypressHandler = (e) => {
        if (e.key === "Enter") createBtn.click();
      };

      createBtn.addEventListener("click", createTabHandler);
      cancelBtn.addEventListener("click", closeModal);
      overlay.addEventListener("click", closeModal);
      input.addEventListener("keypress", keypressHandler);
    }

    function showEditTabModal(tab) {
      const overlay = document.querySelector(".edit-tab-modal");
      const modal = overlay.querySelector(".modal");
      const input = document.getElementById("renameTabName");
      const renameBtn = document.getElementById("renameTabBtn");
      const deleteBtn = document.getElementById("deleteTabBtn");
      const cancelBtn = modal.querySelector(".modal-cancel-btn");

      overlay.style.display = "block";
      input.value = tab;
      input.focus();

      const closeModal = () => {
        overlay.style.display = "none";
        renameBtn.removeEventListener("click", renameTabHandler);
        deleteBtn.removeEventListener("click", deleteTabHandler);
        cancelBtn.removeEventListener("click", closeModal);
        overlay.removeEventListener("click", closeModal);
        input.removeEventListener("keypress", keypressHandler);
      };

      const renameTabHandler = () => {
        const newName = input.value.trim().toLowerCase();
        if (!newName) {
          showToast("Введіть нову назву вкладки!", "error");
          return;
        }
        if (["best", "techno", "trance", "ukraine", "pop", "search"].includes(newName) || customTabs.includes(newName)) {
          showToast("Така назва вкладки вже існує!", "error");
          return;
        }
        if (newName.length > 10 || !/^[a-z0-9_-]+$/.test(newName)) {
          showToast("Назва вкладки не може перевищувати 10 символів і має містити лише латинські літери, цифри, дефіс або підкреслення.", "error");
          return;
        }
        const index = customTabs.indexOf(tab);
        customTabs[index] = newName;
        stationLists[newName] = stationLists[tab] || [];
        userAddedStations[newName] = userAddedStations[tab] || [];
        delete stationLists[tab];
        delete userAddedStations[tab];
        localStorage.setItem("customTabs", JSON.stringify(customTabs));
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
        if (currentTab === tab) switchTab(newName);
        renderTabs();
        closeModal();
        showToast(`Вкладку перейменовано на "${newName}"`, "success");
      };

      const deleteTabHandler = () => {
        if (confirm(`Ви впевнені, що хочете видалити вкладку "${tab.toUpperCase()}"?`)) {
          customTabs = customTabs.filter(t => t !== tab);
          delete stationLists[tab];
          delete userAddedStations[tab];
          localStorage.setItem("customTabs", JSON.stringify(customTabs));
          localStorage.setItem("stationLists", JSON.stringify(stationLists));
          localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
          if (currentTab === tab) {
            const newTab = customTabs.length > 0 ? customTabs[0] : "techno";
            switchTab(newTab);
          }
          renderTabs();
          closeModal();
          showToast(`Вкладку "${tab}" видалено`, "success");
        }
      };

      const keypressHandler = (e) => {
        if (e.key === "Enter") renameBtn.click();
      };

      renameBtn.addEventListener("click", renameTabHandler);
      deleteBtn.addEventListener("click", deleteTabHandler);
      cancelBtn.addEventListener("click", closeModal);
      overlay.addEventListener("click", closeModal);
      input.addEventListener("keypress", keypressHandler);
    }

    const themes = {
      "shadow-pulse": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#00E676",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #00B248, #00E676)",
        shadow: "rgba(0, 230, 118, 0.3)"
      },
      "dark-abyss": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#AA00FF",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #6A1B9A, #AA00FF)",
        shadow: "rgba(170, 0, 255, 0.3)"
      },
      "emerald-glow": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#2EC4B6",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #1B998B, #2EC4B6)",
        shadow: "rgba(46, 196, 182, 0.3)"
      },
      "retro-wave": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#FF69B4",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #C71585, #FF69B4)",
        shadow: "rgba(255, 105, 180, 0.3)"
      },
      "neon-pulse": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#00F0FF",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #0077B6, #00F0FF)",
        shadow: "rgba(0, 240, 255, 0.3)"
      },
      "lime-surge": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#B2FF59",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #00B248, #B2FF59)",
        shadow: "rgba(178, 255, 89, 0.3)"
      },
      "flamingo-flash": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#FF4081",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #C71585, #FF4081)",
        shadow: "rgba(255, 64, 129, 0.3)"
      },
      "aqua-glow": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#26C6DA",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #0077B6, #26C6DA)",
        shadow: "rgba(38, 198, 218, 0.3)"
      },
      "aurora-haze": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#64FFDA",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #1B998B, #64FFDA)",
        shadow: "rgba(100, 255, 218, 0.3)"
      },
      "starlit-amethyst": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#B388FF",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #6A1B9A, #B388FF)",
        shadow: "rgba(179, 136, 255, 0.3)"
      },
      "lunar-frost": {
        bodyBg: "#000000",
        containerBg: "#000000",
        accent: "#40C4FF",
        text: "#FFFFFF",
        accentGradient: "linear-gradient(45deg, #0077B6, #40C4FF)",
        shadow: "rgba(64, 196, 255, 0.3)"
      }
    };
    
    let currentTheme = localStorage.getItem("selectedTheme") || "shadow-pulse";
    if (!themes[currentTheme]) {
      currentTheme = "shadow-pulse";
      localStorage.setItem("selectedTheme", currentTheme);
    }

    function applyTheme(theme) {
      if (!themes[theme]) {
        theme = "shadow-pulse";
        localStorage.setItem("selectedTheme", theme);
      }
      const root = document.documentElement;
      root.style.setProperty("--body-bg", themes[theme].bodyBg);
      root.style.setProperty("--container-bg", themes[theme].containerBg);
      root.style.setProperty("--accent", themes[theme].accent);
      root.style.setProperty("--text", themes[theme].text);
      root.style.setProperty("--accent-gradient", themes[theme].accentGradient);
      root.style.setProperty("--shadow", themes[theme].shadow);
      localStorage.setItem("selectedTheme", theme);
      currentTheme = theme;
      document.documentElement.setAttribute("data-theme", theme);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute("content", themes[theme].accent);
      }
    }

    function toggleTheme() {
      const themesOrder = [
        "shadow-pulse", "dark-abyss", "emerald-glow", "retro-wave",
        "neon-pulse", "lime-surge", "flamingo-flash", "aqua-glow",
        "aurora-haze", "starlit-amethyst", "lunar-frost"
      ];
      const nextTheme = themesOrder[(themesOrder.indexOf(currentTheme) + 1) % themesOrder.length];
      applyTheme(nextTheme);
      provideHapticFeedback();
      showToast(`Тему змінено на ${nextTheme}`, "info");
    }

    themeToggle.addEventListener("click", toggleTheme);

    if ("serviceWorker" in navigator && !isNativeApp()) {
      navigator.serviceWorker.register("sw.js").then(registration => {
        registration.update();
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
                if (window.confirm("Доступна нова версія радіо. Оновити?")) {
                  window.location.reload();
                }
              }
            });
          }
        });
      });

      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data.type === "CACHE_UPDATED") {
          const currentCacheVersion = localStorage.getItem("cacheVersion") || "0";
          if (currentCacheVersion !== event.data.cacheVersion) {
            favoriteStations = favoriteStations.filter((name) =>
              Object.values(stationLists).flat().some((s) => s.name === name)
            );
            localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
            localStorage.setItem("cacheVersion", event.data.cacheVersion);
            loadStations();
            showToast("Додаток оновлено!", "success");
          }
        }
        // Критично для авто: при відновленні мережі пробуємо грати
        if (event.data.type === "NETWORK_STATUS" && event.data.online && intendedPlaying) {
          isAutoPlayPending = false;
          debouncedTryAutoPlay(4, 700);
        }
      });
    }

    let autoPlayTimeout = null;
    function debouncedTryAutoPlay(retryCount = 3, delay = 800) {
      if (isAutoPlayPending) return;
      const now = Date.now();
      const currentStationUrl = stationItems?.[currentIndex]?.dataset?.value || lastStationUrl;
      const normalizedCurrentUrl = normalizeUrl(currentStationUrl);
      const normalizedAudioSrc = normalizeUrl(audio.src);
      if (now - lastSuccessfulPlayTime < 400 && normalizedAudioSrc === normalizedCurrentUrl && !audio.paused) return;
      if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
      autoPlayRequestId++;
      const currentRequestId = autoPlayRequestId;
      autoPlayTimeout = setTimeout(() => tryAutoPlay(retryCount, delay, currentRequestId), 0);
    }

    async function tryAutoPlay(retryCount = 3, delay = 800, requestId) {
      if (isAutoPlayPending) return;
      if (requestId !== autoPlayRequestId) return;
      isAutoPlayPending = true;

      try {
        if (!navigator.onLine) {
          isAutoPlayPending = false;
          return;
        }
        if (!intendedPlaying) {
          updateWaveVisualizer(false);
          isAutoPlayPending = false;
          return;
        }

        // Беремо URL з поточного списку або з останнього збереженого
        let currentStationUrl = stationItems?.[currentIndex]?.dataset?.value;
        if (!currentStationUrl && lastStationUrl) {
          currentStationUrl = lastStationUrl;
        }
        if (!currentStationUrl || !isValidUrl(currentStationUrl)) {
          errorCount++;
          if (errorCount >= ERROR_LIMIT) resetStationInfo();
          isAutoPlayPending = false;
          return;
        }

        const initialStationUrl = currentStationUrl;
        const normalizedCurrentUrl = normalizeUrl(currentStationUrl);
        const normalizedAudioSrc = normalizeUrl(audio.src);

        // Якщо вже грає потрібна станція — нічого не робимо
        if (normalizedAudioSrc === normalizedCurrentUrl && !audio.paused && !audio.error && audio.readyState >= 2) {
          isPlaying = true;
          updateWaveVisualizer(true);
          playPauseBtn.classList.add("playing");
          playPauseBtn.textContent = "⏸";
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          isAutoPlayPending = false;
          return;
        }

        const attemptPlay = async (attemptsLeft) => {
          if (requestId !== autoPlayRequestId) return;
          if (stationItems?.[currentIndex]?.dataset?.value && 
              stationItems[currentIndex].dataset.value !== initialStationUrl && 
              initialStationUrl !== lastStationUrl) return;

          // ===== ВАЖЛИВО: НЕ скидаємо src якщо він той самий =====
          // Це критично для швидкого resume після Bluetooth
          const needsNewSrc = normalizedAudioSrc !== normalizedCurrentUrl || audio.error || !audio.src;

          if (needsNewSrc) {
            if (streamAbortController) {
              streamAbortController.abort();
              streamAbortController = null;
            }
            streamAbortController = new AbortController();
            audio.pause();
            // Тільки якщо дійсно потрібен новий src
            const secureUrl = currentStationUrl.replace('http://', 'https://');
            audio.src = secureUrl + (secureUrl.includes("?") ? "&" : "?") + "nocache=" + Date.now();
            audio.load();
          }

          try {
            
          if (isNativeApp()) {
            try {
              await nativePlay(currentStationUrl, lastStationName || (stationItems?.[currentIndex]?.dataset?.name) || "");
              errorCount = 0;
              isPlaying = true;
              intendedPlaying = true;
              lastSuccessfulPlayTime = Date.now();
              syncQueueToNative();
              lastStationUrl = currentStationUrl;
              localStorage.setItem("lastStationUrl", lastStationUrl);
              localStorage.setItem("isPlaying", "true");
              localStorage.setItem("intendedPlaying", "true");
              nativeSetPlaying(true);
              updateWaveVisualizer(true);
              playPauseBtn.classList.add("playing");
              playPauseBtn.textContent = "⏸";
              playPauseBtn.setAttribute("aria-label", "Пауза");
              if (stationItems?.[currentIndex]) {
                updateCurrentStation(stationItems[currentIndex]);
              } else if (lastStationName) {
                const nameEl = currentStationInfo.querySelector(".station-name");
                if (nameEl) nameEl.textContent = lastStationName;
              }
            } catch (error) {
              console.log("Native play failed:", error);
              updateWaveVisualizer(false);
              playPauseBtn.classList.remove("playing");
            }
            return;
          }
          await audio.play();
            errorCount = 0;
            isPlaying = true;
            intendedPlaying = true;
            lastSuccessfulPlayTime = Date.now();
            lastStationUrl = currentStationUrl;
            localStorage.setItem("lastStationUrl", lastStationUrl);
            localStorage.setItem("isPlaying", "true");
            localStorage.setItem("intendedPlaying", "true"); nativeSetPlaying(true);
            updateWaveVisualizer(true);
            playPauseBtn.classList.add("playing");
            playPauseBtn.textContent = "⏸";
            playPauseBtn.setAttribute("aria-label", "Пауза");

            if ("mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }

            if (stationItems?.[currentIndex]) {
              updateCurrentStation(stationItems[currentIndex]);
            } else if (lastStationName) {
              // Оновлюємо інфо якщо немає елементів списку
              const nameEl = currentStationInfo.querySelector(".station-name");
              if (nameEl) nameEl.textContent = lastStationName;
            }
          } catch (error) {
            if (error.name === 'AbortError') return;
            console.log("Play attempt failed:", error.message);
            updateWaveVisualizer(false);
            playPauseBtn.classList.remove("playing");
            if ("mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "paused";
            }
            if (attemptsLeft > 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
              await attemptPlay(attemptsLeft - 1);
            } else {
              errorCount++;
              if (errorCount >= ERROR_LIMIT) resetStationInfo();
            }
          } finally {
            streamAbortController = null;
          }
        };

        await attemptPlay(retryCount);
      } finally {
        isAutoPlayPending = false;
        streamAbortController = null;
      }
    }
    function collapseSearchPanel(keepChips) {
      searchPanelOpen = false;
      const fields = document.getElementById("searchFields");
      const bar = document.getElementById("searchToggleBar");
      if (fields) fields.hidden = true;
      if (searchInput) searchInput.classList.remove("is-expanded");
      if (bar) bar.setAttribute("aria-expanded", "false");
      updateSearchToggleLabel();
    }
    function expandSearchPanel() {
      searchPanelOpen = true;
      const fields = document.getElementById("searchFields");
      const bar = document.getElementById("searchToggleBar");
      if (fields) fields.hidden = false;
      if (searchInput) searchInput.classList.add("is-expanded");
      if (bar) bar.setAttribute("aria-expanded", "true");
    }
    function updateSearchToggleLabel() {
      const lab = document.getElementById("searchToggleLabel");
      if (!lab) return;
      const q = (searchQuery && searchQuery.value || "").trim();
      const c = (searchCountry && searchCountry.value || "").trim();
      const g = (searchGenre && searchGenre.value || "").trim();
      const parts = [q, c, g].filter(Boolean);
      lab.textContent = parts.length ? parts.join(" · ") : "Пошук…";
      const chips = document.getElementById("searchChips");
      if (chips) {
        if (parts.length) {
          chips.hidden = false;
          chips.innerHTML = parts.map(function (p) {
            return "<button type='button' class='search-chip'>" + p.replace(/</g, "&lt;") + "</button>";
          }).join("");
          chips.querySelectorAll(".search-chip").forEach(function (btn) {
            btn.addEventListener("click", function () { expandSearchPanel(); });
          });
        } else {
          chips.hidden = true;
          chips.innerHTML = "";
        }
      }
    }

    function switchTab(tab) {
      /* SEARCH_RETAP: повторний тап Search = чиста форма */
      if (tab === "search" && currentTab === "search") {
        try {
          if (searchQuery) searchQuery.value = "";
          if (searchCountry) searchCountry.value = "";
          if (searchGenre) searchGenre.value = "";
          expandSearchPanel();
          updateSearchToggleLabel();
          if (stationList) {
            stationList.innerHTML = "<div class='station-item empty'>Введіть запит і натисніть Знайти</div>";
            stationItems = [];
          }
        } catch (e) {}
        return;
      }

      const validTabs = ["best", "techno", "trance", "ukraine", "pop", "search", ...customTabs];
      if (!validTabs.includes(tab)) tab = "techno";
      
      document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
        btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
      });
      
      if (viewTransitionSupported) {
        document.startViewTransition(() => {
          performTabSwitch(tab);
        });
      } else {
        stationList.classList.add("fade-out");
        setTimeout(() => {
          performTabSwitch(tab);
          stationList.classList.remove("fade-out");
          stationList.classList.add("fade-in");
          setTimeout(() => stationList.classList.remove("fade-in"), 300);
        }, 150);
      }
    }

    function performTabSwitch(tab) {
      currentTab = tab;
      localStorage.setItem("currentTab", tab);
      document.querySelectorAll(".tab-btn").forEach(function (btn) {
        var on = btn.dataset.tab === tab;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });

      const savedIndex = parseInt(localStorage.getItem("lastStation_" + tab), 10) || 0;
      let maxIndex = 0;
      if (tab === "best") {
        maxIndex = favoriteStations.length - 1;
      } else if (tab === "search") {
        maxIndex = 0;
      } else {
        maxIndex = (stationLists[tab] && stationLists[tab].length ? stationLists[tab].length : 1) - 1;
      }
      currentIndex = (savedIndex <= maxIndex && savedIndex >= 0) ? savedIndex : 0;

      if (tab === "search") {
        if (searchInput) {
          searchInput.style.display = "flex";
          searchInput.classList.add("search-open");
        }
        // завжди показуємо 3 поля на вкладці Search
        try {
          if (searchQuery) searchQuery.value = "";
          if (searchCountry) searchCountry.value = "";
          if (searchGenre) searchGenre.value = "";
        } catch (e) {}
        try { expandSearchPanel(); } catch (e) {}
        try { populateSearchSuggestions(); } catch (e) {}
        try { updateSearchToggleLabel(); } catch (e) {}
        if (stationList) {
          stationList.innerHTML = "<div class='station-item empty'>Введіть запит і натисніть Знайти</div>";
          stationItems = [];
        }
        renderTabs();
        syncQueueToNative();
        return;
      }

      if (searchInput) {
        searchInput.style.display = "none";
        searchInput.classList.remove("search-open", "is-expanded");
      }
      updateStationList();
      renderTabs();
      syncQueueToNative();
    }

    // Drag: long-press на рядок → перетягнути (touch-friendly, без ⋮⋮)
    let dragSuppressClick = false;
    let dragActiveItem = null;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragDocBound = false;
    const LONG_PRESS_MS = 450;
    const MOVE_CANCEL_PX = 16;

    function canReorderTab() {
      return ["techno", "trance", "ukraine", "pop", "best", ...customTabs].includes(currentTab);
    }

    function setPageScrollLock(lock) {
      const html = document.documentElement;
      if (lock) {
        html.classList.add("is-reordering");
        document.body.classList.add("is-reordering");
        if (stationList) {
          stationList.classList.add("is-reordering");
          stationList.style.overflowY = "hidden";
        }
      } else {
        html.classList.remove("is-reordering");
        document.body.classList.remove("is-reordering");
        if (stationList) {
          stationList.classList.remove("is-reordering");
          stationList.style.overflowY = "";
        }
      }
    }

    function enableDragMode() {
      dragEnabled = true;
      setPageScrollLock(true);
      bindDocDragListeners(true);
    }

    function disableDragMode() {
      dragEnabled = false;
      dragStartIndex = null;
      dragActiveItem = null;
      dragPointerId = null;
      setPageScrollLock(false);
      bindDocDragListeners(false);
      if (stationItems) {
        stationItems.forEach(item => {
          item.classList.remove("dragging", "drag-over", "long-press");
        });
      }
    }

    function bindDocDragListeners(on) {
      if (on && !dragDocBound) {
        document.addEventListener("pointermove", onDocPointerMove, { passive: false, capture: true });
        document.addEventListener("pointerup", onDocPointerUp, { passive: false, capture: true });
        document.addEventListener("pointercancel", onDocPointerUp, { passive: false, capture: true });
        document.addEventListener("touchmove", onDocTouchMove, { passive: false, capture: true });
        dragDocBound = true;
      } else if (!on && dragDocBound) {
        document.removeEventListener("pointermove", onDocPointerMove, true);
        document.removeEventListener("pointerup", onDocPointerUp, true);
        document.removeEventListener("pointercancel", onDocPointerUp, true);
        document.removeEventListener("touchmove", onDocTouchMove, true);
        dragDocBound = false;
      }
    }

    function onDocTouchMove(e) {
      if (!dragEnabled) return;
      e.preventDefault();
    }

    function onDocPointerMove(e) {
      if (!dragEnabled || e.pointerId !== dragPointerId) return;
      e.preventDefault();
      e.stopPropagation();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el && el.closest ? el.closest(".station-item") : null;
      if (stationItems) {
        stationItems.forEach(i => {
          if (i !== dragActiveItem) i.classList.remove("drag-over");
        });
      }
      if (over && !over.classList.contains("empty") && over !== dragActiveItem) {
        over.classList.add("drag-over");
      }
    }

    function onDocPointerUp(e) {
      if (!dragEnabled || (dragPointerId != null && e.pointerId !== dragPointerId)) return;
      e.preventDefault();
      e.stopPropagation();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const over = el && el.closest ? el.closest(".station-item") : null;
      let endIndex = dragStartIndex;
      if (over && !over.classList.contains("empty")) {
        endIndex = parseInt(over.dataset.index, 10);
      }
      if (stationItems) {
        stationItems.forEach(i => i.classList.remove("dragging", "drag-over", "long-press"));
      }
      const from = dragStartIndex;
      disableDragMode();
      if (from != null && endIndex !== from && !isNaN(endIndex)) {
        reorderStations(from, endIndex);
        provideHapticFeedback();
        showToast("Порядок станцій оновлено!", "success");
      }
      setTimeout(() => { dragSuppressClick = false; }, 100);
    }

    function setupDragAndDrop() {
      if (!canReorderTab() || !stationItems) return;

      stationItems.forEach((item, index) => {
        item.dataset.index = index;
        item.removeEventListener("pointerdown", onItemPointerDown);
        item.removeEventListener("contextmenu", onItemContextMenu);
        item.addEventListener("pointerdown", onItemPointerDown, { passive: true });
        item.addEventListener("contextmenu", onItemContextMenu);
      });
    }

    function onItemContextMenu(e) {
      if (dragEnabled || longPressTimer) e.preventDefault();
    }

    function onItemPointerDown(e) {
      if (!canReorderTab()) return;
      if (e.target.closest(".favorite-btn, .delete-btn, .add-btn, .more-btn")) return;
      if (e.button != null && e.button !== 0) return;

      const item = e.currentTarget;
      if (!item || item.classList.contains("empty")) return;

      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragSuppressClick = false;
      clearTimeout(longPressTimer);

      const startId = e.pointerId;
      const startItem = item;

      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (dragPointerId !== startId) return;
        dragSuppressClick = true;
        dragStartIndex = parseInt(startItem.dataset.index, 10);
        dragActiveItem = startItem;
        enableDragMode();
        startItem.classList.add("dragging", "long-press");
        try { startItem.setPointerCapture(startId); } catch (_) {}
        provideHapticFeedback([80, 40, 80]);
        showToast("Перетягніть на нове місце", "info", 1200);
      }, LONG_PRESS_MS);

      // стежити за рухом ДО long-press (скасувати якщо скрол)
      const preMove = (ev) => {
        if (ev.pointerId !== startId) return;
        if (dragEnabled) {
          cleanupPre();
          return;
        }
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          cleanupPre();
        }
      };
      const preUp = (ev) => {
        if (ev.pointerId !== startId) return;
        clearTimeout(longPressTimer);
        longPressTimer = null;
        cleanupPre();
        if (!dragEnabled) dragPointerId = null;
      };
      const cleanupPre = () => {
        document.removeEventListener("pointermove", preMove, true);
        document.removeEventListener("pointerup", preUp, true);
        document.removeEventListener("pointercancel", preUp, true);
      };
      document.addEventListener("pointermove", preMove, { passive: true, capture: true });
      document.addEventListener("pointerup", preUp, { passive: true, capture: true });
      document.addEventListener("pointercancel", preUp, { passive: true, capture: true });
    }

    function reorderStations(fromIndex, toIndex) {
      if (currentTab === "best") {
        const [movedStation] = favoriteStations.splice(fromIndex, 1);
        favoriteStations.splice(toIndex, 0, movedStation);
        localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
      } else {
        const stations = stationLists[currentTab];
        if (!stations) return;
        
        const [movedStation] = stations.splice(fromIndex, 1);
        stations.splice(toIndex, 0, movedStation);
        
        if (userAddedStations[currentTab]) {
          const userStationIndex = userAddedStations[currentTab].findIndex(s => s.name === movedStation.name);
          if (userStationIndex !== -1) {
            const [movedUserStation] = userAddedStations[currentTab].splice(userStationIndex, 1);
            userAddedStations[currentTab].splice(toIndex, 0, movedUserStation);
          }
        }
        
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
      }
      
      animateStationReorder();
    }

    function animateStationReorder() {
      if (viewTransitionSupported) {
        document.startViewTransition(() => {
          updateStationList();
        });
      } else {
        stationList.classList.add("fade-out");
        setTimeout(() => {
          updateStationList();
          stationList.classList.remove("fade-out");
          stationList.classList.add("fade-in");
          setTimeout(() => stationList.classList.remove("fade-in"), 300);
        }, 150);
      }
    }

    async function loadStations() {
      console.time("loadStations");
      showLoading();
      stationList.innerHTML = "<div class='station-item empty'>Завантаження...</div>";
      try {
        abortController.abort();
        abortController = new AbortController();
        const response = await fetch(`stations.json?t=${Date.now()}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const mergedStationLists = {};
        if (response.ok) {
          const newStations = await response.json();
          Object.keys(newStations).forEach(tab => {
            const uniqueStations = new Map();
            (userAddedStations[tab] || []).forEach(s => {
              if (!deletedStations.includes(s.name)) {
                // Конвертуємо HTTP в HTTPS
                if (s.value) s.value = s.value.replace('http://', 'https://');
                if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
                uniqueStations.set(s.name, s);
              }
            });
            newStations[tab].forEach(s => {
              if (!deletedStations.includes(s.name)) {
                // Конвертуємо HTTP в HTTPS
                if (s.value) s.value = s.value.replace('http://', 'https://');
                if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
                uniqueStations.set(s.name, s);
              }
            });
            mergedStationLists[tab] = Array.from(uniqueStations.values());
          });
        }
        customTabs.forEach(tab => {
          const uniqueStations = new Map();
          (userAddedStations[tab] || []).forEach(s => {
            if (!deletedStations.includes(s.name)) {
              // Конвертуємо HTTP в HTTPS
              if (s.value) s.value = s.value.replace('http://', 'https://');
              if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
              uniqueStations.set(s.name, s);
            }
          });
          (stationLists[tab] || []).forEach(s => {
            if (!deletedStations.includes(s.name)) {
              // Конвертуємо HTTP в HTTPS
              if (s.value) s.value = s.value.replace('http://', 'https://');
              if (s.favicon) s.favicon = s.favicon.replace('http://', 'https://');
              uniqueStations.set(s.name, s);
            }
          });
          mergedStationLists[tab] = Array.from(uniqueStations.values());
        });
        stationLists = mergedStationLists;
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        favoriteStations = favoriteStations.filter(name => 
          Object.values(stationLists).flat().some(s => s.name === name)
        );
        localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
        const validTabs = [...Object.keys(stationLists), "best", "search", ...customTabs];
        if (!validTabs.includes(currentTab)) {
          currentTab = validTabs[0] || "techno";
          localStorage.setItem("currentTab", currentTab);
        }
        currentIndex = parseInt(localStorage.getItem(`lastStation_${currentTab}`)) || 0;
        showToast("Станції успішно завантажено!", "success");
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Error loading stations:", error);
          stationList.innerHTML = "<div class='station-item empty'>Не вдалося завантажити станції</div>";
          showToast("Не вдалося завантажити станції", "error");
        }
      } finally {
        console.timeEnd("loadStations");
        hideLoading();
      }
    }

    function updateStationList() {
      if (!stationList) return;
      let stations = currentTab === "best"
        ? favoriteStations
            .map(name => Object.values(stationLists).flat().find(s => s.name === name))
            .filter(s => s)
        : stationLists[currentTab] || [];

      if (!stations.length) {
        currentIndex = 0;
        stationItems = [];
        stationList.innerHTML = `<div class="station-item empty">${currentTab === "best" ? "Немає улюблених станцій" : "Немає станцій у цій категорії"}</div>`;
        return;
      }

      const fragment = document.createDocumentFragment();
      stations.forEach((station, index) => {
        const item = document.createElement("div");
        item.className = `station-item ${index === currentIndex ? "selected" : ""}`;
        item.dataset.value = station.value;
        item.dataset.name = station.name;
        item.dataset.genre = shortenGenre(station.genre);
        item.dataset.country = station.country;
        item.dataset.favicon = station.favicon && isValidUrl(station.favicon) ? station.favicon.replace('http://', 'https://') : "";
        item.dataset.index = index;
        item.setAttribute("draggable", "false");
        item.setAttribute("role", "listitem");
        item.style.setProperty('--item-index', index);
        
        const iconHtml = item.dataset.favicon 
          ? `<img data-src="${item.dataset.favicon}" alt="${station.name} icon" style="width: 32px; height: 32px; object-fit: contain; margin-right: 10px;" onerror="this.outerHTML='🎵 ';">` 
          : "🎵 ";
        
        const deleteButton = ["techno", "trance", "ukraine", "pop", ...customTabs].includes(currentTab)
          ? `<button class="delete-btn" aria-label="Видалити станцію">🗑</button>`
          : "";
        
        // Порядок: довге натискання на рядок (без кнопки ⋮⋮)
        item.innerHTML = `
          ${iconHtml}
          <span class="station-name">${station.name}</span>
          <div class="buttons-container">
            ${deleteButton}
            <button class="favorite-btn${favoriteStations.includes(station.name) ? " favorited" : ""}" aria-label="${favoriteStations.includes(station.name) ? "Видалити з улюблених" : "Додати до улюблених"}">★</button>
          </div>`;
        fragment.appendChild(item);
      });
      
      stationList.innerHTML = "";
      stationList.appendChild(fragment);
      stationItems = stationList.querySelectorAll(".station-item");

      // Налаштовуємо lazy loading для зображень
      stationItems.forEach(item => {
        const img = item.querySelector('img');
        if (img) {
          lazyLoadObserver.observe(img);
        }
      });

      setupDragAndDrop();

      if (stationItems.length && stationItems[currentIndex] && !stationItems[currentIndex].classList.contains("empty")) {
        stationItems[currentIndex].scrollIntoView({ behavior: "smooth", block: "center" });
      }

      stationList.onclick = e => {
        const item = e.target.closest(".station-item");
        const favoriteBtn = e.target.closest(".favorite-btn");
        const deleteBtn = e.target.closest(".delete-btn");
        
        if (dragSuppressClick || dragEnabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (item && !item.classList.contains("empty") && !e.target.closest(".favorite-btn, .delete-btn")) {
          e.preventDefault();
          currentIndex = Array.from(stationItems).indexOf(item);
          changeStation(currentIndex);
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

    function toggleFavorite(stationName) {
      if (favoriteStations.includes(stationName)) {
        favoriteStations = favoriteStations.filter(name => name !== stationName);
        showToast(`Видалено з улюблених`, "info");
      } else {
        favoriteStations.unshift(stationName);
        showToast(`Додано до улюблених`, "success");
      }
      localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
      if (currentTab === "best") switchTab("best");
      else updateStationList();
    }

    function deleteStation(stationName) {
      if (Array.isArray(stationLists[currentTab])) {
        const station = stationLists[currentTab].find(s => s.name === stationName);
        if (!station) return;
        
        stationLists[currentTab] = stationLists[currentTab].filter(s => s.name !== stationName);
        userAddedStations[currentTab] = userAddedStations[currentTab]?.filter(s => s.name !== stationName) || [];
        
        if (!station.isFromSearch && !deletedStations.includes(stationName)) {
          if (!Array.isArray(deletedStations)) deletedStations = [];
          deletedStations.push(stationName);
          localStorage.setItem("deletedStations", JSON.stringify(deletedStations));
        }
        
        localStorage.setItem("stationLists", JSON.stringify(stationLists));
        localStorage.setItem("userAddedStations", JSON.stringify(userAddedStations));
        favoriteStations = favoriteStations.filter(name => name !== stationName);
        localStorage.setItem("favoriteStations", JSON.stringify(favoriteStations));
        
        if (stationLists[currentTab].length === 0) {
          currentIndex = 0;
        } else if (currentIndex >= stationLists[currentTab].length) {
          currentIndex = stationLists[currentTab].length - 1;
        }
        switchTab(currentTab);
        showToast(`Станцію видалено`, "info");
      }
    }

    function changeStation(index) {
      if (!stationItems || index < 0 || index >= stationItems.length || stationItems[index].classList.contains("empty")) return;
      const item = stationItems[index];
      stationItems.forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      currentIndex = index;
      
      // Зберігаємо останню станцію для автозапуску
      lastStationUrl = item.dataset.value;
      lastStationName = item.dataset.name;
      localStorage.setItem("lastStationUrl", lastStationUrl);
      localStorage.setItem("lastStationName", lastStationName);
      nativeSaveStation(lastStationUrl, lastStationName);
      localStorage.setItem(`lastStation_${currentTab}`, index);
      syncQueueToNative();
      
      // Анімація затемнення при зміні треку
      currentStationInfo.classList.add("fade-out");
      setTimeout(() => {
        updateCurrentStation(item);
        currentStationInfo.classList.remove("fade-out");
        currentStationInfo.classList.add("fade-in");
        setTimeout(() => currentStationInfo.classList.remove("fade-in"), 300);
      }, 150);
      
      if (intendedPlaying) {
        const normalizedCurrentUrl = normalizeUrl(item.dataset.value);
        const normalizedAudioSrc = normalizeUrl(audio.src);
        if (normalizedAudioSrc !== normalizedCurrentUrl || audio.paused || audio.error || audio.readyState < 2) {
          isAutoPlayPending = false;
          debouncedTryAutoPlay(4, 700);
        }
      }
    }

    function updateCurrentStation(item) {
      if (!currentStationInfo || !item.dataset) {
        resetStationInfo();
        return;
      }
      const stationNameElement = currentStationInfo.querySelector(".station-name");
      const stationGenreElement = currentStationInfo.querySelector(".station-genre");
      const stationCountryElement = currentStationInfo.querySelector(".station-country");
      const stationIconElement = currentStationInfo.querySelector(".station-icon");
      const currentTrackElement = document.getElementById("currentTrack");

      if (stationNameElement) stationNameElement.textContent = item.dataset.name || "";
      if (stationGenreElement) stationGenreElement.textContent = `жанр: ${item.dataset.genre || ""}`;
      if (stationCountryElement) stationCountryElement.textContent = `країна: ${item.dataset.country || ""}`;
      
      if (stationIconElement) {
        if (item.dataset.favicon && isValidUrl(item.dataset.favicon)) {
          stationIconElement.innerHTML = "";
          stationIconElement.style.backgroundImage = `url(${item.dataset.favicon})`;
          stationIconElement.style.backgroundSize = "contain";
          stationIconElement.style.backgroundRepeat = "no-repeat";
          stationIconElement.style.backgroundPosition = "center";
        } else {
          stationIconElement.innerHTML = "🎵";
          stationIconElement.style.backgroundImage = "none";
        }
      }

      if (currentTrackElement) {
        currentTrackElement.textContent = "🎵 Трек: завантаження...";
        currentTrackElement.classList.add("loading");
      }
      
      stopMetadataStreaming();
      
      if (isPlaying) {
        fetchTrackMetadata(item.dataset.value, item.dataset.name);
      }

      // ===== СИЛЬНА MEDIA SESSION (PWA) =====
      if ("mediaSession" in navigator && !isNativeApp()) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.dataset.name || lastStationName || "Radio S O",
          artist: `${item.dataset.genre || ""} | ${item.dataset.country || ""}`,
          album: "Radio Music S O",
          artwork: item.dataset.favicon && isValidUrl(item.dataset.favicon) ? [
            { src: item.dataset.favicon, sizes: "96x96", type: "image/png" },
            { src: item.dataset.favicon, sizes: "128x128", type: "image/png" },
            { src: item.dataset.favicon, sizes: "192x192", type: "image/png" },
            { src: item.dataset.favicon, sizes: "256x256", type: "image/png" },
            { src: item.dataset.favicon, sizes: "384x384", type: "image/png" },
            { src: item.dataset.favicon, sizes: "512x512", type: "image/png" }
          ] : []
        });
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      }
    }

    function prevStation() {
      if (!stationItems?.length) return;
      currentIndex = currentIndex > 0 ? currentIndex - 1 : stationItems.length - 1;
      if (stationItems[currentIndex].classList.contains("empty")) currentIndex = 0;
      changeStation(currentIndex);
      provideHapticFeedback();
    }

    function nextStation() {
      if (!stationItems?.length) return;
      currentIndex = currentIndex < stationItems.length - 1 ? currentIndex + 1 : 0;
      if (stationItems[currentIndex].classList.contains("empty")) currentIndex = 0;
      changeStation(currentIndex);
      provideHapticFeedback();
    }

    function togglePlayPause() {
      if (!playPauseBtn || !audio) return;
      
      const shouldPlay = isNativeApp() ? !isPlaying : audio.paused;

      if (shouldPlay) {
        isPlaying = true;
        intendedPlaying = true;
        localStorage.setItem("isPlaying", "true");
        localStorage.setItem("intendedPlaying", "true"); nativeSetPlaying(true);
        debouncedTryAutoPlay(4, 600);
        playPauseBtn.textContent = "⏸";
        playPauseBtn.setAttribute("aria-label", "Пауза");
        playPauseBtn.classList.add("playing");
        updateWaveVisualizer(true);
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      } else {
        // ===== ВАЖЛИВО: тільки pause(), src НЕ скидаємо =====
        if (isNativeApp()) {
          nativePause();
        } else {
          audio.pause();
        }
        isPlaying = false;
        intendedPlaying = false;
        localStorage.setItem("isPlaying", "false");
        localStorage.setItem("intendedPlaying", "false");
        nativeSetPlaying(false); nativeSetPlaying(false);
        playPauseBtn.textContent = "▶";
        playPauseBtn.setAttribute("aria-label", "Грати");
        playPauseBtn.classList.remove("playing");
        updateWaveVisualizer(false);
        stopMetadataStreaming();
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
        const currentTrackElement = document.getElementById("currentTrack");
        if (currentTrackElement) {
          currentTrackElement.textContent = "🎵 Трек: невідомо";
          currentTrackElement.classList.remove("loading", "marquee");
        }
      }
    }

    // ===== ПОСИЛЕНІ ОБРОБНИКИ ДЛЯ АВТО / BLUETOOTH =====
    const eventListeners = {
      keydown: e => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          prevStation();
          provideHapticFeedback();
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          nextStation();
          provideHapticFeedback();
        }
        if (e.key === " ") {
          e.preventDefault();
          togglePlayPause();
          provideHapticFeedback();
        }
        if (e.key === "Escape" && dragEnabled) {
          disableDragMode();
          showToast("Режим перетягування вимкнено", "info");
        }
      },
      visibilitychange: () => {
        if (!document.hidden) {
          if (isNativeApp()) {
            nativeGetPlaybackState().then(function (st) {
              if (st) applyNativePlaybackState(st);
            });
          } else if (intendedPlaying) {
            isAutoPlayPending = false;
            debouncedTryAutoPlay(4, 700);
          }
        }
      },
      pageshow: (e) => {
        // pageshow спрацьовує і при bfcache, і при звичайному показі
        if (intendedPlaying) {
          isAutoPlayPending = false;
          setTimeout(() => debouncedTryAutoPlay(4, 800), 300);
        }
      },
      focus: () => {
        if (isNativeApp()) {
          nativeGetPlaybackState().then(function (st) {
            if (st) applyNativePlaybackState(st);
          });
        } else if (intendedPlaying && (audio.paused || audio.error)) {
          isAutoPlayPending = false;
          debouncedTryAutoPlay(3, 600);
        }
      },
      resume: () => {
        if (isNativeApp()) {
          nativeGetPlaybackState().then(function (st) {
            if (st) applyNativePlaybackState(st);
          });
        } else if (intendedPlaying) {
          isAutoPlayPending = false;
          debouncedTryAutoPlay(4, 700);
        }
      }
    };

    
    window.addEventListener("media-next", () => {
      nextStation();
    });
    window.addEventListener("media-prev", () => {
      prevStation();
    });
    // Нативка вже змінила потік — лише підсвітити індекс у списку
    window.addEventListener("media-next-sync", () => {
      // Native вже змінив потік — підтягнути стан з prefs (надійніше за index++)
      if (isNativeApp()) {
        nativeGetPlaybackState().then(function (st) {
          if (st && applyNativePlaybackState(st)) return;
          // fallback: локальний index++
          if (!stationItems || !stationItems.length) return;
          currentIndex = currentIndex < stationItems.length - 1 ? currentIndex + 1 : 0;
          if (stationItems[currentIndex]) {
            stationItems.forEach(i => i.classList.remove("selected"));
            stationItems[currentIndex].classList.add("selected");
            lastStationUrl = stationItems[currentIndex].dataset.value;
            lastStationName = stationItems[currentIndex].dataset.name;
            localStorage.setItem("lastStationUrl", lastStationUrl);
            localStorage.setItem("lastStationName", lastStationName);
            updateCurrentStation(stationItems[currentIndex]);
            isPlaying = true; intendedPlaying = true;
            if (playPauseBtn) { playPauseBtn.textContent = "⏸"; playPauseBtn.classList.add("playing"); }
            updateWaveVisualizer(true);
          }
        });
        return;
      }
      if (!stationItems || !stationItems.length) return;
      currentIndex = currentIndex < stationItems.length - 1 ? currentIndex + 1 : 0;
      if (stationItems[currentIndex]) {
        stationItems.forEach(i => i.classList.remove("selected"));
        stationItems[currentIndex].classList.add("selected");
        lastStationUrl = stationItems[currentIndex].dataset.value;
        lastStationName = stationItems[currentIndex].dataset.name;
        localStorage.setItem("lastStationUrl", lastStationUrl);
        localStorage.setItem("lastStationName", lastStationName);
        updateCurrentStation(stationItems[currentIndex]);
        isPlaying = true; intendedPlaying = true;
        if (playPauseBtn) { playPauseBtn.textContent = "⏸"; playPauseBtn.classList.add("playing"); }
        updateWaveVisualizer(true);
      }
    });
    window.addEventListener("media-prev-sync", () => {
      if (isNativeApp()) {
        nativeGetPlaybackState().then(function (st) {
          if (st && applyNativePlaybackState(st)) return;
          if (!stationItems || !stationItems.length) return;
          currentIndex = currentIndex > 0 ? currentIndex - 1 : stationItems.length - 1;
          if (stationItems[currentIndex]) {
            stationItems.forEach(i => i.classList.remove("selected"));
            stationItems[currentIndex].classList.add("selected");
            lastStationUrl = stationItems[currentIndex].dataset.value;
            lastStationName = stationItems[currentIndex].dataset.name;
            localStorage.setItem("lastStationUrl", lastStationUrl);
            localStorage.setItem("lastStationName", lastStationName);
            updateCurrentStation(stationItems[currentIndex]);
            isPlaying = true; intendedPlaying = true;
            if (playPauseBtn) { playPauseBtn.textContent = "⏸"; playPauseBtn.classList.add("playing"); }
            updateWaveVisualizer(true);
          }
        });
        return;
      }
      if (!stationItems || !stationItems.length) return;
      currentIndex = currentIndex > 0 ? currentIndex - 1 : stationItems.length - 1;
      if (stationItems[currentIndex]) {
        stationItems.forEach(i => i.classList.remove("selected"));
        stationItems[currentIndex].classList.add("selected");
        lastStationUrl = stationItems[currentIndex].dataset.value;
        lastStationName = stationItems[currentIndex].dataset.name;
        localStorage.setItem("lastStationUrl", lastStationUrl);
        localStorage.setItem("lastStationName", lastStationName);
        updateCurrentStation(stationItems[currentIndex]);
        isPlaying = true; intendedPlaying = true;
        if (playPauseBtn) { playPauseBtn.textContent = "⏸"; playPauseBtn.classList.add("playing"); }
        updateWaveVisualizer(true);
      }
    });

    window.addEventListener("track-meta", (ev) => {
      try {
        const title = (ev && ev.detail && ev.detail.title) ? String(ev.detail.title).trim() : "";
        if (!title) return;
        // не показувати якщо це просто назва станції
        if (lastStationName && title.toLowerCase() === String(lastStationName).toLowerCase()) return;
        if (typeof updateTrackDisplay === "function") {
          updateTrackDisplay(title);
        } else {
          const el = document.getElementById("currentTrack");
          if (el) {
            el.classList.remove("loading");
            el.textContent = "🎵 " + title;
            el.title = title;
          }
        }
      } catch (e) { console.log("track-meta", e); }
    });

    window.addEventListener("bt-autoplay", () => {
      intendedPlaying = true;
      isPlaying = true;
      localStorage.setItem("intendedPlaying", "true");
      localStorage.setItem("isPlaying", "true");
      nativeSetPlaying(true);
      // Native service вже стартує по BT — не викликаємо nativePlay знову
      if (playPauseBtn) {
        playPauseBtn.textContent = "⏸";
        playPauseBtn.classList.add("playing");
      }
      updateWaveVisualizer(true);
      if (lastStationName) {
        const nameEl = currentStationInfo && currentStationInfo.querySelector(".station-name");
        if (nameEl) nameEl.textContent = lastStationName;
      }
    });

    function addEventListeners() {
      document.addEventListener("keydown", eventListeners.keydown);
      document.addEventListener("visibilitychange", eventListeners.visibilitychange);
      window.addEventListener("pageshow", eventListeners.pageshow);
      window.addEventListener("focus", eventListeners.focus);
      document.addEventListener("resume", eventListeners.resume);
    }

    function removeEventListeners() {
      document.removeEventListener("keydown", eventListeners.keydown);
      document.removeEventListener("visibilitychange", eventListeners.visibilitychange);
      window.removeEventListener("pageshow", eventListeners.pageshow);
      window.removeEventListener("focus", eventListeners.focus);
      document.removeEventListener("resume", eventListeners.resume);
    }

    audio.addEventListener("playing", () => {
      isPlaying = true;
      intendedPlaying = true;
      playPauseBtn.textContent = "⏸";
      playPauseBtn.setAttribute("aria-label", "Пауза");
      playPauseBtn.classList.add("playing");
      updateWaveVisualizer(true);
      localStorage.setItem("isPlaying", "true");
      localStorage.setItem("intendedPlaying", "true"); nativeSetPlaying(true);
      if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
      }
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      if (stationItems && stationItems[currentIndex]) {
        fetchTrackMetadata(stationItems[currentIndex].dataset.value, stationItems[currentIndex].dataset.name);
      }
    });

    audio.addEventListener("pause", () => {
      isPlaying = false;
      playPauseBtn.textContent = "▶";
      playPauseBtn.setAttribute("aria-label", "Грати");
      playPauseBtn.classList.remove("playing");
      updateWaveVisualizer(false);
      localStorage.setItem("isPlaying", "false");
      // intendedPlaying НЕ скидаємо тут — це дозволяє системі resume через Bluetooth
      stopMetadataStreaming();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      const currentTrackElement = document.getElementById("currentTrack");
      if (currentTrackElement) {
        currentTrackElement.textContent = "🎵 Трек: невідомо";
        currentTrackElement.classList.remove("loading", "marquee");
      }
    });

    audio.addEventListener("error", () => {
      updateWaveVisualizer(false);
      playPauseBtn.classList.remove("playing");
      stopMetadataStreaming();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      const currentTrackElement = document.getElementById("currentTrack");
      if (currentTrackElement) {
        currentTrackElement.textContent = "🎵 Трек: помилка";
        currentTrackElement.classList.remove("loading", "marquee");
      }
      if (intendedPlaying && errorCount < ERROR_LIMIT && !errorTimeout) {
        errorCount++;
        errorTimeout = setTimeout(() => {
          debouncedTryAutoPlay(3, 1000);
          errorTimeout = null;
        }, 1200);
      } else if (errorCount >= ERROR_LIMIT) {
        resetStationInfo();
      }
    });

    audio.addEventListener("volumechange", () => {
      localStorage.setItem("volume", audio.volume);
    });

    audio.addEventListener("loadedmetadata", () => {
      // Не робимо нічого, метадані отримуємо через fetchTrackMetadata
    });

    window.addEventListener("online", () => {
      showToast("Мережу відновлено", "success");
      if (intendedPlaying) {
        isAutoPlayPending = false;
        debouncedTryAutoPlay(4, 700);
      }
    });

    window.addEventListener("offline", () => {
      showToast("З'єднання з мережею втрачено", "error");
      updateWaveVisualizer(false);
      playPauseBtn.classList.remove("playing");
      errorCount = 0;
      stopMetadataStreaming();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    });

    addEventListeners();

    window.addEventListener("beforeunload", () => {
      removeEventListeners();
      stopMetadataStreaming();
    });

    // ===== Media Session web — лише PWA; у нативці керує ExoPlayer =====
    if ("mediaSession" in navigator && !isNativeApp()) {
      // Play — ОС Android часто викликає саме це при підключенні Bluetooth
      navigator.mediaSession.setActionHandler("play", () => {
        console.log("MediaSession: play action received (Bluetooth / system)");
        intendedPlaying = true;
        localStorage.setItem("intendedPlaying", "true"); nativeSetPlaying(true);
        isAutoPlayPending = false;
        debouncedTryAutoPlay(5, 500);
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        console.log("MediaSession: pause action received");
        if (isNativeApp()) {
          nativePause();
        } else if (!audio.paused) {
          audio.pause();
        }
        isPlaying = false;
        // Не скидаємо intendedPlaying повністю — щоб можна було resume
        // Але якщо користувач навмисно натиснув паузу через систему — скидаємо
        intendedPlaying = false;
        localStorage.setItem("isPlaying", "false");
        localStorage.setItem("intendedPlaying", "false"); nativeSetPlaying(false);
        playPauseBtn.textContent = "▶";
        playPauseBtn.classList.remove("playing");
        updateWaveVisualizer(false);
        navigator.mediaSession.playbackState = "paused";
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        prevStation();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        nextStation();
      });

      navigator.mediaSession.setActionHandler("stop", () => {
        if (isNativeApp()) nativeStop();
        else audio.pause();
        isPlaying = false;
        intendedPlaying = false;
        nativeSetPlaying(false);
        localStorage.setItem("isPlaying", "false");
        localStorage.setItem("intendedPlaying", "false"); nativeSetPlaying(false);
        navigator.mediaSession.playbackState = "none";
      });
    }

    applyTheme(currentTheme);
  }
});

/* NP_SHEET_ONLY */
(function () {
  function refreshNowPlaying() {
    var nameEl = document.querySelector("#currentStationInfo .station-name");
    var genreEl = document.querySelector("#currentStationInfo .station-genre");
    var countryEl = document.querySelector("#currentStationInfo .station-country");
    var trackEl = document.getElementById("currentTrack");
    var statusEl = document.getElementById("playbackStatus");
    var iconBtn = document.getElementById("stationIconBtn");
    var npName = document.getElementById("npName");
    var npGenre = document.getElementById("npGenre");
    var npCountry = document.getElementById("npCountry");
    var npTrack = document.getElementById("npTrack");
    var npStatus = document.getElementById("npStatus");
    var npArt = document.getElementById("npArt");
    var npPlay = document.getElementById("npPlay");
    if (npName) npName.textContent = (nameEl && nameEl.textContent) || (typeof lastStationName !== "undefined" ? lastStationName : "—") || "—";
    if (npGenre) npGenre.textContent = (genreEl && genreEl.textContent) || "жанр: —";
    if (npCountry) npCountry.textContent = (countryEl && countryEl.textContent) || "країна: —";
    if (npTrack) npTrack.textContent = (trackEl && trackEl.textContent) || "🎵 Трек: невідомо";
    if (npStatus) npStatus.textContent = (statusEl && statusEl.textContent) || "";
    if (npArt && iconBtn) {
      var bg = iconBtn.style.backgroundImage;
      if (bg && bg.indexOf("url") !== -1) {
        npArt.style.backgroundImage = bg;
        npArt.textContent = "";
      } else {
        npArt.style.backgroundImage = "";
        npArt.textContent = "🎵";
      }
    }
    if (npPlay) {
      var playing = typeof isPlaying !== "undefined" && isPlaying;
      npPlay.textContent = playing ? "⏸" : "▶";
      npPlay.classList.toggle("is-playing", !!playing);
    }
  }
  function openNP() {
    var sheet = document.getElementById("nowPlayingSheet");
    if (!sheet) return;
    refreshNowPlaying();
    sheet.hidden = false;
  }
  function closeNP() {
    var sheet = document.getElementById("nowPlayingSheet");
    if (sheet) sheet.hidden = true;
  }
  function bind() {
    var icon = document.getElementById("stationIconBtn");
    if (icon && !icon._npBound) {
      icon._npBound = true;
      icon.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openNP();
      });
    }
    var c = document.getElementById("npClose");
    var b = document.getElementById("npBackdrop");
    if (c && !c._npBound) { c._npBound = true; c.addEventListener("click", closeNP); }
    if (b && !b._npBound) { b._npBound = true; b.addEventListener("click", closeNP); }
    function wire(id, sel) {
      var el = document.getElementById(id);
      if (!el || el._npBound) return;
      el._npBound = true;
      el.addEventListener("click", function () {
        var btn = document.querySelector(sel);
        if (btn) btn.click();
        setTimeout(refreshNowPlaying, 250);
      });
    }
    wire("npPrev", ".controls .control-btn:nth-child(1)");
    wire("npPlay", ".controls .control-btn:nth-child(2)");
    wire("npNext", ".controls .control-btn:nth-child(3)");
    window.addEventListener("native-playback", refreshNowPlaying);
    window.addEventListener("track-meta", refreshNowPlaying);
    window.addEventListener("native-status", refreshNowPlaying);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
  setTimeout(bind, 500);
})();
