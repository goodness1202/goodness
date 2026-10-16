/* Generate docs/api-reference.md from the engine's class definitions.
   Run: node tools/gen_api_docs.mjs */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const loader = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const files = [...loader.match(/FILES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
for (const f of files) require(path.join(ROOT, f));
const GE = globalThis.GE;

const out = [];
out.push('# Goodness Engine — API Reference');
out.push('');
out.push(`> Generated from the engine source (v${GE.VERSION}) by \`tools/gen_api_docs.mjs\`.`);
out.push('> Every node, property, method and signal the editor knows about.');
out.push('');

/* ---------------- value types ---------------- */
out.push('## Value types');
out.push('');
out.push('### Vector2 — `new Vector2(x, y)`');
out.push('`add sub mul div neg · dot cross · length normalized · distance_to direction_to · rotate(deg) · lerp · angle_to · angle_to_point · limit_length`');
out.push('Constants: `Vector2.ZERO ONE UP DOWN LEFT RIGHT`. Y points **down** (screen space).');
out.push('');
out.push('### Color — `new Color(r, g, b, a)` (0–1 floats) or `Color.from("#ff8000")`');
out.push('`lerp lighten darken with_alpha to_css to_hex`. Preset constants: `WHITE BLACK RED GREEN BLUE YELLOW ORANGE PURPLE CYAN GRAY`.');
out.push('');
out.push('### Rect2 — `new Rect2(x, y, w, h)`');
out.push('`has(point) intersects(other) grow(by) expand(point) center area`.');
out.push('');
out.push('### Signals — `node.connect("signal", target, "method")` / `node.signals.name.connect(fn)`');
out.push('`connect(target, method) · connect(fn) · disconnect · emit(args…)`. Deferred-safe and re-entrancy guarded.');
out.push('');

/* ---------------- node classes ---------------- */
out.push('## Node classes');
out.push('');
out.push('| Class | Extends | Category | Purpose |');
out.push('|---|---|---|---|');
for (const cls of GE.Classes.all()) {
  const d = cls.def;
  if (d.hidden) continue;
  out.push(`| ${d.icon} **${d.name}** | ${d.base || '—'} | ${d.kind || ''} | ${d.desc || ''} |`);
}
out.push('');

for (const cls of GE.Classes.all()) {
  const d = cls.def;
  if (d.hidden) continue;
  out.push(`---`);
  out.push('');
  out.push(`### ${d.icon} ${d.name}`);
  out.push('');
  out.push(`${d.desc || ''}`);
  if (d.base && d.base !== 'Node') out.push(`*Extends \`${d.base}\`.*`);
  out.push('');
  if (d.props && d.props.length) {
    out.push('| Property | Type | Description |');
    out.push('|---|---|---|');
    for (const p of d.props) out.push(`| \`${p.path}\` | ${p.type} | ${p.doc || ''} |`);
    out.push('');
  }
  if (d.methods && d.methods.length) {
    out.push('| Method | Description |');
    out.push('|---|---|');
    for (const m of d.methods) out.push(`| \`${m.sig}\` | ${m.desc} |`);
    out.push('');
  }
}

/* ---------------- singletons ---------------- */
out.push('---');
out.push('');
out.push('## Singletons (bare names inside scripts)');
out.push('');
out.push('| Name | What it does | Highlights |');
out.push('|---|---|---|');
out.push('| `Input` | keyboard/mouse/gamepad with actions | `is_action_pressed` `is_action_just_pressed` `get_axis` `get_vector` `map_action` `mouse_position` `get_world_mouse(tree)` |');
out.push('| `SFX` | synthesized sound effects | `jump coin hit hurt explosion laser powerup click blip win lose step spawn` + `play({wave,freq,…})` |');
out.push('| `Music` | chiptune sequencer | `play([{n:"E4",d:0.5},…], {tempo,wave,loop})` `stop()` |');
out.push('| `OS` | engine & platform info | `fps ticks_msec window_size platform datetime` |');
out.push('| `Save` | persistent data | `set get has erase keys` `save_game(slot) load_game(slot)` |');
out.push('| `Assets` | textures & files | `load_texture(src) preload` `builtin_names()` |');
out.push('| `API` | free web APIs | `pokemon.*` `trivia.*` `weather.*` `http.*` (see docs/08-free-apis.md) |');
out.push('| `Goodness` | the whole engine | every class, `boot_project`, `run` |');
out.push('');
out.push('Math helpers available as bare names: `lerp clamp lerp_angle remap smoothstep deg2rad rad2deg randf randi randf_range randi_range choose`, plus `Vector2 Color Rect2`.');
out.push('');
out.push('## Script lifecycle');
out.push('');
out.push('| Method | When it runs |');
out.push('|---|---|');
out.push('| `_ready()` | once, when the node enters the scene tree |');
out.push('| `_process(delta)` | every rendered frame |');
out.push('| `_physics_process(delta)` | every physics tick (60 Hz fixed) |');
out.push('| `_input(event)` | every input event (return `true` to consume) |');
out.push('| `_exit_tree()` | when the node leaves the tree |');
out.push('');
out.push('Non-function properties in a script literal become default values on the node:');
out.push('');
out.push('```js');
out.push('{');
out.push('  extends: "Sprite",');
out.push('  speed: 300,               // this.speed === 300');
out.push('  _process(delta) { this.position.x += this.speed * delta; },');
out.push('}');
out.push('```');
out.push('');

writeFileSync(path.join(ROOT, 'docs/api-reference.md'), out.join('\n'));
console.log(`✓ docs/api-reference.md (${out.length} lines, ${GE.Classes.all().length} node classes)`);
