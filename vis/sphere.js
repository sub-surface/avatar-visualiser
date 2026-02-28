/**
 * vis/sphere.js — subdivided sphere, vertex displacement outward by FFT.
 */
import * as THREE from 'three';
import { scene, LINE_COLOR } from '../engine.js';
import { P } from '../params.js';
import { binMap } from './shared.js';
import { modDisp } from '../envelopes.js';

const SPHERE_SEGS = 48;
export let sphereGeo = null, sphereMesh = null, sphereBasePts = null;

export function rebuildSphere() {
  if (sphereMesh) scene.remove(sphereMesh);
  sphereGeo = new THREE.SphereGeometry(3, SPHERE_SEGS, SPHERE_SEGS);
  const wireMat = new THREE.MeshBasicMaterial({
    color: LINE_COLOR, wireframe: true, transparent: true, opacity: 0.7,
  });
  sphereMesh = new THREE.Mesh(sphereGeo, wireMat);
  scene.add(sphereMesh);
  sphereBasePts = new Float32Array(sphereGeo.attributes.position.array);
}

export function applySphere(fd, dispScale) {
  if (!sphereMesh) return;
  const disp  = dispScale !== undefined ? dispScale : modDisp() * 0.4;
  const pos   = sphereGeo.attributes.position;
  const arr   = pos.array;
  const half  = P.cols / 2;
  const count = arr.length / 3;
  for (let i = 0; i < count; i++) {
    const bx = sphereBasePts[i * 3];
    const by = sphereBasePts[i * 3 + 1];
    const bz = sphereBasePts[i * 3 + 2];
    const az = Math.atan2(bz, bx);
    const t  = (az / (Math.PI * 2) + 0.5);
    const ci = Math.floor(t * (P.cols - 1));
    const m  = ci < half ? ci : P.cols - 1 - ci;
    const fv = fd[binMap[Math.min(m, half - 1)]] / 255;
    const push = 1 + fv * disp;
    arr[i * 3]     = bx * push;
    arr[i * 3 + 1] = by * push;
    arr[i * 3 + 2] = bz * push;
  }
  pos.needsUpdate = true;
  sphereGeo.computeVertexNormals();
}

export function tearDownSphere() {
  if (sphereMesh) { scene.remove(sphereMesh); sphereMesh = null; }
}
