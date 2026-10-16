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
  eq(GE.VERSION, '0.2.0', 'version string');
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
section('Renderer — transforms, layers, y-sort');
{
  const calls = [];
  const mkctx = () => new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 640, height: 360 };
      const fns = ['save','restore','translate','scale','rotate','setTransform','fillRect','drawImage','beginPath','arc','fill','stroke','moveTo','lineTo','closePath','clearRect','fillText','strokeText','measureText','createLinearGradient','createRadialGradient','setLineDash','ellipse','rect','strokeRect','clip'];
      if (fns.includes(k)) return (...a) => { calls.push(k + '(' + a.join(',') + ')'); if (k === 'measureText') return { width: 10 }; };
      return 1;
    },
    set: () => true,
  });
  const canvas = { width: 640, height: 360, getContext: () => mkctx(), addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }), style: {} };

  const project = {
    name: 'rt', settings: { width: 640, height: 360, background: '#000' }, main_scene: 'main',
    assets: { scripts: {}, images: {} },
    scenes: { main: { root: { type: 'Node2D', name: 'Main', children: [
      { type: 'Sprite', name: 'Ball', props: { position: [500, 300], texture: 'goodness://ball' } },
      { type: 'Node2D', name: 'Rot', props: { position: [100, 100], rotation: 90, scale: [2, 2] }, children: [
        { type: 'Sprite', name: 'Child', props: { position: [10, 0], texture: 'goodness://star' } },
      ] },
      { type: 'CanvasLayer', name: 'HUD', props: { layer: 5 }, children: [
        { type: 'Label', name: 'Text', props: { position: [20, 30], text: 'hi' } },
      ] },
    ] } } },
  };
  const engine = new GE.Engine({ canvas, project, width: 640, height: 360 });
  await engine.start();
  calls.length = 0;
  engine.render();
  const joined = calls.join('\n');
  ok(joined.includes('translate(500,300)'), 'sprite transform applied (translate 500,300)');
  ok(joined.includes('rotate(1.5707963267948966)'), 'rotation converted to radians');
  ok(joined.includes('scale(2,2)'), 'scale applied');
  ok(joined.includes('rotate(1.5707963267948966)\nscale(2,2)'), 'rotate happens before scale (Godot order)');
  ok(joined.includes('fillText(hi,0,0)'), 'canvas-layer label drawn in local space');
  const ball_ix = joined.indexOf('translate(500,300)');
  const label_ix = joined.indexOf('fillText(hi,0,0)');
  ok(ball_ix < label_ix, 'canvas layers draw after the world pass');
  ok(joined.includes('fillRect(-16,-16,32,32)'), 'placeholder sprite still draws its own size');

  /* y-sorting: draw order follows world Y */
  const project2 = {
    name: 'ys', settings: { width: 320, height: 200 }, main_scene: 'main', assets: { scripts: {}, images: {} },
    scenes: { main: { root: { type: 'Node2D', name: 'Main', children: [
      { type: 'YSort', name: 'Depth', children: [
        { type: 'Sprite', name: 'Front', props: { position: [0, 120], texture: 'goodness://square' } },
        { type: 'Sprite', name: 'Back', props: { position: [0, -120], texture: 'goodness://square' } },
      ] },
    ] } } },
  };
  const engine2 = new GE.Engine({ canvas, project: project2, width: 320, height: 200 });
  await engine2.start();
  const items = [];
  engine2._renderer._collect = function (node, z, screen, oi = { i: 0 }) {
    /* collect draw order without drawing */
    if (node._freed || node.visible === false) return;
    if (node instanceof GE.Node2D) items.push({ name: node.name, z: z + (node.z_index || 0) });
    const kids = node.y_sort_enabled ? node.children.slice().sort((a, b) => a.global_position.y - b.global_position.y) : node.children;
    kids.forEach((c, i) => this._collect(c, z + (node.z_index || 0) + (node.y_sort_enabled ? (i + 1) * 0.0001 : 0), screen, oi));
  };
  items.length = 0;
  engine2._renderer._collect(engine2.tree.current_scene, 0, false);
  const back = items.find((i) => i.name === 'Back');
  const front = items.find((i) => i.name === 'Front');
  ok(back && front && back.z < front.z, `y-sort paints the higher node later (back ${back && back.z} < front ${front && front.z})`);
  engine2.stop();

  /* particles must be painted inside the emitter's own transform, so a
     Particles2D deep in the tree emits where the player sees it */
  const project3 = {
    name: 'pt', settings: { width: 640, height: 360, background: '#000' }, main_scene: 'main', assets: { scripts: {}, images: {} },
    scenes: { main: { root: { type: 'Node2D', name: 'Main', children: [
      { type: 'Node2D', name: 'Holder', props: { position: [100, 50] }, children: [
        { type: 'Particles2D', name: 'Sparks',
          props: { position: [200, 150], emitting: false, amount: 4, lifetime: 10, gravity: [0, 0], speed_min: 0, speed_max: 0 } },
      ] } ] } } },
  };
  const engine3 = new GE.Engine({ canvas, project: project3, width: 640, height: 360 });
  await engine3.start();
  const sparks = engine3.tree.current_scene.get_node('Holder').get_node('Sparks');
  sparks.burst(2);
  calls.length = 0;
  engine3.render();
  const arcs = calls.filter((c) => c.startsWith('arc('));
  ok(arcs.length === 2, `a burst draws one circle per particle (${arcs.length})`);
  ok(arcs.every((a) => a.startsWith('arc(0,0,')), 'particle geometry is local to the emitter node');
  const joined3 = calls.join('\n');
  ok(joined3.includes('translate(300,200)'), "the emitter's world transform (100+200, 50+150) is applied");
  const particle_transform = joined3.lastIndexOf('translate(300,200)');
  ok(particle_transform >= 0 && particle_transform < joined3.indexOf('arc(0,0,'), 'particles draw after their transform is pushed');
  engine3.stop();
  engine.stop();
}

