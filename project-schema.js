import { PRESET_DEFAULTS } from './cam.js';

export const SCHEMA_VERSION = 3;

const number = (defaultValue, min, max, extra = {}) => ({
  type: 'number',
  default: defaultValue,
  min,
  max,
  ...extra,
});

const choice = (defaultValue, values) => ({
  type: 'enum',
  default: defaultValue,
  values,
});

export const PARAM_SCHEMA = Object.freeze({
  rows: number(60, 2, 160, { integer: true, update: 'geometry', random: [20, 120] }),
  complexity: number(4, 1, 12, { integer: true, update: 'geometry', random: [1, 10] }),
  maxDisp: number(2.2, 0, 8, { update: 'hot', random: [0.1, 4] }),
  bowlExp: number(2, 0.1, 8, { update: 'hot', random: [0.5, 4] }),
  smoothing: number(0.55, 0, 0.99, { update: 'audio', random: [0.1, 0.95] }),
  freqScale: choice('log', ['log', 'linear', 'dnb']),
  freqRange: number(0.55, 0.01, 1, { update: 'audio', random: [0.1, 1] }),

  modSub: number(0.5, 0, 2, { update: 'hot', random: [0, 1] }),
  modKick: number(0.8, 0, 3, { update: 'hot', random: [0, 2] }),
  modMid: number(0.6, 0, 3, { update: 'hot', random: [0, 1.5] }),
  modHigh: number(0.8, 0, 3, { update: 'hot', random: [0, 1.5] }),
  modRms: number(0.5, 0, 3, { update: 'hot', random: [0, 1.5] }),
  modTrans: number(0.4, 0, 2, { update: 'hot', random: [0, 1] }),

  sphereSize: number(3, 0.1, 10, { update: 'geometry', random: [0.5, 6] }),
  waveSpacing: number(0.4, 0.01, 3, { update: 'geometry', random: [0.1, 1.5] }),
  polarSpacing: number(-3, -12, 12, { update: 'geometry', random: [-5, 5] }),
  morph: number(0, 0, 2, { update: 'hot', random: [0, 1] }),
  fieldScale: number(1, 0.2, 3, { update: 'hot', random: [0.65, 1.5] }),
  fieldDepth: number(1, 0, 3, { update: 'hot', random: [0.4, 1.8] }),
  fieldTwist: number(0.15, -3, 3, { update: 'hot', random: [-1.5, 1.5] }),
  fieldCurl: number(0, -2, 2, { update: 'hot', random: [-1, 1] }),
  fieldStereo: number(1, -2, 2, { update: 'hot', random: [-1.5, 1.5] }),
  fieldFlow: number(0.2, -3, 3, { update: 'hot', random: [-1.5, 1.5] }),
  fieldSymmetry: number(4, 1, 12, { integer: true, update: 'hot', random: [1, 10] }),
  fieldHistory: number(1, 0, 2, { update: 'hot', random: [0.3, 1.6] }),
  fieldRotation: number(0.16, -2, 2, { update: 'hot', random: [-0.8, 0.8] }),
  fieldOpacity: number(0.72, 0.03, 1, { update: 'look', random: [0.25, 1] }),

  lpfCutoff: number(20000, 20, 24000, { update: 'audio' }),
  gain: number(1, 0, 4, { update: 'audio' }),
  bpm: number(120, 20, 400, { update: 'audio' }),

  lfoWaveform: choice('sine', ['sine', 'square', 'sawtooth', 'triangle']),
  lfoRate: number(0.25, 0, 8, { update: 'hot' }),
  lfoDepth: number(1, 0, 4, { update: 'hot' }),
  lfoOffset: number(0, -2, 2, { update: 'hot' }),
  lfo2Waveform: choice('sine', ['sine', 'square', 'sawtooth', 'triangle']),
  lfo2Rate: number(0.5, 0, 8, { update: 'hot' }),
  lfo2Depth: number(0, 0, 4, { update: 'hot' }),
  lfo2Offset: number(0, -2, 2, { update: 'hot' }),
  lfoToDisp: number(0, 0, 4, { update: 'hot' }),
  lfoToBowl: number(0.5, 0, 4, { update: 'hot' }),
  lfoToZoom: number(0, 0, 10, { update: 'hot' }),
  lfoToOpacity: number(0, 0, 2, { update: 'hot' }),
  lfoToPolar: number(0, 0, 4, { update: 'hot' }),
  lfoToWave: number(0, 0, 4, { update: 'hot' }),

  colorA: { type: 'color', default: '#e8d5b0', update: 'look' },
  colorB: { type: 'color', default: '#b090c8', update: 'look' },
  colorCycle: number(0, 0, 1, { update: 'look', random: [0, 1] }),
  uiReactivity: number(0.5, 0, 1, { update: 'look' }),
  uiPalette: choice('default', ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']),

  cycleMode: choice('off', ['off', 'static', 'ambient', 'cinematic', 'types', 'generative', 'random']),
  peakSens: number(0.5, 0, 1, { update: 'hot' }),
  cameraShot: choice('auto', ['auto', 'hero', 'overhead', 'horizon', 'side', 'macro', 'underslung', 'manual']),
  cameraMotion: choice('still', ['still', 'drift', 'orbit', 'pendulum', 'rail', 'handheld']),
  cameraAmount: number(0.35, 0, 2, { update: 'hot', random: [0, 1.2] }),
  cameraSpeed: number(0.35, 0, 3, { update: 'hot', random: [0.08, 1.5] }),
  cameraAudio: number(0.45, 0, 2, { update: 'hot', random: [0, 1.25] }),
  cameraTransition: number(0.8, 0, 4, { update: 'hot' }),

  lookProfile: choice('clean', ['clean', 'ps2-480', 'ps2-240', 'tape', 'ghost', 'vhs-master', 'crt-90s', 'ps1-retro']),
  previewOutput: { type: 'boolean', default: false, update: 'look' },
  lookPixelSnap: number(0, 0, 2, { update: 'look' }),
  lookColorBits: number(8, 3, 8, { integer: true, update: 'look' }),
  lookDither: number(0, 0, 1, { update: 'look' }),
  lookScanlines: number(0, 0, 1, { update: 'look' }),
  lookInterlace: number(0, 0, 1, { update: 'look' }),
  lookChroma: number(0, 0, 1, { update: 'look' }),
  lookNoise: number(0, 0, 1, { update: 'look' }),
  lookFeedback: number(0, 0, 0.98, { update: 'look' }),
  lookCadence: choice('display', ['display', '60', '30', '24', '20', '15']),
  lookOverlayInSignal: { type: 'boolean', default: false, update: 'look' },

  exportPreset: choice('standard', ['standard', 'high', 'lossless', 'lofi']),
  exportOrientation: choice('horizontal', ['horizontal', 'vertical']),
  exportAspect: choice('16:9', ['16:9', '4:3']),
  fastBoot: { type: 'boolean', default: false, update: 'hot' },

  visualCategory: choice('field', ['field', 'item']),
  activeItem: choice('cartridge', ['cartridge', 'vinyl', 'cassette', 'floppy', 'custom']),
  itemSpinSpeed: number(1, -5, 5, { update: 'hot' }),
  itemSpinBpmSync: { type: 'boolean', default: false, update: 'hot' },
  itemGlitch: number(0.3, 0, 2, { update: 'hot' }),
  itemWobble: number(0.5, 0, 2, { update: 'hot' }),

  vhsTracking: number(0, 0, 1, { update: 'look' }),
  vhsCurvature: number(0, 0, 1, { update: 'look' }),
  vhsSyncDrop: number(0, 0, 1, { update: 'look' }),
  vhsOsd: { type: 'boolean', default: false, update: 'look' },
});

function sanitizeValue(key, value, rule, warnings) {
  if (rule.type === 'number') {
    if (value === undefined || value === null || value === '') return rule.default;
    let next = Number(value);
    if (!Number.isFinite(next)) {
      warnings.push(`${key}: invalid number; restored default`);
      next = rule.default;
    }
    if (rule.integer) next = Math.round(next);
    if (next < rule.min || next > rule.max) {
      warnings.push(`${key}: clamped to supported range`);
      next = Math.max(rule.min, Math.min(rule.max, next));
    }
    return next;
  }

  if (rule.type === 'enum') {
    if (!rule.values.includes(value)) {
      if (value !== undefined) warnings.push(`${key}: unsupported value; restored default`);
      return rule.default;
    }
    return value;
  }

  if (rule.type === 'boolean') return value === undefined ? rule.default : Boolean(value);

  if (rule.type === 'color') {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    if (value !== undefined) warnings.push(`${key}: invalid colour; restored default`);
    return rule.default;
  }

  return rule.default;
}

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function sanitizeCameraAnchor(source, warnings) {
  let raw = source.cameraAnchor;
  if (!raw && Array.isArray(source.camStyles) && source.camStyles.length) {
    let legacyIndex = 0;
    const legacyGroup = source.camGroups?.[Number(source.exportCamGroupIdx) || 0];
    const firstLegacy = legacyGroup?.presets?.[0];
    if (Number.isInteger(firstLegacy)) legacyIndex = firstLegacy;
    raw = source.camStyles[legacyIndex] ?? source.camStyles[0];
    warnings.push('camera presets migrated to a manual anchor');
  }
  const fallback = PRESET_DEFAULTS[0];
  const value = (key, min, max) => {
    const candidate = Number(raw?.[key]);
    return Number.isFinite(candidate)
      ? Math.max(min, Math.min(max, candidate))
      : fallback[key];
  };
  return {
    az: value('az', -720, 720),
    el: value('el', -89, 89),
    dist: value('dist', 0.25, 100),
    lookY: value('lookY', -20, 20),
  };
}

export function createDefaultProject() {
  const project = { schemaVersion: SCHEMA_VERSION };
  for (const [key, rule] of Object.entries(PARAM_SCHEMA)) project[key] = rule.default;
  project.cameraAnchor = { ...PRESET_DEFAULTS[0] };
  delete project.cameraAnchor.id;
  delete project.cameraAnchor.name;
  return project;
}

export function sanitizeProject(raw = {}) {
  const warnings = [];
  const source = raw && typeof raw === 'object' ? raw : {};
  const project = { schemaVersion: SCHEMA_VERSION };

  for (const [key, rule] of Object.entries(PARAM_SCHEMA)) {
    project[key] = sanitizeValue(key, source[key], rule, warnings);
  }

  project.cameraAnchor = sanitizeCameraAnchor(source, warnings);
  if (!source.cameraShot && Array.isArray(source.camStyles) && source.camStyles.length) {
    project.cameraShot = 'manual';
  }

  project.title = safeText(source.title, 60);
  project.artist = safeText(source.artist, 60);
  project.genre = safeText(source.genre, 30);
  project.isLight = Boolean(source.isLight);

  if (source.bpm !== undefined) {
    project.bpm = sanitizeValue('bpm', source.bpm, PARAM_SCHEMA.bpm, warnings);
  }

  return { project, warnings };
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}
