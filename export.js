/**
 * export.js — deterministic WebCodecs export.
 *
 * Preview and export now share SharedAnalyzer, SignalField, camera presets and
 * LookRenderer. Export operates on an immutable project snapshot.
 */
import { Muxer, StreamTarget } from 'mp4-muxer';
import {
  renderer,
  scene,
  camera,
  ambientLight,
  dirLight,
  fillLight,
  beginExportResize,
  endExportResize,
  setColors,
} from './engine.js';
import { CAMERA_SHOTS, proceduralCameraPose } from './cam.js';
import { P, getTrackMeta, setTimeDisplay } from './params.js';
import {
  PARAM_SCHEMA,
  cloneProject,
} from './project-schema.js';
import { createSeededRandom } from './signal.js';
import { RenderSession } from './render-session.js';
import { signalField, FIELD_MODES } from './vis/field.js';
import { getOrCreateItemScene } from './src/objects/item-scene.js';
import { skyboxManager } from './src/look/skybox.js';
import { lookRenderer } from './look.js';
import { initOverlayCanvas, freeOverlayCanvas, compositeFrame, canBypassComposite } from './overlay.js';
import { calculateTransitionGlitch } from './src/playlist/album-manager.js';
import {
  describeExport,
  frameWindow,
  channelSourceMap,
  formatClock,
  formatBytes,
} from './src/export/export-spec.js';
import { exportState, cancelExport } from './src/export/export-state.js';

export { cancelExport };

function logStatus(message) {
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: message }));
}

export function findModeTriggers(mono, sampleRate, project = {}) {
  if (!mono || mono.length === 0 || !sampleRate) return [];

  const hopSize = Math.max(256, Math.floor(sampleRate * 0.05)); // 50ms analysis window
  const numFrames = Math.floor(mono.length / hopSize);
  if (numFrames < 4) return [];

  const duration = mono.length / sampleRate;
  const peakSens = Number.isFinite(project?.peakSens) ? Math.max(0, Math.min(1, project.peakSens)) : 0.5;
  const minSpacing = Math.max(2.5, 8.0 - peakSens * 5.0);

  if (duration < minSpacing) return [];

  // 1. Compute fine-grained RMS energy profile per 50ms frame
  const energy = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const offset = i * hopSize;
    const end = Math.min(offset + hopSize, mono.length);
    let sum = 0;
    for (let j = offset; j < end; j++) {
      const v = mono[j];
      sum += v * v;
    }
    energy[i] = Math.sqrt(sum / Math.max(1, end - offset));
  }

  // 2. Score each frame for drop onsets & energy surges over rolling 1.5s baseline
  const baselineWindow = 30;
  const candidates = [];
  let runningSum = 0;
  let runningCount = 0;

  for (let i = 0; i < numFrames; i++) {
    runningSum += energy[i];
    runningCount++;
    if (i >= baselineWindow) {
      runningSum -= energy[i - baselineWindow];
      runningCount--;
    }
    const baseline = runningCount > 0 ? (runningSum / runningCount) : energy[i];
    const prev = i > 0 ? energy[i - 1] : energy[i];

    // Energy surge over recent baseline (breakdowns into drops)
    const surge = Math.max(0, energy[i] - baseline);
    // Instantaneous onset attack (snare/kick downbeat)
    const attack = Math.max(0, energy[i] - prev);
    const rms = energy[i];

    // Combined drop score: heavily weights sudden surges into loud sections
    const score = surge * 3.0 + attack * 2.0 + rms * 0.8;

    const time = i * (hopSize / sampleRate);
    // Exclude cues in the very first 1.2s or final 1.5s of the track
    if (time >= 1.2 && time <= duration - 1.5) {
      candidates.push({ frame: i, time, score, rms });
    }
  }

  // 3. Filter for local maxima within a +/- 2 frame (100ms) window
  const localPeaks = [];
  for (let c = 0; c < candidates.length; c++) {
    const curr = candidates[c];
    if (curr.score < 0.005) continue;
    const prev1 = candidates[c - 1]?.score ?? 0;
    const prev2 = candidates[c - 2]?.score ?? 0;
    const next1 = candidates[c + 1]?.score ?? 0;
    const next2 = candidates[c + 2]?.score ?? 0;
    if (curr.score >= prev1 && curr.score >= prev2 && curr.score >= next1 && curr.score >= next2) {
      localPeaks.push(curr);
    }
  }

  // 4. Greedily pick strongest drop & energy peaks respecting minSpacing
  const triggers = [];
  const sortedPeaks = [...localPeaks].sort((a, b) => b.score - a.score);
  for (const cand of sortedPeaks) {
    if (triggers.every((t) => Math.abs(t.time - cand.time) >= minSpacing)) {
      triggers.push(cand);
    }
  }

  // Sort chronologically
  triggers.sort((a, b) => a.time - b.time);

  // 5. Ensure full track coverage: fill any remaining gap > maxSpacing
  const maxSpacing = minSpacing * 2.2;
  let expanded = true;
  while (expanded) {
    expanded = false;
    // Check gap before first trigger
    const firstTime = triggers.length > 0 ? triggers[0].time : duration;
    if (firstTime > maxSpacing) {
      const best = localPeaks
        .filter((p) => p.time >= minSpacing && p.time <= firstTime - minSpacing)
        .sort((a, b) => b.score - a.score)[0];
      if (best && triggers.every((t) => Math.abs(t.time - best.time) >= minSpacing)) {
        triggers.push(best);
        triggers.sort((a, b) => a.time - b.time);
        expanded = true;
        continue;
      }
    }

    // Check gaps between consecutive triggers
    for (let j = 0; j < triggers.length - 1; j++) {
      const gap = triggers[j + 1].time - triggers[j].time;
      if (gap > maxSpacing) {
        const tStart = triggers[j].time + minSpacing;
        const tEnd = triggers[j + 1].time - minSpacing;
        if (tEnd > tStart) {
          const best = localPeaks
            .filter((p) => p.time >= tStart && p.time <= tEnd)
            .sort((a, b) => b.score - a.score)[0];
          if (best && triggers.every((t) => Math.abs(t.time - best.time) >= minSpacing)) {
            triggers.push(best);
            triggers.sort((a, b) => a.time - b.time);
            expanded = true;
            break;
          }
        }
      }
    }

    // Check gap after last trigger
    if (triggers.length > 0) {
      const lastTime = triggers[triggers.length - 1].time;
      if (duration - lastTime > maxSpacing) {
        const tStart = lastTime + minSpacing;
        const tEnd = duration - 1.5;
        if (tEnd > tStart) {
          const best = localPeaks
            .filter((p) => p.time >= tStart && p.time <= tEnd)
            .sort((a, b) => b.score - a.score)[0];
          if (best && triggers.every((t) => Math.abs(t.time - best.time) >= minSpacing)) {
            triggers.push(best);
            triggers.sort((a, b) => a.time - b.time);
            expanded = true;
            continue;
          }
        }
      }
    }
  }

  // Return trigger timestamps rounded to 2 decimals
  return triggers.map((t) => +t.time.toFixed(2));
}

