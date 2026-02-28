/**
 * export.js — full WebCodecs export pipeline with text overlay compositing.
 */
import { FFT_SIZE, NUM_BINS, GRID_W, LINE_COLOR, CAM_BASE,
         renderer, scene, camera, material, _colA, _colB, _colScratch,
         beginExportResize, endExportResize } from './engine.js';
import { P, setTimeDisplay, getTrackMeta } from './params.js';
import { computeFFTBinsInto, buildBinMap, bowlFactor } from './dsp.js';
import { computeEnvelopesExport } from './envelopes.js';
import { aWeightGain } from './vis/shared.js';
import { lines, posBuffers } from './vis/bowl.js';
import { polarLines, polarBufs } from './vis/polar.js';
import { sphereGeo, sphereBasePts, sphereMesh } from './vis/sphere.js';
import { waveBuf, waveGeo } from './vis/wave.js';
import { initOverlayCanvas, freeOverlayCanvas, compositeFrame } from './overlay.js';

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

  const ch0  = audioBuffer.getChannelData(0);
  const ch1  = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const mono = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) mono[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];

  const expHist   = Array.from({ length: P.rows }, () => new Float32Array(NUM_BINS));
  const expBinMap = buildBinMap(P.freqScale, P.cols / 2, NUM_BINS, P.freqRange, 44100);
  let   expHead   = 0, expLfo = 0, expPrevRms = 0;
  const expEnv    = { sub: 0, kick: 0, mid: 0, high: 0, rms: 0, trans: 0 };
  const smooth    = P.smoothing;
  const dt        = 1 / fps;
  const meta      = getTrackMeta();
  const half      = P.cols / 2;

  for (let f = 0; f < totalFrames; f++) {
    while (venc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));

    // FFT
    const ws = f * samplesPerFrame - NUM_BINS;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = ws + i;
      _scratchPcm[i] = (x >= 0 && x < totalSamples) ? mono[x] : 0;
    }
    computeFFTBinsInto(_scratchPcm, _scratchRe, _scratchIm, _scratchRaw);

    // EMA smoothing
    for (let k = 0; k < NUM_BINS; k++) {
      _scratchCurr[k] = Math.round(smooth * _scratchPrev[k] + (1 - smooth) * _scratchRaw[k]);
    }
    const tmp = _scratchPrev; _scratchPrev = _scratchCurr; _scratchCurr = tmp;

    // Envelopes
    expLfo = (expLfo + 2 * Math.PI * P.lfoRate * dt) % (2 * Math.PI);
    expPrevRms = computeEnvelopesExport(_scratchPrev, expEnv, expPrevRms);

    const be   = P.bowlExp + P.lfoDepth * Math.sin(expLfo) - expEnv.high * P.modHigh;
    const disp = P.maxDisp * (1 + expEnv.sub * P.modSub);

    camera.position.y = CAM_BASE.y + expEnv.mid * P.modMid;
    camera.position.z = CAM_BASE.z - expEnv.rms * P.modRms + expEnv.kick * P.modKick;

    if (P.exportPreset === 'lofi') {
      camera.position.x += (Math.random() - 0.5) * 0.015;
      camera.position.y += (Math.random() - 0.5) * 0.015;
    }

    camera.lookAt(0, -0.5, 0);
    material.opacity = 0.6 + expEnv.trans * P.modTrans;
    material.transparent = true;
    _colScratch.lerpColors(_colA, _colB, Math.min(expEnv.mid * 3.5, 1));
    material.color.copy(_colScratch);

    // History + displacement
    expHead = (expHead + P.rows - 1) % P.rows;
    const row = expHist[expHead];
    for (let k = 0; k < NUM_BINS; k++) row[k] = (_scratchPrev[k] / 255) * aWeightGain[k];

    if (visMode === 'bowl') {
      for (let r = 0; r < P.rows; r++) {
        const pos  = posBuffers[r];
        const hrow = expHist[(expHead + r) % P.rows];
        const bf   = bowlFactor(r, P.rows, be);
        for (let c = 0; c < P.cols; c++) {
          const m = c < half ? c : P.cols - 1 - c;
          pos[c * 3 + 1] = -hrow[expBinMap[Math.min(m, half - 1)]] * bf * disp;
        }
        lines[r].geometry.attributes.position.needsUpdate = true;
      }
    } else if (visMode === 'polar') {
      const segs   = P.cols;
      const BASE_R = 0.4, MAX_R = 4.5;
      for (let r = 0; r < P.rows; r++) {
        const pos  = polarBufs[r];
        const hrow = expHist[(expHead + r) % P.rows];
        const bf   = bowlFactor(r, P.rows, be);
        const y    = (r / (P.rows - 1) - 0.5) * -3.0;
        for (let c = 0; c <= segs; c++) {
          const ci = c % segs;
          const m  = ci < half ? ci : segs - 1 - ci;
          const fv = hrow[expBinMap[Math.min(m, half - 1)]];
          const radius = BASE_R + (MAX_R - BASE_R) * bf * (1 + fv * disp * 0.18);
          const angle  = (ci / segs) * Math.PI * 2;
          pos[c * 3]     = Math.cos(angle) * radius;
          pos[c * 3 + 1] = y;
          pos[c * 3 + 2] = Math.sin(angle) * radius;
        }
        polarLines[r].geometry.attributes.position.needsUpdate = true;
      }
    } else if (visMode === 'sphere') {
      if (sphereGeo) {
        const pos   = sphereGeo.attributes.position;
        const arr   = pos.array;
        const count = arr.length / 3;
        for (let i = 0; i < count; i++) {
          const bx = sphereBasePts[i * 3], by = sphereBasePts[i * 3 + 1], bz = sphereBasePts[i * 3 + 2];
          const az = Math.atan2(bz, bx);
          const t  = (az / (Math.PI * 2) + 0.5);
          const ci = Math.floor(t * (P.cols - 1));
          const m  = ci < half ? ci : P.cols - 1 - ci;
          const fv = _scratchPrev[expBinMap[Math.min(m, half - 1)]] / 255;
          const push = 1 + fv * disp * 0.4;
          arr[i * 3] = bx * push; arr[i * 3 + 1] = by * push; arr[i * 3 + 2] = bz * push;
        }
        pos.needsUpdate = true;
        sphereGeo.computeVertexNormals();
      }
    } else if (visMode === 'wave') {
      if (waveBuf && waveGeo) {
        for (let c = 0; c < P.cols; c++) {
          const x = (c / (P.cols - 1) - 0.5) * GRID_W;
          const v = (_scratchPcm[Math.floor(c * FFT_SIZE / P.cols)] || 0);
          waveBuf[c * 3] = x; waveBuf[c * 3 + 1] = v * disp; waveBuf[c * 3 + 2] = 0;
        }
        waveGeo.attributes.position.needsUpdate = true;
      }
    }

    setTimeDisplay(f / fps, duration);
    renderer.render(scene, camera);

    // Composite WebGL frame + text overlay onto 2D canvas
    const frameCanvas = compositeFrame(renderer.domElement, meta, f / fps, duration);

    const vf = new VideoFrame(frameCanvas,
      { timestamp: Math.round(f * (1e6 / fps)), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
    vf.close();

    if (f % 30 === 0) await venc.flush();
    if (f % 10 === 0) { onProgress(Math.round((f / totalFrames) * 100)); await new Promise(r => setTimeout(r, 0)); }
  }
}

