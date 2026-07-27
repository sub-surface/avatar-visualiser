import { buildAWeightGain, computeFFTBinsInto } from './dsp.js';

export const SIGNAL_FFT_SIZE = 2048;
export const SIGNAL_BIN_COUNT = SIGNAL_FFT_SIZE / 2;

const TWO_PI = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function waveform(phase, shape) {
  const t = phase / TWO_PI;
  if (shape === 'square') return t < 0.5 ? 1 : -1;
  if (shape === 'sawtooth') return t * 2 - 1;
  if (shape === 'triangle') return t < 0.5 ? t * 4 - 1 : 3 - t * 4;
  return Math.sin(phase);
}

function follower(current, target, attackSeconds, releaseSeconds, dt) {
  const tau = target > current ? attackSeconds : releaseSeconds;
  const amount = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.0001, tau));
  return current + (target - current) * amount;
}

function bandBounds(lowHz, highHz, sampleRate, fftSize, binCount) {
  const low = clamp(Math.floor((lowHz * fftSize) / sampleRate), 0, binCount - 1);
  const high = clamp(Math.ceil((highHz * fftSize) / sampleRate), low, binCount - 1);
  return [low, high];
}

function averageBand(data, bounds) {
  let sum = 0;
  for (let index = bounds[0]; index <= bounds[1]; index++) sum += data[index];
  return sum / ((bounds[1] - bounds[0] + 1) * 255);
}

function peakBand(data, bounds) {
  let peak = 0;
  for (let index = bounds[0]; index <= bounds[1]; index++) peak = Math.max(peak, data[index]);
  return peak / 255;
}

