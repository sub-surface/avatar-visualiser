import { P, saveParams, updateTrackDisplay } from './params.js';

const ONSET_THRESHOLD = 0.35;
const REFRACTORY_SECONDS = 0.25;
const HISTORY_LENGTH = 24;
const MIN_BPM = 60;
const MAX_BPM = 200;

let previousKick = 0;
let lastOnset = 0;
let intervals = [];
let smoothedBpm = 0;
let userEdited = false;
let clockSeconds = 0;

const bpmInput = document.getElementById('pBpm');
if (bpmInput) {
  bpmInput.addEventListener('focus', () => { userEdited = true; });
  bpmInput.addEventListener('input', () => {
    if (!bpmInput.value.trim()) resetBpmAuto();
  });
}

export function resetBpmAuto() {
  userEdited = false;
  smoothedBpm = 0;
  intervals = [];
  lastOnset = 0;
  previousKick = 0;
}

export function bpmTick(dt, kick) {
  clockSeconds += dt;
  if (kick > ONSET_THRESHOLD && previousKick <= ONSET_THRESHOLD) {
    const gap = clockSeconds - lastOnset;
    if (gap > REFRACTORY_SECONDS && lastOnset > 0) {
      intervals.push(gap);
      if (intervals.length > HISTORY_LENGTH) intervals.shift();
    }
    lastOnset = clockSeconds;
  }
  previousKick = kick;

  if (intervals.length < 4 || userEdited) return;
  const sorted = [...intervals].sort((a, b) => a - b);
  let bpm = 60 / sorted[Math.floor(sorted.length / 2)];
  while (bpm < MIN_BPM) bpm *= 2;
  while (bpm > MAX_BPM) bpm /= 2;
  smoothedBpm = smoothedBpm ? smoothedBpm * 0.85 + bpm * 0.15 : bpm;
  const rounded = Math.round(smoothedBpm);
  if (P.bpm === rounded) return;
  P.bpm = rounded;
  if (bpmInput) bpmInput.value = rounded;
  updateTrackDisplay();
  saveParams();
}
