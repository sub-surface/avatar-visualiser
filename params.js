/**
 * params.js — validated project state, persistence, DOM bindings, track display.
 */
import { createDefaultProject, sanitizeProject, SCHEMA_VERSION } from './project-schema.js';

export const P = createDefaultProject();

const STORAGE_KEY = 'psychograph_params';

/** Columns derived from complexity — the shared lattice width for every visual mode. */
export function getCols() {
  return Math.max(2, Math.min(384, Math.round(P.complexity) * 32));
}

function element(id) {
  return document.getElementById(id);
}

function setInput(id, value) {
  const target = element(id);
  if (target) target.value = value;
}

function setLabel(id, value) {
  const target = element(id);
  if (target) target.textContent = value;
}

function syncControls() {
  const bindings = {
    FreqScale: 'freqScale',
    FreqRange: 'freqRange',
    Smoothing: 'smoothing',
    MaxDisp: 'maxDisp',
    BowlExp: 'bowlExp',
    Morph: 'morph',
    LfoWaveform: 'lfoWaveform',
    LfoRate: 'lfoRate',
    LfoDepth: 'lfoDepth',
    LfoOffset: 'lfoOffset',
    Lfo2Waveform: 'lfo2Waveform',
    Lfo2Rate: 'lfo2Rate',
    Lfo2Depth: 'lfo2Depth',
    Lfo2Offset: 'lfo2Offset',
    LfoToDisp: 'lfoToDisp',
    LfoToBowl: 'lfoToBowl',
    LfoToZoom: 'lfoToZoom',
    LfoToOpacity: 'lfoToOpacity',
    LfoToPolar: 'lfoToPolar',
    LfoToWave: 'lfoToWave',
    Rows: 'rows',
    Complexity: 'complexity',
    ModSub: 'modSub',
    ModKick: 'modKick',
    ModMid: 'modMid',
    ModHigh: 'modHigh',
    ModRms: 'modRms',
    ModTrans: 'modTrans',
    SphereSize: 'sphereSize',
    WaveSpacing: 'waveSpacing',
    PolarSpacing: 'polarSpacing',
    FieldScale: 'fieldScale',
    FieldDepth: 'fieldDepth',
    FieldTwist: 'fieldTwist',
    FieldCurl: 'fieldCurl',
    FieldStereo: 'fieldStereo',
    FieldFlow: 'fieldFlow',
    FieldSymmetry: 'fieldSymmetry',
    FieldHistory: 'fieldHistory',
    FieldRotation: 'fieldRotation',
    FieldOpacity: 'fieldOpacity',
    Gain: 'gain',
    ColorCycle: 'colorCycle',
    UiReactivity: 'uiReactivity',
    CycleMode: 'cycleMode',
    PeakSens: 'peakSens',
    CameraMotion: 'cameraMotion',
    CameraAmount: 'cameraAmount',
    CameraSpeed: 'cameraSpeed',
    CameraAudio: 'cameraAudio',
    CameraTransition: 'cameraTransition',
    ExportPreset: 'exportPreset',
    ExportOrient: 'exportOrientation',
    ExportAspect: 'exportAspect',
    LookProfile: 'lookProfile',
    LookPixelSnap: 'lookPixelSnap',
    LookColorBits: 'lookColorBits',
    LookDither: 'lookDither',
    LookScanlines: 'lookScanlines',
    LookInterlace: 'lookInterlace',
    LookChroma: 'lookChroma',
    LookNoise: 'lookNoise',
    LookFeedback: 'lookFeedback',
    LookCadence: 'lookCadence',
    ItemSpinSpeed: 'itemSpinSpeed',
    ItemGlitch: 'itemGlitch',
    ItemWobble: 'itemWobble',
    VhsTracking: 'vhsTracking',
    VhsCurvature: 'vhsCurvature',
    VhsSyncDrop: 'vhsSyncDrop',
  };

  for (const [suffix, key] of Object.entries(bindings)) {
    setInput(`p${suffix}`, P[key]);
    setLabel(`v${suffix}`, P[key]);
  }

  const lpfPosition = Math.log10(P.lpfCutoff / 200) / Math.log10(20000 / 200);
  setInput('pLpfCutoff', Math.max(0, Math.min(1, lpfPosition)));
  setLabel(
    'vLpfCutoff',
    P.lpfCutoff >= 1000
      ? `${(P.lpfCutoff / 1000).toFixed(P.lpfCutoff >= 10000 ? 0 : 1)}k`
      : P.lpfCutoff,
  );

  setInput('pColorA', P.colorA);
  setInput('pColorB', P.colorB);
  setInput('pTitle', P.title);
  setInput('pArtist', P.artist);
  setInput('pBpm', P.bpm);
  setInput('pGenre', P.genre);

  const fastBoot = element('pFastBoot');
  if (fastBoot) fastBoot.checked = P.fastBoot;
  const previewOutput = element('pPreviewOutput');
  if (previewOutput) previewOutput.checked = P.previewOutput;
  const overlayInSignal = element('pLookOverlayInSignal');
  if (overlayInSignal) overlayInSignal.checked = P.lookOverlayInSignal;
}

