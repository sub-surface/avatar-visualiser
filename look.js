import * as THREE from 'three';
import { renderer } from './engine.js';
import { getInternalSize } from './look-profiles.js';

const fullscreenVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tPrevious;
  uniform vec2 uSourceSize;
  uniform float uFrame;
  uniform float uPixelSnap;
  uniform float uColorBits;
  uniform float uDither;
  uniform float uScanlines;
  uniform float uInterlace;
  uniform float uChroma;
  uniform float uNoise;
  uniform float uFeedback;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float bayer4(vec2 pixel) {
    vec2 p = mod(floor(pixel), 4.0);
    return fract((p.x * 0.5 + p.y * 0.75 + p.x * p.y * 0.25) * 0.25);
  }

  void main() {
    vec2 pixel = floor(vUv * uSourceSize);
    vec2 snapped = (pixel + 0.5) / uSourceSize;
    vec2 uv = mix(vUv, snapped, clamp(uPixelSnap, 0.0, 1.0));
    float field = mod(uFrame, 2.0);
    uv.y += (field - 0.5) * uInterlace / uSourceSize.y;

    vec2 chromaOffset = vec2((0.5 + hash21(vec2(uFrame, floor(pixel.y / 8.0)))) * uChroma / uSourceSize.x, 0.0);
    vec4 centre = texture2D(tScene, uv);
    vec3 colour = vec3(
      texture2D(tScene, uv + chromaOffset).r,
      centre.g,
      texture2D(tScene, uv - chromaOffset).b
    );

    vec3 previous = texture2D(tPrevious, uv * 0.998 + 0.001).rgb;
    colour = max(colour, previous * clamp(uFeedback, 0.0, 0.98));

    float levels = max(1.0, exp2(uColorBits) - 1.0);
    float dither = (bayer4(pixel) - 0.5) * uDither / levels;
    float noise = (hash21(pixel + uFrame * 17.0) - 0.5) * uNoise;
    colour = floor(clamp(colour + dither + noise, 0.0, 1.0) * levels + 0.5) / levels;

    float scan = mix(1.0, 0.72 + 0.28 * sin(pixel.y * 3.14159265), uScanlines);
    gl_FragColor = vec4(colour * scan, centre.a);
  }
`;

const presentFragment = `
  precision highp float;
  uniform sampler2D tProcessed;
  uniform float uSourceAspect;
  uniform float uOutputAspect;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    if (uOutputAspect > uSourceAspect) {
      uv.x = (uv.x - 0.5) * (uOutputAspect / uSourceAspect) + 0.5;
    } else {
      uv.y = (uv.y - 0.5) * (uSourceAspect / uOutputAspect) + 0.5;
    }
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.004, 0.004, 0.004, 1.0);
    } else {
      gl_FragColor = texture2D(tProcessed, uv);
    }
  }
