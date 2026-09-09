import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderer, scene, camera, fadeOut, fadeIn, setTheme, setColors } from '../engine.js';
import { P, getCols, loadParams, saveParams, bindRange, bindSelect, bindText, updateTrackDisplay } from '../params.js';
import { PARAM_SCHEMA } from '../project-schema.js';
import { initAudio, stopAudio, setupAnalyser, getAnalyserL, getAnalyserR, getFreqDataL, getFreqDataR, isAudioReady, getLPF, getGainNode, getAudioContext, getAudioDevices } from '../audio.js';
import { bpmTick, resetBpmAuto } from '../tempo.js';
import { signalField, FIELD_MODES } from '../vis/field.js';
import { RenderSession } from '../render-session.js';
import { lookRenderer } from '../look.js';
import { applyLookProfile } from '../look-profiles.js';
import { compositeFrame, initOverlayCanvas, freeOverlayCanvas } from '../overlay.js';
import { startExport, isExporting } from '../export.js';
import { getOrCreateItemScene, RETRO_ITEMS } from './objects/item-scene.js';
import { SoundCloudImporter } from './ui/soundcloud-modal.js';
import { vcrOsd } from './vhs/vcr-osd.js';

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

const cameraRig = new CameraRig(camera, controls, P);
export const itemScene = getOrCreateItemScene(scene);

/* ── Visual Mode & Category Management ───────────────────── */
let visMode = 'sphere';
let visCategory = 'field'; // 'field' | 'item'

export function setCategory(cat) {
  visCategory = cat;
  P.visualCategory = cat;
  const isItem = cat === 'item';
  
  itemScene.setVisible(isItem);
  signalField.mesh.visible = !isItem;

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
  signalField.mesh.visible = true;

  document.body.classList.remove(`vis-${visMode}`);
  visMode = mode;
  document.body.classList.add(`vis-${mode}`);
  
  signalField.setMode(mode);
  signalField.rebuild(P.rows, getCols());

  if (P.cameraShot === 'auto' || P.cameraShot === 'hero') {
    cameraRig.selectShot(P.cameraShot, mode);
  }

  updateActiveChips();
  fadeIn();
}

export async function setRetroItem(itemId) {
  visCategory = 'item';
  P.visualCategory = 'item';
  P.activeItem = itemId;
  
  signalField.mesh.visible = false;
  itemScene.setVisible(true);
  itemScene.setActiveItem(itemId);

  if (P.cameraShot === 'auto' || P.cameraShot === 'hero') {
    cameraRig.selectShot('hero', 'sphere');
  }

  updateActiveChips();
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

export function togglePreview() {
  if (!previewBuffer) {
    if (appMode === 'live') return;
    wavInput.click();
    return;
  }
  if (isPreviewPlaying) {
    previewPausedAt = previewCtx.currentTime - previewStartedAt;
    stopPreview();
  } else {
    startPreview(previewPausedAt % previewBuffer.duration);
  }
}

export function startPreview(startTime = 0) {
  if (isPreviewPlaying || !previewBuffer) return;
  stopAudio();

  previewSource = previewCtx.createBufferSource();
  previewSource.buffer = previewBuffer;
  previewSource.loop = true;

  setupAnalyser(previewCtx, { monitor: true });
  previewSource.connect(getLPF());
  previewSource.start(0, startTime);
  previewStartedAt = previewCtx.currentTime - startTime;
  isPreviewPlaying = true;
  if (topPreviewBtn) topPreviewBtn.textContent = 'pause';
  vcrOsd.setPlayState('play');
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
    
    if (trackTitleEl && (!P.title || P.title === 'AVATAR VISUALISER')) {
      const cleanName = filename.replace(/\.[^.]+$/, '');
      P.title = cleanName;
      trackTitleEl.textContent = cleanName;
    }
    topRenderBtn.disabled = false;
    topPreviewBtn.disabled = false;
    topRenderBtn.classList.add('btn-active-highlight');
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Loaded: ${filename}` }));
  } catch (err) {
    console.error('Audio load error:', err);
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Audio error: ${err.message}` }));
  }
}

