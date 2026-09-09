# AVATAR 2

AVATAR is an audio-reactive 3D field instrument for live input, track preview, and deterministic MP4 rendering. Its visual identity is wireframe signal sculpture, with an especially faithful low-resolution PS2 output path that can be composed live in the Look Lab.

The implementation authority is [SPEC.md](./SPEC.md).

## Run it

```powershell
npm install
npm run dev
```

Open the printed local URL in a current Chromium browser. MP4 rendering requires WebCodecs and the File System Access API, so Chrome or Edge is recommended.

Useful checks:

```powershell
npm test
npm run build
npm run verify
```

## Working model

Every source follows the same path:

```text
microphone / decoded file / startup chord
                    ↓
              SharedAnalyzer
                    ↓
                SignalFrame
                    ↓
       GPU SignalField + camera intelligence
                    ↓
               LookRenderer
                    ↓
         live canvas / MP4 encoder
```

Preview and export no longer maintain separate geometry or DSP implementations. A saved project is validated through a versioned schema, and rendering snapshots it before export so a render cannot mutate the working scene.

## Explore

The bottom strip switches among eight views:

- `sphere` — radial spectral planet
- `bowl` — history terrain
- `polar` — stacked signal rings
- `wave` — spectral waterfall
- `fold` — repeated topology sculpture
- `cathedral` — audio-built arches and ribs
- `ribbon` — explicit stereo phase separation
- `tunnel` — moving radial memory

In Parameters → Visual, the first controls are portable field macros: scale, energy, stereo, and flow. “Advanced field” exposes twist, curl, symmetry, history gain, rotation, and opacity. These parameters have shared meanings across every view.

The style-seed menu provides editable cross-mode starting points:

- Unknown Planet
- PS2 Signal Temple
- Oscilloscope Kiss
- MilkDrop Memory
- Demoscene Fold
- Sonar Bloom
- Spectral Canyon
- Dub Wire Memory

The randomizer is schema-driven, so newly registered visual parameters participate automatically. It chooses coherent harmonic colours and one of the eight modes.

## 3D Retro Artifacts & Orientation

In addition to Signal Fields, AVATAR features interactive 3D retro hardware artifacts with customizable labels, granular orientation controls, and audio-reactive glitch physics:

- **Game Cartridge** — 3D retro 64-bit console cartridge with label recess and side grips
- **Vinyl Record** — 12" LP standing upright vertically with realistic vinyl micro-grooves, spindle hole, and center sticker
- **Cassette Tape** — compact cassette shell with synchronized dual tape spools and sticker label
- **Floppy Disk** — classic 3.5" diskette with sliding metal shutter and adhesive paper label
- **Custom 3D Model (.dae)** — import your own 3D Collada models (`.dae`) via the `+ import .dae` button or by dragging and dropping `.dae` files directly onto the app! Flat models automatically stand upright facing the camera.
- **Orientation & Tilt Controls** — granular pitch ($X$), yaw ($Y$), and roll ($Z$) sliders ($-180^\circ$ to $+180^\circ$) with quick 1-click presets: `[stand upright]`, `[lay flat]`, and `[reset]`.

You can upload any custom image (PNG/JPG) to map onto the label, or automatically inherit high-resolution album art imported from SoundCloud. Artifacts support turntable spin (RPM or BPM tempo sync), audio-reactive bass wobble/tilt, and polygonal vertex tear glitches.

## Curated Retro Skyboxes & Atmospheric Lighting

The Look console features authentic atmospheric environments rendered onto 360° reflection backgrounds with matched ambient, key, and fill lighting rigs:

- **Minimal Void** — classic pure dark void with neutral studio lighting
- **Neon Grid 80s** — synthwave violet horizon, distant stars, magenta glow line, and perspective neon-cyan grid floor
- **Sunset 90s** — deep indigo sky fading through magenta to golden horizon with iconic striped sun and water ripples
- **Deep Space** — starfield with cyan and purple atmospheric nebula clouds and diffraction spike flares
- **SGI Workstation** — classic 1995 Silicon Graphics IRIX desktop gradient and cool slate lighting
- **Cyber CRT Green** — retro phosphor terminal glow with vertical scanlines and emerald lighting
- **Custom Image Upload** — upload any background image (PNG/JPG); AVATAR automatically extracts the dominant color to tint the ambient lighting
- **Light Tone** — granular ambient lighting tone multiplier ($0.2\times$ to $3.0\times$)

## SoundCloud Import

