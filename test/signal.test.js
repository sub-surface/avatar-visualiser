import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../project-schema.js';
import { createSeededRandom, SharedAnalyzer } from '../signal.js';

function silence(analyzer) {
  return new Uint8Array(analyzer.binCount);
}

describe('SharedAnalyzer', () => {
  it('uses project BPM for both LFO clocks', () => {
    const analyzer = new SharedAnalyzer();
    const params = createDefaultProject();
    params.bpm = 120;
    params.lfoRate = 0.25;
    params.lfoDepth = 1;
    const bins = silence(analyzer);
    analyzer.stepBins(bins, bins, {
      dt: 0.25,
      time: 0.25,
      sampleRate: 48000,
      params,
    });
    const frame = analyzer.stepBins(bins, bins, {
      dt: 0.25,
      time: 0.5,
      sampleRate: 48000,
      params,
    });
    expect(frame.lfo1).toBeCloseTo(1, 5);
  });

  it('keeps time-based smoothing approximately equal across render rates', () => {
    const run = (fps) => {
      const analyzer = new SharedAnalyzer();
      const params = createDefaultProject();
      params.smoothing = 0.9;
      const full = new Uint8Array(analyzer.binCount).fill(255);
      for (let frame = 0; frame < fps; frame++) {
        analyzer.stepBins(full, full, {
          dt: 1 / fps,
          time: frame / fps,
          sampleRate: 48000,
          params,
        });
      }
      return analyzer.freqL[100];
    };
    expect(run(30)).toBeCloseTo(run(60), 0);
    expect(run(144)).toBeCloseTo(run(60), 0);
  });

  it('preserves stereo channels', () => {
    const analyzer = new SharedAnalyzer();
    const params = createDefaultProject();
    params.smoothing = 0;
    const left = new Uint8Array(analyzer.binCount);
    const right = new Uint8Array(analyzer.binCount);
    left[20] = 240;
    right[40] = 220;
    const frame = analyzer.stepBins(left, right, {
      dt: 1 / 60,
      time: 0,
      sampleRate: 48000,
      params,
    });
    expect(frame.freqL[20]).toBeGreaterThan(frame.freqR[20]);
    expect(frame.freqR[40]).toBeGreaterThan(frame.freqL[40]);
  });

  it('maps bands from Hz at different sample rates', () => {
    const params = createDefaultProject();
    params.smoothing = 0;
    const response = (sampleRate) => {
      const analyzer = new SharedAnalyzer();
      const bins = new Uint8Array(analyzer.binCount);
      const index100Hz = Math.round(100 * analyzer.fftSize / sampleRate);
      bins[index100Hz] = 255;
      return analyzer.stepBins(bins, bins, {
        dt: 1 / 60,
        sampleRate,
        params,
      }).env.kick;
    };
    expect(response(44100)).toBeGreaterThan(0);
    expect(response(48000)).toBeGreaterThan(0);
  });
});

describe('seeded random', () => {
  it('replays the same sequence for the same seed', () => {
    const left = createSeededRandom(42);
    const right = createSeededRandom(42);
    expect([left(), left(), left()]).toEqual([right(), right(), right()]);
  });
});
