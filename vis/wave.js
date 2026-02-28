/**
 * vis/wave.js — single time-domain oscilloscope line.
 */
import * as THREE from 'three';
import { scene, material, GRID_W } from '../engine.js';
import { P } from '../params.js';
import { modDisp } from '../envelopes.js';

export let waveGeo = null, waveLine = null, waveBuf = null;
export let timeDomainData = null;

export function rebuildWave() {
  if (waveLine) scene.remove(waveLine);
  waveBuf = new Float32Array(P.cols * 3);
  waveGeo = new THREE.BufferGeometry();
  waveGeo.setAttribute('position', new THREE.BufferAttribute(waveBuf, 3));
  waveLine = new THREE.Line(waveGeo, material);
  scene.add(waveLine);
  timeDomainData = null;
}

export function applyWave(tdData, dispScale) {
  const disp = dispScale !== undefined ? dispScale : modDisp();
  for (let c = 0; c < P.cols; c++) {
    const x = (c / (P.cols - 1) - 0.5) * GRID_W;
    const v = (tdData[Math.floor(c * tdData.length / P.cols)] / 128.0) - 1.0;
    waveBuf[c * 3]     = x;
    waveBuf[c * 3 + 1] = v * disp;
    waveBuf[c * 3 + 2] = 0;
  }
  waveGeo.attributes.position.needsUpdate = true;
}

export function ensureTimeDomainData(analyser) {
  if (!timeDomainData) timeDomainData = new Uint8Array(analyser.fftSize);
  return timeDomainData;
}

export function tearDownWave() {
  if (waveLine) { scene.remove(waveLine); waveLine = null; }
}
