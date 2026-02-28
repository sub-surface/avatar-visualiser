/**
 * boot.js — Boot sequence for Sub-Surface Avatar Visualiser.
 * Spirit of 90s proprietary computing (SGI, NeXT, PlayStation) rendered
 * with modern canvas. Theme-aware: reads --ui-accent from the active palette.
 */

// ── Theme helpers ───────────────────────────────────────────────────────────
function getAccent() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--ui-accent').trim() || '#c7dce7';
}
function getAccentRgb() {
  // Parse --ui-accent-rgb for rgba() use
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--ui-accent-rgb').trim() || '162, 182, 192';
  return raw;
}
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}
function accentRgb() {
  try {
    const rgb = getAccentRgb().split(',').map(n => parseInt(n.trim()));
    return rgb;
  } catch { return [162, 182, 192]; }
}

// ── BIOS POST content ───────────────────────────────────────────────────────
const BIOS_LINES = [
  { text: '┌──────────────────────────────────────────────────────────┐', delay: 2, cls: 'boot-tertiary' },
  { text: '│  SUB-SURFACE DSP-CORE BIOS  v1.0.0  (C) 2024  sub-surface│', delay: 2, cls: 'boot-tertiary' },
  { text: '│  WaveCore FFT Engine · WebGL Terrain Renderer · WebCodecs│', delay: 2, cls: 'boot-tertiary' },
  { text: '└──────────────────────────────────────────────────────────┘', delay: 2, cls: 'boot-tertiary' },
  { text: '', delay: 60 },
  { text: '<span class="boot-secondary">Main Processor</span>  : <span class="boot-accent">WaveCore DSP-X</span>  @ 44.1kHz / 48kHz', delay: 8 },
  { text: '<span class="boot-secondary">Co-Processor</span>    : <span class="boot-accent">FFT Radix-2</span>  (1024-bin stereo pair)', delay: 8 },
  { text: '<span class="boot-secondary">Geometry Engine</span> : <span class="boot-accent">Three.js r169</span>  (LineBasicMaterial)', delay: 8 },
  { text: '<span class="boot-secondary">Codec Unit</span>      : <span class="boot-accent">WebCodecs</span>  AVC1 / AAC  (30fps, 25Mbps)', delay: 8 },
  { text: '', delay: 60 },
  { text: 'Memory Test: ', delay: 5, action: null },
  { text: null, action: 'memtest' },
  { text: '', delay: 50 },
  { text: 'Detecting WebGL ........... 2.0 (antialias, preserveBuffer)', delay: 8, cls: 'boot-secondary' },
  { text: 'Detecting Web Audio API ... AnalyserNode  stereo pair', delay: 8, cls: 'boot-secondary' },
  { text: 'Detecting WebCodecs ....... VideoEncoder + AudioEncoder  OK', delay: 8, cls: 'boot-secondary' },
  { text: '', delay: 40 },
  { text: '<span class="boot-accent">System Topology:</span>', delay: 5 },
  { text: '  [CPU]  WaveCore v3.2 (8 cores, 44.1kHz) ..... <span class="boot-ok">OK</span>', delay: 4, cls: 'boot-dim' },
  { text: '  [GPU]  RasterPipe-128 (WebGL 2.0) ........... <span class="boot-ok">OK</span>', delay: 4, cls: 'boot-dim' },
  { text: '  [MEM]  Radix-2 FFT Buffers (1024 bin) ....... <span class="boot-ok">OK</span>', delay: 4, cls: 'boot-dim' },
  { text: '  [ENV]  Slew Control v0.9 (ATK 0.05) ......... <span class="boot-ok">OK</span>', delay: 4, cls: 'boot-dim' },
  { text: '', delay: 40 },
  { text: 'Memory Map:', delay: 5, cls: 'boot-secondary' },
  { text: '  0x0000  <span class="boot-tertiary">████████████████</span>  [KERNEL]', delay: 2 },
  { text: '  0x4000  <span class="boot-tertiary">▓▓▓▓▓▓▓▓░░░░░░░░</span>  [AUDIO_BUF]', delay: 2 },
  { text: '  0x8000  <span class="boot-tertiary">▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒</span>  [FFT_WIN]', delay: 2 },
  { text: '  0xC000  <span class="boot-tertiary">░░░░░░░░░░░░░░░░</span>  [FREE]', delay: 2 },
  { text: '', delay: 40 },
  { text: 'Network Handshake:', delay: 5, cls: 'boot-secondary' },
  { text: '  <span class="boot-dim">TX</span>  >>> SYN [0x1A] ... <span class="boot-ok">ACK</span>', delay: 10 },
  { text: '  <span class="boot-dim">RX</span>  <<< SYN/ACK [0x4F] ... <span class="boot-ok">ESTABLISHED</span>', delay: 10 },
  { text: '', delay: 40 },
  { text: 'DSP Calibration:', delay: 5, cls: 'boot-secondary' },
  { text: '  <span class="boot-dim">Noise Floor</span> : -96.0 dB', delay: 5 },
  { text: '  <span class="boot-dim">DC Offset</span>   : 0.0003 V', delay: 5 },
  { text: '  <span class="boot-dim">Jitter</span>      : 0.012 ms', delay: 5 },
  { text: '  [<span class="boot-accent">||||||||||||||||||||||||</span>] 100%', delay: 15 },
  { text: '', delay: 40 },
  { text: 'Terrain geometry  60 rows × 128 cols  (7,680 vertices) .... <span class="boot-ok">OK</span>', delay: 8 },
  { text: 'A-weighting curve  IEC 61672  peak @ 3.5 kHz ............. <span class="boot-ok">OK</span>', delay: 8 },
  { text: 'BPM auto-detect   onset threshold 0.35  window 24 beats .. <span class="boot-ok">OK</span>', delay: 8 },
  { text: 'Envelope slew     ATK 0.05  REL sub:0.82  kick:0.70 ...... <span class="boot-ok">OK</span>', delay: 8 },
  { text: '', delay: 40 },
  { text: 'Spectral Analysis:', delay: 5, cls: 'boot-secondary' },
  { text: '  LOW  <span class="boot-tertiary">▇▇▇▇▆▆▅▄▃  </span> -12dB', delay: 3 },
  { text: '  MID  <span class="boot-tertiary">▇▇▆▅▄▃▂    </span> -24dB', delay: 3 },
  { text: '  HI   <span class="boot-tertiary">▇▆▅▄▂      </span> -36dB', delay: 3 },
  { text: '', delay: 40 },
  { text: '<span class="boot-dim">0000: 4C 4F 41 44 49 4E 47 2E 2E 2E 00 00 00 00 00 00</span>', delay: 2 },
  { text: '<span class="boot-dim">0010: 53 59 53 54 45 4D 5F 49 4E 49 54 5F 4F 4B 00 00</span>', delay: 2 },
  { text: '', delay: 40 },
  { text: 'Microphone ....... Permission pending', delay: 8, cls: 'boot-secondary' },
  { text: 'Subwoofer ........ Strongly recommended', delay: 8, cls: 'boot-secondary' },
  { text: 'Mouse ............ Not found  (hover is enough)', delay: 8, cls: 'boot-secondary' },
  { text: 'Soul ............. <span class="boot-accent">Waveform detected</span>  ∿∿∿∿∿∿∿∿∿∿', delay: 8 },
  { text: '', delay: 50 },
  { text: 'Loading <span class="boot-accent">AVATAR OS</span> ...', delay: 5 },
  { text: null, action: 'dots' },
  { text: '', delay: 80 },
];

