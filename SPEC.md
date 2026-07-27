# AVATAR 2 — Product and Rendering Specification

Status: implementation authority

Supersedes: architectural claims in `README.md` when the two disagree

Primary constraint: preserve the existing low-resolution wireframe character while making preview and export the same deterministic visual system

## 1. Product statement

AVATAR is an audio-reactive visual instrument and deterministic video renderer. It should feel like a piece of proprietary late-1990s/early-2000s audiovisual hardware rather than a modern dashboard.

The product has three equally important uses:

1. perform a visual live from an input device;
2. design a complete visual treatment while listening to a file;
3. render the treatment to a video that matches the preview.

The third use currently diverges from the second. AVATAR 2 treats live playback and offline export as two clocks driving the same analyzer, state machine, geometry, camera, look pipeline, and overlay.

## 2. Non-negotiable preservation rules

- Preserve the present Bowl, Polar, Sphere, and Wave visual vocabulary until a replacement is demonstrably stronger.
- Preserve the checked-in `preview.png` as a composition reference.
- Preserve the existing 640×480 low-resolution export path as the first `PS2 480p` reference profile.
- Preserve the restrained wireframe palette, negative space, and readable metadata overlay.
- Preserve config migration from the current `psychograph_params` localStorage shape.
- Keep the application usable as a static site.
- Do not make the default experience depend on a high-end GPU.

Before deleting an old renderer, the repository must contain:

- a fixed synthetic stereo audio fixture;
- a saved legacy-look project fixture;
- reference frames or a short reference clip for Bowl, Polar, Sphere, and Wave;
- parity tests showing that file preview and export consume the same analyzed frames and render state.

Pixel-exact equality across GPUs is not required. Geometry positions, deterministic random values, timing, camera state, and render-profile state must be equal.

## 3. Core architecture

```text
live PCM / decoded file / synthetic boot signal
                        |
                  SharedAnalyzer
                        |
   SignalFrame { spectrumL/R, envelopes, LFOs, events, time }
                        |
                 RenderSession.step()
                        |
       visual field -> camera rig -> look stack -> overlay
                           |                         |
                        preview                   encoder
```

### 3.1 RenderSession

`RenderSession` is the only object allowed to advance audiovisual state.

It receives:

- an immutable project snapshot;
- a signal source;
- a clock;
- a deterministic seed;
- a render target.

Realtime preview uses a realtime clock. Export uses a fixed-step clock. Both call the same `step(time, dt)` implementation.

Export must never mutate the open project, DOM controls, localStorage, or preview scene.

### 3.2 SharedAnalyzer

File preview and export use the same FFT implementation over the same decoded PCM windows. Live input may use an `AnalyserNode` compatibility source, but it must pass through the same post-FFT smoothing, weighting, band-envelope, LFO, and event code.

Requirements:

- use the actual source sample rate;
- derive frequency-band indices from Hz rather than fixed bin numbers;
- maintain stereo history instead of averaging it away;
- make smoothing and envelopes time-based rather than refresh-rate-based;
- obtain BPM from project state;
- apply analysis gain and low-pass shaping consistently;
- allocate scratch buffers once;
- expose deterministic onset/energy events.

### 3.3 Visual field

All visual modes use a canonical `(row, column)` lattice and stereo-history texture.

A visual-mode registry defines:

- stable ID and label;
- shader mapping or CPU fallback;
- whether rows close into loops;
- relevant controls;
- default camera;
- overlay anchor preference.

Mode switching and mode cycling morph the same topology instead of tearing down unrelated scenes.

Initial registry:

- `bowl`
- `polar`
- `sphere`
- `wave`
- `topology`
- `cathedral`
- `ribbon`
- `tunnel`

### 3.4 Camera intelligence

Camera composition is intent-based rather than a bank of mutable presets. The
project stores:

- a shot intent (`auto`, `hero`, `overhead`, `horizon`, `side`, `macro`,
  `underslung`, or a captured `manual` anchor);
- a motion grammar (`still`, `drift`, `orbit`, `pendulum`, `rail`, or
  deterministic `handheld`);
- amount, speed, audio influence, and transition duration.

`auto` is mode-aware. Manual OrbitControls interaction captures one reusable
anchor. Procedural and audio movement are reversible offsets around the real
base pose, never replacements with global coordinates. Geometry and look
changes do not destroy a manual anchor. Legacy preset/group configs migrate
their first selected camera into that anchor.

### 3.5 Parameter and project schema

Each parameter is declared once with:

- ID;
- type;
- default;
- range or allowed values;
- UI section;
- persistence rule;
- randomization rule;
- update class: `hot`, `geometry`, `audio`, `look`, or `output`.

The schema drives validation, config migration, UI binding, serialization, and deterministic randomization.

Project files include a `schemaVersion`. Unknown fields are ignored, invalid values produce a visible warning, and unsafe collection sizes are rejected.

## 4. Look pipeline

Look is independent from output encoding.

The preview can display the exact internal render target, aspect ratio, frame cadence, post-processing, and overlay placement that export will use.

