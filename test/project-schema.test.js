import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  createDefaultProject,
  sanitizeProject,
} from '../project-schema.js';

describe('project schema', () => {
  it('creates an internally valid default project', () => {
    const project = createDefaultProject();
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.bpm).toBe(120);
    expect(project.cameraShot).toBe('auto');
    expect(project.cameraAnchor.dist).toBeGreaterThan(0);
  });

  it('clamps hostile numeric config values', () => {
    const { project, warnings } = sanitizeProject({
      rows: 10_000_000,
      complexity: 'not-a-number',
      lookFeedback: 50,
    });
    expect(project.rows).toBe(160);
    expect(project.complexity).toBe(4);
    expect(project.lookFeedback).toBe(0.98);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('restores persisted waveform and BPM values', () => {
    const { project } = sanitizeProject({
      bpm: '174',
      lfoWaveform: 'triangle',
      lfo2Waveform: 'square',
    });
    expect(project.bpm).toBe(174);
    expect(project.lfoWaveform).toBe('triangle');
    expect(project.lfo2Waveform).toBe('square');
  });

  it('treats a partial saved project as defaults rather than corruption', () => {
    const { project, warnings } = sanitizeProject({ fastBoot: true });
    expect(project.fastBoot).toBe(true);
    expect(project.rows).toBe(60);
    expect(warnings).toEqual([]);
  });

  it('migrates a legacy camera group into one manual anchor', () => {
    const { project, warnings } = sanitizeProject({
      camStyles: [
        { id: 'first', az: 0, el: 10, dist: 8, lookY: 0 },
        { id: 'second', az: 90, el: 20, dist: 12, lookY: 1 },
      ],
      camGroups: [{ name: 'pair', presets: [1, 0] }],
      exportCamGroupIdx: 0,
    });
    expect(project.cameraShot).toBe('manual');
    expect(project.cameraAnchor).toEqual({ az: 90, el: 20, dist: 12, lookY: 1 });
    expect(warnings).toContain('camera presets migrated to a manual anchor');
  });

  it('clamps a hostile manual camera anchor', () => {
    const { project } = sanitizeProject({
      cameraShot: 'manual',
      cameraAnchor: { az: 9999, el: -500, dist: 0, lookY: 500 },
    });
    expect(project.cameraAnchor).toEqual({ az: 720, el: -89, dist: 0.25, lookY: 20 });
  });

  it('validates track identity fields and exportTitleCard option', () => {
    const { project } = sanitizeProject({
      title: 'Okinawa',
      artist: 'MØRVIDD',
      genre: 'Ambient Jungle',
      exportTitleCard: 'bottom',
    });
    expect(project.title).toBe('Okinawa');
    expect(project.artist).toBe('MØRVIDD');
    expect(project.genre).toBe('Ambient Jungle');
    expect(project.exportTitleCard).toBe('bottom');

    const invalid = sanitizeProject({ exportTitleCard: 'unsupported' });
    expect(invalid.project.exportTitleCard).toBe('top');
  });
});
