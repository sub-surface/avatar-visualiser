/**
 * album-manager.js — multi-track album playlist and continuous visualizer state engine.
 *
 * Implements $O(1)$ memory streaming data structures, bespoke per-track parameter snapshots,
 * and deterministic tracklist overlay and transition timing curves.
 */
import { P } from '../../params.js';
import { cloneProject, createDefaultProject } from '../../project-schema.js';

let _trackIdCounter = 1;

/**
 * Format seconds into mm:ss string.
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Calculate overlay opacity for the tracklist.
 * Displays at the head (~4.4s) and tail (~4.4s) of each track, and fades out during the meat.
 *
 * @param {number} t - Current playback time in track (seconds)
 * @param {number} duration - Total duration of the track (seconds)
 * @returns {number} Alpha between 0.0 and 1.0
 */
export function calculateTracklistAlpha(t, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(t)) return 0;

  // For short interludes/tracks (< 8.8s), stay visible throughout with brief edge tapers
  if (duration <= 8.8) {
    if (t < 0.5) return Math.max(0, Math.min(1, t / 0.5));
    if (t > duration - 0.5) return Math.max(0, Math.min(1, (duration - t) / 0.5));
    return 1;
  }

  const headIn = 0.8;
  const headHold = 3.6;
  const headOut = 4.4;

  const tailStart = duration - 4.4;
  const tailHold = duration - 3.6;

  // Head window: fade in (0 -> 0.8s), hold (0.8s -> 3.6s), fade out (3.6s -> 4.4s)
  if (t < headIn) {
    return Math.max(0, Math.min(1, t / headIn));
  }
  if (t < headHold) {
    return 1;
  }
  if (t < headOut) {
    return Math.max(0, Math.min(1, 1 - (t - headHold) / (headOut - headHold)));
  }

  // Tail window: fade in (T-4.4s -> T-3.6s), hold (T-3.6s -> T)
  if (t >= tailStart && t < tailHold) {
    return Math.max(0, Math.min(1, (t - tailStart) / (tailHold - tailStart)));
  }
  if (t >= tailHold) {
    return 1;
  }

  return 0;
}

/**
 * Calculate subtle VHS tape transition head-switch / tracking surge at track boundaries.
 *
 * @param {number} t - Current playback time in track (seconds)
 * @param {number} duration - Total duration of the track (seconds)
 * @param {number} windowSec - Transition window in seconds (default 0.6s)
 * @returns {number} Normalized glitch intensity [0, 1]
 */
export function calculateTransitionGlitch(t, duration, windowSec = 0.6) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(t)) return 0;

  // End of track glitch surge
  if (t >= duration - windowSec) {
    const progress = (t - (duration - windowSec)) / windowSec;
    // Bell curve easing peaking near boundary
    return Math.sin(progress * Math.PI * 0.95);
  }

  // Start of track head-switch settling (first 0.3s)
  const headSettleSec = windowSec * 0.5;
  if (t <= headSettleSec) {
    const progress = t / headSettleSec;
    return Math.sin((1 - progress) * (Math.PI * 0.5));
  }

  return 0;
}

/**
 * Parses file name into artist and title.
 * e.g. "01. Aphex Twin - Alberto Balsalm.wav" -> { artist: "Aphex Twin", title: "Alberto Balsalm" }
 */
export function parseTrackFilename(filename = '') {
  const clean = filename.replace(/\.[^.]+$/, '').replace(/^[0-9]+[.\-_\s]+/, '').trim();
  const dashMatch = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }
  return {
    artist: '',
    title: clean,
  };
}