function seedFrom(audioBuffer, meta) {
  let hash = (audioBuffer.length ^ audioBuffer.sampleRate) >>> 0;
  const text = `${meta.artist}|${meta.title}|${meta.bpm}|${meta.genre}`;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return hash || 1;
}

function randomiseSnapshot(project, random, includeGeometry = false) {
  for (const [key, rule] of Object.entries(PARAM_SCHEMA)) {
    if (!rule.random || (!includeGeometry && rule.update === 'geometry')) continue;
    const [minimum, maximum] = rule.random;
    let value = minimum + random() * (maximum - minimum);
    if (rule.integer) value = Math.round(value);
    project[key] = value;
  }
}

/**
 * Create a codec whose fatal error is captured so the real cause surfaces
 * instead of the follow-up "Cannot call 'encode' on a closed codec".
 */
function createTrackedEncoder(Ctor, output, label) {
  const tracked = { error: null, encoder: null };
  tracked.encoder = new Ctor({
    output,
    error: (error) => {
      tracked.error ??= error;
      logStatus(`${label} encoder error: ${error.message}`);
    },
  });
  tracked.assertOpen = () => {
    if (tracked.encoder.state === 'closed') {
      throw new Error(`${label} encoder failed: ${tracked.error?.message ?? 'codec closed unexpectedly'}`);
    }
  };
  return tracked;
}

async function configureVideoEncoder(tracked, spec) {
  const { width, height, fps, bitrate, lofi, codec } = spec;
  const base = {
    codec,
    width,
    height,
    framerate: fps,
    bitrate,
    latencyMode: lofi ? 'realtime' : 'quality',
  };
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
    const config = { ...base, hardwareAcceleration };
    const { supported } = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (supported) {
      tracked.encoder.configure(config);
      return config;
    }
  }
  throw new Error(`No H.264 encoder supports ${width}×${height} @ ${fps}fps (${base.codec})`);
}

