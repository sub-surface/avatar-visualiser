/**
 * vis/polar.js — concentric rings in XZ plane, radius = FFT.
 */
import * as THREE from 'three';
import { scene, material, _colA, _colB } from '../engine.js';
import { P, getCols } from '../params.js';
import { bowlFactor } from '../dsp.js';
import { histBuf, histHead, binMap, pushHistory } from './shared.js';
import { modDisp } from '../envelopes.js';

export const polarLines = [];
export const polarBufs  = [];
export const polarCols  = [];

export function rebuildPolar() {
  const cols = getCols();
  polarLines.forEach(l => scene.remove(l));
  polarLines.length = polarBufs.length = polarCols.length = 0;
  const rows = Math.max(2, P.rows);
  const segs = cols;
  for (let r = 0; r < rows; r++) {
    const positions = new Float32Array((segs + 1) * 3);
    const colors    = new Float32Array((segs + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const line = new THREE.LineLoop(geo, material);
    scene.add(line);
    polarLines.push(line);
    polarBufs.push(positions);
    polarCols.push(colors);
  }
}

export function applyPolar(fdL, fdR, bowlExp, dispScale, spacing) {
  const fdAvg = new Uint8Array(fdL.length);
  for(let i=0; i<fdL.length; i++) fdAvg[i] = (fdL[i] + fdR[i]) / 2;
  pushHistory(fdAvg);

  const disp  = dispScale !== undefined ? dispScale : modDisp();
  const space = spacing !== undefined ? spacing : P.polarSpacing;
  const cols  = getCols();
  const half  = cols / 2;
  const segs  = cols;
  const rows  = Math.max(2, P.rows);
  const BASE_R = 0.4;
  const MAX_R  = 4.5;
  for (let r = 0; r < rows; r++) {
    const pos  = polarBufs[r];
    const col  = polarCols[r];
    const hrow = histBuf[(histHead + r) % rows];
    const bf   = bowlFactor(r, rows, bowlExp);
    const y    = (r / (rows - 1) - 0.5) * space;
    for (let c = 0; c <= segs; c++) {
      const ci = c % segs;
      const spiral = P.morph * (r / P.rows) * Math.PI * 2;
      const angle  = (ci / segs) * Math.PI * 2 + spiral;
      const isRight = ci < segs / 2; 
      const m  = ci < half ? ci : segs - 1 - ci;
      const bin = binMap[Math.min(m, half - 1)];
      
      const fv = (r === 0) ? ((isRight ? fdR[bin] : fdL[bin]) / 255) : hrow[bin];
      
      const radius = BASE_R + (MAX_R - BASE_R) * bf * (1 + fv * disp * 0.18);
      pos[c * 3]     = Math.cos(angle) * radius;
      pos[c * 3 + 1] = y;
      pos[c * 3 + 2] = Math.sin(angle) * radius;

      // Update vertex color
      const lerpVal = Math.min(fv * 2.0, 1.0);
      col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
      col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
      col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
    }
    polarLines[r].geometry.attributes.position.needsUpdate = true;
    polarLines[r].geometry.attributes.color.needsUpdate = true;
  }
}

/**
 * Pure position calculator — no state, safe to call from export.js.
 * Mutates out[0..2] = [x, y, z].
 */
export function calcPolarPos(out, r, c, rows, cols, hrowL, hrowR, half, binMap, bf, disp, space) {
  const segs = cols;
  const ci = c % segs;
  const angle = (ci / segs) * Math.PI * 2;
  const isRight = ci < segs / 2;
  const m = ci < half ? ci : segs - 1 - ci;
  const bin = binMap[Math.min(m, half - 1)];
  const fv = isRight ? hrowR[bin] : hrowL[bin];
  const radius = 0.4 + (4.5 - 0.4) * bf * (1 + fv * disp * 0.18);
  out[0] = Math.cos(angle) * radius;
  out[1] = (r / (rows - 1) - 0.5) * space;
  out[2] = Math.sin(angle) * radius;
}

export function tearDownPolar() {
  polarLines.forEach(l => { l.geometry.dispose(); scene.remove(l); });
  polarLines.length = polarBufs.length = polarCols.length = 0;
}
