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

## 3D Retro Artifacts

In addition to Signal Fields, AVATAR features interactive 3D retro hardware artifacts with customizable labels and audio-reactive glitch physics:

- **Game Cartridge** — 3D retro 64-bit console cartridge with label recess and side grips
- **Vinyl Record** — 12" LP with realistic vinyl micro-grooves, spindle hole, and center sticker
- **Cassette Tape** — compact cassette shell with dual rotating tape spools and sticker label
- **Floppy Disk** — classic 3.5" diskette with sliding metal shutter and adhesive paper label
- **Custom 3D Model (.dae)** — import your own 3D Collada models (`.dae`) via the `+ import .dae` button or by dragging and dropping `.dae` files directly onto the app! Custom models are auto-scaled, centered, and participate in the full audio-reactive spin and glitch pipeline.

You can upload any custom image (PNG/JPG) to map onto the label, or automatically inherit high-resolution album art imported from SoundCloud. Artifacts support turntable spin (RPM or BPM tempo sync), audio-reactive bass wobble/tilt, and polygonal vertex tear glitches.

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

## Audio and tempo

- File preview is analysed directly from decoded PCM.
- Live input uses one managed Web Audio graph.
- Microphone monitoring is off by default to prevent feedback.
- FFT smoothing and envelope followers are time-based, so response is stable across display and export frame rates.
- BPM is part of project state and drives both LFOs. Auto BPM writes its result back to that same state.

## Camera intelligence

The old preset/group director has been replaced by a compact intent system:

- shot: auto, hero, overhead, horizon, side, macro, underslung, or manual
- movement: still, drift, orbit, pendulum, rail, or deterministic handheld
- amount, speed, audio influence, and transition duration

Auto framing understands the active visual family. Orbit the scene normally and
the result becomes a manual anchor; “capture orbit” makes that intent explicit.
Procedural and audio movement are reversible offsets on top of the real pose.
Legacy preset/group configs migrate their first selected shot into the manual
anchor.

## Export

Exports use the same:

- FFT and stereo signal frame
- field equations and history texture
- modulation clock
- camera shot and movement grammar
- colour pipeline
- Look Lab renderer

Energy cues are detected once and turned into a deterministic timeline. `cinematic`, `types`, `generative`, and `random` modes use those cues for camera, view, or parameter changes. Generative randomness is seeded from the audio and metadata, so repeating an export with the same project produces the same visual decisions.

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