function closeEncoder(tracked) {
  try {
    if (tracked?.encoder && tracked.encoder.state !== 'closed') tracked.encoder.close();
  } catch {}
}

/**
 * Wait until the encoder's queue drains below `low` once it exceeds `high`.
 * Uses the 'dequeue' event, with a short safety timeout per wait.
 */
async function waitForQueue(tracked, high, low) {
  const { encoder } = tracked;
  while (encoder.encodeQueueSize > high) {
    tracked.assertOpen();
    await new Promise((resolve) => {
      let timer = null;
      const finish = () => {
        encoder.removeEventListener?.('dequeue', onDequeue);
        clearTimeout(timer);
        resolve();
      };
      const onDequeue = () => {
        if (encoder.encodeQueueSize <= low || encoder.state === 'closed') finish();
      };
      encoder.addEventListener?.('dequeue', onDequeue);
      timer = setTimeout(finish, 50);
    });
    if (encoder.encodeQueueSize <= low) break;
  }
}

/**
 * Yield to the event loop without timer clamping. setTimeout(0) is throttled
 * to >=1s in background tabs, which made exports crawl when the tab was hidden.
 */
let yieldChannel = null;
const yieldQueue = [];
function yieldToEventLoop() {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!yieldChannel) {
    yieldChannel = new MessageChannel();
    yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
  }
  return new Promise((resolve) => {
    yieldQueue.push(resolve);
    yieldChannel.port2.postMessage(0);
  });
}

/**
 * Encode `buffer` samples [startSample, endSample) as AAC. Output timestamps
 * start at `offsetTimestampUs`, so a clip begins at t=0 in the file.
 */
async function encodeAudio(tracked, buffer, {
  offsetTimestampUs = 0,
  channelCount = buffer.numberOfChannels,
  startSample = 0,
  endSample = buffer.length,
  job = null,
} = {}) {
  const { encoder } = tracked;
  const sampleRate = buffer.sampleRate;
  const chunkSize = 4096;
  const fullPlanar = new Float32Array(chunkSize * channelCount);
  const sources = channelSourceMap(buffer.numberOfChannels, channelCount)
    .map((source) => buffer.getChannelData(source));

  for (let offset = startSample; offset < endSample; offset += chunkSize) {
    await waitForQueue(tracked, 24, 12);
    job?.throwIfCancelled();
    const frameCount = Math.min(chunkSize, endSample - offset);
    const planar = frameCount === chunkSize ? fullPlanar : new Float32Array(frameCount * channelCount);
    for (let channel = 0; channel < channelCount; channel++) {
      planar.set(sources[channel].subarray(offset, offset + frameCount), channel * frameCount);
    }
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: channelCount,
      numberOfFrames: frameCount,
      timestamp: Math.round(((offset - startSample) / sampleRate) * 1e6) + offsetTimestampUs,
      data: planar,
    });
    try {
      tracked.assertOpen();
      encoder.encode(audioData);
    } finally {
      audioData.close();
    }
  }
}

