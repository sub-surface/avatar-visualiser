/**
 * params.js — P object, localStorage persistence, DOM bindings, track display.
 */
import { cartToSpherical, PRESET_DEFAULTS } from './cam.js';

/* ── Parameters ────────────────────────────────────────────── */
export const P = {
  rows: 60, complexity: 4,
  maxDisp: 2.2, bowlExp: 2.0,
  smoothing: 0.55, freqScale: 'log', freqRange: 0.55,
  modSub:   0.5,
  modKick:  0.8,
  modMid:   0.6,
  modHigh:  0.8,
  modRms:   0.5,
  modTrans: 0.4,
  sphereSize: 3.0,
  waveSpacing: 0.4,
  polarSpacing: -3.0,
  lpfCutoff: 20000,
  gain: 1.0,
  lfoWaveform: 'sine',
  lfoRate: 0.25, // cycles per beat (0.25 = 1 cycle per 4 beats)
  lfoDepth: 1.0,
  lfoOffset: 0.0,
  lfo2Waveform: 'sine',
  lfo2Rate: 0.5,
  lfo2Depth: 0.0,
  lfo2Offset: 0.0,
  lfoToDisp: 0.0,
  lfoToBowl: 0.5,
  lfoToZoom: 0.0,
  lfoToOpacity: 0.0,
  lfoToPolar: 0.0,
  lfoToWave: 0.0,
  colorA: '#e8d5b0', // Default gold/slate
  colorB: '#b090c8', // Default mauve
  colorCycle: 0.0,
  uiReactivity: 0.5,
  morph: 0.0,
  cycleMode: 'off',
  exportPreset: 'standard',
  exportOrientation: 'horizontal',
  exportAspect: '16:9',
  uiPalette: 'default',
  fastBoot: false,
  camStyles: PRESET_DEFAULTS.map(p => ({ ...p })),
};

/** Columns derived from complexity — use this everywhere instead of P.complexity * 32 inline. */
export function getCols() { return Math.max(2, P.complexity * 32); }

/** Validate and constrain parameters to valid ranges */
function validateParams() {
  P.rows = Math.max(2, Math.round(P.rows));
  P.complexity = Math.max(1, Math.round(P.complexity));
  P.maxDisp = Math.max(0, isFinite(P.maxDisp) ? P.maxDisp : 2.2);
  P.bowlExp = isFinite(P.bowlExp) ? P.bowlExp : 2.0;
  P.smoothing = Math.max(0, Math.min(1, isFinite(P.smoothing) ? P.smoothing : 0.55));
  P.freqRange = Math.max(0.01, Math.min(1, isFinite(P.freqRange) ? P.freqRange : 0.55));
  P.sphereSize = Math.max(0.1, isFinite(P.sphereSize) ? P.sphereSize : 3.0);
  P.lpfCutoff = Math.max(20, Math.min(20000, isFinite(P.lpfCutoff) ? P.lpfCutoff : 20000));
  P.gain = Math.max(0, isFinite(P.gain) ? P.gain : 1.0);
}

/* ── localStorage persistence ─────────────────────────────── */
const STORAGE_KEY = 'psychograph_params';

export function saveParams() {
  const meta = {
    title:  document.getElementById('pTitle').value,
    artist: document.getElementById('pArtist').value,
    bpm:    document.getElementById('pBpm').value,
    genre:  document.getElementById('pGenre').value,
    isLight: document.body.classList.contains('light-mode')
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...P, ...meta }));
}

