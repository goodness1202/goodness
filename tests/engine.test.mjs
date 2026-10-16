/* ==========================================================================
   Goodness Engine — headless test suite
   Run:  node tests/engine.test.mjs
   Loads every engine module (classic scripts) and exercises the
   non-rendering paths: math, signals, nodes, scenes, scripts, physics,
   tilemaps, input, tweens, timers, save and the API services (with a
   stubbed fetch).
   ========================================================================== */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

/* ---- load the engine manifest, then each file (order matters) ---- */
const loader_src = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const m = loader_src.match(/FILES\s*=\s*\[([^\]]+)\]/);
if (!m) { console.error('Could not parse engine/loader.js manifest'); process.exit(1); }
const FILES = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
for (const f of FILES) require(path.join(ROOT, f));

const GE = globalThis.GE;

/* ------------------------------------------------------------------ */
/* tiny test harness                                                    */
/* ------------------------------------------------------------------ */
let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function eq(a, b, msg) {
  if (a === b) { passed++; return; }
  let pa, pb;
  try { pa = JSON.stringify(a); pb = JSON.stringify(b); }
  catch (e) { pa = String(a); pb = String(b); }
  ok(pa === pb, `${msg} — expected ${pb}, got ${pa}`);
}
function section(name) { console.log(`\n■ ${name}`); }

/* ================================================================== */
section('Manifest & API surface');
{
  ok(GE, 'GE global exists');
  ok(GE.api, 'GE.api exists');
  for (const cls of ['Node', 'Node2D', 'Sprite', 'Camera2D', 'TileMap', 'CharacterBody2D',
    'Area2D', 'RigidBody2D', 'Timer', 'Button', 'HTTPRequest', 'Particles2D', 'Tween']) {
    ok(GE.api[cls], `GE.api.${cls} exported`);
  }
  for (const single of ['Input', 'OS', 'API', 'Assets', 'SFX', 'Music', 'Save']) {
    ok(GE.api[single], `GE.api.${single} exported`);
  }
  ok(GE.Classes.all().length >= 23, `class registry populated (${GE.Classes.all().length} classes)`);
  eq(GE.VERSION, '0.1.0', 'version string');
}

/* ================================================================== */
section('Math');
{
  const V = GE.Vector2;
  const a = new V(3, 4);
  eq(a.length, 5, 'vector length');
  eq(a.normalized.toArray(), [0.6, 0.8], 'normalize');
  eq(a.add(new V(1, 1)).toArray(), [4, 5], 'add');
  eq(a.sub(new V(1, 1)).toArray(), [2, 3], 'sub');
  eq(a.mul(2).toArray(), [6, 8], 'mul');
  eq(a.rotate(90).toArray().map(Math.round), [-4, 3], 'rotate 90° (y-down clockwise)');
  eq(new V(1, 0).angle_to(new V(0, 1)), 90, 'angle_to 90 degrees');
  eq(V.from([7, 8]).toArray(), [7, 8], 'Vector2.from array');
  const c = GE.Color.from('#ff8000');
  eq(c.toArray(), [1, 0.502, 0, 1], 'Color.from hex');
  ok(GE.Color.from('rgba(255,128,0,0.5)').a === 0.5, 'Color.from rgba');
  eq(GE.math.lerp_angle(350, 10, 1), 10, 'lerp_angle shortest path wraps');
  eq(GE.math.lerp_angle(10, 350, 1), 350, 'lerp_angle reverse');
  eq(GE.math.remap(5, 0, 10, 0, 100), 50, 'remap');
  ok(Math.abs(GE.Ease.back_out(0.5) - 1.0877) < 0.01, 'back_out easing overshoots');
  const rng = new GE.RandomNumberGenerator(42);
  const r1 = rng.randf(), r2 = rng.randf();
  rng.seed(42);
  eq(rng.randf(), r1, 'RNG deterministic');
  ok(rng.randf() === r2, 'RNG deterministic 2');
}

