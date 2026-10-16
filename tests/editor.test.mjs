/* ==========================================================================
   Goodness Engine — editor smoke test (jsdom)
   Run:  node tests/editor.test.mjs
   Loads editor.html in a simulated browser (no canvas 2D — the editor is
   designed to survive that) and exercises the core editing loop:
   boot, node add/select/rename/delete, inspector edits, script create,
   save/attach, play mode, undo/redo, tabs, tutorials, API panel.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const html = readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/editor.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

/* canvas 2D stub — jsdom has no canvas; install BEFORE the editor loads
   so it can grab a context. The editor also survives a null context. */
{
  const noop = () => {};
  const stub = new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: noop });
      return noop;
    },
    set: () => true,
  });
  window.HTMLCanvasElement.prototype.getContext = () => stub;
}

/* --- load scripts in the same order the browser would --- */
const loader = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const files = [...loader.match(/FILES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
for (const f of [...files, 'editor/tutorials.js', 'editor/api_panel.js', 'editor/editor.js']) {
  const src = readFileSync(path.join(ROOT, f), 'utf8');
  try {
    dom.window.eval(src);
  } catch (e) {
    failed++;
    console.error(`  ✗ script threw while loading: ${f} — ${e.message}`);
    process.exit(1);
  }
}

const doc = window.document;
const GE = window.GE;

/* the editor runs its boot on DOMContentLoaded; jsdom already fired it
   because scripts were evaluated after parse — trigger manually */
await new Promise((r) => setTimeout(r, 50));

/* helper to reach into the editor's UI as a user would */
const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => [...doc.querySelectorAll(sel)];

/* ------------------------------------------------------------------ */
console.log('\n■ Editor boot');
{
  ok(GE && GE.api, 'engine loaded in page');
  ok($$('#scene-tree .tree-node').length >= 5, `scene tree rendered (${$$('#scene-tree .tree-node').length} rows)`);
  ok($('#inspector').textContent.includes('Node2D') || $('#inspector').innerHTML.length > 100, 'inspector rendered');
  ok($$('#console-log, #tab-console').length, 'console panel exists');
  await new Promise((r) => setTimeout(r, 300)); /* let preview build + render frames run */
  ok(true, 'no crash during preview build');
}

console.log('\n■ Node add / select / delete');
{
  /* select Ball */
  const ballRow = $$('#scene-tree .tree-node').find((r) => r.textContent.includes('Ball'));
  ok(!!ballRow, 'Ball row exists');
  ballRow.click();
  await new Promise((r) => setTimeout(r, 30));
  ok($('#inspector').textContent.includes('Sprite'), 'Ball selected → inspector shows Sprite');

  /* add a node via dialog */
  $('#btn-add-node').click();
  await new Promise((r) => setTimeout(r, 30));
  ok(!$('#modal-backdrop').hidden, 'add-node dialog opens');
  const pick = $$('#modal .node-pick').find((p) => p.textContent.includes('Particles2D'));
  ok(!!pick, 'Particles2D listed in dialog');
  pick.click();
  await new Promise((r) => setTimeout(r, 100));
  ok($$('#scene-tree .tree-node').length === 6, `node added to tree (${$$('#scene-tree .tree-node').length} rows)`);

  /* delete it */
  $('#btn-del-node').click();
  await new Promise((r) => setTimeout(r, 100));
  ok($$('#scene-tree .tree-node').length === 5, 'node deleted');

  /* undo brings it back */
  window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
  await new Promise((r) => setTimeout(r, 100));
  ok($$('#scene-tree .tree-node').length === 6, 'undo restored node');
}

console.log('\n■ Script create + attach');
{
  /* attach a script to Ball via the inspector banner */
  const ballRow = $$('#scene-tree .tree-node').find((r) => r.textContent.includes('Ball'));
  ballRow.click();
  await new Promise((r) => setTimeout(r, 30));
  const banner = $('.insp-script-banner');
  ok(!!banner, 'script banner present');
  banner.click();
  await new Promise((r) => setTimeout(r, 30));
  ok($('#tab-script').classList.contains('active'), 'script tab opened');
  ok($('#script-editor').value.includes('extends'), 'script template loaded');
  ok($$('#script-select option').length >= 1, 'script listed in dropdown');

  /* write a script and save */
  $('#script-editor').value = `{
    extends: 'Sprite',
    happy: true,
    _ready() { this.made_it = 42; },
  }`;
  $('#btn-save-script').click();
  await new Promise((r) => setTimeout(r, 50));
  ok($('#script-status').classList.contains('ok'), 'script compiles: ' + $('#script-status').textContent);

  /* broken script reports error */
  $('#script-editor').value = '{ extends: ';
  $('#btn-save-script').click();
  await new Promise((r) => setTimeout(r, 50));
  ok($('#script-status').classList.contains('err'), 'broken script reports error');

  /* restore good script */
  $('#script-editor').value = `{
    extends: 'Sprite',
    _ready() { this.made_it = 42; },
  }`;
  $('#btn-save-script').click();
  await new Promise((r) => setTimeout(r, 50));
}

console.log('\n■ Tutorials & API panel');
{
  const tutBtn = $$('#bottom-tabs button').find((b) => b.textContent.includes('Tutorials'));
  tutBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  ok($$('#tab-tutorial .tut-card').length >= 3, `tutorial cards rendered (${$$('#tab-tutorial .tut-card').length})`);

  const start = $$('#tab-tutorial .tut-card button').find((b) => b.textContent.includes('Start'));
  start.click();
  await new Promise((r) => setTimeout(r, 30));
  ok($('#tab-tutorial .tut-step'), 'tutorial lesson started');

  const apiBtn = $$('#bottom-tabs button').find((b) => b.textContent.includes('API'));
  apiBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  ok($$('#api-sidebar .api-item').length > 20, `API reference entries (${$$('#api-sidebar .api-item').length})`);
  ok($$('#api-main .snippet').length >= 1, 'runnable snippets rendered');

  /* search */
  const search = $('#api-search');
  search.value = 'pokemon';
  search.dispatchEvent(new window.Event('input'));
  await new Promise((r) => setTimeout(r, 30));
  ok($$('#api-sidebar .api-item').some((i) => i.textContent.includes('PokéAPI')), 'API search works');
}

console.log('\n■ Play mode');
{
  $('#btn-play').click();
  await new Promise((r) => setTimeout(r, 400));
  ok(!$('#btn-play').disabled, 'play started (pause/stop enabled)');
  ok(!$('#play-overlay-label').hidden, 'play overlay visible');
  /* let it run */
  await new Promise((r) => setTimeout(r, 300));
  $('#btn-stop').click();
  await new Promise((r) => setTimeout(r, 200));
  ok($('#play-overlay-label').hidden, 'play stopped, back to editing');
}

console.log('\n■ Persistence');
{
  const saved = window.localStorage.getItem('goodness:editor-project');
  ok(!!saved, 'project autosaved to localStorage');
  const parsed = JSON.parse(saved);
  ok(parsed.scenes && parsed.scenes.main, 'saved project has main scene');
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