// ── ASCII Logo (AVATAR in large block chars) ────────────────────────────────
const ASCII_LOGO = [
  ' ▄▄▄·  ▌ ▐· ▄▄▄· ▄▄▄▄▄ ▄▄▄· ▄▄▄ ',
  '▐█ ▀█ ▪█·█▌▐█ ▀█  ██  ▐█ ▀█ ▀▄ █·',
  '▐█▀▀█ ▐█▐█·▄█▀▀█  ▐█.▪▄█▀▀█ ▐▀▀▄ ',
  '▐█ ▪▐▌ ███ ▐█ ▪▐▌ ▐█▌·▐█ ▪▐▌▐█•█▌',
  ' ▀  ▀ . ▀   ▀  ▀  ▀▀▀  ▀  ▀ ·▀  ▀',
];

// Fallback simpler logo if above is too wide
const ASCII_LOGO_SIMPLE = [
  '  ▄▄▄·  ▌ ▐· ▄▄▄· ▄▄▄▄▄ ▄▄▄· ▄▄▄  ',
  '  ▐█ ▀█ ▪█·█▌▐█ ▀█  ██  ▐█ ▀█ ▀▄ █·',
  '  ▄█▀▀█ ▐█▐█·▄█▀▀█  ▐█.▪▄█▀▀█ ▐▀▀▄ ',
  '  ▐█ ▪▐▌ ███ ▐█ ▪▐▌ ▐█▌·▐█ ▪▐▌▐█•█▌',
  '   ▀  ▀ . ▀   ▀  ▀  ▀▀▀  ▀  ▀ ·▀  ▀',
  '',
  '  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿',
  '  ▁▂▂▃▄▅▆▇██▇▇▆▅▄▃▂▁▁▂▃▄▅▆▇███▇▆▅▄▃▂▁',
  '  ▁▂▃▄▅▅▆▇▇██▇▆▅▄▃▂▂▁▁▁▂▃▄▅▆▇█▇▆▅▄▃▂▁',
  '  ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿',
];

