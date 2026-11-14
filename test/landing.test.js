import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');

test('GitHub Pages landing page exists with game, repo and attribution links', () => {
  const html = readFileSync(join(docs, 'index.html'), 'utf8');
  assert.match(html, /neon-rift-0we0\.onrender\.com/);
  assert.match(html, /github\.com\/Sergio744\/Neon-Rift/);
  assert.match(html, /Melvynx/);
  assert.match(html, /Stick Duel/);
  assert.match(html, /MIT/);
  assert.match(html, /style\.css/);
  assert.match(html, /app\.js/);
  assert.match(html, /assets\/icon-512\.png/);
  // No build step / no framework scripts: only the Google Fonts stylesheet is external.
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//);
  assert.ok(existsSync(join(docs, 'style.css')));
  assert.ok(existsSync(join(docs, 'app.js')));
  assert.ok(existsSync(join(docs, '.nojekyll')));
  for (const f of ['icon-512.png', 'icon-192.png', 'favicon-64.png', 'favicon-32.png', 'apple-touch-icon.png', 'favicon.ico']) {
    assert.ok(existsSync(join(docs, 'assets', f)), `missing docs/assets/${f}`);
  }
});

test('landing page is bilingual FR/EN and README links to it', () => {
  const js = readFileSync(join(docs, 'app.js'), 'utf8');
  assert.match(js, /fr:/);
  assert.match(js, /en:/);
  assert.match(js, /localStorage/);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /sergio744\.github\.io\/Neon-Rift/);
  assert.match(readme, /neon-rift-0we0\.onrender\.com/);
});
