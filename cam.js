import * as THREE from 'three';

export function cartToSpherical(x, y, z) {
  const distance = Math.sqrt(x * x + y * y + z * z);
  if (distance < 1e-6) return { az: 0, el: 0, dist: 0 };
  const elevation = Math.asin(Math.max(-1, Math.min(1, y / distance))) * 180 / Math.PI;
  let azimuth = Math.atan2(x, z) * 180 / Math.PI;
  if (azimuth < 0) azimuth += 360;
  return {
    az: +azimuth.toFixed(1),
    el: +elevation.toFixed(1),
    dist: +distance.toFixed(2),
  };
}

export function sphericalToCart(azimuth, elevation, distance) {
  const azimuthRadians = azimuth * Math.PI / 180;
  const elevationRadians = elevation * Math.PI / 180;
  const horizontal = Math.cos(elevationRadians);
  return {
    x: distance * horizontal * Math.sin(azimuthRadians),
    y: distance * Math.sin(elevationRadians),
    z: distance * horizontal * Math.cos(azimuthRadians),
  };
}

// Kept only as a config-migration source for pre-v3 projects.
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
  { id: 'hero', label: 'hero' },
  { id: 'overhead', label: 'overhead' },
  { id: 'horizon', label: 'horizon' },
  { id: 'side', label: 'side' },
  { id: 'macro', label: 'macro' },
  { id: 'underslung', label: 'underslung' },
  { id: 'manual', label: 'manual anchor' },
]);

export const CAMERA_MOTIONS = Object.freeze([
  { id: 'still', label: 'still' },
  { id: 'drift', label: 'drift' },
  { id: 'orbit', label: 'orbit' },
  { id: 'pendulum', label: 'pendulum' },
  { id: 'rail', label: 'rail' },
  { id: 'handheld', label: 'handheld' },
]);

const MODE_HERO = Object.freeze({
  bowl: { az: 0, el: 31, dist: 10.7, lookY: -0.5 },
  polar: { az: 0, el: 78, dist: 10, lookY: 0 },
  sphere: { az: 0, el: 0, dist: 12, lookY: 0 },
  wave: { az: 0, el: 8, dist: 11, lookY: 0 },
  topology: { az: 24, el: 14, dist: 11.5, lookY: 0 },
  cathedral: { az: 0, el: 18, dist: 12.5, lookY: 1.2 },
  ribbon: { az: 12, el: 10, dist: 11, lookY: 0 },
  tunnel: { az: 0, el: 0, dist: 9.5, lookY: 0 },
});

export function shotPose(shot, mode, manualAnchor) {
  const hero = MODE_HERO[mode] ?? MODE_HERO.sphere;
  if (shot === 'manual' && manualAnchor) return { ...manualAnchor };
  if (shot === 'auto' || shot === 'hero') return { ...hero };
  if (shot === 'overhead') return { az: hero.az, el: 82, dist: 14, lookY: 0 };
  if (shot === 'horizon') return { az: hero.az, el: 4, dist: 12, lookY: 0 };
  if (shot === 'side') return { az: 90, el: 12, dist: 12.5, lookY: hero.lookY };
  if (shot === 'macro') return { az: 28, el: 18, dist: 5.6, lookY: hero.lookY };
  if (shot === 'underslung') return { az: 12, el: -24, dist: 9, lookY: 1.2 };
  return { ...hero };
}