const ONBOARDING_HEADER = [
  '╔══════════════════════════════════════════════════════╗',
  '║   SUB-SURFACE AVATAR VISUALISER  v0.9               ║',
  '║   Real-time Audio Reactive Terrain Engine            ║',
  '║   Three.js · Web Audio API · WebCodecs · WebGL 2.0  ║',
  '║   ∿ Joy Division "Unknown Pleasures" — reimagined ∿  ║',
  '╚══════════════════════════════════════════════════════╝',
];

const LOADING_STEPS = [
  { label: 'Initialising FFT radix-2 pipeline    ', duration: 120 },
  { label: 'Building A-weight gain curves        ', duration: 80 },
  { label: 'Calibrating waveform displacement    ', duration: 140 },
  { label: 'Compiling vertex shader geometry     ', duration: 100 },
  { label: 'Establishing stereo audio context    ', duration: 130 },
  { label: 'Mapping 1024 frequency bins          ', duration: 70 },
  { label: 'Synchronising envelope followers     ', duration: 110 },
  { label: 'Suppressing harmonic resonance       ', duration: 90 },
  { label: 'Tuning BPM onset threshold           ', duration: 80 },
  { label: 'Preparing cinematic camera rig       ', duration: 100 },
];

const TIPS = [
  // Controls
  'Press [1–4] to switch vis modes live. [5] cycles the UI palette.',
  'The LFO rate is BPM-synced — 0.25 cycles/beat = one full sweep per bar.',
  'Drag any audio file onto the window — WAV, MP3, FLAC, AAC all supported.',
  'Config export (↓) saves your full parameter set as JSON for sharing or archiving.',
  'Clean mode hides all UI — hover screen edges to reveal controls. URL: ?clean',
  'Director mode lets you sculpt each of the 6 export camera positions precisely.',
  // Sound design
  'DNB bin scale dedicates 25% of columns to 40–180 Hz — the kick lives there.',
  'Bowl exponent warps crater wall steepness. Try 1.2 (gentle) vs 3.8 (cliff-face).',
  'LFO 2 modulates the lowpass filter cutoff — pulse it for filter-sweep automation.',
  'The freq range slider acts as a high-cut. Pull it back to focus the bass register.',
  'modRms drives camera zoom. High values make the terrain breathe with the mix.',
  'Polar spacing pushed past zero inverts the fold — try −3.5 for inside-out terrain.',
  'Sphere mode auto-rotates at 0.005 rad/frame. modRms pulls the camera in on peaks.',
  'A-weighting biases colour toward 3.5 kHz — the frequency humans hear most clearly.',
  'Reducing complexity to 1–2 gives a coarse, brutalist look. Pairs well with wave.',
  // Export
  'Export renders at 30 FPS; energy peaks trigger camera cuts and vis morphs.',
  'Cinematic cycle mode cuts between the 6 camera angles on audio energy peaks.',
  'The lofi export preset adds VHS jitter and chromatic noise to each frame.',
  'Lossless preset writes 25 Mbps AVC1 — safe to re-encode without generation loss.',
  // Hidden / esoteric
  'Sub-bass geometry displacement: modSub at 1.0 will move the earth on a kick drum.',
  'The worm\'s-eye camera (4) + bowl mode creates an almost geological cross-section.',
  'Opacity reacts to modTrans — set it high to feel every transient in the wireframe.',
  'Color cycle at 1.0 with contrasting colorA/B creates a full spectral sweep per bar.',
  // Humorous
  'Subwoofer strongly recommended. Laptop speakers will try their best. They will fail.',
  'If it looks right, turn it up. If it looks wrong, turn it up more.',
  'The system has detected your taste in music. Results: inconclusive. Sample size: 1.',
  'Note: ghost mode is accessible via [~]. This has not been confirmed. Good luck.',
];