### 4.1 Built-in profiles

- `clean`: full-resolution neutral renderer.
- `ps2-480`: 640×480 reference profile with low-resolution line rasterization.
- `ps2-240`: 320×240 aggressive profile.
- `tape`: soft chroma/luma separation and sync instability.
- `ghost`: phosphor persistence and recursive feedback.

`PS2` and `tape` are separate layers. A user may combine them, but the product must not imply that VHS artifacts are intrinsic to a console look.

### 4.2 Look controls

- internal width and height;
- contain/crop output framing;
- render cadence;
- screen-space vertex snapping;
- colour bit depth;
- ordered dithering;
- scanline strength;
- interlaced field displacement;
- chroma separation;
- luma smear/noise;
- deterministic sync jitter;
- feedback persistence;
- overlay position: before or after degradation.

Noise and jitter are functions of seed and frame index. Re-rendering the same project produces the same frames.

## 5. Director and timeline

File loading creates a lightweight analysis timeline containing energy peaks and onset candidates.

Preview and export use the same event list for:

- camera cuts;
- camera dissolves;
- mode changes;
- topology morphs;
- deterministic parameter mutations.

Cycle modes become explicit timeline behaviours:

- `off`: current visual and current camera, no automatic drift;
- `ambient`: deterministic continuous camera offsets only;
- `cinematic`: camera events;
- `types`: camera events plus visual morphs;
- `generative`: constrained seeded mutations.

The user can audition the resulting sequence before export. “Static” must actually be static.

## 6. New visual modes

### 6.1 Topology Fold

A continuous mapping between plane, bowl, cylinder, sphere, and torus. Spectral centroid and LFO routing can bend the topology; timeline events can move between stable forms.

### 6.2 Signal Cathedral

Spectral/onset history forms quantized towers, arches, and monolith-like terraces. Events persist over musical time and decay predictably, producing an evolving low-poly audio architecture.

### 6.3 Stereo Phase Ribbon

Left/right energy and phase-derived width form a rotating ribbon or flower. History makes stereo widening, mono collapse, delay, and reverb visible.

### 6.4 Feedback Tunnel

The previous processed frame is reprojected with controlled scale, rotation, and decay. Audio features drive the feedback transform. This is implemented as a look layer so it can combine with every geometry.

## 7. Audio lifecycle

One audio-session owner manages contexts, sources, routing, and teardown.

- Input monitoring is off by default for microphones.
- Preview playback remains audible.
- Analysis shaping and audible shaping are explicit, not accidental consequences of node routing.
- Source changes disconnect old nodes and close unused contexts.
- Automation uses the owning node's context time.
- Boot sound, startup sound, preview, and live input do not leak independent contexts.

## 8. Interface consolidation

The editing UI is organized by intent:

- `Track`: metadata and source.
- `Shape`: visual mode, topology, geometry, and audio response.
- `Look`: colour and raster/post-processing profile.
- `Camera`: shot intent, movement grammar, audio influence, and manual anchor.
- `Output`: aspect, resolution, frame rate, codec, and render.

Debug controls are not mixed with normal output settings.

The boot sequence uses the main visual field with synthetic signal frames behind the terminal layer, allowing it to assemble directly into the selected visual instead of running an unrelated canvas renderer.

All user-supplied text enters the DOM through `textContent` or safe element construction.

## 9. Reliability and performance

- No per-frame typed-array or `THREE.Color` allocations in steady-state preview or export.
- Every geometry, material, texture, render target, source, and context has an explicit owner and disposal path.
- Context loss displays a recoverable message.
- External dependencies are pinned by a lockfile and bundled for deterministic deployment.
- Fonts required by the overlay are local or have a dependable fallback.
- The development server returns correct status codes and does not expose paths outside the project.
- A failed export restores the preview scene and releases all export resources.
- Encoder and file writes use backpressure.

## 10. Verification

Required automated checks:

- DSP and sample-rate tests;
- time-based envelope equivalence at 30, 60, and 144 Hz;
- file-preview/export `SignalFrame` parity;
- all visual mappings produce finite positions;
- stereo channels affect every relevant mode;
- parameter schema validation and migrations;
- BPM and waveform persistence;
- legacy camera-bank migration and manual-anchor integrity;
- deterministic seeded randomization;
- static mode has zero automatic camera movement;
- render resources return to baseline after repeated mode changes and failed exports;
- missing development-server paths return 404;
- a short MP4 export can be decoded and has expected duration, dimensions, and frame rate;
- screenshot/reference checks for clean and PS2 profiles.

## 11. Delivery sequence

1. Capture and codify the existing 480p look.
2. Repair state, camera, audio lifecycle, persistence, disposal, and security.
3. Introduce schema, analyzer, transport, and immutable render sessions.
4. Make file preview and export share analyzed frames and render state.
5. Implement the previewable PS2 Look Lab.
6. Introduce the GPU visual field and new modes.
7. Consolidate boot, UI, assets, documentation, and verification.

Each stage must leave the application runnable. Old code is removed once its replacement passes the relevant preservation and parity checks.