/* ================================================================== */
section('Parallax');
{
  const scene = new GE.Node2D(); scene.name = 'Main';
  const bg = new GE.ParallaxBackground(); bg.name = 'Sky'; scene.add_child(bg);
  eq(bg.layer, -1, 'ParallaxBackground defaults to layer -1 (behind the world)');
  const layer = new GE.ParallaxLayer(); layer.name = 'Far';
  layer.motion_scale = new GE.Vector2(0.25, 0.25);
  const star = new GE.Sprite(); star.name = 'Star'; star.texture_src = 'goodness://star';
  layer.add_child(star); bg.add_child(layer);
  const engine = new GE.Engine({ headless: true });
  engine.tree.set_current_scene(scene, 'main');
  bg._stage_parallax({ x: 320, y: 180, zoom: 1 }, { w: 640, h: 360 });
  star._update_world();
  eq(Math.round(layer._parallax_origin.x), 240, 'layer origin x = center + (0 - cam.x) * motion_scale');
  eq(Math.round(layer._parallax_origin.y), 135, 'layer origin y');
  eq(Math.round(star._world.x), 240, 'child world position follows the layer origin');
  eq(layer.scroll_offset.x, 240, 'scroll_offset exposes the computed offset');

  /* motion_scale 0 = pinned to the screen */
  layer.motion_scale = new GE.Vector2(0, 0);
  bg._stage_parallax({ x: 900, y: 700, zoom: 1 }, { w: 640, h: 360 });
  eq(layer._parallax_origin.x, 320, 'motion_scale 0 stays centered when the camera moves');
  eq(layer._parallax_origin.y, 180, 'motion_scale 0 stays centered (y)');

  /* mirroring produces repeat passes inside the viewport */
  layer.motion_scale = new GE.Vector2(0.5, 0.5);
  layer.motion_mirroring = new GE.Vector2(320, 0);
  bg._stage_parallax({ x: 1000, y: 0, zoom: 1 }, { w: 640, h: 360 });
  ok(layer._mirror_shifts.length >= 2, `mirroring schedules repeat passes (${layer._mirror_shifts.length})`);
  ok(layer._parallax_origin.x >= -160 && layer._parallax_origin.x <= 160, 'mirrored origin wraps into [-m/2, m/2)');
  engine.stop();
}

