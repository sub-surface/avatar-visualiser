/**
 * vis/shared.js — shared state for all visualiser modes.
 * History ring buffer, bin map, A-weight gains.
 */
import { NUM_BINS, FFT_SIZE } from '../engine.js';
import { P } from '../params.js';
import { buildBinMap, buildAWeightGain } from '../dsp.js';

/* ── DSP tables ────────────────────────────────────────────── */
export const aWeightGain = buildAWeightGain(NUM_BINS, FFT_SIZE, 44100);
export let   binMap      = buildBinMap(P.freqScale, P.cols / 2, NUM_BINS, P.freqRange, 44100);

export function refreshBinMap() {
  binMap = buildBinMap(P.freqScale, P.cols / 2, NUM_BINS, P.freqRange, 44100);
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
  for (let k = 0; k < NUM_BINS; k++) row[k] = (fd[k] / 255) * aWeightGain[k];
}

/** Set histHead (used by export to manage its own history) */
export function setHistHead(v) { histHead = v; }
