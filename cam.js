/**
 * cam.js — Camera state machine (pure, no Three.js dependency).
 * Separates three concerns that were previously collapsed into one boolean:
 *   1. Is the user orbit-dragging?        → camState.dragging
 *   2. Is the camera locked from audio?   → camState.locked
 *   3. Is the Director drawer open?       → camState.directorOpen
 */

/* ── State ────────────────────────────────────────────────────── */
export const camState = {
  locked:         false,    // user explicitly locked camera from audio modulation
  dragging:       false,    // user is currently orbit-dragging
  sliderDragging: false,    // a director slider is being dragged
  programmatic:   false,    // programmatic update in progress (suppress change handler)
  directorOpen:   false,    // Director drawer is open (pause audio-reactive modulation)
  activePresetIdx: 0,       // index into P.camStyles array
};

/* ── Spherical ↔ Cartesian helpers ────────────────────────────── */

/**
 * Convert Cartesian camera position to spherical coordinates.
 * @returns {{ az: number, el: number, dist: number }}
 *   az  = azimuth in degrees [0, 360)
 *   el  = elevation in degrees (angle above XZ plane)
 *   dist = distance from origin
 */
export function cartToSpherical(x, y, z) {
  const dist = Math.sqrt(x * x + y * y + z * z);
  if (dist < 1e-6) return { az: 0, el: 0, dist: 0 };
  const el = Math.asin(Math.max(-1, Math.min(1, y / dist))) * (180 / Math.PI);
  let az = Math.atan2(x, z) * (180 / Math.PI);
  if (az < 0) az += 360;
  return { az: +az.toFixed(1), el: +el.toFixed(1), dist: +dist.toFixed(2) };
}

/**
 * Convert spherical camera coordinates to Cartesian position.
 * @param {number} az  Azimuth in degrees
 * @param {number} el  Elevation in degrees
 * @param {number} dist Distance from origin
 * @returns {{ x: number, y: number, z: number }}
 */
export function sphericalToCart(az, el, dist) {
  const azR = az * (Math.PI / 180);
  const elR = el * (Math.PI / 180);
  const cosEl = Math.cos(elR);
  return {
    x: +(dist * cosEl * Math.sin(azR)).toFixed(3),
    y: +(dist * Math.sin(elR)).toFixed(3),
    z: +(dist * cosEl * Math.cos(azR)).toFixed(3),
  };
}

/* ── Default preset positions (spherical) ─────────────────────── */
export const PRESET_DEFAULTS = [
  { id: 'normal',  name: 'Normal',   az: 0,  el: 37, dist: 10.7, lookY: -0.5 },
  { id: 'distant', name: 'Distant',  az: 0,  el: 32, dist: 21.0, lookY: -0.5 },
  { id: 'birds',   name: 'Birds-eye',az: 0,  el: 82, dist: 15.1, lookY: 0    },
  { id: 'worms',   name: 'Worms-eye',az: 0,  el: 5,  dist: 6.0,  lookY: 2.0  },
  { id: 'side',    name: 'Side',     az: 90, el: 9,  dist: 12.2, lookY: 0    },
  { id: 'oblique', name: 'Oblique',  az: 45, el: 35, dist: 13.9, lookY: -0.5 },
];

/* ── Queries ──────────────────────────────────────────────────── */

/** Should applyModulation() drive the camera this frame? */
export function shouldModulate() {
  return !camState.locked && !camState.dragging && !camState.directorOpen;
}

/** Should the controls.change handler write back to the active preset? */
export function shouldWriteBack() {
  return camState.dragging && !camState.programmatic;
}

/** Should OrbitControls accept input right now? */
export function shouldControlsBeEnabled() {
  return !camState.sliderDragging;
}

/* ── Transitions ──────────────────────────────────────────────── */

export function startDrag() {
  camState.dragging = true;
}

export function endDrag() {
  camState.dragging = false;
}

export function toggleLock() {
  camState.locked = !camState.locked;
  return camState.locked;
}

export function setLocked(val) {
  camState.locked = !!val;
}

export function setDirectorOpen(val) {
  camState.directorOpen = !!val;
}

export function startSliderDrag() {
  camState.sliderDragging = true;
}

export function endSliderDrag() {
  camState.sliderDragging = false;
}

export function beginProgrammatic() {
  camState.programmatic = true;
}

export function endProgrammatic() {
  camState.programmatic = false;
}

/** Reset all transient state (camera reset button). */
export function resetAll() {
  camState.locked         = false;
  camState.dragging       = false;
  camState.sliderDragging = false;
  camState.programmatic   = false;
  camState.directorOpen   = false;
}
