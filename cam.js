import * as THREE from 'three';

export function cartToSpherical(x, y, z) {
  const distance = Math.sqrt(x * x + y * y + z * z);
  if (distance < 1e-6) return { az: 0, el: 0, dist: 0 };
  const elevation = (Math.asin(Math.max(-1, Math.min(1, y / distance))) * 180) / Math.PI;
  let azimuth = (Math.atan2(x, z) * 180) / Math.PI;
  if (azimuth < 0) azimuth += 360;
  return {
    az: +azimuth.toFixed(1),
    el: +elevation.toFixed(1),
    dist: +distance.toFixed(2),
  };
}

export function sphericalToCart(azimuth, elevation, distance) {
  const azimuthRadians = (azimuth * Math.PI) / 180;
  const elevationRadians = (elevation * Math.PI) / 180;
  const horizontal = Math.cos(elevationRadians);
  return {
    x: distance * horizontal * Math.sin(azimuthRadians),
    y: distance * Math.sin(elevationRadians),
    z: distance * horizontal * Math.cos(azimuthRadians),
  };
}

// Kept for schema migration compatibility
export const PRESET_DEFAULTS = Object.freeze([
  { id: 'normal', name: 'Normal', az: 0, el: 37, dist: 10.7, lookY: -0.5 },
  { id: 'distant', name: 'Distant', az: 0, el: 32, dist: 21, lookY: -0.5 },
  { id: 'birds', name: 'Birds-eye', az: 0, el: 82, dist: 15.1, lookY: 0 },
  { id: 'worms', name: 'Worms-eye', az: 0, el: 5, dist: 6, lookY: 2 },
  { id: 'side', name: 'Side', az: 90, el: 9, dist: 12.2, lookY: 0 },
  { id: 'oblique', name: 'Oblique', az: 45, el: 35, dist: 13.9, lookY: -0.5 },
]);

export const CAMERA_SHOTS = Object.freeze([
  { id: 'auto', label: 'auto frame' },
  { id: 'hero', label: 'hero 3/4' },
  { id: 'overhead', label: 'overhead' },
  { id: 'horizon', label: 'horizon' },
  { id: 'side', label: 'side profile' },
  { id: 'macro', label: 'close-up' },
  { id: 'underslung', label: 'low angle' },
  { id: 'manual', label: 'free orbit' },
]);

export const CAMERA_MOTIONS = Object.freeze([
  { id: 'still', label: 'locked still' },
  { id: 'drift', label: 'cinematic drift' },
  { id: 'orbit', label: 'turntable orbit' },
  { id: 'pendulum', label: 'pendulum arc' },
  { id: 'rail', label: 'tracking rail' },
  { id: 'handheld', label: 'handheld organic' },
]);

const MODE_HERO = Object.freeze({
  bowl: { az: 0, el: 31, dist: 14.5, lookY: -0.5 },
  polar: { az: 0, el: 78, dist: 14.0, lookY: 0 },
  sphere: { az: 0, el: 0, dist: 16.0, lookY: 0 },
  wave: { az: 0, el: 8, dist: 15.0, lookY: 0 },
  topology: { az: 24, el: 14, dist: 15.5, lookY: 0 },
  cathedral: { az: 0, el: 18, dist: 16.5, lookY: 1.2 },
  ribbon: { az: 12, el: 10, dist: 15.0, lookY: 0 },
  tunnel: { az: 0, el: 0, dist: 13.5, lookY: 0 },
});

const ITEM_HERO = Object.freeze({
  cartridge: { az: 28, el: 18, dist: 9.8, lookY: 0.2 },
  vinyl: { az: 20, el: 45, dist: 9.8, lookY: 0.1 },
  cassette: { az: 32, el: 16, dist: 9.6, lookY: 0.15 },
  floppy: { az: 25, el: 22, dist: 9.5, lookY: 0.15 },
  custom: { az: 30, el: 20, dist: 9.8, lookY: 0.2 },
});

