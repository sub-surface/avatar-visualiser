/**
 * vis/polar.js — concentric rings in XZ plane, radius = FFT.
 */
import * as THREE from 'three';
import { scene, material } from '../engine.js';
import { P } from '../params.js';
import { bowlFactor } from '../dsp.js';
import { histBuf, histHead, binMap, pushHistory } from './shared.js';
import { modDisp } from '../envelopes.js';

export const polarLines = [];
export const polarBufs  = [];

export function rebuildPolar() {
  polarLines.forEach(l => scene.remove(l));
  polarLines.length = polarBufs.length = 0;
  const segs = P.cols;
  for (let r = 0; r < P.rows; r++) {
    const positions = new Float32Array((segs + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.LineLoop(geo, material);
    scene.add(line);
    polarLines.push(line);
    polarBufs.push(positions);
  }
}

export function applyPolar(fd, bowlExp, dispScale) {
  pushHistory(fd);
  const disp  = dispScale !== undefined ? dispScale : modDisp();
  const half  = P.cols / 2;
  const segs  = P.cols;
  const BASE_R = 0.4;
  const MAX_R  = 4.5;
  for (let r = 0; r < P.rows; r++) {
    const pos  = polarBufs[r];
    const hrow = histBuf[(histHead + r) % P.rows];
    const bf   = bowlFactor(r, P.rows, bowlExp);
    const y    = (r / (P.rows - 1) - 0.5) * -3.0;
    for (let c = 0; c <= segs; c++) {
      const ci = c % segs;
      const m  = ci < half ? ci : segs - 1 - ci;
      const fv = hrow[binMap[Math.min(m, half - 1)]];
      const radius = BASE_R + (MAX_R - BASE_R) * bf * (1 + fv * disp * 0.18);
      const angle  = (ci / segs) * Math.PI * 2;
      pos[c * 3]     = Math.cos(angle) * radius;
      pos[c * 3 + 1] = y;
      pos[c * 3 + 2] = Math.sin(angle) * radius;
    }
    polarLines[r].geometry.attributes.position.needsUpdate = true;
  }
}

export function tearDownPolar() {
  polarLines.forEach(l => scene.remove(l));
}
