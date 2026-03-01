/**
 * cam.js — Camera state machine (pure, no Three.js dependency).
 * Separates three concerns that were previously collapsed into one boolean:
 *   1. Is the user orbit-dragging?        → camState.dragging
 *   2. Is the camera locked from audio?   → camState.locked
 *   3. Are orbit controls enabled?        → derived from camState.sliderDragging
 */

/* ── State ────────────────────────────────────────────────────── */
export const camState = {
  locked:         false,    // user explicitly locked camera from audio modulation
  dragging:       false,    // user is currently orbit-dragging
  sliderDragging: false,    // a director slider is being dragged
  programmatic:   false,    // programmatic update in progress (suppress change handler)
  activeStyle:    'normal', // which P.camStyles key is active
};

/* ── Default positions ────────────────────────────────────────── */
export const VIS_DEFAULTS = {
  bowl:   { x: 0, y: 5.5, z: 9.0, lookY: -0.5 },
  polar:  { x: 0, y: 9,   z: 0,   lookY: 0    },
  sphere: { x: 0, y: 0,   z: 12,  lookY: 0    },
  wave:   { x: 0, y: 1,   z: 10,  lookY: 0    },
};

export const STYLE_DEFAULTS = {
  normal:  { x: 0,    y: 5.5,  z: 9.0,  lookY: -0.5 },
  distant: { x: 0,    y: 11.0, z: 18.0, lookY: -0.5 },
  birds:   { x: 0,    y: 15.0, z: 1.0,  lookY: 0    },
  worms:   { x: 0,    y: 0.5,  z: 6.0,  lookY: 2.0  },
  side:    { x: 12.0, y: 2.0,  z: 0,    lookY: 0    },
  oblique: { x: 8.0,  y: 8.0,  z: 8.0,  lookY: -0.5 },
};

export const STYLE_LIST = ['normal', 'distant', 'birds', 'worms', 'side', 'oblique'];

/* ── Queries ──────────────────────────────────────────────────── */

/** Should applyModulation() drive the camera this frame? */
export function shouldModulate() {
  return !camState.locked && !camState.dragging;
}

/** Should the controls.change handler write back to P.camStyles? */
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
}

/* ── Data helpers ─────────────────────────────────────────────── */

/** Default camera for a vis mode. Returns a copy. */
export function getVisDefault(mode) {
  const d = VIS_DEFAULTS[mode] || VIS_DEFAULTS.bowl;
  return { ...d };
}

/** Default style preset. Returns a copy, or null for unknown. */
export function getStyleDefault(name) {
  const d = STYLE_DEFAULTS[name];
  return d ? { ...d } : null;
}
