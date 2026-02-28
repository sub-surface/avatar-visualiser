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

/**
 * Same as computeFFTBins but writes into caller-supplied scratch buffers.
 * No heap allocations — safe to call in a tight export loop.
 * @param {Float32Array} pcmWindow  source PCM (read-only, copied into re)
 * @param {Float32Array} re         scratch — length N (overwritten)
 * @param {Float32Array} im         scratch — length N (overwritten, zeroed on entry)
 * @param {Uint8Array}   out        destination bins — length N/2
 */
export function computeFFTBinsInto(pcmWindow, re, im, out) {
  const N = pcmWindow.length;
  re.set(pcmWindow);
  im.fill(0);
  applyHannWindow(re);
  fftRadix2(re, im);
  const numBins = N / 2;
  for (let k = 0; k < numBins; k++) {
    const mag     = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    const db      = mag > 0 ? 20 * Math.log10(mag) : WA_MIN_DB;
    const clamped = Math.max(WA_MIN_DB, Math.min(WA_MAX_DB, db));
    out[k]        = Math.round(((clamped - WA_MIN_DB) / (WA_MAX_DB - WA_MIN_DB)) * 255);
  }
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

    } else if (scale === 'dnb') {
      // Genre-optimised: sub-bass | mids | treble
      const q1 = Math.floor(halfCols * 0.25);
      const q3 = Math.floor(halfCols * 0.75);
      if (c < q1) {
        const u = q1 > 1 ? c / (q1 - 1) : 0;
        f = 40 + u * (180 - 40);
      } else if (c < q3) {
        const u = (q3 - q1) > 1 ? (c - q1) / (q3 - q1 - 1) : 0;
        f = 500 + u * (6000 - 500);
      } else {
        const u = (halfCols - q3) > 1 ? (c - q3) / (halfCols - q3 - 1) : 0;
        f = 6000 + u * (16000 - 6000);
      }
    } else {
      // 'log'
      const fMin = 20;
      const fMax = freqRange * nyq;
      f = fMin * Math.pow(fMax / fMin, t);
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
  
  // Base power curve
  let f = Math.pow(1.0 - dist, exp);
  
  // Complexity: as exp increases beyond 2.5, introduce a "plateau" or "double-peak" effect
  if (exp > 2.5) {
    const mesa = Math.sin(dist * Math.PI);
    f *= (1.0 + (exp - 2.5) * 0.3 * mesa);
  }
  
  return Math.max(0, Math.min(1, f));
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
  // IEC 61672 A-weighting: peaks ~2.5 kHz, blended 50/50 with flat response
  const P1  = 12194.0 * 12194.0;  // 12194 Hz pole (squared)
  const P2  = 20.6    * 20.6;     //  20.6 Hz pole (squared)
  const P3A = 107.7   * 107.7;    // 107.7 Hz pole (squared)
  const P3B = 737.9   * 737.9;    // 737.9 Hz pole (squared)
  const gain = new Float32Array(numBins);
  let peak = 0;
  for (let k = 0; k < numBins; k++) {
    const f  = Math.max(1, k * sr / fftSize);
    const f2 = f * f;
    const raw = (P1 * f2 * f2) /
                ((f2 + P2) * Math.sqrt((f2 + P3A) * (f2 + P3B)) * (f2 + P1));
    gain[k] = raw;
    if (raw > peak) peak = raw;
  }
  for (let k = 0; k < numBins; k++) {
    gain[k] = 0.5 + 0.5 * (gain[k] / peak);
  }
  return gain;
}