// Short inline hints — shown mid-boot in varying styles
const INLINE_TIPS = [
  '// [undocumented]  try [~] while the terrain is running',
  '// colour gradient driven by IEC 61672 A-weighting curve',
  '// all 6 camera positions are editable in the Director tab',
  '// drag a .json config onto the window to restore a session',
  '// LFO rate 0.25 = one cycle per 4 beats at any BPM',
  '// bowl exponent > 3 creates near-vertical crater walls',
  '// [undocumented]  clean mode URL: ?clean or ?obs',
  '// terrain: 60 rows × 128 cols — 7,680 vertices per frame',
  '// stereo FFT pair — L channel maps left half, R maps right',
  '// modTrans reacts to onset detection, not raw amplitude',
];

// ── Canvas animation helpers ─────────────────────────────────────────────────

function makeCanvas(container) {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  container.appendChild(c);
  c.width  = container.clientWidth  || window.innerWidth;
  c.height = container.clientHeight || window.innerHeight;
  return c;
}

// ── Animation 1: Vector Converge ──────────────────────────────────────────
// Geometric lines fly in from the corners to form a central "Diamond" logo.
async function animVector(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();
  const cx = W / 2, cy = H / 2;

  const dur = 2000;
  const start = performance.now();

  return new Promise(resolve => {
    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      const ease = 1 - Math.pow(1 - t, 4); // Strong outward ease

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      
      ctx.globalCompositeOperation = 'lighter';
      const alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      
      // Draw converging vectors
      const size = Math.min(W, H) * 0.2;
      const off = (1 - ease) * 1000;

      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const px = cx + Math.cos(angle) * (size + off);
        const py = cy + Math.sin(angle) * (size + off);
        
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Crosshairs
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - 20, py); ctx.lineTo(px + 20, py);
        ctx.moveTo(px, py - 20); ctx.lineTo(px, py + 20);
        ctx.stroke();
      }

      // Central Diamond forming
      if (t > 0.5) {
        const dAlpha = (t - 0.5) * 2;
        ctx.strokeStyle = `rgba(${r},${g},${b},${dAlpha * alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx, cy + size);
        ctx.lineTo(cx - size, cy);
        ctx.closePath();
        ctx.stroke();
        
        // Inner detail
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - size/2, cy - size/2, size, size);
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 300); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 2: Raster Scan ─────────────────────────────────────────────
// Amiga-style horizontal stripes that build a geometric silhouette.
async function animRaster(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();
  const [tr, tg, tb] = [209, 194, 217]; // Tertiary lavender

  const dur = 2200;
  const start = performance.now();

  return new Promise(resolve => {
    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      const numBars = 12;
      const barH = H / numBars;

      for (let i = 0; i < numBars; i++) {
        const speed = 1 + i * 0.2;
        const xOff = Math.sin(t * 5 + i) * 100 * (1 - t);
        const alpha = Math.sin(t * Math.PI) * 0.6;
        
        // Horizontal scan bars
        ctx.fillStyle = i % 2 === 0 ? `rgba(${r},${g},${b},${alpha})` : `rgba(${tr},${tg},${tb},${alpha})`;
        ctx.fillRect(0, i * barH, W, 2);

        // Blocks that fly across
        const bx = ((t * speed * W) % (W * 2)) - W/2 + xOff;
        ctx.fillRect(bx, i * barH - 10, 40, 20);
      }

      // Central "Logo" Frame appearing
      ctx.strokeStyle = `rgba(${r},${g},${b},${t})`;
      ctx.lineWidth = 40 * (1 - t);
      ctx.strokeRect(W/4, H/4, W/2, H/2);

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 200); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 3: Geometry Boot ──────────────────────────────────────────
// 3D Wireframe cubes initializing in a grid, mimicking early geometry engines.
async function animGeometry(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();

  const dur = 2400;
  const start = performance.now();

  function project(x, y, z, t) {
    const rot = t * Math.PI;
    const x1 = x * Math.cos(rot) - z * Math.sin(rot);
    const z1 = x * Math.sin(rot) + z * Math.cos(rot);
    const scale = 400 / (400 + z1);
    return { x: W/2 + x1 * scale, y: H/2 + y * scale };
  }

  return new Promise(resolve => {
    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      const alpha = Math.sin(t * Math.PI);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.7})`;
      ctx.lineWidth = 1.5;

      const size = 100;
      const pts = [
        [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
        [-1,-1,1],  [1,-1,1],  [1,1,1],  [-1,1,1]
      ];
      const lines = [
        [0,1],[1,2],[2,3],[3,0], [4,5],[5,6],[6,7],[7,4], [0,4],[1,5],[2,6],[3,7]
      ];

      lines.forEach(([a, b]) => {
        const p1 = project(pts[a][0]*size, pts[a][1]*size, pts[a][2]*size, t);
        const p2 = project(pts[b][0]*size, pts[b][1]*size, pts[b][2]*size, t);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      // Binary status code rain in background
      ctx.font = '10px monospace';
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.2})`;
      for (let i = 0; i < 20; i++) {
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', (i/20)*W, (t*H + i*20)%H);
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 300); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 4: Signal Sync ─────────────────────────────────────────────
// A circular scope sync animation that "locks" onto the visualiser signature.
async function animSignal(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();
  const cx = W / 2, cy = H / 2;

  const dur = 2600;
  const start = performance.now();

  return new Promise(resolve => {
    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      const ease = Math.sin(t * Math.PI);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // Radar rings
      ctx.strokeStyle = `rgba(${r},${g},${b},${ease * 0.4})`;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, i * 100 * t, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sine wave circle
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${r},${g},${b},${ease})`;
      ctx.lineWidth = 2;
      for (let a = 0; a <= 100; a++) {
        const angle = (a / 100) * Math.PI * 2;
        const rad = 150 + Math.sin(angle * 8 + t * 20) * 20 * ease;
        const px = cx + Math.cos(angle) * rad;
        const py = cy + Math.sin(angle) * rad;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // "Locking" text
      if (t > 0.7) {
        ctx.fillStyle = `rgba(${r},${g},${b},${(t-0.7)*3})`;
        ctx.font = '12px Courier';
        ctx.fillText('SIGNAL_LOCKED', cx + 170, cy);
        ctx.fillRect(cx - 200, cy, 400 * (t), 1);
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 200); }
    }
    requestAnimationFrame(frame);
  });
}

