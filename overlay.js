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
 * @returns {HTMLCanvasElement} the composited 2D canvas
 */
export function compositeFrame(glCanvas, meta, time, duration) {
  const w   = _compCanvas.width;
  const h   = _compCanvas.height;
  const ctx = _compCtx;

  // 1. Draw the WebGL frame
  ctx.drawImage(glCanvas, 0, 0, w, h);

  // 2. Draw text overlay if there's any metadata to show
  if (!meta.artist && !meta.title && !meta.bpm && !meta.genre) return _compCanvas;

  const cx    = w / 2;
  const scale = h / 1080;
  let y = h * 0.10;

  // Artist — small mono, uppercase, mauve
  if (meta.artist) {
    ctx.font      = `300 ${Math.round(13 * scale)}px "DM Mono", "Courier New", monospace`;
    ctx.fillStyle = 'rgba(192, 162, 184, 0.80)';
    ctx.textAlign = 'center';
    ctx.fillText(meta.artist.toUpperCase(), cx, y);
    y += Math.round(10 * scale);
  }

  // Title — large serif, slate
  if (meta.title) {
    const titleSize = Math.round(34 * scale);
    ctx.font      = `italic ${titleSize}px "DM Serif Display", Georgia, serif`;
    ctx.fillStyle = 'rgba(162, 182, 192, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText(meta.title, cx, y + titleSize);
    y += titleSize + Math.round(14 * scale);
  }

  // Hairline rule — mauve
  if (meta.title || meta.artist) {
    const ruleW = Math.round(100 * scale);
    ctx.strokeStyle = 'rgba(192, 162, 184, 0.20)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cx - ruleW / 2, y);
    ctx.lineTo(cx + ruleW / 2, y);
    ctx.stroke();
    y += Math.round(18 * scale);
  }

  // Metadata pills: time · bpm · genre
  const pills = [];
  if (time !== undefined && duration) pills.push(`${fmtTime(time)} / ${fmtTime(duration)}`);
  if (meta.bpm)   pills.push(`${meta.bpm} bpm`);
  if (meta.genre) pills.push(meta.genre);
  if (pills.length) {
    ctx.font      = `300 ${Math.round(11 * scale)}px "DM Mono", "Courier New", monospace`;
    ctx.fillStyle = 'rgba(162, 182, 192, 0.45)';
    ctx.textAlign = 'center';
    ctx.fillText(pills.join('  ·  '), cx, y);
  }

  return _compCanvas;
}
