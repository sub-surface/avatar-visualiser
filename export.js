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
import { initOverlayCanvas, freeOverlayCanvas, compositeFrame } from './overlay.js';

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

function exportDimensions(project) {
  const vertical = project.exportOrientation === 'vertical';
  const fourThree = project.exportAspect === '4:3';
  if (project.exportPreset === 'lofi') {
    if (fourThree) return vertical ? [480, 640] : [640, 480];
    return vertical ? [360, 640] : [640, 360];
  }
  if (fourThree) return vertical ? [1080, 1440] : [1440, 1080];
  return vertical ? [1080, 1920] : [1920, 1080];
}

async function encodeAudio(encoder, buffer) {
  const sampleRate = buffer.sampleRate;
  const channelCount = buffer.numberOfChannels;
  const chunkSize = 4096;
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const frameCount = Math.min(chunkSize, buffer.length - offset);
    const planar = new Float32Array(frameCount * channelCount);
    for (let channel = 0; channel < channelCount; channel++) {
      planar.set(buffer.getChannelData(channel).subarray(offset, offset + frameCount), channel * frameCount);
    }
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: channelCount,
      numberOfFrames: frameCount,
      timestamp: Math.round((offset / sampleRate) * 1e6),
      data: planar,
    });
    encoder.encode(audioData);
    audioData.close();
  }
  await encoder.flush();
}

async function runExport(encoder, audioBuffer, fps, duration, initialMode, project, onProgress) {
  const session = new RenderSession(project, {
    field: signalField,
    mode: initialMode,
    columns: () => Math.round(project.complexity) * 32,
  });
  const channelL = audioBuffer.getChannelData(0);
  const channelR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channelL;
  const totalFrames = Math.ceil(duration * fps);
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

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    while (encoder.encodeQueueSize > 4) await new Promise((resolve) => setTimeout(resolve, 0));
    const time = frameIndex / fps;

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
      logStatus(`Cue ${triggerIndex}/${triggers.length}: ${currentSceneId} · ${shots[shotIndex]}`);
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

    setTimeDisplay(time, duration);
    const frameCanvas = compositeFrame(
      renderer.domElement,
      { ...getTrackMeta(), vhsOsd: project.vhsOsd },
      time,
      duration,
      currentMode,
    );
    const timestamp = Math.round(frameIndex * (1e6 / fps));
    const videoFrame = new VideoFrame(frameCanvas, {
      timestamp,
      duration: Math.round(1e6 / fps),
    });
    encoder.encode(videoFrame, { keyFrame: frameIndex % (fps * 2) === 0 });
    videoFrame.close();

    if (frameIndex % 30 === 0) await encoder.flush();
    if (frameIndex % 10 === 0) {
      onProgress(Math.round((frameIndex / totalFrames) * 100));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function setExportButtonsDisabled(disabled) {
  const loadBtn = document.getElementById('btnLoadFile');
  const exportBtn = document.getElementById('btnExportMp4');
  if (loadBtn) loadBtn.disabled = Boolean(disabled);
  if (exportBtn) exportBtn.disabled = Boolean(disabled);
}

function setProgressText(text) {
  const el = document.getElementById('progress');
  if (el) el.textContent = text;
}

export let isExporting = false;

export async function startExport(audioFile, visualMode) {
  if (isExporting) return;

  const meta = getTrackMeta();
  const stem = meta.title
    ? `${meta.artist ? `${meta.title} - ${meta.artist}` : meta.title} | Avatar Visualiser`
    : `${audioFile.name.replace(/\.[^.]+$/, '')} | Avatar Visualiser`;

  let fileHandle;
  try {
    fileHandle = await window.showSaveFilePicker({
      suggestedName: `${stem}.mp4`,
      types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
    });
  } catch {
    return;
  }

  const project = cloneProject(P);
  const cameraPosition = camera.position.clone();
  const cameraQuaternion = camera.quaternion.clone();
  const [width, height] = exportDimensions(project);
  const fps = project.exportPreset === 'high' || project.exportPreset === 'lossless' ? 60 : 30;
  let writable = null;
  isExporting = true;
  setExportButtonsDisabled(true);

  try {
    await document.fonts.ready;
    logStatus(`Decoding ${audioFile.name}`);
    setProgressText('decoding...');
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(await audioFile.arrayBuffer());
    await audioContext.close();
    const duration = audioBuffer.length / audioBuffer.sampleRate;

    initOverlayCanvas(width, height);
    beginExportResize(width, height);
    writable = await fileHandle.createWritable();

    const muxer = new Muxer({
      target: new StreamTarget({
        onData: (data, position) => writable.write({ type: 'write', data, position }),
      }),
      video: { codec: 'avc', width, height },
      audio: {
        codec: 'aac',
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
      },
      fastStart: false,
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: (error) => logStatus(`Video encoder error: ${error.message}`),
    });
    const bitrate = project.exportPreset === 'lossless'
      ? 25e6
      : project.exportPreset === 'lofi' ? 2.5e6 : 12e6;
    videoEncoder.configure({
      codec: project.exportPreset === 'lofi' ? 'avc1.4D401F' : 'avc1.640028',
      width,
      height,
      framerate: fps,
      bitrate,
      latencyMode: project.exportPreset === 'lofi' ? 'realtime' : 'quality',
    });

    const audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
      error: (error) => logStatus(`Audio encoder error: ${error.message}`),
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      bitrate: 192e3,
    });

    logStatus(`Exporting ${duration.toFixed(1)}s at ${width}×${height} · ${fps} fps`);
    setProgressText('0%');
    await runExport(
      videoEncoder,
      audioBuffer,
      fps,
      duration,
      visualMode,
      project,
      (progress) => { setProgressText(`${progress}%`); },
    );
    logStatus('Encoding audio...');
    await encodeAudio(audioEncoder, audioBuffer);
    await videoEncoder.flush();
    await audioEncoder.flush();
    muxer.finalize();
    await writable.close();
    setProgressText('done.');
    logStatus('Export complete');
  } catch (error) {
    logStatus(`Export failed: ${error.message ?? error}`);
    setProgressText(`err: ${error.message ?? error}`);
    try { await writable?.abort(); } catch {}
  } finally {
    freeOverlayCanvas();
    endExportResize();
    camera.position.copy(cameraPosition);
    camera.quaternion.copy(cameraQuaternion);
    lookRenderer.clearFeedback();
    lookRenderer.resetCadence();
    isExporting = false;
    setExportButtonsDisabled(false);
    setTimeDisplay(0, 0);
    getOrCreateItemScene(scene)?.setVisible(P.visualCategory === 'item');
    signalField.mesh.visible = P.visualCategory !== 'item';
    window.dispatchEvent(new CustomEvent('avatar-rebuild-vis'));
  }
}