const INTRO_ANIMS = [animVector, animRaster, animGeometry, animSignal];

// ── Retro PC Audio ───────────────────────────────────────────────────────────
class BootAudio {
  constructor() {
    this.ctx = null;
    this.lpf = null;
    this.mainLpf = null; // Reference to the main audio chain LPF
  }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.lpf = this.ctx.createBiquadFilter();
    this.lpf.type = 'lowpass';
    this.lpf.frequency.value = 1200; // Muffled 90s chassis sound
    this.lpf.connect(this.ctx.destination);
  }

  setMainLpf(lpfNode) {
    this.mainLpf = lpfNode;
  }

  beep(freq = 880, dur = 0.1, type = 'sine') {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.05, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(g);
    g.connect(this.lpf);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  // Power-up chord sweep
  powerUpSweep(duration = 1.5) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + duration);
    
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    osc.connect(g);
    g.connect(this.lpf);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // LPF sweep on main audio chain (during startup sound)
  sweepMainLpf(startFreq = 165, endFreq = 5000, duration = 3.5) {
    if (!this.mainLpf) return Promise.resolve();
    
    return new Promise(resolve => {
      const startTime = this.mainLpf.context.currentTime;
      this.mainLpf.frequency.setValueAtTime(startFreq, startTime);
      this.mainLpf.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
      setTimeout(() => resolve(), duration * 1000);
    });
  }

  // Subtle HDD "chug" noise
  chug() {
    if (!this.ctx) return;
    const bufSize = this.ctx.sampleRate * 0.05;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.02, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    src.connect(g);
    g.connect(this.lpf);
    src.start();
  }
}