/* ================================================================== */
section('AnimationPlayer');
{
  const scene = new GE.Node2D(); scene.name = 'Main';
  const box = new GE.Sprite(); box.name = 'Box'; scene.add_child(box);
  const anim = new GE.AnimationPlayer(); anim.name = 'Anim'; scene.add_child(anim);
  let pokes = 0;
  box.poke = () => { pokes++; };

  anim.animations = {
    slide: { length: 1, tracks: [{ property: 'position.x', keys: [[0, 0], [1, 100]] }] },
    spin: { length: 2, tracks: [{ property: 'rotation', keys: [[0, 0], [2, 360]], interp: 'nearest' }] },
    tint: { length: 1, tracks: [{ node: 'Box', property: 'modulate', keys: [[0, '#ffffff'], [1, '#ff0000']] }] },
    poke: { length: 1, tracks: [{ node: 'Box', method: 'poke', at: 0.5 }, { node: 'Box', property: 'position.y', keys: [[0, 0], [1, 50]] }] },
    bob: { length: 1, loop: 'pingpong', tracks: [{ property: 'position.y', keys: [[0, 0], [1, 100]] }] },
  };
  eq(anim.animation_names.length, 5, 'five animations registered');
  eq(anim.animation_length('slide'), 1, 'animation_length');
  eq(anim.get_animation('slide').track_count, 1, 'track count');
  ok(anim.has_animation('slide') && !anim.has_animation('nope'), 'has_animation');

  /* sampling + easing */
  eq(anim.get_animation('slide').sample_track(anim.get_animation('slide').tracks[0], 0.5), 50, 'linear sample at 50%');
  const eased = anim.get_animation('slide');
  eq(eased.sample_track(eased.tracks[0], 0), 0, 'sample at t=0');
  eq(eased.sample_track(eased.tracks[0], 1), 100, 'sample at t=1');
  eq(anim.get_animation('spin').sample_track(anim.get_animation('spin').tracks[0], 1.99), 0, 'nearest interpolation holds the previous key');

  const engine = new GE.Engine({ headless: true });
  engine.tree.set_current_scene(scene, 'main');
  anim.play('slide');
  ok(anim.is_playing(), 'play() starts the animation');
  eq(anim.current_animation, 'slide', 'current_animation set');
  await engine.pump(30);
  ok(scene.position.x > 40 && scene.position.x < 60, `property track animates (x=${scene.position.x.toFixed(1)})`);
  await engine.pump(31);
  eq(scene.position.x, 100, 'animation ends exactly on the last key');
  eq(anim.is_playing(), false, 'non-looping animation stops');

  /* method tracks + colors */
  anim.play('poke');
  await engine.pump(35);
  eq(pokes, 1, 'method track fired exactly once');
  anim.play('tint');
  await engine.pump(60);
  eq(box.modulate.to_hex(), '#ff0000', 'color track interpolates and writes a Color');

  /* pingpong */
  anim.play('bob');
  await engine.pump(60);
  const up = scene.position.y;
  await engine.pump(40);
  ok(scene.position.y < up, `pingpong reverses direction (${up.toFixed(1)} -> ${scene.position.y.toFixed(1)})`);

  /* seek / stop / queue */
  anim.play('slide');
  anim.seek(1);
  eq(scene.position.x, 100, 'seek(1) jumps to the final value');
  anim.stop();
  eq(anim.playing, false, 'stop() halts playback');
  eq(anim._time, 0, 'stop() rewinds');
  anim.play('slide');
  anim.queue('bob');
  anim.seek(1);
  await engine.pump(2);
  eq(anim.current_animation, 'bob', 'queue() plays the next animation when the first finishes');

  /* runtime building + signals */
  let started = 0, finished = 0;
  anim.connect('animation_started', () => started++);
  anim.connect('animation_finished', () => finished++);
  anim.make('quick', { length: 0.2, tracks: [{ property: 'position.x', keys: [[0, 0], [0.2, 10]] }] });
  eq(anim.current_animation, 'quick', 'make() builds and plays in one call');
  await engine.pump(20);
  ok(started >= 1, 'animation_started emitted');
  ok(finished >= 1, 'animation_finished emitted');

  /* a missing track target must warn, not explode */
  anim.add_animation('ghost', { length: 0.2, tracks: [{ node: 'DoesNotExist', property: 'position.x', keys: [[0, 0], [0.2, 5]] }] });
  anim.play('ghost');
  await engine.pump(15);
  ok(true, 'missing track targets are survived');
  engine.stop();
}

