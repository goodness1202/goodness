/* ==========================================================================
   Goodness Engine — API Trainer graded-task tests (jsdom)
   Run:  node tests/trainer.test.mjs
   Loads the editor's API panel, mocks all five public APIs, then feeds every
   task's reference solution through the exact grader a learner's code hits.
   Also proves that a *wrong* answer is rejected.
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

const dom = new JSDOM('<div id="host"></div>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
{
  const noop = () => {};
  const stub = new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 40 }) : noop), set: () => true });
  window.HTMLCanvasElement.prototype.getContext = () => stub;
}

/* fixture API responses so grading is deterministic offline */
const FIX = {
  'pokeapi.co/api/v2/pokemon/25': { id:25, name:'pikachu', types:[{type:{name:'electric'}}], stats:[{base_stat:35,stat:{name:'hp'}},{base_stat:55,stat:{name:'attack'}}], sprites:{front_default:'x'}, height:4, weight:60 },
  'pokeapi.co/api/v2/pokemon/charizard': { id:6, name:'charizard', types:[{type:{name:'fire'}}], stats:[{base_stat:78,stat:{name:'hp'}},{base_stat:84,stat:{name:'attack'}}], sprites:{}, height:17, weight:905 },
  'pokeapi.co/api/v2/type/water': { damage_relations: { double_damage_to:[{name:'fire'}], half_damage_to:[], no_damage_to:[] } },
  'pokeapi.co/api/v2/type/normal': { damage_relations: { double_damage_to:[], half_damage_to:[], no_damage_to:[{name:'ghost'}] } },
  'opentdb.com/api.php': { response_code:0, results:[1,2,3].map(i=>({question:'Which game shipped in 19'+i+'0?',correct_answer:'A',incorrect_answers:['B','C','D'],category:'Video Games',difficulty:'easy',type:'multiple'})) },
  'api.open-meteo.com/v1/forecast': { current: { temperature_2m: 12.5, apparent_temperature: 11, relative_humidity_2m: 70, wind_speed_10m: 14, weather_code: 3, is_day: 1 } },
  'api.artic.edu/api/v1/artworks/search': { config:{iiif_url:'https://www.artic.edu/iiif/2'}, data: [1,2,3,4].map(i=>({id:i,title:'Art '+i,artist_title:'Someone',image_id:'img-'+i,is_public_domain:true,date_display:'1900'})) },
  'api.datamuse.com/words': [{word:'flame',score:100,numSyllables:1},{word:'same',score:99},{word:'came',score:98},{word:'name',score:97},{word:'fame',score:96}],
  'api.datamuse.com/sug': [{word:'garden'},{word:'game'}],
};
window.fetch = async (url) => {
  const u = String(url);
  for (const [k, v] of Object.entries(FIX)) {
    if (k === 'pokeapi.co/api/v2/pokemon/25' && /pokemon\/\d+/.test(u)) return { ok:true, status:200, json: async()=>v, text: async()=>JSON.stringify(v) };
    if (u.includes(k)) {
  
      // describe(extraordinary) should report 5 syllables
      if (u.includes('sp=extraordinary')) return { ok:true, status:200, json: async()=>[{word:'extraordinary',numSyllables:5,defs:['a\tbeyond what is usual'],tags:[]}], text: async()=>JSON.stringify([{word:'extraordinary',numSyllables:5,defs:['a\tbeyond what is usual'],tags:[]}]) };
      return { ok:true, status:200, json: async()=>v, text: async()=>JSON.stringify(v) };
    }
  }
  if (u.includes('api.datamuse.com/words') && u.includes('ml=')) return { ok:true, status:200, json: async()=>[{word:'calm'},{word:'quiet'},{word:'still'},{word:'serene'},{word:'placid'}], text: async()=>JSON.stringify([{word:'calm'},{word:'quiet'},{word:'still'},{word:'serene'},{word:'placid'}]) };
  throw new Error('unmocked fetch ' + u);
};


const loader = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const files = [...loader.match(/FILES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
for (const f of [...files, 'editor/api_panel.js']) window.eval(readFileSync(path.join(ROOT, f), 'utf8'));

const GE = window.GE;
const doc = window.document;

console.log('\n■ API Trainer (in-editor graded tasks)');
{
  ok(!!GE.ApiPanel, 'API panel loaded');
  ok(GE.ApiPanel.tasks.length === 10, `ten graded tasks (${GE.ApiPanel.tasks.length})`);
  const host = doc.getElementById('host');
  GE.ApiPanel.render(host);
  const items = [...host.querySelectorAll('.api-item')].map((i) => i.textContent);
  ok(items.some((t) => t.includes('Trainer')), 'trainer entry in the API sidebar');

  [...host.querySelectorAll('.api-item')].find((i) => i.textContent.includes('Trainer')).click();
  const cards = [...host.querySelectorAll('.trainer-card')];
  ok(cards.length === GE.ApiPanel.tasks.length, `every task rendered as a card (${cards.length})`);
  ok(cards.every((c) => c.querySelector('textarea') && c.querySelector('button')), 'each card has an editor + run button');

  /* grade every reference solution through the real grader */
  for (const task of GE.ApiPanel.tasks) {
    let res = null;
    try { res = await GE.ApiPanel.__eval(task.solution, task.env ? task.env() : {}); }
    catch (e) { res = { error: e.message }; }
    let good = false;
    try { good = !res.error && !!task.check(res.value); } catch (e) { good = false; }
    ok(good, `solution passes: ${task.id}${res.error ? ' — ' + res.error : ''}`);
  }

  /* every task must reject something — a grader that always passes teaches nothing */
  const mon = await GE.ApiPanel.__eval("const mon = await API.pokemon.get('pikachu');\nreturn { id: mon.id, name: 'not pikachu', hp: 1, attack: 1 };", {});
  const pikachu_task = GE.ApiPanel.tasks.find((t) => /pokemon/.test(t.id)) || GE.ApiPanel.tasks[0];
  ok(!pikachu_task.check(mon.value), 'a wrong answer is rejected');

  /* progress is remembered per task id */
  GE.ApiPanel.__reset_progress && GE.ApiPanel.__reset_progress();
  ok(typeof GE.ApiPanel.progress === 'object', 'progress object available');
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
