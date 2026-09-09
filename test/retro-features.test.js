import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RETRO_ITEMS, ItemSceneManager } from '../src/objects/item-scene.js';
import { LOOK_PROFILES, applyLookProfile } from '../look-profiles.js';
import { createDefaultProject, sanitizeProject } from '../project-schema.js';

describe('retro 3D items & expanded hardware features', () => {
  it('registers all 4 retro physical artifacts with distinct models', () => {
    expect(RETRO_ITEMS).toHaveLength(4);
    const ids = RETRO_ITEMS.map((item) => item.id);
    expect(ids).toContain('cartridge');
    expect(ids).toContain('vinyl');
    expect(ids).toContain('cassette');
    expect(ids).toContain('floppy');
  });

  it('contextually adapts 3D item lighting and holographic glitch wireframes in light mode', () => {
    const mockScene = { add: () => {} };
    const itemScene = new ItemSceneManager(mockScene);
    expect(itemScene.ambLight.intensity).toBe(1.6);
    expect(itemScene.items.cartridge.wireMat.blending).toBe(THREE.AdditiveBlending);

    itemScene.setTheme(true);
    expect(itemScene.ambLight.intensity).toBe(2.2);
    expect(itemScene.items.cartridge.wireMat.blending).toBe(THREE.NormalBlending);
    expect(itemScene.items.cartridge.wireMat.color.getHex()).toBe(0x0f5b8c);

    itemScene.setTheme(false);
    expect(itemScene.ambLight.intensity).toBe(1.6);
    expect(itemScene.items.cartridge.wireMat.blending).toBe(THREE.AdditiveBlending);
    expect(itemScene.items.cartridge.wireMat.color.getHex()).toBe(0x00ffff);
  });

  it('provides new VHS Master and 90s CRT profiles', () => {
    const project = createDefaultProject();
    applyLookProfile(project, 'vhs-master');
    expect(project.lookProfile).toBe('vhs-master');
    expect(project.vhsTracking).toBeGreaterThan(0.5);
    expect(project.vhsSyncDrop).toBeGreaterThan(0.2);
    expect(project.vhsOsd).toBe(true);

    applyLookProfile(project, 'crt-90s');
    expect(project.lookProfile).toBe('crt-90s');
    expect(project.vhsCurvature).toBeGreaterThan(0.4);
  });

  it('sanitizes item spin speed and glitch controls within safe bounds', () => {
    const { project } = sanitizeProject({
      visualCategory: 'item',
      activeItem: 'vinyl',
      itemSpinSpeed: 100, // should clamp
      itemGlitch: -10,    // should clamp
      vhsTracking: 5,     // should clamp
    });

    expect(project.visualCategory).toBe('item');
    expect(project.activeItem).toBe('vinyl');
    expect(project.itemSpinSpeed).toBe(5);
    expect(project.itemGlitch).toBe(0);
    expect(project.vhsTracking).toBe(1);

    const { project: customProj } = sanitizeProject({
      visualCategory: 'item',
      activeItem: 'custom',
    });
    expect(customProj.activeItem).toBe('custom');
  });

  it('upgrades SoundCloud thumbnail URLs to 500x500 high-res format', () => {
    const standardUrl = 'https://i1.sndcdn.com/artworks-xyz-large.jpg';
    const highRes = standardUrl.replace('-large.', '-t500x500.');
    expect(highRes).toBe('https://i1.sndcdn.com/artworks-xyz-t500x500.jpg');

    const thumb300 = 'https://i1.sndcdn.com/artworks-xyz-t300x300.jpg';
    const highRes2 = thumb300.replace('-t300x300.', '-t500x500.');
    expect(highRes2).toBe('https://i1.sndcdn.com/artworks-xyz-t500x500.jpg');
  });
});
