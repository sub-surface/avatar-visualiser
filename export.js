/**
 * export.js — full WebCodecs export pipeline with text overlay and morphed mode cycling.
 */
import * as THREE from 'three';
import { FFT_SIZE, NUM_BINS, GRID_W, LINE_COLOR, CAM_BASE,
         renderer, scene, camera, material, _colA, _colB, _colScratch,
         beginExportResize, endExportResize, setColors } from './engine.js';
import { P, setTimeDisplay, getTrackMeta } from './params.js';
import { computeFFTBinsInto, buildBinMap, bowlFactor } from './dsp.js';
import { computeEnvelopesExport } from './envelopes.js';
import { aWeightGain } from './vis/shared.js';
import { lines, posBuffers, colBuffers, rebuildGrid, tearDownBowl } from './vis/bowl.js';
import { polarLines, polarBufs, polarCols, rebuildPolar, tearDownPolar } from './vis/polar.js';
import { sphereLines, sphereBufs, sphereCols, sphereBase, rebuildSphere, tearDownSphere } from './vis/sphere.js';
import { waveLines, waveBufs, rebuildWave, tearDownWave } from './vis/wave.js';
import { initOverlayCanvas, freeOverlayCanvas, compositeFrame } from './overlay.js';

// Helper to log status to index.html's infoBox
function logStatus(msg) {
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: msg }));
}

/* ── Audio Analysis for Triggers ──────────────────────────── */
function findModeTriggers(mono, sr, count = 6) {
  const windowSize = sr; // 1s windows
  const energy = [];
  for (let i = 0; i < mono.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, mono.length);
    for (let j = i; j < end; j++) sum += mono[j] * mono[j];
    energy.push({ frame: i, rms: Math.sqrt(sum / (end - i)) });
  }

  const triggers = [];
  const minSpacing = 3 * sr; // 3s minimum between cuts
  const sorted = [...energy].sort((a, b) => b.rms - a.rms);

  for (const p of sorted) {
    if (triggers.length >= 15) break; // More triggers
    const tooClose = triggers.some(t => Math.abs(t.frame - p.frame) < minSpacing);
    if (!tooClose) triggers.push(p);
  }
  
  return triggers.sort((a,b) => a.frame - b.frame).map(t => t.frame);
}

/* ── Scratch buffers ──────────────────────────────────────── */
let _scratchPcm  = null;
let _scratchPcmR = null;
let _scratchRe   = null;
let _scratchIm   = null;
let _scratchRaw  = null;
let _scratchRawR = null;
let _scratchPrev = null;
let _scratchPrevR= null;
let _scratchCurr = null;
let _scratchCurrR= null;

function allocExportScratch() {
  _scratchPcm  = new Float32Array(FFT_SIZE);
  _scratchPcmR = new Float32Array(FFT_SIZE);
  _scratchRe   = new Float32Array(FFT_SIZE);
  _scratchIm   = new Float32Array(FFT_SIZE);
  _scratchRaw  = new Uint8Array(NUM_BINS);
  _scratchRawR = new Uint8Array(NUM_BINS);
  _scratchPrev = new Uint8Array(NUM_BINS);
  _scratchPrevR= new Uint8Array(NUM_BINS);
  _scratchCurr = new Uint8Array(NUM_BINS);
  _scratchCurrR= new Uint8Array(NUM_BINS);
}

function freeExportScratch() {
  _scratchPcm = _scratchPcmR = _scratchRe = _scratchIm = null;
  _scratchRaw = _scratchRawR = _scratchPrev = _scratchPrevR = _scratchCurr = _scratchCurrR = null;
}

/* ── Audio encoding ───────────────────────────────────────── */
async function encodeAudio(enc, buf) {
  const sr = buf.sampleRate, nch = buf.numberOfChannels, total = buf.length, CHUNK = 4096;
  for (let off = 0; off < total; off += CHUNK) {
    const n  = Math.min(CHUNK, total - off);
    const pl = new Float32Array(n * nch);
    for (let ch = 0; ch < nch; ch++) pl.set(buf.getChannelData(ch).subarray(off, off + n), ch * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfChannels: nch,
      numberOfFrames: n, timestamp: Math.round((off / sr) * 1e6), data: pl });
    enc.encode(ad); ad.close();
  }
  await enc.flush();
}

