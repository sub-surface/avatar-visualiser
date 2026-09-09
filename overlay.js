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

  // 2. Draw text overlay if enabled and there is metadata to show
  const titleCardMode = meta.titleCard || 'top';
  const hasMeta = Boolean(meta.artist || meta.title || meta.bpm || meta.genre);

  if (titleCardMode !== 'off' && hasMeta) {
    const scale = Math.max(0.45, h / 1080);
    const cx = w / 2;
    let y = (titleCardMode === 'bottom') ? Math.round(h * 0.78) : Math.round(h * 0.12);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Crisp contrast shadow for legibility over 3D visuals
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = Math.max(4, Math.round(8 * scale));
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    // 1. Artist (clean uppercase spaced monospace)
    if (meta.artist) {
      const artistSize = Math.max(10, Math.round(13 * scale));
      ctx.font = `500 ${artistSize}px "DM Mono", "Courier New", monospace`;
      ctx.fillStyle = 'rgba(230, 235, 245, 0.95)';
      const trackedArtist = meta.artist.toUpperCase().split('').join(' ');
      ctx.fillText(trackedArtist, cx, y);
      y += Math.max(16, Math.round(22 * scale));
    }

    // 2. Title (prominent italic serif)
    let titleWidth = 0;
    if (meta.title) {
      const titleSize = Math.max(22, Math.round(42 * scale));
      ctx.font = `italic 400 ${titleSize}px "DM Serif Display", Georgia, serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(meta.title, cx, y + titleSize * 0.85);
      titleWidth = ctx.measureText(meta.title).width;
      y += titleSize + Math.max(8, Math.round(14 * scale));
    }

    // 3. Hairline Underline Rule
    if (meta.title || meta.artist) {
      const ruleW = Math.max(160 * scale, titleWidth + 36 * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      ctx.beginPath();
      ctx.moveTo(cx - ruleW / 2, y);
      ctx.lineTo(cx + ruleW / 2, y);
      ctx.stroke();
      y += Math.max(14, Math.round(20 * scale));
    }

    // 4. Metadata Pills: Playhead / Duration · BPM · Genre
    const pills = [];
    if (time !== undefined && duration) pills.push(`${fmtTime(time)} / ${fmtTime(duration)}`);
    if (meta.bpm) pills.push(`${meta.bpm} bpm`);
    if (meta.genre) pills.push(meta.genre);

    if (pills.length) {
      const pillSize = Math.max(9, Math.round(12 * scale));
      ctx.font = `400 ${pillSize}px "DM Mono", "Courier New", monospace`;
      ctx.fillStyle = 'rgba(215, 225, 238, 0.88)';
      ctx.fillText(pills.join('   ·   '), cx, y);
    }

    ctx.restore();
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
