import { describe, expect, it } from 'vitest';
import {
  EXPORT_PRESETS,
  avcCodecString,
  avcLevel,
  channelSourceMap,
  describeExport,
  exportDimensions,
  formatBytes,
  formatClock,
  frameWindow,
  resolveClipRange,
} from '../src/export/export-spec.js';
import { PARAM_SCHEMA } from '../project-schema.js';

describe('H.264 level selection', () => {
  it('uses level 4.0 for 1080p30 and 4.2 for 1080p60', () => {
    expect(avcCodecString(1920, 1080, 30)).toBe('avc1.640028');
    expect(avcCodecString(1920, 1080, 60)).toBe('avc1.64002A');
  });

  it('handles vertical and 4:3 frames at 60fps', () => {
    expect(avcCodecString(1080, 1920, 60)).toBe('avc1.64002A');
    expect(avcCodecString(1440, 1080, 60)).toBe('avc1.64002A');
    expect(avcCodecString(1080, 1440, 30)).toBe('avc1.640028');
  });

  it('uses Main profile level 3.1 for lo-fi sizes', () => {
    expect(avcCodecString(640, 360, 30, 'main')).toBe('avc1.4D001F');
    expect(avcCodecString(480, 640, 30, 'main')).toBe('avc1.4D001F');
  });

  it('never picks a level whose limits the stream exceeds', () => {
    const limits = { 0x1f: [3600, 108000], 0x28: [8192, 245760], 0x2a: [8704, 522240] };
    for (const [w, h] of [[640, 360], [1280, 720], [1440, 1080], [1920, 1080], [1080, 1920]]) {
      for (const fps of [24, 30, 50, 60]) {
        const level = avcLevel(w, h, fps);
        const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
        if (limits[level]) {
          expect(mbs).toBeLessThanOrEqual(limits[level][0]);
          expect(mbs * fps).toBeLessThanOrEqual(limits[level][1]);
        }
      }
    }
  });
});

describe('export presets', () => {
  it('covers every preset the project schema accepts', () => {
    expect(Object.keys(EXPORT_PRESETS).sort()).toEqual([...PARAM_SCHEMA.exportPreset.values].sort());
  });

  it('maps orientation and aspect to dimensions', () => {
    expect(exportDimensions({})).toEqual([1920, 1080]);
    expect(exportDimensions({ exportOrientation: 'vertical' })).toEqual([1080, 1920]);
    expect(exportDimensions({ exportAspect: '4:3' })).toEqual([1440, 1080]);
    expect(exportDimensions({ exportPreset: 'lofi' })).toEqual([640, 360]);
    expect(exportDimensions({ exportPreset: 'lofi', exportAspect: '4:3', exportOrientation: 'vertical' })).toEqual([480, 640]);
  });

  it('describes fps, bitrate, codec and size estimate', () => {
    const spec = describeExport({ exportPreset: 'high' }, 120);
    expect(spec).toMatchObject({ width: 1920, height: 1080, fps: 60, codec: 'avc1.64002A', codecLabel: 'H.264 High 4.2', frames: 7200 });
    // (12 Mbps + 192 kbps) / 8 * 120s * 1.02 ≈ 186.5 MB
    expect(spec.estimatedBytes / 1e6).toBeCloseTo(186.5, 0);
  });

  it('falls back to standard for unknown presets and handles no track', () => {
    const spec = describeExport({ exportPreset: 'bogus' }, 0);
    expect(spec.preset).toBe('standard');
    expect(spec.fps).toBe(30);
    expect(spec.estimatedBytes).toBe(0);
  });
});

describe('clip ranges', () => {
  it('starts at the playhead', () => {
    expect(resolveClipRange(180, 42, 10)).toEqual({ start: 42, end: 52 });
  });

  it('shifts back so the clip fits before the end of the track', () => {
    expect(resolveClipRange(180, 178, 10)).toEqual({ start: 170, end: 180 });
  });

  it('clamps to the whole track when it is shorter than the clip', () => {
    expect(resolveClipRange(4, 2, 10)).toEqual({ start: 0, end: 4 });
  });

  it('pre-rolls one second before the first encoded frame', () => {
    expect(frameWindow(180, 30, 42, 52)).toEqual({
      totalFrames: 5400,
      startFrame: 1260,
      endFrame: 1560,
      prerollFrames: 30,
      encodedFrames: 300,
    });
  });

  it('has no pre-roll at the start of the track and encodes everything by default', () => {
    expect(frameWindow(10, 30)).toEqual({ totalFrames: 300, startFrame: 0, endFrame: 300, prerollFrames: 0, encodedFrames: 300 });
    expect(frameWindow(10, 30, 0.5, 2).prerollFrames).toBe(15);
  });
});

describe('audio channel mapping', () => {
  it('duplicates mono to stereo', () => {
    expect(channelSourceMap(1, 2)).toEqual([0, 0]);
  });

  it('keeps stereo and drops surround extras', () => {
    expect(channelSourceMap(2, 2)).toEqual([0, 1]);
    expect(channelSourceMap(6, 2)).toEqual([0, 1]);
  });
});

describe('formatting', () => {
  it('formats clock times', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.4)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(84_000_000)).toBe('84.0 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.50 GB');
  });
});

describe('index.html preset selector', () => {
  it('offers every export preset', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const select = html.match(/<select[^>]*id="pExportPreset"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';
    const values = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(values).toEqual(Object.keys(EXPORT_PRESETS).sort());
  });
});