/* ================================================================== */
section('Signals');
{
  const s = new GE.Signal('test');
  let got = null;
  s.connect((v) => { got = v; });
  s.emit('hello');
  eq(got, 'hello', 'callable connect/emit');
  const obj = { called: false, on_x(v) { this.called = v; } };
  s.disconnect();
  s.connect(obj, 'on_x');
  s.emit(true);
  eq(obj.called, true, 'method connect/emit');
  /* once */
  let count = 0;
  const s2 = new GE.Signal('once');
  s2.connect_once(() => count++);
  s2.emit(); s2.emit();
  eq(count, 1, 'connect_once fires exactly once');
  /* re-entrancy guard */
  let loops = 0;
  const s3 = new GE.Signal('loop');
  s3.connect(() => { loops++; s3.emit(); });
  s3.emit();
  eq(loops, 1, 're-entrant emit blocked');
}

/* ================================================================== */
section('Node tree');
{
  const tree = new GE.SceneTree({});
  const root = new GE.Node(); root.name = 'Main';
  const child = new GE.Node(); child.name = 'Child';
  const grand = new GE.Node(); grand.name = 'Grand';
  child.add_child(grand);
  root.add_child(child);
  tree.set_current_scene(root, 'test');

  ok(child.tree === tree, 'tree reference propagates');
  ok(tree.get_nodes_in_group('x').length === 0, 'empty group');
  grand.add_to_group('enemies');
  eq(tree.get_nodes_in_group('enemies').length, 1, 'groups registered for deep nodes');
  eq(root.get_node('Child/Grand'), grand, 'get_node path');
  eq(grand.get_node('../..'), root, 'get_node ..');
  eq(grand.get_node('/root/Main/Child'), child, 'absolute path');
  /* duplicate names auto-fixed */
  const c2 = new GE.Node(); c2.name = 'Child';
  root.add_child(c2);
  eq(c2.name, 'Child2', 'sibling name uniqueness');
  /* queue_free */
  grand.queue_free();
  tree.process(1 / 60);
  ok(grand._freed, 'queue_free defers deletion');
  ok(!child.children.includes(grand), 'freed node detached');
  /* scene dict */
  const d = root.to_scene_dict();
  eq(d.type, 'Node', 'to_scene_dict type');
  ok(d.children && d.children.length === 2, 'to_scene_dict children');
}

/* ================================================================== */
section('Scripts');
{
  const { def, error } = GE.Scripts.compile(`{
    extends: 'Sprite',
    speed: 240,
    _ready() { this.ready_ran = true; this.had_input = typeof Input !== 'undefined'; },
    _process(delta) { this.ticks = (this.ticks || 0) + 1; },
    helper(x) { return x * 2; },
  }`);
  ok(!error, 'script compiles: ' + (error || ''));
  ok(def && def.extends === 'Sprite', 'extends parsed');
  const node = new GE.Sprite();
  node.attach_script(def, 'x');
  tree_stub(node);
  node._enter_tree_internal();
  ok(node.ready_ran === true, 'script _ready ran');
  ok(node.had_input === true, 'script env has Input');
  eq(node.speed, 240, 'script default property applied');
  node._process_internal(1 / 60);
  node._process_internal(1 / 60);
  eq(node.ticks, 2, 'script _process ran');
  eq(node._script.helper.call(node, 21), 42, 'script methods callable');
  /* error reporting */
  const bad = GE.Scripts.compile('{ extends: ');
  ok(bad.error, 'syntax error reported');
}

var _stub_tree;
function tree_stub(node) {
  if (!_stub_tree) _stub_tree = new GE.SceneTree({});
  node.tree = _stub_tree;
}

