/**
 * skybox.js — Procedural retro skybox environments with matched atmospheric lighting.
 *
 * Provides curated 80s/90s/cyber skybox atmospheres rendered onto equirectangular
 * reflection backgrounds with matched ambient, key, and rim lighting rigs.
 * Also supports custom image uploads with auto-tone detection and lighting scaling.
 */
import * as THREE from 'three';

/* ── Skybox Presets ────────────────────────────────────────── */
export const SKYBOX_PRESETS = Object.freeze([
  {
    id: 'void',
    label: 'minimal void',
    ambientColor: 0xffffff,
    ambientIntensity: 1.5,
    dirColor: 0xfff8ee,
    dirIntensity: 1.8,
    fillColor: 0x88bbff,
    fillIntensity: 0.9,
    render: null,
  },
  {
    id: 'neon-grid',
    label: 'neon grid 80s',
    ambientColor: 0xd050a0,
    ambientIntensity: 1.6,
    dirColor: 0x00ffff,
    dirIntensity: 2.0,
    fillColor: 0xff0099,
    fillIntensity: 1.8,
    render: renderNeonGrid,
  },
  {
    id: 'sunset-90s',
    label: 'sunset 90s',
    ambientColor: 0xff8844,
    ambientIntensity: 1.7,
    dirColor: 0xffd166,
    dirIntensity: 2.2,
    fillColor: 0x9c27b0,
    fillIntensity: 1.4,
    render: renderSunset90s,
  },
  {
    id: 'deep-space',
    label: 'deep space',
    ambientColor: 0x336699,
    ambientIntensity: 1.4,
    dirColor: 0x99ccff,
    dirIntensity: 2.0,
    fillColor: 0x553388,
    fillIntensity: 1.2,
    render: renderDeepSpace,
  },
  {
    id: 'sgi-slate',
    label: 'SGI workstation',
    ambientColor: 0xa0c0d0,
    ambientIntensity: 1.6,
    dirColor: 0xffffff,
    dirIntensity: 2.0,
    fillColor: 0x608090,
    fillIntensity: 1.0,
    render: renderSgiSlate,
  },
  {
    id: 'cyber-green',
    label: 'cyber CRT green',
    ambientColor: 0x20aa50,
    ambientIntensity: 1.7,
    dirColor: 0x44ff88,
    dirIntensity: 2.2,
    fillColor: 0x004422,
    fillIntensity: 1.2,
    render: renderCyberGreen,
  },
  {
    id: 'custom',
    label: 'custom image',
    ambientColor: 0xffffff,
    ambientIntensity: 1.5,
    dirColor: 0xffffff,
    dirIntensity: 1.8,
    fillColor: 0xaaccff,
    fillIntensity: 1.0,
    render: null,
  },
]);

const PRESET_MAP = Object.freeze(
  Object.fromEntries(SKYBOX_PRESETS.map((p) => [p.id, p]))
);

/* ── Procedural Equirectangular Canvas Generators ──────────── */

