# 02 · The Editor — every panel explained

The Goodness editor follows the Godot layout. This page is your map.

---

## Top bar

| Control | Action |
|---|---|
| **File** | New / Save / Export / Import project, Load Example |
| **Edit** | Undo (`Ctrl+Z`) / Redo (`Ctrl+Y`), Project Settings |
| **Help** | Tutorials, API reference, docs |
| **▶ / ⏸ / ⏹** | Play (`F5`), pause (`F6`), stop (`F8` or `Esc`) the **current scene** |
| **🚀 Run Project** | runs the project's *main scene* in a new tab |

**Play mode** builds a live runtime from your scene JSON — scripts run,
physics simulates, the console streams logs. Stop restores the editing view
untouched.

## Scene dock (top-left)

The node tree of the open scene.

- **＋** — add a child node under the selection (searchable, categorized)
- **🗑** — delete (`Del`)
- **▲ ▼** — reorder among siblings (changes draw order)
- **Click** to select, **double-click** to rename
- 📜 marks nodes with scripts

## Assets dock (bottom-left)

Three tabs:

- **Scenes** — every scene in the project. `Open`, and ★ marks the *main
  scene* (what 🚀 Run Project launches).
- **Scripts** — every script asset. Click to edit, ✕ to delete.
- **Art** — the built-in procedural art library (30+ textures, zero files!).
  Select a Sprite in the scene, click a tile to assign it. You can also add
  your own images from a URL or file.

## Viewport (center)

- **Click** a node to select it (topmost under the cursor wins)
- **Drag** the selection to move it
- **Middle-drag** or **Space + drag** to pan · **wheel** to zoom
- Dashed green box + handles mark the selection; the blue frame marks your
  game's bounds (from Project Settings)
- **🧲 Snap** toggles 24 px grid snapping
- While playing, the viewport shows the live game

## Inspector (right)

Every editable property of the selected node, generated from the node's
class definition:

- **Transform** — position / rotation / scale / z-index / visibility
- **Node section** — type-specific properties (textures, colors, timers…)
- **Collision Shape** — for physics bodies (rect or circle, centered)
- **Signals** — one-click connect: pick a target node, name a method,
  the editor wires it
- **📜 script banner** — attach / open the node's script
- **✨ Example / ＋ preset buttons** — on animation and other structured
  properties the Inspector offers one-click presets (bounce, pop, fade in,
  shake, squash…), so a first animation is two clicks away

## Bottom panel

| Tab | What it's for |
|---|---|
| **Console** | engine logs, script errors (with the offending node), play-mode output |
| **Script** | the script editor — templates, live compile check (`✓ compiles cleanly`), attach/detach |
| **📚 Tutorials** | seven interactive guided lessons (hello world, platformer, APIs, juice, animation, navigation, world layers) that watch your moves |
| **🌐 API + Snippets** | searchable reference for every node **and the five free APIs**, with **runnable live snippets** plus the 🎯 **API Trainer** |

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `F5` / `F6` / `F8` | play / pause / stop |
| `Esc` | stop playing |
| `Ctrl+A` | add node |
| `Del` | delete node |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo |
| `Ctrl+S` | save (also autosaves constantly) |
| `Tab` | insert two spaces in the script editor |

## Project settings

**Edit → Project Settings**: name, resolution (width × height), background
color, gravity. These apply to play mode, the player, and exported games.

## Saving & sharing

- **Autosave** — the whole project lives in your browser's localStorage.
- **Export Project** — downloads a single `.goodness.json` file (scenes +
  scripts + image references). Send it to a friend; they Import it.
- **Import** — load any exported project or any `examples/*/project.json`.
