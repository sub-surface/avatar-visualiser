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

## Tuning

All parameters are at the top of the `<script>` block in `index.html`:

| Constant | Default | Effect |
|---|---|---|
| `ROWS` | 60 | Number of horizontal scanlines |
| `COLS` | 128 | Vertices per line (higher = smoother) |
| `MAX_DISP` | 2.2 | Maximum bowl depth |
| `BOWL_EXP` | 2.0 | 2 = gentle bowl · 3 = sharp crater |
| `FLOW_SPEED` | 0.4 | Ripple scroll speed (rows/sec) |
| `FFT_SIZE` | 512 | Frequency resolution (power of 2) |
| `LINE_COLOR` | 0xe8d5b0 | Line colour (warm gold) |

## Requirements

- Chrome 89+ or Edge 89+ (importmap support)
- Microphone permission
- Internet connection (Three.js loaded from unpkg CDN)