function createCanvas(w = 1024, h = 512) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function renderNeonGrid(ctx, w, h) {
  // Upper sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  grad.addColorStop(0, '#04000c');
  grad.addColorStop(0.5, '#1e0538');
  grad.addColorStop(1, '#5a0c60');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.5);

  // Deterministic stars in upper hemisphere
  for (let i = 0; i < 140; i++) {
    const sx = (i * 137.5) % w;
    const sy = (i * 73.1) % (h * 0.46);
    const rad = (i % 5 === 0) ? 1.5 : (i % 2 === 0 ? 1.0 : 0.6);
    const alpha = 0.35 + ((i * 17) % 60) / 100;
    ctx.fillStyle = i % 3 === 0 ? `rgba(0, 255, 240, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizon glow line
  const horizY = h * 0.5;
  const glowGrad = ctx.createLinearGradient(0, horizY - 14, 0, horizY + 14);
  glowGrad.addColorStop(0, 'rgba(255, 0, 128, 0)');
  glowGrad.addColorStop(0.5, 'rgba(255, 20, 160, 0.9)');
  glowGrad.addColorStop(1, 'rgba(0, 255, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, horizY - 14, w, 28);

  // Ground plane
  const floorGrad = ctx.createLinearGradient(0, horizY, 0, h);
  floorGrad.addColorStop(0, '#060012');
  floorGrad.addColorStop(1, '#020006');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, horizY, w, h * 0.5);

  // Perspective radial grid lines radiating from horizon
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
  ctx.lineWidth = 1;
  const vSteps = 32;
  for (let i = 0; i <= vSteps; i++) {
    const bottomX = (i / vSteps) * w;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, horizY);
    ctx.lineTo(bottomX, h);
    ctx.stroke();
  }

  // Horizontal grid lines getting progressively wider
  ctx.strokeStyle = 'rgba(255, 0, 150, 0.3)';
  for (let i = 1; i <= 14; i++) {
    const t = Math.pow(i / 14, 2.2);
    const lineY = horizY + t * (h * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.stroke();
  }
}

function renderSunset90s(ctx, w, h) {
  // Sunset sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.52);
  grad.addColorStop(0, '#0a0218');
  grad.addColorStop(0.25, '#220836');
  grad.addColorStop(0.5, '#6a124c');
  grad.addColorStop(0.75, '#c83818');
  grad.addColorStop(0.92, '#ff8000');
  grad.addColorStop(1, '#ffd040');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h * 0.52);

  // Iconic synthwave striped sun at horizon center
  const sunX = w * 0.5;
  const sunY = h * 0.52;
  const sunR = 85;
  const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY);
  sunGrad.addColorStop(0, '#ffee55');
  sunGrad.addColorStop(1, '#e60067');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, Math.PI, 0, false);
  ctx.fill();

  // Horizontal cutout stripes across the sun
  ctx.fillStyle = '#10041c';
  for (let b = 1; b <= 6; b++) {
    const barY = sunY - (b * 11);
    const barH = 2 + (6 - b) * 0.7;
    ctx.fillRect(sunX - sunR, barY, sunR * 2, barH);
  }

  // Lower reflective floor
  const floorGrad = ctx.createLinearGradient(0, h * 0.52, 0, h);
  floorGrad.addColorStop(0, '#12041c');
  floorGrad.addColorStop(0.3, '#1c0828');
  floorGrad.addColorStop(1, '#06010a');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h * 0.52, w, h * 0.48);

  // Warm sun reflection ripples
  for (let r = 1; r <= 12; r++) {
    const ripY = h * 0.52 + Math.pow(r / 12, 1.8) * (h * 0.45);
    const ripW = 120 + r * 25;
    ctx.fillStyle = `rgba(255, 140, 20, ${Math.max(0, 0.38 - (r * 0.025))})`;
    ctx.fillRect(sunX - ripW * 0.5, ripY, ripW, 2 + r * 0.3);
  }
}

function renderDeepSpace(ctx, w, h) {
  // Deep cosmic background
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, w, h);

  // Soft atmospheric nebulae
  const nebulae = [
    { x: w * 0.3, y: h * 0.4, r: 240, c0: 'rgba(0, 100, 220, 0.22)', c1: 'rgba(0, 20, 80, 0)' },
    { x: w * 0.72, y: h * 0.55, r: 280, c0: 'rgba(160, 20, 180, 0.18)', c1: 'rgba(40, 0, 80, 0)' },
    { x: w * 0.52, y: h * 0.25, r: 200, c0: 'rgba(0, 200, 150, 0.14)', c1: 'rgba(0, 40, 30, 0)' },
  ];
  for (const neb of nebulae) {
    const nGrad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
    nGrad.addColorStop(0, neb.c0);
    nGrad.addColorStop(1, neb.c1);
    ctx.fillStyle = nGrad;
    ctx.beginPath();
    ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Starfield with diffraction spikes on bright stars
  for (let i = 0; i < 220; i++) {
    const sx = (i * 277.3) % w;
    const sy = (i * 181.7) % h;
    const rad = (i % 11 === 0) ? 2.0 : (i % 4 === 0 ? 1.2 : 0.7);
    const alpha = 0.35 + ((i * 31) % 60) / 100;
    ctx.fillStyle = i % 5 === 0 ? `rgba(160, 220, 255, ${alpha})` : (i % 7 === 0 ? `rgba(255, 210, 140, ${alpha})` : `rgba(255, 255, 255, ${alpha})`);
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();

    if (i % 11 === 0) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy); ctx.lineTo(sx + 6, sy);
      ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6);
      ctx.stroke();
    }
  }
}

function renderSgiSlate(ctx, w, h) {
  // SGI IRIX 1995 workstation desktop vignette
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 50, w * 0.5, h * 0.5, w * 0.65);
  grad.addColorStop(0, '#22384a');
  grad.addColorStop(0.5, '#14222d');
  grad.addColorStop(1, '#070c10');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function renderCyberGreen(ctx, w, h) {
  // CRT phosphor terminal backdrop
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#000d05');
  grad.addColorStop(0.5, '#002610');
  grad.addColorStop(1, '#000903');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Center phosphor bloom
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, w * 0.5);
  glow.addColorStop(0, 'rgba(0, 255, 100, 0.15)');
  glow.addColorStop(1, 'rgba(0, 40, 15, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Phosphor scanline texture
  ctx.fillStyle = 'rgba(0, 255, 80, 0.04)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1.5);
  }
}

/* ── Skybox Manager ────────────────────────────────────────── */

export class SkyboxManager {
  constructor(targetScene = null, lights = {}) {
    this.scene = targetScene;
    this.ambientLight = lights.ambientLight || null;
    this.dirLight = lights.dirLight || null;
    this.fillLight = lights.fillLight || null;
    this.currentPresetId = 'void';
    this.currentLightTone = 1.0;
    this.customTexture = null;
    this.customAmbientColor = 0xffffff;
    this.cachedTextures = new Map();
    this.textureLoader = new THREE.TextureLoader();
  }

  setTarget(targetScene, lights = {}) {
    this.scene = targetScene;
    if (lights.ambientLight !== undefined) this.ambientLight = lights.ambientLight;
    if (lights.dirLight !== undefined) this.dirLight = lights.dirLight;
    if (lights.fillLight !== undefined) this.fillLight = lights.fillLight;
  }

  getPreset(id) {
    return PRESET_MAP[id] || PRESET_MAP.void;
  }

  applyPreset(presetId = this.currentPresetId, lightTone = this.currentLightTone) {
    const preset = this.getPreset(presetId);
    this.currentPresetId = preset.id;
    this.currentLightTone = Math.max(0.1, Math.min(3.0, Number(lightTone) || 1.0));

    // 1. Scene Background
    if (this.scene) {
      if (preset.id === 'void') {
        const isLight = this.isLight ?? (typeof document !== 'undefined' && document.body?.classList.contains('light-mode'));
        this.scene.background = new THREE.Color(isLight ? 0xf4f5f7 : 0x0d0d0d);
      } else if (preset.id === 'custom') {
        this.scene.background = this.customTexture || new THREE.Color(0x0d0d0d);
      } else {
        let tex = this.cachedTextures.get(preset.id);
        if (!tex && preset.render) {
          const canvas = createCanvas(1024, 512);
          if (canvas) {
            const ctx = canvas.getContext('2d');
            preset.render(ctx, canvas.width, canvas.height);
            tex = new THREE.CanvasTexture(canvas);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            this.cachedTextures.set(preset.id, tex);
          }
        }
        this.scene.background = tex || new THREE.Color(0x0d0d0d);
      }
    }

    // 2. Scene Atmospheric Lighting
    const tone = this.currentLightTone;
    const isLightVoid = preset.id === 'void' && (this.isLight ?? (typeof document !== 'undefined' && document.body?.classList.contains('light-mode')));
    if (this.ambientLight) {
      const ambColor = (preset.id === 'custom' && this.customAmbientColor) ? this.customAmbientColor : preset.ambientColor;
      this.ambientLight.color.setHex(ambColor);
      this.ambientLight.intensity = (isLightVoid ? 2.0 : preset.ambientIntensity) * tone;
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(preset.dirColor);
      this.dirLight.intensity = preset.dirIntensity * tone;
    }
    if (this.fillLight) {
      this.fillLight.color.setHex(isLightVoid ? 0xd0e0f0 : preset.fillColor);
      this.fillLight.intensity = (isLightVoid ? 1.1 : preset.fillIntensity) * tone;
    }
  }

  setTheme(isLight) {
    this.isLight = Boolean(isLight);
    if (this.currentPresetId === 'void') {
      const col = this.isLight ? 0xf4f5f7 : 0x0d0d0d;
      if (this.scene) {
        this.scene.background = new THREE.Color(col);
      }
      if (this.ambientLight) {
        this.ambientLight.color.setHex(0xffffff);
        this.ambientLight.intensity = (this.isLight ? 2.0 : 1.5) * this.currentLightTone;
      }
      if (this.dirLight) {
        this.dirLight.color.setHex(this.isLight ? 0xffffff : 0xfff8ee);
        this.dirLight.intensity = (this.isLight ? 1.8 : 1.8) * this.currentLightTone;
      }
      if (this.fillLight) {
        this.fillLight.color.setHex(this.isLight ? 0xd0e0f0 : 0x88bbff);
        this.fillLight.intensity = (this.isLight ? 1.1 : 0.9) * this.currentLightTone;
      }
    }
  }

  setLightTone(tone) {
    this.applyPreset(this.currentPresetId, tone);
  }

  async loadCustomImage(fileOrUrl) {
    const isBlob = typeof fileOrUrl !== 'string';
    const url = isBlob ? URL.createObjectURL(fileOrUrl) : fileOrUrl;

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (tex) => {
          if (isBlob) URL.revokeObjectURL(url);
          tex.mapping = THREE.EquirectangularReflectionMapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          if (this.customTexture) this.customTexture.dispose();
          this.customTexture = tex;

          // Sample dominant tint from image
          try {
            const canvas = createCanvas(1, 1);
            if (canvas && tex.image) {
              const ctx = canvas.getContext('2d');
              ctx.drawImage(tex.image, 0, 0, 1, 1);
              const data = ctx.getImageData(0, 0, 1, 1).data;
              this.customAmbientColor = (data[0] << 16) | (data[1] << 8) | data[2];
            }
          } catch {
            this.customAmbientColor = 0xffffff;
          }

          this.applyPreset('custom', this.currentLightTone);
          resolve(tex);
        },
        undefined,
        (err) => {
          if (isBlob) URL.revokeObjectURL(url);
          console.warn('[SkyboxManager] Custom skybox load error:', err);
          reject(err);
        }
      );
    });
  }

  dispose() {
    for (const tex of this.cachedTextures.values()) {
      tex.dispose();
    }
    this.cachedTextures.clear();
    if (this.customTexture) {
      this.customTexture.dispose();
      this.customTexture = null;
    }
  }
}

export const skyboxManager = new SkyboxManager();