/* ── Position Calculation Helpers (for Morphing) ─────────── */
function calcBowlPos(out, r, c, rows, cols, hrowL, hrowR, half, binMap, bf, disp) {
  const isRight = c >= half;
  const m = isRight ? cols - 1 - c : c;
  const bin = binMap[Math.min(m, half - 1)];
  const fv = (isRight ? hrowR[bin] : hrowL[bin]);
  const safeCols = Math.max(2, cols);
  const safeRows = Math.max(2, rows);
  out[0] = (c / (safeCols - 1) - 0.5) * GRID_W;
  out[1] = -fv * bf * disp;
  out[2] = (r / (safeRows - 1) - 0.5) * 10.0; // GRID_D
}

function calcPolarPos(out, r, c, rows, cols, hrowL, hrowR, half, binMap, bf, disp, space) {
  const segs = cols;
  const ci = c % segs;
  const angle = (ci / segs) * Math.PI * 2;
  const isRight = ci < segs / 2;
  const m = ci < half ? ci : segs - 1 - ci;
  const bin = binMap[Math.min(m, half - 1)];
  const fv = isRight ? hrowR[bin] : hrowL[bin];
  const radius = 0.4 + (4.5 - 0.4) * bf * (1 + fv * disp * 0.18);
  out[0] = Math.cos(angle) * radius;
  const safeRows = Math.max(2, rows);
  out[1] = (r / (safeRows - 1) - 0.5) * space;
  out[2] = Math.sin(angle) * radius;
}

function calcSpherePos(out, r, c, rows, cols, hrowL, hrowR, half, binMap, disp, sphereSize, rot) {
  const safeRows = Math.max(2, rows);
  const safeCols = Math.max(2, cols);
  const phi = (r / (safeRows - 1)) * Math.PI;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const theta = (c / (safeCols - 1)) * Math.PI * 2;
  const isRight = c < half;
  const m = c < half ? c : cols - 1 - c;
  const bin = binMap[Math.min(m, half - 1)];
  const fv = isRight ? hrowR[bin] : hrowL[bin];
  const push = (1 + fv * disp) * sphereSize;
  const x = Math.cos(theta) * sinPhi * push;
  const z = Math.sin(theta) * sinPhi * push;
  const y = cosPhi * push;
  out[0] = x * Math.cos(rot) - z * Math.sin(rot);
  out[1] = y;
  out[2] = x * Math.sin(rot) + z * Math.cos(rot);
}

function calcWavePos(out, r, c, rows, cols, hrowL, hrowR, half, binMap, disp, space) {
  const isRight = c >= half;
  const m = isRight ? cols - 1 - c : c;
  const bin = binMap[Math.min(m, half - 1)];
  const fv = (isRight ? hrowR[bin] : hrowL[bin]);
  const safeCols = Math.max(2, cols);
  const safeRows = Math.max(2, rows);
  out[0] = (c / (safeCols - 1) - 0.5) * GRID_W;
  out[1] = (r / (safeRows - 1) - 0.5) * -4.0; 
  out[2] = -fv * disp * 2.0;
}

