# 09 · Saving & Publishing

## Saving player data

`Save` persists JSON per project in `localStorage`:

```js
// settings & scores
Save.set('highscore', 12500);
const best = Save.get('highscore', 0);      // default if missing
Save.has('unlocked_hat') && Save.erase('unlocked_hat');

// named save-game slots
Save.save_game({ level: 3, coins: 12, x: 400, y: 120 }, 'slot1');
const g = Save.load_game('slot1');           // → the object (or null)
Save.list_slots();                           // ['slot1', 'slot2']
```

The classic high-score dance:

```js
const best = Save.get('highscore', 0);
if (score > best) {
  Save.set('highscore', score);
  banner.text = 'NEW BEST!';
}
```

## Publishing your game

A Goodness project is **one JSON file** plus the engine — both of which are
plain static files. Options, from easiest to fanciest:

### 1. Run from the repo (simplest)

```bash
python3 -m http.server 8080
# players open http://you:8080/player.html?project=examples/your-game/project.json
```

### 2. Single-file bundle (recommended for sharing)

Build the one-file engine and open `player.html` anywhere:

```bash
bash tools/build.sh          # → dist/goodness.js (single file)
```

Your page just needs:

```html
<canvas id="game" width="1280" height="720"></canvas>
<script src="dist/goodness.js"></script>
<script>
  const project = { /* your exported project JSON */ };
  GE.api.boot_project(project, document.getElementById('game'));
</script>
```

Export the JSON from the editor (**File → Export Project**), paste it in,
ship the file. That's the whole game.

### 3. Real hosting (itch.io, GitHub Pages, Netlify, …)

Upload the folder: `player.html`, `dist/goodness.js`, your project JSON,
and the `examples/` folder if you use `?project=` links. No build step, no
Node, no backend — it's all static.

## Project file format

```jsonc
{
  "name": "My Game",
  "settings": { "width": 1280, "height": 720, "background": "#10131f", "gravity": 980 },
  "main_scene": "main",
  "assets": {
    "scripts": { "player.js": "{ extends: 'Sprite', … }" },
    "images": { "hero": { "src": "data:image/png;base64,…" } }
  },
  "scenes": {
    "main": { "root": { "type": "Node2D", "name": "Main", "children": [ … ] } }
  }
}
```

Everything (scripts included) lives in this one file — that's what the
editor autosaves, exports and imports.

## Checklist before you ship

- [ ] Offline fallbacks for every `API.*` call (Rule #1!)
- [ ] `Save` keys don't collide between games (they're namespaced by project name — rename wisely)
- [ ] Sound only starts after a click/keypress (browser autoplay policy — the engine handles this, just don't fight it)
- [ ] Test with the console open — script errors show there
- [ ] Try a phone: touch + keyboard hints might need a button UI

---

**Also read:** [10 · Architecture](10-architecture.md) — how the engine
works inside, and how to extend it.
