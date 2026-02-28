# AVATAR — Audio Visualiser

A modular, real-time 3D audio visualiser inspired by Joy Division's *Unknown Pleasures* aesthetic. It features a WebGL-based rendering engine, a WebCodecs-driven export pipeline with 2D text compositing, and a reactive parameters system.

Horizontal scanlines displaced by frequency data form pulsing shapes across four distinct visualisation modes. Designed for both live performance (via OBS Studio) and high-quality video export.

---

## 🚀 Features

- **Four Visualisation Modes**: `bowl` (classic scanlines), `polar` (circular), `sphere` (3D displacement), and `wave` (time-domain).
- **Dual Operating Modes**:
  - **Live Mode**: Uses microphone input for real-time performance. Supports an `?obs=1` URL parameter for a UI-free browser source.
  - **Export Mode**: High-quality MP4 export (Lossless, Standard, or Lo-Fi) with baked-in text overlays (artist, title, BPM).
- **Advanced DSP**: Custom FFT implementation with configurable frequency scaling (`dnb`, `log`, `linear`), A-weighting, and envelope followers for sub-bass, kick, mids, and highs.
- **Reactive Parameters**: 20+ real-time tweakable parameters (displacement, LFO, smoothing, modulation depths) with `localStorage` persistence.
- **QoL**: Drag-and-drop audio files, keyboard shortcuts (Space for mode toggle, 1-4 for vis modes, F for fullscreen), and mobile-responsive CSS.

---

## 🏗️ Project Structure & Architecture

The project is modularised for maintainability and clear separation of concerns:

```
Avatar/
├── index.html          # Entry point: HTML/CSS + Module wiring
├── engine.js           # Three.js core: renderer, scene, camera, and fade transitions
├── audio.js            # Web Audio API: Mic/File input, analyser, and raw frequency data
├── envelopes.js        # DSP: Envelope followers (sub, kick, etc.) and LFO logic
├── dsp.js              # Pure math: FFT, Hann windowing, bin mapping, and A-weighting
├── params.js           # State: Parameter definitions, persistence, and DOM bindings
├── export.js           # Pipeline: WebCodecs encoding (VideoEncoder/AudioEncoder)
├── overlay.js          # Compositing: Canvas 2D text rendering for export frames
├── vis/                # Visualisation-specific modules
│   ├── shared.js       # Shared buffers (history, bin maps) and A-weighting gains
│   ├── bowl.js         # Scanline grid geometry and displacement
│   ├── polar.js        # Circular geometry
│   ├── sphere.js       # 3D sphere displacement
│   └── wave.js         # Time-domain waveform rendering
└── tests.html          # Browser-based test suite for DSP and logic
```

---

## 🛠️ Setup & Usage

### Local Development
ES modules are blocked by browsers when opened directly from `file://` — you must serve over HTTP.

1. Double-click `serve.bat` (requires Node.js) — starts a local server and opens the browser automatically.
2. Or run manually: `npx serve . --listen 3000` then open `http://localhost:3000`.

### Live Mode (OBS Capture)
1. Add a **Browser Source** in OBS, set URL to `http://localhost:3000/index.html?obs=1`.
2. The `?obs=1` parameter hides all UI chrome for a clean capture.
3. Click **Interact** in the source properties, then click inside it to grant microphone access.

### Export Mode
1. Switch to **export** mode in the top-right toggle.
2. Drag and drop an audio file (WAV, MP3, etc.) onto the window or click **load file**.
3. Adjust track metadata (Title, Artist, BPM) in the parameters panel.
4. Click **render video**. The render happens offline (frame-by-frame) and will prompt for a save location.
5. **Baked Overlays**: The export pipeline uses `overlay.js` to composite metadata directly onto the video frames.

---

## 🎹 Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Toggle between **Live** and **Export** modes |
| `1` – `4` | Switch Visualisation Modes (`bowl`, `polar`, `sphere`, `wave`) |
| `P` | Toggle Parameters Panel |
| `F` | Toggle Fullscreen |

---

## 📈 Frequency Scales

The **freq scale** parameter controls how FFT bins are distributed across the visual width.

- **`linear`**: Uniform Hz/column spacing.
- **`log` (Default)**: Logarithmic spacing matching human hearing perception.

---

## 🧪 Testing

Open `http://localhost:3000/tests.html` to run the test suite. It covers:
- **FFT Accuracy**: Hann windowing and magnitude correctness.
- **Bin Mapping**: Monotonicity and frequency band allocation for `dnb` scale.
- **Envelope Logic**: Slew rate (attack/release) timing for reactive elements.
- **A-Weighting**: Human hearing perception normalisation.

---

## 🎨 Visual Identity

- **Typography**: *DM Serif Display* (editorial serif) and *DM Mono* (technical metadata).
- **Colors**: Strict two-color scheme of Slate (`--s-hi`) and Mauve (`--m-hi`) on a deep black background (`#0d0d0d`).
- **Scanlines**: Gold base (`0xe8d5b0`) with Mauve peaks (`0xb090c8`).