/* ── Single-pass render loop ──────────────────────────────── */
async function runExport(venc, audioBuffer, fps, duration, visMode, onProgress) {
  const sr              = audioBuffer.sampleRate;
  const totalSamples    = audioBuffer.length;
  const samplesPerFrame = Math.ceil(sr / fps);
  const totalFrames     = Math.ceil(totalSamples / samplesPerFrame);

  const rows = Math.max(2, P.rows);
  const cols = Math.max(2, P.complexity * 32);

  const chL = audioBuffer.getChannelData(0);
  const chR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : chL;

  const triggerFrames = P.cycleModes ? findModeTriggers(chL, sr, 6) : [];
  logStatus(`Detected ${triggerFrames.length} energy peaks for transitions`);

  tearDownBowl(); tearDownPolar(); tearDownSphere(); tearDownWave();
  const exportLines = [];
  const exportGeos  = [];
  for (let r = 0; r < rows; r++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 3), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(cols * 3), 3));
    const line = new THREE.Line(geo, material);
    scene.add(line);
    exportLines.push(line);
    exportGeos.push(geo);
  }

  const expHistL = Array.from({ length: rows }, () => new Float32Array(NUM_BINS));
  const expHistR = Array.from({ length: rows }, () => new Float32Array(NUM_BINS));
  const expBinMap = buildBinMap(P.freqScale, cols / 2, NUM_BINS, P.freqRange, sr);
  
  let expHead = 0, expLfo = 0, expLfo2 = 0, expPrevRms = 0, expSphereRot = 0;
  const expEnv = { sub: 0, kick: 0, mid: 0, high: 0, rms: 0, trans: 0 };
  const smooth = P.smoothing;
  const dt = 1 / fps;
  const meta = getTrackMeta();
  const half = cols / 2;
  const cycleList = ['bowl', 'polar', 'sphere', 'wave'];

  let currentModeIdx = cycleList.indexOf(visMode);
  if (currentModeIdx === -1) currentModeIdx = 0;
  
  let morphTargetIdx = currentModeIdx;
  let morphAlpha = 1.0; 
  const MORPH_SPEED = 0.04;
  
  // Camera Styles: Normal, Distant, Birds-eye, Worms-eye, Side-Profile, Oblique
  const camStyles = ['normal', 'distant', 'birds', 'worms', 'side', 'oblique'];
  let camStyleIdx = 0;

  // Initialise morph state if we ARE cycling vis types
  if (P.cycleMode === 'types' || P.cycleMode === 'random') {
    morphAlpha = 1.0; // Start stable on current vis
  }

  for (let f = 0; f < totalFrames; f++) {
    while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));

    const currentSample = f * samplesPerFrame;
    if (triggerFrames.includes(currentSample)) {
      // Always cycle camera style
      camStyleIdx = (camStyleIdx + 1) % camStyles.length;

      if (P.cycleMode === 'types' || P.cycleMode === 'random') {
        // Cycle vis mode morph
        morphTargetIdx = (currentModeIdx + 1) % cycleList.length;
        morphAlpha = 0.0;
        logStatus(`Peak hit! Morphing to ${cycleList[morphTargetIdx]} (${camStyles[camStyleIdx]} view)`);
      } else {
        // Normal: camera only, no vis morph
        logStatus(`Peak hit! Camera cut to ${camStyles[camStyleIdx]} view`);
      }

      // NEW: Randomise visual parameters if in 'random' cycle mode
      if (P.cycleMode === 'random' && typeof window.randomiseParams === 'function') {
        window.randomiseParams(); 
        logStatus('Parameters randomised for peak transition');
      }
    }

    if (morphAlpha < 1.0) {
      morphAlpha += MORPH_SPEED;
      if (morphAlpha >= 1.0) {
        morphAlpha = 1.0;
        currentModeIdx = morphTargetIdx;
      }
    }

    const currentMode = cycleList[currentModeIdx];
    const targetMode  = cycleList[morphTargetIdx];

    const ws = f * samplesPerFrame - NUM_BINS;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = ws + i;
      _scratchPcm[i]  = (x >= 0 && x < totalSamples) ? chL[x] : 0;
      _scratchPcmR[i] = (x >= 0 && x < totalSamples) ? chR[x] : 0;
    }
    computeFFTBinsInto(_scratchPcm,  _scratchRe, _scratchIm, _scratchRaw);
    computeFFTBinsInto(_scratchPcmR, _scratchRe, _scratchIm, _scratchRawR);

    for (let k = 0; k < NUM_BINS; k++) {
      _scratchCurr[k]  = Math.round(smooth * _scratchPrev[k]  + (1 - smooth) * _scratchRaw[k]);
      _scratchCurrR[k] = Math.round(smooth * _scratchPrevR[k] + (1 - smooth) * _scratchRaw[k]);
    }
    const tmpL = _scratchPrev;  _scratchPrev  = _scratchCurr;  _scratchCurr  = tmpL;
    const tmpR = _scratchPrevR; _scratchPrevR = _scratchCurrR; _scratchCurrR = tmpR;

    const fdAvg = new Uint8Array(NUM_BINS);
    for (let k = 0; k < NUM_BINS; k++) fdAvg[k] = (_scratchPrev[k] + _scratchPrevR[k]) / 2;
    expPrevRms = computeEnvelopesExport(fdAvg, expEnv, expPrevRms);

    const bpm = parseFloat(P.bpm) || 120;
    const bps = bpm / 60;
    expLfo = (expLfo + 2 * Math.PI * P.lfoRate * bps * dt) % (2 * Math.PI);
    expLfo2 = (expLfo2 + 2 * Math.PI * P.lfo2Rate * bps * dt) % (2 * Math.PI);

    // Calculate LFO 1
    let lfoRaw = 0;
    const lfoT = expLfo / (2 * Math.PI);
    if (P.lfoWaveform === 'sine') lfoRaw = Math.sin(expLfo);
    else if (P.lfoWaveform === 'square') lfoRaw = lfoT < 0.5 ? 1 : -1;
    else if (P.lfoWaveform === 'sawtooth') lfoRaw = (lfoT * 2) - 1;
    else if (P.lfoWaveform === 'triangle') lfoRaw = lfoT < 0.5 ? (lfoT * 4) - 1 : 3 - (lfoT * 4);
    const lfo = (lfoRaw * P.lfoDepth) + P.lfoOffset;

    // Calculate LFO 2 (Filter)
    let lfo2Raw = 0;
    const lfo2T = expLfo2 / (2 * Math.PI);
    if (P.lfo2Waveform === 'sine') lfo2Raw = Math.sin(expLfo2);
    else if (P.lfo2Waveform === 'square') lfo2Raw = lfo2T < 0.5 ? 1 : -1;
    else if (P.lfo2Waveform === 'sawtooth') lfo2Raw = (lfo2T * 2) - 1;
    else if (P.lfo2Waveform === 'triangle') lfo2Raw = lfo2T < 0.5 ? (lfo2T * 4) - 1 : 3 - (lfo2T * 4);
    const lfo2 = lfo2Raw * P.lfo2Depth;

    const be   = P.bowlExp - expEnv.high * P.modHigh + lfo * P.lfoToBowl + lfo2 * 1.5;
    const disp = P.maxDisp * (1 + expEnv.sub * P.modSub + lfo * P.lfoToDisp);

    const ambientTime = f * dt;
    const driftX = Math.sin(ambientTime * 0.12) * 0.4;
    const driftY = Math.cos(ambientTime * 0.15) * 0.2;
    const dollyZ = Math.sin(ambientTime * 0.08) * 0.5;

    const camMode = morphAlpha > 0.5 ? targetMode : currentMode;
    let baseX = (camMode === 'sphere' && P.exportOrientation === 'horizontal') ? -4.5 : 0;
    let baseY = (camMode === 'sphere') ? 0 : (CAM_BASE.y + expEnv.mid * P.modMid);
    let baseZ = (camMode === 'sphere' ? 12 : CAM_BASE.z) - (expEnv.rms * P.modRms + lfo * P.lfoToZoom) + expEnv.kick * P.modKick;

    let lookX = baseX + (Math.sin(ambientTime * 0.2) * 0.1);
    let lookY = (camMode === 'sphere' ? 0 : -0.5);
    let lookZ = 0;

    // Apply Camera Style (read from P.camStyles for director mode support)
    const style = camStyles[camStyleIdx];
    const cs = P.camStyles && P.camStyles[style];
    if (cs && style !== 'normal') {
      baseX = cs.x;
      baseY = cs.y;
      baseZ = cs.z;
      lookY = cs.lookY;
      if (style === 'side') lookX = 0;
    }

    camera.position.set(baseX + driftX, baseY + driftY, baseZ + dollyZ);
    
    if (P.exportPreset === 'lofi') {
      // Subtle VHS jitter: high-freq positional noise
      const vhs = (Math.random() - 0.5);
      camera.position.x += vhs * 0.04;
      camera.position.y += (Math.random() - 0.5) * 0.02;
      // Slight vertical "roll" jump occasionally
      if (Math.random() > 0.98) camera.position.y += 0.1;
    }

    camera.lookAt(lookX, lookY, lookZ);

    const targetOp = 0.6 + expEnv.trans * P.modTrans + lfo * P.lfoToOpacity * 0.3;
    material.opacity = Math.max(0.1, Math.min(1, targetOp));
    material.transparent = true;

    if (P.colorCycle > 0) {
      const shift = (lfo + 1) * 0.5 * P.colorCycle;
      setColors(new THREE.Color(P.colorA).lerp(new THREE.Color(P.colorB), shift), 
                new THREE.Color(P.colorB).lerp(new THREE.Color(P.colorA), shift));
    } else {
      setColors(P.colorA, P.colorB);
    }

    expHead = (expHead + rows - 1) % rows;
    const hL = expHistL[expHead];
    const hR = expHistR[expHead];
    for (let k = 0; k < NUM_BINS; k++) {
      hL[k] = (_scratchPrev[k] / 255)  * aWeightGain[k];
      hR[k] = (_scratchPrevR[k] / 255) * aWeightGain[k];
    }

    expSphereRot += 0.005;
    const pA = [0,0,0], pB = [0,0,0];

    for (let r = 0; r < rows; r++) {
      const attrPos = exportGeos[r].attributes.position;
      const attrCol = exportGeos[r].attributes.color;
      const hrowL = expHistL[(expHead + r) % rows];
      const hrowR = expHistR[(expHead + r) % rows];
      const bf = bowlFactor(r, rows, be);

      for (let c = 0; c < cols; c++) {
        if (currentMode === 'bowl') calcBowlPos(pA, r, c, rows, cols, hrowL, hrowR, half, expBinMap, bf, disp);
        else if (currentMode === 'polar') calcPolarPos(pA, r, c, rows, cols, hrowL, hrowR, half, expBinMap, bf, disp, P.polarSpacing + lfo * P.lfoToPolar);
        else if (currentMode === 'sphere') calcSpherePos(pA, r, c, rows, cols, hrowL, hrowR, half, expBinMap, disp, P.sphereSize, expSphereRot);
        else calcWavePos(pA, r, c, rows, cols, hrowL, hrowR, half, expBinMap, disp, P.waveSpacing);

        if (targetMode === 'bowl') calcBowlPos(pB, r, c, rows, cols, hrowL, hrowR, half, expBinMap, bf, disp);
        else if (targetMode === 'polar') calcPolarPos(pB, r, c, rows, cols, hrowL, hrowR, half, expBinMap, bf, disp, P.polarSpacing + lfo * P.lfoToPolar);
        else if (targetMode === 'sphere') calcSpherePos(pB, r, c, rows, cols, hrowL, hrowR, half, expBinMap, disp, P.sphereSize, expSphereRot);
        else calcWavePos(pB, r, c, rows, cols, hrowL, hrowR, half, expBinMap, disp, P.waveSpacing);

        const x = pA[0] + (pB[0] - pA[0]) * morphAlpha;
        const y = pA[1] + (pB[1] - pA[1]) * morphAlpha;
        const z = pA[2] + (pB[2] - pA[2]) * morphAlpha;
        attrPos.setXYZ(c, x, y, z);

        const isRight = c >= half;
        const m = isRight ? cols - 1 - c : c;
        const bin = expBinMap[Math.min(m, half - 1)];
        const energy = (isRight ? hrowR[bin] : hrowL[bin]);
        const lerpVal = Math.min(energy * 2.0, 1.0);
        attrCol.setXYZ(c, 
          _colA.r + (_colB.r - _colA.r) * lerpVal,
          _colA.g + (_colB.g - _colA.g) * lerpVal,
          _colA.b + (_colB.b - _colA.b) * lerpVal
        );
      }
      attrPos.needsUpdate = true;
      attrCol.needsUpdate = true;
    }

    setTimeDisplay(f / fps, duration);
    renderer.render(scene, camera);

    const frameCanvas = compositeFrame(renderer.domElement, meta, f / fps, duration, camMode);
    const vf = new VideoFrame(frameCanvas, { timestamp: Math.round(f * (1e6 / fps)), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();

    if (f % 30 === 0) await venc.flush();
    if (f % 10 === 0) { 
      onProgress(Math.round((f / totalFrames) * 100)); 
      if (f % (fps * 10) === 0) logStatus(`Export progress: ${Math.round((f / totalFrames) * 100)}%`);
      await new Promise(r => setTimeout(r, 0)); 
    }
  }
  exportLines.forEach(l => scene.remove(l));
}