Click the **☁ SoundCloud** button on the top audio deck to open the importer. Paste any public track link (e.g. `https://soundcloud.com/artist/track-name`) to automatically fetch:
- Track title and artist metadata
- 500×500 high-resolution album artwork (mapped directly to the active 3D asset)

## Expanded VHS & Retro Hardware Emulation

The Look console provides authentic analog tape and retro-display emulation:

- **VHS Master** — helical head-switching tracking noise band at the bottom of the frame, horizontal sync line-tearing jitter on bass transients, NTSC composite chroma smear, and magnetic tape dropouts
- **90s CRT TV** — barrel glass screen curvature, phosphor aperture grille scanlines, and edge vignette
- **PS1 Low-Poly** — screen-space vertex coordinate quantization, 5-bit color banding, and Bayer dithering
- **VCR OSD HUD** — authentic green/white pixel on-screen display with `PLAY ▶`, `SP`, `HI-FI STEREO`, and running timecode counter (available in live preview and baked into MP4 exports)
- **PS2 480p / 240p** — 6th-gen console line rasterization
- **Tape Memory** & **Long Exposure** (ghost phosphor feedback)

## Audio Safety and Playback

- Built-in brickwall safety limiter (`DynamicsCompressorNode` with -1.0 dBFS threshold, 20:1 ratio, 1ms attack) and Butterworth filter damping ($Q = 0.7071$) protect ears and headphones from filter explosions or audio spikes.
- Preview playback cleanly detects track conclusion without looping blast spikes, safely stopping audio and resetting the playhead.
- File preview is analysed directly from decoded PCM.
- Live input uses one managed Web Audio graph.
- Microphone monitoring is off by default to prevent feedback.
- FFT smoothing and envelope followers are time-based, so response is stable across display and export frame rates.
- BPM is part of project state and drives both LFOs. Auto BPM writes its result back to that same state.

## Camera intelligence

The camera director features an intelligent intent system:

- shot: auto, hero, overhead, horizon, side, macro, underslung, or manual
- movement: still, drift, orbit, pendulum, rail, or deterministic handheld
- amount, speed, audio influence, and transition duration

Auto framing understands the active visual family. Orbit the scene normally and
the result becomes a manual anchor; “capture orbit” makes that intent explicit.
Procedural and audio movement are reversible offsets on top of the real pose.

## Export & Scene Sequence Playlist

Exports produce deterministic MP4 video using WebCodecs muxing:

- **Timeline Scene Sequence** — configure exactly which scenes the video will cycle through on musical cue points using the `🎞 edit scene sequence` popup modal. Select scenes with checkboxes and reorder them via drag-and-drop or up/down arrows. The export dynamically transitions between both wireframe geometric fields and spinning 3D physical artifacts!
- Deterministic energy cues detected from audio PCM drive shot cuts and scene transitions.
- Renders with the active skybox environment and atmospheric lighting rig.

## Project structure

```text
index.html             application shell and UI wiring
project-schema.js      versioned parameter/project validation
params.js              persisted state and DOM bindings
signal.js              shared PCM/bin analysis and SignalFrame clock
vis/field.js           one GPU history-field renderer and eight equations
look-profiles.js       output profile definitions and internal sizing
look.js                low-resolution, feedback, and raster post pipeline
style-presets.js       cross-mode editable style seeds
cam.js                 shot intents, procedural motion, and manual anchor
audio.js               managed live/preview Web Audio graph
tempo.js               BPM onset tracking
export.js              immutable deterministic WebCodecs export
overlay.js             metadata composite
boot.js                startup sequence
dsp.js                 pure FFT and mapping primitives
test/                  Vitest parity and schema tests
SPEC.md                architecture and product authority
```

`Startup.wav` is the boot chord and is intentionally included despite the general WAV ignore rule. `Burden.wav` is not required by the app and remains ignored.

## Keyboard

- `1` bowl
- `2` polar
- `3` sphere
- `4` wave
- `5` topology fold
- `6` signal cathedral
- `7` stereo ribbon
- `8` feedback tunnel
- `P` parameters
- `D` camera intelligence
- `O` clean/OBS mode
- `Space` preview play/pause when a file is loaded
- `Escape` close overlays

## Compatibility and safety

Imported project JSON is clamped, enum-checked, text-limited, camera-limited, and migrated before use. Status messages and option labels are inserted as text rather than HTML. Audio nodes, streams, contexts, render targets, and geometries have explicit teardown paths.

Vite bundles application dependencies for production builds. The unbuilt static entry also remains deployable on GitHub Pages through a pinned import map. Google Fonts are an optional network enhancement; the CSS stack has local fallbacks.
