/**
 * vis/wave.js — 3D time-domain waterfall with fading history.
 */
import * as THREE from 'three';
import { scene, LINE_COLOR, GRID_W, _colA, _colB } from '../engine.js';
import { P } from '../params.js';
import { modDisp } from '../envelopes.js';

export const waveLines = [];
export const waveBufs  = [];
export const waveMats  = [];

// Ring buffer for time-domain history + energy peak for colour
const tdHistory = [];
const tdEnergy  = []; // Store peak magnitude for each row
let tdHead = 0;

export function rebuildWave() {
  tearDownWave();
  
  const rows = P.rows;
  const cols = P.cols;

  for (let r = 0; r < rows; r++) {
    const positions = new Float32Array(cols * 3);
    const z = -r * P.waveSpacing; // scroll back into Z

    for (let c = 0; c < cols; c++) {
      positions[c * 3]     = (c / (cols - 1) - 0.5) * GRID_W;
      positions[c * 3 + 1] = 0;
      positions[c * 3 + 2] = z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Per-line material for fading and colour reactivity
    const opacity = 1.0 - (r / rows);
    const mat = new THREE.LineBasicMaterial({ 
      color: LINE_COLOR, 
      transparent: true, 
      opacity: opacity * opacity // quadratic fade
    });

    const line = new THREE.Line(geo, mat);
    scene.add(line);
    
    waveLines.push(line);
    waveBufs.push(positions);
    waveMats.push(mat);
    tdHistory.push(new Float32Array(cols));
    tdEnergy.push(0);
  }
}

export function applyWave(tdData, dispScale, spacing) {
  const disp  = dispScale !== undefined ? dispScale : modDisp();
  const space = spacing !== undefined ? spacing : P.waveSpacing;
  const rows  = P.rows;
  const cols  = P.cols;

  // Push latest data to ring buffer
  tdHead = (tdHead + rows - 1) % rows;
  const latest = tdHistory[tdHead];
  
  let peak = 0;
  for (let c = 0; c < cols; c++) {
    const v = (tdData[Math.floor(c * tdData.length / cols)] / 128.0) - 1.0;
    latest[c] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  tdEnergy[tdHead] = peak;

  // Update all lines in the waterfall
  for (let r = 0; r < rows; r++) {
    const pos = waveBufs[r];
    const hIdx = (tdHead + r) % rows;
    const data = tdHistory[hIdx];
    const energy = tdEnergy[hIdx];
    
    for (let c = 0; c < cols; c++) {
      pos[c * 3 + 1] = data[c] * disp;
      pos[c * 3 + 2] = -r * space;
    }
    
    waveLines[r].geometry.attributes.position.needsUpdate = true;
    
    // Lerp colour based on energy
    waveMats[r].color.copy(_colA).lerp(_colB, Math.min(energy * 2.0, 1.0));
  }
}

export function ensureTimeDomainData(analyser) {
  // Always use the largest possible FFT size for time domain to get smooth curves
  return new Uint8Array(analyser.fftSize);
}

export function tearDownWave() {
  waveLines.forEach(l => { l.geometry.dispose(); l.material.dispose(); scene.remove(l); });
  waveLines.length = waveBufs.length = waveMats.length = tdHistory.length = tdEnergy.length = 0;
}
