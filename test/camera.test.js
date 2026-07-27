import { describe, expect, it } from 'vitest';
import {
  cartToSpherical,
  proceduralCameraPose,
  shotPose,
  sphericalToCart,
} from '../cam.js';
import { createDefaultProject } from '../project-schema.js';

describe('camera intelligence', () => {
  it('round-trips spherical and Cartesian poses', () => {
    const cartesian = sphericalToCart(47, 23, 11.5);
    const spherical = cartToSpherical(cartesian.x, cartesian.y, cartesian.z);
    expect(spherical.az).toBeCloseTo(47, 1);
    expect(spherical.el).toBeCloseTo(23, 1);
    expect(spherical.dist).toBeCloseTo(11.5, 2);
  });

  it('auto-frames different visual families differently', () => {
    expect(shotPose('auto', 'sphere').el).toBe(0);
    expect(shotPose('auto', 'polar').el).toBeGreaterThan(70);
    expect(shotPose('auto', 'cathedral').lookY).toBeGreaterThan(0);
  });

  it('keeps procedural movement deterministic', () => {
    const project = createDefaultProject();
    project.cameraMotion = 'handheld';
    project.cameraAmount = 0.8;
    const frame = {
      lfo1: 0.2,
      env: { mid: 0.3, kick: 0.7, rms: 0.2, trans: 0.5 },
    };
    expect(proceduralCameraPose(project, 'tunnel', 12.5, frame))
      .toEqual(proceduralCameraPose(project, 'tunnel', 12.5, frame));
  });

  it('uses the captured manual anchor exactly when motion and audio are off', () => {
    const project = createDefaultProject();
    project.cameraShot = 'manual';
    project.cameraMotion = 'still';
    project.cameraAudio = 0;
    project.cameraAnchor = { az: 90, el: 0, dist: 8, lookY: 1.5 };
    const result = proceduralCameraPose(project, 'sphere', 20, null);
    expect(result.position.x).toBeCloseTo(8, 5);
    expect(result.position.y).toBeCloseTo(0, 5);
    expect(result.position.z).toBeCloseTo(0, 5);
    expect(result.lookY).toBe(1.5);
  });
});
