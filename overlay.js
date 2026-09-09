/**
 * overlay.js — canvas 2D text compositing for export.
 *
 * WebGL canvases can't have a 2D context, so we use a separate offscreen
 * canvas: draw the WebGL frame onto it, draw text on top, then return
 * the composited canvas for VideoFrame capture.
 */

let _compCanvas = null;
let _compCtx    = null;

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Allocate the compositing canvas at the given export resolution.
 * Call once before the export loop starts.
 */
export function initOverlayCanvas(width, height) {
  _compCanvas        = document.createElement('canvas');
  _compCanvas.width  = width;
  _compCanvas.height = height;
  _compCtx           = _compCanvas.getContext('2d');
}

/** Release the compositing canvas after export. */
export function freeOverlayCanvas() {
  _compCanvas = null;
  _compCtx    = null;
}

/**
 * Composite the WebGL frame + text overlay onto the offscreen 2D canvas.
 * Returns the canvas to pass to `new VideoFrame(...)`.
 *
 * @param {HTMLCanvasElement} glCanvas  - renderer.domElement (WebGL)
 * @param {{ artist?:string, title?:string, bpm?:string, genre?:string }} meta
 * @param {number} time     - current playback time in seconds
 * @param {number} duration - total duration in seconds
 * @param {string} visMode  - current visualisation mode (bowl, polar, sphere, wave)
 * @returns {HTMLCanvasElement} the composited 2D canvas
 */
export function compositeFrame(glCanvas, meta, time, duration, visMode) {
  // Auto-init if not already allocated (e.g. for test captures)
  if (!_compCanvas) initOverlayCanvas(glCanvas.width, glCanvas.height);

  const w   = _compCanvas.width;
  const h   = _compCanvas.height;
  const ctx = _compCtx;

  // 1. Draw the WebGL frame
  ctx.drawImage(glCanvas, 0, 0, w, h);

  // 2. Draw text overlay if there's any metadata to show
  if (!meta.artist && !meta.title && !meta.bpm && !meta.genre) return _compCanvas;

  const scale = h / 1080;
  let cx = w / 2;
  let y  = h * 0.10;
  let align = 'center';
  const isLowRes = h < 600;

  // Layout overrides for export
  if (visMode === 'wave') {
    y = h * 0.82; // Move to bottom
  } else if (visMode === 'sphere' && w > h) {
    // Side-by-side layout: text left, visualiser right
    cx = w * 0.08; 
    y  = h * 0.45;
    align = 'left';
  }

  const drawText = (txt, x, y, font, style) => {
    ctx.font = font;
    ctx.fillStyle = style;
    ctx.textAlign = align;
    
    if (isLowRes) {
      // Punchy shadow for low-res legibility
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4 * (h/480);
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
    }
    
    ctx.fillText(txt, x, y);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  const monoSmall = `${isLowRes ? '400' : '300'} ${Math.round(13 * (isLowRes ? scale * 1.5 : scale))}px "DM Mono", "Courier New", monospace`;
  const serifLarge = `italic ${isLowRes ? '500' : '400'} ${Math.round(34 * (isLowRes ? scale * 1.5 : scale))}px "DM Serif Display", Georgia, serif`;
  const monoTiny = `${isLowRes ? '400' : '300'} ${Math.round(11 * (isLowRes ? scale * 1.5 : scale))}px "DM Mono", "Courier New", monospace`;

  // Colors: use current UI palette accent, fall back to defaults
  const accentRgb = getComputedStyle(document.documentElement)
    .getPropertyValue('--ui-accent-rgb').trim() || '162, 182, 192';
  const titleAlpha  = isLowRes ? 0.95 : 0.85;
  const artistAlpha = isLowRes ? 0.95 : 0.80;
  const ruleAlpha   = isLowRes ? 0.40 : 0.20;
  const pillAlpha   = isLowRes ? 0.70 : 0.45;
  const colMauve = `rgba(${accentRgb}, ${artistAlpha})`;
  const colSlate = `rgba(${accentRgb}, ${titleAlpha})`;
  const colRule  = `rgba(${accentRgb}, ${ruleAlpha})`;
  const colPills = `rgba(${accentRgb}, ${pillAlpha})`;

  // Artist
  if (meta.artist) {
    drawText(meta.artist.toUpperCase(), cx, y, monoSmall, colMauve);
    y += Math.round(20 * scale);
  }

  // Title
  if (meta.title) {
    const titleSize = Math.round(34 * (isLowRes ? scale * 1.5 : scale));
    drawText(meta.title, cx, y + titleSize, serifLarge, colSlate);
    y += titleSize + Math.round(14 * scale);
  }

  // Hairline rule
  if (meta.title || meta.artist) {
    const ruleW = Math.round(100 * (isLowRes ? scale * 1.5 : scale));
    ctx.strokeStyle = colRule;
    ctx.lineWidth   = isLowRes ? 2 : 1;
    ctx.beginPath();
    if (align === 'center') {
      ctx.moveTo(cx - ruleW / 2, y);
      ctx.lineTo(cx + ruleW / 2, y);
    } else {
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + ruleW, y);
    }
    ctx.stroke();
    y += Math.round(22 * scale);
  }

  // Metadata pills
  const pills = [];
  if (time !== undefined && duration) pills.push(`${fmtTime(time)} / ${fmtTime(duration)}`);
  if (meta.bpm)   pills.push(`${meta.bpm} bpm`);
  if (meta.genre) pills.push(meta.genre);
  if (pills.length) {
    drawText(pills.join('  ·  '), cx, y, monoTiny, colPills);
  }

  // Authentic VCR OSD HUD overlay if enabled
  if (meta.vhsOsd) {
    ctx.save();
    const osdFontSize = Math.round(Math.max(13, 22 * scale));
    ctx.font = `bold ${osdFontSize}px "Courier New", monospace`;
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 4;

    ctx.textAlign = 'left';
    ctx.fillText('PLAY ▶', w * 0.05, h * 0.08);
    ctx.font = `bold ${Math.round(osdFontSize * 0.75)}px "Courier New", monospace`;
    ctx.fillText('SP', w * 0.05, h * 0.08 + osdFontSize * 1.15);

    ctx.textAlign = 'right';
    ctx.fillText('HI-FI STEREO', w * 0.95, h * 0.08);
    ctx.fillText('CH 03', w * 0.95, h * 0.08 + osdFontSize * 1.15);

    const s = Math.floor(time || 0);
    const m = Math.floor(s / 60);
    const hNum = Math.floor(m / 60);
    const frames = Math.floor(((time || 0) % 1) * 30);
    const timecode = `${hNum}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    ctx.font = `bold ${Math.round(osdFontSize * 1.1)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(timecode, w * 0.05, h * 0.94);
    ctx.restore();
  }

  return _compCanvas;
}