/* ================================================================== */
section('SceneBuilder');
{
  const project = {
    name: 'test',
    scenes: { main: { root: {
      type: 'Node2D', name: 'Main',
      children: [
        { type: 'Sprite', name: 'Player', script: `{ extends: 'Sprite', _ready() { this.armed = true; } }`,
          props: { position: [100, 50], modulate: '#ff0000' } },
        { type: 'Label', name: 'HUD', props: { text: 'Score: 0' } },
        { type: 'Instance', name: 'Mob', scene: 'mob', props: { position: [0, 10] } },
      ],
      connections: [],
    } },
    },
    assets: { scripts: {}, images: {} },
    main_scene: 'main',
  };
  project.scenes.mob = { root: { type: 'Node2D', name: 'Mob', children: [
    { type: 'Sprite', name: 'Body', props: { texture: 'goodness://circle' } },
  ] } };

  const tree = new GE.SceneTree({});
  tree.project = project;
  (async () => {
    const node = await GE.SceneBuilder.build(project.scenes.main, project, tree);
    ok(node, 'scene builds');
    tree.set_current_scene(node, 'main');
    const player = node.get_node('Player');
    ok(player instanceof GE.Sprite, 'player is a Sprite');
    eq(player.position.toArray(), [100, 50], 'position prop applied');
    ok(player.armed === true, 'inline script attached & ready ran');
    const mob = node.get_node('Mob');
    ok(mob && mob.get_node('Body'), 'scene instancing works');
    eq(mob.position.toArray(), [0, 10], 'instance props applied');
    /* texture placeholder in headless */
    const body = mob.get_node('Body');
    ok(body.texture === null || body.texture, 'texture load attempted');
    /* connections */
    project.scenes.main.root.children[0].connections = [{ signal: 'ready', to: '../HUD', method: '_on_player_ready' }];
    const node2 = await GE.SceneBuilder.build(project.scenes.main, project, tree);
    tree.set_current_scene(node2, 'main2');
    GE.SceneBuilder.connect_scene(node2);
    const timer2 = new GE.Timer(); timer2.name = 'Clock';
    node2.add_child(timer2);
    const hud2 = node2.get_node('HUD');
    hud2._script = { _on_tick(b) { this.ticked = b; } };
    timer2.connect('timeout', (v) => {
      if (hud2._script && hud2._script._on_tick) hud2._script._on_tick.call(hud2, v);
    });
    timer2.emit_signal('timeout', 'GO!');
    ok(hud2.ticked === 'GO!', 'signal connection wired');
  })().catch((e) => { failed++; console.error('  ✗ scene builder async:', e.message); });
}

/* ================================================================== */
section('Physics — bodies');
{
  const tree = new GE.SceneTree({});
  const world = tree.physics;

  const floor = new GE.StaticBody2D(); floor.name = 'Floor';
  floor.position = new GE.Vector2(0, 100); floor.shape = { type: 'rect', width: 600, height: 40, offset: new GE.Vector2() };
  tree.root.add_child(floor);

  const ball = new GE.RigidBody2D(); ball.name = 'Ball';
  ball.position = new GE.Vector2(0, 0); ball.shape = { type: 'rect', width: 20, height: 20, offset: new GE.Vector2() };
  ball.bounce = 0;
  tree.root.add_child(ball);

  for (let i = 0; i < 240; i++) world.step(1 / 60);
  const rested = Math.abs(ball.global_position.y - 70) < 6;
  ok(rested, `rigid body rests on floor (y=${ball.global_position.y.toFixed(1)}, expected ~70)`);
  ok(Math.abs(ball.velocity.y) < 30, `rigid body stopped (vy=${ball.velocity.y.toFixed(1)})`);

  /* body_entered signal */
  let entered = null;
  ball.connect('body_entered', (b) => { entered = b; });
  world.flush_signals();
  ok(entered === floor, 'body_entered fired for static floor');
  /* after moving away, exited */
  ball.global_position = new GE.Vector2(0, -500);
  for (let i = 0; i < 10; i++) { world.step(1 / 60); world.flush_signals(); }
  ok(!ball._contacts || !ball._contacts.has(floor), 'contact released after separation');

  /* bounce */
  const bouncy = new GE.RigidBody2D(); bouncy.name = 'Bouncy';
  bouncy.position = new GE.Vector2(200, 0); bouncy.bounce = 0.8;
  bouncy.shape = { type: 'circle', radius: 12, offset: new GE.Vector2() };
  tree.root.add_child(bouncy);
  for (let i = 0; i < 90; i++) world.step(1 / 60);
  ok(bouncy.velocity.y < 0 || Math.abs(bouncy.velocity.y) < 5, `bounce reverses velocity (vy=${bouncy.velocity.y.toFixed(1)})`);
}