async function runExport(
  tracked,
  audioBuffer,
  fps,
  duration,
  initialMode,
  project,
  onProgress,
  {
    globalFrameOffset = 0,
    albumState = null,
    isAlbum = false,
    isLastTrack = false,
    job = null,
    startTime = 0,
    endTime = duration,
  } = {},
) {
  const { encoder } = tracked;
  const session = new RenderSession(project, {
    field: signalField,
    mode: initialMode,
    columns: () => Math.round(project.complexity) * 32,
  });
  const channelL = audioBuffer.getChannelData(0);
  const channelR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channelL;
  const { startFrame, endFrame, prerollFrames, encodedFrames } = frameWindow(duration, fps, startTime, endTime);
  const modes = FIELD_MODES.map((mode) => mode.id);
  const shots = CAMERA_SHOTS
    .map((shot) => shot.id)
    .filter((shot) => !['auto', 'manual'].includes(shot));

  const ITEM_SCENE_IDS = ['cartridge', 'vinyl', 'cassette', 'floppy', 'custom'];
  const sequence = (Array.isArray(project.exportSceneSequence) && project.exportSceneSequence.length > 0)
    ? project.exportSceneSequence
    : ['cartridge', 'sphere', 'vinyl', 'wave', 'cassette', 'cathedral', 'floppy', 'tunnel'];

  const triggers = (['off', 'static'].includes(project.cycleMode) && sequence.length <= 1)
    ? []
    : findModeTriggers(channelL, audioBuffer.sampleRate, project);
  const random = createSeededRandom(seedFrom(audioBuffer, getTrackMeta()));

  // Ensure skybox background & atmospheric lighting matches project configuration
  if (skyboxManager) {
    skyboxManager.setTarget(scene, { ambientLight, dirLight, fillLight });
    skyboxManager.setTheme(Boolean(project.isLight));
    skyboxManager.applyPreset(project.skyboxPreset || 'void', project.skyboxLightTone || 1.0);
  }

  let seqIndex = 0;
  let currentSceneId = sequence.length > 1
    ? sequence[0]
    : (project.visualCategory === 'item' ? (project.activeItem || 'cartridge') : initialMode);
  let isItemMode = ITEM_SCENE_IDS.includes(currentSceneId);
  let currentMode = isItemMode ? 'sphere' : currentSceneId;
  let currentModeIndex = Math.max(0, modes.indexOf(currentMode));
  let shotIndex = Math.max(0, shots.indexOf(project.cameraShot));
  let triggerIndex = 0;
  if (['off', 'static'].includes(project.cycleMode) && sequence.length <= 1) project.cameraMotion = 'still';

  session.reset({ clearField: false });
  session.setMode(currentMode, { immediate: true });
  signalField.rebuild(project.rows, Math.round(project.complexity) * 32);
  signalField.resetHistory(project.rows);
  lookRenderer.clearFeedback();
  lookRenderer.resetCadence();

  const itemScene = getOrCreateItemScene(scene);
  if (itemScene) {
    itemScene.setTheme(Boolean(project.isLight));
  }
  if (isItemMode && itemScene) {
    itemScene.setVisible(true);
    signalField.mesh.visible = false;
    itemScene.setActiveItem(currentSceneId);
  } else if (itemScene) {
    itemScene.setVisible(false);
    signalField.mesh.visible = true;
  }

  logStatus(`Timeline: ${triggers.length} deterministic energy cue${triggers.length === 1 ? '' : 's'}`);

  const baseTracking = project.vhsTracking || 0;
  const baseSyncDrop = project.vhsSyncDrop || 0;
  let lastYieldTime = performance.now();

  // Frames before startFrame (clip pre-roll) are rendered but not encoded, so
  // signal smoothing, feedback and cadence match a full render at that moment.
  for (let frameIndex = startFrame - prerollFrames; frameIndex < endFrame; frameIndex++) {
    await waitForQueue(tracked, 8, 4);
    job?.throwIfCancelled();

    const time = frameIndex / fps;
    const encodeThis = frameIndex >= startFrame;

    // Subtle magnetic tape head switch glitch during album track transitions
    if (isAlbum && !isLastTrack) {
      const glitch = calculateTransitionGlitch(time, duration);
      if (glitch > 0) {
        project.vhsTracking = Math.min(1.0, baseTracking + glitch * 0.35);
        project.vhsSyncDrop = Math.min(1.0, baseSyncDrop + glitch * 0.25);
      } else {
        project.vhsTracking = baseTracking;
        project.vhsSyncDrop = baseSyncDrop;
      }
    }

    while (triggerIndex < triggers.length && time >= triggers[triggerIndex]) {
      triggerIndex++;
      if (sequence.length > 1) {
        seqIndex = (seqIndex + 1) % sequence.length;
        currentSceneId = sequence[seqIndex];
        if (ITEM_SCENE_IDS.includes(currentSceneId)) {
          isItemMode = true;
          if (itemScene) {
            itemScene.setVisible(true);
            signalField.mesh.visible = false;
            itemScene.setActiveItem(currentSceneId);
          }
        } else {
          isItemMode = false;
          if (itemScene) itemScene.setVisible(false);
          signalField.mesh.visible = true;
          currentMode = currentSceneId;
          session.setMode(currentSceneId);
        }
      } else if (['types', 'random'].includes(project.cycleMode)) {
        currentModeIndex = (currentModeIndex + 1) % modes.length;
        currentMode = modes[currentModeIndex];
        session.setMode(currentMode);
      }

      if (['cinematic', 'types', 'generative', 'random'].includes(project.cycleMode) || sequence.length > 1) {
        shotIndex = (shotIndex + 1) % shots.length;
      }
      if (['generative', 'random'].includes(project.cycleMode)) {
        randomiseSnapshot(project, random, false);
      }
      if (encodeThis) logStatus(`Cue ${triggerIndex}/${triggers.length}: ${currentSceneId} · ${shots[shotIndex]}`);
    }

    const signalFrame = session.stepPcm(
      channelL,
      channelR,
      Math.floor(time * audioBuffer.sampleRate),
      {
        dt: 1 / fps,
        time,
        sampleRate: audioBuffer.sampleRate,
      },
    );

    if (isItemMode) {
      itemScene.update(1 / fps, time, signalFrame, project);
    }

    const cameraPose = proceduralCameraPose(project, currentMode, time, signalFrame, shots[shotIndex]);
    camera.position.set(
      cameraPose.position.x,
      cameraPose.position.y,
      cameraPose.position.z,
    );
    camera.lookAt(0, cameraPose.lookY, 0);

    if (lookRenderer.shouldRender(project, time)) {
      lookRenderer.render(scene, camera, project, { frameIndex, force: true });
    }
    if (!encodeThis) continue;

    const meta = {
      ...getTrackMeta(),
      title: project.title,
      artist: project.artist,
      bpm: project.bpm ? String(project.bpm) : '',
      genre: project.genre,
      vhsOsd: project.vhsOsd,
      albumTracklistStyle: project.albumTracklistStyle,
    };

    // Zero-copy direct WebGL bypass when overlays are inactive
    const frameSource = canBypassComposite(meta, time, duration, albumState)
      ? renderer.domElement
      : compositeFrame(
          renderer.domElement,
          meta,
          time,
          duration,
          currentMode,
          albumState,
        );

    const outputIndex = globalFrameOffset + frameIndex - startFrame;
    const timestamp = Math.round(outputIndex * (1e6 / fps));
    const videoFrame = new VideoFrame(frameSource, {
      timestamp,
      duration: Math.round(1e6 / fps),
    });
    try {
      tracked.assertOpen();
      encoder.encode(videoFrame, { keyFrame: outputIndex % (fps * 2) === 0 });
    } finally {
      videoFrame.close();
    }

    // Time-based cooperative yield (every ~40ms) keeps UI responsive without stalling fast GPUs
    const now = performance.now();
    if (now - lastYieldTime >= 40 || frameIndex === endFrame - 1) {
      lastYieldTime = now;
      setTimeDisplay(time, duration);
      onProgress(frameIndex - startFrame + 1, encodedFrames);
      await yieldToEventLoop();
    }
  }

  project.vhsTracking = baseTracking;
  project.vhsSyncDrop = baseSyncDrop;
}

class ExportCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ExportCancelled';
  }
}

/**
 * Wraps a FileSystemWritableFileStream to ensure all writes are strictly sequenced
 * in a FIFO promise chain without overlapping write operations, and catches any
 * asynchronous write rejections to prevent unhandled promise exceptions in the browser.
 */
class AsyncQueueFileWriter {
  constructor(writable) {
    this.writable = writable;
    this.chain = Promise.resolve();
    this.writeError = null;
    this.bytes = 0;
  }

  write(data, position) {
    if (this.writeError) return;
    this.bytes = Math.max(this.bytes, position + data.byteLength);
    this.chain = this.chain
      .then(async () => {
        try {
          await this.writable.write({ type: 'write', data, position });
        } catch (err) {
          this.writeError = err;
          console.error('File write failed:', err);
        }
      })
      .catch((err) => {
        this.writeError = err;
      });
  }

  async flush() {
    await this.chain;
    if (this.writeError) {
      throw this.writeError;
    }
  }

  async close() {
    await this.flush();
    await this.writable.close();
  }

  async abort() {
    try {
      await this.chain;
    } catch {}
    try {
      await this.writable.abort();
    } catch {}
  }
}

async function decodeAudioFile(file, sampleRate) {
  const decodeCtx = new AudioContext(sampleRate ? { sampleRate } : undefined);
  try {
    return await decodeCtx.decodeAudioData(await file.arrayBuffer());
  } finally {
    try { await decodeCtx.close(); } catch {}
  }
}

async function decodeTrackAudio(track, sampleRate) {
  if (!track || !track.file) {
    throw new Error(`Track (${track?.title || 'Unknown'}) has no audio file attached.`);
  }
  return decodeAudioFile(track.file, sampleRate);
}

async function pickSaveFile(stem) {
  try {
    return await window.showSaveFilePicker({
      suggestedName: `${stem}.mp4`,
      types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
    });
  } catch {
    return null;
  }
}

