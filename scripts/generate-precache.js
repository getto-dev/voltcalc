#!/usr/bin/env node
/**
 * Generate precache-manifest.json from the Next.js static export output.
 * Scans the `out/` directory and lists all files that should be
 * pre-cached by the Service Worker for full offline support.
 *
 * Usage: node scripts/generate-precache.js
 * Env:   BASE_PATH=/voltcalc  (default for GitHub Pages)
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', 'out');
const BASE_PATH = (process.env.BASE_PATH || '/voltcalc').replace(/\/$/, '');
const OUTPUT_FILE = path.join(OUT_DIR, 'precache-manifest.json');

function getAllFiles(dir, base = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, relativePath));
    } else {
      if (shouldInclude(relativePath)) {
        results.push(relativePath);
      }
    }
  }

  return results;
}

function shouldInclude(filepath) {
  const normalized = filepath.replace(/\\/g, '/');

  if (normalized.endsWith('.map')) return false;
  if (normalized.includes('__next.')) return false;
  if (normalized.endsWith('precache-manifest.json')) return false;
  if (normalized.startsWith('404') || normalized.startsWith('404/')) return false;
  if (normalized.startsWith('_not-found')) return false;
  if (normalized.endsWith('.txt') && !normalized.includes('_next/')) return false;

  return true;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('Error: out/ directory not found. Run "next build" first.');
    process.exit(1);
  }

  const files = getAllFiles(OUT_DIR);

  const urls = files.map((file) => {
    const normalized = file.replace(/\\/g, '/');
    const url = `${BASE_PATH}/${normalized}`;
    return url;
  });

  if (BASE_PATH) {
    urls.push(`${BASE_PATH}/`);
  } else {
    urls.push('./');
  }

  urls.sort();

  const uniqueUrls = [...new Set(urls)];

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueUrls, null, 2), 'utf-8');

  console.log(`Generated precache-manifest.json with ${uniqueUrls.length} files`);
  console.log(`Output: ${OUTPUT_FILE}`);

  const jsFiles = uniqueUrls.filter(u => u.endsWith('.js')).length;
  const cssFiles = uniqueUrls.filter(u => u.endsWith('.css')).length;
  const htmlFiles = uniqueUrls.filter(u => u.endsWith('.html') || u.endsWith('/')).length;
  const fontFiles = uniqueUrls.filter(u => u.endsWith('.ttf') || u.endsWith('.woff') || u.endsWith('.woff2')).length;
  const imageFiles = uniqueUrls.filter(u => u.endsWith('.png') || u.endsWith('.svg') || u.endsWith('.ico')).length;

  console.log(`JS: ${jsFiles}, CSS: ${cssFiles}, HTML: ${htmlFiles}, Fonts: ${fontFiles}, Images: ${imageFiles}`);
}

main();
