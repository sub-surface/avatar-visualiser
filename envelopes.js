/**
 * envelopes.js — envelope followers, slew limiters, audio-reactive modulation, BPM detection.
 */
import { NUM_BINS, camera, material, _colA, _colB, _colScratch, CAM_BASE } from './engine.js';
import { P, updateTrackDisplay } from './params.js';
import { shouldModulate } from './cam.js';

/* ── Slew-limited follower ─────────────────────────────────── */
export function slew(current, target, attack, release) {
  return target > current
    ? current + (1 - attack)  * (target - current)
    : current + (1 - release) * (target - current);
}

/* ── Envelope followers (0..1) ─────────────────────────────── */
export const env = {
  sub:   0, kick:  0, mid:   0,
  high:  0, rms:   0, trans: 0,
};

let prevRms = 0;

export const ATK = 0.05;
export const REL = {
  sub:   0.82, kick:  0.70, mid:   0.88,
  high:  0.90, rms:   0.97, trans: 0.60,
};

export function computeEnvelopes(fdL, fdR) {
  // Average L/R for global envelopes
  const fd = new Uint8Array(NUM_BINS);
  for (let k = 0; k < NUM_BINS; k++) fd[k] = (fdL[k] + fdR[k]) / 2;

  let subSum = 0;
  for (let k = 1; k <= 6; k++) subSum += fd[k];
  const subRaw = subSum / (6 * 255);

  let kickPeak = 0;
  for (let k = 4; k <= 9; k++) if (fd[k] > kickPeak) kickPeak = fd[k];
  const kickRaw = kickPeak / 255;

  let midSum = 0;
  for (let k = 23; k <= 186; k++) midSum += fd[k];
  const midRaw = midSum / (164 * 255);

  let highSum = 0;
  for (let k = 279; k <= 651; k++) highSum += fd[k];
  const highRaw = highSum / (373 * 255);

  let sq = 0;
  for (let k = 0; k < NUM_BINS; k++) sq += (fd[k] / 255) ** 2;
  const rmsRaw = Math.sqrt(sq / NUM_BINS);

  const delta    = Math.max(0, rmsRaw - prevRms);
  prevRms        = rmsRaw;
  const transRaw = Math.min(delta * 8, 1);

  env.sub   = slew(env.sub,   subRaw,   ATK, REL.sub);
  env.kick  = slew(env.kick,  kickRaw,  ATK, REL.kick);
  env.mid   = slew(env.mid,   midRaw,   ATK, REL.mid);
  env.high  = slew(env.high,  highRaw,  ATK, REL.high);
  env.rms   = slew(env.rms,   rmsRaw,   ATK, REL.rms);
  env.trans = slew(env.trans, transRaw, ATK, REL.trans);
}

export function computeEnvelopesExport(fd, expEnv, expPrevRms) {
  let subSum = 0; for (let k = 1; k <= 6; k++) subSum += fd[k];
  const subRaw = subSum / (6 * 255);
  let kickPeak = 0; for (let k = 4; k <= 9; k++) if (fd[k] > kickPeak) kickPeak = fd[k];
  const kickRaw = kickPeak / 255;
  let midSum = 0; for (let k = 23; k <= 186; k++) midSum += fd[k];
  const midRaw = midSum / (164 * 255);
  let highSum = 0; for (let k = 279; k <= 651; k++) highSum += fd[k];
  const highRaw = highSum / (373 * 255);
  let sq = 0; for (let k = 0; k < NUM_BINS; k++) sq += (fd[k] / 255) ** 2;
  const rmsRaw = Math.sqrt(sq / NUM_BINS);
  const transRaw = Math.min(Math.max(0, rmsRaw - expPrevRms) * 8, 1);

  expEnv.sub   = slew(expEnv.sub,   subRaw,   ATK, REL.sub);
  expEnv.kick  = slew(expEnv.kick,  kickRaw,  ATK, REL.kick);
  expEnv.mid   = slew(expEnv.mid,   midRaw,   ATK, REL.mid);
  expEnv.high  = slew(expEnv.high,  highRaw,  ATK, REL.high);
  expEnv.rms   = slew(expEnv.rms,   rmsRaw,   ATK, REL.rms);
  expEnv.trans = slew(expEnv.trans, transRaw, ATK, REL.trans);
  return rmsRaw;
}

/* ── Modulation ────────────────────────────────────────────── */
let lfoPhase1 = 0;
let lfoPhase2 = 0;

export function lfoTick(dt) { 
  const bpm = parseFloat(P.bpm) || 120;
  const bps = bpm / 60; // beats per second
  lfoPhase1 = (lfoPhase1 + 2 * Math.PI * P.lfoRate * bps * dt) % (2 * Math.PI); 
  lfoPhase2 = (lfoPhase2 + 2 * Math.PI * P.lfo2Rate * bps * dt) % (2 * Math.PI); 
}