export function loadParams(rebuildGrid, rebuildHistory, refreshBinMap) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const numKeys = ['rows','complexity','maxDisp','bowlExp','smoothing','freqRange',
                     'modSub','modKick','modMid','modHigh','modRms','modTrans',
                     'sphereSize', 'waveSpacing', 'polarSpacing', 'lpfCutoff', 'gain',
                     'lfoRate', 'lfoDepth', 'lfoOffset', 'lfo2Rate', 'lfo2Depth', 'lfo2Offset',
                     'lfoToDisp', 'lfoToBowl', 'lfoToZoom', 'lfoToOpacity', 'lfoToPolar', 'lfoToWave', 
                     'uiReactivity', 'colorCycle', 'morph'];
    for (const k of numKeys) if (saved[k] !== undefined) P[k] = +saved[k];
    if (saved.colorA) P.colorA = saved.colorA;
    if (saved.colorB) P.colorB = saved.colorB;
    if (saved.freqScale) P.freqScale = saved.freqScale;
    if (saved.exportPreset) P.exportPreset = saved.exportPreset;
    if (saved.exportOrientation) P.exportOrientation = saved.exportOrientation;
    if (saved.exportAspect) P.exportAspect = saved.exportAspect;
    if (saved.cycleMode) P.cycleMode = saved.cycleMode;
    if (saved.fastBoot !== undefined) P.fastBoot = !!saved.fastBoot;
    
    // Validate parameters to prevent NaN errors
    validateParams();
    if (saved.uiPalette) {
      P.uiPalette = saved.uiPalette;
      document.body.setAttribute('data-palette', P.uiPalette);
    }

    if (saved.isLight) document.body.classList.add('light-mode');

    const si = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    const ss = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    si('pFreqScale', P.freqScale); ss('vFreqScale', P.freqScale);
    si('pFreqRange', P.freqRange); ss('vFreqRange', P.freqRange);
    si('pSmoothing', P.smoothing); ss('vSmoothing', P.smoothing);
    si('pMaxDisp',   P.maxDisp);   ss('vMaxDisp',   P.maxDisp);
    si('pBowlExp',   P.bowlExp);   ss('vBowlExp',   P.bowlExp);
    si('pMorph',     P.morph);     ss('vMorph',     P.morph);
    
    si('pLfoWaveform', P.lfoWaveform);
    si('pLfoRate',   P.lfoRate);   ss('vLfoRate',   P.lfoRate);
    si('pLfoDepth',  P.lfoDepth);  ss('vLfoDepth',  P.lfoDepth);
    si('pLfoOffset', P.lfoOffset); ss('vLfoOffset', P.lfoOffset);

    si('pLfo2Waveform', P.lfo2Waveform);
    si('pLfo2Rate',   P.lfo2Rate);   ss('vLfo2Rate',   P.lfo2Rate);
    si('pLfo2Depth',  P.lfo2Depth);  ss('vLfo2Depth',  P.lfo2Depth);
    si('pLfo2Offset', P.lfo2Offset); ss('vLfo2Offset', P.lfo2Offset);

    si('pLfoToDisp', P.lfoToDisp); ss('vLfoToDisp', P.lfoToDisp);
    si('pLfoToBowl', P.lfoToBowl); ss('vLfoToBowl', P.lfoToBowl);
    si('pLfoToZoom', P.lfoToZoom); ss('vLfoToZoom', P.lfoToZoom);
    si('pLfoToOpacity', P.lfoToOpacity); ss('vLfoToOpacity', P.lfoToOpacity);
    si('pLfoToPolar', P.lfoToPolar); ss('vLfoToPolar', P.lfoToPolar);
    si('pLfoToWave', P.lfoToWave); ss('vLfoToWave', P.lfoToWave);

    si('pLfo2Waveform', P.lfo2Waveform);
    si('pLfo2Rate',   P.lfo2Rate);   ss('vLfo2Rate',   P.lfo2Rate);
    si('pLfo2Depth',  P.lfo2Depth);  ss('vLfo2Depth',  P.lfo2Depth);

    si('pRows',      P.rows);      ss('vRows',      P.rows);
    si('pComplexity',P.complexity); ss('vComplexity',P.complexity);
    si('pModSub',    P.modSub);    ss('vModSub',    P.modSub);
    si('pModKick',   P.modKick);   ss('vModKick',   P.modKick);
    si('pModMid',    P.modMid);    ss('vModMid',    P.modMid);
    si('pModHigh',   P.modHigh);   ss('vModHigh',   P.modHigh);
    si('pModRms',    P.modRms);    ss('vModRms',    P.modRms);
    si('pModTrans',  P.modTrans);  ss('vModTrans',  P.modTrans);
    
    si('pSphereSize', P.sphereSize);   ss('vSphereSize', P.sphereSize);
    si('pWaveSpacing', P.waveSpacing); ss('vWaveSpacing', P.waveSpacing);
    si('pPolarSpacing', P.polarSpacing); ss('vPolarSpacing', P.polarSpacing);

    // Map frequency back to 0.0-1.0 for the slider
    const lpfPos = Math.log10(P.lpfCutoff / 200) / Math.log10(20000 / 200);
    si('pLpfCutoff', lpfPos); 
    ss('vLpfCutoff', P.lpfCutoff >= 1000 ? (P.lpfCutoff/1000).toFixed(P.lpfCutoff >= 10000 ? 0 : 1)+'k' : P.lpfCutoff);
    
    si('pGain', P.gain); ss('vGain', P.gain);
    si('pColorA', P.colorA);
    si('pColorB', P.colorB);
    si('pColorCycle', P.colorCycle); ss('vColorCycle', P.colorCycle);
    si('pUiReactivity', P.uiReactivity); ss('vUiReactivity', P.uiReactivity);

    si('pCycleMode', P.cycleMode); ss('vCycleMode', P.cycleMode);

    si('pExportPreset', P.exportPreset); ss('vExportPreset', P.exportPreset);
    si('pExportOrient', P.exportOrientation); ss('vExportOrient', P.exportOrientation);
    si('pExportAspect', P.exportAspect); ss('vExportAspect', P.exportAspect);

    const fbEl = document.getElementById('pFastBoot');
    if (fbEl) fbEl.checked = !!P.fastBoot;

    if (saved.camStyles) {
      if (Array.isArray(saved.camStyles) && saved.camStyles.length > 0) {
        // New spherical format — load directly
        P.camStyles = saved.camStyles;
      } else if (saved.camStyles && typeof saved.camStyles === 'object' && !Array.isArray(saved.camStyles)) {
        // Migrate old Cartesian format { normal: {x,y,z,lookY}, ... } to spherical array
        P.camStyles = Object.entries(saved.camStyles).map(([id, cs]) => {
          const sph = cartToSpherical(cs.x ?? 0, cs.y ?? 5.5, cs.z ?? 9);
          const def = PRESET_DEFAULTS.find(d => d.id === id);
          return {
            id,
            name: def ? def.name : id.charAt(0).toUpperCase() + id.slice(1),
            az: sph.az, el: sph.el, dist: sph.dist,
            lookY: cs.lookY ?? -0.5,
          };
        });
      }
    }

    if (saved.title)  si('pTitle',  saved.title);
    else si('pTitle', '[TITLE]');
    
    if (saved.artist) si('pArtist', saved.artist);
    else si('pArtist', '[ARTIST]');
    
    if (saved.bpm)    si('pBpm',    saved.bpm);
    if (saved.genre)  si('pGenre',  saved.genre);
    updateTrackDisplay();
    rebuildGrid();
    rebuildHistory();
  } catch (_) {}
}

