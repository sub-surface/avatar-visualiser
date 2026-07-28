import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('direct static entry', () => {
  it('maps every browser-resolved package import to a pinned URL', () => {
    const source = html.match(
      /<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/,
    )?.[1];

    expect(source, 'index.html must include an import map').toBeTruthy();

    const { imports } = JSON.parse(source);

    expect(imports).toEqual({
      three: 'https://unpkg.com/three@0.169.0/build/three.module.js',
      'three/addons/': 'https://unpkg.com/three@0.169.0/examples/jsm/',
      'mp4-muxer': 'https://unpkg.com/mp4-muxer@5.1.3/build/mp4-muxer.mjs',
    });
  });
});
