import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderer, scene, camera, ambientLight, dirLight, fillLight, fadeOut, fadeIn, setTheme, setColors } from '../engine.js';
import { P, getCols, loadParams, saveParams, syncControls, bindRange, bindSelect, bindText, updateTrackDisplay } from '../params.js';
import { PARAM_SCHEMA } from '../project-schema.js';
import { initAudio, stopAudio, setupAnalyser, getAnalyserL, getAnalyserR, getFreqDataL, getFreqDataR, isAudioReady, getLPF, getGainNode, getAudioContext, getAudioDevices } from '../audio.js';
import { bpmTick, resetBpmAuto } from '../tempo.js';
import { signalField, FIELD_MODES } from '../vis/field.js';
import { RenderSession } from '../render-session.js';
import { lookRenderer } from '../look.js';
import { applyLookProfile } from '../look-profiles.js';
import { compositeFrame, initOverlayCanvas, freeOverlayCanvas } from '../overlay.js';
import { startExport, startAlbumExport, isExporting } from '../export.js?v=2.0.2';
import { CameraRig, CameraDirector, shotPose, CAMERA_SHOTS, CAMERA_MOTIONS } from '../cam.js';
import { getOrCreateItemScene, RETRO_ITEMS } from './objects/item-scene.js';
import { SoundCloudImporter } from './ui/soundcloud-modal.js';
import { vcrOsd } from './vhs/vcr-osd.js';
import { skyboxManager } from './look/skybox.js';
import { sequenceModal } from './ui/sequence-modal.js';
import { extractPaletteFromImage } from './look/palette-extractor.js';
import { albumManager, formatDuration, calculateTracklistAlpha, calculateTransitionGlitch } from './playlist/album-manager.js';
import { albumModal } from './ui/album-modal.js';

const startupAudioUrl = new URL('../Startup.wav', import.meta.url).href;

/* ── Camera Rig & OrbitControls ──────────────────────────── */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.panSpeed = 0.8;
controls.enabled = true;
controls.minPolarAngle = THREE.MathUtils.degToRad(2);
controls.maxPolarAngle = THREE.MathUtils.degToRad(135);
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = Infinity;
controls.target.set(0, -0.5, 0);
controls.update();

export const cameraRig = new CameraRig(camera, controls, P);
export const itemScene = getOrCreateItemScene(scene);

// Global debug & window fallback
if (typeof window !== 'undefined') {
  window.cameraRig = cameraRig;
  window.CameraRig = CameraRig;
  window.CameraDirector = CameraDirector;
}

/* ── Visual Mode & Category Management ───────────────────── */
let visMode = 'sphere';
let visCategory = 'field'; // 'field' | 'item'

export function setCategory(cat) {
  visCategory = cat;
  P.visualCategory = cat;
  const isItem = cat === 'item';
  
  itemScene.setVisible(isItem);
  signalField.setVisible(!isItem);

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  document.getElementById('stripFields').style.display = isItem ? 'none' : 'flex';
  document.getElementById('stripItems').style.display = isItem ? 'flex' : 'none';

  // Toggle item-specific macro controls in the console
  const itemSection = document.getElementById('itemMacroGroup');
  if (itemSection) itemSection.style.display = isItem ? 'flex' : 'none';

  saveParams();
}

export async function setFieldMode(mode) {
  if (mode === visMode && visCategory === 'field') return;
  await fadeOut();
  
  visCategory = 'field';
  P.visualCategory = 'field';
  itemScene.setVisible(false);
  signalField.setVisible(true);

  document.body.classList.remove(`vis-${visMode}`);
  visMode = mode;
  document.body.classList.add(`vis-${mode}`);
  
  signalField.setMode(mode);
  signalField.rebuild(P.rows, getCols());

  if (P.cameraShot === 'auto' || P.cameraShot === 'hero') {
    cameraRig.selectShot(P.cameraShot, mode, P.cameraTransition, false);
  }

  updateActiveChips();
  updateCameraUI();
  fadeIn();
}

export async function setRetroItem(itemId) {
  visCategory = 'item';
  P.visualCategory = 'item';
  P.activeItem = itemId;
  
  signalField.setVisible(false);
  itemScene.setVisible(true);
  itemScene.setActiveItem(itemId);

  if (P.cameraShot === 'auto' || P.cameraShot === 'hero') {
    cameraRig.selectShot(P.cameraShot, itemId, P.cameraTransition, true);
  }

  updateActiveChips();
  updateCameraUI();
  saveParams();
}

function updateActiveChips() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === visCategory);
  });
  document.querySelectorAll('.mode-chip').forEach(chip => {
    if (chip.dataset.field) {
      chip.classList.toggle('active', visCategory === 'field' && chip.dataset.field === visMode);
    }
    if (chip.dataset.item) {
      chip.classList.toggle('active', visCategory === 'item' && chip.dataset.item === P.activeItem);
    }
  });
}

/* ── Audio Transport & Preview ───────────────────────────── */
let appMode = 'export';
let selectedWavFile = null;
let previewCtx = null;
let previewBuffer = null;
let previewSource = null;
let previewStartedAt = 0;
let previewPausedAt = 0;
let isPreviewPlaying = false;

const previewScrub = document.getElementById('previewScrub');
const topPreviewBtn = document.getElementById('btnPlayPause');
const topLoadBtn = document.getElementById('btnLoadFile');
const topRenderBtn = document.getElementById('btnExportMp4');
const wavInput = document.getElementById('wavInput');
const trackTitleEl = document.getElementById('deckTrackTitle');
const trackArtistEl = document.getElementById('deckTrackArtist');

export async function togglePreview() {
  if (!previewBuffer) {
    if (appMode === 'live') return;
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Please select an audio file (.wav, .mp3, .flac) to begin playback' }));
    wavInput?.click();
    return;
  }
  if (isPreviewPlaying) {
    previewPausedAt = previewCtx ? (previewCtx.currentTime - previewStartedAt) : 0;
    stopPreview();
  } else {
    await startPreview(previewPausedAt % previewBuffer.duration);
  }
}