function motionOffsets(project, time, pose) {
  const amount = project.cameraAmount;
  const speed = project.cameraSpeed;
  const phase = time * speed;
  const result = { x: 0, y: 0, z: 0, az: 0, el: 0 };
  if (project.cameraMotion === 'drift') {
    result.x = Math.sin(phase * 0.73) * amount * 0.6;
    result.y = Math.cos(phase * 0.51) * amount * 0.3;
    result.z = Math.sin(phase * 0.37) * amount * 0.45;
  } else if (project.cameraMotion === 'orbit') {
    result.az = phase * 18 * amount;
  } else if (project.cameraMotion === 'pendulum') {
    result.az = Math.sin(phase) * 24 * amount;
    result.el = Math.sin(phase * 0.47) * 5 * amount;
  } else if (project.cameraMotion === 'rail') {
    result.x = Math.sin(phase * 0.65) * amount * 2.2;
  } else if (project.cameraMotion === 'handheld') {
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
  const base = shotPose(shotOverride ?? project.cameraShot, mode, project.cameraAnchor);
  const { pose, offset } = motionOffsets(project, time, base);
  const cartesian = sphericalToCart(pose.az, pose.el, pose.dist);
  const audio = project.cameraAudio;
  cartesian.x += offset.x;
  cartesian.y += offset.y + (frame?.env?.mid ?? 0) * audio * 1.2;
  cartesian.z += offset.z
    + (frame?.env?.kick ?? 0) * audio * 1.5
    - (frame?.env?.rms ?? 0) * audio * 2
    - (frame?.lfo1 ?? 0) * project.lfoToZoom;
  return {
    position: cartesian,
    lookY: pose.lookY + (frame?.env?.trans ?? 0) * audio * 0.15,
  };
}

export class CameraRig {
  constructor(camera, controls, project) {
    this.camera = camera;
    this.controls = controls;
    this.project = project;
    this.dragging = false;
    this.appliedPosition = new THREE.Vector3();
    this.appliedTarget = new THREE.Vector3();
    this.transition = null;
    this.startPosition = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.endPosition = new THREE.Vector3();
    this.endTarget = new THREE.Vector3();
    this.scratch = new THREE.Vector3();
  }

  beginFrame() {
    this.camera.position.sub(this.appliedPosition);
    this.controls.target.sub(this.appliedTarget);
    this.appliedPosition.set(0, 0, 0);
    this.appliedTarget.set(0, 0, 0);
  }

  selectShot(shot, mode, duration = this.project.cameraTransition) {
    this.beginFrame();
    this.project.cameraShot = shot;
    const pose = shotPose(shot, mode, this.project.cameraAnchor);
    const position = sphericalToCart(pose.az, pose.el, pose.dist);
    this.startPosition.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);
    this.endPosition.set(position.x, position.y, position.z);
    this.endTarget.set(0, pose.lookY, 0);
    this.transition = {
      elapsed: 0,
      duration: Math.max(0.01, duration),
    };
  }

  captureManual() {
    this.beginFrame();
    const spherical = cartToSpherical(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    );
    this.project.cameraAnchor = {
      ...spherical,
      lookY: +this.controls.target.y.toFixed(2),
    };
    this.project.cameraShot = 'manual';
    this.transition = null;
  }

  update(dt, time, frame, mode) {
    if (this.transition) {
      this.transition.elapsed += dt;
      const linear = Math.min(1, this.transition.elapsed / this.transition.duration);
      const eased = linear * linear * (3 - 2 * linear);
      this.camera.position.lerpVectors(this.startPosition, this.endPosition, eased);
      this.controls.target.lerpVectors(this.startTarget, this.endTarget, eased);
      if (linear >= 1) this.transition = null;
    }
    if (this.dragging) return;

    const basePose = cartToSpherical(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    );
    const { pose, offset } = motionOffsets(this.project, time, {
      ...basePose,
      lookY: this.controls.target.y,
    });
    const moved = sphericalToCart(pose.az, pose.el, pose.dist);
    this.appliedPosition.set(
      moved.x - this.camera.position.x + offset.x,
      moved.y - this.camera.position.y + offset.y,
      moved.z - this.camera.position.z + offset.z,
    );
    const audio = this.project.cameraAudio;
    this.appliedPosition.y += (frame?.env?.mid ?? 0) * audio * 1.2;
    this.appliedPosition.z += (frame?.env?.kick ?? 0) * audio * 1.5
      - (frame?.env?.rms ?? 0) * audio * 2
      - (frame?.lfo1 ?? 0) * this.project.lfoToZoom;
    this.appliedTarget.y = (frame?.env?.trans ?? 0) * audio * 0.15;
    this.camera.position.add(this.appliedPosition);
    this.controls.target.add(this.appliedTarget);
    this.camera.lookAt(this.controls.target);
  }
}
