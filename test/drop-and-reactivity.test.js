import { describe, expect, it } from 'vitest';
import { findModeTriggers } from '../export.js';
import { createDefaultProject, PARAM_SCHEMA } from '../project-schema.js';
import { signalField } from '../vis/field.js';

describe('drop detection & scene cut timing', () => {
  it('accurately detects musical drops following breakdowns', () => {
    const sampleRate = 44100;
    const duration = 40; // 40 seconds
    const mono = new Float32Array(sampleRate * duration);

    // 0s - 10s: quiet intro (amplitude 0.05)
    for (let i = 0; i < sampleRate * 10; i++) {
      mono[i] = (Math.random() - 0.5) * 0.1;
    }
    // 10s: huge drop onset / kick (amplitude 0.9)
    for (let i = sampleRate * 10; i < sampleRate * 18; i++) {
      mono[i] = (Math.random() - 0.5) * 1.8;
    }
    // 18s - 25s: quiet breakdown (amplitude 0.05)
    for (let i = sampleRate * 18; i < sampleRate * 25; i++) {
      mono[i] = (Math.random() - 0.5) * 0.1;
    }
    // 25s: second drop onset (amplitude 0.95)
    for (let i = sampleRate * 25; i < sampleRate * 38; i++) {
      mono[i] = (Math.random() - 0.5) * 1.9;
    }

    const project = { peakSens: 0.5 };
    const triggers = findModeTriggers(mono, sampleRate, project);

    expect(triggers.length).toBeGreaterThanOrEqual(2);
    // There should be a trigger right around the first drop at 10s (within 0.3s window)
    const firstDropHit = triggers.some((t) => Math.abs(t - 10.0) <= 0.3);
    expect(firstDropHit).toBe(true);

    // There should be a trigger right around the second drop at 25s (within 0.3s window)
    const secondDropHit = triggers.some((t) => Math.abs(t - 25.0) <= 0.3);
    expect(secondDropHit).toBe(true);
  });

  it('generates cues across the entire song duration without a 15-cut cutoff', () => {
    const sampleRate = 44100;
    const duration = 180; // 3-minute song
    const mono = new Float32Array(sampleRate * duration);

    // Create periodic energetic beats every 6 seconds
    for (let sec = 6; sec < duration - 2; sec += 6) {
      const start = sec * sampleRate;
      const end = (sec + 3) * sampleRate;
      for (let i = start; i < end; i++) {
        mono[i] = (Math.random() - 0.5) * 1.5;
      }
    }

    const project = { peakSens: 0.8 }; // Higher sensitivity = more frequent cues
    const triggers = findModeTriggers(mono, sampleRate, project);

    // For a 180s track with beats every 6s, cues should significantly exceed the old 15-cut cap
    expect(triggers.length).toBeGreaterThan(15);
    // Final cue should be well beyond 120 seconds into the song
    expect(triggers[triggers.length - 1]).toBeGreaterThan(150);
  });

  it('adjusts trigger spacing according to peakSens', () => {
    const sampleRate = 44100;
    const duration = 60;
    const mono = new Float32Array(sampleRate * duration);
    for (let i = 0; i < mono.length; i++) {
      mono[i] = (Math.random() - 0.5) * 1.2;
    }

    const highSensTriggers = findModeTriggers(mono, sampleRate, { peakSens: 1.0 });
    const lowSensTriggers = findModeTriggers(mono, sampleRate, { peakSens: 0.0 });

    // Higher sensitivity produces tighter spacing and more triggers
    expect(highSensTriggers.length).toBeGreaterThanOrEqual(lowSensTriggers.length);
  });
});

describe('field audio reactivity setting', () => {
  it('registers reactivity in PARAM_SCHEMA with safe bounds and hot update', () => {
    expect(PARAM_SCHEMA.reactivity).toBeDefined();
    expect(PARAM_SCHEMA.reactivity.default).toBe(1.0);
    expect(PARAM_SCHEMA.reactivity.min).toBe(0.1);
    expect(PARAM_SCHEMA.reactivity.max).toBe(4.0);
    expect(PARAM_SCHEMA.reactivity.update).toBe('hot');
  });

  it('scales signal field displacement dynamically with reactivity', () => {
    const project = createDefaultProject();
    project.reactivity = 1.0;
    project.maxDisp = 2.0;

    const frame = {
      dt: 0.016,
      time: 1.0,
      sampleRate: 44100,
      freqL: new Uint8Array(128).fill(100),
      freqR: new Uint8Array(128).fill(100),
      env: { sub: 0.5, kick: 0.8, trans: 0.4, high: 0.2 },
      lfo1: 0,
    };

    signalField.update(frame, project);
    const dispStandard = signalField.material.uniforms.uDisp.value;

    project.reactivity = 2.5;
    signalField.update(frame, project);
    const dispHighReactivity = signalField.material.uniforms.uDisp.value;

    // High reactivity should produce significantly higher displacement on incoming audio
    expect(dispHighReactivity).toBeGreaterThan(dispStandard * 2.0);
  });
});