function _calcLfo(phase, waveform, depth, offset) {
  const t = phase / (2 * Math.PI);
  let raw = 0;
  if (waveform === 'sine')      raw = Math.sin(phase);
  else if (waveform === 'square')   raw = t < 0.5 ? 1 : -1;
  else if (waveform === 'sawtooth') raw = (t * 2) - 1;
  else if (waveform === 'triangle') raw = t < 0.5 ? (t * 4) - 1 : 3 - (t * 4);
  return (raw * depth) + offset;
}

export function getLfoVal()  { return _calcLfo(lfoPhase1, P.lfoWaveform, P.lfoDepth, P.lfoOffset); }
export function getLfo2Val() { return _calcLfo(lfoPhase2, P.lfo2Waveform, P.lfo2Depth, P.lfo2Offset); }

export function applyModulation() {
  const lfo = getLfoVal();
  
  if (shouldModulate()) {
    camera.position.y    = CAM_BASE.y + env.mid * P.modMid;
    camera.position.z    = CAM_BASE.z - (env.rms * P.modRms + lfo * P.lfoToZoom) + env.kick * P.modKick;
    camera.lookAt(0, -0.5, 0);
  }
  
  const targetOp       = 0.6 + env.trans * P.modTrans + lfo * P.lfoToOpacity * 0.3;
  material.opacity     = Math.max(0.1, Math.min(1, targetOp));
  material.transparent = true;
  _colScratch.lerpColors(_colA, _colB, Math.min(env.mid * 3.5, 1));
  material.color.copy(_colScratch);
}

export function modDisp() { 
  const result = P.maxDisp * (1 + env.sub * P.modSub + getLfoVal() * P.lfoToDisp);
  // Ensure result is always finite
  if (!isFinite(result)) {
    console.error('[envelopes.modDisp] ERROR: non-finite result', result, {maxDisp: P.maxDisp, env_sub: env.sub, modSub: P.modSub});
    return P.maxDisp || 2.2; // Fallback to default
  }
  return result;
}

export function modBowlExp() { 
  const result = P.bowlExp - env.high * P.modHigh + getLfoVal() * P.lfoToBowl;
  if (!isFinite(result)) {
    console.error('[envelopes.modBowlExp] ERROR: non-finite result', result);
    return P.bowlExp || 2.0;
  }
  return result;
}

export function modPolarSpacing() { 
  const result = P.polarSpacing + getLfoVal() * P.lfoToPolar;
  if (!isFinite(result)) {
    console.error('[envelopes.modPolarSpacing] ERROR: non-finite result', result);
    return P.polarSpacing || -3.0;
  }
  return result;
}

export function modWaveSpacing() { 
  const result = P.waveSpacing + getLfoVal() * P.lfoToWave;
  if (!isFinite(result)) {
    console.error('[envelopes.modWaveSpacing] ERROR: non-finite result', result);
    return P.waveSpacing || 0.4;
  }
  return result;
}

/* ── BPM auto-detection ───────────────────────────────────── */
const BPM_ONSET_THRESH = 0.35;
const BPM_REFRACTORY   = 0.25;
const BPM_HISTORY      = 24;
const BPM_MIN          = 60;
const BPM_MAX          = 200;

let _bpmPrevKick   = 0;
let _bpmLastOnset  = 0;
let _bpmIntervals  = [];
let _bpmSmoothed   = 0;
let _bpmUserEdited = false;
let _bpmClockSec   = 0;

const pBpmEl = document.getElementById('pBpm');
if (pBpmEl) {
  pBpmEl.addEventListener('focus', () => { _bpmUserEdited = true; });
  pBpmEl.addEventListener('input', () => {
    if (!pBpmEl.value.trim()) { _bpmUserEdited = false; _bpmSmoothed = 0; _bpmIntervals = []; }
  });
}

export function resetBpmAuto() {
  _bpmUserEdited = false;
  _bpmSmoothed = 0;
  _bpmIntervals = [];
  _bpmLastOnset = 0;
  logStatus('BPM Auto-detect resynced');
}

export function bpmTick(dt) {
  _bpmClockSec += dt;
  const kick = env.kick;

  if (kick > BPM_ONSET_THRESH && _bpmPrevKick <= BPM_ONSET_THRESH) {
    const gap = _bpmClockSec - _bpmLastOnset;
    if (gap > BPM_REFRACTORY && _bpmLastOnset > 0) {
      _bpmIntervals.push(gap);
      if (_bpmIntervals.length > BPM_HISTORY) _bpmIntervals.shift();
    }
    _bpmLastOnset = _bpmClockSec;
  }
  _bpmPrevKick = kick;

  if (_bpmIntervals.length >= 4 && !_bpmUserEdited) {
    const sorted = [..._bpmIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let bpm = 60 / median;
    while (bpm < BPM_MIN) bpm *= 2;
    while (bpm > BPM_MAX) bpm /= 2;
    _bpmSmoothed = _bpmSmoothed ? _bpmSmoothed * 0.85 + bpm * 0.15 : bpm;
    const rounded = Math.round(_bpmSmoothed);
    if (pBpmEl.value !== String(rounded)) {
      pBpmEl.value = rounded;
      updateTrackDisplay();
    }
  }
}
