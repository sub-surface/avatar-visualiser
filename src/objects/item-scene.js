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
    let daeText = '';
    if (fileOrUrl && typeof fileOrUrl !== 'string') {
      try {
        daeText = await fileOrUrl.text();
      } catch (e) {}
    }

    const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
    const loadingManager = new THREE.LoadingManager();
    // Neutral transparent 1x1 png fallback prevents ERR_FILE_NOT_FOUND when external texture files are omitted
    const fallbackPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    loadingManager.setURLModifier((itemUrl) => {
      if (itemUrl.startsWith('blob:') && (itemUrl.endsWith('.png') || itemUrl.endsWith('.jpg') || itemUrl.endsWith('.jpeg') || itemUrl.endsWith('.tga') || itemUrl.endsWith('.bmp') || itemUrl.endsWith('.webp'))) {
        return fallbackPixel;
      }
      return itemUrl;
    });

    const loader = new ColladaLoader(loadingManager);
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
          this.modelMeshes = [];

          // Parse expected texture filenames from Collada XML
          const expectedFileNames = new Set();
          if (daeText) {
            const initFromMatches = daeText.matchAll(/<init_from>\s*([^<\s\r\n]+)\s*<\/init_from>/gi);
            for (const m of initFromMatches) {
              const fn = m[1].replace(/\\/g, '/').split('/').pop().trim();
              if (fn) expectedFileNames.add(fn);
            }
          }

          // If model was modeled flat on the floor (height Y significantly less than depth Z and width X),
          // default it to standing vertical facing forward (+Z) like the other retro items
          const rawBox = new THREE.Box3().setFromObject(modelScene);
          const rawSize = rawBox.getSize(new THREE.Vector3());
          if (rawSize.y < rawSize.z * 0.75 && rawSize.y < rawSize.x * 0.75) {
            modelScene.rotation.x = Math.PI / 2;
          }

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

          // Ensure every mesh has solid standard material if missing textures
          const defaultMat = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8,
            roughness: 0.55,
            metalness: 0.25,
          });

          modelScene.traverse((child) => {
            if (child.isMesh) {
              this.modelMeshes.push(child);
              if (!child.material) child.material = defaultMat.clone();
              if (child.geometry) {
                const wireGeo = new THREE.WireframeGeometry(child.geometry);
                const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
                child.add(wireMesh);
              }
            }
          });

          // Compile texture slots
          this.textureSlots = [];
          let slotIdx = 0;
          if (expectedFileNames.size > 0) {
            for (const expectedFile of expectedFileNames) {
              const stem = expectedFile.replace(/\.[^.]+$/, '').toLowerCase();
              const matchingMeshes = this.modelMeshes.filter(m => {
                const mName = (m.name || '').toLowerCase();
                const matName = (m.material?.name || '').toLowerCase();
                return mName.includes(stem) || matName.includes(stem) || stem.includes(mName) || stem.includes(matName);
              });
              const targetUuids = matchingMeshes.length
                ? matchingMeshes.map(m => m.uuid)
                : this.modelMeshes.map(m => m.uuid);
              this.textureSlots.push({
                id: `slot_${slotIdx++}`,
                expectedFile,
                name: expectedFile.replace(/\.[^.]+$/, ''),
                assigned: false,
                assignedFile: null,
                previewUrl: null,
                targetMeshUuids: targetUuids,
              });
            }
          } else {
            for (const mesh of this.modelMeshes) {
              const slotName = mesh.material?.name || mesh.name || `mesh_${slotIdx}`;
              this.textureSlots.push({
                id: `slot_${slotIdx++}`,
                expectedFile: `${slotName}.png`,
                name: slotName,
                assigned: false,
                assignedFile: null,
                previewUrl: null,
                targetMeshUuids: [mesh.uuid],
              });
            }
          }

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
          window.dispatchEvent(new CustomEvent('avatar-textures-updated', { detail: { slots: this.textureSlots } }));
          resolve(customItem);
        },
        undefined,
        (err) => {
          console.error('Collada load error:', err);
          if (isBlob) URL.revokeObjectURL(url);
          reject(err);
        }
      );
    });
  }

  getTextureSlots() {
    return this.textureSlots || [];
  }

  autoAssignTextures(fileList) {
    if (!this.textureSlots || !this.textureSlots.length) return 0;
    const files = Array.from(fileList);
    let matchedCount = 0;
    const texLoader = new THREE.TextureLoader();

    const norm = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const file of files) {
      const fileName = file.name;
      const fileStem = fileName.replace(/\.[^.]+$/, '');
      const normFile = norm(fileStem);

      const matchingSlots = this.textureSlots.filter((slot) => {
        const slotFile = slot.expectedFile.toLowerCase();
        if (slotFile === fileName.toLowerCase()) return true;
        const normSlot = norm(slot.name);
        if (normSlot === normFile) return true;
        if (normSlot.length > 2 && normFile.length > 2 && (normSlot.includes(normFile) || normFile.includes(normSlot))) return true;
        return false;
      });

      if (matchingSlots.length > 0) {
        matchedCount++;
        const url = URL.createObjectURL(file);
        texLoader.load(url, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;

          for (const slot of matchingSlots) {
            slot.assigned = true;
            slot.assignedFile = fileName;
            slot.previewUrl = url;

            slot.targetMeshUuids.forEach((uuid) => {
              const mesh = (this.modelMeshes || []).find((m) => m.uuid === uuid);
              if (mesh) {
                if (!mesh.material || mesh.material.isLineBasicMaterial) {
                  mesh.material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
                }
                mesh.material.map = texture;
                mesh.material.needsUpdate = true;
              }
            });
          }
          window.dispatchEvent(new CustomEvent('avatar-textures-updated', { detail: { slots: this.textureSlots } }));
        });
      }
    }

    if (matchedCount > 0) {
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Mapped ${matchedCount} textures to 3D model` }));
    }
    return matchedCount;
  }

  assignTextureToSlot(slotId, file) {
    const slot = (this.textureSlots || []).find((s) => s.id === slotId);
    if (!slot) return;
    const url = URL.createObjectURL(file);
    const texLoader = new THREE.TextureLoader();
    texLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;

      slot.assigned = true;
      slot.assignedFile = file.name;
      slot.previewUrl = url;

      slot.targetMeshUuids.forEach((uuid) => {
        const mesh = (this.modelMeshes || []).find((m) => m.uuid === uuid);
        if (mesh) {
          if (!mesh.material || mesh.material.isLineBasicMaterial) {
            mesh.material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
          }
          mesh.material.map = texture;
          mesh.material.needsUpdate = true;
        }
      });
      window.dispatchEvent(new CustomEvent('avatar-textures-updated', { detail: { slots: this.textureSlots } }));
      window.dispatchEvent(new CustomEvent('avatar-status', { detail: `Assigned: ${file.name}` }));
    });
  }

  clearTextures() {
    if (!this.textureSlots) return;
    const defaultMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d8,
      roughness: 0.55,
      metalness: 0.25,
    });
    this.textureSlots.forEach((slot) => {
      slot.assigned = false;
      slot.assignedFile = null;
      slot.previewUrl = null;
      slot.targetMeshUuids.forEach((uuid) => {
        const mesh = (this.modelMeshes || []).find((m) => m.uuid === uuid);
        if (mesh) {
          mesh.material = defaultMat.clone();
          mesh.material.needsUpdate = true;
        }
      });
    });
    window.dispatchEvent(new CustomEvent('avatar-textures-updated', { detail: { slots: this.textureSlots } }));
    window.dispatchEvent(new CustomEvent('avatar-status', { detail: 'Textures cleared' }));
  }

  getTextureSlots() {
    return this.textureSlots || [];
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

    // Manual rotation offsets (in degrees from user menu)
    const degToRad = Math.PI / 180;
    const manualRotX = (project.itemRotX ?? 0) * degToRad;
    const manualRotY = (project.itemRotY ?? 0) * degToRad;
    const manualRotZ = (project.itemRotZ ?? 0) * degToRad;

    // Use Euler order 'YXZ' so pitch (X) and roll (Z) smoothly tilt the vertically spinning object
    group.rotation.order = 'YXZ';

    // Base rotation + manual offsets
    group.rotation.y = manualRotY + this.spinAngle;

    // Audio-reactive wobble / tilt + manual pitch & roll
    const wobbleAmt = project.itemWobble ?? 0.5;
    const wobblePitch = Math.sin(time * 2.2) * 0.12 * wobbleAmt + (kick * 0.15 * wobbleAmt);
    const wobbleRoll = Math.cos(time * 1.8) * 0.10 * wobbleAmt + (sub * 0.12 * wobbleAmt);
    group.rotation.x = manualRotX + wobblePitch;
    group.rotation.z = manualRotZ + wobbleRoll;

    // Rhythmic bounce on kick hits
    const bounce = kick * 0.3 * wobbleAmt;
    group.position.y = bounce;

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