// ── Boot Screen Class ─────────────────────────────────────────────────────────

export class BootScreen {
  constructor(terminalEl) {
    this.el = terminalEl;
    this.skipped = false;   // S key: abort everything
    this.phaseSkip = 0;     // click: advance to next section
    this._phase = -1;       // current section index
    this.audio = new BootAudio();
  }

  /** True if this section should collapse (either advance-click or full skip). */
  _sk() { return this.skipped || this.phaseSkip > this._phase; }

  /** Left-click: jump to the next section. */
  advance() { this.phaseSkip++; }

  _line(text, cls = '') {
    if (!this._sk()) this.audio.chug();
    const d = document.createElement('div');
    d.className = 'boot-line' + (cls ? ' ' + cls : '');
    d.innerHTML = text;
    this.el.appendChild(d);
    this.el.scrollTop = this.el.scrollHeight;
    return d;
  }

  async _type(text, delay = 6, cls = '') {
    const d = document.createElement('div');
    d.className = 'boot-line' + (cls ? ' ' + cls : '');
    this.el.appendChild(d);
    if (this._sk()) { d.innerHTML = text; return; }

    const plain = text.replace(/<[^>]*>/g, '');
    for (let i = 0; i < plain.length; i++) {
      if (this._sk()) { d.innerHTML = text; return; }
      d.textContent = plain.slice(0, i + 1);
      this.el.scrollTop = this.el.scrollHeight;
      await this._sleep(delay);
    }
    d.innerHTML = text;
  }

  async _bar(label, duration = 120) {
    const d = document.createElement('div');
    d.className = 'boot-line';
    this.el.appendChild(d);
    const W = 24;
    if (this._sk()) { d.innerHTML = `${label}[${'█'.repeat(W)}] <span class="boot-ok">OK</span>`; return; }
    for (let i = 0; i <= W; i++) {
      if (this._sk()) { i = W; }
      d.innerHTML = `${label}[${'█'.repeat(i)}${'░'.repeat(W - i)}]`;
      this.audio.chug();
      await this._sleep(duration / W);
    }
    d.innerHTML += ' <span class="boot-ok">OK</span>';
  }

  async _memtest(target = 131072) {
    const d = document.createElement('div');
    d.className = 'boot-line';
    this.el.appendChild(d);
    const step = 8192;
    for (let v = 0; v <= target; v += step) {
      if (this._sk()) { v = target; }
      d.textContent = `Memory Test: ${(v / 1024).toFixed(0).padStart(4)}K`;
      this.audio.chug();
      await this._sleep(this._sk() ? 0 : 18);
    }
    d.textContent = `Memory Test:  ${target / 1024}K OK`;
  }

  async _dots(n = 14) {
    const d = document.createElement('div');
    d.className = 'boot-line boot-dim';
    this.el.appendChild(d);
    for (let i = 0; i < n; i++) {
      if (this._sk()) { d.textContent = '.'.repeat(n); return; }
      d.textContent += '.';
      this.audio.chug();
      await this._sleep(35);
    }
  }

  async _perfTests() {
    const tests = [
      { l: 'FFT_RADIX2_1024    ', ms: 0.6 + Math.random() * 0.4 },
      { l: 'HANN_WINDOW_GEN    ', ms: 0.1 + Math.random() * 0.2 },
      { l: 'ENVELOPE_SLEW_6BND ', ms: 0.1 + Math.random() * 0.15 },
      { l: 'BIN_MAP_BUILD_DNB  ', ms: 0.3 + Math.random() * 0.2 },
      { l: 'VERTEX_DISP_60ROW  ', ms: 0.8 + Math.random() * 0.6 },
      { l: 'MORPH_LERP_BLEND   ', ms: 0.2 + Math.random() * 0.3 },
      { l: 'A_WEIGHT_CURVE_GEN ', ms: 0.15 + Math.random() * 0.1 },
    ];
    for (const t of tests) {
      if (this._sk()) {
        this._line(`  running ${t.l}${t.ms.toFixed(2).padStart(5)}ms  [PASSED]`, 'boot-ok');
        continue;
      }
      const d = this._line(`  running ${t.l}...`);
      await this._sleep(50 + Math.random() * 80);
      d.innerHTML = `  running ${t.l}${t.ms.toFixed(2).padStart(5)}ms  <span class="boot-ok">[PASSED]</span>`;
      this.audio.beep(440, 0.05);
    }
  }