export async function startPreview(startTime = 0) {
  if (isPreviewPlaying || !previewBuffer) return;
  if (!previewCtx) {
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (previewCtx.state === 'suspended') {
    try {
      await previewCtx.resume();
    } catch (e) {
      console.warn('AudioContext resume failed:', e);
    }
  }
  stopAudio();

  previewSource = previewCtx.createBufferSource();
  previewSource.buffer = previewBuffer;
  previewSource.loop = false;

  const currentSource = previewSource;
  previewSource.onended = () => {
    if (previewSource === currentSource && isPreviewPlaying) {
      const elapsed = previewCtx.currentTime - previewStartedAt;
      if (elapsed >= (previewBuffer.duration - 0.2)) {
        if (albumManager.isPlayingContinuous && albumManager.hasTracks()) {
          const nextIdx = albumManager.activeTrackIndex + 1;
          if (nextIdx < albumManager.tracks.length) {
            playAlbumTrack(nextIdx);
            return;
          } else {
            albumManager.isPlayingContinuous = false;
          }
        }
        stopPreview();
        previewPausedAt = 0;
        if (previewScrub) previewScrub.value = 0;
        vcrOsd.setPlayState('stop');
        window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Playback finished.' }));
      }
    }
  };

  setupAnalyser(previewCtx, { monitor: true });
  previewSource.connect(getLPF());
  previewSource.start(0, Math.min(startTime, Math.max(0, previewBuffer.duration - 0.05)));
  previewStartedAt = previewCtx.currentTime - startTime;
  isPreviewPlaying = true;
  if (topPreviewBtn) topPreviewBtn.textContent = 'pause';
  vcrOsd.setPlayState('play');
}

export async function playAlbumTrack(index) {
  const track = albumManager.selectTrack(index, P);
  if (!track || !track.file) return;

  stopPreview();
  albumModal.applyTrackToDeck(track);
  await loadAudioBuffer(track.file, track.filename);
  await startPreview(0);
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Album Track [${index + 1}/${albumManager.tracks.length}]: ${track.title}` }));
}

export function stopPreview() {
  if (previewSource) {
    try { previewSource.stop(); } catch (e) {}
    previewSource = null;
  }
  isPreviewPlaying = false;
  if (topPreviewBtn) topPreviewBtn.textContent = 'play';
  vcrOsd.setPlayState('pause');
  stopAudio();
}

export async function loadAudioBuffer(fileOrBlob, filename = 'Audio Track') {
  try {
    selectedWavFile = fileOrBlob;
    if (!previewCtx) previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ab = await fileOrBlob.arrayBuffer();
    previewBuffer = await previewCtx.decodeAudioData(ab);
    
    const cleanName = filename.replace(/\.[^.]+$/, '');
    const dashMatch = cleanName.match(/^([^\-]+)\s*-\s*(.+)$/);
    if (dashMatch) {
      const parsedArtist = dashMatch[1].trim();
      const parsedTitle = dashMatch[2].trim();
      P.artist = parsedArtist;
      P.title = parsedTitle;
      const artistInput = document.getElementById('pArtist');
      const titleInput = document.getElementById('pTitle');
      if (artistInput) artistInput.value = parsedArtist;
      if (titleInput) titleInput.value = parsedTitle;
      if (trackArtistEl) trackArtistEl.textContent = parsedArtist;
      if (trackTitleEl) trackTitleEl.textContent = parsedTitle;
    } else {
      P.title = cleanName;
      const titleInput = document.getElementById('pTitle');
      if (titleInput) titleInput.value = cleanName;
      if (trackTitleEl) trackTitleEl.textContent = cleanName;
    }
    updateTrackDisplay();
    saveParams();
    topRenderBtn.disabled = false;
    topPreviewBtn.disabled = false;
    topRenderBtn.classList.add('btn-active-highlight');
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Loaded: ${filename}` }));
  } catch (err) {
    console.error('Audio load error:', err);
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Audio error: ${err.message}` }));
  }
}

async function applyArtworkPalette(imgOrUrl) {
  try {
    const palette = await extractPaletteFromImage(imgOrUrl);
    if (palette && palette.colorA && palette.colorB) {
      P.colorA = palette.colorA;
      P.colorB = palette.colorB;
      const pColorA = document.getElementById('pColorA');
      const pColorB = document.getElementById('pColorB');
      const vColorA = document.getElementById('vColorA');
      const vColorB = document.getElementById('vColorB');
      if (pColorA) pColorA.value = palette.colorA;
      if (pColorB) pColorB.value = palette.colorB;
      if (vColorA) vColorA.textContent = palette.colorA.toUpperCase();
      if (vColorB) vColorB.textContent = palette.colorB.toUpperCase();
      setColors(P.colorA, P.colorB);
      saveParams();
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Artwork palette synced: ${palette.colorA} · ${palette.colorB}` }));
    }
  } catch (err) {
    console.warn('Artwork palette extraction error:', err);
  }
}

const soundcloudModal = new SoundCloudImporter({
  onTrackLoaded: (meta) => {
    if (meta.title) {
      P.title = meta.title;
      const el = document.getElementById('pTitle');
      if (el) el.value = meta.title;
      if (trackTitleEl) trackTitleEl.textContent = meta.title;
    }
    if (meta.artist) {
      P.artist = meta.artist;
      const el = document.getElementById('pArtist');
      if (el) el.value = meta.artist;
      if (trackArtistEl) trackArtistEl.textContent = meta.artist;
    }
    updateTrackDisplay();
    saveParams();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `SoundCloud: ${meta.title}` }));
  },
  onArtworkLoaded: async (artUrl) => {
    try {
      await itemScene.loadCustomImage(artUrl);
      await applyArtworkPalette(artUrl);
      setCategory('item');
      // Update image dropzone preview
      const thumb = document.getElementById('itemImgThumb');
      if (thumb) {
        thumb.src = artUrl;
        thumb.style.display = 'block';
      }
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'SoundCloud artwork mapped to 3D asset & palette' }));
    } catch (e) {
      console.warn('Artwork texture load error:', e);
    }
  }
});

/* ── Custom Image & DAE Model Upload for 3D Assets ───────── */
const itemImgInput = document.getElementById('itemImgInput');
const itemDropzone = document.getElementById('itemDropzone');
const itemImgThumb = document.getElementById('itemImgThumb');
const daeInput = document.getElementById('daeInput');
const btnImportDae = document.getElementById('btnImportDae');

if (itemDropzone && itemImgInput) {
  itemDropzone.addEventListener('click', () => itemImgInput.click());
  itemImgInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    await itemScene.loadCustomImage(url);
    await applyArtworkPalette(file);
    URL.revokeObjectURL(url);
    if (itemImgThumb) {
      itemImgThumb.src = url;
      itemImgThumb.style.display = 'block';
    }
    setCategory('item');
  });
}

async function handleDaeUpload(file) {
  try {
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Loading 3D model: ${file.name}...` }));
    await itemScene.loadDaeModel(file, file.name);
    setCategory('item');
    setRetroItem('custom');
    ensureCustomChip(file.name);
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Model loaded: ${file.name}` }));
  } catch (err) {
    console.error('DAE load failure:', err);
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `DAE error: ${err.message}` }));
  }
}

