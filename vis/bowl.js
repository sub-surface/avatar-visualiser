/**
 * vis/bowl.js — scanline grid (default mode).
 */
import * as THREE from 'three';
import { scene, material, GRID_W, GRID_D, _colA, _colB } from '../engine.js';
import { P } from '../params.js';
import { bowlFactor } from '../dsp.js';
import { histBuf, histHead, binMap, pushHistory } from './shared.js';
import { modDisp } from '../envelopes.js';

export const lines = [];
export const posBuffers = [];
export const colBuffers = [];

export function rebuildGrid() {
  lines.forEach(l => scene.remove(l));
  lines.length = posBuffers.length = colBuffers.length = 0;
  for (let r = 0; r < P.rows; r++) {
    const z = (r / (P.rows - 1) - 0.5) * GRID_D;
    const positions = new Float32Array(P.cols * 3);
    const colors    = new Float32Array(P.cols * 3);
    for (let c = 0; c < P.cols; c++) {
      positions[c * 3]     = (c / (P.cols - 1) - 0.5) * GRID_W;
      positions[c * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const line = new THREE.Line(geo, material);
    scene.add(line);
    lines.push(line);
    posBuffers.push(positions);
    colBuffers.push(colors);
  }
}

export function applyDisplacement(fdL, fdR, bowlExp, dispScale) {
  const fdAvg = new Uint8Array(fdL.length);
  for(let i=0; i<fdL.length; i++) fdAvg[i] = (fdL[i] + fdR[i]) / 2;
  pushHistory(fdAvg);

  const disp = dispScale !== undefined ? dispScale : modDisp();
  const half = P.cols / 2;
  for (let r = 0; r < P.rows; r++) {
    const pos  = posBuffers[r];
    const col  = colBuffers[r];
    const hrow = histBuf[(histHead + r) % P.rows];
    const bf   = bowlFactor(r, P.rows, bowlExp);
    for (let c = 0; c < P.cols; c++) {
      const isRight = c >= half;
      const m = c < half ? c : P.cols - 1 - c;
      const bin = binMap[Math.min(m, half - 1)];
      
      const fv = (r === 0) ? ((isRight ? fdR[bin] : fdL[bin]) / 255) : hrow[bin];
      
      pos[c * 3 + 1] = -fv * bf * disp;

      // Update vertex color
      const lerpVal = Math.min(fv * 2.0, 1.0);
      col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
      col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
      col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
    }
    lines[r].geometry.attributes.position.needsUpdate = true;
    lines[r].geometry.attributes.color.needsUpdate = true;
  }
}

export function tearDownBowl() {
  lines.forEach(l => scene.remove(l));
  lines.length = posBuffers.length = colBuffers.length = 0;
}
