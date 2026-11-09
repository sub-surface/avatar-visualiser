/**
 * export-spec.js — pure export maths (no DOM, no three.js).
 *
 * Single source of truth for what an export preset produces: resolution,
 * frame rate, bitrates, H.264 codec string, size estimate, clip ranges and
 * audio channel mapping. Shared by export.js and the export panel UI.
 */

export const AUDIO_BITRATE = 192e3;
export const CLIP_PREROLL_SECONDS = 1;

/** Preset table. `fps`/`bitrate` match the encoder settings used by export.js. */
export const EXPORT_PRESETS = {
  standard: { label: 'standard HD', fps: 30, bitrate: 12e6, profile: 'high' },
  high: { label: 'high 60fps', fps: 60, bitrate: 12e6, profile: 'high' },
  lossless: { label: 'lossless master', fps: 60, bitrate: 25e6, profile: 'high' },
  lofi: { label: 'lo-fi console', fps: 30, bitrate: 2.5e6, profile: 'main', lofi: true },
};

const PROFILE_IDC = { high: '6400', main: '4D00' };

// [level_idc, max frame size (macroblocks), max macroblocks/sec] — ITU-T H.264 Table A-1
const AVC_LEVELS = [
  [0x1f, 3600, 108000],   // 3.1
  [0x28, 8192, 245760],   // 4.0
  [0x2a, 8704, 522240],   // 4.2
  [0x33, 36864, 983040],  // 5.1
];

export function getPreset(project = {}) {
  return EXPORT_PRESETS[project.exportPreset] ?? EXPORT_PRESETS.standard;
}

export function exportDimensions(project = {}) {
  const vertical = project.exportOrientation === 'vertical';
  const fourThree = project.exportAspect === '4:3';
  if (getPreset(project).lofi) {
    if (fourThree) return vertical ? [480, 640] : [640, 480];
    return vertical ? [360, 640] : [640, 360];
  }
  if (fourThree) return vertical ? [1080, 1440] : [1440, 1080];
  return vertical ? [1080, 1920] : [1920, 1080];
}

/** Lowest H.264 level whose frame-size and macroblock-rate limits fit. */
export function avcLevel(width, height, fps) {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = frameMbs * fps;
  const [level] = AVC_LEVELS.find(([, maxFs, maxMbps]) => frameMbs <= maxFs && mbps <= maxMbps)
    ?? AVC_LEVELS[AVC_LEVELS.length - 1];
  return level;
}

export function avcCodecString(width, height, fps, profile = 'high') {
  const idc = PROFILE_IDC[profile] ?? profile;
  const level = avcLevel(width, height, fps);
  return `avc1.${idc}${level.toString(16).padStart(2, '0').toUpperCase()}`;
}

/** Everything the encoder and the export panel need to know about a project. */
export function describeExport(project = {}, durationSeconds = 0) {
  const preset = getPreset(project);
  const [width, height] = exportDimensions(project);
  const { fps, bitrate } = preset;
  const level = avcLevel(width, height, fps);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  // Encoders track the target bitrate closely; ~2% container overhead.
  const estimatedBytes = Math.round(((bitrate + AUDIO_BITRATE) / 8) * duration * 1.02);
  return {
    preset: project.exportPreset in EXPORT_PRESETS ? project.exportPreset : 'standard',
    width,
    height,
    fps,
    bitrate,
    audioBitrate: AUDIO_BITRATE,
    lofi: Boolean(preset.lofi),
    codec: avcCodecString(width, height, fps, preset.profile),
    codecLabel: `H.264 ${preset.profile === 'main' ? 'Main' : 'High'} ${Math.floor(level / 10)}.${level % 10}`,
    duration,
    frames: Math.ceil(duration * fps),
    estimatedBytes,
  };
}

/**
 * A clip of `length` seconds starting at the playhead, shifted back so it
 * always fits inside the track.
 */
export function resolveClipRange(duration, playhead = 0, length = 10) {
  const total = Math.max(0, Number(duration) || 0);
  const span = Math.min(total, Math.max(0.5, Number(length) || 10));
  const start = Math.min(Math.max(0, Number(playhead) || 0), Math.max(0, total - span));
  return { start, end: start + span };
}

/**
 * Frame window for a range: frames [startFrame, endFrame) are encoded and the
 * `prerollFrames` before them are rendered (not encoded) so smoothing, feedback
 * and cadence state match a full render at the same moment.
 */
export function frameWindow(duration, fps, startTime = 0, endTime = duration) {
  const totalFrames = Math.ceil(duration * fps);
  const startFrame = Math.min(totalFrames, Math.max(0, Math.floor(startTime * fps)));
  const endFrame = Math.max(startFrame, Math.min(totalFrames, Math.ceil(endTime * fps)));
  const prerollFrames = Math.min(startFrame, Math.round(CLIP_PREROLL_SECONDS * fps));
  return { totalFrames, startFrame, endFrame, prerollFrames, encodedFrames: endFrame - startFrame };
}

/** Source channel index for each output channel: mono is duplicated, extras dropped. */
export function channelSourceMap(sourceChannels, targetChannels) {
  const last = Math.max(0, sourceChannels - 1);
  return Array.from({ length: targetChannels }, (_, channel) => Math.min(channel, last));
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