/* ── Public entry point ───────────────────────────────────── */
const progressEl    = document.getElementById('progress');
const topLoadBtn    = document.getElementById('topLoadBtn');
const topRenderBtn  = document.getElementById('topRenderBtn');

export let isExporting = false;

export async function startExport(wavFile, visMode) {
  if (isExporting) return;

  const meta = getTrackMeta();
  let suggestedName = "";
  if (meta.title && meta.artist) {
    suggestedName = `${meta.title} - ${meta.artist} | Avatar Visualiser.mp4`;
  } else if (meta.title) {
    suggestedName = `${meta.title} | Avatar Visualiser.mp4`;
  } else {
    suggestedName = `${wavFile.name.replace(/\.[^.]+$/, '')} | Avatar Visualiser.mp4`;
  }

  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
    });
  } catch (e) { return; }

  isExporting = true;
  topLoadBtn.disabled = true;
  const FPS = 30;
  let writable = null;

  try {
    await document.fonts.ready;

    logStatus(`Decoding audio: ${wavFile.name}`);
    progressEl.textContent = 'decoding...';
    const ab  = await wavFile.arrayBuffer();
    const tmp = new AudioContext();
    const buf = await tmp.decodeAudioData(ab);
    await tmp.close();
    logStatus(`Audio decoded. Buffer size: ${buf.length} frames`);

    const duration = buf.length / buf.sampleRate;

    let EXPORT_W, EXPORT_H;
    const isVert = P.exportOrientation === 'vertical';
    const is43   = P.exportAspect === '4:3';

    if (P.exportPreset === 'lofi') {
      // Lo-fi preset always uses a specific low-res target
      if (is43) {
        EXPORT_W = isVert ? 480 : 640;
        EXPORT_H = isVert ? 640 : 480;
      } else {
        EXPORT_W = isVert ? 360 : 640;
        EXPORT_H = isVert ? 640 : 360;
      }
    } else {
      // Standard/Lossless use HD targets
      if (is43) {
        EXPORT_W = isVert ? 1080 : 1440;
        EXPORT_H = isVert ? 1440 : 1080;
      } else {
        EXPORT_W = isVert ? 1080 : 1920;
        EXPORT_H = isVert ? 1920 : 1080;
      }
    }

    allocExportScratch();
    initOverlayCanvas(EXPORT_W, EXPORT_H);
    beginExportResize(EXPORT_W, EXPORT_H);

    writable = await fileHandle.createWritable();

    const { Muxer, StreamTarget } = Mp4Muxer;
    const target = new StreamTarget({
      onData: (data, position) => { writable.write({ type: 'write', data, position }); },
    });
    const muxer = new Muxer({ target,
      video: { codec: 'avc', width: EXPORT_W, height: EXPORT_H },
      audio: { codec: 'aac', sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels },
      fastStart: false });

    const venc = new VideoEncoder({
      output: (c, m) => muxer.addVideoChunk(c, m),
      error: e => { 
        logStatus(`Video encoder error: ${e.message}`);
      }
    });

    let vcfg;
    if (P.exportPreset === 'lossless') {
      vcfg = { codec: 'avc1.640028', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrate: 25e6, latencyMode: 'quality' };
    } else if (P.exportPreset === 'lofi') {
      vcfg = { codec: 'avc1.4D401F', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrate: 2.5e6 };
    } else {
      vcfg = { codec: 'avc1.640028', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrate: 12e6, latencyMode: 'quality' };
    }

    venc.configure(vcfg);

    const aenc = new AudioEncoder({
      output: (c, m) => muxer.addAudioChunk(c, m),
      error: e => { 
        logStatus(`Audio encoder error: ${e.message}`);
      }
    });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: buf.sampleRate,
      numberOfChannels: buf.numberOfChannels, bitrate: 192e3 });

    logStatus(`Export started: ${duration.toFixed(1)}s`);
    progressEl.textContent = '0%';
    await runExport(venc, buf, FPS, duration, visMode, p => {
      progressEl.textContent = `${p}%`;
    });

    logStatus('Encoding audio...');
    await encodeAudio(aenc, buf);

    await venc.flush();
    await aenc.flush();
    muxer.finalize();
    await writable.close();
    logStatus('Export complete!');
    progressEl.textContent = 'done.';

  } catch (err) {
    logStatus(`Export failed: ${err.message ?? err}`);
    progressEl.textContent = `err: ${err.message ?? err}`;
    try { await writable?.abort(); } catch (_) {}
  } finally {
    freeExportScratch();
    freeOverlayCanvas();
    endExportResize();
    camera.position.y = CAM_BASE.y;
    camera.position.z = CAM_BASE.z;
    camera.lookAt(0, -0.5, 0);
    material.color.set(LINE_COLOR);
    material.opacity = 1.0;
    material.transparent = false;
    isExporting = false;
    topRenderBtn.disabled = false;
    topLoadBtn.disabled = false;
    setTimeDisplay(0, 0);
    window.dispatchEvent(new CustomEvent('avatar-rebuild-vis'));
  }
}