export function saveParams() {
  const bpmValue = Number(element('pBpm')?.value);
  if (Number.isFinite(bpmValue)) P.bpm = Math.max(20, Math.min(400, bpmValue));

  const persisted = {
    ...P,
    schemaVersion: SCHEMA_VERSION,
    title: element('pTitle')?.value ?? '',
    artist: element('pArtist')?.value ?? '',
    genre: element('pGenre')?.value ?? '',
    isLight: document.body.classList.contains('light-mode'),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function loadParams(rebuildVisual) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const { project, warnings } = sanitizeProject(raw);
    Object.assign(P, project);

    document.body.setAttribute('data-palette', P.uiPalette);
    document.body.classList.toggle('light-mode', P.isLight);
    syncControls();
    updateTrackDisplay();
    rebuildVisual?.();

    if (warnings.length) {
      console.warn('[AVATAR config]', ...warnings);
      setTimeout(() => window.dispatchEvent(new CustomEvent('avatar-status', {
        detail: `Config repaired: ${warnings.length} invalid value${warnings.length === 1 ? '' : 's'}`,
      })), 0);
    }
  } catch (error) {
    console.error('[AVATAR config] Unable to load saved project', error);
    syncControls();
    setTimeout(() => window.dispatchEvent(new CustomEvent('avatar-status', {
      detail: 'Saved config could not be loaded; defaults restored',
    })), 0);
  }
}

export function bindRange(id, valueId, key, onChange) {
  const input = element(id);
  const label = element(valueId);
  if (!input) return;
  input.addEventListener('input', () => {
    let value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (key === 'rows') value = Math.max(2, Math.min(160, Math.round(value)));
    if (key === 'complexity') value = Math.max(1, Math.min(12, Math.round(value)));
    P[key] = value;
    input.value = value;
    if (label) label.textContent = value;
    onChange?.(value);
    saveParams();
  });
}

export function bindSelect(id, valueId, key, onChange) {
  const input = element(id);
  const label = element(valueId);
  if (!input) return;
  input.addEventListener('change', () => {
    P[key] = input.value;
    if (label) label.textContent = input.value;
    onChange?.(input.value);
    saveParams();
  });
}

export function bindText(id, callback) {
  const input = element(id);
  if (!input) return;
  input.addEventListener('input', () => {
    if (id === 'pBpm') {
      const value = Number(input.value);
      if (Number.isFinite(value)) P.bpm = Math.max(20, Math.min(400, value));
    }
    callback?.();
    saveParams();
  });
}

export function updateTrackDisplay() {
  const title = element('pTitle')?.value.trim() ?? '';
  const artist = element('pArtist')?.value.trim() ?? '';
  const bpm = element('pBpm')?.value.trim() ?? '';
  const genre = element('pGenre')?.value.trim() ?? '';
  const time = element('dispCurrent')?.textContent.trim() ?? '';

  element('dispTitle').textContent = title;
  element('dispArtist').textContent = artist;
  element('dispBpm').textContent = bpm;
  element('dispGenre').textContent = genre;
  element('dispRule').style.display = title ? 'block' : 'none';

  const showPill = (pillId, dividerId, visible) => {
    element(pillId).style.display = visible ? 'flex' : 'none';
    if (dividerId) element(dividerId).style.display = visible ? 'block' : 'none';
  };
  showPill('pillTime', 'divTime', Boolean(time));
  showPill('pillBpm', 'divBpm', Boolean(bpm));
  showPill('pillGenre', null, Boolean(genre));

  element('divTime').style.display = time && (bpm || genre) ? 'block' : 'none';
  element('divBpm').style.display = bpm && genre ? 'block' : 'none';
}

export function fmtTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function setTimeDisplay(current, total) {
  element('dispCurrent').textContent = total ? `${fmtTime(current)} / ${fmtTime(total)}` : '';
  updateTrackDisplay();
}

export function getTrackMeta() {
  return {
    title: element('pTitle')?.value.trim() ?? '',
    artist: element('pArtist')?.value.trim() ?? '',
    bpm: element('pBpm')?.value.trim() ?? '',
    genre: element('pGenre')?.value.trim() ?? '',
  };
}