export function shotPose(shot, mode, manualAnchor, isItem = false) {
  if (shot === 'manual' && manualAnchor) return { ...manualAnchor };

  const isArtifact = isItem || (mode in ITEM_HERO);
  if (isArtifact) {
    const hero = ITEM_HERO[mode] ?? ITEM_HERO.cartridge;
    if (shot === 'auto' || shot === 'hero') return { ...hero };
    if (shot === 'overhead') return { az: hero.az, el: 85, dist: 14.5, lookY: 0 };
    if (shot === 'horizon') return { az: hero.az, el: 4, dist: 11.5, lookY: 0.2 };
    if (shot === 'side') return { az: 90, el: 10, dist: 12.5, lookY: 0.1 };
    if (shot === 'macro') return { az: 22, el: 14, dist: 6.5, lookY: 0.2 };
    if (shot === 'underslung') return { az: 15, el: -22, dist: 11.0, lookY: 0.5 };
    return { ...hero };
  }

  const hero = MODE_HERO[mode] ?? MODE_HERO.sphere;
  if (shot === 'auto' || shot === 'hero') return { ...hero };
  if (shot === 'overhead') return { az: hero.az, el: 82, dist: 18.0, lookY: 0 };
  if (shot === 'horizon') return { az: hero.az, el: 4, dist: 16.0, lookY: 0 };
  if (shot === 'side') return { az: 90, el: 12, dist: 16.5, lookY: hero.lookY };
  if (shot === 'macro') return { az: 28, el: 18, dist: 8.5, lookY: hero.lookY };
  if (shot === 'underslung') return { az: 12, el: -24, dist: 13.5, lookY: 1.2 };
  return { ...hero };
}

function motionOffsets(project, time, pose) {
  const amount = project?.cameraAmount ?? 0.35;
  const speed = project?.cameraSpeed ?? 0.35;
  const phase = time * speed;
  const result = { x: 0, y: 0, z: 0, az: 0, el: 0 };

  if (project?.cameraMotion === 'drift') {
    result.x = Math.sin(phase * 0.73) * amount * 0.6;
    result.y = Math.cos(phase * 0.51) * amount * 0.3;
    result.z = Math.sin(phase * 0.37) * amount * 0.45;
  } else if (project?.cameraMotion === 'orbit') {
    result.az = phase * 18 * amount;
  } else if (project?.cameraMotion === 'pendulum') {
    result.az = Math.sin(phase) * 24 * amount;
    result.el = Math.sin(phase * 0.47) * 5 * amount;
  } else if (project?.cameraMotion === 'rail') {
    result.x = Math.sin(phase * 0.65) * amount * 2.2;
  } else if (project?.cameraMotion === 'handheld') {
    result.x = (Math.sin(phase * 13.7) + Math.sin(phase * 7.1)) * amount * 0.055;
    result.y = (Math.cos(phase * 11.9) + Math.sin(phase * 5.3)) * amount * 0.04;
    result.az = Math.sin(phase * 9.7) * amount * 0.45;
  }

  return {
    pose: {
      ...pose,
      az: pose.az + result.az,
      el: pose.el + result.el,
    },
    offset: result,
  };
}

export function proceduralCameraPose(project, mode, time, frame, shotOverride) {
  const isItem = project?.visualCategory === 'item' || (mode in ITEM_HERO);
  const base = shotPose(shotOverride ?? project?.cameraShot, mode, project?.cameraAnchor, isItem);
  const { pose, offset } = motionOffsets(project, time, base);
  const cartesian = sphericalToCart(pose.az, pose.el, pose.dist);
  const audio = project?.cameraAudio ?? 0.45;

  cartesian.x += offset.x;
  cartesian.y += offset.y + (frame?.env?.mid ?? 0) * audio * 1.2;
  cartesian.z += offset.z
    + (frame?.env?.kick ?? 0) * audio * 1.5
    - (frame?.env?.rms ?? 0) * audio * 2
    - (frame?.lfo1 ?? 0) * (project?.lfoToZoom ?? 0);

  return {
    position: cartesian,
    lookY: pose.lookY + (frame?.env?.trans ?? 0) * audio * 0.15,
  };
}

/**
 * Robust, smooth cinematic camera director that coordinates with OrbitControls
 * without coordinate drift or desync.
 */
