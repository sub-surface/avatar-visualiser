/**
 * serve.js — dev server + terminal dashboard for AVATAR
 * Zero dependencies. Run with: node serve.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;
const MAX_ROWS = 14;   // request log rows

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

/* ── ANSI ──────────────────────────────────────────────────── */
const A = {
  clear:  '\x1b[2J\x1b[H',
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};

/* ── State ─────────────────────────────────────────────────── */
const startTime = Date.now();
let totalReqs = 0, totalBytes = 0, errorCount = 0;
const log = [];   // { ts, status, url, bytes }

/* ── Helpers ───────────────────────────────────────────────── */
function uptime() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

function fmtBytes(n) {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function statusColour(s) {
  if (s < 300) return A.green;
  if (s < 400) return A.yellow;
  return A.red;
}

/* ── Render ────────────────────────────────────────────────── */
function render() {
  const cols = (process.stdout.columns || 72);
  const rule = A.dim + '  ' + '─'.repeat(cols - 4) + A.reset;
  const out  = [];

  out.push(A.clear);

  // Header
  out.push(`${A.bold}${A.cyan}  AVATAR${A.reset}  ${A.dim}dev server  ·  uptime ${uptime()}${A.reset}`);
  out.push('');

  // Links
  out.push(`${A.dim}  ▸${A.reset}  ${A.cyan}http://localhost:${PORT}/${A.reset}`);
  out.push(`${A.dim}  ▸${A.reset}  ${A.cyan}http://localhost:${PORT}/tests.html${A.reset}`);
  out.push('');

  // Request log
  out.push(`${A.dim}  REQUESTS${A.reset}`);
  out.push(rule);

  if (log.length === 0) {
    out.push(`${A.dim}  waiting for requests…${A.reset}`);
    for (let i = 1; i < MAX_ROWS; i++) out.push('');
  } else {
    for (const r of log) {
      const col   = statusColour(r.status);
      const bytes = r.bytes ? fmtBytes(r.bytes) : '—';
      const url   = r.url.length > 44 ? '…' + r.url.slice(-43) : r.url;
      out.push(
        `  ${col}${r.status}${A.reset}  ${A.dim}${r.ts}${A.reset}  ${url.padEnd(46)}${A.dim}${bytes}${A.reset}`
      );
    }
    // Pad to keep layout stable
    for (let i = log.length; i < MAX_ROWS; i++) out.push('');
  }

  // Stats
  out.push(rule);
  const errStr = errorCount > 0 ? `${A.red}${errorCount}${A.reset}` : '0';
  out.push(
    `${A.dim}  requests:${A.reset} ${totalReqs}` +
    `  ${A.dim}·  data:${A.reset} ${fmtBytes(totalBytes)}` +
    `  ${A.dim}·  errors:${A.reset} ${errStr}`
  );
  out.push('');
  out.push(`${A.dim}  Press Ctrl+C to stop.${A.reset}`);

  process.stdout.write(out.join('\n'));
}

/* ── Server ────────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  const ext      = path.extname(filePath).toLowerCase();

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    const status = err ? 404 : 200;
    const bytes  = data ? data.length : 0;

    if (err) {
      res.writeHead(404); res.end('Not found');
      errorCount++;
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
      totalBytes += bytes;
    }

    totalReqs++;
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    log.push({ ts, status, url: urlPath, bytes });
    if (log.length > MAX_ROWS) log.shift();

    render();
  });
});

server.listen(PORT, () => {
  exec(`start http://localhost:${PORT}`);
  // Refresh uptime every second
  setInterval(render, 1000);
  render();
});

process.on('SIGINT', () => {
  process.stdout.write('\x1b[2J\x1b[H');
  process.exit(0);
});
