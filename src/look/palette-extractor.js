/**
 * palette-extractor.js — fast, deterministic color palette extraction from album artwork.
 * Samples images down to a 32x32 grid to extract primary dominant and contrasting accent hues.
 */

function rgbToHex(r, g, b) {
  const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Extracts a harmonious [baseColor, peakAccentColor] pair from pixel buffer data.
 */
export function extractColorsFromPixels(pixels, width, height) {
  if (!pixels || pixels.length < 16) {
    return { colorA: '#e8d5b0', colorB: '#b090c8' };
  }

  // 1. Collect color samples with decent opacity
  const samples = [];
  const total = width * height;
  for (let i = 0; i < total; i += 2) {
    const idx = i * 4;
    const a = pixels[idx + 3];
    if (a < 128) continue;
    const r = pixels[idx];
    const g = pixels[idx + 1];
    const b = pixels[idx + 2];
    samples.push({ r, g, b, sat: saturation(r, g, b) });
  }

  if (samples.length === 0) {
    return { colorA: '#e8d5b0', colorB: '#b090c8' };
  }

  // 2. Find primary dominant color by quantization buckets (16-step grid)
  const buckets = new Map();
  for (const s of samples) {
    const key = `${Math.floor(s.r / 32) * 32},${Math.floor(s.g / 32) * 32},${Math.floor(s.b / 32) * 32}`;
    const entry = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    entry.count++;
    entry.rSum += s.r;
    entry.gSum += s.g;
    entry.bSum += s.b;
    buckets.set(key, entry);
  }

  let dominant = null;
  let maxCount = -1;
  for (const entry of buckets.values()) {
    if (entry.count > maxCount) {
      maxCount = entry.count;
      dominant = {
        r: entry.rSum / entry.count,
        g: entry.gSum / entry.count,
        b: entry.bSum / entry.count,
      };
    }
  }

  // 3. Find most contrasting / vibrant accent color
  let bestAccent = null;
  let maxScore = -1;
  for (const s of samples) {
    const dist = colorDistance(dominant.r, dominant.g, dominant.b, s.r, s.g, s.b);
    // Weight distance and saturation for punchy signal lines
    const score = dist * (1.0 + s.sat * 1.5);
    if (score > maxScore) {
      maxScore = score;
      bestAccent = s;
    }
  }

  if (!bestAccent || maxScore < 40) {
    // If image is virtually monochromatic (e.g. pure black/white/grey), produce a striking complementary tone
    const lum = 0.2126 * dominant.r + 0.7152 * dominant.g + 0.0722 * dominant.b;
    bestAccent = lum < 128 ? { r: 255, g: 77, b: 77 } : { r: 0, g: 240, b: 255 };
  }

  return {
    colorA: rgbToHex(dominant.r, dominant.g, dominant.b),
    colorB: rgbToHex(bestAccent.r, bestAccent.g, bestAccent.b),
  };
}

/**
 * Extracts a dual-color palette from an image element, Blob, or URL.
 */
export async function extractPaletteFromImage(source) {
  if (!source) return null;

  return new Promise((resolve) => {
    let img;
    let cleanupUrl = null;

    if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
      img = source;
    } else {
      img = new Image();
      img.crossOrigin = 'anonymous';
      if (typeof source === 'string') {
        img.src = source;
      } else if (source instanceof Blob || source instanceof File) {
        cleanupUrl = URL.createObjectURL(source);
        img.src = cleanupUrl;
      }
    }

    const process = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
          return resolve(null);
        }

        ctx.drawImage(img, 0, 0, 32, 32);
        const imgData = ctx.getImageData(0, 0, 32, 32);
        const palette = extractColorsFromPixels(imgData.data, 32, 32);
        if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
        resolve(palette);
      } catch (err) {
        console.warn('[PaletteExtractor] Could not extract colors:', err);
        if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
        resolve(null);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      process();
    } else {
      img.onload = () => process();
      img.onerror = () => {
        if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
        resolve(null);
      };
    }
  });
}