function ensureCustomChip(filename) {
  let chip = document.querySelector('.mode-chip[data-item="custom"]');
  const label = filename ? filename.replace(/\.[^.]+$/, '').toLowerCase() : 'custom dae';
  if (!chip) {
    chip = document.createElement('button');
    chip.className = 'mode-chip active';
    chip.dataset.item = 'custom';
    chip.textContent = label;
    chip.addEventListener('click', () => setRetroItem('custom'));
    const strip = document.getElementById('stripItems');
    if (strip) {
      const importBtn = document.getElementById('btnImportDae');
      strip.insertBefore(chip, importBtn);
    }
  } else {
    chip.textContent = label;
  }
  updateActiveChips();
}

if (btnImportDae && daeInput) {
  btnImportDae.addEventListener('click', () => daeInput.click());
  daeInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleDaeUpload(file);
    daeInput.value = '';
  });
}

/* ── Universal Drag & Drop (Audio, Images, DAE) ──────────── */
document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if (!file) return;

  const name = file.name.toLowerCase();
  if (name.endsWith('.dae')) {
    await handleDaeUpload(file);
  } else if (file.type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
    const url = URL.createObjectURL(file);
    await itemScene.loadCustomImage(url);
    await applyArtworkPalette(file);
    if (itemImgThumb) {
      itemImgThumb.src = url;
      itemImgThumb.style.display = 'block';
    }
    setCategory('item');
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Artwork & palette loaded: ${file.name}` }));
  } else if (file.type.startsWith('audio/') || name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a')) {
    await loadAudioBuffer(file, file.name);
  }
});

/* ── Render Loop ─────────────────────────────────────────── */
const clock = new THREE.Clock();
const previewSession = new RenderSession(P, {
  field: signalField,
  mode: visMode,
  columns: getCols,
});
let signalFrame = null;
let visualFrameIndex = 0;

// Zero-allocation scratch buffers for per-frame audio reactivity
const _uiColA = new THREE.Color();
const _uiColB = new THREE.Color();
const _uiColResult = new THREE.Color();
let _lastUiStyle = '';
let _vu0 = null, _vu1 = null, _vu2 = null, _vu3 = null, _vu4 = null;
let _lastTracklistHtml = '';
let _lastTracklistOpacity = '';

function updateLiveAlbumTracklist(trackTime, trackDuration) {
  const el = document.getElementById('liveAlbumTracklist');
  if (!el) return;

  const style = P.albumTracklistStyle || 'vcr-osd';
  if (!albumManager.hasTracks() || style === 'off') {
    if (el.style.display !== 'none') el.style.display = 'none';
    return;
  }

  const alpha = calculateTracklistAlpha(trackTime, trackDuration);
  if (alpha <= 0.005) {
    if (el.style.display !== 'none') {
      el.style.opacity = '0';
      el.style.display = 'none';
    }
    return;
  }

  if (el.style.display !== 'block') el.style.display = 'block';
  const opacityStr = alpha.toFixed(2);
  if (_lastTracklistOpacity !== opacityStr) {
    _lastTracklistOpacity = opacityStr;
    el.style.opacity = opacityStr;
  }
  const clsName = `live-album-tracklist ${style}`;
  if (el.className !== clsName) el.className = clsName;

  const tracks = albumManager.tracks;
  const activeIdx = albumManager.activeTrackIndex;
  const total = tracks.length;

  const maxVisible = Math.min(6, total);
  let startIdx = 0;
  if (total > maxVisible) {
    startIdx = Math.max(0, Math.min(total - maxVisible, activeIdx - Math.floor(maxVisible / 2)));
  }
  const endIdx = Math.min(total, startIdx + maxVisible);

  let html = '';
  if (style === 'vcr-osd') {
    html += `<div class="osd-head">PROGRAM: ALBUM TRACKLIST [${String(activeIdx + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}]</div>`;
    for (let i = startIdx; i < endIdx; i++) {
      const t = tracks[i];
      const isCur = i === activeIdx;
      const num = String(i + 1).padStart(2, '0');
      const dur = formatDuration(t.duration);
      html += `<div class="osd-row ${isCur ? 'active' : ''}"><span>${isCur ? '▶ ' : '  '}${num}. ${t.title || 'Untitled'}</span><span>${isCur ? dur + ' ◄' : dur}</span></div>`;
    }
  } else {
    html += `<div class="osd-head">ALBUM PLAYLIST · TRACK ${activeIdx + 1} OF ${total}</div>`;
    for (let i = startIdx; i < endIdx; i++) {
      const t = tracks[i];
      const isCur = i === activeIdx;
      const num = String(i + 1).padStart(2, '0');
      const dur = formatDuration(t.duration);
      html += `<div class="osd-row ${isCur ? 'active' : ''}"><span>${num}   ${t.title || 'Untitled'}</span><span>${dur}</span></div>`;
    }
  }

  if (_lastTracklistHtml !== html) {
    _lastTracklistHtml = html;
    el.innerHTML = html;
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (document.visibilityState === 'hidden' || isExporting) return;

  const dt = Math.min(clock.getDelta(), 0.25);
  cameraRig.beginFrame();
  controls.update();

  let signalTime = timestamp / 1000;
  let signalAdvanced = false;

  if (isPreviewPlaying && previewBuffer) {
    const elapsed = previewCtx.currentTime - previewStartedAt;
    if (elapsed >= previewBuffer.duration) {
      stopPreview();
      previewPausedAt = 0;
      if (previewScrub) previewScrub.value = 0;
      vcrOsd.setPlayState('stop');
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Playback finished.' }));
    } else {
      const cur = Math.max(0, Math.min(previewBuffer.duration, elapsed));
      if (previewScrub) previewScrub.value = cur / previewBuffer.duration;
      vcrOsd.updateTime(cur);
      signalTime = cur;
      const left = previewBuffer.getChannelData(0);
      const right = previewBuffer.numberOfChannels > 1 ? previewBuffer.getChannelData(1) : left;
      signalFrame = previewSession.stepPcm(left, right, cur * previewBuffer.sampleRate, {
        dt,
        time: cur,
        sampleRate: previewBuffer.sampleRate,
      });
      signalAdvanced = true;
    }
  } else if (isAudioReady()) {
    const aL = getAnalyserL();
    const aR = getAnalyserR();
    const fdL = getFreqDataL();
    const fdR = getFreqDataR();
    aL.getByteFrequencyData(fdL);
    aR.getByteFrequencyData(fdR);
    signalFrame = previewSession.stepBins(fdL, fdR, {
      dt,
      time: signalTime,
      sampleRate: getAudioContext()?.sampleRate ?? 44100,
    });
    signalAdvanced = true;
  }

  if (signalFrame) {
    if (signalAdvanced) bpmTick(dt, signalFrame.env.kick);
    const lpf = getLPF();
    if (lpf && Number.isFinite(signalFrame.effectiveCutoff)) {
      const safeCutoff = Math.max(20, Math.min(18000, signalFrame.effectiveCutoff));
      lpf.frequency.setTargetAtTime(safeCutoff, lpf.context.currentTime, 0.03);
    }

    // Audio-reactive UI accent (reusing cached THREE.Color, no per-frame allocations)
    if (P.uiReactivity > 0) {
      const energy = signalFrame.env.rms * P.uiReactivity;
      _uiColA.set(P.colorA);
      _uiColB.set(P.colorB);
      _uiColResult.copy(_uiColA).lerp(_uiColB, Math.min(energy * 2.5, 1));
      const style = _uiColResult.getStyle();
      if (style !== _lastUiStyle) {
        _lastUiStyle = style;
        document.documentElement.style.setProperty('--m-hi', style);
      }
    }

    // Update hardware VU peak meter LEDs
    if (_vu0 || document.getElementById('vu0')) {
      if (!_vu0) {
        _vu0 = document.getElementById('vu0');
        _vu1 = document.getElementById('vu1');
        _vu2 = document.getElementById('vu2');
        _vu3 = document.getElementById('vu3');
        _vu4 = document.getElementById('vu4');
      }
      const rms = signalFrame?.env?.rms ?? 0;
      const kick = signalFrame?.env?.kick ?? 0;
      _vu0?.classList.toggle('lit', rms > 0.04);
      _vu1?.classList.toggle('lit', rms > 0.16);
      _vu2?.classList.toggle('lit', rms > 0.32);
      _vu3?.classList.toggle('lit', rms > 0.52);
      _vu4?.classList.toggle('lit', rms > 0.74 || kick > 0.78);
    }
  } else if (_vu0) {
    _vu0.classList.remove('lit');
    _vu1.classList.remove('lit');
    _vu2.classList.remove('lit');
    _vu3.classList.remove('lit');
    _vu4.classList.remove('lit');
  }

  // Update 3D centerpiece asset
  if (visCategory === 'item') {
    itemScene.update(dt, signalTime, signalFrame, P);
  } else if (!signalAdvanced) {
    signalField.advanceTransition(dt);
  }

  const activeModeOrItem = visCategory === 'item' ? P.activeItem : visMode;
  cameraRig.update(dt, signalTime, signalFrame, activeModeOrItem, visCategory === 'item');

  if (visualFrameIndex % 4 === 0) {
    const telem = cameraRig.getTelemetry();
    const telemCoords = document.getElementById('telemCoords');
    if (telemCoords) {
      telemCoords.textContent = `AZ ${telem.az}° · EL ${telem.el}° · DIST ${telem.dist} · FOV ${telem.fov}°`;
    }
  }

  // Update live on-screen album tracklist overlay
  if (albumManager.hasTracks()) {
    const trackTime = isPreviewPlaying && previewCtx ? Math.max(0, previewCtx.currentTime - previewStartedAt) : previewPausedAt;
    const trackDur = previewBuffer?.duration || albumManager.getActiveTrack()?.duration || 0;
    updateLiveAlbumTracklist(trackTime, trackDur);
  } else {
    const el = document.getElementById('liveAlbumTracklist');
    if (el && el.style.display !== 'none') el.style.display = 'none';
  }

  if (!P.previewOutput || lookRenderer.shouldRender(P, signalTime)) {
    lookRenderer.render(scene, camera, P, { frameIndex: visualFrameIndex++ });
  }
}

/* ── DOM Events & Studio Deck UI Initialisation ──────────── */
export function initApp() {
  loadParams(() => {
    signalField.setMode(visMode);
    signalField.rebuild(P.rows, getCols());
  });

  setColors(P.colorA, P.colorB);
  if (P.visualCategory === 'item') {
    setCategory('item');
    if (P.activeItem) setRetroItem(P.activeItem);
  }

  // Update VCR OSD visibility
  vcrOsd.setVisible(!!P.vhsOsd);

  // Atmospheric Skybox Initialization
  skyboxManager.setTarget(scene, { ambientLight, dirLight, fillLight });
  skyboxManager.applyPreset(P.skyboxPreset || 'void', P.skyboxLightTone || 1.0);
  const rowCustomSkybox = document.getElementById('rowCustomSkybox');
  if (rowCustomSkybox) rowCustomSkybox.style.display = (P.skyboxPreset === 'custom') ? 'flex' : 'none';

  // Export Scene Sequence Modal Initialization
  sequenceModal.init();

  // Album Suite Modal Initialization
  albumModal.init({
    onTrackSelected: (track) => {
      if (track.file) {
        loadAudioBuffer(track.file, track.filename);
      }
    },
    onStartContinuousPlay: async () => {
      albumManager.isPlayingContinuous = true;
      const startIdx = albumManager.activeTrackIndex >= 0 ? albumManager.activeTrackIndex : 0;
      await playAlbumTrack(startIdx);
    },
  });

  document.getElementById('btnTopAlbumSuite')?.addEventListener('click', () => albumModal.open());
  document.getElementById('btnOpenAlbumSuite')?.addEventListener('click', () => albumModal.open());
  bindSelect('pAlbumTracklistStyle', null, 'albumTracklistStyle');

  // Keep active album track snapshot synchronized whenever params change
  window.addEventListener('avatar-params-saved', () => {
    if (albumManager.hasTracks()) {
      albumManager.flushActiveSnapshot(P);
    }
  });

  // Buttons
  document.getElementById('btnSoundCloud')?.addEventListener('click', () => soundcloudModal.open());
  topPreviewBtn?.addEventListener('click', togglePreview);
  topLoadBtn?.addEventListener('click', () => wavInput.click());
  wavInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadAudioBuffer(file, file.name);
  });

  // Scrub bar
  previewScrub?.addEventListener('input', () => {
    if (!previewBuffer) {
      previewScrub.value = 0;
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Load an audio track first to scrub timeline' }));
      return;
    }
    const targetTime = previewScrub.value * previewBuffer.duration;
    previewPausedAt = targetTime;
    vcrOsd.updateTime(targetTime);
    if (isPreviewPlaying) {
      stopPreview();
      startPreview(targetTime);
    }
  });

  // Category toggle
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.cat));
  });

  // Mode chips
  document.querySelectorAll('.mode-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.field) setFieldMode(chip.dataset.field);
      if (chip.dataset.item) setRetroItem(chip.dataset.item);
    });
  });

  // Console toggle
  const consoleToggle = document.getElementById('btnToggleConsole');
  const consolePanel = document.getElementById('studioConsolePanel');
  consoleToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = consolePanel.classList.toggle('open');
    consoleToggle.classList.toggle('btn-active-highlight', open);
  });

  // Console tabs
  document.querySelectorAll('.console-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-tab, .console-body').forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target)?.classList.add('active');
    });
  });

  // Look Profile Select
  bindSelect('pLookProfile', 'vLookProfile', 'lookProfile', (profile) => {
    applyLookProfile(P, profile);
    P.previewOutput = true;
    lookRenderer.clearFeedback();
    vcrOsd.setVisible(!!P.vhsOsd);
    saveParams();
  });

  // Macro Sliders
  bindRange('pReactivity', 'vReactivity', 'reactivity');
  bindRange('pMaxDisp', 'vMaxDisp', 'maxDisp');

  // Dual-Color Gradient & Color Cycle Controls
  const pColorA = document.getElementById('pColorA');
  const pColorB = document.getElementById('pColorB');
  const vColorA = document.getElementById('vColorA');
  const vColorB = document.getElementById('vColorB');

  pColorA?.addEventListener('input', (e) => {
    P.colorA = e.target.value;
    if (vColorA) vColorA.textContent = e.target.value.toUpperCase();
    setColors(P.colorA, P.colorB);
    saveParams();
  });

  pColorB?.addEventListener('input', (e) => {
    P.colorB = e.target.value;
    if (vColorB) vColorB.textContent = e.target.value.toUpperCase();
    setColors(P.colorA, P.colorB);
    saveParams();
  });

  bindRange('pColorCycle', 'vColorCycle', 'colorCycle');

  document.querySelectorAll('.color-pair-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ca = btn.dataset.ca;
      const cb = btn.dataset.cb;
      if (ca && cb) {
        P.colorA = ca;
        P.colorB = cb;
        if (pColorA) pColorA.value = ca;
        if (pColorB) pColorB.value = cb;
        if (vColorA) vColorA.textContent = ca.toUpperCase();
        if (vColorB) vColorB.textContent = cb.toUpperCase();
        setColors(P.colorA, P.colorB);
        saveParams();
        window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Palette preset: ${btn.textContent}` }));
      }
    });
  });
  bindRange('pTapeTracking', 'vTapeTracking', 'vhsTracking');
  bindRange('pTapeSyncDrop', 'vTapeSyncDrop', 'vhsSyncDrop');
  bindRange('pCrtCurvature', 'vCrtCurvature', 'vhsCurvature');
  bindRange('pItemSpin', 'vItemSpin', 'itemSpinSpeed');
  bindRange('pItemGlitch', 'vItemGlitch', 'itemGlitch');
  bindRange('pItemWobble', 'vItemWobble', 'itemWobble');
  bindRange('pScanlines', 'vScanlines', 'lookScanlines');
  bindRange('pChroma', 'vChroma', 'lookChroma');
  bindRange('pNoise', 'vNoise', 'lookNoise');

  // Atmospheric Skybox Controls
  bindSelect('pSkyboxPreset', null, 'skyboxPreset', (preset) => {
    skyboxManager.applyPreset(preset, P.skyboxLightTone);
    const rowCustom = document.getElementById('rowCustomSkybox');
    if (rowCustom) rowCustom.style.display = (preset === 'custom') ? 'flex' : 'none';
  });

  bindRange('pSkyboxLightTone', 'vSkyboxLightTone', 'skyboxLightTone', (tone) => {
    skyboxManager.setLightTone(tone);
  });

  const btnUploadSkybox = document.getElementById('btnUploadSkybox');
  const skyboxImgInput = document.getElementById('skyboxImgInput');
  if (btnUploadSkybox && skyboxImgInput) {
    btnUploadSkybox.addEventListener('click', () => skyboxImgInput.click());
    skyboxImgInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      skyboxImgInput.value = '';
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Loading custom skybox...' }));
      try {
        await skyboxManager.loadCustomImage(file);
        P.skyboxPreset = 'custom';
        const presetSelect = document.getElementById('pSkyboxPreset');
        if (presetSelect) presetSelect.value = 'custom';
        const rowCustom = document.getElementById('rowCustomSkybox');
        if (rowCustom) rowCustom.style.display = 'flex';
        saveParams();
        window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Custom skybox loaded.' }));
      } catch (err) {
        window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Failed to load skybox image.' }));
      }
    });
  }

  // 3D Asset Orientation Sliders & Presets
  bindRange('pItemRotX', 'vItemRotX', 'itemRotX');
  bindRange('pItemRotY', 'vItemRotY', 'itemRotY');
  bindRange('pItemRotZ', 'vItemRotZ', 'itemRotZ');

  const updateRotDisplays = () => {
    const rx = document.getElementById('pItemRotX'); if (rx) rx.value = P.itemRotX;
    const lx = document.getElementById('vItemRotX'); if (lx) lx.textContent = `${P.itemRotX}°`;
    const ry = document.getElementById('pItemRotY'); if (ry) ry.value = P.itemRotY;
    const ly = document.getElementById('vItemRotY'); if (ly) ly.textContent = `${P.itemRotY}°`;
    const rz = document.getElementById('pItemRotZ'); if (rz) rz.value = P.itemRotZ;
    const lz = document.getElementById('vItemRotZ'); if (lz) lz.textContent = `${P.itemRotZ}°`;
    saveParams();
  };

  document.getElementById('btnOrientUpright')?.addEventListener('click', () => {
    P.itemRotX = 90;
    P.itemRotY = 0;
    P.itemRotZ = 0;
    updateRotDisplays();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Asset oriented upright (+90°)' }));
  });

  document.getElementById('btnOrientFlat')?.addEventListener('click', () => {
    P.itemRotX = -90;
    P.itemRotY = 0;
    P.itemRotZ = 0;
    updateRotDisplays();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Asset laid flat (-90°)' }));
  });

  document.getElementById('btnOrientReset')?.addEventListener('click', () => {
    P.itemRotX = 0;
    P.itemRotY = 0;
    P.itemRotZ = 0;
    updateRotDisplays();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Asset orientation reset (0°)' }));
  });

  // Model Texture Editor
  const texSlotSummary = document.getElementById('texSlotSummary');
  const texDropzone = document.getElementById('texDropzone');
  const modelTexturesInput = document.getElementById('modelTexturesInput');
  const texSlotGrid = document.getElementById('texSlotGrid');
  const btnBrowseTextures = document.getElementById('btnBrowseTextures');
  const btnClearTextures = document.getElementById('btnClearTextures');

  btnBrowseTextures?.addEventListener('click', () => modelTexturesInput?.click());
  texDropzone?.addEventListener('click', (e) => {
    if (e.target !== modelTexturesInput) {
      modelTexturesInput?.click();
    }
  });

  texDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    texDropzone.classList.add('dragover');
  });
  texDropzone?.addEventListener('dragleave', () => {
    texDropzone.classList.remove('dragover');
  });
  texDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    texDropzone.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      itemScene.autoAssignTextures(files);
    }
  });

  modelTexturesInput?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      itemScene.autoAssignTextures(files);
      modelTexturesInput.value = '';
    }
  });

  btnClearTextures?.addEventListener('click', () => {
    itemScene.clearTextures();
  });

  function renderTextureSlots(slots) {
    if (!texSlotGrid || !texSlotSummary) return;
    if (!slots || slots.length === 0) {
      texSlotSummary.textContent = (visCategory === 'item' && P.activeItem === 'custom')
        ? 'no expected textures in 3D model'
        : 'no custom 3D model loaded';
      texSlotGrid.innerHTML = '';
      return;
    }

    const assignedCount = slots.filter((s) => s.assigned).length;
    texSlotSummary.textContent = `${assignedCount} / ${slots.length} textures mapped`;
    texSlotGrid.innerHTML = '';

    slots.forEach((slot) => {
      const chip = document.createElement('div');
      chip.className = `tex-slot-chip${slot.assigned ? ' is-assigned' : ''}`;
      chip.title = `Click to manually choose texture image for ${slot.name}`;

      if (slot.previewUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'tex-slot-thumb';
        thumb.src = slot.previewUrl;
        thumb.alt = slot.name;
        chip.appendChild(thumb);
      } else {
        const thumb = document.createElement('div');
        thumb.className = 'tex-slot-thumb placeholder';
        thumb.textContent = 'IMG';
        chip.appendChild(thumb);
      }

      const info = document.createElement('div');
      info.className = 'tex-slot-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'tex-slot-name';
      nameEl.textContent = slot.name;
      info.appendChild(nameEl);

      const fileEl = document.createElement('div');
      fileEl.className = 'tex-slot-file';
      fileEl.textContent = slot.assigned ? (slot.assignedFile || slot.expectedFile) : slot.expectedFile;
      info.appendChild(fileEl);

      chip.appendChild(info);

      const statusEl = document.createElement('div');
      statusEl.className = `tex-slot-status ${slot.assigned ? 'mapped' : 'missing'}`;
      statusEl.textContent = slot.assigned ? '✓ mapped' : 'missing';
      chip.appendChild(statusEl);

      chip.addEventListener('click', () => {
        const slotInput = document.createElement('input');
        slotInput.type = 'file';
        slotInput.accept = 'image/*,.png,.jpg,.jpeg,.tga,.bmp,.webp';
        slotInput.onchange = (ev) => {
          const f = ev.target.files?.[0];
          if (f) itemScene.assignTextureToSlot(slot.id, f);
        };
        slotInput.click();
      });

      texSlotGrid.appendChild(chip);
    });
  }

  window.addEventListener('avatar-textures-updated', (e) => {
    const slots = e.detail?.slots || itemScene.getTextureSlots();
    renderTextureSlots(slots);
  });
  renderTextureSlots(itemScene.getTextureSlots());

  // Camera Director Controls & Telemetry
  document.querySelectorAll('.cam-shot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = visCategory === 'item' ? P.activeItem : visMode;
      cameraRig.selectShot(btn.dataset.shot, mode, P.cameraTransition, visCategory === 'item');
      saveParams();
      updateCameraUI();
    });
  });

  bindSelect('pCameraMotion', null, 'cameraMotion', () => {
    cameraRig.setMotion(P.cameraMotion);
    updateCameraUI();
  });

  bindRange('pCameraAmount', 'vCameraAmount', 'cameraAmount');
  bindRange('pCameraSpeed', 'vCameraSpeed', 'cameraSpeed');
  bindRange('pCameraAudio', 'vCameraAudio', 'cameraAudio');
  bindRange('pCameraTransition', 'vCameraTransition', 'cameraTransition');
  bindRange('pCameraFov', 'vCameraFov', 'cameraFov', (fov) => {
    cameraRig.setFov(fov);
  });

  document.getElementById('btnCamAutoFrame')?.addEventListener('click', () => {
    const mode = visCategory === 'item' ? P.activeItem : visMode;
    cameraRig.resetToAuto(mode, visCategory === 'item');
    saveParams();
    updateCameraUI();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Camera auto-framed (${mode})` }));
  });

  document.getElementById('btnCamCapture')?.addEventListener('click', () => {
    cameraRig.captureManual();
    saveParams();
    updateCameraUI();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Manual camera orbit locked' }));
  });

  const btnAutoDirector = document.getElementById('btnAutoDirector');
  btnAutoDirector?.addEventListener('click', () => {
    const active = cameraRig.toggleAutoDirector();
    btnAutoDirector.classList.toggle('active', active);
    btnAutoDirector.textContent = active ? 'ON' : 'OFF';
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Auto-Director ${active ? 'Enabled' : 'Disabled'}` }));
  });

  const btnDirectorShortcut = document.getElementById('btnDirectorShortcut');
  btnDirectorShortcut?.addEventListener('click', () => {
    consolePanel?.classList.add('open');
    consoleToggle?.classList.add('btn-active-highlight');
    document.querySelectorAll('.console-tab, .console-body').forEach(el => el.classList.remove('active'));
    document.querySelector('.console-tab[data-target="cTabCam"]')?.classList.add('active');
    document.getElementById('cTabCam')?.classList.add('active');
  });

  // VCR OSD Checkbox
  document.getElementById('pVhsOsd')?.addEventListener('change', (e) => {
    P.vhsOsd = e.target.checked;
    vcrOsd.setVisible(P.vhsOsd);
    saveParams();
  });

  // Track Identity & Title Card bindings
  bindText('pTitle', () => updateTrackDisplay());
  bindText('pArtist', () => updateTrackDisplay());
  bindText('pBpm', () => updateTrackDisplay());
  bindText('pGenre', () => updateTrackDisplay());
  bindSelect('pExportTitleCard', null, 'exportTitleCard');
  bindSelect('pExportAspect', null, 'exportAspect');
  bindSelect('pExportOrient', null, 'exportOrientation');
  bindSelect('pExportPreset', null, 'exportPreset');

  // Scene Presets & Settings
  document.getElementById('btnSavePreset')?.addEventListener('click', () => {
    saveParams();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Scene settings saved to storage.' }));
  });

  document.getElementById('btnExportPresetJson')?.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(P, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `avatar-settings-${P.title ? P.title.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'scene'}.json`);
    dlAnchor.click();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Exported scene settings to JSON.' }));
  });

  const btnImportPresetJson = document.getElementById('btnImportPresetJson');
  const importJsonInput = document.getElementById('importJsonInput');
  btnImportPresetJson?.addEventListener('click', () => importJsonInput?.click());
  importJsonInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid JSON format');
      }
      Object.assign(P, parsed);
      syncControls();
      applyLookProfile(P, P.lookProfile || 'vhs-master');
      skyboxManager.applyPreset(P.skyboxPreset || 'void', P.skyboxLightTone || 1.0);
      vcrOsd.setVisible(!!P.vhsOsd);
      setColors(P.colorA, P.colorB);
      updateTrackDisplay();
      if (P.visualCategory === 'item') {
        setCategory('item');
        if (P.activeItem) setRetroItem(P.activeItem);
      } else {
        setCategory('field');
        if (P.mode) setFieldMode(P.mode);
      }
      saveParams();
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Scene settings imported from JSON.' }));
    } catch (err) {
      console.warn('Import error:', err);
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Failed to import JSON: ${err.message}` }));
    } finally {
      importJsonInput.value = '';
    }
  });

  document.getElementById('btnResetDefaults')?.addEventListener('click', () => {
    try {
      localStorage.removeItem('psychograph_params');
    } catch (e) {}
    loadParams(() => {
      signalField.setMode(visMode);
      signalField.rebuild(P.rows, getCols());
    });
    syncControls();
    skyboxManager.applyPreset('void', 1.0);
    vcrOsd.setVisible(!!P.vhsOsd);
    setColors(P.colorA, P.colorB);
    updateTrackDisplay();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Settings reset to factory defaults.' }));
  });

  const pFastBoot = document.getElementById('pFastBoot');
  if (pFastBoot) {
    pFastBoot.checked = localStorage.getItem('avatar_fast_boot') === 'true' || Boolean(P.fastBoot);
    pFastBoot.addEventListener('change', (e) => {
      P.fastBoot = e.target.checked;
      try {
        localStorage.setItem('avatar_fast_boot', String(e.target.checked));
      } catch (err) {}
      saveParams();
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Fast boot ${e.target.checked ? 'enabled' : 'disabled'}` }));
    });
  }

  // Deck track badge click: open Console -> Export / Track Identity Tab & focus pTitle
  const deckTrackBadge = document.getElementById('deckTrackBadge');
  deckTrackBadge?.addEventListener('click', () => {
    consolePanel?.classList.add('open');
    consoleToggle?.classList.add('btn-active-highlight');
    document.querySelectorAll('.console-tab, .console-body').forEach(el => el.classList.remove('active'));
    document.querySelector('.console-tab[data-target="cTabMaster"]')?.classList.add('active');
    document.getElementById('cTabMaster')?.classList.add('active');
    document.getElementById('pTitle')?.focus();
  });

  // Export Trigger
  topRenderBtn?.addEventListener('click', () => {
    if (selectedWavFile && !isExporting) {
      stopPreview();
      startExport(selectedWavFile, visMode);
    }
  });

  // ── Bottom-Left Controls: Palette, Theme, Clean Mode ──────
  const palettes = ['default', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
  const paletteColors = {
    default: '#a2b6c0',
    red: '#ff4d4d',
    orange: '#ff944d',
    yellow: '#ffdb4d',
    green: '#4dff88',
    blue: '#4da6ff',
    indigo: '#8c4dff',
    violet: '#ff4dff',
  };

  const updatePalActive = () => {
    const curPal = P.uiPalette || 'default';
    document.querySelectorAll('.pal-dot').forEach((d) => {
      d.classList.toggle('active', d.dataset.pal === curPal);
    });
    const dot = document.getElementById('paletteDot');
    if (dot) {
      dot.style.background = paletteColors[curPal] || '#a2b6c0';
    }
  };

  document.getElementById('btnCycle')?.addEventListener('click', () => {
    let idx = palettes.indexOf(P.uiPalette || 'default');
    idx = (idx + 1) % palettes.length;
    P.uiPalette = palettes[idx];
    document.body.setAttribute('data-palette', P.uiPalette);
    saveParams();
    updatePalActive();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `UI palette: ${P.uiPalette}` }));
  });

  document.querySelectorAll('.pal-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      P.uiPalette = dot.dataset.pal;
      document.body.setAttribute('data-palette', P.uiPalette);
      saveParams();
      updatePalActive();
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `UI palette: ${P.uiPalette}` }));
    });
  });

  // Magic Triangle for palette popover
  const paletteWrap = document.getElementById('paletteWrap');
  const palettePop = document.getElementById('palettePop');
  const safeZone = document.getElementById('paletteSafeZone');
  const safePath = safeZone?.querySelector('path');
  if (paletteWrap && palettePop && safePath) {
    paletteWrap.addEventListener('mousemove', (e) => {
      const rect = palettePop.getBoundingClientRect();
      const wrapRect = paletteWrap.getBoundingClientRect();
      const mx = e.clientX - (wrapRect.left + wrapRect.width / 2) + 200;
      const my = e.clientY - wrapRect.bottom + 400;
      const x1 = rect.left - (wrapRect.left + wrapRect.width / 2) + 200;
      const x2 = rect.right - (wrapRect.left + wrapRect.width / 2) + 200;
      const y = rect.top - wrapRect.bottom + 400;
      safePath.setAttribute('d', `M ${mx} ${my} L ${x1} ${y} L ${x2} ${y} Z`);
    });
  }

  // Theme toggle (Light / Dark)
  const themeBtn = document.getElementById('btnTheme');
  const themeIcon = document.getElementById('themeIcon');
  const updateThemeUI = (isLight) => {
    if (themeIcon) themeIcon.textContent = isLight ? '☀' : '☾';
    setTheme(isLight);
    skyboxManager?.setTheme(isLight);
    itemScene?.setTheme(isLight);
  };

  themeBtn?.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');
    P.isLight = isLight;
    updateThemeUI(isLight);
    saveParams();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Theme: ${isLight ? 'Light' : 'Dark'}` }));
  });

  // Initial theme and palette setup
  if (P.uiPalette) {
    document.body.setAttribute('data-palette', P.uiPalette);
  }
  const isLight = document.body.classList.contains('light-mode') || Boolean(P.isLight);
  if (isLight) {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
  updateThemeUI(isLight);
  updatePalActive();

  // Clean Mode (Hide UI) Toggle
  const btnObs = document.getElementById('btnObs');
  const updateCleanUI = (active) => {
    if (btnObs) btnObs.textContent = active ? 'show ui' : 'hide ui';
  };

  btnObs?.addEventListener('click', () => {
    const active = document.body.classList.toggle('clean-mode');
    updateCleanUI(active);
    window.dispatchEvent(new CustomEvent('avatar-status', {
      detail: active ? 'UI hidden (Press ESC or move to bottom-left to restore)' : 'UI restored'
    }));
  });

  // Fullscreen & Shortcuts modal helpers
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const shortcutsModal = document.getElementById('shortcutsModal');
  const toggleShortcutsModal = (force) => {
    if (!shortcutsModal) return;
    const show = typeof force === 'boolean' ? force : shortcutsModal.style.display === 'none';
    shortcutsModal.style.display = show ? 'flex' : 'none';
  };

  const randomiseSnapshot = () => {
    const rand = Math.random;
    for (const [key, rule] of Object.entries(PARAM_SCHEMA)) {
      if (!rule.random || rule.update === 'geometry') continue;
      const [minimum, maximum] = rule.random;
      let value = minimum + rand() * (maximum - minimum);
      if (rule.integer) value = Math.round(value);
      P[key] = value;
    }
    syncControls();
    setColors(P.colorA, P.colorB);
    saveParams();
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Rolled random generative snapshot' }));
  };

  document.getElementById('btnFullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('btnShortcuts')?.addEventListener('click', () => toggleShortcutsModal());
  document.getElementById('shortcutsBtnClose')?.addEventListener('click', () => toggleShortcutsModal(false));
  shortcutsModal?.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) toggleShortcutsModal(false);
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      togglePreview();
    } else if (e.key === 'Escape') {
      if (shortcutsModal && shortcutsModal.style.display !== 'none') {
        toggleShortcutsModal(false);
        return;
      }
      document.body.classList.remove('clean-mode');
      updateCleanUI(false);
      soundcloudModal.close();
      sequenceModal.close();
    } else if (e.key === 'c' || e.key === 'C') {
      const active = document.body.classList.toggle('clean-mode');
      updateCleanUI(active);
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
      toggleShortcutsModal();
    } else if (e.key === 'r' || e.key === 'R') {
      randomiseSnapshot();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setCategory(visCategory === 'field' ? 'item' : 'field');
    } else if (e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key, 10) - 1;
      if (visCategory === 'field') {
        const fieldModes = ['sphere', 'wave', 'bowl', 'polar', 'topology', 'cathedral', 'ribbon', 'tunnel'];
        if (fieldModes[idx]) setFieldMode(fieldModes[idx]);
      } else {
        const itemModes = ['cartridge', 'vinyl', 'cassette', 'floppy', 'custom'];
        if (itemModes[idx]) setRetroItem(itemModes[idx]);
      }
    } else if (e.key === 'p' || e.key === 'P') {
      consolePanel?.classList.toggle('open');
    } else if (e.key === 'd' || e.key === 'D') {
      const open = consolePanel?.classList.toggle('open');
      consoleToggle?.classList.toggle('btn-active-highlight', open);
      if (open) {
        document.querySelectorAll('.console-tab, .console-body').forEach(el => el.classList.remove('active'));
        document.querySelector('.console-tab[data-target="cTabCam"]')?.classList.add('active');
        document.getElementById('cTabCam')?.classList.add('active');
      }
    }
  });

  // Status message dispatcher
  window.addEventListener('avatar-status', (e) => {
    const el = document.getElementById('deckStatusMsg');
    if (el) el.textContent = e.detail;
  });

  cameraRig.setFov(P.cameraFov || 45);
  cameraRig.selectShot(P.cameraShot, visCategory === 'item' ? P.activeItem : visMode, 0.01, visCategory === 'item');
  updateCameraUI();
  animate(0);
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'System ready.' }));
}

export function updateCameraUI() {
  document.querySelectorAll('.cam-shot-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.shot === P.cameraShot);
  });
  const motionSelect = document.getElementById('pCameraMotion');
  if (motionSelect) motionSelect.value = P.cameraMotion;

  const telemetry = cameraRig.getTelemetry();
  const telemShot = document.getElementById('telemShot');
  if (telemShot) telemShot.textContent = telemetry.shot.toUpperCase();
  const telemMotion = document.getElementById('telemMotion');
  if (telemMotion) telemMotion.textContent = telemetry.motion.toUpperCase();
  const telemCoords = document.getElementById('telemCoords');
  if (telemCoords) {
    telemCoords.textContent = `AZ ${telemetry.az}° · EL ${telemetry.el}° · DIST ${telemetry.dist} · FOV ${telemetry.fov}°`;
  }
}

// Auto-boot sequence
const bootEl = document.getElementById('bootScreen');
const bootTerm = document.getElementById('bootTerminal');
const _isFastBoot = (() => {
  try {
    return localStorage.getItem('avatar_fast_boot') === 'true' ||
           Boolean(JSON.parse(localStorage.getItem('psychograph_params') || '{}').fastBoot);
  } catch {
    return false;
  }
})();

if (bootEl && !_isFastBoot) {
  import('../boot.js').then(({ BootScreen }) => {
    const boot = new BootScreen(bootTerm);
    let finished = false;
    const finishBoot = () => {
      if (finished) return;
      finished = true;
      bootEl.classList.add('done');
      setTimeout(() => bootEl.remove(), 250);
      initApp();
    };

    boot.onSkipCallback = () => finishBoot();

    // S key or Escape to skip immediately
    const onBootKey = (e) => {
      if (e.key === 's' || e.key === 'S' || e.key === 'Escape') {
        window.removeEventListener('keydown', onBootKey);
        boot.skip();
        finishBoot();
      }
    };
    window.addEventListener('keydown', onBootKey);

    bootTerm.style.opacity = '1';
    boot.run(bootEl)
      .then(() => {
        window.removeEventListener('keydown', onBootKey);
        finishBoot();
      })
      .catch((err) => {
        console.warn('Boot sequence error:', err);
        window.removeEventListener('keydown', onBootKey);
        finishBoot();
      });
  }).catch((err) => {
    console.warn('Boot import failed:', err);
    bootEl.remove();
    initApp();
  });
} else {
  bootEl?.remove();
  initApp();
}