/* ── DOM binding helpers ──────────────────────────────────── */
export function bindRange(id, valId, key, onChange) {
  const el = document.getElementById(id), lbl = document.getElementById(valId);
  el.addEventListener('input', () => {
    P[key] = parseFloat(el.value);
    lbl.textContent = el.value;
    // Validate critical parameters to prevent NaN
    if (key === 'rows' || key === 'complexity') {
      validateParams();
      el.value = P[key]; // Update input to reflect validated value
      lbl.textContent = P[key];
    }
    if (onChange) onChange(P[key]);
    saveParams();
  });
}

export function bindSelect(id, valId, key, onChange) {
  const el = document.getElementById(id), lbl = document.getElementById(valId);
  el.addEventListener('change', () => {
    P[key] = el.value;
    lbl.textContent = el.value;
    if (onChange) onChange(P[key]);
    saveParams();
  });
}

export function bindText(id, cb) {
  document.getElementById(id).addEventListener('input', () => { if (cb) cb(); saveParams(); });
}

/* ── Track display ────────────────────────────────────────── */
export function updateTrackDisplay() {
  const title  = document.getElementById('pTitle').value.trim();
  const artist = document.getElementById('pArtist').value.trim();
  const bpm    = document.getElementById('pBpm').value.trim();
  const genre  = document.getElementById('pGenre').value.trim();
  const time   = document.getElementById('dispCurrent').textContent.trim();

  document.getElementById('dispTitle').textContent  = title;
  document.getElementById('dispArtist').textContent = artist;
  document.getElementById('dispBpm').textContent    = bpm;
  document.getElementById('dispGenre').textContent  = genre;

  document.getElementById('dispRule').style.display = title ? 'block' : 'none';

  const showPill = (pillId, divId, hasVal) => {
    document.getElementById(pillId).style.display = hasVal ? 'flex' : 'none';
    if (divId) document.getElementById(divId).style.display = hasVal ? 'block' : 'none';
  };
  showPill('pillTime',  'divTime',  !!time);
  showPill('pillBpm',   'divBpm',   !!bpm);
  showPill('pillGenre', null,       !!genre);

  document.getElementById('divTime').style.display = (!!time && (!!bpm || !!genre)) ? 'block' : 'none';
  document.getElementById('divBpm').style.display  = (!!bpm && !!genre) ? 'block' : 'none';
}

export function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function setTimeDisplay(cur, total) {
  document.getElementById('dispCurrent').textContent =
    total ? `${fmtTime(cur)} / ${fmtTime(total)}` : '';
  updateTrackDisplay();
}

/** Read current track metadata from DOM inputs */
export function getTrackMeta() {
  return {
    title:  document.getElementById('pTitle').value.trim(),
    artist: document.getElementById('pArtist').value.trim(),
    bpm:    document.getElementById('pBpm').value.trim(),
    genre:  document.getElementById('pGenre').value.trim(),
  };
}
