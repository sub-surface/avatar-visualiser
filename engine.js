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
export const CAM_BASE    = { y: 5.5, z: 9.0 };

/* ── Renderer ──────────────────────────────────────────────── */
export const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BG_COLOR, 1);
document.body.appendChild(renderer.domElement);

/* ── Scene & Camera ────────────────────────────────────────── */
export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, CAM_BASE.y, CAM_BASE.z);
camera.lookAt(0, -0.5, 0);

/* ── Shared material + colour scratch ──────────────────────── */
export const material    = new THREE.LineBasicMaterial({ color: LINE_COLOR });
export const _colA       = new THREE.Color(LINE_COLOR);
export const _colB       = new THREE.Color(LINE_COLOR2);
export const _colScratch = new THREE.Color();

/* ── Fade veil ─────────────────────────────────────────────── */
const fadeVeil = document.getElementById('fadeVeil');

export function fadeOut() {
  return new Promise(resolve => {
    fadeVeil.classList.add('fading');
    fadeVeil.addEventListener('transitionend', () => resolve(), { once: true });
  });
}

export function fadeIn() {
  fadeVeil.classList.remove('fading');
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
