# 01 · Getting Started

**Goal:** from zero to your first running game in **ten minutes**, without installing anything.

Goodness Engine is a 2D game engine that runs in your browser. Nodes, scenes,
scripts, a visual editor, physics, sound, particles, tilemaps — the Godot
workflow, zero setup.

---

## 1. Start the engine

Everything is plain files — any static server works:

```bash
# from the repository root
python3 -m http.server 8080
# or: npx serve .
```

Then open:

| Page | What it is |
|---|---|
| `http://localhost:8080/editor.html` | **the visual editor** — where you'll work |
| `http://localhost:8080/player.html` | the runtime player |
| `http://localhost:8080/index.html` | landing page with links |
| `http://localhost:8080/examples/` | playable example games |

> Tip: the editor autosaves your project in the browser, so you can just
> close the tab and come back later.

## 2. The 60-second tour

Open **editor.html**. You'll see five regions:

```
┌─────────────────────────── top bar (menus · ▶ play) ──────────────────┐
│  SCENE tree   │                    VIEWPORT                │ INSPECTOR │
│  + ASSETS     │              (your game, live)             │ (properties) │
├───────────────┴────────────────────────────────────────────┴───────────┤
│  Console · Script · 📚 Tutorials · 🌐 API + Snippets                     │
└──────────────────────────────── status bar ────────────────────────────┘
```

1. Click **Ball** in the Scene panel (left).
2. **Drag it** around the viewport.
3. Press **▶** (or `F5`). It's a game now (well, a very calm one).
4. Press **⏹** (or `Esc`) to stop.

That's the whole loop: **select → edit → script → play**.

## 3. Your first script

With **Ball** selected, click the green banner in the Inspector:
**“📜 + Attach a script”**. A script editor opens. Replace the contents with:

```js
{
  extends: 'Sprite',
  vx: 320, vy: 260,
  _process(delta) {
    this.position.x += this.vx * delta;
    this.position.y += this.vy * delta;
    if (this.position.x < 48 || this.position.x > 1232) this.vx *= -1;
    if (this.position.y < 48 || this.position.y > 672) this.vy *= -1;
  },
}
```

Press **💾 Save & Check** (bottom toolbar), then **▶**.
The ball bounces around the screen. You just wrote a Goodness script.

**What happened here?**

- A script is a plain **object literal** — no classes, no boilerplate.
- `extends: 'Sprite'` says which node kind it enhances.
- `vx: 320` becomes `this.vx` on the node — properties are free.
- `_process(delta)` runs every frame. `this` **is the node**.
- `Input`, `SFX`, `API`, `Vector2`, `lerp`… are bare names, always available.

## 4. Guided tutorials (recommended)

At the bottom of the editor, open the **📚 Tutorials** tab and start
**“Hello, Game!”** — the lessons watch what you do and auto-advance:

| Lesson | Time | You build |
|---|---|---|
| 👋 Hello, Game! | 5 min | sprites, dragging, scripts, play mode |
| 🪙 Coin Rush in 15 minutes | 15 min | a complete platformer |
| 🌐 Free APIs in your game | 12 min | live data from PokéAPI / OpenTDB / Open-Meteo |
| ✨ Juice it up | 8 min | tweens, particles, shake, sound |

## 5. Where to go next

- **[02 · Editor Guide](02-editor-guide.md)** — every panel explained
- **[03 · Nodes & Scenes](03-nodes-and-scenes.md)** — the mental model
- **[04 · Scripting](04-scripting.md)** — the full scripting language tour
- **[08 · Free APIs](08-free-apis.md)** — put live internet data in your game
- **[API Reference](api-reference.md)** — every node, property and method
- Or open **File → Load Example** in the editor and dissect six complete games

One promise before you go: **everything in the example games is built from
the tools in these docs.** No hidden magic. If they can do it, you can.
