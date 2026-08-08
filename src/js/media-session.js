/**
 * Media Session Module - Integration with MediaSession API
 */

let metadata = null;
let isMetadataSet = false;

// ===== Update Media Session =====

export function updateMediaSession(station) {
  if (!station || !('mediaSession' in navigator)) return;

  const artwork = getArtwork(station);

  metadata = new MediaMetadata({
    title: station.name || 'Unknown Station',
    artist: station.genre || 'Radio',
    album: station.country || 'Worldwide',
    artwork: artwork
  });

  navigator.mediaSession.metadata = metadata;
  isMetadataSet = true;

  // Set position state if we had duration
  try {
    if (navigator.mediaSession.setPositionState) {
      navigator.mediaSession.setPositionState({
        duration: 0,
        playbackRate: 1,
        position: 0
      });
    }
  } catch (e) {
    // Ignore
  }
}

// ===== Clear Media Session =====

export function clearMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    isMetadataSet = false;
  }
}

// ===== Update Playback State =====

export function setPlaybackState(state) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state;
  }
}

// ===== Get Artwork =====

function getArtwork(station) {
  const artwork = [];
  const sizes = [96, 128, 192, 256, 384, 512];
  
  if (station.favicon && station.favicon.startsWith('http')) {
    for (const size of sizes) {
      artwork.push({
        src: station.favicon,
        sizes: `${size}x${size}`,
        type: 'image/png'
      });
    }
  } else {
    // Fallback: use emoji as icon (not supported by MediaSession)
    // We'll just use a default icon
    for (const size of sizes) {
      artwork.push({
        src: '/icon-192.png',
        sizes: `${size}x${size}`,
        type: 'image/png'
      });
    }
  }

  return artwork;
}

// ===== Set Action Handlers =====

export function setupMediaSessionHandlers(handlers) {
  if (!('mediaSession' in navigator)) return;

  const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'stop'];
  
  for (const action of actions) {
    if (handlers[action]) {
      try {
        navigator.mediaSession.setActionHandler(action, handlers[action]);
      } catch (e) {
        // Some browsers may not support all actions
        console.debug(`MediaSession action "${action}" not supported`);
      }
    }
  }

  // Additional actions (supported in some browsers)
  const extraActions = ['seekbackward', 'seekforward', 'seekto'];
  for (const action of extraActions) {
    if (handlers[action]) {
      try {
        navigator.mediaSession.setActionHandler(action, handlers[action]);
      } catch (e) {
        // Ignore
      }
    }
  }
}

// ===== Check Support =====

export function isMediaSessionSupported() {
  return 'mediaSession' in navigator;
}