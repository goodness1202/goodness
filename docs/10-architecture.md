# 10 · Architecture — how Goodness works inside

For the curious and the contributors. The engine is ~5,000 lines of
dependency-free JavaScript across small modules.

---

## Loading model

Classic `<script>` tags in dependency order, no bundler required:

```html
<script src="engine/loader.js"></script>   <!-- document.writes the rest -->
```

`engine/loader.js` holds the **manifest** — the single ordered list of
modules. Tests, the docs generator and the dist builder all parse it, so
there is exactly one place to add a file. Each module attaches to the
shared `globalThis.GE` namespace. `engine/index.js` assembles the public
`GE.api` object that scripts receive as `Goodness`.

Want one file? `bash tools/build.sh` → `dist/goodness.js`.

## Module map

```
engine/core/
  math.js        Vector2, Rect2, Color, easing, RNG
  signal.js      Godot-style signals (re-entrancy guarded)
  logger.js      leveled logging; the editor console subscribes
  node.js        Node base: tree mgmt, groups, signals, scripts,
                 class registry (Classes) + lifecycle dispatcher
  node2d.js      transforms (world matrix, dirty propagation)
  scene_tree.js  the world: scene, groups, physics world, cameras,
                 canvas layers, deferred frees, process order
  engine.js      Engine (main loop, fixed physics timestep) + OS
  renderer.js    Canvas2D renderer: camera pass + canvas layers
  assets.js      texture loader (builtin / project / URL / data URL)
  textures.js    the procedural art library (30+ drawn textures)
  scripts.js     script compiler (object literal → node behaviour)
  scene.js       SceneBuilder: JSON → live tree (+ Instance nodes)
  autoloads.js   project-wide singletons (/root/Name, Godot-style)
  tween.js       chained tweens with lazy start-value capture
  save.js        namespaced localStorage persistence

engine/physics/  physics.js (server: broadphase, resolution, raycast,
                 areas, deferred contact signals) · bodies.js
engine/input/    action-mapped input (keyboard/mouse/gamepad)
engine/audio/    WebAudio synth (SFX presets + Music sequencer)
engine/nodes/    sprites (+ CanvasLayer, Camera2D) · parallax (ParallaxBackground,
                 ParallaxLayer, YSort) · tilemap · ui · timer · effects
                 (Particles2D) · animation_player (AnimationPlayer, Animation) ·
                 navigation (NavigationRegion2D, NavigationAgent2D, RayCast2D) ·
                 audio_node
engine/net/      HTTPRequest node + API services (PokéAPI, OpenTDB, Open-Meteo,
                 Art Institute of Chicago, Datamuse) with caching & timeouts
```

## The frame

```
requestAnimationFrame
 └─ Engine.step(delta)
     ├─ Input._dispatch(tree)     queued events → UI (buttons) → nodes' _input
     ├─ physics_process ×N        fixed 1/60 steps:
     │   ├─ nodes' _physics_process(delta)
     │   ├─ PhysicsServer.step    gravity, integration, contacts
     │   └─ flush_signals         deferred body_entered/exited
     └─ process(delta)
         ├─ nodes' _process(delta)
         ├─ tweens, particles, timers
         └─ deferred queue_free flush
```

Rendering is separate: the Renderer collects drawables (world pass with
camera transform + shake, then CanvasLayer screen-space passes), sorts by
z-index and paints. TileMaps cull against the visible rect.

## The class registry — one source of truth

Every node class declares its own definition:

```js
static def = {
  name: 'Sprite', icon: '🖼️', kind: 'Visual', base: 'Node2D',
  desc: 'Draws a texture…',
  props: [ { path: 'texture', type: 'texture', doc: '…' } ],
  methods: [ { sig: 'get_rect()', desc: '…' } ],
};
GE.Classes.register(Sprite);
```

The **editor inspector**, the **Add Node dialog**, the **in-editor API
reference** and the generated **docs/api-reference.md** all read from
these defs — the docs can never drift from the code.

## Scripts: how `this` works

A script literal is compiled with `new Function` and a curated environment
(`Input`, `SFX`, `Vector2`, …). Methods are installed **on the node
instance**, so `this.method()` just works; non-function keys become
default property values. The lifecycle dispatcher runs the **native class
method first, then the script method** — that's why a Timer with a script
still honors `autostart`, and a scripted Particles2D still simulates.

## Physics design

Axis-aligned rect/circle shapes, uniform spatial queries, substepped
integration for fast bodies, minimal-penetration resolution, one-way
platforms, fixed-timestep character sliding with floor snapping, deferred
enter/exit contact signals, slab-test raycasts. Rotations are visual —
the deliberate trade for predictable, beginner-proof collisions.

## Testing

Three suites, all runnable in this sandbox (no browser needed):

```bash
node tests/engine.test.mjs      # 141 unit tests (math, nodes, physics…)
node tests/examples.test.mjs    # 27 smoke tests — boots every example game
node tests/editor.test.mjs      # 28 jsdom tests — drives the real editor UI
node tools/gen_api_docs.mjs     # regenerates docs/api-reference.md
node examples/build.mjs         # rebuilds examples/*/project.json
bash tools/build.sh             # bundles dist/goodness.js
```

The engine guards every browser API (`document`, `Image`, `localStorage`,
`AudioContext`, `requestAnimationFrame`, `fetch`), which is what makes
headless testing possible — and makes the engine resilient in odd
environments.

## Extending the engine

```js
class MagnetZone extends GE.Area2D {
  static def = { name: 'MagnetZone', icon: '🧲', kind: 'Physics', base: 'Area2D',
    desc: 'Pulls rigid bodies toward itself.', props: [ { path: 'strength', type: 'number' } ] };
  constructor() { super(); this.strength = 300; }
  _process(delta) { /* … */ }
}
GE.Classes.register(MagnetZone);
// it now appears in the editor's Add Node dialog, inspector, docs
```

Welcome aboard. ⚡