export class SharedAnalyzer {
  constructor(fftSize = SIGNAL_FFT_SIZE) {
    if ((fftSize & (fftSize - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.fftSize = fftSize;
    this.binCount = fftSize / 2;
    this.sampleRate = 44100;
    this.phase1 = 0;
    this.phase2 = 0;
    this.previousRms = 0;
    this.frameIndex = 0;

    this.pcmL = new Float32Array(fftSize);
    this.pcmR = new Float32Array(fftSize);
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.rawL = new Uint8Array(this.binCount);
    this.rawR = new Uint8Array(this.binCount);
    this.smoothL = new Float32Array(this.binCount);
    this.smoothR = new Float32Array(this.binCount);
    this.freqL = new Uint8Array(this.binCount);
    this.freqR = new Uint8Array(this.binCount);
    this.mono = new Uint8Array(this.binCount);
    this.weight = buildAWeightGain(this.binCount, fftSize, this.sampleRate);

    this.frame = {
      index: 0,
      time: 0,
      dt: 0,
      sampleRate: this.sampleRate,
      freqL: this.freqL,
      freqR: this.freqR,
      mono: this.mono,
      weight: this.weight,
      lfo1: 0,
      lfo2: 0,
      effectiveCutoff: 20000,
      onset: false,
      env: { sub: 0, kick: 0, mid: 0, high: 0, rms: 0, trans: 0 },
    };
    this.configureSampleRate(this.sampleRate);
  }

  configureSampleRate(sampleRate) {
    const next = Number.isFinite(sampleRate) ? sampleRate : 44100;
    if (next === this.sampleRate && this.bands) return;
    this.sampleRate = next;
    this.weight = buildAWeightGain(this.binCount, this.fftSize, next);
    this.frame.weight = this.weight;
    this.frame.sampleRate = next;
    this.bands = {
      sub: bandBounds(20, 140, next, this.fftSize, this.binCount),
      kick: bandBounds(55, 200, next, this.fftSize, this.binCount),
      mid: bandBounds(500, 4000, next, this.fftSize, this.binCount),
      high: bandBounds(6000, Math.min(16000, next / 2), next, this.fftSize, this.binCount),
    };
  }

  reset() {
    this.phase1 = 0;
    this.phase2 = 0;
    this.previousRms = 0;
    this.frameIndex = 0;
    this.freqL.fill(0);
    this.freqR.fill(0);
    this.smoothL.fill(0);
    this.smoothR.fill(0);
    this.mono.fill(0);
    Object.keys(this.frame.env).forEach((key) => { this.frame.env[key] = 0; });
    this.frame.onset = false;
  }

  stepPcm(channelL, channelR, sampleIndex, options) {
    const right = channelR ?? channelL;
    const start = Math.floor(sampleIndex) - this.fftSize;
    for (let offset = 0; offset < this.fftSize; offset++) {
      const index = start + offset;
      this.pcmL[offset] = index >= 0 && index < channelL.length ? channelL[index] : 0;
      this.pcmR[offset] = index >= 0 && index < right.length ? right[index] : 0;
    }
    computeFFTBinsInto(this.pcmL, this.re, this.im, this.rawL);
    computeFFTBinsInto(this.pcmR, this.re, this.im, this.rawR);
    return this.stepBins(this.rawL, this.rawR, options);
  }

  stepBins(rawL, rawR, {
    dt = 1 / 60,
    time = 0,
    sampleRate = this.sampleRate,
    params,
  }) {
    this.configureSampleRate(sampleRate);
    const safeDt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 1 / 1000, 0.25);
    const bpm = clamp(Number(params.bpm) || 120, 20, 400);
    const beatsPerSecond = bpm / 60;
    this.phase1 = (this.phase1 + TWO_PI * params.lfoRate * beatsPerSecond * safeDt) % TWO_PI;
    this.phase2 = (this.phase2 + TWO_PI * params.lfo2Rate * beatsPerSecond * safeDt) % TWO_PI;
    const lfo1 = waveform(this.phase1, params.lfoWaveform) * params.lfoDepth + params.lfoOffset;
    const lfo2 = waveform(this.phase2, params.lfo2Waveform) * params.lfo2Depth + params.lfo2Offset;

    const effectiveCutoff = clamp(params.lpfCutoff * Math.pow(2, lfo2 * 2), 20, sampleRate / 2);
    const smoothBase = clamp(Number(params.smoothing) || 0, 0, 0.999);
    const smooth = Math.pow(smoothBase, safeDt * 60);
    const gain = clamp(Number(params.gain) || 0, 0, 4);

    let squareSum = 0;
    for (let index = 0; index < this.binCount; index++) {
      const frequency = index * sampleRate / this.fftSize;
      const ratio = frequency / Math.max(20, effectiveCutoff);
      const lowPass = 1 / Math.sqrt(1 + Math.pow(ratio, 8));
      const left = clamp(rawL[index] * gain * lowPass, 0, 255);
      const right = clamp(rawR[index] * gain * lowPass, 0, 255);
      this.smoothL[index] = smooth * this.smoothL[index] + (1 - smooth) * left;
      this.smoothR[index] = smooth * this.smoothR[index] + (1 - smooth) * right;
      this.freqL[index] = Math.round(this.smoothL[index]);
      this.freqR[index] = Math.round(this.smoothR[index]);
      const mono = Math.round((this.freqL[index] + this.freqR[index]) * 0.5);
      this.mono[index] = mono;
      squareSum += (mono / 255) ** 2;
    }

    const raw = {
      sub: averageBand(this.mono, this.bands.sub),
      kick: peakBand(this.mono, this.bands.kick),
      mid: averageBand(this.mono, this.bands.mid),
      high: averageBand(this.mono, this.bands.high),
      rms: Math.sqrt(squareSum / this.binCount),
    };
    raw.trans = clamp((raw.rms - this.previousRms) * 8, 0, 1);
    this.previousRms = raw.rms;

    const env = this.frame.env;
    env.sub = follower(env.sub, raw.sub, 0.025, 0.22, safeDt);
    env.kick = follower(env.kick, raw.kick, 0.02, 0.12, safeDt);
    env.mid = follower(env.mid, raw.mid, 0.03, 0.35, safeDt);
    env.high = follower(env.high, raw.high, 0.03, 0.4, safeDt);
    env.rms = follower(env.rms, raw.rms, 0.04, 0.8, safeDt);
    env.trans = follower(env.trans, raw.trans, 0.01, 0.09, safeDt);

    this.frame.index = this.frameIndex++;
    this.frame.time = time;
    this.frame.dt = safeDt;
    this.frame.lfo1 = lfo1;
    this.frame.lfo2 = lfo2;
    this.frame.effectiveCutoff = effectiveCutoff;
    this.frame.onset = raw.trans > 0.16 && env.kick > 0.18;
    return this.frame;
  }
}

export function createSeededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
