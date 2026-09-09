/**
 * engine.js — Three.js renderer, scene, camera, material, and shared constants.
 * No animate loop — that lives in index.html where all modules are wired together.
 */
import * as THREE from 'three';

/* ── Constants ─────────────────────────────────────────────── */
export const FFT_SIZE    = 2048;
export const NUM_BINS    = FFT_SIZE / 2;
export const GRID_W      = 10;
export const GRID_D      = 10;
export const LINE_COLOR  = 0xe8d5b0;   // warm gold (base)
export const LINE_COLOR2 = 0xb090c8;   // cool mauve (peak mids)
export const BG_COLOR    = 0x0d0d0d;
export const CAM_BASE    = { y: 5.5, z: 14.5 };

/* ── Renderer ──────────────────────────────────────────────── */
export const renderer = typeof document !== 'undefined'
  ? new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  : null;
if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(BG_COLOR, 1);
  document.body.appendChild(renderer.domElement);
}

/* ── Scene & Camera ────────────────────────────────────────── */
export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(
  45,
  typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9,
  0.1,
  100
);
camera.position.set(0, CAM_BASE.y, CAM_BASE.z);
camera.lookAt(0, -0.5, 0);

/* ── Scene Lighting ────────────────────────────────────────── */
export const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
ambientLight.name = 'GlobalAmbientLight';
scene.add(ambientLight);

export const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.8);
dirLight.name = 'GlobalDirLight';
dirLight.position.set(5, 9, 6);
scene.add(dirLight);

export const fillLight = new THREE.DirectionalLight(0x88bbff, 0.9);
fillLight.name = 'GlobalFillLight';
fillLight.position.set(-5, 4, -4);
scene.add(fillLight);

/* ── Shared material + colour scratch ──────────────────────── */
export const material    = new THREE.LineBasicMaterial({ vertexColors: true });
export const _colA       = new THREE.Color(LINE_COLOR);
export const _colB       = new THREE.Color(LINE_COLOR2);
export const _colScratch = new THREE.Color();

export function setColors(hexA, hexB) {
  _colA.set(hexA);
  _colB.set(hexB);
  material.color.copy(_colA);
}

export function setTheme(isLight) {
  const bg = isLight ? 0xf4f5f7 : 0x0d0d0d;
  if (renderer) renderer.setClearColor(bg, 1);
  if (scene.background && scene.background.isColor) {
    scene.background.set(bg);
  }
}

/* ── Fade veil ─────────────────────────────────────────────── */
const fadeVeil = typeof document !== 'undefined' ? document.getElementById('fadeVeil') : null;

export function fadeOut() {
  return new Promise(resolve => {
    if (!fadeVeil) return resolve();
    fadeVeil.classList.add('fading');
    fadeVeil.addEventListener('transitionend', () => resolve(), { once: true });
  });
}

export function fadeIn() {
  if (fadeVeil) fadeVeil.classList.remove('fading');
}

/* ── Export resize helpers ─────────────────────────────────── */
let savedDims = null;

export function beginExportResize(width, height) {
  savedDims = { w: window.innerWidth, h: window.innerHeight };
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.left = '-10000px';
}

export function endExportResize() {
  if (!savedDims) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(savedDims.w, savedDims.h);
  camera.aspect = savedDims.w / savedDims.h;
  camera.updateProjectionMatrix();
  renderer.domElement.style.position = '';
  renderer.domElement.style.left = '';
  savedDims = null;
}
