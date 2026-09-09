import * as THREE from 'three';
import { createGameCartridge } from './GameCartridge.js';
import { createVinylRecord } from './VinylRecord.js';
import { createCassetteTape } from './CassetteTape.js';
import { createFloppyDisk } from './FloppyDisk.js';

export const RETRO_ITEMS = Object.freeze([
  { id: 'cartridge', label: 'game cartridge', model: 'Cartridge' },
  { id: 'vinyl', label: 'vinyl record', model: 'Vinyl' },
  { id: 'cassette', label: 'cassette tape', model: 'Cassette' },
  { id: 'floppy', label: 'floppy disk', model: 'Floppy' },
]);

export class ItemSceneManager {
  constructor(scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ItemCenterpieceRoot';
    this.rootGroup.visible = false;
    this.scene.add(this.rootGroup);

    // Dedicated lighting rig for 3D retro assets
    this.lightRig = new THREE.Group();
    this.lightRig.name = 'ItemLightingRig';
    
    // Key light (warm high front-left)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(4, 6, 5);
    this.lightRig.add(keyLight);

    // Rim light (cool cyan-tinted rim from behind)
    const rimLight = new THREE.DirectionalLight(0x88ccff, 2.8);
    rimLight.position.set(-5, 3, -4);
    this.lightRig.add(rimLight);

    // Ambient light
    const ambLight = new THREE.AmbientLight(0xffffff, 1.6);
    this.lightRig.add(ambLight);

    this.rootGroup.add(this.lightRig);

    // Asset map
    this.items = {};
    this.customTexture = null;

    // Instantiate models
    this.items.cartridge = createGameCartridge();
    this.items.vinyl = createVinylRecord();
    this.items.cassette = createCassetteTape();
    this.items.floppy = createFloppyDisk();

    for (const [id, item] of Object.entries(this.items)) {
      item.group.visible = false;
      this.rootGroup.add(item.group);
    }

    this.activeId = 'cartridge';
    this.items.cartridge.group.visible = true;

    this.spinAngle = 0;
    this.glitchTimer = 0;
    this.glitchIntensity = 0;
    this.textureLoader = new THREE.TextureLoader();
  }

  setActiveItem(id) {
    if (!this.items[id]) return;
    this.activeId = id;
    for (const [itemId, item] of Object.entries(this.items)) {
      item.group.visible = (itemId === id);
    }
    if (this.customTexture) {
      this.items[id].setLabelTexture(this.customTexture);
    }
  }

  setVisible(visible) {
    this.rootGroup.visible = visible;
  }

