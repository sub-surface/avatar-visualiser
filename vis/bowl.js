/**
 * vis/bowl.js — scanline grid (default mode).
 */
import * as THREE from 'three';
import { scene, material, GRID_W, GRID_D } from '../engine.js';
import { P } from '../params.js';
import { bowlFactor } from '../dsp.js';
import { histBuf, histHead, binMap, pushHistory } from './shared.js';
import { modDisp } from '../envelopes.js';

export const lines = [];
export const posBuffers = [];

export function rebuildGrid() {
  lines.forEach(l => scene.remove(l));
  lines.length = posBuffers.length = 0;
  for (let r = 0; r < P.rows; r++) {
    const z = (r / (P.rows - 1) - 0.5) * GRID_D;
    const positions = new Float32Array(P.cols * 3);
    for (let c = 0; c < P.cols; c++) {
      positions[c * 3]     = (c / (P.cols - 1) - 0.5) * GRID_W;
      positions[c * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geo, material);
    scene.add(line);
    lines.push(line);
    posBuffers.push(positions);
  }
}

export function applyDisplacement(fd, bowlExp, dispScale) {
  pushHistory(fd);
  const disp = dispScale !== undefined ? dispScale : modDisp();
  const half = P.cols / 2;
  for (let r = 0; r < P.rows; r++) {
    const pos  = posBuffers[r];
    const hrow = histBuf[(histHead + r) % P.rows];
    const bf   = bowlFactor(r, P.rows, bowlExp);
    for (let c = 0; c < P.cols; c++) {
      const m = c < half ? c : P.cols - 1 - c;
      pos[c * 3 + 1] = -hrow[binMap[Math.min(m, half - 1)]] * bf * disp;
    }
    lines[r].geometry.attributes.position.needsUpdate = true;
  }
}

export function tearDownBowl() {
  lines.forEach(l => scene.remove(l));
}