  _sleep(ms) {
    if (this._sk() || ms <= 0) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
  }

  // ── ASCII widgets ──────────────────────────────────────────────────────────

  /** Oscilloscope pulse: a single animated scan-line that builds then decays. */
  async _scopePulse() {
    const W = 48;
    const d = document.createElement('div');
    d.className = 'boot-line boot-dim';
    this.el.appendChild(d);
    const frames = 18;
    for (let f = 0; f <= frames; f++) {
      if (this._sk()) { d.remove(); return; }
      const t = f / frames;
      const row = Array.from({ length: W }, (_, i) => {
        const x = (i / W - 0.5) * Math.PI * 4;
        const y = Math.sin(x + t * Math.PI * 4) * (1 - t * 0.7);
        if (y > 0.55) return '▄';
        if (y > 0.15) return '▃';
        if (y > -0.15) return '─';
        if (y > -0.55) return '▁';
        return ' ';
      }).join('');
      d.textContent = '  ' + row;
      await this._sleep(28);
    }
    await this._sleep(60);
    d.remove();
  }

  /** Branching tree grows upward from a single trunk — 7 lines, random splits. */
  async _branchTree() {
    const segs = [
      '         │         ',
      '        ╱│╲        ',
      '       ╱ │ ╲       ',
      '      ╱  ╪  ╲      ',
      '    ╱╲  ╱ ╲  ╱╲   ',
      '   ╱  ╲╱   ╲╱  ╲  ',
      '  ───────────────  ',
    ];
    const lines = [];
    for (let i = segs.length - 1; i >= 0; i--) {
      if (this._sk()) { lines.forEach(l => l.remove()); return; }
      const d = this._line(segs[i], 'boot-dim');
      lines.push(d);
      this.audio.beep(220 + i * 60, 0.04, 'sine');
      await this._sleep(55);
    }
    await this._sleep(180);
    for (const l of lines) l.remove();
  }

  /** Echo text: a word printed then reverbed into silence. */
  async _echoText(word = 'INITIALISING') {
    const steps = 5;
    const lines = [];
    for (let i = 0; i < steps; i++) {
      if (this._sk()) { lines.forEach(l => l.remove()); return; }
      const fade = ['', '·', ':', '·.', '  .'][i] ?? '';
      const spaces = '  '.repeat(i);
      const d = this._line(spaces + word + fade, i === 0 ? 'boot-accent' : 'boot-dim');
      lines.push(d);
      this.audio.beep(880 / (1 + i * 0.4), 0.03, 'sine');
      await this._sleep(70 + i * 20);
    }
    await this._sleep(200);
    lines.forEach(l => l.remove());
  }

  /**
   * Show a tip in one of several randomly chosen presentation styles.
   * @param {string} tip  Full tip text.
   * @param {string[]} pool  Source pool to draw inline hints from.
   */
  async _tipBlock(tip, pool = INLINE_TIPS) {
    const style = Math.floor(Math.random() * 4);
    if (style === 0) {
      // Plain comment style
      const hint = pool[Math.floor(Math.random() * pool.length)];
      this._line('');
      await this._type(hint, 3, 'boot-dim');
      await this._type(`  → ${tip}`, 3, 'boot-dim');
      this._line('');
    } else if (style === 1) {
      // Framed block
      const bar = '─'.repeat(Math.min(tip.length + 4, 56));
      this._line('');
      this._line(`┌─ TIP ${'─'.repeat(Math.max(0, 50 - tip.length))}┐`, 'boot-tertiary');
      await this._type(`│  ${tip.padEnd(52)}│`, 3, 'boot-dim');
      this._line(`└${bar}┘`, 'boot-tertiary');
      this._line('');
    } else if (style === 2) {
      // Echo-style: the tip appears then fades
      await this._echoText(tip.slice(0, 28).toUpperCase());
    } else {
      // Inline hint + tip on same block, no framing
      const hint = pool[Math.floor(Math.random() * pool.length)];
      this._line('');
      this._line(hint, 'boot-dim');
      await this._type(`  TIP  ${tip}`, 3, 'boot-dim');
      this._line('');
    }
    await this._sleep(60);
  }

