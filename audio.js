/**
 * audio.js — live microphone audio input.
 */
import { FFT_SIZE } from './engine.js';
import { P } from './params.js';

let analyser = null;
let freqData = null;
let audioReady = false;
let _audioStream = null;

export function getAnalyser()  { return analyser; }
export function getFreqData()  { return freqData; }
export function isAudioReady() { return audioReady; }

export async function initAudio() {
  _audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const ctx    = new AudioContext();
  const src    = ctx.createMediaStreamSource(_audioStream);
  analyser     = ctx.createAnalyser();
  analyser.fftSize               = FFT_SIZE;
  analyser.smoothingTimeConstant = P.smoothing;
  src.connect(analyser);
  freqData   = new Uint8Array(analyser.frequencyBinCount);
  audioReady = true;
}

export function stopAudio() {
  if (_audioStream) { _audioStream.getTracks().forEach(t => t.stop()); _audioStream = null; }
  audioReady = false; analyser = null; freqData = null;
}
