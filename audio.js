/**
 * audio.js — live microphone audio input.
 */
import { FFT_SIZE } from './engine.js';
import { P } from './params.js';

let analyserL = null;
let analyserR = null;
let freqDataL = null;
let freqDataR = null;
let audioReady = false;
let _audioStream = null;
let lowPassFilter = null;
let gainNode = null;

export function getAnalyserL() { return analyserL; }
export function getAnalyserR() { return analyserR; }
export function getFreqDataL() { return freqDataL; }
export function getFreqDataR() { return freqDataR; }
export function isAudioReady() { return audioReady; }
export function getLPF()       { return lowPassFilter; }
export function getGainNode()  { return gainNode; }

export async function getAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}

export function setupAnalyser(ctx) {
  if (analyserL) return analyserL;
  
  gainNode = ctx.createGain();
  gainNode.gain.value = P.gain;

  lowPassFilter = ctx.createBiquadFilter();
  lowPassFilter.type = 'lowpass';
  lowPassFilter.frequency.value = P.lpfCutoff;

  const splitter = ctx.createChannelSplitter(2);

  analyserL = ctx.createAnalyser();
  analyserR = ctx.createAnalyser();
  analyserL.fftSize = analyserR.fftSize = FFT_SIZE;
  analyserL.smoothingTimeConstant = analyserR.smoothingTimeConstant = P.smoothing;
  
  // Chain: Source -> LPF -> Gain -> Splitter -> Analysers -> Destination
  lowPassFilter.connect(gainNode);
  gainNode.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);

  analyserL.connect(ctx.destination);
  analyserR.connect(ctx.destination);

  freqDataL = new Uint8Array(analyserL.frequencyBinCount);
  freqDataR = new Uint8Array(analyserR.frequencyBinCount);
  audioReady = true;
  return analyserL;
}

export async function initAudio(deviceId = null) {
  stopAudio(); // Ensure previous stream is closed
  const constraints = { 
    audio: deviceId ? { deviceId: { exact: deviceId } } : true, 
    video: false 
  };
  _audioStream = await navigator.mediaDevices.getUserMedia(constraints);
  const ctx    = new (window.AudioContext || window.webkitAudioContext)();
  setupAnalyser(ctx);
  const src    = ctx.createMediaStreamSource(_audioStream);
  src.connect(lowPassFilter);
}

export function stopAudio() {
  if (_audioStream) { _audioStream.getTracks().forEach(t => t.stop()); _audioStream = null; }
  audioReady = false; 
  analyserL = analyserR = null; 
  freqDataL = freqDataR = null;
  lowPassFilter = null; gainNode = null;
}
