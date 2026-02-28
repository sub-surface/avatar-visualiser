# PSYCHOGRAPH — Audio Visualiser Avatar

A real-time 3D audio visualiser in the style of Joy Division's *Unknown Pleasures*.
Horizontal scanlines displaced by microphone FFT data form a pulsing bowl/crater shape.
Designed for use as a live video avatar via OBS Studio.

## Setup

1. Open `index.html` in **Chrome** or **Edge**
2. Click anywhere on screen
3. Grant microphone access when prompted
4. The visualiser reacts to your default audio input device in real time

## OBS Capture

### Option A — Local file (simplest)
1. Add a **Browser Source** in OBS
2. Set URL to: `file:///C:/Users/Leon/Desktop/Psychograph/Avatar/index.html`
3. Click **Interact** in the source properties to open the interactive view, then click inside it to start

### Option B — Local server (more reliable for getUserMedia)
```bash
npx serve .
```
Then set the Browser Source URL to `http://localhost:3000`

### Tips
- Resolution: 1920×1080 recommended
- Background is near-black (`#0d0d0d`) — no chroma key needed for dark overlays
- For true transparency: set `alpha: true` in `WebGLRenderer` and use OBS colour key

## Parameters Panel

Click **parameters** in the top-right widget to expand the live control panel. Changes take effect immediately on both the live visualiser and any subsequent export.

| Parameter | Default | Range | Effect |
|---|---|---|---|
| freq scale | `dnb` | linear / log / dnb | Frequency mapping curve (see below) |
| freq range | 0.55 | 0.2–1.0 | Upper frequency cutoff as fraction of Nyquist |
| smoothing | 0.55 | 0.10–0.95 | EMA temporal smoothing (higher = more inertia) |
| displacement | 2.2 | 0.5–5.0 | Maximum vertical displacement of scanlines |
| bowl shape | 2.0 | 0.5–4.0 | Exponent controlling bowl curvature (2=gentle, 4=sharp crater) |
| rows | 60 | 20–120 | Number of horizontal scanlines |
| cols | 128 | 64–256 | Vertices per line (higher = smoother curves) |

Changing **rows** or **cols** rebuilds the Three.js geometry on the fly.

## Frequency Scales

The **freq scale** parameter controls how FFT bins are distributed across the visual width.

### `linear`
Uniform Hz/column spacing. Simple — but compresses most musical content into a narrow low-frequency cluster since the ear is logarithmic.

### `log`
Logarithmic spacing from 20Hz to the freq range cutoff. Matches how the ear hears pitch — octaves appear equally wide. Good for general music.

### `dnb` (default — recommended for Jungle/DnB)
A piecewise curve optimised for the spectral signature of Jungle and Drum & Bass:

| Screen region | Frequency range | Content |
|---|---|---|
| Left 25% | 40–180 Hz | Sub-bass, kick body, bass wobble |
| Middle 50% | 500Hz–6kHz (log) | Amen break, snare crack, hi-hat |
| Right 25% | 6kHz–16kHz | Hi-hat shimmer, top-end air |

This prevents the amen break and sub energy from fighting for the same few columns.

## Export

Click **parameters → load & export** to render a WAV file to MP4:

1. Click **load & export** and select a WAV file
2. The visualiser re-renders offline at 1920×1080, 30fps
3. A download is triggered automatically when encoding finishes
4. Output is lossless H.264 (quantizer=0, every frame a keyframe) — no temporal compression artefacts on thin line art

Parameters are baked in at export time — set them before clicking export.

## Tests

Open `tests.html` in Chrome to run the DSP test suite. All pure functions (`applyHannWindow`, `fftRadix2`, `computeFFTBins`, `buildBinMap`, `bowlFactor`, `buildAWeightGain`) are tested in isolation without a DOM or WebGL context.

Test groups:
- **FFT correctness** — Hann window normalisation, DC bin, 440Hz dominant bin, silence → zero bins
- **Bin mapping** — linear/log/dnb monotonicity, boundary values, DnB band allocation (first 25% in 40–180Hz, middle 50% in 500–6kHz)
- **Bowl factor** — centre=1.0, edges≈0.0, higher exponent gives steeper falloff
- **A-weighting** — gain range 0.5–1.0, peak near 3.5kHz
- **Export EMA smoothing** — step response follows expected decay curve

## Tuning for DnB/Jungle

Recommended starting point:

| Parameter | Value | Reason |
|---|---|---|
| freq scale | `dnb` | Genre-tuned band allocation |
| freq range | 0.55 | Cuts ultrasonic bins; DnB content sits below ~12kHz |
| smoothing | 0.45–0.55 | Preserves transient snap of amen break |
| displacement | 2.5–3.0 | More dramatic movement on kick hits |
| bowl shape | 2.5 | Slightly sharper crater accentuates mid-energy peaks |

## Architecture

```
Avatar/
├── index.html   — Three.js visualiser + WebCodecs export + params panel
├── dsp.js       — Pure ES module: FFT, windowing, bin mapping, bowl factor, A-weighting
├── tests.html   — In-browser test suite (no framework)
└── README.md
```

`dsp.js` has no DOM, Three.js, or side-effect dependencies — all functions are pure and exported.

## Requirements

- Chrome 94+ (WebCodecs export) or Chrome 89+ (live visualiser only)
- Microphone permission
- Internet connection (Three.js loaded from unpkg CDN)