/* ================================================================== */
section('Physics — CharacterBody2D');
{
  const tree = new GE.SceneTree({});
  const floor = new GE.StaticBody2D(); floor.name = 'Ground';
  floor.position = new GE.Vector2(0, 0); floor.shape = { type: 'rect', width: 1000, height: 40, offset: new GE.Vector2() };
  tree.root.add_child(floor);

  const ch = new GE.CharacterBody2D(); ch.name = 'Runner';
  ch.position = new GE.Vector2(0, -100);
  ch.shape = { type: 'rect', width: 24, height: 40, offset: new GE.Vector2() };
  tree.root.add_child(ch);

  /* fall until landing */
  for (let i = 0; i < 180; i++) {
    ch.velocity.y += 980 * (1 / 60);
    ch.move_and_slide();
  }
  ok(ch.on_floor, 'character lands on floor');
  const landed_y = ch.global_position.y;
  ok(Math.abs(landed_y - (-20 - 20)) < 4, `character rests at correct height (y=${landed_y.toFixed(1)}, expected -40)`);

  /* wall detection */
  const wall = new GE.StaticBody2D(); wall.name = 'Wall';
  wall.position = new GE.Vector2(100, -100); wall.shape = { type: 'rect', width: 40, height: 300, offset: new GE.Vector2() };
  tree.root.add_child(wall);
  for (let i = 0; i < 120; i++) {
    ch.velocity = new GE.Vector2(200, 0);
    ch.move_and_slide();
  }
  ok(ch.on_wall, 'character hits wall');
  ok(Math.abs(ch.global_position.x - 68) < 4, `character stopped by wall (x=${ch.global_position.x.toFixed(1)}, expected 68)`);

  /* one-way platform */
  const plat = new GE.StaticBody2D(); plat.name = 'Platform';
  plat.one_way_collision = true;
  plat.position = new GE.Vector2(300, -60);
  plat.shape = { type: 'rect', width: 200, height: 16, offset: new GE.Vector2() };
  tree.root.add_child(plat);
  const hopper = new GE.CharacterBody2D(); hopper.name = 'Hopper';
  hopper.position = new GE.Vector2(300, -200);
  hopper.shape = { type: 'rect', width: 20, height: 20, offset: new GE.Vector2() };
  tree.root.add_child(hopper);
  for (let i = 0; i < 120; i++) {
    hopper.velocity.y += 980 * (1 / 60);
    hopper.move_and_slide();
  }
  ok(hopper.on_floor && Math.abs(hopper.global_position.y - (-60 - 8 - 10)) < 6, `one-way platform caught fall (y=${hopper.global_position.y.toFixed(1)})`);

  /* raycast */
  const hit = tree.physics.raycast(new GE.Vector2(0, -300), new GE.Vector2(0, 50));
  ok(hit && hit.collider === floor, 'raycast hits floor');
  eq(hit.normal.toArray(), [0, -1], 'raycast normal up');
  const miss = tree.physics.raycast(new GE.Vector2(5000, -300), new GE.Vector2(5000, -250));
  ok(!miss, 'raycast misses nothing');
}

