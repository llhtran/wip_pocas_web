const INTRO_MUSIC_SOURCES = [
  '/media/sounds/music/intro-post/0.mp3',
  '/media/sounds/music/intro-post/1.mp3',
  '/media/sounds/music/intro-post/2.mp3'
];
const INTRO_MUSIC_FADE_DURATION_MS = 10000;
const INTRO_MUSIC_FORCE_FADE_DURATION_MS = 5000;
const AMBIENT_TRACK_SOURCE = '/media/sounds/music/ambient-post/0.mp3';
const AMBIENT_FADE_DURATION_MS = 5000;
const AMBIENT_TARGET_VOLUME = 0.5;
const AMBIENT_RESTART_DELAY_MS = 30000;
const SONG_TRACK_SOURCES = [
  '/media/sounds/music/tracks-post/0.mp3',
  '/media/sounds/music/tracks-post/1.mp3',
  '/media/sounds/music/tracks-post/2.mp3',
  '/media/sounds/music/tracks-post/3.mp3',
  '/media/sounds/music/tracks-post/4.mp3'
];
const SONG_CROSSFADE_DURATION_MS = 15000;
const SONG_INITIAL_DELAY_MS = 10000;

let introMusicAudio = null;
let introMusicHasPlayed = false;
let introMusicFadeOutTimeoutId = null;

let ambientAudio = null;
let ambientLoopActive = false;
let ambientFadeTimeoutId = null;
let ambientRestartDelayTimeoutId = null;

let songPlaylistQueue = [];
let songLoopActive = false;
let currentSongAudio = null;
let nextSongAudio = null;
let songCrossfadeTimeoutId = null;
let songCrossfadeInProgress = false;
let songInitialDelayTimeoutId = null;

function shuffleArray(list) {
  const array = list.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createAudioElement(source) {
  const audio = new Audio(source);
  audio.preload = 'auto';
  audio.loop = false;
  audio.volume = 0;
  return audio;
}

function whenAudioDurationReady(audio, callback) {
  if (!audio || typeof callback !== 'function') return;
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    callback(audio.duration);
    return;
  }
  const handler = () => {
    audio.removeEventListener('loadedmetadata', handler);
    callback(audio.duration);
  };
  audio.addEventListener('loadedmetadata', handler, { once: true });
}

function pickRandomIntroTrack() {
  if (!INTRO_MUSIC_SOURCES.length) return null;
  const index = Math.floor(Math.random() * INTRO_MUSIC_SOURCES.length);
  return INTRO_MUSIC_SOURCES[index];
}