  /** Fast-boot path: skip intro animation, show 5 BIOS lines, launch. */
  async runFast() {
    this.audio.init();
    this.audio.beep(880, 0.08, 'square');
    await this._sleep(60);
    this.audio.beep(1320, 0.06, 'sine');

    const FAST_LINES = [
      { text: 'SUB-SURFACE AVATAR  v0.9  (C) 2024  sub-surface', cls: 'boot-tertiary' },
      { text: 'WaveCore DSP-X @ 44.1kHz  ·  FFT 1024-bin stereo  ·  WebGL 2.0 .... <span class="boot-ok">OK</span>' },
      { text: 'Memory Test: 131072K  ·  Terrain 60×128  ·  A-weight IEC 61672 .... <span class="boot-ok">OK</span>' },
      { text: '<span class="boot-dim">Pro tip: your subwoofer is legally required to participate in this experience.</span>' },
      { text: '<span class="boot-accent">System ready.</span>  Initiating visualiser...', cls: 'boot-bright' },
    ];

    for (const entry of FAST_LINES) {
      this._line(entry.text, entry.cls || '');
      await this._sleep(60);
    }

    this.audio.powerUpSweep(0.6);
    await this._sleep(300);
  }

  async run(containerEl) {
    this.audio.init();
    this.audio.beep(880, 0.15, 'square');
    await this._sleep(80);
    this.audio.beep(1200, 0.1, 'sine');
    await this._sleep(50);
    this.audio.beep(660, 0.12, 'sine');

    // Shuffle a copy of TIPS so we can pop without repeats
    const tipPool = [...TIPS].sort(() => Math.random() - 0.5);
    const nextTip = () => tipPool.length ? tipPool.pop() : TIPS[0];

    // Phase 0: Intro animation
    this._phase = 0;
    const anim = INTRO_ANIMS[Math.floor(Math.random() * INTRO_ANIMS.length)];
    await anim(containerEl, () => this._sk());
    if (this.skipped) return;

    // Phase 1: ASCII widget
    this._phase = 1;
    const widgets = [
      () => this._scopePulse(),
      () => this._branchTree(),
      () => this._echoText('INITIALISING'),
    ];
    await widgets[Math.floor(Math.random() * widgets.length)]();
    if (this.skipped) return;

    // Phase 2: BIOS POST
    this._phase = 2;
    this._line('');

    for (const entry of BIOS_LINES) {
      if (this.skipped) break;
      if (entry.action === 'memtest') { await this._memtest(); continue; }
      if (entry.action === 'dots')    { await this._dots();    continue; }
      if (entry.text === '') { this._line(''); await this._sleep(entry.delay ? entry.delay / 2 : 0); continue; }
      await this._type(entry.text, entry.delay ? Math.max(1, entry.delay / 4) : 2);
      await this._sleep(10);
    }
    if (this.skipped) return;

    // Random mid-boot tip — appears once during the BIOS phase
    await this._tipBlock(nextTip());
    if (this.skipped) return;

    this._line('');
    this.audio.beep(1100, 0.1, 'square');
    await this._perfTests();
    await this._sleep(100);
    if (this.skipped) return;

    this.audio.powerUpSweep(1.2);

    // Phase 3: Logo + loading bars + tip
    this._phase = 3;
    this.el.innerHTML = '';

    for (const line of ASCII_LOGO_SIMPLE) {
      this._line(line, 'boot-logo');
      await this._sleep(10);
    }
    this._line('');
    await this._sleep(50);
    if (this.skipped) return;

    for (const line of ONBOARDING_HEADER) {
      this._line(line, 'boot-header');
      await this._sleep(10);
    }
    this._line('');
    await this._sleep(50);
    if (this.skipped) return;

    for (const step of LOADING_STEPS) {
      if (this.skipped) break;
      await this._bar(step.label, step.duration / 3);
      await this._sleep(5);
    }
    await this._sleep(100);
    if (this.skipped) return;

    // Final tip — different style each boot
    await this._tipBlock(nextTip());
    if (this.skipped) return;

    this._line('');
    this.audio.beep(880, 0.1, 'sine');
    await this._type('  System ready. Initialising visualiser...', 4, 'boot-bright');
    await this._sleep(200);
  }
}