export class AlbumManager {
  constructor() {
    this.tracks = [];
    this.activeTrackIndex = -1;
    this.isPlayingContinuous = false;
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      try { listener(this); } catch (e) { console.error('AlbumManager listener error:', e); }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('avatar-album-updated', { detail: { count: this.tracks.length } }));
    }
  }

  hasTracks() {
    return this.tracks.length > 0;
  }

  getActiveTrack() {
    if (this.activeTrackIndex >= 0 && this.activeTrackIndex < this.tracks.length) {
      return this.tracks[this.activeTrackIndex];
    }
    return null;
  }

  /**
   * Add an audio track with its own cloned bespoke project configuration.
   *
   * @param {File|Blob|Object} fileOrMeta
   * @param {number} [duration=0]
   * @param {Object} [bespokeConfig=null]
   * @returns {Object} track object
   */
  addTrack(fileOrMeta, duration = 0, bespokeConfig = null) {
    const isFile = fileOrMeta instanceof Blob;
    const filename = isFile ? fileOrMeta.name : (fileOrMeta?.name || fileOrMeta?.title || 'Untitled Track');
    const parsed = parseTrackFilename(filename);

    const title = fileOrMeta?.title || parsed.title || 'Untitled Track';
    const artist = fileOrMeta?.artist || parsed.artist || '';
    const bpm = fileOrMeta?.bpm || (P.bpm ? P.bpm : 120);

    // Deep clone the configuration for parameter isolation
    const config = cloneProject(bespokeConfig || P);
    config.title = title;
    config.artist = artist;
    config.bpm = bpm;

    const track = {
      id: `track-${Date.now()}-${_trackIdCounter++}`,
      file: isFile ? fileOrMeta : null,
      filename,
      title,
      artist,
      bpm,
      duration: Math.max(0, duration || fileOrMeta?.duration || 0),
      projectConfig: config,
    };

    this.tracks.push(track);
    if (this.activeTrackIndex === -1) {
      this.activeTrackIndex = 0;
    }
    this.notify();
    return track;
  }

  /**
   * Update metadata or duration of an existing track.
   */
  updateTrack(id, updates = {}) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return null;

    if (updates.duration !== undefined) track.duration = Math.max(0, Number(updates.duration) || 0);
    if (updates.title !== undefined) {
      track.title = String(updates.title);
      track.projectConfig.title = track.title;
    }
    if (updates.artist !== undefined) {
      track.artist = String(updates.artist);
      track.projectConfig.artist = track.artist;
    }
    if (updates.bpm !== undefined) {
      track.bpm = Number(updates.bpm) || 120;
      track.projectConfig.bpm = track.bpm;
    }
    if (updates.file) track.file = updates.file;
    if (updates.projectConfig) track.projectConfig = cloneProject(updates.projectConfig);

    this.notify();
    return track;
  }

  removeTrack(id) {
    const index = this.tracks.findIndex((t) => t.id === id);
    if (index === -1) return;

    this.tracks.splice(index, 1);
    if (this.tracks.length === 0) {
      this.activeTrackIndex = -1;
    } else if (this.activeTrackIndex >= this.tracks.length) {
      this.activeTrackIndex = this.tracks.length - 1;
    } else if (this.activeTrackIndex === index) {
      // Retain current index pointing to next track
    }
    this.notify();
  }

  reorderTrack(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.tracks.length) return;
    if (toIndex < 0 || toIndex >= this.tracks.length) return;
    if (fromIndex === toIndex) return;

    const [moved] = this.tracks.splice(fromIndex, 1);
    this.tracks.splice(toIndex, 0, moved);

    if (this.activeTrackIndex === fromIndex) {
      this.activeTrackIndex = toIndex;
    } else if (fromIndex < this.activeTrackIndex && toIndex >= this.activeTrackIndex) {
      this.activeTrackIndex--;
    } else if (fromIndex > this.activeTrackIndex && toIndex <= this.activeTrackIndex) {
      this.activeTrackIndex++;
    }
    this.notify();
  }

  /**
   * Save current deck parameters into currently active track snapshot.
   */
  flushActiveSnapshot(currentP = P) {
    const active = this.getActiveTrack();
    if (active) {
      active.projectConfig = cloneProject(currentP);
    }
  }

  /**
   * Select a track index to be active in the studio deck.
   * Flushes current parameters to previous track before switching.
   */
  selectTrack(index, currentP = P) {
    if (index < 0 || index >= this.tracks.length) return null;
    this.flushActiveSnapshot(currentP);
    this.activeTrackIndex = index;
    const nextTrack = this.tracks[index];
    this.notify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('avatar-track-switched', { detail: { track: nextTrack, index } }));
    }
    return nextTrack;
  }

  clear() {
    this.tracks = [];
    this.activeTrackIndex = -1;
    this.isPlayingContinuous = false;
    this.notify();
  }

  getTotalDuration() {
    return this.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  }

  /**
   * Given continuous total playback time across the album, find the active track,
   * local track time, and transition parameters.
   */
  getTrackAtTime(totalTime) {
    if (this.tracks.length === 0) return null;

    let accumulated = 0;
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      const dur = track.duration || 0;
      if (totalTime < accumulated + dur || i === this.tracks.length - 1) {
        const trackTime = Math.max(0, totalTime - accumulated);
        const transitionGlitch = calculateTransitionGlitch(trackTime, dur);
        const tracklistAlpha = calculateTracklistAlpha(trackTime, dur);
        return {
          track,
          trackIndex: i,
          trackTime,
          trackDuration: dur,
          isTransitioning: transitionGlitch > 0.05,
          transitionGlitch,
          tracklistAlpha,
        };
      }
      accumulated += dur;
    }
    return null;
  }
}

export const albumManager = new AlbumManager();
