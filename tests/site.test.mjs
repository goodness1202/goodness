/* ==========================================================================
   Goodness Engine — site end-to-end tests (jsdom)
   Run:  node tests/site.test.mjs
   Drives the real pages the way a user's browser would:
     - docs/index.html        (documentation reader: chapters, markdown, nav)
     - player.html?project=…  (the runtime player loading a real example)
     - editor.html?import=…   (one-click example loading from the gallery)
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${msg}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a browser-like fetch that serves files from the repo,
   resolving relative URLs against the page's own URL like a real browser */
function makeFetch(pageUrl) {
  return async (url) => {
    if (typeof url !== 'string') return { ok: false, status: 404, text: async () => '' };
    let resolved;
    try { resolved = new URL(url, pageUrl); } catch (e) { return { ok: false, status: 404, text: async () => '' }; }
    const clean = decodeURIComponent(resolved.pathname).replace(/^\//, '');
    const file = path.join(ROOT, clean);
    try {
      const data = readFileSync(file);
      return {
        ok: true, status: 200,
        text: async () => data.toString('utf8'),
        json: async () => JSON.parse(data.toString('utf8')),
      };
    } catch (e) {
      return { ok: false, status: 404, text: async () => '' };
    }
  };
}

function canvasStub(win) {
  const noop = () => {};
  const stub = new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  });
  win.HTMLCanvasElement.prototype.getContext = () => stub;
}

function loadPage(pagePath, { url } = {}) {
  const html = readFileSync(path.join(ROOT, pagePath), 'utf8');
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});   /* scrollTo etc. are noisy, not failures */
  const dom = new JSDOM(html, {
    url: url || `http://localhost/${pagePath}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  dom.window.fetch = makeFetch(dom.window.location.href);
  canvasStub(dom.window);
  return dom;
}

async function loadScripts(dom, files) {
  for (const f of files) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    dom.window.eval(src);
    await wait(5);
  }
}

const loaderSrc = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const ENGINE_FILES = [...loaderSrc.match(/FILES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);

/* ================================================================== */
console.log('\n■ Docs reader (docs/index.html)');
{
  const dom = loadPage('docs/index.html');
  const doc = dom.window.document;
  for (const s of [...doc.querySelectorAll('script')]) dom.window.eval(s.textContent);
  await wait(300);

  ok(doc.querySelectorAll('#chapters .chapter').length === 11, `sidebar lists 11 chapters (${doc.querySelectorAll('#chapters .chapter').length})`);
  ok(doc.querySelector('#content h1') && doc.querySelector('#content h1').textContent.includes('Getting Started'), 'chapter 01 rendered as markdown');
  ok(doc.querySelectorAll('#content h2').length >= 3, 'headings rendered');
  ok(doc.querySelectorAll('#content pre').length >= 1, 'code blocks rendered');
  ok(doc.querySelectorAll('#content table').length >= 1, 'tables rendered');
  ok(doc.querySelector('#content code'), 'inline code rendered');
  ok(doc.querySelectorAll('#pager a').length >= 1, 'pager rendered');

  /* navigate to the API chapter via hash */
  dom.window.location.hash = '08-free-apis.md';
  dom.window.dispatchEvent(new dom.window.Event('hashchange'));
  await wait(300);
  ok(doc.querySelector('#content').textContent.includes('PokéAPI'), 'hash navigation loads the Free APIs chapter');
  ok(doc.title.includes('Free APIs'), 'document title updates');
}

/* ================================================================== */
console.log('\n■ Player (player.html?project=examples/hello/project.json)');
{
  const dom = loadPage('player.html', { url: 'http://localhost/player.html?project=examples/hello/project.json' });
  const doc = dom.window.document;
  await loadScripts(dom, ENGINE_FILES);
  const inline = [...doc.querySelectorAll('script')].map((s) => s.textContent).join('\n');
  try { dom.window.eval(inline); } catch (e) { /* already-defined guards */ }
  await wait(500);

  ok(doc.getElementById('project-name').textContent !== '—', `project name shown ("${doc.getElementById('project-name').textContent}")`);
  const GE = dom.window.GE;
  ok(GE && GE.api, 'engine global available');
  const engines = GE && GE.OS ? GE.OS.engines : [];
  ok(engines.length >= 1, 'an Engine instance is running');
  if (engines.length) {
    const tree = engines[0].tree;
    ok(tree.current_scene && tree.current_scene.name === 'Main', 'hello scene loaded');
    ok(!!tree.current_scene.get_node('Ball'), 'Ball node exists');
    /* pump frames — the ball script should move it */
    const ball = tree.current_scene.get_node('Ball');
    const start = { x: ball.position.x, y: ball.position.y };
    for (let i = 0; i < 90; i++) engines[0].step(1 / 60);
    ok(ball.position.x !== start.x || ball.position.y !== start.y, `ball script animated it (${start.x},${start.y}) → (${ball.position.x.toFixed(0)},${ball.position.y.toFixed(0)})`);
    ok(doc.getElementById('fps') !== null, 'fps readout element exists');
  }
}

/* ================================================================== */
console.log('\n■ Editor one-click example import (editor.html?import=…)');
{
  const dom = loadPage('editor.html', { url: 'http://localhost/editor.html?import=examples/coin-rush/project.json' });
  const doc = dom.window.document;
  await loadScripts(dom, [...ENGINE_FILES, 'editor/tutorials.js', 'editor/api_panel.js', 'editor/editor.js']);
  await wait(600);

  const rows = [...doc.querySelectorAll('#scene-tree .tree-node')].map((r) => r.textContent);
  ok(rows.some((r) => r.includes('TileMap')), 'imported scene has the TileMap level');
  ok(rows.some((r) => r.includes('Player')), 'imported scene has the Player');
  ok(rows.some((r) => r.includes('Coins')), 'imported scene has the Coins spawner');
  ok(doc.getElementById('scene-title').textContent.includes('coin-rush'), `scene title shows project (${doc.getElementById('scene-title').textContent})`);
  /* the inline scripts of the example were migrated to named assets */
  const saved = dom.window.localStorage.getItem('goodness:editor-project');
  const parsed = saved ? JSON.parse(saved) : null;
  ok(parsed && Object.keys(parsed.assets.scripts).length >= 3, `scripts migrated to assets (${parsed ? Object.keys(parsed.assets.scripts).length : 0})`);

  /* select a node in the imported scene, then delete it — editing works */
  const playerRow = [...doc.querySelectorAll('#scene-tree .tree-node')].find((r) => r.textContent.includes('Player'));
  playerRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await wait(200);
  const before = doc.querySelectorAll('#scene-tree .tree-node').length;
  doc.getElementById('btn-del-node').click();
  await wait(200);
  const after = doc.querySelectorAll('#scene-tree .tree-node').length;
  ok(after < before, `editing the imported scene works (tree ${before} → ${after}, subtree included)`);
}

/* ================================================================== */
console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
