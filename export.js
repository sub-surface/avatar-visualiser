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
import { lookRenderer } from './look.js';
import { initOverlayCanvas, freeOverlayCanvas, compositeFrame } from './overlay.js';

function logStatus(message) {
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: message }));
}

function findModeTriggers(mono, sampleRate, project) {
  const windowSize = sampleRate;
  const energy = [];
  for (let offset = 0; offset < mono.length; offset += windowSize) {
    const end = Math.min(offset + windowSize, mono.length);
    let sum = 0;
    for (let index = offset; index < end; index++) sum += mono[index] * mono[index];
    energy.push({ time: offset / sampleRate, rms: Math.sqrt(sum / Math.max(1, end - offset)) });
  }

  const spacing = 8 - Math.max(0, Math.min(1, project.peakSens)) * 5;
  const triggers = [];
  for (const candidate of [...energy].sort((a, b) => b.rms - a.rms)) {
    if (triggers.length >= 15) break;
    if (triggers.every((entry) => Math.abs(entry.time - candidate.time) >= spacing)) {
      triggers.push(candidate);
    }
  }
  return triggers.sort((a, b) => a.time - b.time).map((entry) => entry.time);
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
  const triggers = ['off', 'static', 'ambient'].includes(project.cycleMode)
    ? []
    : findModeTriggers(channelL, audioBuffer.sampleRate, project);
  const random = createSeededRandom(seedFrom(audioBuffer, getTrackMeta()));

  let currentModeIndex = Math.max(0, modes.indexOf(initialMode));
  let shotIndex = Math.max(0, shots.indexOf(project.cameraShot));
  let triggerIndex = 0;
  let currentMode = modes[currentModeIndex];
  if (['off', 'static'].includes(project.cycleMode)) project.cameraMotion = 'still';

  session.reset({ clearField: false });
  session.setMode(currentMode, { immediate: true });
  signalField.rebuild(project.rows, Math.round(project.complexity) * 32);
  signalField.resetHistory(project.rows);
  lookRenderer.clearFeedback();
  lookRenderer.resetCadence();

  const itemScene = getOrCreateItemScene(scene);
  const isItemMode = project.visualCategory === 'item';
  if (isItemMode && itemScene) {
    itemScene.setVisible(true);
    signalField.mesh.visible = false;
    itemScene.setActiveItem(project.activeItem || 'cartridge');
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
      if (['cinematic', 'types', 'generative', 'random'].includes(project.cycleMode)) {
        shotIndex = (shotIndex + 1) % shots.length;
      }
      if (['types', 'random'].includes(project.cycleMode)) {
        currentModeIndex = (currentModeIndex + 1) % modes.length;
        currentMode = modes[currentModeIndex];
        session.setMode(currentMode);
      }
      if (['generative', 'random'].includes(project.cycleMode)) {
        randomiseSnapshot(project, random, false);
      }
      logStatus(`Cue ${triggerIndex}/${triggers.length}: ${currentMode} · ${shots[shotIndex]}`);
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

const progressElement = document.getElementById('progress');
const topLoadButton = document.getElementById('topLoadBtn');
const topRenderButton = document.getElementById('topRenderBtn');

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
  topLoadButton.disabled = true;
  topRenderButton.disabled = true;

  try {
    await document.fonts.ready;
    logStatus(`Decoding ${audioFile.name}`);
    progressElement.textContent = 'decoding...';
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
    progressElement.textContent = '0%';
    await runExport(
      videoEncoder,
      audioBuffer,
      fps,
      duration,
      visualMode,
      project,
      (progress) => { progressElement.textContent = `${progress}%`; },
    );
    logStatus('Encoding audio...');
    await encodeAudio(audioEncoder, audioBuffer);
    await videoEncoder.flush();
    await audioEncoder.flush();
    muxer.finalize();
    await writable.close();
    progressElement.textContent = 'done.';
    logStatus('Export complete');
  } catch (error) {
    logStatus(`Export failed: ${error.message ?? error}`);
    progressElement.textContent = `err: ${error.message ?? error}`;
    try { await writable?.abort(); } catch {}
  } finally {
    freeOverlayCanvas();
    endExportResize();
    camera.position.copy(cameraPosition);
    camera.quaternion.copy(cameraQuaternion);
    lookRenderer.clearFeedback();
    lookRenderer.resetCadence();
    isExporting = false;
    topRenderButton.disabled = false;
    topLoadButton.disabled = false;
    setTimeDisplay(0, 0);
    getOrCreateItemScene(scene)?.setVisible(P.visualCategory === 'item');
    signalField.mesh.visible = P.visualCategory !== 'item';
    window.dispatchEvent(new CustomEvent('avatar-rebuild-vis'));
  }
}