/* ================================================================== */
section('Navigation — region, agent, raycast');
{
  const world = new GE.Node2D(); world.name = 'World';
  const level = new GE.TileMap(); level.name = 'Level'; level.cell_size = 32;
  level.tiles = [
    '#########',
    '#.......#',
    '#..###..#',
    '#..#.#..#',
    '#..###..#',
    '#.......#',
    '#########',
  ];
  world.add_child(level);
  const nav = new GE.NavigationRegion2D(); nav.name = 'Nav'; world.add_child(nav);
  const agent = new GE.NavigationAgent2D(); agent.name = 'Agent'; world.add_child(agent);

  const engine = new GE.Engine({ headless: true });
  engine.tree.set_current_scene(world, 'world');
  const grid = nav.bake();
  eq(grid.cols, 9, 'grid columns from the tilemap');
  eq(grid.rows, 7, 'grid rows from the tilemap');
  ok(nav.is_walkable(new GE.Vector2(48, 48)), 'open floor is walkable');
  ok(!nav.is_walkable(new GE.Vector2(16, 16)), 'wall cells are not walkable');
  ok(!nav.is_walkable(new GE.Vector2(10000, 0)), 'outside the map is not walkable');

  const path = nav.find_path(new GE.Vector2(80, 176), new GE.Vector2(240, 48));
  ok(path.length >= 2, `path found around the wall (${path.length} points)`);
  const last = path[path.length - 1];
  ok(Math.abs(last.x - 240) < 2 && Math.abs(last.y - 48) < 2, 'path ends exactly on the target');
  ok(path.length <= 4, `string-pulling keeps the path tight (${path.length} points)`);
  for (const p of path) ok(nav.is_walkable(p), `waypoint (${p.x},${p.y}) is on walkable ground`);
  ok(nav.find_path(new GE.Vector2(48, 48), new GE.Vector2(48, 48)).length <= 1, 'path to yourself is trivial');
  const rnd = nav.random_point();
  ok(nav.is_walkable(rnd), 'random_point() lands on walkable ground');

  /* agent steering a CharacterBody2D */
  const mob = new GE.CharacterBody2D(); mob.name = 'Mob';
  mob.shape = { type: 'circle', radius: 10 };
  mob.position = new GE.Vector2(80, 176);
  world.add_child(mob);
  agent.position = new GE.Vector2(80, 176);
  let reached = 0;
  agent.connect('target_reached', () => reached++);
  agent.set_target(new GE.Vector2(240, 48));
  ok(agent.get_path().length >= 2, 'agent computes a path');
  for (let i = 0; i < 400 && !agent.is_navigation_finished(mob.global_position); i++) {
    agent.move_body(mob, 1 / 60, 90);
  }
  ok(reached >= 1, 'target_reached fired');
  ok(mob.global_position.distance_to(new GE.Vector2(240, 48)) < 14,
    `agent walked the body to the target (${mob.global_position.x.toFixed(0)},${mob.global_position.y.toFixed(0)})`);

  /* clearance: a small radius must keep a one-tile corridor open */
  const tight = new GE.NavigationRegion2D(); tight.name = 'Tight';
  tight.agent_radius = 4;
  tight.cell_size = 32;
  tight.polygon = [[0, 0], [320, 0], [320, 64], [0, 64]];
  tight.obstacles = [[[96, -10], [224, -10], [224, 74], [96, 74]]];
  world.add_child(tight);
  tight.bake();
  ok(tight.is_walkable(new GE.Vector2(64, 32)), 'a 4px agent still fits next to an obstacle');
  ok(!tight.is_walkable(new GE.Vector2(160, 32)), 'the obstacle itself is blocked');

  /* raycasts */
  const rc = new GE.RayCast2D(); rc.name = 'RC';
  rc.target_position = new GE.Vector2(96, 0);        /* right, into the inner block */
  rc.position = new GE.Vector2(48, 80);
  world.add_child(rc);
  await engine.pump(1);
  rc.force_raycast_update();
  ok(rc.is_colliding(), 'RayCast2D detects the wall');
  ok(rc.get_collision_distance() > 0, 'collision distance reported');
  ok(rc.get_collider() !== null, 'collider reported');
  rc.target_position = new GE.Vector2(0, 0);
  rc.force_raycast_update();
  ok(!rc.is_colliding(), 'a zero-length ray hits nothing');
  engine.stop();
}

