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
  { text: '┌──────────────────────────────────────────────────────────┐', delay: 2 },
  { text: '│  SUB-SURFACE DSP-CORE BIOS  v1.0.0  (C) 2024  sub-surface│', delay: 2 },
  { text: '│  WaveCore FFT Engine · WebGL Terrain Renderer · WebCodecs│', delay: 2 },
  { text: '└──────────────────────────────────────────────────────────┘', delay: 2 },
  { text: '', delay: 60 },
  { text: 'Main Processor  : WaveCore DSP-X  @ 44.1kHz / 48kHz', delay: 8 },
  { text: 'Co-Processor    : FFT Radix-2  (1024-bin stereo pair)', delay: 8 },
  { text: 'Geometry Engine : Three.js r169  (LineBasicMaterial)', delay: 8 },
  { text: 'Codec Unit      : WebCodecs  AVC1 / AAC  (30fps, 25Mbps)', delay: 8 },
  { text: '', delay: 60 },
  { text: 'Memory Test: ', delay: 5, action: null },
  { text: null, action: 'memtest' },
  { text: '', delay: 50 },
  { text: 'Detecting WebGL ........... 2.0 (antialias, preserveBuffer)', delay: 8 },
  { text: 'Detecting Web Audio API ... AnalyserNode  stereo pair', delay: 8 },
  { text: 'Detecting WebCodecs ....... VideoEncoder + AudioEncoder  OK', delay: 8 },
  { text: '', delay: 40 },
  { text: 'Terrain geometry  60 rows × 128 cols  (7,680 vertices) .... OK', delay: 8 },
  { text: 'A-weighting curve  IEC 61672  peak @ 3.5 kHz ............. OK', delay: 8 },
  { text: 'BPM auto-detect   onset threshold 0.35  window 24 beats .. OK', delay: 8 },
  { text: 'Envelope slew     ATK 0.05  REL sub:0.82  kick:0.70 ...... OK', delay: 8 },
  { text: '', delay: 40 },
  { text: 'Microphone ....... Permission pending', delay: 8 },
  { text: 'Subwoofer ........ Strongly recommended', delay: 8 },
  { text: 'Mouse ............ Not found  (hover is enough)', delay: 8 },
  { text: 'Soul ............. Waveform detected  ∿∿∿∿∿∿∿∿∿∿', delay: 8 },
  { text: '', delay: 50 },
  { text: 'Loading AVATAR OS ...', delay: 5 },
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
  'Bowl exponent controls crater wall steepness — try values between 1.5 and 4.',
  'Press [1-4] to switch visualisation modes live, or [space] to toggle export/live.',
  'The LFO rate is BPM-synced — 0.25 cycles/beat = one full sweep per bar.',
  'DNB mode gives 25% of columns to sub-bass (40–180 Hz) for kick clarity.',
  'Sphere mode auto-rotates at 0.005 rad/frame — use modRms for zoom reactivity.',
  'LFO 2 modulates the lowpass filter — use with lfoDepth for timbral animation.',
  'Export renders at 30 FPS through 6 camera styles triggered by audio peaks.',
  'Drag any audio file onto the window — WAV, MP3, FLAC, AAC all supported.',
  'Director mode lets you reposition the 6 export camera styles precisely.',
  'Clean mode hides all UI — hover the screen edges to reveal controls.',
  'A-weighting peaks at ~3.5 kHz per IEC 61672 — this shapes the colour gradient.',
  'Config export (↓) saves your full parameter set as JSON for sharing.',
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

