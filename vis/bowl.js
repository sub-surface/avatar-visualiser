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
  const cols = Math.max(2, P.complexity * 32);
  lines.forEach(l => scene.remove(l));
  lines.length = posBuffers.length = colBuffers.length = 0;
  const rows = Math.max(2, P.rows);
  for (let r = 0; r < rows; r++) {
    const z = (r / (rows - 1) - 0.5) * GRID_D;
    const positions = new Float32Array(cols * 3);
    const colors    = new Float32Array(cols * 3);
    for (let c = 0; c < cols; c++) {
      positions[c * 3]     = (c / (cols - 1) - 0.5) * GRID_W;
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
  const cols = Math.max(2, P.complexity * 32);
  const half = cols / 2;
  const rows = Math.max(2, P.rows);
  
  // Sanity check on parameters
  if (!isFinite(disp)) {
    console.error('[bowl.applyDisplacement] ERROR: disp is non-finite', disp, 'bowlExp:', bowlExp);
    return;
  }
  if (histBuf.length !== rows) {
    console.error('[bowl.applyDisplacement] ERROR: histBuf size mismatch. Expected', rows, 'got', histBuf.length);
    return;
  }
  
  for (let r = 0; r < rows; r++) {
    const bf   = bowlFactor(r, rows, bowlExp);
    // Skip rows with negligible displacement
    if (bf < 0.01) { lines[r].visible = false; continue; }
    lines[r].visible = true;
    const pos  = posBuffers[r];
    const col  = colBuffers[r];
    const hrow = histBuf[(histHead + r) % rows];
    for (let c = 0; c < cols; c++) {
      const isRight = c >= half;
      const m = c < half ? c : cols - 1 - c;
      const bin = binMap[Math.min(m, half - 1)];
      
      const fv = (r === 0) ? ((isRight ? fdR[bin] : fdL[bin]) / 255) : hrow[bin];
      
      const twist = P.morph * (r / rows) * 1.5;
      pos[c * 3]     = (c / (cols - 1) - 0.5) * GRID_W + twist;
      pos[c * 3 + 1] = -fv * bf * disp;

      // Update vertex color
      const lerpVal = Math.min(fv * 2.0, 1.0);
      col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
      col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
      col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
    }
    
    // Validate positions before sending to GPU
    let hasNaN = false;
    for (let i = 0; i < pos.length; i++) {
      if (!isFinite(pos[i])) {
        console.error('[bowl] Position NaN at index', i, 'value:', pos[i], 'row:', r);
        pos[i] = 0; // Replace with safe value
        hasNaN = true;
      }
    }
    if (hasNaN) {
      lines[r].visible = false;
      console.warn('[bowl] Row', r, 'hidden due to NaN in positions');
      continue;
    }
    
    lines[r].geometry.attributes.position.needsUpdate = true;
    lines[r].geometry.attributes.color.needsUpdate = true;
  }
}

export function tearDownBowl() {
  lines.forEach(l => { l.geometry.dispose(); scene.remove(l); });
  lines.length = posBuffers.length = colBuffers.length = 0;
}
