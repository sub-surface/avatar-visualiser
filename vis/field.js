import * as THREE from 'three';
import { scene } from '../engine.js';

export const FIELD_MODES = Object.freeze([
  { id: 'sphere', label: 'sphere', family: 'sculpture' },
  { id: 'bowl', label: 'bowl', family: 'terrain' },
  { id: 'polar', label: 'polar', family: 'radial' },
  { id: 'wave', label: 'wave', family: 'scope' },
  { id: 'topology', label: 'topology fold', family: 'sculpture' },
  { id: 'cathedral', label: 'signal cathedral', family: 'architecture' },
  { id: 'ribbon', label: 'stereo ribbon', family: 'scope' },
  { id: 'tunnel', label: 'feedback tunnel', family: 'radial' },
]);

const MODE_INDEX = Object.freeze(Object.fromEntries(FIELD_MODES.map((mode, index) => [mode.id, index])));
const MAX_BINS = 1024;

const vertexShader = `
  precision highp float;
  attribute vec2 aGrid;
  uniform sampler2D tSignal;
  uniform float uRows;
  uniform float uHead;
  uniform float uMode;
  uniform float uTargetMode;
  uniform float uModeMix;
  uniform float uTime;
  uniform float uSampleRate;
  uniform float uFreqScale;
  uniform float uFreqRange;
  uniform float uDisp;
  uniform float uBowlExp;
  uniform float uSphereSize;
  uniform float uPolarSpacing;
  uniform float uWaveSpacing;
  uniform float uMorph;
  uniform float uScale;
  uniform float uDepth;
  uniform float uTwist;
  uniform float uCurl;
  uniform float uStereo;
  uniform float uFlow;
  uniform float uSymmetry;
  uniform float uHistory;
  uniform float uRotation;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vColor;
  varying float vEnergy;

  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  float signalX(float t) {
    float limitedRange = clamp(uFreqRange, 0.01, 1.0);
    if (uFreqScale < 0.5) {
      float fMin = 20.0;
      float fMax = max(fMin + 1.0, limitedRange * uSampleRate * 0.5);
      return clamp((fMin * pow(fMax / fMin, t)) / (uSampleRate * 0.5), 0.0, 1.0);
    }
    if (uFreqScale < 1.5) return t * limitedRange;
    if (t < 0.25) return mix(40.0, 180.0, t / 0.25) / (uSampleRate * 0.5);
    if (t < 0.75) return mix(500.0, 6000.0, (t - 0.25) / 0.5) / (uSampleRate * 0.5);
    return mix(6000.0, min(16000.0, uSampleRate * 0.5), (t - 0.75) / 0.25) / (uSampleRate * 0.5);
  }

  vec4 sampleSignal(float frequencyT, float historyT) {
    float row = mod(uHead + floor(historyT * max(1.0, uRows - 1.0)), uRows);
    vec2 uv = vec2(clamp(signalX(frequencyT), 0.0005, 0.9995), (row + 0.5) / uRows);
    return texture2D(tSignal, uv);
  }

  vec3 mapPosition(
    float mode,
    float xT,
    float rowT,
    float left,
    float right,
    float mono,
    float stereo,
    float displacement,
    float motion
  ) {
    vec3 p = vec3(0.0);
    if (mode < 0.5) {
      float phi = rowT * PI;
      float theta = xT * TAU + uTime * uRotation + rowT * uTwist;
      float radius = uSphereSize * uScale * (1.0 + displacement * 0.34);
      radius *= 1.0 + sin(theta * uSymmetry + motion) * uMorph * 0.08;
      p = vec3(cos(theta) * sin(phi), cos(phi), sin(theta) * sin(phi)) * radius;
      p.y += stereo * uStereo * 0.8;
    } else if (mode < 1.5) {
      float edge = abs(rowT - 0.5) * 2.0;
      float bowl = pow(max(0.0, 1.0 - edge), max(0.1, uBowlExp));
      p.x = (xT - 0.5) * 10.0 * uScale;
      p.z = (rowT - 0.5) * 10.0 * uScale;
      p.x += sin(rowT * PI + motion) * uTwist;
      p.y = -displacement * bowl + stereo * uStereo * 0.5;
    } else if (mode < 2.5) {
      float theta = xT * TAU + rowT * uTwist + uTime * uRotation;
      float radius = (1.0 + rowT * 4.2 + displacement) * uScale;
      p = vec3(cos(theta) * radius, rowT * uPolarSpacing, sin(theta) * radius);
      p.y += stereo * uStereo;
    } else if (mode < 3.5) {
      p.x = (xT - 0.5) * 10.0 * uScale;
      p.z = (rowT - 0.5) * uWaveSpacing * min(uRows, 24.0) * uScale;
      p.y = displacement + stereo * uStereo;
      p.y += sin(xT * TAU * max(1.0, uSymmetry) + motion) * uMorph;
      p.x += rowT * uTwist;
    } else if (mode < 4.5) {
      float u = xT * TAU + uTime * uRotation;
      float v = rowT * TAU;
      float folded = cos(v * max(1.0, floor(uSymmetry))) * (0.6 + uMorph);
      float radius = (2.8 + folded + displacement * 0.5) * uScale;
      p = vec3(cos(u + v * uTwist) * radius, sin(v) * (1.1 + uCurl) + displacement, sin(u + v * uTwist) * radius);
      p.y += stereo * uStereo;
    } else if (mode < 5.5) {
      float x = xT * 2.0 - 1.0;
      float nave = pow(max(0.0, 1.0 - abs(x)), 0.42);
      float ribs = 0.5 + 0.5 * cos(x * PI * max(1.0, floor(uSymmetry)) + motion);
      p.x = x * 5.5 * uScale;
      p.z = (rowT - 0.5) * 11.0 * uScale;
      p.y = (nave * 3.5 + displacement * (0.5 + ribs)) * uDepth;
      p.x += sin(rowT * PI + motion) * uTwist;
      p.y += stereo * uStereo;
    } else if (mode < 6.5) {
      vec4 direct = sampleSignal(xT, rowT);
      float centre = (direct.r + direct.g) * 0.5;
      float phase = direct.g - direct.r;
      p.x = (xT - 0.5) * 10.0 * uScale;
      p.y = centre * uDisp * uDepth + phase * uStereo * 4.0;
      p.z = (rowT - 0.5) * 8.0 * uScale + sin(xT * TAU + motion) * uCurl;
      p.x += phase * uTwist;
    } else {
      float theta = xT * TAU + rowT * uTwist + uTime * uRotation;
      float radius = (2.4 + displacement + sin(rowT * TAU * uSymmetry + motion) * uMorph * 0.3) * uScale;
      p = vec3(cos(theta) * radius, sin(theta) * radius, (0.5 - rowT) * 13.0 * uScale);
      p.xy += vec2(stereo * uStereo, -stereo * uStereo);
    }
    p.xz *= mat2(cos(uCurl * rowT), -sin(uCurl * rowT), sin(uCurl * rowT), cos(uCurl * rowT));
    return p;
  }

  void main() {
    float xT = aGrid.x;
    float rowT = aGrid.y;
    float mirroredT = abs(xT * 2.0 - 1.0);
    vec4 signal = sampleSignal(mirroredT, rowT);
    float left = signal.r;
    float right = signal.g;
    float mono = signal.b;
    float stereo = (right - left);
    float historyGain = mix(1.0, uHistory, rowT);
    float energy = mix(xT < 0.5 ? left : right, mono, clamp(1.0 - abs(uStereo), 0.0, 1.0));
    energy *= historyGain;
    float displacement = energy * uDisp * uDepth;
    float motion = uTime * uFlow;
    vec3 fromPosition = mapPosition(uMode, xT, rowT, left, right, mono, stereo, displacement, motion);
    vec3 toPosition = mapPosition(uTargetMode, xT, rowT, left, right, mono, stereo, displacement, motion);
    float blend = uModeMix * uModeMix * (3.0 - 2.0 * uModeMix);
    vec3 p = mix(fromPosition, toPosition, blend);
    vEnergy = energy;
    vColor = mix(uColorA, uColorB, clamp(energy * 1.8 + abs(stereo) * 0.5, 0.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vEnergy;
  void main() {
    gl_FragColor = vec4(vColor, uOpacity * (0.55 + min(1.0, vEnergy) * 0.45));
  }
`;

