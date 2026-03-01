# AVATAR — Audio Visualiser

A modular, real-time 3D audio visualiser inspired by Joy Division's *Unknown Pleasures* aesthetic. WebGL rendering engine, WebCodecs export pipeline, procedural boot sequence, and a deeply reactive parameters system.

---

## Project Structure

```
Avatar/
├── index.html          # Entry point: HTML + CSS + tabbed UI + module wiring
├── engine.js           # Three.js core: renderer, scene, camera, palettes, OrbitControls
├── audio.js            # Stereo Web Audio API: input, dual analysers, LPF/Gain chain
├── cam.js              # Pure camera state machine (no Three.js dep): drag/lock/programmatic flags
├── envelopes.js        # Envelope followers, slew logic, dual BPM LFOs, audio-reactive camera
├── dsp.js              # FFT, Hann windowing, bin mapping (linear / log / dnb)
├── params.js           # 30+ parameters, camStyles, getCols(), localStorage persistence, UI bindings
├── export.js           # Peak detection, morphing render loop, camera drifts (reads P.camStyles)
├── overlay.js          # 2D text compositing for export frames (palette-aware colours)
├── boot.js             # Procedural boot sequence: terminal + 4 canvas animations + ASCII widgets
├── vis/
│   ├── shared.js       # History buffers, A-weighting
│   ├── bowl.js         # Scanline grid with vertex colours + visibility culling
│   ├── polar.js        # Circular geometry with stereo asymmetry
│   ├── sphere.js       # 3D sphere with history ripple and spin
│   └── wave.js         # 3D waterfall waveform
├── Burden.wav          # Default demo track (m0rvidd)
├── Startup.wav         # Boot chord (lowpass 165 Hz, drives visualiser on load)
└── tests.html          # Browser test harness (DSP, geometry, export, camera state, compatibility)
```

---

## Setup & Usage

### Local Development
ES modules require an HTTP server:
```bash
npx serve . --listen 3000
# or double-click serve.bat on Windows
```

### Live / Streaming Mode
- Add a **Browser Source** pointing to `http://localhost:3000?clean` (or `?obs` for backwards compat).
- Select your audio input (loopback, mic, etc.) in the **Audio** tab.
- The `?clean` flag hides all UI chrome; hovering any screen edge reveals that zone's controls.
- Use the **clean mode** button (bottom-left) to toggle mid-session.

### Export Mode
1. Drag and drop any audio file, or use the pre-loaded **Burden.wav**.
2. Adjust envelopes and LFO routing in the **Mod** tab.
3. Toggle **cycle modes** in the **Export** tab for automated morphed transitions.
4. Select a camera style from the quick-select grid or set a custom position with the director sliders.
5. Use the **lock** toggle to hold a manual camera position; unlock to resume audio reactivity.
6. Hit **render video** — output is a dated MP4 in your chosen quality preset.

> **Debugging exports**: open the browser console and call `window.checkExport()` to inspect current column count, parameter state, camera position, and scene geometry.

### Config Persistence
- **Export config** (↓ button): saves all parameters as a `.json` file.
- **Import config** (↑ button): loads a previously exported `.json` and reloads.
- Parameters auto-save to `localStorage` on every change.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle Live / Export mode |
| `1` – `4` | Switch visualisation modes |
| `P` | Toggle parameters panel |
| `F` | Toggle fullscreen |
| `Esc` | Exit clean mode |
| `S` (during boot) | Skip boot sequence |
| `Mouse Left` | Orbit camera |
| `Mouse Right` | Pan camera |
| `Scroll` | Zoom camera |

---

## Features

### Visualisation

- **4 Vis Modes**: Bowl (scanline grid), Polar (circular), Sphere (3D ripple), Wave (waterfall). Switch with `1`–`4`.
- **Stereo Reactivity**: Dual-channel FFT (L/R) produces asymmetrical displacement and stereo-tilt effects.
- **Vertex Colours**: Per-vertex colour interpolation between `colorA` and `colorB` driven by frequency intensity.
- **Visibility Culling**: Bowl rows with negligible bowl factor are skipped entirely (`Line.visible = false`).
- **GPU Memory Hygiene**: All vis-mode tear-down functions dispose Three.js geometries explicitly.

### Camera

- **OrbitControls**: Left-drag to orbit, Right-drag to pan, Scroll to zoom. Controls receive mouse events everywhere the UI chrome is not — fixed-position UI containers use `pointer-events: none` so the canvas beneath is always accessible.
- **Camera State Machine** (`cam.js`): Three previously-conflated concerns are now independent flags:
  - `dragging` — true only while the user is actively orbit-dragging (suppresses audio modulation during drag, clears on release)
  - `locked` — explicitly set by the **lock** button; persists until toggled or a vis mode change
  - `sliderDragging` — true while director sliders are held (disables OrbitControls to prevent conflicts)
  - `programmatic` — set around `applyCamStyle()` and `buildVis()` calls so the `controls.change` handler never corrupts stored presets