function setExportButtons(exporting) {
  const loadBtn = document.getElementById('btnLoadFile');
  const exportBtn = document.getElementById('btnExportMp4');
  const clipBtn = document.getElementById('btnExportClip');
  if (loadBtn) loadBtn.disabled = exporting;
  if (clipBtn) clipBtn.disabled = exporting;
  if (exportBtn) {
    // The record button doubles as a cancel button while exporting.
    exportBtn.classList.toggle('recording', exporting);
    if (exporting) {
      exportBtn.dataset.idleLabel ??= exportBtn.textContent;
      exportBtn.textContent = '■ CANCEL EXPORT (Esc)';
    } else if (exportBtn.dataset.idleLabel) {
      exportBtn.textContent = exportBtn.dataset.idleLabel;
      delete exportBtn.dataset.idleLabel;
    }
  }
}

function setProgressText(text) {
  const el = document.getElementById('progress');
  if (el) el.textContent = text;
}

/**
 * Shared export lifecycle for single-track and album exports: UI state, wake
 * lock, cancellation, muxer + encoders, finalisation, and full scene restore.
 *
 * `body(ctx)` renders and encodes. It must call `ctx.open({ sampleRate,
 * numberOfChannels })` once audio format is known, which creates the muxer and
 * encoders and returns `{ video, audio }` tracked encoders.
 */
async function runExportPipeline({ fileHandle, project, label }, body) {
  const spec = describeExport(project);
  const { width, height, fps } = spec;
  const cameraPosition = camera.position.clone();
  const cameraQuaternion = camera.quaternion.clone();
  const originalTitle = document.title;
  const startedAt = performance.now();

  const job = {
    cancelled: false,
    throwIfCancelled() {
      if (this.cancelled) throw new ExportCancelled();
    },
  };
  exportState.job = job;
  exportState.active = true;
  setExportButtons(true);
  window.dispatchEvent(new CustomEvent('avatar-export-start'));

  const onKeyDown = (event) => {
    if (event.key === 'Escape') cancelExport();
  };
  const onBeforeUnload = (event) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
  const wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);

  let writable = null;
  let fileWriter = null;
  let muxer = null;
  let video = null;
  let audio = null;
  let mediaDuration = 0;

  const progress = (fraction, prefix = '') => {
    const pct = Math.min(100, Math.floor(fraction * 100));
    const elapsed = (performance.now() - startedAt) / 1000;
    const eta = fraction > 0.01 ? elapsed * (1 / fraction - 1) : NaN;
    const etaText = Number.isFinite(eta) ? ` · ~${formatClock(eta)} left` : '';
    setProgressText(`${prefix}${pct}%${etaText} · Esc to cancel`);
    document.title = `${pct}% · ${label}`;
  };

  const ctx = {
    width,
    height,
    fps,
    job,
    progress,
    setMediaDuration(seconds) { mediaDuration = seconds; },
    async open({ sampleRate, numberOfChannels }) {
      writable = await fileHandle.createWritable();
      fileWriter = new AsyncQueueFileWriter(writable);
      muxer = new Muxer({
        target: new StreamTarget({
          chunked: true,
          chunkSize: 4 * 1024 * 1024,
          onData: (data, position) => fileWriter.write(data, position),
        }),
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', sampleRate, numberOfChannels },
        fastStart: false,
      });

      video = createTrackedEncoder(VideoEncoder, (chunk, metadata) => muxer.addVideoChunk(chunk, metadata), 'Video');
      const videoConfig = await configureVideoEncoder(video, spec);
      console.info('[export] video config', videoConfig);

      audio = createTrackedEncoder(AudioEncoder, (chunk, metadata) => muxer.addAudioChunk(chunk, metadata), 'Audio');
      audio.encoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: spec.audioBitrate });
      return { video, audio };
    },
  };

  try {
    await document.fonts.ready;
    initOverlayCanvas(width, height);
    beginExportResize(width, height);

    await body(ctx);
    if (!muxer) throw new Error('export pipeline was never opened');

    logStatus('Finalizing media stream...');
    setProgressText('muxing...');
    video.assertOpen();
    audio.assertOpen();
    await video.encoder.flush();
    await audio.encoder.flush();
    muxer.finalize();
    await fileWriter.close();

    const elapsed = (performance.now() - startedAt) / 1000;
    const speed = mediaDuration > 0 ? ` (${(mediaDuration / elapsed).toFixed(1)}× realtime)` : '';
    setProgressText(`done · ${formatClock(elapsed)}${speed} · ${formatBytes(fileWriter.bytes)}`);
    logStatus(`${label} complete in ${formatClock(elapsed)}${speed}`);
  } catch (error) {
    if (error instanceof ExportCancelled) {
      setProgressText('cancelled.');
      logStatus(`${label} cancelled`);
    } else {
      logStatus(`${label} failed: ${error.message ?? error}`);
      setProgressText(`err: ${error.message ?? error}`);
    }
    try { await fileWriter?.abort(); } catch {}
    if (!fileWriter) {
      try { await writable?.abort(); } catch {}
    }
  } finally {
    closeEncoder(video);
    closeEncoder(audio);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('beforeunload', onBeforeUnload);
    try { await wakeLock?.release(); } catch {}
    document.title = originalTitle;
    freeOverlayCanvas();
    endExportResize();
    camera.position.copy(cameraPosition);
    camera.quaternion.copy(cameraQuaternion);
    lookRenderer.clearFeedback();
    lookRenderer.resetCadence();
    exportState.job = null;
    exportState.active = false;
    setExportButtons(false);
    setTimeDisplay(0, 0);
    getOrCreateItemScene(scene)?.setVisible(P.visualCategory === 'item');
    signalField.mesh.visible = P.visualCategory !== 'item';
    window.dispatchEvent(new CustomEvent('avatar-rebuild-vis'));
  }
}