function geometryFor(rows, cols, closed) {
  const segmentCount = rows * (closed ? cols : cols - 1);
  const grid = new Float32Array(segmentCount * 2 * 2);
  let cursor = 0;
  for (let row = 0; row < rows; row++) {
    const rowT = rows > 1 ? row / (rows - 1) : 0;
    const count = closed ? cols : cols - 1;
    for (let col = 0; col < count; col++) {
      const next = closed ? (col + 1) % cols : col + 1;
      grid[cursor++] = cols > 1 ? col / (cols - 1) : 0;
      grid[cursor++] = rowT;
      grid[cursor++] = cols > 1 ? next / (cols - 1) : 0;
      grid[cursor++] = rowT;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  geometry.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
  return geometry;
}

function scaleCode(scale) {
  if (scale === 'linear') return 1;
  if (scale === 'dnb') return 2;
  return 0;
}

function applyContextualInk(col) {
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  if (hsl.l > 0.35) {
    hsl.l = Math.max(0.12, 0.92 - hsl.l * 0.75);
    hsl.s = Math.min(1.0, hsl.s * 1.15 + 0.05);
    col.setHSL(hsl.h, hsl.s, hsl.l);
  }
}

export class SignalField {
  constructor(targetScene = scene) {
    this.scene = targetScene;
    this.rows = 0;
    this.cols = 0;
    this.mode = 'sphere';
    this.modeMix = 1;
    this.head = 0;
    this.textureData = null;
    this.texture = null;
    this.object = null;
    this.colorA = new THREE.Color();
    this.colorB = new THREE.Color();
    this.baseColorA = new THREE.Color();
    this.baseColorB = new THREE.Color();
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        tSignal: { value: null },
        uRows: { value: 60 },
        uHead: { value: 0 },
        uMode: { value: 0 },
        uTargetMode: { value: 0 },
        uModeMix: { value: 1 },
        uTime: { value: 0 },
        uSampleRate: { value: 44100 },
        uFreqScale: { value: 0 },
        uFreqRange: { value: 0.55 },
        uDisp: { value: 2.2 },
        uBowlExp: { value: 2 },
        uSphereSize: { value: 3 },
        uPolarSpacing: { value: -3 },
        uWaveSpacing: { value: 0.4 },
        uMorph: { value: 0 },
        uScale: { value: 1 },
        uDepth: { value: 1 },
        uTwist: { value: 0 },
        uCurl: { value: 0 },
        uStereo: { value: 1 },
        uFlow: { value: 0 },
        uSymmetry: { value: 4 },
        uHistory: { value: 1 },
        uRotation: { value: 0.16 },
        uOpacity: { value: 0.72 },
        uColorA: { value: new THREE.Color('#e8d5b0') },
        uColorB: { value: new THREE.Color('#b090c8') },
      },
    });
  }

  setMode(mode, { immediate = false } = {}) {
    if (!(mode in MODE_INDEX)) mode = 'sphere';
    if (mode === this.mode && !immediate) return;
    const previousMode = this.material.uniforms.uTargetMode.value;
    this.material.uniforms.uMode.value = immediate ? MODE_INDEX[mode] : previousMode;
    this.material.uniforms.uTargetMode.value = MODE_INDEX[mode];
    this.modeMix = immediate || !this.object ? 1 : 0;
    this.material.uniforms.uModeMix.value = this.modeMix;
    const closed = mode === 'sphere' || mode === 'polar' || mode === 'topology' || mode === 'tunnel';
    if (this.object) {
      this.mode = mode;
      this.rebuild(this.rows, this.cols, closed);
    } else {
      this.mode = mode;
    }
  }

  advanceTransition(dt) {
    if (this.modeMix >= 1) return;
    this.modeMix = Math.min(1, this.modeMix + Math.max(0, dt) / 0.65);
    this.material.uniforms.uModeMix.value = this.modeMix;
    if (this.modeMix >= 1) {
      this.material.uniforms.uMode.value = this.material.uniforms.uTargetMode.value;
    }
  }

  get mesh() {
    return this.object;
  }

  setVisible(visible) {
    if (this.object) {
      this.object.visible = Boolean(visible);
    }
  }

  rebuild(rows, cols, closed = ['sphere', 'polar', 'topology', 'tunnel'].includes(this.mode)) {
    const nextRows = Math.max(2, Math.min(160, Math.round(rows)));
    const nextCols = Math.max(8, Math.min(384, Math.round(cols)));
    const historyNeedsReset = !this.texture || nextRows !== this.rows;
    this.object?.geometry.dispose();
    if (this.object) this.scene.remove(this.object);
    this.object = new THREE.LineSegments(geometryFor(nextRows, nextCols, closed), this.material);
    this.object.frustumCulled = false;
    this.scene.add(this.object);
    this.rows = nextRows;
    this.cols = nextCols;
    if (historyNeedsReset) this.resetHistory(nextRows);
  }

  resetHistory(rows = this.rows || 60) {
    this.texture?.dispose();
    this.textureData = new Uint8Array(MAX_BINS * rows * 4);
    this.texture = new THREE.DataTexture(
      this.textureData,
      MAX_BINS,
      rows,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.material.uniforms.tSignal.value = this.texture;
    this.material.uniforms.uRows.value = rows;
    this.head = 0;
  }

  push(frame) {
    if (!frame || !this.textureData) return;
    this.head = (this.head + this.rows - 1) % this.rows;
    const offset = this.head * MAX_BINS * 4;
    const length = Math.min(MAX_BINS, frame.freqL.length, frame.freqR.length);
    for (let index = 0; index < length; index++) {
      const target = offset + index * 4;
      const left = frame.freqL[index];
      const right = frame.freqR[index];
      this.textureData[target] = left;
      this.textureData[target + 1] = right;
      this.textureData[target + 2] = (left + right) >> 1;
      this.textureData[target + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  update(frame, project, { cols = Math.round(project.complexity) * 32 } = {}) {
    const rows = Math.max(2, Math.round(project.rows));
    if (!this.object || rows !== this.rows || cols !== this.cols) this.rebuild(rows, cols);
    this.push(frame);
    this.advanceTransition(frame?.dt ?? 0);
    const uniforms = this.material.uniforms;
    uniforms.uHead.value = this.head;
    uniforms.uTime.value = frame?.time ?? 0;
    uniforms.uSampleRate.value = frame?.sampleRate ?? 44100;
    uniforms.uFreqScale.value = scaleCode(project.freqScale);
    uniforms.uFreqRange.value = project.freqRange;
    uniforms.uDisp.value = project.maxDisp * (1 + (frame?.env?.sub ?? 0) * project.modSub + (frame?.lfo1 ?? 0) * project.lfoToDisp);
    uniforms.uBowlExp.value = project.bowlExp - (frame?.env?.high ?? 0) * project.modHigh + (frame?.lfo1 ?? 0) * project.lfoToBowl;
    uniforms.uSphereSize.value = project.sphereSize;
    uniforms.uPolarSpacing.value = project.polarSpacing + (frame?.lfo1 ?? 0) * project.lfoToPolar;
    uniforms.uWaveSpacing.value = Math.max(0.01, project.waveSpacing + (frame?.lfo1 ?? 0) * project.lfoToWave);
    uniforms.uMorph.value = project.morph;
    uniforms.uScale.value = project.fieldScale;
    uniforms.uDepth.value = project.fieldDepth;
    uniforms.uTwist.value = project.fieldTwist;
    uniforms.uCurl.value = project.fieldCurl;
    uniforms.uStereo.value = project.fieldStereo;
    uniforms.uFlow.value = project.fieldFlow;
    uniforms.uSymmetry.value = project.fieldSymmetry;
    uniforms.uHistory.value = project.fieldHistory;
    uniforms.uRotation.value = project.fieldRotation;
    const isLight = Boolean(project.isLight) || (typeof document !== 'undefined' && document.body?.classList.contains('light-mode'));
    const baseOpacity = project.fieldOpacity + (frame?.lfo1 ?? 0) * project.lfoToOpacity * 0.15;
    uniforms.uOpacity.value = isLight ? Math.min(1.0, baseOpacity + 0.18) : baseOpacity;
    this.baseColorA.set(project.colorA);
    this.baseColorB.set(project.colorB);
    this.colorA.copy(this.baseColorA);
    this.colorB.copy(this.baseColorB);
    if (project.colorCycle > 0 && frame) {
      const shift = (frame.lfo1 + 1) * 0.5 * project.colorCycle;
      this.colorA.lerp(this.baseColorB, shift);
      this.colorB.lerp(this.baseColorA, shift);
    }
    if (isLight) {
      applyContextualInk(this.colorA);
      applyContextualInk(this.colorB);
    }
    uniforms.uColorA.value.copy(this.colorA);
    uniforms.uColorB.value.copy(this.colorB);
  }

  dispose() {
    this.object?.geometry.dispose();
    if (this.object) this.scene.remove(this.object);
    this.texture?.dispose();
    this.material.dispose();
    this.object = null;
    this.texture = null;
  }
}

export const signalField = new SignalField();
