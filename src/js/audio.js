/**
 * Audio Module - Core audio playback engine
 */

import { getVolume, setVolume } from './storage.js';
import { updateMediaSession, clearMediaSession } from './media-session.js';

let audio = null;
let currentStation = null;
let isPlaying = false;
let isMuted = false;
let volume = 0.9;
let retryCount = 0;
let maxRetries = 5;
let retryTimeout = null;
let reconnectTimeout = null;
let isReconnecting = false;

// Event listeners
let listeners = {
  onPlay: [],
  onPause: [],
  onError: [],
  onTrackChange: [],
  onBuffering: [],
  onReady: [],
  onEnded: []
};

// ===== Initialize =====

export function initAudio() {
  if (audio) return audio;
  
  audio = document.getElementById('audioPlayer');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audioPlayer';
    audio.preload = 'metadata';
    document.body.appendChild(audio);
  }

  volume = getVolume();
  audio.volume = volume;

  // Bind events
  audio.addEventListener('play', () => handlePlay());
  audio.addEventListener('pause', () => handlePause());
  audio.addEventListener('error', (e) => handleError(e));
  audio.addEventListener('waiting', () => handleBuffering(true));
  audio.addEventListener('canplay', () => handleBuffering(false));
  audio.addEventListener('playing', () => handleReady());
  audio.addEventListener('ended', () => handleEnded());
  audio.addEventListener('volumechange', () => {
    if (!isMuted) {
      volume = audio.volume;
      setVolume(volume);
    }
  });

  // Handle audio focus
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => play());
    navigator.mediaSession.setActionHandler('pause', () => pause());
  }

  return audio;
}

// ===== Play / Pause =====

export function play(station = null) {
  if (!audio) initAudio();

  if (station) {
    currentStation = station;
    const url = station.value || station.url;
    if (!url) {
      emit('onError', new Error('No stream URL'));
      return false;
    }

    // Clear any pending reconnect
    clearRetry();

    // Pause current playback
    audio.pause();
    audio.src = null;
    audio.load();

    // Set new source
    const secureUrl = url.replace('http://', 'https://');
    audio.src = secureUrl + '?t=' + Date.now();
    audio.load();
  }

  if (!audio.src) {
    emit('onError', new Error('No audio source'));
    return false;
  }

  // Check if already playing the same source
  if (!audio.paused && audio.currentTime > 0) {
    return true;
  }

  const playPromise = audio.play();
  
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isPlaying = true;
        retryCount = 0;
        updateMediaSession(currentStation);
        emit('onPlay', currentStation);
      })
      .catch((error) => {
        console.warn('Playback failed:', error);
        handlePlayError(error);
      });
  }

  return true;
}

export function pause() {
  if (!audio) return;
  
  audio.pause();
  isPlaying = false;
  clearRetry();
  emit('onPause');
}

export function togglePlay(station = null) {
  if (isPlaying) {
    pause();
  } else {
    play(station);
  }
}

export function stop() {
  if (!audio) return;
  
  audio.pause();
  audio.currentTime = 0;
  audio.src = null;
  audio.load();
  isPlaying = false;
  currentStation = null;
  clearRetry();
  clearMediaSession();
  emit('onPause');
}

// ===== Volume =====

export function setVolumeLevel(value) {
  volume = Math.max(0, Math.min(1, value));
  if (!isMuted) {
    audio.volume = volume;
  }
  setVolume(volume);
  emit('onVolumeChange', volume);
  return volume;
}

export function getVolumeLevel() {
  return volume;
}

export function toggleMute() {
  isMuted = !isMuted;
  if (isMuted) {
    audio.volume = 0;
  } else {
    audio.volume = volume;
  }
  emit('onMuteToggle', isMuted);
  return isMuted;
}

export function isAudioMuted() {
  return isMuted;
}

// ===== Status =====

export function isAudioPlaying() {
  return isPlaying && !audio?.paused;
}

export function getCurrentStationInfo() {
  return currentStation;
}

export function getAudioElement() {
  return audio;
}

// ===== Error Handling =====

function handlePlayError(error) {
  if (error.name === 'AbortError' || error.name === 'NotAllowedError') {
    return;
  }

  retryCount++;
  emit('onError', error);

  if (retryCount < maxRetries) {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    emit('onBuffering', true);
    
    clearRetry();
    retryTimeout = setTimeout(() => {
      if (currentStation && !isReconnecting) {
        isReconnecting = true;
        play(currentStation);
        setTimeout(() => { isReconnecting = false; }, 500);
      }
    }, delay);
  } else {
    retryCount = 0;
    emit('onError', new Error('Max retries reached'));
    stop();
  }
}

function handleError(e) {
  if (audio?.error) {
    const error = new Error(`Audio error: ${audio.error.message || 'Unknown'}`);
    handlePlayError(error);
  }
}

function clearRetry() {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

// ===== Event Handlers =====

function handlePlay() {
  isPlaying = true;
  retryCount = 0;
  emit('onPlay', currentStation);
}

function handlePause() {
  isPlaying = false;
  emit('onPause');
}

function handleBuffering(isBuffering) {
  emit('onBuffering', isBuffering);
}

function handleReady() {
  emit('onReady');
}

function handleEnded() {
  emit('onEnded');
  // Auto-advance to next station
  emit('onTrackChange', 'next');
}

// ===== Event System =====

function emit(event, data) {
  if (listeners[event]) {
    for (const fn of listeners[event]) {
      try {
        fn(data);
      } catch (e) {
        console.warn(`Error in ${event} listener:`, e);
      }
    }
  }
}

export function on(event, callback) {
  if (listeners[event]) {
    listeners[event].push(callback);
  }
  return () => {
    listeners[event] = listeners[event].filter(fn => fn !== callback);
  };
}

// ===== Cleanup =====

export function cleanup() {
  clearRetry();
  if (audio) {
    audio.pause();
    audio.src = null;
    audio.load();
  }
  listeners = {
    onPlay: [],
    onPause: [],
    onError: [],
    onTrackChange: [],
    onBuffering: [],
    onReady: [],
    onEnded: []
  };
}