function fadeAudioVolume(audio, targetVolume, durationMs) {
  return new Promise((resolve) => {
    if (!audio) {
      resolve();
      return;
    }
    const clampedTarget = Math.min(1, Math.max(0, targetVolume));
    const startVolume = audio.volume;
    const delta = clampedTarget - startVolume;
    if (durationMs <= 0 || delta === 0) {
      audio.volume = clampedTarget;
      resolve();
      return;
    }
    const hasPerformance = typeof performance !== 'undefined' && performance.now;
    const startTime = hasPerformance ? performance.now() : Date.now();

    function step(timestamp) {
      const now = timestamp ?? (hasPerformance ? performance.now() : Date.now());
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      audio.volume = Math.min(1, Math.max(0, startVolume + delta * progress));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

function cleanupIntroMusic() {
  if (introMusicFadeOutTimeoutId) {
    clearTimeout(introMusicFadeOutTimeoutId);
    introMusicFadeOutTimeoutId = null;
  }
  introMusicAudio = null;
}

function scheduleIntroMusicFadeOut(audio) {
  if (!audio) return;
  if (introMusicFadeOutTimeoutId) {
    clearTimeout(introMusicFadeOutTimeoutId);
    introMusicFadeOutTimeoutId = null;
  }

  const duration = Number(audio.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    audio.addEventListener(
      'loadedmetadata',
      () => {
        scheduleIntroMusicFadeOut(audio);
      },
      { once: true }
    );
    return;
  }

  const fadeSeconds = INTRO_MUSIC_FADE_DURATION_MS / 1000;
  const fadeDelayMs = Math.max((duration - fadeSeconds) * 1000, 0);
  introMusicFadeOutTimeoutId = setTimeout(() => {
    fadeAudioVolume(audio, 0, INTRO_MUSIC_FADE_DURATION_MS).finally(() => {
      audio.pause();
      cleanupIntroMusic();
    });
  }, fadeDelayMs);
}

function getAmbientAudio() {
  if (!ambientAudio) {
    ambientAudio = createAudioElement(AMBIENT_TRACK_SOURCE);
  }
  return ambientAudio;
}

function scheduleAmbientFade(audio) {
  if (!ambientLoopActive || !audio) return;
  if (ambientFadeTimeoutId) {
    clearTimeout(ambientFadeTimeoutId);
    ambientFadeTimeoutId = null;
  }

  whenAudioDurationReady(audio, (duration) => {
    if (!ambientLoopActive || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const delayMs = Math.max(duration * 1000 - AMBIENT_FADE_DURATION_MS, 0);
    ambientFadeTimeoutId = setTimeout(() => {
      ambientFadeTimeoutId = null;
      fadeAudioVolume(audio, 0, AMBIENT_FADE_DURATION_MS).finally(() => {
        audio.pause();
        audio.currentTime = 0;
        if (!ambientLoopActive) {
          return;
        }
        if (ambientRestartDelayTimeoutId) {
          clearTimeout(ambientRestartDelayTimeoutId);
          ambientRestartDelayTimeoutId = null;
        }
        ambientRestartDelayTimeoutId = setTimeout(() => {
          ambientRestartDelayTimeoutId = null;
          startAmbientPlayback();
        }, AMBIENT_RESTART_DELAY_MS);
      });
    }, delayMs);
  });
}

function startAmbientPlayback() {
  if (!ambientLoopActive) return;
  const audio = getAmbientAudio();
  if (!audio) return;

  audio.currentTime = 0;
  audio.volume = 0;

  audio
    .play()
    .then(() => {
      fadeAudioVolume(audio, AMBIENT_TARGET_VOLUME, AMBIENT_FADE_DURATION_MS);
      scheduleAmbientFade(audio);
    })
    .catch((error) => {
      console.warn('Unable to start ambient music.', error);
      ambientLoopActive = false;
    });
}

function refillSongPlaylistQueue() {
  songPlaylistQueue = shuffleArray(SONG_TRACK_SOURCES.slice());
}

function getNextSongSource() {
  if (!SONG_TRACK_SOURCES.length) return null;
  if (!songPlaylistQueue.length) {
    refillSongPlaylistQueue();
  }
  return songPlaylistQueue.shift() || null;
}

function scheduleSongCrossfade(audio) {
  if (!songLoopActive || !audio) return;
  if (songCrossfadeTimeoutId) {
    clearTimeout(songCrossfadeTimeoutId);
    songCrossfadeTimeoutId = null;
  }
  whenAudioDurationReady(audio, (duration) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const fadeSeconds = SONG_CROSSFADE_DURATION_MS / 1000;
    const delayMs = Math.max((duration - fadeSeconds) * 1000, 0);
    songCrossfadeTimeoutId = setTimeout(() => {
      crossfadeToNextSong();
    }, delayMs);
  });
}

function handleSongEnded() {
  if (!songLoopActive) return;
  crossfadeToNextSong();
}

function crossfadeToNextSong() {
  if (!songLoopActive || songCrossfadeInProgress) return;
  const outgoing = currentSongAudio;
  const source = getNextSongSource();
  if (!source) return;

  if (songCrossfadeTimeoutId) {
    clearTimeout(songCrossfadeTimeoutId);
    songCrossfadeTimeoutId = null;
  }

  songCrossfadeInProgress = true;
  const incoming = createAudioElement(source);
  nextSongAudio = incoming;
  incoming.addEventListener('ended', handleSongEnded);

  incoming
    .play()
    .then(() => {
      fadeAudioVolume(incoming, 1, SONG_CROSSFADE_DURATION_MS);
      if (outgoing) {
        fadeAudioVolume(outgoing, 0, SONG_CROSSFADE_DURATION_MS).finally(() => {
          outgoing.pause();
          outgoing.currentTime = 0;
          outgoing.removeEventListener('ended', handleSongEnded);
        });
      }
      currentSongAudio = incoming;
      nextSongAudio = null;
      songCrossfadeInProgress = false;
      scheduleSongCrossfade(incoming);
    })
    .catch((error) => {
      console.warn('Unable to play next song track.', error);
      songCrossfadeInProgress = false;
    });
}

export function playIntroMusicOnce() {
  if (introMusicHasPlayed) return;

  const source = pickRandomIntroTrack();
  if (!source) return;

  introMusicHasPlayed = true;
  const audio = new Audio(source);
  introMusicAudio = audio;
  audio.preload = 'auto';
  audio.loop = false;
  audio.volume = 0;

  audio.addEventListener(
    'ended',
    () => {
      cleanupIntroMusic();
    },
    { once: true }
  );

  audio
    .play()
    .then(() => {
      fadeAudioVolume(audio, 1, INTRO_MUSIC_FADE_DURATION_MS);
      scheduleIntroMusicFadeOut(audio);
    })
    .catch((error) => {
      console.warn('Unable to start intro music.', error);
      cleanupIntroMusic();
      introMusicHasPlayed = false;
    });
}

export function fadeOutIntroMusicNow() {
  if (!introMusicAudio || introMusicAudio.paused) return;
  if (introMusicFadeOutTimeoutId) {
    clearTimeout(introMusicFadeOutTimeoutId);
    introMusicFadeOutTimeoutId = null;
  }
  const targetAudio = introMusicAudio;
  fadeAudioVolume(targetAudio, 0, INTRO_MUSIC_FORCE_FADE_DURATION_MS).finally(() => {
    targetAudio.pause();
    cleanupIntroMusic();
  });
}

export function startAmbientLoop() {
  if (ambientLoopActive || !AMBIENT_TRACK_SOURCE) return;
  ambientLoopActive = true;
  startAmbientPlayback();
}

export function startSongPlaylistLoop() {
  if (songLoopActive || !SONG_TRACK_SOURCES.length) return;
  const source = getNextSongSource();
  if (!source) return;

  songLoopActive = true;
  currentSongAudio = createAudioElement(source);
  currentSongAudio.addEventListener('ended', handleSongEnded);

  songInitialDelayTimeoutId = setTimeout(() => {
    currentSongAudio
      .play()
      .then(() => {
        fadeAudioVolume(currentSongAudio, 1, SONG_CROSSFADE_DURATION_MS);
        scheduleSongCrossfade(currentSongAudio);
      })
      .catch((error) => {
        console.warn('Unable to start song playlist.', error);
        songLoopActive = false;
      })
      .finally(() => {
        songInitialDelayTimeoutId = null;
      });
  }, SONG_INITIAL_DELAY_MS);
}

