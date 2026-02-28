/**
 * envelopes.js — envelope followers, slew limiters, audio-reactive modulation, BPM detection.
 */
import { NUM_BINS, camera, material, _colA, _colB, _colScratch, CAM_BASE } from './engine.js';
import { P, updateTrackDisplay } from './params.js';

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

export function computeEnvelopes(fd) {
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
export function applyModulation() {
  camera.position.y    = CAM_BASE.y + env.mid * P.modMid;
  camera.position.z    = CAM_BASE.z - env.rms * P.modRms + env.kick * P.modKick;
  camera.lookAt(0, -0.5, 0);
  material.opacity     = 0.6 + env.trans * P.modTrans;
  material.transparent = true;
  _colScratch.lerpColors(_colA, _colB, Math.min(env.mid * 3.5, 1));
  material.color.copy(_colScratch);
}

export function modDisp()    { return P.maxDisp * (1 + env.sub * P.modSub); }

/* ── LFO ───────────────────────────────────────────────────── */
export let lfoPhase = 0;
export function lfoTick(dt) { lfoPhase = (lfoPhase + 2 * Math.PI * P.lfoRate * dt) % (2 * Math.PI); }
export function modBowlExp() { return P.bowlExp + P.lfoDepth * Math.sin(lfoPhase) - env.high * P.modHigh; }

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
pBpmEl.addEventListener('focus', () => { _bpmUserEdited = true; });
pBpmEl.addEventListener('input', () => {
  if (!pBpmEl.value.trim()) { _bpmUserEdited = false; _bpmSmoothed = 0; _bpmIntervals = []; }
});

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