/**
 * Hold the busy flag across the save dialog so a double click can't open two
 * pickers, then run `fn`. Returns false if an export is already in progress.
 */
async function withBusyGuard(fn) {
  if (exportState.busy) return false;
  exportState.busy = true;
  try {
    await fn();
    return true;
  } finally {
    exportState.busy = false;
  }
}

/**
 * Export a single track.
 *
 * @param {File|Blob} audioFile
 * @param {string} visualMode
 * @param {object} [options]
 * @param {AudioBuffer} [options.audioBuffer] already-decoded audio (skips a re-decode)
 * @param {{start:number,end:number}} [options.range] export only this time range (test clip)
 */
export function startExport(audioFile, visualMode, { audioBuffer: decoded = null, range = null } = {}) {
  return withBusyGuard(async () => {
    const meta = getTrackMeta();
    const base = meta.title
      ? `${meta.artist ? `${meta.title} - ${meta.artist}` : meta.title}`
      : (audioFile.name || 'Audio Track').replace(/\.[^.]+$/, '');
    const clipTag = range ? ` (clip ${formatClock(range.start)}-${formatClock(range.end)})` : '';
    const fileHandle = await pickSaveFile(`${base}${clipTag} | Avatar Visualiser`);
    if (!fileHandle) return;

    const project = cloneProject(P);
    const label = range ? 'Clip export' : 'Export';
    await runExportPipeline({ fileHandle, project, label }, async (ctx) => {
      let audioBuffer = decoded;
      if (!audioBuffer) {
        logStatus(`Decoding ${audioFile.name || 'audio'}`);
        setProgressText('decoding...');
        audioBuffer = await decodeAudioFile(audioFile);
      }
      const duration = audioBuffer.length / audioBuffer.sampleRate;
      const startTime = range ? Math.max(0, Math.min(range.start, duration)) : 0;
      const endTime = range ? Math.max(startTime, Math.min(range.end, duration)) : duration;
      const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels);
      ctx.setMediaDuration(endTime - startTime);

      const { video, audio } = await ctx.open({ sampleRate: audioBuffer.sampleRate, numberOfChannels });

      logStatus(range
        ? `Clip ${formatClock(startTime)}-${formatClock(endTime)} at ${ctx.width}×${ctx.height} · ${ctx.fps} fps`
        : `Exporting ${duration.toFixed(1)}s at ${ctx.width}×${ctx.height} · ${ctx.fps} fps`);
      ctx.progress(0);

      await runExport(
        video,
        audioBuffer,
        ctx.fps,
        duration,
        visualMode,
        project,
        (done, total) => ctx.progress(done / Math.max(1, total)),
        { job: ctx.job, startTime, endTime },
      );

      logStatus('Encoding audio stream...');
      setProgressText('audio...');
      await encodeAudio(audio, audioBuffer, {
        channelCount: numberOfChannels,
        startSample: Math.floor(startTime * audioBuffer.sampleRate),
        endSample: Math.min(audioBuffer.length, Math.ceil(endTime * audioBuffer.sampleRate)),
        job: ctx.job,
      });
    });
  });
}