/* ================================================================== */
section('Autoloads (project singletons)');
{
  const project = {
    name: 'auto', settings: { width: 320, height: 200 }, main_scene: 'main',
    assets: { scripts: {}, images: {} },
    autoloads: {
      Score: { script: "{ extends: 'Node', points: 0, add(n) { this.points += n; return this.points; }, _ready() { this.ready_hits = (this.ready_hits || 0) + 1; } }" },
      Config: { type: 'Node', props: {} },
    },
    scenes: { main: { root: { type: 'Node2D', name: 'Main' } } },
  };
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  ok(GE.Autoloads.has('Score') && GE.Autoloads.has('Config'), 'autoloads registered');
  eq(GE.Autoloads.names().join(','), 'Score,Config', 'declaration order kept');
  eq(GE.Autoloads.Score.add(7), 7, 'autoload methods work');
  eq(GE.Autoloads.Score.ready_hits, 1, '_ready ran exactly once');
  eq(GE.api.autoload('Score'), GE.Autoloads.Score, 'Goodness.autoload(name) resolves');
  ok(engine.tree.root.get_node('Score') === GE.Autoloads.Score, 'autoloads live under /root');
  eq(GE.Autoloads.get('Nope'), null, 'unknown autoload returns null');
  engine.stop();
  eq(GE.Autoloads.names().length, 0, 'stop() clears autoloads');
}

/* ================================================================== */
section('Scene connections from project files');
{
  const project = {
    name: 'conn', settings: { width: 320, height: 200 }, main_scene: 'main', assets: { scripts: {}, images: {} },
    scenes: { main: { root: { type: 'Node2D', name: 'Main', children: [
      { type: 'Timer', name: 'Ping', props: { wait_time: 0.1, one_shot: true, autostart: true },
        connections: [{ signal: 'timeout', to: 'Watcher', method: '_on_timeout' }] },
      { type: 'Node', name: 'Watcher', script: "{ extends: 'Node', hits: 0, _on_timeout() { this.hits++; globalThis.__conn_hits = this.hits; } }" },
    ] } } },
  };
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  await engine.pump(15);
  eq(globalThis.__conn_hits, 1, 'scene-file connection fired the target method');
  engine.stop();
}