export class CameraRig {
  constructor(camera, controls, project) {
    this.camera = camera;
    this.controls = controls;
    this.project = project;
    this.dragging = false;

    // Base coordinates
    this.currentPose = { az: 0, el: 15, dist: 16.0, lookY: 0 };
    this.targetPose = { az: 0, el: 15, dist: 16.0, lookY: 0 };

    this.transition = null;
    this.audioPulse = 0;

    // Auto-director state
    this.autoDirector = false;
    this.lastCutTime = 0;
    this.autoSequence = ['hero', 'orbit', 'macro', 'horizon', 'hero', 'underslung', 'overhead'];
    this.autoIndex = 0;

    // Scratch vectors to prevent per-frame garbage
    this._vTargetPos = new THREE.Vector3();
    this._vTargetLook = new THREE.Vector3();
    this._vMotionOffset = new THREE.Vector3();

    // Hook OrbitControls interaction to seamlessly sync manual drag and zoom
    if (this.controls) {
      this.controls.enableZoom = true;
      this.controls.minDistance = 2.0;
      this.controls.maxDistance = 80.0;

      this.controls.addEventListener('start', () => {
        this.dragging = true;
      });
      this.controls.addEventListener('change', () => {
        if (this.dragging) {
          const relX = this.camera.position.x - (this.controls.target.x || 0);
          const relY = this.camera.position.y - (this.controls.target.y || 0);
          const relZ = this.camera.position.z - (this.controls.target.z || 0);
          const spherical = cartToSpherical(relX, relY, relZ);
          this.currentPose.az = spherical.az;
          this.currentPose.el = spherical.el;
          this.currentPose.dist = spherical.dist;
          this.targetPose.az = spherical.az;
          this.targetPose.el = spherical.el;
          this.targetPose.dist = spherical.dist;
        }
      });
      this.controls.addEventListener('end', () => {
        this.dragging = false;
        this.captureManual();
      });

      // Handle wheel zoom directly on domElement to ensure responsive zooming
      if (this.controls.domElement) {
        this.controls.domElement.addEventListener('wheel', (e) => {
          const factor = e.deltaY < 0 ? 0.90 : 1.10;
          this.zoomBy(factor);
        }, { passive: true });
      }
    }
  }

  zoomBy(factor) {
    if (!this.project) return;
    const currentDist = this.currentPose.dist;
    const newDist = Math.max(2.5, Math.min(80.0, currentDist * factor));
    this.currentPose.dist = newDist;
    this.targetPose.dist = newDist;
    this.project.cameraShot = 'manual';
    if (!this.project.cameraAnchor) {
      this.project.cameraAnchor = { ...this.currentPose };
    }
    this.project.cameraAnchor.dist = newDist;
    this.transition = null;
  }

  beginFrame() {
    // No-op for backwards compatibility; state is maintained cleanly
  }

  selectShot(shot, mode, duration = this.project?.cameraTransition ?? 0.8, isItem = false) {
    if (!this.project) return;
    this.project.cameraShot = shot;
    const pose = shotPose(shot, mode, this.project.cameraAnchor, isItem);
    this.targetPose = { ...pose };

    const startSpherical = cartToSpherical(
      this.camera.position.x - (this.controls?.target.x ?? 0),
      this.camera.position.y - (this.controls?.target.y ?? 0),
      this.camera.position.z - (this.controls?.target.z ?? 0)
    );

    this.transition = {
      startAz: startSpherical.az,
      startEl: startSpherical.el,
      startDist: startSpherical.dist,
      startLookY: this.controls ? this.controls.target.y : 0,
      targetAz: pose.az,
      targetEl: pose.el,
      targetDist: pose.dist,
      targetLookY: pose.lookY,
      elapsed: 0,
      duration: Math.max(0.01, duration),
    };
  }

  setMotion(motion) {
    if (this.project) {
      this.project.cameraMotion = motion;
    }
  }

  captureManual() {
    if (!this.project || !this.controls) return;
    const relX = this.camera.position.x - this.controls.target.x;
    const relY = this.camera.position.y - this.controls.target.y;
    const relZ = this.camera.position.z - this.controls.target.z;
    const spherical = cartToSpherical(relX, relY, relZ);

    this.project.cameraAnchor = {
      ...spherical,
      lookY: +this.controls.target.y.toFixed(2),
    };
    this.project.cameraShot = 'manual';
    this.currentPose = { ...this.project.cameraAnchor };
    this.targetPose = { ...this.project.cameraAnchor };
    this.transition = null;
  }

  resetToAuto(mode, isItem = false) {
    this.selectShot('auto', mode, this.project?.cameraTransition ?? 0.8, isItem);
  }

  toggleAutoDirector() {
    this.autoDirector = !this.autoDirector;
    return this.autoDirector;
  }

