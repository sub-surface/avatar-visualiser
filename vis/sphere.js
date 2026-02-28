import * as THREE from 'three';
import { scene, material, _colA, _colB } from '../engine.js';
import { P } from '../params.js';
import { histBuf, histHead, binMap, pushHistory } from './shared.js';
import { modDisp } from '../envelopes.js';

export const sphereLines = [];
export const sphereBufs  = [];
export const sphereCols  = [];
export const sphereBase  = []; // static unit-sphere points

let sphereRotation = 0;

export function rebuildSphere() {
  sphereLines.forEach(l => scene.remove(l));
  sphereLines.length = sphereBufs.length = sphereCols.length = sphereBase.length = 0;

  const rows = P.rows;
  const cols = P.cols;

  for (let r = 0; r < rows; r++) {
    const phi = (r / (rows - 1)) * Math.PI; // 0 to PI (top to bottom)
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    const positions = new Float32Array(cols * 3);
    const colors    = new Float32Array(cols * 3);
    const basePts   = new Float32Array(cols * 3);

    for (let c = 0; c < cols; c++) {
      const theta = (c / (cols - 1)) * Math.PI * 2;
      const x = Math.cos(theta) * sinPhi;
      const z = Math.sin(theta) * sinPhi;
      const y = cosPhi;

      // Base unit sphere shape
      basePts[c * 3]     = x * P.sphereSize;
      basePts[c * 3 + 1] = y * P.sphereSize;
      basePts[c * 3 + 2] = z * P.sphereSize;

      positions.set(basePts.subarray(c * 3, c * 3 + 3), c * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const line = new THREE.LineLoop(geo, material);
    
    scene.add(line);
    sphereLines.push(line);
    sphereBufs.push(positions);
    sphereCols.push(colors);
    sphereBase.push(basePts);
  }
}

export function applySphere(fdL, fdR, dispScale) {
  const fdAvg = new Uint8Array(fdL.length);
  for(let i=0; i<fdL.length; i++) fdAvg[i] = (fdL[i] + fdR[i]) / 2;
  pushHistory(fdAvg);

  const disp = dispScale !== undefined ? dispScale : modDisp() * 0.5;
  const half = P.cols / 2;

  // Ambient spin
  sphereRotation += 0.005;

  for (let r = 0; r < P.rows; r++) {
    const pos  = sphereBufs[r];
    const col  = sphereCols[r];
    const base = sphereBase[r];
    const line = sphereLines[r];
    
    const midIdx = Math.floor(P.rows / 2);
    const distFromMid = Math.abs(r - midIdx);
    const hrow = histBuf[(histHead + distFromMid) % P.rows];

    for (let c = 0; c < P.cols; c++) {
      const isRight = c < half; 
      const m  = c < half ? c : P.cols - 1 - c;
      const bin = binMap[Math.min(m, half - 1)];
      
      const fv = (r === midIdx) ? ((isRight ? fdR[bin] : fdL[bin]) / 255) : hrow[bin];
      
      const push = 1 + fv * disp;
      pos[c * 3]     = base[c * 3]     * push;
      pos[c * 3 + 1] = base[c * 3 + 1] * push;
      pos[c * 3 + 2] = base[c * 3 + 2] * push;

      // Update vertex color
      const lerpVal = Math.min(fv * 2.0, 1.0);
      col[c * 3]     = _colA.r + (_colB.r - _colA.r) * lerpVal;
      col[c * 3 + 1] = _colA.g + (_colB.g - _colA.g) * lerpVal;
      col[c * 3 + 2] = _colA.b + (_colB.b - _colA.b) * lerpVal;
    }
    
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.attributes.color.needsUpdate = true;
    line.rotation.y = sphereRotation;
  }
}

export function tearDownSphere() {
  sphereLines.forEach(l => { l.geometry.dispose(); scene.remove(l); });
  sphereLines.length = sphereBufs.length = sphereCols.length = sphereBase.length = 0;
}
