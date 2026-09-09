/**
 * vcr-osd.js — VCR On-Screen Display (OSD) HUD controller.
 */

export class VcrOsd {
  constructor() {
    this.el = document.getElementById('vcrOsd');
    this.playStateEl = document.getElementById('osdPlayState');
    this.counterEl = document.getElementById('osdCounter');
    this.dateEl = document.getElementById('osdDate');
    this.spEl = document.getElementById('osdSp');
    this.visible = false;
    this.initDate();
  }

  initDate() {
    if (!this.dateEl) return;
    const now = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const d = String(now.getDate()).padStart(2, '0');
    const m = months[now.getMonth()];
    const y = now.getFullYear();
    this.dateEl.textContent = `${m} ${d} ${y}`;
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.el) {
      this.el.classList.toggle('visible', visible);
    }
  }

  setPlayState(state) {
    if (!this.playStateEl) return;
    if (state === 'play') {
      this.playStateEl.textContent = 'PLAY ▶';
    } else if (state === 'pause') {
      this.playStateEl.textContent = 'PAUSE ❚❚';
    } else if (state === 'rec') {
      this.playStateEl.textContent = 'REC ●';
    } else {
      this.playStateEl.textContent = 'STOP ■';
    }
  }

  updateTime(seconds = 0) {
    if (!this.counterEl) return;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    this.counterEl.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }

  /**
   * Draw OSD directly onto an offscreen 2D canvas (for export video frames).
   */
  drawToCanvas(ctx, width, height, timeSeconds = 0, state = 'PLAY ▶') {
    if (!this.visible) return;

    ctx.save();
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 4;

    // Top left
    ctx.textAlign = 'left';
    ctx.fillText(state, 36, 48);
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('SP', 36, 72);

    // Top right
    ctx.textAlign = 'right';
    ctx.fillText('HI-FI STEREO', width - 36, 48);
    ctx.fillText('CH 03', width - 36, 72);

    // Bottom left
    const h = Math.floor(timeSeconds / 3600);
    const m = Math.floor((timeSeconds % 3600) / 60);
    const s = Math.floor(timeSeconds % 60);
    const f = Math.floor((timeSeconds % 1) * 30);
    const timecode = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(timecode, 36, height - 36);

    ctx.restore();
  }
}

export const vcrOsd = new VcrOsd();
