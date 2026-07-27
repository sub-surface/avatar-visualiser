import { describe, expect, it } from 'vitest';
import { createDefaultProject, cloneProject } from '../project-schema.js';
import { RenderSession } from '../render-session.js';

describe('RenderSession parity', () => {
  it('produces identical SignalFrames for preview and export clocks', () => {
    const project = createDefaultProject();
    project.smoothing = 0.42;
    project.bpm = 174;
    const preview = new RenderSession(cloneProject(project));
    const output = new RenderSession(cloneProject(project));
    const left = new Float32Array(8192);
    const right = new Float32Array(8192);
    for (let index = 0; index < left.length; index++) {
      left[index] = Math.sin(index * 0.031) * 0.6;
      right[index] = Math.sin(index * 0.047 + 0.8) * 0.4;
    }

    for (let frameIndex = 0; frameIndex < 5; frameIndex++) {
      const options = {
        dt: 1 / 30,
        time: frameIndex / 30,
        sampleRate: 48000,
      };
      const sample = 2048 + frameIndex * 1600;
      const previewFrame = preview.stepPcm(left, right, sample, options);
      const outputFrame = output.stepPcm(left, right, sample, options);
      expect([...previewFrame.freqL]).toEqual([...outputFrame.freqL]);
      expect([...previewFrame.freqR]).toEqual([...outputFrame.freqR]);
      expect(previewFrame.env).toEqual(outputFrame.env);
      expect(previewFrame.lfo1).toBe(outputFrame.lfo1);
    }
  });
});