  setFov(fov) {
    if (this.camera && Number.isFinite(fov)) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  getTelemetry() {
    return {
      shot: this.project?.cameraShot ?? 'auto',
      motion: this.project?.cameraMotion ?? 'still',
      az: +this.currentPose.az.toFixed(1),
      el: +this.currentPose.el.toFixed(1),
      dist: +this.currentPose.dist.toFixed(2),
      fov: Math.round(this.camera?.fov ?? this.project?.cameraFov ?? 45),
      lookY: +this.currentPose.lookY.toFixed(2),
      isTransitioning: !!this.transition,
      autoDirector: this.autoDirector,
    };
  }

  update(dt, time, frame, mode, isItem = false) {
    // Keep camera lens FOV aligned with project settings
    if (this.camera && this.project?.cameraFov && Math.abs(this.camera.fov - this.project.cameraFov) > 0.01) {
      this.camera.fov = this.project.cameraFov;
      this.camera.updateProjectionMatrix();
    }

    // If user is actively orbiting with mouse, let OrbitControls drive base position
    if (this.dragging) return;

    // Auto-Director phrase switching (every 8 seconds of continuous time)
    if (this.autoDirector) {
      if (time - this.lastCutTime >= 8.0) {
        this.lastCutTime = time;
        this.autoIndex = (this.autoIndex + 1) % this.autoSequence.length;
        this.selectShot(this.autoSequence[this.autoIndex], mode, 1.2, isItem);
      }
    }

    // 1. Handle shot transitions with smooth easing
    if (this.transition) {
      this.transition.elapsed += dt;
      const progress = Math.min(1, this.transition.elapsed / this.transition.duration);
      // Smooth quintic / smoothstep easing
      const t = progress * progress * (3 - 2 * progress);

      this.currentPose.az = THREE.MathUtils.lerp(this.transition.startAz, this.transition.targetAz, t);
      this.currentPose.el = THREE.MathUtils.lerp(this.transition.startEl, this.transition.targetEl, t);
      this.currentPose.dist = THREE.MathUtils.lerp(this.transition.startDist, this.transition.targetDist, t);
      this.currentPose.lookY = THREE.MathUtils.lerp(this.transition.startLookY, this.transition.targetLookY, t);

      if (progress >= 1) this.transition = null;
    } else if (this.project && this.project.cameraShot !== 'manual') {
      const target = shotPose(this.project.cameraShot, mode, this.project.cameraAnchor, isItem);
      this.currentPose.az = THREE.MathUtils.damp(this.currentPose.az, target.az, 4, dt);
      this.currentPose.el = THREE.MathUtils.damp(this.currentPose.el, target.el, 4, dt);
      this.currentPose.dist = THREE.MathUtils.damp(this.currentPose.dist, target.dist, 4, dt);
      this.currentPose.lookY = THREE.MathUtils.damp(this.currentPose.lookY, target.lookY, 4, dt);
    }

    // 2. Procedural Camera Motion
    const { pose: motionPose, offset } = motionOffsets(this.project || {}, time, this.currentPose);

    // 3. Audio Reactivity (kick pulse & sub bounce)
    const audioScale = this.project?.cameraAudio ?? 0.45;
    const kick = frame?.env?.kick ?? 0;
    const sub = frame?.env?.sub ?? 0;
    const trans = frame?.env?.transient ?? frame?.env?.trans ?? 0;

    // Decay kick pulse smoothly
    this.audioPulse = THREE.MathUtils.damp(this.audioPulse, kick * audioScale, 12, dt);
    const audioDistOffset = -this.audioPulse * 1.5;

    // Convert spherical pose + offsets to Cartesian coordinates
    const cart = sphericalToCart(
      motionPose.az,
      motionPose.el,
      Math.max(1.5, motionPose.dist + audioDistOffset)
    );

    const lookY = motionPose.lookY + (trans * audioScale * 0.12);

    this._vTargetPos.set(
      cart.x + offset.x,
      cart.y + offset.y + (sub * audioScale * 0.6),
      cart.z + offset.z
    );
    this._vTargetLook.set(0, lookY, 0);

    // Smooth camera positioning
    this.camera.position.copy(this._vTargetPos);
    if (this.controls) {
      this.controls.target.copy(this._vTargetLook);
    }
    this.camera.lookAt(this._vTargetLook);
  }
}

// Alias for semantic clarity
export const CameraDirector = CameraRig;

// Window fallback attachment for browser execution & legacy debugging
if (typeof window !== 'undefined') {
  window.CameraRig = CameraRig;
  window.CameraDirector = CameraRig;
}