/* ── Public entry point ───────────────────────────────────── */
const progressEl    = document.getElementById('progress');
const topLoadBtn    = document.getElementById('topLoadBtn');
const topRenderBtn  = document.getElementById('topRenderBtn');

export let isExporting = false;

export async function startExport(wavFile, visMode) {
  if (isExporting) return;

  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: `${wavFile.name.replace(/\.[^.]+$/, '')}_psychograph.mp4`,
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

    console.log('Decoding audio:', wavFile.name);
    progressEl.textContent = 'decoding...';
    const ab  = await wavFile.arrayBuffer();
    const tmp = new AudioContext();
    const buf = await tmp.decodeAudioData(ab);
    await tmp.close();
    console.log('Audio decoded. Buffer size:', buf.length, 'frames');

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

    console.log('Creating writable stream...');
    writable = await fileHandle.createWritable();

    const { Muxer, StreamTarget } = Mp4Muxer;
    const target = new StreamTarget({
      onData: (data, position) => { writable.write({ type: 'write', data, position }); },
    });
    const muxer = new Muxer({ target,
      video: { codec: 'avc', width: EXPORT_W, height: EXPORT_H },
      audio: { codec: 'aac', sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels },
      fastStart: false });

    console.log('Configuring encoders...');
    const venc = new VideoEncoder({
      output: (c, m) => muxer.addVideoChunk(c, m),
      error: e => { console.error('VEnc error:', e); progressEl.textContent = 'v-encoder error'; }
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
      console.log('Target mode not supported, trying fallback...');
      vcfg = { codec: 'avc1.4D4028', width: EXPORT_W, height: EXPORT_H, framerate: FPS, bitrate: 8e6 };
      sup = await VideoEncoder.isConfigSupported(vcfg);
    }
    if (!sup.supported) {
      console.log('Main profile not supported, trying baseline...');
      vcfg = { codec: 'avc1.42E01F', width: EXPORT_W, height: EXPORT_H, framerate: FPS, bitrate: 5e6 };
    }
    venc.configure(vcfg);
    console.log('VEnc configured with:', vcfg.codec, P.exportPreset);

    const aenc = new AudioEncoder({
      output: (c, m) => muxer.addAudioChunk(c, m),
      error: e => { console.error('AEnc error:', e); progressEl.textContent = 'a-encoder error'; }
    });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: buf.sampleRate,
      numberOfChannels: buf.numberOfChannels, bitrate: 192e3 });

    console.log('Export started:', duration.toFixed(1), 's');
    progressEl.textContent = '0%';
    await runExport(venc, buf, FPS, duration, visMode, p => {
      progressEl.textContent = `${p}%`;
      if (p % 10 === 0) console.log(`Progress: ${p}%`);
    });

    console.log('Video encoded. Encoding audio...');
    progressEl.textContent = 'audio...';
    await encodeAudio(aenc, buf);

    console.log('Audio encoded. Flushing and muxing...');
    progressEl.textContent = 'muxing...';
    await venc.flush();
    await aenc.flush();
    muxer.finalize();
    await writable.close();
    console.log('Export complete.');
    progressEl.textContent = 'done.';

  } catch (err) {
    console.error('Export failed:', err);
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
  }
}
