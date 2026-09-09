/**
 * overlay.js — canvas 2D text compositing for export.
 *
 * WebGL canvases can't have a 2D context, so we use a separate offscreen
 * canvas: draw the WebGL frame onto it, draw text on top, then return
 * the composited canvas for VideoFrame capture.
 */

import { calculateTracklistAlpha } from './src/playlist/album-manager.js';
export { calculateTracklistAlpha };

let _compCanvas = null;
let _compCtx    = null;
let _cachedArtist = null;
let _cachedTrackedArtist = '';
let _cachedTitle = null;
let _cachedTitleScale = -1;
let _cachedTitleWidth = 0;

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Fast determination of whether a frame requires 2D compositing.
 * If no 2D text or OSD elements are visible, the WebGL canvas can be encoded
 * directly with zero copy overhead.
 */
export function canBypassComposite(meta, time, duration, albumState = null) {
  if (meta?.vhsOsd) return false;
  const titleCardMode = meta?.titleCard || 'top';
  const hasMeta = Boolean(meta?.artist || meta?.title || meta?.bpm || meta?.genre);
  if (titleCardMode !== 'off' && hasMeta) return false;
  if (albumState && Array.isArray(albumState.tracks) && albumState.tracks.length > 1) {
    const style = albumState.style || meta?.albumTracklistStyle || 'vcr-osd';
    if (style !== 'off') {
      const alpha = calculateTracklistAlpha(time, duration);
      if (alpha > 0.005) return false;
    }
  }
  return true;
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
  _cachedArtist = null;
  _cachedTrackedArtist = '';
  _cachedTitle = null;
  _cachedTitleScale = -1;
  _cachedTitleWidth = 0;
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
 * @param {Object} [albumState=null] - continuous album playlist state
 * @returns {HTMLCanvasElement} the composited 2D canvas
 */
export function compositeFrame(glCanvas, meta, time, duration, visMode, albumState = null) {
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
  const scale = Math.max(0.45, h / 1080);

  if (titleCardMode !== 'off' && hasMeta) {
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
      if (meta.artist !== _cachedArtist) {
        _cachedArtist = meta.artist;
        _cachedTrackedArtist = meta.artist.toUpperCase().split('').join(' ');
      }
      const artistSize = Math.max(10, Math.round(13 * scale));
      ctx.font = `500 ${artistSize}px "DM Mono", "Courier New", monospace`;
      ctx.fillStyle = 'rgba(230, 235, 245, 0.95)';
      ctx.fillText(_cachedTrackedArtist, cx, y);
      y += Math.max(16, Math.round(22 * scale));
    }

    // 2. Title (prominent italic serif)
    let titleWidth = 0;
    if (meta.title) {
      const titleSize = Math.max(22, Math.round(42 * scale));
      ctx.font = `italic 400 ${titleSize}px "DM Serif Display", Georgia, serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(meta.title, cx, y + titleSize * 0.85);
      if (meta.title !== _cachedTitle || scale !== _cachedTitleScale) {
        _cachedTitle = meta.title;
        _cachedTitleScale = scale;
        _cachedTitleWidth = ctx.measureText(meta.title).width;
      }
      titleWidth = _cachedTitleWidth;
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

  // 3. Tracklist overlay for continuous album playlist mode
  if (albumState && Array.isArray(albumState.tracks) && albumState.tracks.length > 1) {
    const style = albumState.style || meta.albumTracklistStyle || 'vcr-osd';
    drawTracklistOverlay(
      ctx,
      albumState.tracks,
      albumState.activeIndex ?? 0,
      time,
      duration,
      style,
      w,
      h,
    );
  }

  return _compCanvas;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
  }
}

/**
 * Draw on-screen tracklist overlay for continuous album mode.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{title: string, artist?: string, duration?: number}>} tracks
 * @param {number} activeIndex
 * @param {number} trackTime - time in active track
 * @param {number} trackDuration - duration of active track
 * @param {'vcr-osd' | 'minimal' | 'off'} style
 * @param {number} w - canvas width
 * @param {number} h - canvas height
 */
export function drawTracklistOverlay(ctx, tracks, activeIndex, trackTime, trackDuration, style, w, h) {
  if (!tracks || tracks.length <= 1 || style === 'off') return;

  const alpha = calculateTracklistAlpha(trackTime, trackDuration);
  if (alpha <= 0.005) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const scale = Math.max(0.5, h / 1080);
  const totalTracks = tracks.length;
  const maxVisible = Math.min(8, totalTracks);
  let startIdx = 0;
  if (totalTracks > maxVisible) {
    startIdx = Math.max(0, Math.min(totalTracks - maxVisible, activeIndex - Math.floor(maxVisible / 2)));
  }
  const endIdx = Math.min(totalTracks, startIdx + maxVisible);

  if (style === 'vcr-osd') {
    // Authentic LaserDisc / CRT OSD aesthetic: Monospace, phosphor green & amber
    const padX = Math.round(24 * scale);
    const padY = Math.round(18 * scale);
    const fontSize = Math.max(11, Math.round(18 * scale));
    const titleSize = Math.max(12, Math.round(20 * scale));
    const lineHeight = Math.max(16, Math.round(26 * scale));

    const boxW = Math.min(w * 0.88, Math.max(400 * scale, w * 0.46));
    const boxH = padY * 2 + (endIdx - startIdx + 2) * lineHeight;
    const boxX = Math.round(w * 0.05);
    const boxY = Math.round(h * 0.16);

    // OSD Backdrop box (translucent dark with phosphor green scanline border)
    ctx.fillStyle = 'rgba(4, 12, 6, 0.84)';
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Header
    let curY = boxY + padY + lineHeight * 0.5;
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;
    ctx.fillStyle = '#39ff14';
    const headerText = `PROGRAM: ALBUM TRACKLIST [${String(activeIndex + 1).padStart(2, '0')} / ${String(totalTracks).padStart(2, '0')}]`;
    ctx.fillText(headerText, boxX + padX, curY);

    // Divider
    curY += lineHeight * 0.6;
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + padX, curY);
    ctx.lineTo(boxX + boxW - padX, curY);
    ctx.stroke();

    curY += lineHeight * 0.6;

    // Track rows
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    for (let i = startIdx; i < endIdx; i++) {
      const track = tracks[i];
      const isCurrent = i === activeIndex;
      const numStr = String(i + 1).padStart(2, '0');
      const durStr = fmtTime(track.duration || 0);

      const prefix = isCurrent ? '▶ ' : '  ';
      const label = `${prefix}${numStr}. ${track.title || 'Untitled'}`;
      const rightX = boxX + boxW - padX;

      if (isCurrent) {
        ctx.fillStyle = 'rgba(57, 255, 20, 0.22)';
        ctx.fillRect(boxX + padX - 4, curY - lineHeight * 0.45, boxW - padX * 2 + 8, lineHeight * 0.9);
        ctx.fillStyle = '#ffe04d'; // Phosphor amber highlight for active track
      } else {
        ctx.fillStyle = 'rgba(180, 255, 180, 0.85)';
      }

      ctx.textAlign = 'left';
      ctx.fillText(label, boxX + padX, curY);

      ctx.textAlign = 'right';
      ctx.fillText(isCurrent ? `${durStr} ◄` : durStr, rightX, curY);

      curY += lineHeight;
    }
  } else if (style === 'minimal') {
    // Minimal contemporary studio aesthetic: Alabaster typography, rounded pill, delicate lines
    const padX = Math.round(28 * scale);
    const padY = Math.round(20 * scale);
    const fontSize = Math.max(10, Math.round(15 * scale));
    const titleSize = Math.max(11, Math.round(13 * scale));
    const lineHeight = Math.max(18, Math.round(27 * scale));

    const boxW = Math.min(w * 0.85, Math.max(420 * scale, w * 0.44));
    const boxH = padY * 2 + (endIdx - startIdx + 2) * lineHeight;
    const boxX = Math.round(w * 0.06);
    const boxY = Math.round(h * 0.16);

    // Rounded rectangle with soft blur
    ctx.fillStyle = 'rgba(12, 16, 24, 0.86)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, Math.round(10 * scale));
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Header
    let curY = boxY + padY + lineHeight * 0.45;
    ctx.font = `500 ${titleSize}px "DM Mono", "Courier New", monospace`;
    ctx.fillStyle = 'rgba(215, 225, 238, 0.65)';
    const headerText = `ALBUM PLAYLIST  ·  TRACK ${activeIndex + 1} OF ${totalTracks}`.toUpperCase();
    ctx.fillText(headerText, boxX + padX, curY);

    // Subtle divider
    curY += lineHeight * 0.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + padX, curY);
    ctx.lineTo(boxX + boxW - padX, curY);
    ctx.stroke();

    curY += lineHeight * 0.6;

    // Track rows
    for (let i = startIdx; i < endIdx; i++) {
      const track = tracks[i];
      const isCurrent = i === activeIndex;
      const numStr = String(i + 1).padStart(2, '0');
      const durStr = fmtTime(track.duration || 0);
      const rightX = boxX + boxW - padX;

      if (isCurrent) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        drawRoundedRect(ctx, boxX + padX - 8, curY - lineHeight * 0.44, boxW - padX * 2 + 16, lineHeight * 0.88, 4);
        ctx.fill();

        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(boxX + padX - 2, curY, 3.5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `500 ${fontSize}px "DM Mono", monospace`;
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.font = `400 ${fontSize}px "DM Mono", monospace`;
        ctx.fillStyle = 'rgba(195, 205, 220, 0.68)';
      }

      ctx.textAlign = 'left';
      ctx.fillText(`${numStr}   ${track.title || 'Untitled'}`, boxX + padX + (isCurrent ? 8 : 0), curY);

      ctx.textAlign = 'right';
      ctx.fillStyle = isCurrent ? '#00e5ff' : 'rgba(160, 175, 195, 0.55)';
      ctx.fillText(durStr, rightX, curY);

      curY += lineHeight;
    }
  }

  ctx.restore();
}