export function startAlbumExport(albumManager, visualMode = 'sphere') {
  if (!albumManager || !albumManager.hasTracks()) {
    logStatus('No tracks in album playlist to export');
    return Promise.resolve(false);
  }
  return withBusyGuard(async () => {
    const tracks = albumManager.tracks;
    const totalTracks = tracks.length;
    const activeTrack = albumManager.getActiveTrack() || tracks[0];
    const albumTitle = activeTrack.title || 'Album';

    const fileHandle = await pickSaveFile(`${albumTitle} - Continuous Visualiser`);
    if (!fileHandle) return;

    const primaryProject = cloneProject(tracks[0].projectConfig || P);
    await runExportPipeline({ fileHandle, project: primaryProject, label: 'Album export' }, async (ctx) => {
      // Standardized audio profile across all tracks: 44.1kHz Stereo
      const sampleRate = 44100;
      const numberOfChannels = 2;
      const { video, audio } = await ctx.open({ sampleRate, numberOfChannels });

      let globalFrameOffset = 0;
      let globalAudioOffsetUs = 0;
      const totalAlbumDuration = albumManager.getTotalDuration();
      const totalAlbumFrames = Math.max(1, totalAlbumDuration * ctx.fps);
      ctx.setMediaDuration(totalAlbumDuration);

      logStatus(`Starting album export: ${totalTracks} tracks (${totalAlbumDuration.toFixed(1)}s total)`);
      ctx.progress(0);

      // Pipeline audio decoding: pre-decode track 0 immediately
      let currentAudioPromise = decodeTrackAudio(tracks[0], sampleRate);

      for (let i = 0; i < totalTracks; i++) {
        const track = tracks[i];
        const trackProject = cloneProject(track.projectConfig || P);

        logStatus(`[${i + 1}/${totalTracks}] Preparing ${track.title}...`);
        setProgressText(`T${i + 1} prep`);

        let audioBuffer = await currentAudioPromise;
        const trackDuration = audioBuffer.length / audioBuffer.sampleRate;
        track.duration = trackDuration;

        // Decode the next track in the background while this one renders. The noop
        // catch stops an early failure becoming an unhandled rejection; the error
        // still surfaces when the promise is awaited on the next iteration.
        const nextAudioPromise = i + 1 < totalTracks ? decodeTrackAudio(tracks[i + 1], sampleRate) : null;
        nextAudioPromise?.catch(() => {});

        // Apply bespoke look, skybox and colors for this track
        if (skyboxManager) {
          skyboxManager.setTarget(scene, { ambientLight, dirLight, fillLight });
          skyboxManager.setTheme(Boolean(trackProject.isLight));
          skyboxManager.applyPreset(trackProject.skyboxPreset || 'void', trackProject.skyboxLightTone || 1.0);
        }
        setColors(trackProject.colorA, trackProject.colorB);

        const albumState = {
          tracks: tracks.map((t) => ({ title: t.title, artist: t.artist, duration: t.duration })),
          activeIndex: i,
          style: trackProject.albumTracklistStyle || primaryProject.albumTracklistStyle || 'vcr-osd',
        };

        const trackFrames = Math.ceil(trackDuration * ctx.fps);

        await runExport(
          video,
          audioBuffer,
          ctx.fps,
          trackDuration,
          visualMode,
          trackProject,
          (done) => ctx.progress((globalFrameOffset + done) / totalAlbumFrames, `T${i + 1}/${totalTracks} · `),
          {
            globalFrameOffset,
            albumState,
            isAlbum: true,
            isLastTrack: i === totalTracks - 1,
            job: ctx.job,
          },
        );

        logStatus(`[${i + 1}/${totalTracks}] Encoding audio stream...`);
        await encodeAudio(audio, audioBuffer, {
          offsetTimestampUs: globalAudioOffsetUs,
          channelCount: numberOfChannels,
          job: ctx.job,
        });

        // Start each track's audio exactly where its video starts. Video advances
        // in whole frames, so accumulating exact durations drifted ~1 frame/track.
        globalFrameOffset += trackFrames;
        globalAudioOffsetUs = Math.round(globalFrameOffset * (1e6 / ctx.fps));

        // Dereference current track audio buffer for instant GC reclamation
        audioBuffer = null;
        currentAudioPromise = nextAudioPromise;
      }
    });
  });
}
