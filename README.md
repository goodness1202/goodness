# ⚡ Goodness Engine

**Complex inside. Kind outside.**

A free, open-source 2D game engine that runs entirely in your browser — with the
Godot workflow you know: a tree of nodes, scenes, a visual editor, physics,
keyframe animation, pathfinding, parallax, tweens, particles, tilemaps,
synthesized sound… **and first-class support for five free web APIs**, so your
games can fetch live data from the internet.

```js
// A complete platformer controller — an entire Goodness script
{
  extends: 'CharacterBody2D',
  speed: 340,
  _physics_process(delta) {
    this.velocity.x = Input.get_axis('ui_left', 'ui_right') * this.speed;
    if (Input.is_action_just_pressed('jump') && this.is_on_floor()) {
      this.velocity.y = -560;
      SFX.jump();
    }
    this.velocity.y += 1000 * delta;
    this.move_and_slide();
  },
}
```

---

## Quick start (60 seconds)

```bash
git clone https://github.com/goodness1202/goodness.git
cd goodness
python3 -m http.server 8080       # or: npx serve .
```

| Open | What you get |
|---|---|
| `http://localhost:8080/editor.html` | **the visual editor** |
| `http://localhost:8080/index.html` | landing page |
| `http://localhost:8080/examples/index.html` | nine playable example games |
| `http://localhost:8080/tests.html` | browser test run |

Then press **📚 Tutorials** in the editor and start *“Hello, Game!”* — the
interactive lessons watch what you do and auto-advance.

## What's inside

- **Node & scene system** — 30 node types (Sprite, CharacterBody2D, TileMap,
  Camera2D, Particles2D, AnimationPlayer, NavigationAgent2D, ParallaxLayer, UI,
  Timer, HTTPRequest…), instancing, groups, signals
- **Animation** — `AnimationPlayer` with property / colour / method-call tracks,
  16 easings, three loop modes and queues; one-line tweens for quick reactions
- **Navigation** — `NavigationRegion2D` bakes any TileMap (or polygon) into a
  nav grid, `NavigationAgent2D.move_body()` walks your enemies along it, and
  `RayCast2D` gives them eyes
- **World layers** — parallax backgrounds with endless mirroring, y-sorted
  top-down depth, canvas layers for HUDs
- **Visual editor** — scene dock, inspector, viewport gizmos, play mode,
  script editor with live compile checks, console, undo/redo — all in the browser
- **Physics** — `CharacterBody2D.move_and_slide()` with coyote time, rigid
  bodies, one-way platforms, areas, raycasts, fixed 60 Hz timestep
- **Tilemap levels** — draw whole levels as strings of characters; solid tiles
  collide automatically
- **Effects** — chained tweens (16 easings), particle system, screen shake
- **Sound with zero files** — a WebAudio synth: `SFX.jump()`, `SFX.coin()`,
  `Music.play([{n:'E4',d:0.5}, …])`
- **Procedural art library** — 30+ built-in textures, so examples and tutorials
  need no downloads
- **Save system** — namespaced localStorage with save-game slots
- **Publishing** — a project is one JSON file; bundle to a single JS + HTML

## Free APIs, built in & taught

Goodness ships wrappers for five **complete, free, no-key** public APIs, plus
an in-editor training panel (🌐 **API + Snippets**) with live runnable examples
and a 🎯 **API Trainer** holding ten graded tasks that check your code:

