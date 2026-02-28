/**
 * export.js — full WebCodecs export pipeline with text overlay compositing.
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

/* ── Scratch buffers ──────────────────────────────────────── */
let _scratchPcm  = null;
let _scratchRe   = null;
let _scratchIm   = null;
let _scratchRaw  = null;
let _scratchPrev = null;
let _scratchCurr = null;

function allocExportScratch() {
  _scratchPcm  = new Float32Array(FFT_SIZE);
  _scratchRe   = new Float32Array(FFT_SIZE);
  _scratchIm   = new Float32Array(FFT_SIZE);
  _scratchRaw  = new Uint8Array(NUM_BINS);
  _scratchPrev = new Uint8Array(NUM_BINS);
  _scratchCurr = new Uint8Array(NUM_BINS);
}

function freeExportScratch() {
  _scratchPcm = _scratchRe = _scratchIm = null;
  _scratchRaw = _scratchPrev = _scratchCurr = null;
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

/* ── Single-pass render loop ──────────────────────────────── */
async function runExport(venc, audioBuffer, fps, duration, visMode, onProgress) {
  const sr              = audioBuffer.sampleRate;
  const totalSamples    = audioBuffer.length;
  const samplesPerFrame = Math.ceil(sr / fps);
  const totalFrames     = Math.ceil(totalSamples / samplesPerFrame);

  // Capture current state to ensure consistency during render
  const rows = P.rows;
  const cols = P.cols;

  // Clear everything first
  tearDownBowl();
  tearDownPolar();
  tearDownSphere();
  tearDownWave();

  // Only build the initial mode
  if (visMode === 'bowl')   rebuildGrid();
  if (visMode === 'polar')  rebuildPolar();
  if (visMode === 'sphere') rebuildSphere();
  if (visMode === 'wave')   rebuildWave();

  const chL = audioBuffer.getChannelData(0);
  const chR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : chL;

  const expHistL = Array.from({ length: rows }, () => new Float32Array(NUM_BINS));
  const expHistR = Array.from({ length: rows }, () => new Float32Array(NUM_BINS));
  const expTdHist = Array.from({ length: rows }, () => new Float32Array(cols));
  const expTdEnergy = new Float32Array(rows);
  const expBinMap = buildBinMap(P.freqScale, cols / 2, NUM_BINS, P.freqRange, sr);
  
  // Extra scratch for R channel
  const _scratchPcmR  = new Float32Array(FFT_SIZE);
  const _scratchRawR  = new Uint8Array(NUM_BINS);
  const _scratchPrevR = new Uint8Array(NUM_BINS);
  const _scratchCurrR = new Uint8Array(NUM_BINS);

  let   expHead   = 0, expTdHead = 0, expLfo = 0, expPrevRms = 0;
    let   expSphereRot = 0;
    let   lastVis = visMode; 
  
    const expEnv    = { sub: 0, kick: 0, mid: 0, high: 0, rms: 0, trans: 0 };
    const smooth    = P.smoothing;
    const dt        = 1 / fps;
    const meta      = getTrackMeta();
    const half      = cols / 2;
    const cycleList = ['bowl', 'polar', 'sphere', 'wave'];
  
    for (let f = 0; f < totalFrames; f++) {
      while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));
  
      // Optional mode cycling
      let currentVis = visMode;
      if (P.cycleModes) {
        const modeIdx = Math.floor(f / (30 * fps)) % cycleList.length;
        currentVis = cycleList[modeIdx];
      }
  
          // If mode changed, clean up old and build new
          if (currentVis !== lastVis) {
            if (lastVis === 'bowl')   tearDownBowl();
            if (lastVis === 'polar')  tearDownPolar();
            if (lastVis === 'sphere') tearDownSphere();
            if (lastVis === 'wave')   tearDownWave();
      
            if (currentVis === 'bowl')   rebuildGrid();
            if (currentVis === 'polar')  rebuildPolar();
            if (currentVis === 'sphere') rebuildSphere();
            if (currentVis === 'wave')   rebuildWave();
            
            lastVis = currentVis;
          }  
    // FFT
    const ws = f * samplesPerFrame - NUM_BINS;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = ws + i;
      _scratchPcm[i]  = (x >= 0 && x < audioBuffer.length) ? chL[x] : 0;
      _scratchPcmR[i] = (x >= 0 && x < audioBuffer.length) ? chR[x] : 0;
    }
    computeFFTBinsInto(_scratchPcm,  _scratchRe, _scratchIm, _scratchRaw);
    computeFFTBinsInto(_scratchPcmR, _scratchRe, _scratchIm, _scratchRawR);

    // EMA smoothing
    for (let k = 0; k < NUM_BINS; k++) {
      _scratchCurr[k]  = Math.round(smooth * _scratchPrev[k]  + (1 - smooth) * _scratchRaw[k]);
      _scratchCurrR[k] = Math.round(smooth * _scratchPrevR[k] + (1 - smooth) * _scratchRawR[k]);
    }
    const tmpL = _scratchPrev;  _scratchPrev  = _scratchCurr;  _scratchCurr  = tmpL;
    const tmpR = _scratchPrevR; _scratchPrevR = _scratchCurrR; _scratchCurrR = tmpR;

    // Envelopes
    expLfo = (expLfo + 2 * Math.PI * P.lfoRate * dt) % (2 * Math.PI);
    const fdAvg = new Uint8Array(NUM_BINS);
    for (let k = 0; k < NUM_BINS; k++) fdAvg[k] = (_scratchPrev[k] + _scratchPrevR[k]) / 2;
    expPrevRms = computeEnvelopesExport(fdAvg, expEnv, expPrevRms);

    // Calculate LFO based on waveform
    let lfoRaw = 0;
    const lfoT = expLfo / (2 * Math.PI);
    if (P.lfoWaveform === 'sine') lfoRaw = Math.sin(expLfo);
    else if (P.lfoWaveform === 'square') lfoRaw = lfoT < 0.5 ? 1 : -1;
    else if (P.lfoWaveform === 'sawtooth') lfoRaw = (lfoT * 2) - 1;
    else if (P.lfoWaveform === 'triangle') lfoRaw = lfoT < 0.5 ? (lfoT * 4) - 1 : 3 - (lfoT * 4);
    
    const lfo = (lfoRaw * P.lfoDepth) + P.lfoOffset;

    const be   = P.bowlExp - expEnv.high * P.modHigh + lfo * P.lfoToBowl;
    const disp = P.maxDisp * (1 + expEnv.sub * P.modSub + lfo * P.lfoToDisp);

    // Color Cycle
    if (P.colorCycle > 0) {
      const shift = (lfo + 1) * 0.5 * P.colorCycle;
      const cA = new THREE.Color(P.colorA).lerp(new THREE.Color(P.colorB), shift);
      const cB = new THREE.Color(P.colorB).lerp(new THREE.Color(P.colorA), shift);
      setColors(cA, cB);
    } else {
      setColors(P.colorA, P.colorB);
    }

    // Dynamic camera placement
    camera.position.x = (currentVis === 'sphere' && P.exportOrientation === 'horizontal') ? -4.5 : 0;
    camera.position.y = (currentVis === 'sphere') ? 0 : (CAM_BASE.y + expEnv.mid * P.modMid);
    camera.position.z = (currentVis === 'sphere' ? 12 : CAM_BASE.z) - (expEnv.rms * P.modRms + lfo * P.lfoToZoom) + expEnv.kick * P.modKick;

    if (P.exportPreset === 'lofi') {
      camera.position.x += (Math.random() - 0.5) * 0.015;
      camera.position.y += (Math.random() - 0.5) * 0.015;
    }

    const lx = (currentVis === 'sphere' && P.exportOrientation === 'horizontal') ? -4.5 : 0;
    const ly = (currentVis === 'sphere') ? 0 : -0.5;
    camera.lookAt(lx, ly, 0);
    const targetOp       = 0.6 + expEnv.trans * P.modTrans + lfo * P.lfoToOpacity * 0.3;
    material.opacity     = Math.max(0.1, Math.min(1, targetOp));
    material.transparent = true;
    _colScratch.lerpColors(_colA, _colB, Math.min(expEnv.mid * 3.5, 1));
    material.color.copy(_colScratch);

    // History + displacement
    expHead = (expHead + rows - 1) % rows;
    const rowL = expHistL[expHead];
    const rowR = expHistR[expHead];
    for (let k = 0; k < NUM_BINS; k++) {
      rowL[k] = (_scratchPrev[k] / 255)  * aWeightGain[k];
      rowR[k] = (_scratchPrevR[k] / 255) * aWeightGain[k];
    }

    if (currentVis === 'bowl') {
      for (let r = 0; r < rows; r++) {
        const pos  = posBuffers[r];
        const col  = colBuffers[r];
        const hrowL = expHistL[(expHead + r) % rows];
        const hrowR = expHistR[(expHead + r) % rows];
        const bf   = bowlFactor(r, rows, be);
        for (let c = 0; c < cols; c++) {
          const isRight = c >= half;
          const m = c < half ? c : cols - 1 - c;
          const bin = expBinMap[Math.min(m, half - 1)];
          const fv = (r === 0) ? ((isRight ? _scratchPrevR[bin] : _scratchPrev[bin]) / 255) : (isRight ? hrowR[bin] : hrowL[bin]);
          
          pos[c * 3 + 1] = -fv * bf * disp;

          const lerpVal = Math.min(fv * 2.0, 1.0);
          col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
          col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
          col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
        }
        lines[r].geometry.attributes.position.needsUpdate = true;
        lines[r].geometry.attributes.color.needsUpdate = true;
      }
    } else if (currentVis === 'polar') {
      const segs   = cols;
      const BASE_R = 0.4, MAX_R = 4.5;
      const curPolarSpacing = P.polarSpacing + lfo * P.lfoToPolar;
      for (let r = 0; r < rows; r++) {
        const pos  = polarBufs[r];
        const col  = polarCols[r];
        const hrowL = expHistL[(expHead + r) % rows];
        const hrowR = expHistR[(expHead + r) % rows];
        const bf   = bowlFactor(r, rows, be);
        const y    = (r / (rows - 1) - 0.5) * curPolarSpacing;
        for (let c = 0; c <= segs; c++) {
          const ci = c % segs;
          const isRight = ci < segs / 2;
          const m  = ci < half ? ci : segs - 1 - ci;
          const bin = expBinMap[Math.min(m, half - 1)];
          const fv = (r === 0) ? ((isRight ? _scratchPrevR[bin] : _scratchPrev[bin]) / 255) : (isRight ? hrowR[bin] : hrowL[bin]);
          
          const radius = BASE_R + (MAX_R - BASE_R) * bf * (1 + fv * disp * 0.18);
          const angle  = (ci / segs) * Math.PI * 2;
          pos[c * 3]     = Math.cos(angle) * radius;
          pos[c * 3 + 1] = y;
          pos[c * 3 + 2] = Math.sin(angle) * radius;

          const lerpVal = Math.min(fv * 2.0, 1.0);
          col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
          col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
          col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
        }
        polarLines[r].geometry.attributes.position.needsUpdate = true;
        polarLines[r].geometry.attributes.color.needsUpdate = true;
      }
    } else if (currentVis === 'sphere') {
      expSphereRot += 0.005;
      const midIdx = Math.floor(rows / 2);
      for (let r = 0; r < rows; r++) {
        const pos  = sphereBufs[r];
        const col  = sphereCols[r];
        const base = sphereBase[r];
        const distFromMid = Math.abs(r - midIdx);
        const hrowL = expHistL[(expHead + distFromMid) % rows];
        const hrowR = expHistR[(expHead + distFromMid) % rows];
        for (let c = 0; c < cols; c++) {
          const isRight = c < half;
          const m  = c < half ? c : cols - 1 - c;
          const bin = expBinMap[Math.min(m, half - 1)];
          const fv = (r === midIdx) ? ((isRight ? _scratchPrevR[bin] : _scratchPrev[bin]) / 255) : (isRight ? hrowR[bin] : hrowL[bin]);
          
          const push = 1 + fv * disp;
          pos[c * 3]     = base[c * 3]     * push;
          pos[c * 3 + 1] = base[c * 3 + 1] * push;
          pos[c * 3 + 2] = base[c * 3 + 2] * push;

          const lerpVal = Math.min(fv * 2.0, 1.0);
          col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
          col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
          col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
        }
        sphereLines[r].geometry.attributes.position.needsUpdate = true;
        sphereLines[r].geometry.attributes.color.needsUpdate = true;
        sphereLines[r].rotation.y = expSphereRot;
      }
    } else if (currentVis === 'wave') {
      expTdHead = (expTdHead + rows - 1) % rows;
      const latest = expTdHist[expTdHead];
      let peak = 0;
      for (let c = 0; c < cols; c++) {
        const pcmIdx = Math.floor(c * FFT_SIZE / cols);
        const v = (_scratchPcm[pcmIdx] || 0);
        latest[c] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      expTdEnergy[expTdHead] = peak;

      for (let r = 0; r < rows; r++) {
        const pos  = waveBufs[r];
        const hIdx = (expTdHead + r) % rows;
        const data = expTdHist[hIdx];
        const energy = expTdEnergy[hIdx];
        
        for (let c = 0; c < cols; c++) {
          pos[c * 3 + 1] = data[c] * disp;
          pos[c * 3 + 2] = -r * (P.waveSpacing + Math.sin(expLfo) * P.lfoToWave);
        }
        waveLines[r].geometry.attributes.position.needsUpdate = true;
        
        // Match Wave mode UI colour lerp
        waveLines[r].material.color.copy(_colA).lerp(_colB, Math.min(energy * 2.0, 1.0));
      }
    }

    setTimeDisplay(f / fps, duration);
    renderer.render(scene, camera);

    // Composite WebGL frame + text overlay onto 2D canvas
    const frameCanvas = compositeFrame(renderer.domElement, meta, f / fps, duration, currentVis);

    const vf = new VideoFrame(frameCanvas,
      { timestamp: Math.round(f * (1e6 / fps)), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();

    if (f % 30 === 0) await venc.flush();
    if (f % 10 === 0) { 
      onProgress(Math.round((f / totalFrames) * 100)); 
      if (f % (fps * 10) === 0) logStatus(`Export progress: ${Math.round((f / totalFrames) * 100)}%`);
      await new Promise(r => setTimeout(r, 0)); 
    }
  }
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
    // Wait for fonts to be ready (needed for text overlay)
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
    if (P.exportPreset === 'lofi') {
      EXPORT_W = isVert ? 480 : 640;
      EXPORT_H = isVert ? 640 : 480;
    } else {
      EXPORT_W = isVert ? 1080 : 1920;
      EXPORT_H = isVert ? 1920 : 1080;
    }

    allocExportScratch();
    initOverlayCanvas(EXPORT_W, EXPORT_H);
    beginExportResize(EXPORT_W, EXPORT_H);

    logStatus('Creating writable stream...');
    writable = await fileHandle.createWritable();

    const { Muxer, StreamTarget } = Mp4Muxer;
    const target = new StreamTarget({
      onData: (data, position) => { writable.write({ type: 'write', data, position }); },
    });
    const muxer = new Muxer({ target,
      video: { codec: 'avc', width: EXPORT_W, height: EXPORT_H },
      audio: { codec: 'aac', sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels },
      fastStart: false });

    logStatus('Configuring encoders...');
    const venc = new VideoEncoder({
      output: (c, m) => muxer.addVideoChunk(c, m),
      error: e => { 
        console.error('VEnc error:', e); 
        progressEl.textContent = 'v-encoder error'; 
        logStatus(`Video encoder error: ${e.message}`);
      }
    });

    let vcfg;
    if (P.exportPreset === 'lossless') {
      vcfg = { codec: 'avc1.640028', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrateMode: 'quantizer', quantizer: 0, latencyMode: 'quality' };
    } else if (P.exportPreset === 'lofi') {
      vcfg = { codec: 'avc1.4D401F', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrate: 1.5e6 };
    } else {
      vcfg = { codec: 'avc1.640028', width: EXPORT_W, height: EXPORT_H,
        framerate: FPS, bitrateMode: 'quantizer', quantizer: 18, latencyMode: 'quality' };
    }

    let sup = await VideoEncoder.isConfigSupported(vcfg);
    if (!sup.supported) {
      logStatus('Target mode not supported, trying fallback...');
      vcfg = { codec: 'avc1.4D4028', width: EXPORT_W, height: EXPORT_H, framerate: FPS, bitrate: 8e6 };
      sup = await VideoEncoder.isConfigSupported(vcfg);
    }
    if (!sup.supported) {
      logStatus('Main profile not supported, trying baseline...');
      vcfg = { codec: 'avc1.42E01F', width: EXPORT_W, height: EXPORT_H, framerate: FPS, bitrate: 5e6 };
    }
    venc.configure(vcfg);
    logStatus(`VEnc configured with: ${vcfg.codec} ${P.exportPreset}`);

    const aenc = new AudioEncoder({
      output: (c, m) => muxer.addAudioChunk(c, m),
      error: e => { 
        console.error('AEnc error:', e); 
        progressEl.textContent = 'a-encoder error'; 
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

    logStatus('Video encoded. Encoding audio...');
    progressEl.textContent = 'audio...';
    await encodeAudio(aenc, buf);

    logStatus('Audio encoded. Flushing and muxing...');
    progressEl.textContent = 'muxing...';
    await venc.flush();
    await aenc.flush();
    muxer.finalize();
    await writable.close();
    logStatus('Export complete!');
    progressEl.textContent = 'done.';

  } catch (err) {
    console.error('Export failed:', err);
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
    // Restore UI geometries to current P values
    window.dispatchEvent(new CustomEvent('avatar-rebuild-vis'));
  }
}