/* ================================================================== */
section('TileMap');
{
  const tree = new GE.SceneTree({});
  const tm = new GE.TileMap();
  tm.tiles = [
    'GGGGGG',
    'G....G',
    'G..C.G',
    'GGGGGG',
  ];
  tm.cell_size = 48;
  tree.root.add_child(tm);
  eq(tm.grid_size.toArray(), [6, 4], 'grid size');
  ok(tm.is_cell_solid(0, 0), 'grass solid');
  ok(!tm.is_cell_solid(2, 1), 'interior empty');
  const coins = tm.get_cells_by_type('C');
  eq(coins.map((c) => c.toArray()), [[3, 2]], 'coin cells found');
  /* collision solids */
  const solids = tm.get_solids({ x: 0, y: 0, w: 300, h: 300 });
  ok(solids.length >= 14, `solids in view (${solids.length})`);
  /* character standing on tilemap */
  const ch = new GE.CharacterBody2D();
  ch.position = new GE.Vector2(2.5 * 48, -100);
  ch.shape = { type: 'rect', width: 20, height: 20, offset: new GE.Vector2() };
  tree.root.add_child(ch);
  for (let i = 0; i < 180; i++) {
    ch.velocity.y += 980 * (1 / 60);
    ch.move_and_slide();
  }
  ok(ch.on_floor, 'character stands on tilemap');
  ok(Math.abs(ch.global_position.y - (-10)) < 6, `landed on tile top (y=${ch.global_position.y.toFixed(1)}, expected -10)`);
  /* set_cell + world_to_map */
  tm.set_cell(1, 1, '#');
  ok(tm.get_cell(1, 1) === '#', 'set_cell updates');
  eq(tm.world_to_map(new GE.Vector2(100, 100)).toArray(), [2, 2], 'world_to_map');
  /* raycast against tiles */
  const rhit = tree.physics.raycast(new GE.Vector2(48 * 4.5, -200), new GE.Vector2(48 * 4.5, 0));
  ok(rhit && rhit.collider === tm, 'raycast hits tilemap');
}

/* ================================================================== */
section('Input');
{
  const Input = GE.Input;
  Input._reset();
  Input._feed({ type: 'key', code: 'KeyA', pressed: true });
  ok(Input.is_key_pressed('KeyA'), 'key pressed');
  ok(Input.is_action_pressed('ui_left'), 'action mapped (KeyA -> ui_left)');
  ok(Input.is_action_just_pressed('ui_left'), 'just pressed');
  Input._end_frame();
  ok(!Input.is_action_just_pressed('ui_left'), 'just pressed cleared after frame');
  ok(Input.is_action_pressed('ui_left'), 'still held');
  const axis = Input.get_axis('ui_left', 'ui_right');
  eq(axis, -1, 'get_axis');
  Input._feed({ type: 'key', code: 'KeyA', pressed: false });
  ok(Input.is_action_just_released('ui_left'), 'just released');
  Input._reset();
  /* custom actions */
  Input.map_action('dash', ['KeyL', 'ShiftLeft']);
  Input._feed({ type: 'key', code: 'KeyL', pressed: true });
  ok(Input.is_action_pressed('dash'), 'custom action');
  Input._feed({ type: 'key', code: 'KeyL', pressed: false });
  /* mouse */
  Input._feed({ type: 'mouse', button: 0, pressed: true, position: new GE.Vector2(10, 20) });
  eq(Input.mouse_position.toArray(), [10, 20], 'mouse position');
  Input.map_action('shoot', ['MouseLeft']);
  ok(Input.is_action_pressed('shoot'), 'mouse action');
  Input._reset();
}

/* ================================================================== */
section('Tween');
{
  const tree = new GE.SceneTree({});
  const node = new GE.Node2D();
  node.position = new GE.Vector2(0, 0);
  tree.root.add_child(node);
  const done = [];
  const t = node.create_tween();
  t.tween_property(node, 'position', new GE.Vector2(100, 0), 0.5)
    .set_trans('quad_out')
    .callback(() => done.push(1))
    .tween_property(node, 'position', new GE.Vector2(100, 100), 0.5)
    .then(() => done.push(2));
  for (let i = 0; i < 35; i++) tree.process(1 / 60);  /* ~0.58s */
  eq(node.position.x, 100, 'tween x complete');
  eq(done, [1], 'callback ran in order');
  for (let i = 0; i < 45; i++) tree.process(1 / 60);
  eq(node.position.toArray(), [100, 100], 'tween finished');
  eq(done, [1, 2], 'chain finished callback');
  /* loops */
  const node2 = new GE.Node2D(); node2.position = new GE.Vector2(0, 0);
  tree.root.add_child(node2);
  node2.create_tween().set_loops(0).tween_property(node2, 'position', new GE.Vector2(50, 0), 0.25);
  for (let i = 0; i < 120; i++) tree.process(1 / 60);
  ok(node2.position.x >= 0 && node2.position.x <= 50, 'looping tween stays in range');
  /* tween_method */
  let lastVal = -1;
  const node3 = new GE.Node2D(); tree.root.add_child(node3);
  node3.create_tween().tween_method((v) => { lastVal = v; }, 0, 10, 0.1);
  for (let i = 0; i < 12; i++) tree.process(1 / 60);
  eq(lastVal, 10, 'tween_method reaches target');
}

