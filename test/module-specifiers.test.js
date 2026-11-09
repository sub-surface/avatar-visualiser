import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', 'Archive', '.git', 'test', 'scripts']);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(m?js|html)$/.test(name) ? [full] : [];
  });
}

const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|<script[^>]+src=)["'](\.{1,2}\/[^"']+)["']/g;

describe('module specifiers', () => {
  // Browsers key ES modules by full URL, so `export.js?v=2` and `export.js` are
  // two separate instances with separate state. That once let the preview loop
  // run during album exports. Every module must be imported one way only.
  it('imports each local module with a single URL', () => {
    const seen = new Map();
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const [, specifier] of text.matchAll(IMPORT_RE)) {
        const [path, query = ''] = specifier.split('?');
        const target = relative(root, resolve(dirname(file), path)).replace(/\\/g, '/');
        if (!seen.has(target)) seen.set(target, new Map());
        seen.get(target).set(query, relative(root, file).replace(/\\/g, '/'));
      }
    }

    const conflicts = [...seen.entries()]
      .filter(([, queries]) => queries.size > 1)
      .map(([target, queries]) => `${target}: ${[...queries].map(([q, f]) => `${q ? `?${q}` : '(none)'} in ${f}`).join(', ')}`);

    expect(conflicts).toEqual([]);
  });
});
