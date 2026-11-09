/**
 * export-panel.js — live export spec readout under the preset selector.
 *
 * Shows resolution, fps, codec, bitrate and an estimated file size for the
 * loaded track, plus whether this browser can encode it (hardware, software
 * or not at all), so an unsupported preset is visible before recording.
 */
import { P } from '../../params.js';
import { describeExport, formatBytes, formatClock } from '../export/export-spec.js';

const supportCache = new Map();

async function probeSupport(spec) {
  if (typeof VideoEncoder === 'undefined') return 'none';
  const key = `${spec.codec}|${spec.width}x${spec.height}@${spec.fps}`;
  if (!supportCache.has(key)) {
    const base = { codec: spec.codec, width: spec.width, height: spec.height, framerate: spec.fps, bitrate: spec.bitrate };
    const check = (hardwareAcceleration) => VideoEncoder.isConfigSupported({ ...base, hardwareAcceleration })
      .then((result) => result.supported)
      .catch(() => false);
    supportCache.set(key, (async () => {
      if (await check('prefer-hardware')) return 'hw';
      if (await check('no-preference')) return 'sw';
      return 'unsupported';
    })());
  }
  return supportCache.get(key);
}

const SUPPORT_TEXT = {
  checking: ['…', 'Checking encoder support'],
  hw: ['hw ✓', 'Hardware H.264 encoder available'],
  sw: ['sw ✓', 'Software H.264 encoder (slower than hardware)'],
  unsupported: ['✗ unsupported', 'This browser cannot encode this preset — try standard or lo-fi'],
  none: ['✗ no WebCodecs', 'This browser has no WebCodecs VideoEncoder — use Chrome or Edge'],
};

/**
 * @param {{ getDuration: () => number }} options duration of the loaded track in seconds (0 if none)
 * @returns {{ refresh: () => Promise<void> }}
 */
export function initExportPanel({ getDuration }) {
  const textEl = document.getElementById('exportSpecText');
  const badgeEl = document.getElementById('exportSpecBadge');
  let token = 0;

  async function refresh() {
    if (!textEl) return;
    const spec = describeExport(P, getDuration());
    // Bitrate is a ceiling: sparse wireframes on black often encode far smaller.
    const size = spec.duration > 0
      ? ` · ≤${formatBytes(spec.estimatedBytes)} / ${formatClock(spec.duration)}`
      : '';
    textEl.textContent = `${spec.width}×${spec.height} · ${spec.fps}fps · ${spec.codecLabel} · ${spec.bitrate / 1e6}Mbps${size}`;

    const mine = ++token;
    setBadge('checking');
    const support = await probeSupport(spec);
    if (mine === token) setBadge(support);
  }

  function setBadge(state) {
    if (!badgeEl) return;
    const [text, title] = SUPPORT_TEXT[state] ?? SUPPORT_TEXT.checking;
    badgeEl.textContent = text;
    badgeEl.title = title;
    badgeEl.dataset.support = state;
  }

  for (const event of ['avatar-params-saved', 'avatar-controls-synced', 'avatar-track-loaded']) {
    window.addEventListener(event, () => { refresh(); });
  }
  refresh();
  return { refresh };
}