/* ── SoundCloud Integration ──────────────────────────────── */
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
      setCategory('item');
      // Update image dropzone preview
      const thumb = document.getElementById('itemImgThumb');
      if (thumb) {
        thumb.src = artUrl;
        thumb.style.display = 'block';
      }
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'SoundCloud artwork mapped to 3D asset' }));
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
    if (itemImgThumb) {
      itemImgThumb.src = url;
      itemImgThumb.style.display = 'block';
    }
    setCategory('item');
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Artwork dropped: ${file.name}` }));
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

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (document.visibilityState === 'hidden' || isExporting) return;

  const dt = Math.min(clock.getDelta(), 0.25);
  cameraRig.beginFrame();
  controls.update();

  let signalTime = timestamp / 1000;
  let signalAdvanced = false;

  if (isPreviewPlaying && previewBuffer) {
    const cur = (previewCtx.currentTime - previewStartedAt) % previewBuffer.duration;
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
    if (lpf) lpf.frequency.setTargetAtTime(signalFrame.effectiveCutoff, lpf.context.currentTime, 0.03);

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
  }

  // Update 3D centerpiece asset
  if (visCategory === 'item') {
    itemScene.update(dt, signalTime, signalFrame, P);
  } else if (!signalAdvanced) {
    signalField.advanceTransition(dt);
  }

  cameraRig.update(dt, signalTime, signalFrame, visMode);

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
    if (!previewBuffer) return;
    previewPausedAt = previewScrub.value * previewBuffer.duration;
    if (isPreviewPlaying) {
      stopPreview();
      startPreview(previewPausedAt);
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
  consoleToggle?.addEventListener('click', () => {
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
  bindRange('pTapeTracking', 'vTapeTracking', 'vhsTracking');
  bindRange('pTapeSyncDrop', 'vTapeSyncDrop', 'vhsSyncDrop');
  bindRange('pCrtCurvature', 'vCrtCurvature', 'vhsCurvature');
  bindRange('pItemSpin', 'vItemSpin', 'itemSpinSpeed');
  bindRange('pItemGlitch', 'vItemGlitch', 'itemGlitch');
  bindRange('pItemWobble', 'vItemWobble', 'itemWobble');
  bindRange('pScanlines', 'vScanlines', 'lookScanlines');
  bindRange('pChroma', 'vChroma', 'lookChroma');
  bindRange('pNoise', 'vNoise', 'lookNoise');

  // VCR OSD Checkbox
  document.getElementById('pVhsOsd')?.addEventListener('change', (e) => {
    P.vhsOsd = e.target.checked;
    vcrOsd.setVisible(P.vhsOsd);
    saveParams();
  });

  // Export Trigger
  topRenderBtn?.addEventListener('click', () => {
    if (selectedWavFile && !isExporting) {
      stopPreview();
      startExport(selectedWavFile, visMode);
    }
  });

  // Clean Mode Toggle (Escape / Hotkey)
  document.getElementById('btnCleanMode')?.addEventListener('click', () => {
    document.body.classList.toggle('clean-mode');
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      togglePreview();
    } else if (e.key === 'Escape') {
      document.body.classList.remove('clean-mode');
      soundcloudModal.close();
    } else if (e.key === 'c' || e.key === 'C') {
      document.body.classList.toggle('clean-mode');
    } else if (e.key === 'p' || e.key === 'P') {
      consolePanel?.classList.toggle('open');
    }
  });

  // Status message dispatcher
  window.addEventListener('avatar-status', (e) => {
    const el = document.getElementById('deckStatusMsg');
    if (el) el.textContent = e.detail;
  });

  animate(0);
  window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'System ready.' }));
}

// Auto-boot sequence
const bootEl = document.getElementById('bootScreen');
const bootTerm = document.getElementById('bootTerminal');
const _saved = (() => { try { return JSON.parse(localStorage.getItem('psychograph_params') || '{}'); } catch { return {}; } })();

if (bootEl && !_saved.fastBoot) {
  import('../boot.js').then(({ BootScreen }) => {
    const boot = new BootScreen(bootTerm);
    const start = () => {
      bootTerm.style.opacity = '1';
      boot.run(bootEl).then(() => {
        bootEl.classList.add('done');
        setTimeout(() => bootEl.remove(), 400);
        initApp();
      });
    };
    document.addEventListener('click', start, { once: true });
    document.addEventListener('keydown', start, { once: true });
  }).catch(() => {
    bootEl.remove();
    initApp();
  });
} else {
  bootEl?.remove();
  initApp();
}