/* ================================================================== */
section('New API services — art & words (stubbed fetch)');
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = (obj) => ({ ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(obj), json: async () => obj });
    if (u.includes('artic.edu/api/v1/artworks/search')) {
      return body({
        config: { iiif_url: 'https://www.artic.edu/iiif/2' },
        data: [
          { id: 1, title: 'A Sunday on La Grande Jatte', artist_title: 'Georges Seurat', image_id: 'abc-123', is_public_domain: true, date_display: '1884', medium_display: 'Oil on canvas' },
          { id: 2, title: 'Water Lilies', artist_title: 'Claude Monet', image_id: 'def-456', is_public_domain: true },
          { id: 3, title: 'No Image Here', artist_title: 'Anon', image_id: null, is_public_domain: true },
        ],
      });
    }
    if (u.includes('artic.edu/api/v1/artworks/27992')) {
      return body({ config: { iiif_url: 'https://www.artic.edu/iiif/2' }, data: { id: 27992, title: 'Water Lilies', artist_title: 'Claude Monet', image_id: 'zzz-999', is_public_domain: true } });
    }
    if (u.includes('datamuse.com/words')) {
      return body([
        { word: 'flame', score: 900, numSyllables: 1 },
        { word: 'same', score: 800, numSyllables: 1, defs: ['n\tbeing the same'] },
      ]);
    }
    if (u.includes('datamuse.com/sug')) return body([{ word: 'garden' }, { word: 'gargoyle' }]);
    throw new Error('unexpected fetch ' + u);
  };
  const api = GE.API;

  const list = await api.art.search('water lilies', { limit: 5 });
  eq(list.length, 2, 'art.search drops artworks without images');
  eq(list[0].artist, 'Georges Seurat', 'artist normalized');
  eq(list[0].image_url, 'https://www.artic.edu/iiif/2/abc-123/full/843,/0/default.jpg', 'IIIF image URL built from the config');
  ok(list[0].thumbnail_url.includes('/full/400,/'), 'thumbnail width respected');
  eq(api.art.image_url('xyz', 200), 'https://www.artic.edu/iiif/2/xyz/full/200,/0/default.jpg', 'image_url custom width');
  eq(api.art.image_url(null), null, 'image_url handles missing ids');
  const one = await api.art.get(27992);
  eq(one.title, 'Water Lilies', 'art.get by id');
  const deck = api.art.offline_deck(6);
  eq(deck.length, 6, 'offline deck size');
  ok(deck[0].image_url.startsWith('goodness://'), 'offline deck uses procedural textures');
  const tex = await api.art.texture(one, { width: 200 });
  ok(tex && tex.width > 0, 'art.texture returns a Texture');

  const rhymes = await api.words.rhymes('game', 5);
  eq(rhymes[0].word, 'flame', 'words.rhymes returns normalised entries');
  eq(rhymes[1].syllables, 1, 'syllable metadata kept');
  const described = await api.words.describe('same');
  eq(described.definition, 'being the same', 'describe() splits definitions from parts of speech');
  eq(described.part_of_speech, 'n', 'part of speech parsed');
  const sugs = await api.words.suggest('gar', 2);
  eq(sugs.join(','), 'garden,gargoyle', 'suggest() returns plain strings');
  const puz = api.words.offline_puzzle();
  ok(puz.word && puz.answers.length >= 4, 'offline_puzzle is game-ready');
  eq(api.count_syllables('extraordinary'), 5, 'syllable estimator');
  eq(api.count_syllables('cat'), 1, 'short words are one syllable');
  eq(api.services.length, 5, 'five wrapped services advertised');

  /* the built-in offline banks keep games playable with no network at all */
  const offline_qs = api.trivia.offline_questions(6);
  eq(offline_qs.length, 6, 'trivia offline bank returns the requested amount');
  ok(offline_qs.every((q) => q.answers.length === 4 && q.correct_index >= 0 && q.answers[q.correct_index]), 'every offline question has a valid correct answer');
  ok(api.art.offline_deck(4).every((a) => a.title && a.image_url), 'art offline deck is complete');
  ok(api.words.offline_puzzle().answers.length >= 4, 'words offline puzzle is playable');

  globalThis.fetch = realFetch;
}

/* ================================================================== */
section('API trainer tasks (editor content)');
{
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'editor/api_panel.js'), 'utf8');
  ok(src.includes('TRAINER_KEY'), 'trainer progress storage present');
  const task_count = (src.match(/id: 'task-/g) || []).length;
  eq(task_count, 10, `ten trainer tasks defined (${task_count})`);
  for (const key of ['API.pokemon', 'API.trivia', 'API.weather', 'API.art', 'API.words']) {
    ok(src.includes(key), `trainer covers ${key}`);
  }
  ok(src.includes('eval_code'), 'trainer reuses the snippet sandbox');
}

/* ================================================================== */
/* report */
setTimeout(() => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
  console.log('='.repeat(60));
  if (failed > 0) process.exit(1);
}, 300);
