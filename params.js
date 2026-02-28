/**
 * params.js — P object, localStorage persistence, DOM bindings, track display.
 */

/* ── Parameters ────────────────────────────────────────────── */
export const P = {
  rows: 60, cols: 128,
  maxDisp: 2.2, bowlExp: 2.0,
  lfoDepth: 0.0, lfoRate: 0.12,
  smoothing: 0.55, freqScale: 'dnb', freqRange: 0.55,
  modSub:   0.5,
  modKick:  0.8,
  modMid:   0.6,
  modHigh:  0.8,
  modRms:   0.5,
  modTrans: 0.4,
  exportPreset: 'standard',
  exportOrientation: 'horizontal',
};

/* ── localStorage persistence ─────────────────────────────── */
const STORAGE_KEY = 'psychograph_params';

export function saveParams() {
  const meta = {
    title:  document.getElementById('pTitle').value,
    artist: document.getElementById('pArtist').value,
    bpm:    document.getElementById('pBpm').value,
    genre:  document.getElementById('pGenre').value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...P, ...meta }));
}

export function loadParams(rebuildGrid, rebuildHistory, refreshBinMap) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const numKeys = ['rows','cols','maxDisp','bowlExp','lfoDepth','lfoRate','smoothing','freqRange',
                     'modSub','modKick','modMid','modHigh','modRms','modTrans'];
    for (const k of numKeys) if (saved[k] !== undefined) P[k] = +saved[k];
    if (saved.freqScale) P.freqScale = saved.freqScale;
    if (saved.exportPreset) P.exportPreset = saved.exportPreset;
    if (saved.exportOrientation) P.exportOrientation = saved.exportOrientation;

    const si = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    const ss = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    si('pFreqScale', P.freqScale); ss('vFreqScale', P.freqScale);
    si('pFreqRange', P.freqRange); ss('vFreqRange', P.freqRange);
    si('pSmoothing', P.smoothing); ss('vSmoothing', P.smoothing);
    si('pMaxDisp',   P.maxDisp);   ss('vMaxDisp',   P.maxDisp);
    si('pBowlExp',   P.bowlExp);   ss('vBowlExp',   P.bowlExp);
    si('pLfoDepth',  P.lfoDepth);  ss('vLfoDepth',  P.lfoDepth);
    si('pLfoRate',   P.lfoRate);   ss('vLfoRate',   P.lfoRate);
    si('pRows',      P.rows);      ss('vRows',      P.rows);
    si('pCols',      P.cols);      ss('vCols',      P.cols);
    si('pModSub',    P.modSub);    ss('vModSub',    P.modSub);
    si('pModKick',   P.modKick);   ss('vModKick',   P.modKick);
    si('pModMid',    P.modMid);    ss('vModMid',    P.modMid);
    si('pModHigh',   P.modHigh);   ss('vModHigh',   P.modHigh);
    si('pModRms',    P.modRms);    ss('vModRms',    P.modRms);
    si('pModTrans',  P.modTrans);  ss('vModTrans',  P.modTrans);
    si('pExportPreset', P.exportPreset); ss('vExportPreset', P.exportPreset);
    si('pExportOrient', P.exportOrientation); ss('vExportOrient', P.exportOrientation);

    if (saved.title)  si('pTitle',  saved.title);
    if (saved.artist) si('pArtist', saved.artist);
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