| API | Wrapper | Your game gets |
|---|---|---|
| [PokéAPI](https://pokeapi.co) | `API.pokemon` | 1025 creatures — sprites, stats, type-effectiveness |
| [Open Trivia DB](https://opentdb.com) | `API.trivia` | 4000+ quiz questions, decoded & shuffled |
| [Open-Meteo](https://open-meteo.com) | `API.weather` | live weather for any coordinates |
| [Art Institute of Chicago](https://api.artic.edu/docs) | `API.art` | 120 000+ public-domain artworks *and* the images (IIIF) |
| [Datamuse](https://www.datamuse.com/api/) | `API.words` | rhymes, synonyms, definitions, syllables, word puzzles |

```js
const mon = await API.pokemon.random();
await sprite.set_texture(mon.sprites.front);   // a Texture, ready to draw
hp_bar.max_value = mon.stats.hp * 2;
const mult = await API.pokemon.effectiveness(mon.types, foe.types);
```

```js
const art = await API.art.random({ query: 'water lilies' });   // a real painting
await tile.set_texture(await API.art.texture(art));

const round = await API.words.puzzle();                        // a word-game round
round.word, round.answers;                                     // 'ocean', ['sea', …]
```

Guide: **[docs/08-free-apis.md](docs/08-free-apis.md)** · interactive lesson plus
graded trainer tasks in the editor · full examples: *Trivia Quest*,
*Creature Clash*, *Art Gallery* and *Word Duel*.

## Example games

| Game | Teaches |
|---|---|
| 👋 **Hello Ball** | first script, particles |
| 🪙 **Coin Rush** | complete platformer: tilemap, coins, enemy, camera, best-time save |
| 🚀 **Nova Strike** | arcade shooter: waves, pooling, screen shake, chiptune music |
| ❓ **Trivia Quest** | a quiz game powered by the Open Trivia API (+ offline fallback) |
| ⚔️ **Creature Clash** | a battler where sprites, HP and damage all come from PokéAPI |
| ✨ **Particles Playground** | the effects lab |
| 🖼️ **Art Gallery** | memory game with real museum art: Art Institute API, flip animations, save slots |
| 🗝️ **Dungeon Delve** | pathfinding slimes, raycast vision, y-sorting, parallax depth, an autoload score |
| 🔤 **Word Duel** | beat the clock with Datamuse synonyms, rhymes and definitions |

Play them at `examples/index.html`, or load any into the editor with
**File → Load Example…** and read every script.

## Documentation

A 13-chapter book lives in [`docs/`](docs/01-getting-started.md) (in-site reader: [`docs/index.html`](docs/index.html)) — from
*Getting Started* to *Architecture*, plus [Animation](docs/11-animation.md),
[Navigation](docs/12-navigation.md) and [World Layers](docs/13-world-layers.md). The full
[API reference](docs/api-reference.md) is **generated from the engine source**
(`tools/gen_api_docs.mjs`), so it can never drift.

## For developers & contributors

```bash
node tests/engine.test.mjs      # 248 tests — math, nodes, physics, renderer, animation, navigation…
node tests/examples.test.mjs    # 77 tests — boots & plays every example, headless
node tests/editor.test.mjs      # 54 jsdom tests — drives the real editor UI
node tests/trainer.test.mjs     # 17 jsdom tests — grades every API-trainer task
node tests/site.test.mjs        # 58 jsdom tests — docs reader, player and editor pages
npm test                        # all five suites (459 checks, all green)
node examples/build.mjs         # rebuild examples/*/project.json
node tools/gen_api_docs.mjs     # regenerate docs/api-reference.md
bash tools/build.sh             # bundle dist/goodness.js (single file)
```

The engine is dependency-free classic JavaScript — every browser
API is guarded, which is exactly why the whole thing runs headless in Node
for testing. Architecture deep-dive: [docs/10-architecture.md](docs/10-architecture.md).

## Project layout

```
engine/       the engine (core, physics, nodes, input, audio, net)
editor/       the visual editor (HTML/CSS/JS)
examples/     nine example games (project.mjs → project.json)
docs/         the tutorial book + generated API reference
tools/        build & docs scripts
tests/        node + jsdom test suites
dist/         single-file bundle (generated)
```

## License

MIT — see [LICENSE](LICENSE).

---

Made with the engine it ships: even this README's code sample runs verbatim in
`editor.html`. Be kind, make games. ⚡