// ── Animation 1: Terrain Materialise ────────────────────────────────────────
// Joy Division-style terrain rows build from silence to full amplitude.
// Uses procedural noise seeded differently each run.
async function animTerrain(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();

  // Random seed for procedural variation
  const seed = Math.random() * 1000;
  const numRows = 24 + Math.floor(Math.random() * 16); // 24–40 rows
  const rowH = H / (numRows + 2);
  const rowDur = 40 + Math.random() * 30; // ms per row materialise

  // Noise function (deterministic per seed)
  function noise(x, row) {
    const s = seed + row * 137.508;
    return Math.sin(x * 0.08 + s) * 0.5
         + Math.sin(x * 0.03 + s * 2.1) * 0.3
         + Math.sin(x * 0.15 + s * 0.7) * 0.2
         + Math.sin(x * 0.25 + s * 3.3) * 0.1
         + (Math.sin(x * 0.01 + s) > 0.5 ? Math.sin(x * 0.4 + s) * 0.15 : 0);
  }

  // Precompute all rows
  const rows = [];
  for (let row = 0; row < numRows; row++) {
    const pts = [];
    const baseY = H - rowH * (row + 1);
    const amp   = rowH * 0.4 * (row / numRows); // grows toward center
    for (let x = 0; x < W; x += 3) {
      pts.push({ x, y: baseY - noise(x, row) * amp });
    }
    rows.push(pts);
  }

  let drawn = 0;
  const total = numRows;
  const dur = rowDur * total;
  const start = performance.now();

  return new Promise(resolve => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      const targetRow = Math.floor(t * total);

      // Draw new rows since last frame
      while (drawn <= targetRow && drawn < total) {
        const row = drawn;
        const pts = rows[row];
        const alpha = 0.6 + 0.4 * (row / total);

        // Erase area below this row line (black fill = terrain "foreground")
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(0, H);
        pts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();

        // Draw the terrain line
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = `rgba(${r},${g},${b},0.4)`;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        drawn++;
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 400); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 2: Waveform Reveal ─────────────────────────────────────────────
// A flat horizon line that erupts into a complex stereo waveform,
// then fades revealing the terminal beneath.
async function animWaveform(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();
  const cy = H / 2;

  const seed = Math.random() * 1000;
  const dur = 2200;
  const start = performance.now();

  // Build a complex waveform from multiple harmonics (unique each run)
  const harmonics = Array.from({ length: 6 + Math.floor(Math.random() * 6) }, (_, i) => ({
    freq: 0.005 + Math.random() * 0.04,
    amp:  0.5 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
  }));

  function waveY(x, t) {
    return harmonics.reduce((sum, h) => sum + Math.sin(x * h.freq + h.phase + t * 2) * h.amp, 0);
  }

  return new Promise(resolve => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      const ease = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2; // rise and fall

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);

      const amp = ease * (H * 0.18);

      // Draw 3 layered waveforms (stereo separation feel)
      for (let layer = 2; layer >= 0; layer--) {
        const alpha = (0.3 + layer * 0.25) * ease;
        const offset = (layer - 1) * 12;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = layer === 2 ? 1.5 : 0.8;
        ctx.shadowColor = `rgba(${r},${g},${b},${alpha * 0.6})`;
        ctx.shadowBlur = layer === 2 ? 8 : 0;
        ctx.beginPath();
        for (let x = 0; x < W; x += 2) {
          const y = cy + offset + waveY(x, t * 4) * amp;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Horizontal centre rule fades in
      ctx.strokeStyle = `rgba(${r},${g},${b},${ease * 0.2})`;
      ctx.lineWidth = 0.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.stroke();

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 200); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 3: Grid Pulse ───────────────────────────────────────────────────
// The invisible 60×128 vertex grid of the visualiser pulses to life
// as points appear and connect from centre outward, then fade.
async function animGrid(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();

  const ROWS = 32 + Math.floor(Math.random() * 16);
  const COLS = 64 + Math.floor(Math.random() * 32);
  const cellW = W / COLS, cellH = H / ROWS;
  const dur = 2400;
  const start = performance.now();

  // Each point has a random activation time based on distance from centre
  const cx = COLS / 2, cy = ROWS / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const pts = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const dx = col - cx, dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      const jitter = Math.random() * 0.15;
      pts.push({ row, col, t: dist * 0.7 + jitter });
    }
  }

  return new Promise(resolve => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = Math.min((performance.now() - start) / dur, 1);

      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, W, H);

      for (const p of pts) {
        if (p.t > t) continue;
        const age = (t - p.t) / 0.3;
        const alpha = age < 1 ? age : Math.max(0, 1 - (age - 1) * 0.5);
        if (alpha <= 0) continue;

        const px = (p.col + 0.5) * cellW;
        const py = (p.row + 0.5) * cellH;

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.7})`;
        ctx.shadowColor = `rgba(${r},${g},${b},${alpha * 0.5})`;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 300); }
    }
    requestAnimationFrame(frame);
  });
}

// ── Animation 4: Frequency Spectrum Bars ─────────────────────────────────────
// Fake FFT bars (procedurally animated) that build up, hold, then collapse,
// evoking the visualiser's own spectrum analyser aesthetic.
async function animSpectrum(container, skipped) {
  const c = makeCanvas(container);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const [r, g, b] = accentRgb();

  const NUM_BARS = 80 + Math.floor(Math.random() * 40);
  const seed = Math.random() * 1000;
  const dur = 2600;
  const start = performance.now();

  // Each bar has an independent sine oscillator
  const bars = Array.from({ length: NUM_BARS }, (_, i) => ({
    freq:  0.8 + Math.random() * 3,
    phase: (i / NUM_BARS) * Math.PI * 2 + seed,
    peak:  0.3 + Math.pow(Math.random(), 1.5) * 0.7,
  }));

  const barW = W / NUM_BARS;

  return new Promise(resolve => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    function frame() {
      if (skipped()) { c.remove(); resolve(); return; }
      const t = (performance.now() - start) / dur;
      // Envelope: rise (0-0.3), hold (0.3-0.7), fall (0.7-1.0)
      const env = t < 0.3 ? t / 0.3 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < NUM_BARS; i++) {
        const bar = bars[i];
        const raw = (Math.sin(t * bar.freq * Math.PI * 2 + bar.phase) + 1) / 2;
        const h = raw * bar.peak * env * H * 0.7;
        const x = i * barW;
        const alpha = 0.4 + env * 0.5;

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.shadowColor = `rgba(${r},${g},${b},0.3)`;
        ctx.shadowBlur = 3;
        ctx.fillRect(x + 1, H - h, barW - 2, h);
      }

      if (t < 1) requestAnimationFrame(frame);
      else { setTimeout(() => { c.remove(); resolve(); }, 200); }
    }
    requestAnimationFrame(frame);
  });
}

const INTRO_ANIMS = [animTerrain, animWaveform, animGrid, animSpectrum];

// ── Boot Screen Class ─────────────────────────────────────────────────────────

export class BootScreen {
  constructor(terminalEl) {
    this.el = terminalEl;
    this.skipped = false;
  }

  _sk() { return this.skipped; }

  _line(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'boot-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    this.el.appendChild(d);
    this.el.scrollTop = this.el.scrollHeight;
    return d;
  }

  async _type(text, delay = 6, cls = '') {
    const d = document.createElement('div');
    d.className = 'boot-line' + (cls ? ' ' + cls : '');
    this.el.appendChild(d);
    if (this.skipped) { d.textContent = text; return; }
    for (let i = 0; i < text.length; i++) {
      if (this.skipped) { d.textContent = text; return; }
      d.textContent = text.slice(0, i + 1);
      this.el.scrollTop = this.el.scrollHeight;
      await this._sleep(delay);
    }
  }

  async _bar(label, duration = 120) {
    const d = document.createElement('div');
    d.className = 'boot-line';
    this.el.appendChild(d);
    const W = 24;
    if (this.skipped) { d.textContent = `${label}[${'█'.repeat(W)}] OK`; d.classList.add('boot-ok'); return; }
    for (let i = 0; i <= W; i++) {
      if (this.skipped) { i = W; }
      d.textContent = `${label}[${'█'.repeat(i)}${'░'.repeat(W - i)}]`;
      await this._sleep(duration / W);
    }
    d.textContent += ' OK';
    d.classList.add('boot-ok');
  }

  async _memtest(target = 131072) {
    const d = document.createElement('div');
    d.className = 'boot-line';
    this.el.appendChild(d);
    const step = 8192;
    for (let v = 0; v <= target; v += step) {
      if (this.skipped) { v = target; }
      d.textContent = `Memory Test: ${(v / 1024).toFixed(0).padStart(4)}K`;
      await this._sleep(this.skipped ? 0 : 18);
    }
    d.textContent = `Memory Test:  ${target / 1024}K OK`;
  }

  async _dots(n = 14) {
    const d = document.createElement('div');
    d.className = 'boot-line boot-dim';
    this.el.appendChild(d);
    for (let i = 0; i < n; i++) {
      if (this.skipped) { d.textContent = '.'.repeat(n); return; }
      d.textContent += '.';
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
      if (this.skipped) {
        this._line(`  running ${t.l}${t.ms.toFixed(2).padStart(5)}ms  [PASSED]`, 'boot-ok');
        continue;
      }
      const d = this._line(`  running ${t.l}...`);
      await this._sleep(50 + Math.random() * 80);
      d.textContent = `  running ${t.l}${t.ms.toFixed(2).padStart(5)}ms  [PASSED]`;
      d.classList.add('boot-ok');
    }
  }

  _sleep(ms) {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
  }

  async run(containerEl) {
    // Phase 0: Intro animation
    const anim = INTRO_ANIMS[Math.floor(Math.random() * INTRO_ANIMS.length)];
    await anim(containerEl, () => this.skipped);
    if (this.skipped) return;

    // Phase 1: BIOS POST
    // Skip indicator appears immediately in the terminal
    const skipHint = this._line('  [SPACE] — skip boot sequence', 'boot-skip-hint');
    this._line('');

    for (const entry of BIOS_LINES) {
      if (this.skipped) break;
      if (entry.action === 'memtest') { await this._memtest(); continue; }
      if (entry.action === 'dots')    { await this._dots();    continue; }
      if (entry.text === '') { this._line(''); await this._sleep(entry.delay || 0); continue; }
      await this._type(entry.text, entry.delay || 6);
      await this._sleep(30);
    }
    if (this.skipped) return;

    this._line('');
    await this._perfTests();
    await this._sleep(200);
    if (this.skipped) return;

    // Phase 2: Logo + init steps
    this.el.innerHTML = '';

    for (const line of ASCII_LOGO_SIMPLE) {
      this._line(line, 'boot-logo');
      await this._sleep(30);
    }
    this._line('');
    await this._sleep(100);
    if (this.skipped) return;

    for (const line of ONBOARDING_HEADER) {
      this._line(line, 'boot-header');
      await this._sleep(35);
    }
    this._line('');
    await this._sleep(150);
    if (this.skipped) return;

    for (const step of LOADING_STEPS) {
      if (this.skipped) break;
      await this._bar(step.label, step.duration);
      await this._sleep(20);
    }
    await this._sleep(200);
    if (this.skipped) return;

    this._line('');
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    await this._type(`  TIP  ${tip}`, 7, 'boot-dim');
    await this._sleep(300);
    if (this.skipped) return;

    this._line('');
    await this._type('  System ready. Initialising visualiser...', 8, 'boot-bright');
    await this._sleep(500);
  }
}