  loadCustomImage(imageSrc) {
    if (!imageSrc) return;
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        imageSrc,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          if (this.customTexture) this.customTexture.dispose();
          this.customTexture = tex;
          if (this.items[this.activeId]) {
            this.items[this.activeId].setLabelTexture(tex);
          }
          resolve(tex);
        },
        undefined,
        (err) => {
          console.warn('[ItemSceneManager] Image load warning:', err);
          reject(err);
        }
      );
    });
  }

  async loadDaeModel(fileOrUrl, filename = 'custom.dae') {
    const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
    const loader = new ColladaLoader();
    const isBlob = typeof fileOrUrl !== 'string';
    const url = isBlob ? URL.createObjectURL(fileOrUrl) : fileOrUrl;

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (collada) => {
          if (isBlob) URL.revokeObjectURL(url);

          // Cleanly dispose previous custom model if any
          if (this.items.custom) {
            this.disposeItem(this.items.custom);
            this.rootGroup.remove(this.items.custom.group);
            delete this.items.custom;
          }

          const modelScene = collada.scene;
          const box = new THREE.Box3().setFromObject(modelScene);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scaleFactor = 3.8 / maxDim;

          const group = new THREE.Group();
          group.name = `DaeModel_${filename}`;

          modelScene.scale.setScalar(scaleFactor);
          modelScene.position.set(
            -center.x * scaleFactor,
            -center.y * scaleFactor,
            -center.z * scaleFactor
          );
          group.add(modelScene);

          // Glitch wireframe overlay
          const wireMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
          });

          modelScene.traverse((child) => {
            if (child.isMesh && child.geometry) {
              const wireGeo = new THREE.WireframeGeometry(child.geometry);
              const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
              child.add(wireMesh);
            }
          });

          const customItem = {
            group,
            modelScene,
            wireMat,
            isCustomDae: true,
            filename,
            setLabelTexture: (tex) => {
              modelScene.traverse((child) => {
                if (child.isMesh && child.material) {
                  if (Array.isArray(child.material)) {
                    child.material.forEach((m) => { m.map = tex; m.needsUpdate = true; });
                  } else {
                    child.material.map = tex;
                    child.material.needsUpdate = true;
                  }
                }
              });
            },
          };

          this.items.custom = customItem;
          this.rootGroup.add(group);
          if (this.customTexture) customItem.setLabelTexture(this.customTexture);
          this.setActiveItem('custom');
          resolve(customItem);
        },
        undefined,
        (err) => {
          if (isBlob) URL.revokeObjectURL(url);
          console.warn('[ItemSceneManager] DAE Collada load error:', err);
          reject(err);
        }
      );
    });
  }

  disposeItem(item) {
    if (!item?.group) return;
    item.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }

  update(dt, time, signalFrame, project) {
    if (!this.rootGroup.visible) return;

    const currentItem = this.items[this.activeId];
    if (!currentItem) return;

    const group = currentItem.group;

    // Audio reactivity metrics
    const kick = signalFrame?.env?.kick ?? 0;
    const sub = signalFrame?.env?.sub ?? 0;
    const rms = signalFrame?.env?.rms ?? 0;
    const trans = signalFrame?.env?.transient ?? 0;

    // Spin physics
    let speed = project.itemSpinSpeed ?? 1.0;
    if (project.itemSpinBpmSync && project.bpm) {
      // Rotate 1 full revolution every 4 beats
      const rps = (project.bpm / 60) / 4;
      speed = rps * Math.PI * 2;
      this.spinAngle += speed * dt;
    } else {
      this.spinAngle += speed * 1.5 * dt;
    }

    // Base rotation
    group.rotation.y = this.spinAngle;

    // Audio-reactive wobble / tilt
    const wobbleAmt = project.itemWobble ?? 0.5;
    const wobblePitch = Math.sin(time * 2.2) * 0.12 * wobbleAmt + (kick * 0.15 * wobbleAmt);
    const wobbleRoll = Math.cos(time * 1.8) * 0.10 * wobbleAmt + (sub * 0.12 * wobbleAmt);
    group.rotation.x = wobblePitch;
    group.rotation.z = wobbleRoll;

    // Rhythmic bounce on kick hits
    const bounce = kick * 0.3 * wobbleAmt;
    group.position.y = bounce;

    // Vinyl/Cassette specific animations
    if (this.activeId === 'cassette' && currentItem.spoolL && currentItem.spoolR) {
      currentItem.spoolL.rotation.z += (speed + kick * 2) * dt * 4;
      currentItem.spoolR.rotation.z += (speed + kick * 2) * dt * 4;
    }

    // Audio-reactive Glitch Engine
    const glitchSetting = project.itemGlitch ?? 0.3;
    const glitchTrigger = trans > 0.6 || kick > 0.7 || Math.random() < (0.015 * glitchSetting);

    if (glitchTrigger && glitchSetting > 0) {
      this.glitchIntensity = Math.min(1.0, this.glitchIntensity + 0.5 * glitchSetting);
    } else {
      this.glitchIntensity = Math.max(0, this.glitchIntensity - dt * 2.5);
    }

    // Apply wireframe holographic glitch flash
    if (currentItem.wireMat) {
      currentItem.wireMat.opacity = this.glitchIntensity * 0.85;
    }

    // Mesh vertex jitter / positional tearing during glitch
    if (this.glitchIntensity > 0.15) {
      const jitterX = (Math.random() - 0.5) * 0.15 * this.glitchIntensity;
      const jitterZ = (Math.random() - 0.5) * 0.15 * this.glitchIntensity;
      group.position.x = jitterX;
      group.position.z = jitterZ;
    } else {
      group.position.x = 0;
      group.position.z = 0;
    }
  }
}

let _sharedItemScene = null;
export function getOrCreateItemScene(scene) {
  if (!_sharedItemScene && scene) {
    _sharedItemScene = new ItemSceneManager(scene);
  }
  return _sharedItemScene;
}

