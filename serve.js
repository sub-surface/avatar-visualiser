// Simple static file server for PSYCHOGRAPH
// Usage: node serve.js  (or double-click serve.bat)
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  const ext      = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/index.html`;
  console.log(`PSYCHOGRAPH server running at http://localhost:${PORT}`);
  console.log(`  Visualiser : ${url}`);
  console.log(`  Tests      : http://localhost:${PORT}/tests.html`);
  console.log('Press Ctrl+C to stop.\n');
  // Open browser
  exec(`start ${url}`);
});
