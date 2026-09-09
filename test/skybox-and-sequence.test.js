import { describe, expect, it } from 'vitest';
import { SKYBOX_PRESETS, SkyboxManager } from '../src/look/skybox.js';
import { SCENE_DEFINITIONS, DEFAULT_SEQUENCE } from '../src/ui/sequence-modal.js';
import { createVinylRecord } from '../src/objects/VinylRecord.js';
import { createDefaultProject, sanitizeProject } from '../project-schema.js';

describe('skybox presets & atmospheric lighting', () => {
  it('registers all curated skybox atmospheres with valid lighting configs', () => {
    expect(SKYBOX_PRESETS.length).toBeGreaterThanOrEqual(7);
    const ids = SKYBOX_PRESETS.map((p) => p.id);
    expect(ids).toContain('void');
    expect(ids).toContain('neon-grid');
    expect(ids).toContain('sunset-90s');
    expect(ids).toContain('deep-space');
    expect(ids).toContain('sgi-slate');
    expect(ids).toContain('cyber-green');
    expect(ids).toContain('custom');

    for (const preset of SKYBOX_PRESETS) {
      expect(typeof preset.ambientColor).toBe('number');
      expect(preset.ambientIntensity).toBeGreaterThan(0);
      expect(typeof preset.dirColor).toBe('number');
      expect(preset.dirIntensity).toBeGreaterThan(0);
    }
  });

  it('sanitizes skybox preset selection and light tone scaling', () => {
    const { project } = sanitizeProject({
      skyboxPreset: 'neon-grid',
      skyboxLightTone: 2.5,
    });
    expect(project.skyboxPreset).toBe('neon-grid');
    expect(project.skyboxLightTone).toBe(2.5);

    // Hostile values clamp / fallback
    const { project: clamped } = sanitizeProject({
      skyboxPreset: 'invalid-skybox',
      skyboxLightTone: 999,
    });
    expect(clamped.skyboxPreset).toBe('void');
    expect(clamped.skyboxLightTone).toBe(3.0);
  });

  it('adapts void skybox background and atmospheric lighting in light mode', () => {
    const manager = new SkyboxManager();
    const mockScene = { background: null };
    const mockLights = {
      ambientLight: { color: { setHex: () => {} }, intensity: 1 },
      dirLight: { color: { setHex: () => {} }, intensity: 1 },
      fillLight: { color: { setHex: () => {} }, intensity: 1 },
    };
    manager.setTarget(mockScene, mockLights);
    manager.applyPreset('void', 1.0);
    expect(mockScene.background.getHex()).toBe(0x0d0d0d);

    manager.setTheme(true);
    expect(mockScene.background.getHex()).toBe(0xf4f5f7);

    manager.setTheme(false);
    expect(mockScene.background.getHex()).toBe(0x0d0d0d);
  });
});

describe('3D asset orientation & upright vertical alignment', () => {
  it('defaults vinyl record to upright vertical orientation facing the camera', () => {
    const record = createVinylRecord();
    const discHolder = record.group.children.find((c) => c.name === 'VinylDiscHolder');
    expect(discHolder).toBeDefined();
    // Pi/2 tilt ensures the disc stands vertically in the XY plane
    expect(discHolder.rotation.x).toBeCloseTo(Math.PI / 2, 4);
  });

  it('supports granular pitch, yaw, and roll asset rotation controls', () => {
    const { project } = sanitizeProject({
      itemRotX: 45,
      itemRotY: -90,
      itemRotZ: 180,
    });
    expect(project.itemRotX).toBe(45);
    expect(project.itemRotY).toBe(-90);
    expect(project.itemRotZ).toBe(180);

    // Hostile clamping
    const { project: clamped } = sanitizeProject({
      itemRotX: 500,
      itemRotY: -360,
      itemRotZ: 'abc',
    });
    expect(clamped.itemRotX).toBe(180);
    expect(clamped.itemRotY).toBe(-180);
    expect(clamped.itemRotZ).toBe(0);
  });
});

describe('export scene sequence playlist', () => {
  it('provides comprehensive scene definitions spanning fields and 3D items', () => {
    expect(SCENE_DEFINITIONS.length).toBeGreaterThanOrEqual(12);
    const types = new Set(SCENE_DEFINITIONS.map((d) => d.type));
    expect(types.has('item')).toBe(true);
    expect(types.has('field')).toBe(true);
  });

  it('persists and sanitizes custom export scene sequences', () => {
    const customSeq = ['cassette', 'cathedral', 'vinyl', 'wave'];
    const { project } = sanitizeProject({
      exportSceneSequence: customSeq,
    });
    expect(project.exportSceneSequence).toEqual(customSeq);

    // Filters out invalid scene IDs
    const { project: filtered } = sanitizeProject({
      exportSceneSequence: ['sphere', 'unknown-alien-scene', 'floppy'],
    });
    expect(filtered.exportSceneSequence).toEqual(['sphere', 'floppy']);

    // Falls back to default sequence if empty
    const { project: fallback } = sanitizeProject({
      exportSceneSequence: [],
    });
    expect(fallback.exportSceneSequence).toEqual([...DEFAULT_SEQUENCE]);
  });
});