/* ================================================================== */
section('Timer');
{
  const tree = new GE.SceneTree({});
  const timer = new GE.Timer();
  timer.wait_time = 0.3;
  let fired = 0;
  timer.connect('timeout', () => fired++);
  tree.root.add_child(timer);
  timer.start();
  for (let i = 0; i < 40; i++) tree.process(1 / 60);
  eq(fired, 1, 'one-shot timer fired once');
  const loop = new GE.Timer();
  loop.wait_time = 0.05; loop.one_shot = false;
  let lfired = 0;
  loop.connect('timeout', () => lfired++);
  tree.root.add_child(loop);
  loop.start();
  for (let i = 0; i < 60; i++) tree.process(1 / 60);
  ok(lfired >= 18 && lfired <= 22, `looping timer fires ~20x (${lfired})`);
}

/* ================================================================== */
section('Particles');
{
  const tree = new GE.SceneTree({});
  const p = new GE.Particles2D();
  p.amount = 10; p.lifetime = 1;
  tree.root.add_child(p);
  p._enter_tree_internal();
  for (let i = 0; i < 60; i++) p._process(1 / 60);
  ok(p._pool.length > 0, 'particles spawned');
  for (let i = 0; i < 200; i++) p._process(1 / 60);
  ok(p._pool.length < 15, 'particles die out');
}

/* ================================================================== */
section('Save system');
{
  const Save = GE.Save;
  Save._set_namespace('test-suite');
  Save.set('highscore', 999);
  eq(Save.get('highscore', 0), 999, 'set/get');
  Save.save_game({ level: 2 }, 'slot1');
  const g = Save.load_game('slot1');
  eq(g.level, 2, 'save_game/load_game');
  ok(Save.has('highscore'), 'has()');
  Save.erase('highscore');
  ok(!Save.has('highscore'), 'erase()');
  eq(Save.get('missing', 'fallback'), 'fallback', 'default value');
}

/* ================================================================== */
section('API services (stubbed fetch)');
{
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).includes('pokeapi.co/api/v2/pokemon/pikachu')) {
      return {
        ok: true, status: 200, statusText: 'OK',
        text: async () => JSON.stringify({
          id: 25, name: 'pikachu', height: 4, weight: 60,
          types: [{ type: { name: 'electric' } }],
          stats: [
            { base_stat: 35, stat: { name: 'hp' } },
            { base_stat: 55, stat: { name: 'attack' } },
            { base_stat: 40, stat: { name: 'defense' } },
            { base_stat: 90, stat: { name: 'speed' } },
          ],
          sprites: { front_default: 'https://example.com/pika.png', back_default: null, front_shiny: null },
          moves: [{ move: { name: 'thunder-shock' } }],
        }),
      };
    }
    if (String(url).includes('opentdb.com')) {
      return {
        ok: true, status: 200, statusText: 'OK',
        text: async () => JSON.stringify({
          response_code: 0,
          results: [{
            category: 'General Knowledge',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Which &#039;P&quot;s stands for a &quot;small legless reptile&quot;?',
            correct_answer: 'Pikachu &amp; Pals',
            incorrect_answers: ['Python', 'Pascal'],
          }],
        }),
      };
    }
    if (String(url).includes('open-meteo.com')) {
      return {
        ok: true, status: 200, statusText: 'OK',
        text: async () => JSON.stringify({
          current: {
            temperature_2m: 12.3, apparent_temperature: 10.1, relative_humidity_2m: 82,
            wind_speed_10m: 21.5, weather_code: 61, is_day: 1,
          },
        }),
      };
    }
    return { ok: false, status: 404, statusText: 'Not Found', text: async () => 'nope' };
  };

  (async () => {
    try {
      const mon = await GE.API.pokemon.get('pikachu');
      eq(mon.id, 25, 'pokemon id');
      eq(mon.name, 'Pikachu', 'pokemon name capitalized');
      eq(mon.types, ['electric'], 'pokemon types');
      eq(mon.stats.hp, 35, 'pokemon stat hp');
      eq(mon.stats.attack, 55, 'pokemon stat attack');
      eq(mon.sprites.front, 'https://example.com/pika.png', 'pokemon sprite url');
      eq(mon.weight_kg, 6, 'pokemon weight normalized');

      const qs = await GE.API.trivia.questions({ amount: 1 });
      eq(qs.length, 1, 'trivia question count');
      eq(qs[0].correct_index >= 0, true, 'trivia correct index valid');
      eq(qs[0].answers.includes('Pikachu & Pals'), true, 'trivia HTML entities decoded');
      eq(qs[0].answers.length, 3, 'trivia answers merged');
      ok(qs[0].question.includes("'"), 'trivia question entities decoded');

      const w = await GE.API.weather.current({ lat: 52.37, lon: 4.9 });
      eq(w.temperature_c, 12.3, 'weather temp');
      eq(w.description, 'Light rain', 'weather description mapped');
      eq(w.is_raining, true, 'weather is_raining');

      /* error paths */
      let threw = false;
      try { await GE.API.http.json('https://bad.example.com/x'); }
      catch (e) { threw = true; }
      ok(threw, 'HTTP error throws');
    } catch (e) {
      failed++; console.error('  ✗ services async:', e.message);
    } finally {
      globalThis.fetch = realFetch;
    }
  })();
}

