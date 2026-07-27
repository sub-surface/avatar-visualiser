import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../project-schema.js';
import { applyLookProfile, cadenceFps, getInternalSize } from '../look-profiles.js';

describe('look profiles', () => {
  it('applies a complete deterministic PS2 profile', () => {
    const project = createDefaultProject();
    applyLookProfile(project, 'ps2-480');
    expect(project.lookProfile).toBe('ps2-480');
    expect(project.lookCadence).toBe('30');
    expect(project.lookColorBits).toBeLessThan(8);
    expect(project.lookNoise).toBeGreaterThan(0);
  });

  it('uses 640x480 for a horizontal 4:3 PS2 frame', () => {
    const project = createDefaultProject();
    applyLookProfile(project, 'ps2-480');
    project.exportAspect = '4:3';
    expect(getInternalSize(project, 1920, 1080)).toEqual({ width: 640, height: 480 });
  });

  it('adapts the same look to 16:9 and vertical output', () => {
    const project = createDefaultProject();
    applyLookProfile(project, 'ps2-480');
    project.exportAspect = '16:9';
    expect(getInternalSize(project, 1920, 1080)).toEqual({ width: 640, height: 360 });
    project.exportOrientation = 'vertical';
    expect(getInternalSize(project, 1080, 1920)).toEqual({ width: 360, height: 640 });
  });

  it('keeps clean mode at the actual viewport size', () => {
    const project = createDefaultProject();
    expect(getInternalSize(project, 1365, 768)).toEqual({ width: 1365, height: 768 });
    expect(cadenceFps(project)).toBe(0);
  });
});
