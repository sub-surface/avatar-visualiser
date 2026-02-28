/**
 * vis/shared.js — shared state for all visualiser modes.
 * History ring buffer, bin map, A-weight gains.
 */
import { NUM_BINS, FFT_SIZE } from '../engine.js';
import { P, getCols } from '../params.js';
import { buildBinMap, buildAWeightGain } from '../dsp.js';

/* ── DSP tables ────────────────────────────────────────────── */
export const aWeightGain = buildAWeightGain(NUM_BINS, FFT_SIZE, 44100);
export let   binMap      = buildBinMap(P.freqScale, (getCols()) / 2, NUM_BINS, P.freqRange, 44100);

export function refreshBinMap() {
  const cols = getCols();
  binMap = buildBinMap(P.freqScale, cols / 2, NUM_BINS, P.freqRange, 44100);
}

/* ── History ring buffer ───────────────────────────────────── */
export const histBuf = [];
export let   histHead = 0;

export function rebuildHistory() {
  histBuf.length = 0;
  for (let i = 0; i < P.rows; i++) histBuf.push(new Float32Array(NUM_BINS));
  histHead = 0;
}
rebuildHistory();

export function pushHistory(fd) {
  histHead = (histHead + P.rows - 1) % P.rows;
  const row = histBuf[histHead];
  
  // Defensive: validate before storing
  for (let k = 0; k < NUM_BINS; k++) {
    const magnitude = fd[k] / 255;
    const gain = aWeightGain[k];
    let value = magnitude * gain;
    
    // Clamp to valid range to prevent NaN propagation
    if (!isFinite(value)) {
      console.warn('[shared.pushHistory] Non-finite value prevented at bin', k, 'magnitude:', magnitude, 'gain:', gain);
      value = 0;
    }
    value = Math.max(0, Math.min(1, value)); // Clamp 0..1
    row[k] = value;
  }
}

/** Set histHead (used by export to manage its own history) */
export function setHistHead(v) { histHead = v; }