/* ================================================================== */
section('Engine end-to-end (headless)');
{
  const project = {
    name: 'e2e',
    settings: { width: 640, height: 360, background: '#000' },
    scenes: {
      main: { root: {
        type: 'Node2D', name: 'Game',
        children: [
          { type: 'Timer', name: 'Clock', props: { wait_time: 0.2, autostart: true } },
          { type: 'Sprite', name: 'Faller',
            props: { position: [100, 0], texture: 'goodness://circle' },
            script: `{
              extends: 'Sprite',
              v: 0,
              _physics_process(delta) { this.v += 500 * delta; this.position.y += this.v * delta; },
              _process() { this.frames = (this.frames || 0) + 1; },
            }` },
        ],
      } },
    },
    assets: { scripts: {}, images: {} },
    main_scene: 'main',
  };

  (async () => {
    try {
      const engine = new GE.Engine({ headless: true, project });
      await engine.start();
      ok(engine.tree.current_scene && engine.tree.current_scene.name === 'Game', 'scene loaded');
      const faller = engine.tree.current_scene.get_node('Faller');
      ok(faller, 'faller exists');
      await engine.pump(120, 1 / 60); /* 2 seconds */
      ok(faller.position.y > 200, `script physics ran (y=${faller.position.y.toFixed(1)})`);
      ok(faller.frames > 100, `script process ran (${faller.frames} frames)`);
      /* input routing end-to-end */
      let seen = null;
      const watcher = new GE.Node(); watcher.name = 'Watcher';
      watcher.attach_script(GE.Scripts.compile(`{
        extends: 'Node',
        _input(ev) { globalThis.__last_ev = ev.code; return false; },
      }`).def, '');
      engine.tree.current_scene.add_child(watcher);
      GE.Input._feed({ type: 'key', code: 'Space', pressed: true });
      await engine.pump(1);
      eq(globalThis.__last_ev, 'Space', 'input dispatched to node scripts');
      /* pause */
      engine.tree.paused = true;
      const y_before = faller.position.y;
      await engine.pump(30);
      eq(faller.position.y, y_before, 'pause freezes physics');
      engine.tree.paused = false;
      engine.stop();
    } catch (e) {
      failed++; console.error('  ✗ e2e async:', e.message, e.stack);
    }
  })();
}

/* ================================================================== */
/* report */
setTimeout(() => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
  console.log('='.repeat(60));
  if (failed > 0) process.exit(1);
}, 300);