`;

class LookRenderer {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.sceneTarget = null;
    this.feedbackTargets = [null, null];
    this.feedbackIndex = 0;
    this.lastCadenceFrame = -1;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: postFragment,
      uniforms: {
        tScene: { value: null },
        tPrevious: { value: null },
        uSourceSize: { value: new THREE.Vector2(640, 480) },
        uFrame: { value: 0 },
        uPixelSnap: { value: 0 },
        uColorBits: { value: 8 },
        uDither: { value: 0 },
        uScanlines: { value: 0 },
        uInterlace: { value: 0 },
        uChroma: { value: 0 },
        uNoise: { value: 0 },
        uFeedback: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.presentMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: presentFragment,
      uniforms: {
        tProcessed: { value: null },
        uSourceAspect: { value: 4 / 3 },
        uOutputAspect: { value: 4 / 3 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(geometry, this.postMaterial));
    this.presentScene = new THREE.Scene();
    this.presentScene.add(new THREE.Mesh(geometry.clone(), this.presentMaterial));
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  ensureTargets(width, height) {
    if (this.width === width && this.height === height && this.sceneTarget) return;
    this.releaseTargets();
    const options = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    };
    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, options);
    this.feedbackTargets = [
      new THREE.WebGLRenderTarget(width, height, { ...options, depthBuffer: false }),
      new THREE.WebGLRenderTarget(width, height, { ...options, depthBuffer: false }),
    ];
    this.width = width;
    this.height = height;
    this.feedbackIndex = 0;
    this.clearFeedback();
  }

  clearFeedback() {
    const previousColor = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const previous = renderer.getRenderTarget();
    renderer.setClearColor(0x000000, 1);
    this.feedbackTargets.forEach((target) => {
      if (!target) return;
      renderer.setRenderTarget(target);
      renderer.clear();
    });
    renderer.setRenderTarget(previous);
    renderer.setClearColor(previousColor, previousAlpha);
  }

  shouldRender(project, timeSeconds) {
    const fps = project.lookCadence === 'display' ? 0 : Number(project.lookCadence);
    if (!fps || !Number.isFinite(fps)) return true;
    const cadenceFrame = Math.floor(timeSeconds * fps + 1e-6);
    if (cadenceFrame === this.lastCadenceFrame) return false;
    this.lastCadenceFrame = cadenceFrame;
    return true;
  }

  resetCadence() {
    this.lastCadenceFrame = -1;
  }

  render(scene, camera, project, {
    frameIndex = 0,
    force = false,
  } = {}) {
    const active = force || project.previewOutput;
    if (!active) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return renderer.domElement;
    }

    const outputWidth = renderer.domElement.width;
    const outputHeight = renderer.domElement.height;
    const internal = getInternalSize(project, outputWidth, outputHeight);
    this.ensureTargets(internal.width, internal.height);

    const originalAspect = camera.isPerspectiveCamera ? camera.aspect : null;
    if (camera.isPerspectiveCamera) {
      camera.aspect = internal.width / internal.height;
      camera.updateProjectionMatrix();
    }
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);
    if (camera.isPerspectiveCamera) {
      camera.aspect = originalAspect;
      camera.updateProjectionMatrix();
    }

    const previousTarget = this.feedbackTargets[this.feedbackIndex];
    const nextIndex = 1 - this.feedbackIndex;
    const nextTarget = this.feedbackTargets[nextIndex];
    const uniforms = this.postMaterial.uniforms;
    uniforms.tScene.value = this.sceneTarget.texture;
    uniforms.tPrevious.value = previousTarget.texture;
    uniforms.uSourceSize.value.set(internal.width, internal.height);
    uniforms.uFrame.value = frameIndex;
    uniforms.uPixelSnap.value = project.lookPixelSnap;
    uniforms.uColorBits.value = project.lookColorBits;
    uniforms.uDither.value = project.lookDither;
    uniforms.uScanlines.value = project.lookScanlines;
    uniforms.uInterlace.value = project.lookInterlace;
    uniforms.uChroma.value = project.lookChroma;
    uniforms.uNoise.value = project.lookNoise;
    uniforms.uFeedback.value = project.lookFeedback;

    renderer.setRenderTarget(nextTarget);
    renderer.clear();
    renderer.render(this.postScene, this.camera);
    this.feedbackIndex = nextIndex;

    this.presentMaterial.uniforms.tProcessed.value = nextTarget.texture;
    this.presentMaterial.uniforms.uSourceAspect.value = internal.width / internal.height;
    this.presentMaterial.uniforms.uOutputAspect.value = outputWidth / outputHeight;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(this.presentScene, this.camera);
    return renderer.domElement;
  }

  releaseTargets() {
    this.sceneTarget?.dispose();
    this.feedbackTargets.forEach((target) => target?.dispose());
    this.sceneTarget = null;
    this.feedbackTargets = [null, null];
    this.width = 0;
    this.height = 0;
  }

  dispose() {
    this.releaseTargets();
    this.postScene.children[0]?.geometry.dispose();
    this.presentScene.children[0]?.geometry.dispose();
    this.postMaterial.dispose();
    this.presentMaterial.dispose();
  }
}

export const lookRenderer = new LookRenderer();
