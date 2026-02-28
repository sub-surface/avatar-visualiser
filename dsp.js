/**
 * dsp.js — pure DSP functions shared by index.html and tests.html
 * No DOM, no Three.js, no side effects. All functions are exported.
 */

/* ── Hann window ─────────────────────────────────────────────── */
export function applyHannWindow(buf) {
  const N = buf.length;
  for (let i = 0; i < N; i++) {
    buf[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
}

/* ── Radix-2 Cooley-Tukey FFT (in-place) ────────────────────── */
export function fftRadix2(re, im) {
  const N = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k],           uIm = im[i + k];
        const vRe = re[i + k + len/2] * curRe - im[i + k + len/2] * curIm;
        const vIm = re[i + k + len/2] * curIm + im[i + k + len/2] * curRe;
        re[i + k]         = uRe + vRe;  im[i + k]         = uIm + vIm;
        re[i + k + len/2] = uRe - vRe;  im[i + k + len/2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/* ── FFT → Uint8Array bins (matches Web Audio AnalyserNode) ─── */
// minDecibels = -100, maxDecibels = -30 (Web Audio defaults)
const WA_MIN_DB = -100;
const WA_MAX_DB = -30;

export function computeFFTBins(pcmWindow) {
  const N  = pcmWindow.length;
  const re = new Float32Array(pcmWindow);
  const im = new Float32Array(N);
  applyHannWindow(re);
  fftRadix2(re, im);
  const numBins = N / 2;
  const out     = new Uint8Array(numBins);
  for (let k = 0; k < numBins; k++) {
    const mag     = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    const db      = mag > 0 ? 20 * Math.log10(mag) : WA_MIN_DB;
    const clamped = Math.max(WA_MIN_DB, Math.min(WA_MAX_DB, db));
    out[k]        = Math.round(((clamped - WA_MIN_DB) / (WA_MAX_DB - WA_MIN_DB)) * 255);
  }
  return out;
}

/* ── Frequency bin lookup table ──────────────────────────────── */
/**
 * Build a Uint16Array of length halfCols mapping each column position
 * to a frequency bin index, using the given scale.
 *
 * @param {'linear'|'log'|'dnb'} scale
 * @param {number} halfCols   - number of unique column positions (COLS/2)
 * @param {number} numBins    - total FFT bins (FFT_SIZE/2)
 * @param {number} freqRange  - 0..1 fraction of spectrum to use
 * @param {number} sr         - sample rate in Hz
 */
export function buildBinMap(scale, halfCols, numBins, freqRange, sr) {
  const map = new Uint16Array(halfCols);
  const nyq = sr / 2;
  const hzPerBin = nyq / numBins;

  for (let c = 0; c < halfCols; c++) {
    const t = halfCols > 1 ? c / (halfCols - 1) : 0; // 0..1
    let f;

    if (scale === 'linear') {
      f = t * freqRange * nyq;

    } else if (scale === 'log') {
      const fMin = 20;
      const fMax = freqRange * nyq;
      f = fMin * Math.pow(fMax / fMin, t);

    } else {
      // 'dnb' — piecewise curve tuned for Jungle/DnB:
      //   0.00–0.25 → 40–180 Hz   (sub/kick body)
      //   0.25–0.75 → 500–6000 Hz (amen, snare, hats) — log within segment
      //   0.75–1.00 → 6000–16000 Hz (air, top-end shimmer)
      if (t < 0.25) {
        f = 40 + (t / 0.25) * (180 - 40);
      } else if (t < 0.75) {
        const s = (t - 0.25) / 0.5;
        f = 500 * Math.pow(6000 / 500, s);
      } else {
        const s = (t - 0.75) / 0.25;
        f = 6000 + s * (16000 - 6000);
      }
    }

    const bin = Math.round(f / hzPerBin);
    map[c] = Math.min(Math.max(bin, 0), numBins - 1);
  }

  return map;
}

/* ── Bowl falloff factor ─────────────────────────────────────── */
/**
 * Returns a 0..1 multiplier for row r in a grid of totalRows.
 * 1.0 at the centre row, 0.0 at both edges.
 * @param {number} r
 * @param {number} totalRows
 * @param {number} exp  - BOWL_EXP, higher = sharper crater walls
 */
export function bowlFactor(r, totalRows, exp) {
  const t    = r / (totalRows - 1);             // 0..1
  const dist = Math.abs(t - 0.5) * 2;           // 0=centre, 1=edges
  return Math.pow(1.0 - dist, exp);
}

/* ── A-weighting gain curve ──────────────────────────────────── */
/**
 * Build a Float32Array of per-bin A-weighting gains, blended 50/50
 * with a flat (unity) response. Peak ≈ 1.0 at ~3.5kHz.
 * @param {number} numBins
 * @param {number} fftSize
 * @param {number} sr
 */
export function buildAWeightGain(numBins, fftSize, sr) {
  const gain = new Float32Array(numBins);
  let peak = 0;
  for (let k = 0; k < numBins; k++) {
    const f  = Math.max(1, k * sr / fftSize);
    const f2 = f * f, f4 = f2 * f2;
    const num  = 1.562339 * f4;
    const den  = (f2 + 107.65265) * (f2 + 737.86223);
    const aden = (f2 + 20.598997) * (f2 + 12194.217);
    const raw  = (num / (den * aden * aden)) * 1e16;
    gain[k] = raw;
    if (raw > peak) peak = raw;
  }
  for (let k = 0; k < numBins; k++) {
    gain[k] = 0.5 + 0.5 * (gain[k] / peak);
  }
  return gain;
}