- **Director Mode**: Per-style camera position sliders (X, Y, Z, LookY) persisted to `localStorage`.
- **Camera Quick-Select**: 6 named styles (Normal, Distant, Birds-eye, Worms, Side, Oblique) with individual reset-to-default.
- **Camera Preview**: Cycles all 6 styles at 2-second intervals; stops on orbit drag.
- **Audio-Reactive Modulation**: Camera Y/Z driven by RMS, kick, mid envelopes and LFO when not locked or dragging.

### Audio & DSP

- **Frequency Scales**:

  | Scale | Description |
  |-------|-------------|
  | `log` | Logarithmic — dense low-end, sparse highs (default) |
  | `linear` | Equal Hz per column |
  | `dnb` | 25 % sub-bass (40–180 Hz) · 50 % mids (500–6000 Hz) · 25 % treble (6–16 kHz) |

- **Dual BPM-Synced LFOs**:
  - **LFO 1**: Modulates displacement, bowl shape, camera zoom, and opacity.
  - **LFO 2**: Dedicated filter LFO for the Low Pass Filter frequency.
  - Both support `sine`, `square`, `sawtooth`, and `triangle` waveforms.
- **Startup Sound**: `Startup.wav` plays through the shared analyser chain on load (lowpass at 165 Hz), driving the terrain from the first rendered frame.

### Export Pipeline

- **WebCodecs Acceleration**: High-speed MP4 export with H.264 + AAC.
- **Quality Presets**: Standard (12 Mbps), Lossless (25 Mbps), Lo-Fi PS2 (2.5 Mbps with VHS jitter).
- **Aspect Ratios**: 16:9 or 4:3 in horizontal or vertical orientation.
- **Baked Overlays**: Metadata composited per-frame; overlay colours read `--ui-accent-rgb` so exported video text always matches the current UI palette.
- **Shared Position Calculators**: Export and live vis share the same `calc*Pos()` pure functions — identical geometry, no duplication.
- **Export Diagnostics**: `window.checkExport()` in the browser console dumps current params, column count, camera state, and scene object counts.

### UI & Theming

- **8 Colour Presets**: Default slate + ROYGBIV themes. Select via the palette button (bottom-left) — hover to reveal per-colour dot picker.
- **Dark / Light Mode**: Dedicated ☀/☾ toggle.
- **Clean Mode**: Hides all UI chrome for OBS / streaming. All edge zones (top-right, bottom-left, bottom-right) fade in on hover. Activate via `?clean` / `?obs` URL parameter or the bottom-left button; `Esc` exits.
- **Interactive Tooltips**: Detailed descriptions for all parameters in the Mod and Export tabs.
- **Config Export / Import**: ↓/↑ buttons save/load full parameter sets as JSON.
- **Global Randomiser**: One-click parameter exploration (bottom-right) preserving audio stability.
- **First-Visit Onboarding Glow**: Infobox pulses on first load only (localStorage-gated).

### Boot Sequence

- **Procedural terminal animation** inspired by 90s proprietary workstations (SGI, NeXT, PlayStation) — unique each load, theme-aware, skippable with `Space`.
- **4 canvas animations** chosen randomly: terrain materialise, waveform reveal, grid pulse, spectrum bars.
- **ASCII widgets**: Random decorative widget before the BIOS POST section — oscilloscope scan-line (`_scopePulse`), growing ASCII tree (`_branchTree`), or reverbing echo text (`_echoText`).
- **Fast Boot**: Optional toggle in Export → Boot section. Skips the full animation — shows landing card + 5 punchy BIOS lines then launches immediately. Reads `localStorage` before `P` loads.
- **Animated Favicon**: Live 12 fps wireframe sphere spins in the browser tab, drawn to a 32 × 32 canvas.

---

## Architecture Notes

- **`getCols()`** — single source of truth for column count (`Math.max(2, P.complexity * 32)`). Exported from `params.js`; all vis modules and export import from there, never inline.
- **`calc*Pos()` pure functions** — each vis module exports a stateless position calculator (`calcBowlPos`, `calcPolarPos`, `calcSpherePos`, `calcWavePos`). The export pipeline imports these directly, guaranteeing pixel-identical geometry between live preview and rendered video.
- **`cam.js` state machine** — pure module (no imports). Exports query functions (`shouldModulate`, `shouldWriteBack`, `shouldControlsBeEnabled`) and transition functions. `window.isUserInteractingWithCamera` is gone; all camera state is explicit and testable.
- **`pointer-events: none` on UI containers** — all fixed-position chrome containers pass mouse events through to the canvas by default; only interactive child elements re-enable pointer events.
- **Overlay palette binding** — `overlay.js` reads `--ui-accent-rgb` at composite time so exported video text always matches the current UI palette.
- **No build step** — pure ES modules via importmap (`three@0.169.0` from unpkg). Single `index.html` entry point.
