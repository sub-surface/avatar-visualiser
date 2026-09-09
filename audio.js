/**
 * audio.js — one owned audio graph for live, preview, and startup sources.
 */
import { FFT_SIZE } from './engine.js';
import { P } from './params.js';

let analyserL = null;
let analyserR = null;
let freqDataL = null;
let freqDataR = null;
let audioReady = false;
let audioStream = null;
let audioContext = null;
let ownsContext = false;
let lowPassFilter = null;
let gainNode = null;
let splitter = null;
let merger = null;
let monitorGain = null;

export function getAnalyserL() { return analyserL; }
export function getAnalyserR() { return analyserR; }
export function getFreqDataL() { return freqDataL; }
export function getFreqDataR() { return freqDataR; }
export function isAudioReady() { return audioReady; }
export function getLPF() { return lowPassFilter; }
export function getGainNode() { return gainNode; }
export function getAudioContext() { return audioContext; }

export async function getAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'audioinput');
}

function disconnect(node) {
  try { node?.disconnect(); } catch (_) {}
}

export function setMonitoring(enabled) {
  if (!monitorGain || !audioContext) return;
  monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, audioContext.currentTime, 0.01);
}

export function setupAnalyser(context, { monitor = true, owned = false } = {}) {
  if (analyserL && audioContext === context) {
    setMonitoring(monitor);
    return analyserL;
  }

  teardownGraph();
  audioContext = context;
  ownsContext = owned;

  gainNode = context.createGain();
  gainNode.gain.value = P.gain;

  lowPassFilter = context.createBiquadFilter();
  lowPassFilter.type = 'lowpass';
  lowPassFilter.frequency.value = P.lpfCutoff;
  lowPassFilter.Q.value = 0.7071; // Critical Butterworth damping prevents IIR filter explosions

  splitter = context.createChannelSplitter(2);
  merger = context.createChannelMerger(2);
  monitorGain = context.createGain();
  monitorGain.gain.value = monitor ? 1 : 0;

  // Brickwall safety limiter protects headphones/ears from digital spikes/transient clicks
  const safetyLimiter = context.createDynamicsCompressor();
  safetyLimiter.threshold.value = -1.0;
  safetyLimiter.knee.value = 0.0;
  safetyLimiter.ratio.value = 20.0;
  safetyLimiter.attack.value = 0.001;
  safetyLimiter.release.value = 0.05;

  analyserL = context.createAnalyser();
  analyserR = context.createAnalyser();
  analyserL.fftSize = analyserR.fftSize = FFT_SIZE;
  // AVATAR applies deterministic smoothing after FFT data is read.
  analyserL.smoothingTimeConstant = analyserR.smoothingTimeConstant = 0;

  lowPassFilter.connect(gainNode);
  gainNode.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  analyserL.connect(merger, 0, 0);
  analyserR.connect(merger, 0, 1);
  merger.connect(monitorGain);
  monitorGain.connect(safetyLimiter);
  safetyLimiter.connect(context.destination);

  freqDataL = new Uint8Array(analyserL.frequencyBinCount);
  freqDataR = new Uint8Array(analyserR.frequencyBinCount);
  audioReady = true;
  return analyserL;
}

export async function initAudio(deviceId = null, { monitor = false } = {}) {
  await stopAudio();
  const constraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
  audioStream = await navigator.mediaDevices.getUserMedia(constraints);
  const context = new (window.AudioContext || window.webkitAudioContext)();
  setupAnalyser(context, { monitor, owned: true });
  const source = context.createMediaStreamSource(audioStream);
  source.connect(lowPassFilter);
}

function teardownGraph() {
  disconnect(lowPassFilter);
  disconnect(gainNode);
  disconnect(splitter);
  disconnect(analyserL);
  disconnect(analyserR);
  disconnect(merger);
  disconnect(monitorGain);
  analyserL = null;
  analyserR = null;
  freqDataL = null;
  freqDataR = null;
  lowPassFilter = null;
  gainNode = null;
  splitter = null;
  merger = null;
  monitorGain = null;
  audioReady = false;
}

export async function stopAudio({ closeExternal = false } = {}) {
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }

  const context = audioContext;
  const shouldClose = context && (ownsContext || closeExternal);
  teardownGraph();
  audioContext = null;
  ownsContext = false;

  if (shouldClose && context.state !== 'closed') {
    try { await context.close(); } catch (_) {}
  }
}
