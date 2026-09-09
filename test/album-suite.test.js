import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlbumManager,
  calculateTracklistAlpha,
  calculateTransitionGlitch,
  parseTrackFilename,
  formatDuration,
} from '../src/playlist/album-manager.js';
import { PARAM_SCHEMA, createDefaultProject, sanitizeProject } from '../project-schema.js';
import { drawTracklistOverlay, canBypassComposite } from '../overlay.js';

describe('Album Playlist & Continuous Visualizer Suite', () => {
  let manager;

  beforeEach(() => {
    manager = new AlbumManager();
  });

  describe('AlbumManager Track Operations & Isolation', () => {
    it('initializes with empty playlist', () => {
      expect(manager.tracks.length).toBe(0);
      expect(manager.activeTrackIndex).toBe(-1);
      expect(manager.hasTracks()).toBe(false);
      expect(manager.getActiveTrack()).toBeNull();
      expect(manager.getTotalDuration()).toBe(0);
    });

    it('adds tracks with automatic filename parsing and isolated snapshots', () => {
      const track1 = manager.addTrack({ name: '01 - MØRVIDD - Crystal Cacophony.wav' }, 180);
      expect(manager.tracks.length).toBe(1);
      expect(manager.activeTrackIndex).toBe(0);
      expect(track1.title).toBe('Crystal Cacophony');
      expect(track1.artist).toBe('MØRVIDD');
      expect(track1.duration).toBe(180);

      const track2 = manager.addTrack({ name: 'Sub-Surface Echo.mp3' }, 210);
      expect(manager.tracks.length).toBe(2);
      expect(track2.title).toBe('Sub-Surface Echo');
      expect(track2.artist).toBe('');
      expect(track2.duration).toBe(210);

      // Verify bespoke parameter isolation
      track1.projectConfig.colorA = '#ff0000';
      track1.projectConfig.skyboxPreset = 'neon-grid';
      track2.projectConfig.colorA = '#00ff00';
      track2.projectConfig.skyboxPreset = 'sgi-slate';

      expect(track1.projectConfig.colorA).toBe('#ff0000');
      expect(track2.projectConfig.colorA).toBe('#00ff00');
      expect(track1.projectConfig.skyboxPreset).toBe('neon-grid');
      expect(track2.projectConfig.skyboxPreset).toBe('sgi-slate');
    });

    it('reorders tracks and maintains correct activeTrackIndex', () => {
      const t1 = manager.addTrack({ title: 'Track 1' }, 100);
      const t2 = manager.addTrack({ title: 'Track 2' }, 200);
      const t3 = manager.addTrack({ title: 'Track 3' }, 300);

      manager.selectTrack(0);
      expect(manager.activeTrackIndex).toBe(0);

      // Move Track 1 to index 2
      manager.reorderTrack(0, 2);
      expect(manager.tracks[0].title).toBe('Track 2');
      expect(manager.tracks[1].title).toBe('Track 3');
      expect(manager.tracks[2].title).toBe('Track 1');
      expect(manager.activeTrackIndex).toBe(2); // Still points to Track 1
    });

    it('removes tracks cleanly', () => {
      const t1 = manager.addTrack({ title: 'Track 1' }, 100);
      const t2 = manager.addTrack({ title: 'Track 2' }, 200);

      manager.removeTrack(t1.id);
      expect(manager.tracks.length).toBe(1);
      expect(manager.tracks[0].title).toBe('Track 2');
      expect(manager.activeTrackIndex).toBe(0);

      manager.removeTrack(t2.id);
      expect(manager.tracks.length).toBe(0);
      expect(manager.activeTrackIndex).toBe(-1);
    });

    it('computes total album duration', () => {
      manager.addTrack({ title: 'T1' }, 120);
      manager.addTrack({ title: 'T2' }, 180.5);
      manager.addTrack({ title: 'T3' }, 60);
      expect(manager.getTotalDuration()).toBeCloseTo(360.5);
    });

    it('maps aggregate album time to local track time via getTrackAtTime', () => {
      manager.addTrack({ title: 'Track 1' }, 100);
      manager.addTrack({ title: 'Track 2' }, 150);
      manager.addTrack({ title: 'Track 3' }, 80);

      // At total time 50s -> in Track 1, trackTime = 50
      const loc1 = manager.getTrackAtTime(50);
      expect(loc1.trackIndex).toBe(0);
      expect(loc1.track.title).toBe('Track 1');
      expect(loc1.trackTime).toBe(50);

      // At total time 120s -> in Track 2, trackTime = 20
      const loc2 = manager.getTrackAtTime(120);
      expect(loc2.trackIndex).toBe(1);
      expect(loc2.track.title).toBe('Track 2');
      expect(loc2.trackTime).toBe(20);

      // At total time 260s -> in Track 3, trackTime = 10
      const loc3 = manager.getTrackAtTime(260);
      expect(loc3.trackIndex).toBe(2);
      expect(loc3.track.title).toBe('Track 3');
      expect(loc3.trackTime).toBe(10);
    });
  });

  describe('Tracklist Alpha Fade Curve', () => {
    it('fades in at start, holds, and fades out during meat of track', () => {
      const dur = 180;

      // Start: t = 0
      expect(calculateTracklistAlpha(0, dur)).toBe(0);

      // Fade-in ramp: t = 0.4s
      expect(calculateTracklistAlpha(0.4, dur)).toBeCloseTo(0.5, 2);

      // Full hold: t = 1.0s to 3.5s
      expect(calculateTracklistAlpha(0.8, dur)).toBe(1.0);
      expect(calculateTracklistAlpha(2.0, dur)).toBe(1.0);
      expect(calculateTracklistAlpha(3.6, dur)).toBe(1.0);

      // Fade-out ramp: t = 4.0s
      expect(calculateTracklistAlpha(4.0, dur)).toBeCloseTo(0.5, 2);

      // Meat of track: t = 5s to 175s
      expect(calculateTracklistAlpha(4.4, dur)).toBe(0);
      expect(calculateTracklistAlpha(30, dur)).toBe(0);
      expect(calculateTracklistAlpha(90, dur)).toBe(0);
      expect(calculateTracklistAlpha(175, dur)).toBe(0);

      // Tail fade-in ramp: T - 4.0s
      expect(calculateTracklistAlpha(176.0, dur)).toBeCloseTo(0.5, 2);

      // Tail full hold: T - 3.6s to T
      expect(calculateTracklistAlpha(176.4, dur)).toBe(1.0);
      expect(calculateTracklistAlpha(179.0, dur)).toBe(1.0);
      expect(calculateTracklistAlpha(180.0, dur)).toBe(1.0);
    });

    it('handles short tracks gracefully without dipping to zero', () => {
      const shortDur = 5.0;
      expect(calculateTracklistAlpha(0.25, shortDur)).toBeCloseTo(0.5, 2);
      expect(calculateTracklistAlpha(2.5, shortDur)).toBe(1.0);
      expect(calculateTracklistAlpha(4.75, shortDur)).toBeCloseTo(0.5, 2);
    });
  });

  describe('Subtle Transition Glitch Timing', () => {
    it('produces glitch surge at track tail boundary and settling at head', () => {
      const dur = 120;
      const windowSec = 0.6;

      // Middle of track: zero glitch
      expect(calculateTransitionGlitch(50, dur, windowSec)).toBe(0);

      // End of track glitch surge: within last 0.6s
      const tailGlitch = calculateTransitionGlitch(119.7, dur, windowSec);
      expect(tailGlitch).toBeGreaterThan(0.5);

      // Head of track settling: within first 0.3s
      const headGlitch = calculateTransitionGlitch(0.05, dur, windowSec);
      expect(headGlitch).toBeGreaterThan(0.5);
      expect(calculateTransitionGlitch(0.5, dur, windowSec)).toBe(0);
    });
  });

  describe('Project Schema & Export Choice Integration', () => {
    it('supports albumTracklistStyle in PARAM_SCHEMA with vcr-osd, minimal, off', () => {
      expect(PARAM_SCHEMA.albumTracklistStyle).toBeDefined();
      expect(PARAM_SCHEMA.albumTracklistStyle.values).toEqual(['vcr-osd', 'minimal', 'off']);
      expect(PARAM_SCHEMA.albumTracklistStyle.default).toBe('vcr-osd');
    });

    it('sanitizes albumTracklistStyle cleanly', () => {
      const def = createDefaultProject();
      expect(def.albumTracklistStyle).toBe('vcr-osd');

      const { project: p1 } = sanitizeProject({ albumTracklistStyle: 'minimal' });
      expect(p1.albumTracklistStyle).toBe('minimal');

      const { project: p2 } = sanitizeProject({ albumTracklistStyle: 'off' });
      expect(p2.albumTracklistStyle).toBe('off');

      const { project: p3, warnings } = sanitizeProject({ albumTracklistStyle: 'invalid_mode' });
      expect(p3.albumTracklistStyle).toBe('vcr-osd');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Filename & Duration Formatters', () => {
    it('parses standard artist - title filenames', () => {
      expect(parseTrackFilename('Boards of Canada - Dayvan Cowboy.flac')).toEqual({
        artist: 'Boards of Canada',
        title: 'Dayvan Cowboy',
      });
      expect(parseTrackFilename('02. Tycho - Awake.mp3')).toEqual({
        artist: 'Tycho',
        title: 'Awake',
      });
      expect(parseTrackFilename('Solaris.wav')).toEqual({
        artist: '',
        title: 'Solaris',
      });
    });

    it('formats durations correctly into mm:ss', () => {
      expect(formatDuration(0)).toBe('00:00');
      expect(formatDuration(65)).toBe('01:05');
      expect(formatDuration(3599)).toBe('59:59');
    });
  });

  describe('Tracklist Overlay Canvas Rendering Safety', () => {
    it('executes drawTracklistOverlay without throwing on mock context', () => {
      const mockCtx = {
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        roundRect: () => {},
      };

      const tracks = [
        { title: 'Alpha Track', duration: 180 },
        { title: 'Beta Track', duration: 240 },
      ];

      // Test vcr-osd style at t=2s (alpha=1)
      expect(() => {
        drawTracklistOverlay(mockCtx, tracks, 0, 2.0, 180, 'vcr-osd', 1920, 1080);
      }).not.toThrow();

      // Test minimal style at t=2s
      expect(() => {
        drawTracklistOverlay(mockCtx, tracks, 1, 2.0, 240, 'minimal', 1920, 1080);
      }).not.toThrow();

      // Test off style
      expect(() => {
        drawTracklistOverlay(mockCtx, tracks, 0, 2.0, 180, 'off', 1920, 1080);
      }).not.toThrow();
    });
  });

  describe('Export Pipeline Optimizations & Direct WebGL Bypass', () => {
    it('determines when direct WebGL VideoFrame bypass is safe', () => {
      // 1. Full bypass when title card is off, OSD is off, and no album overlay
      const cleanMeta = {
        titleCard: 'off',
        vhsOsd: false,
        artist: 'Test Artist',
        title: 'Test Track',
      };
      expect(canBypassComposite(cleanMeta, 10, 180, null)).toBe(true);

      // 2. Bypass disabled when VHS OSD is active
      const osdMeta = { ...cleanMeta, vhsOsd: true };
      expect(canBypassComposite(osdMeta, 10, 180, null)).toBe(false);

      // 3. Bypass disabled when title card is visible (e.g. top mode with artist/title)
      const titleMeta = { ...cleanMeta, titleCard: 'top' };
      expect(canBypassComposite(titleMeta, 10, 180, null)).toBe(false);

      // 4. In album mode, bypass during the meat of the track (t = 30s) when tracklist alpha = 0
      const albumState = {
        tracks: [{ title: 'Track 1' }, { title: 'Track 2' }],
        style: 'vcr-osd',
      };
      // At t=30s in a 180s track, calculateTracklistAlpha is 0, so bypass is safe!
      expect(canBypassComposite(cleanMeta, 30, 180, albumState)).toBe(true);

      // At t=1.0s (fade window), tracklist is visible, so bypass is disabled (compositing required)
      expect(canBypassComposite(cleanMeta, 1.0, 180, albumState)).toBe(false);

      // When album tracklist style is 'off', bypass is safe even during head/tail
      const albumStateOff = {
        tracks: [{ title: 'Track 1' }, { title: 'Track 2' }],
        style: 'off',
      };
      expect(canBypassComposite(cleanMeta, 1.0, 180, albumStateOff)).toBe(true);
    });
  });
});
