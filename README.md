# AVATAR — Audio Visualiser

A modular, real-time 3D audio visualiser inspired by Joy Division's *Unknown Pleasures* aesthetic. It features a WebGL rendering engine, a WebCodecs export pipeline with smooth shape-morphing, a procedural boot sequence, and a deeply reactive parameters system.

---

## Features

- **Four Visualisation Modes**: `sphere` (default 3D displacement), `bowl` (classic scanlines), `polar` (circular), and `wave` (time-domain waterfall).
- **Smooth Shape Morphing**: The export pipeline seamlessly interpolates between geometries (Sphere ⇄ Bowl ⇄ Polar ⇄ Wave) for cinematic transitions.
- **Dynamic Mode Cycling**: Aggressive peak detection (minimum 3 s spacing, up to 15 triggers) automates transitions and cycles through **six distinct camera perspectives** (Normal, Distant, Birds-eye, Worms-eye, Side-Profile, Oblique).
- **Director Mode**: Adjust all six export camera positions (X, Y, Z, lookY) from within the parameters panel. Settings persist across sessions.
- **Camera Preview**: Live-preview any camera style directly in the viewport without starting an export.
- **Stereo Reactivity**: Dual-channel FFT analysis (L/R) produces asymmetrical displacement and stereo-tilt effects.
- **Dual BPM-Synced LFOs**:
  - **LFO 1**: Modulates displacement, bowl shape, camera zoom, and opacity.
  - **LFO 2**: Dedicated filter LFO for modulating the Low Pass Filter frequency.
  - Both support `sine`, `square`, `sawtooth`, and `triangle` waveforms.
- **DNB Frequency Mapping**: Genre-aware `dnb` scale allocates 25 % of columns to sub-bass (40–180 Hz), 50 % to mids (500–6000 Hz), and 25 % to treble (6000–16000 Hz).
- **Advanced UI & Theming**:
  - **8 Colour Presets**: Default slate + ROYGBIV themes. Select via the circular palette button (bottom-left) — hover to reveal per-colour dot picker.
  - **Dual Modes**: Dark and Light with dedicated ☀/☾ toggle.
  - **Global Randomiser**: One-click parameter exploration (bottom-right) preserving audio stability.
  - **Config Export / Import**: Save and load full parameter sets as JSON using the ↓/↑ buttons beside the randomiser.
  - **First-Visit Onboarding Glow**: Infobox pulses on first load only (localStorage-gated).
- **Advanced Export Pipeline**:
  - **WebCodecs Acceleration**: High-speed MP4 export with H.264 + AAC.
  - **Quality Presets**: Standard (12 Mbps), Lossless (25 Mbps), Lo-Fi PS2 (2.5 Mbps with VHS jitter).
  - **Aspect Ratios**: 16:9 or 4:3 in horizontal or vertical orientation.
  - **Baked Overlays**: Metadata composited per-frame.
- **Startup Sound**: `Startup.wav` plays through the shared analyser chain on load (lowpass at 165 Hz), driving the visualiser terrain from the first moment.
- **Boot Sequence**: Full procedural terminal boot animation inspired by 90s proprietary workstations — four distinct canvas animations (terrain materialise, waveform reveal, grid pulse, spectrum bars) randomly selected on each load, all theme-aware and skippable with `[Space]`.
- **Clean Mode**: Hides all UI chrome for OBS / streaming capture. Elements fade back in on hover. Activate via `?clean` or `?obs` URL parameter, or the bottom-left button.
- **GPU Memory Hygiene**: All vis-mode tear-down functions dispose Three.js geometries and materials explicitly.
- **Adaptive Pixel Ratio**: Renderer automatically lowers DPR when frame time exceeds 20 ms, restoring it when performance recovers.

---

## Project Structure

```
Avatar/
├── index.html          # Entry point: HTML + CSS + tabbed UI + module wiring
├── engine.js           # Three.js core: renderer, scene, camera, palettes
├── audio.js            # Stereo Web Audio API: input, dual analysers, LPF/Gain chain
├── envelopes.js        # Envelope followers, slew logic, dual BPM LFOs
├── dsp.js              # FFT, Hann windowing, bin mapping (linear / log / dnb)
├── params.js           # 30+ parameters, camStyles, localStorage persistence, UI bindings
├── export.js           # Peak detection, morphing render loop, camera drifts (reads P.camStyles)
├── overlay.js          # 2D text compositing for export frames
├── boot.js             # Procedural boot sequence: terminal + 4 canvas animations
├── vis/
│   ├── shared.js       # History buffers, A-weighting
│   ├── bowl.js         # Scanline grid with vertex colours + visibility culling
│   ├── polar.js        # Circular geometry with stereo asymmetry
│   ├── sphere.js       # 3D sphere with history ripple and spin
│   └── wave.js         # 3D waterfall waveform
├── Burden.wav          # Default demo track (m0rvidd)
├── Startup.wav         # Boot chord (lowpass 165 Hz, drives visualiser)
└── tests.html          # DSP test harness (FFT, bin mapping, envelopes)
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
- The `?clean` flag hides all UI chrome; hovering the screen edges reveals controls.
- Use the **clean mode** button (bottom-left) to toggle mid-session.

### Export Mode
1. Drag and drop any audio file, or use the pre-loaded **Burden.wav**.
2. Adjust Sens Envs and LFO routing in the **Mod** tab.
3. Toggle **cycle modes** in the **Export** tab for automated morphed transitions.
4. Use **preview cameras** to see how each angle looks before rendering.
5. Tweak camera positions in the **director** section of the Export tab.
6. Hit **render video** — output is a dated MP4 in your chosen quality preset.

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
| `Space` (during boot) | Skip boot sequence |

---

## Frequency Scales

| Scale | Description |
|-------|-------------|
| `log` | Logarithmic — dense low-end, sparse highs (default) |
| `linear` | Equal Hz per column |
| `dnb` | DNB-optimised: 25 % sub-bass · 50 % mids · 25 % treble |

---

## Visual Identity

- **Typography**: *DM Serif Display* (editorial serif) and *DM Mono* (technical labels).
- **Colours**: User-definable `colorA` / `colorB` for terrain + 8 independent UI themes.
- **Theme**: Dark and Light modes. Palette circle (bottom-left) opens a dot-picker for instant theme switching.
- **Boot aesthetic**: Spirit of 90s proprietary workstations (SGI, NeXT, PlayStation) rendered with modern canvas — procedural, theme-aware, unique each load.
