# 13 · World layers — parallax, depth and screen space

A game world rarely sits on one flat plane. This chapter is about the layers
between the background and the HUD.

---

## Three kinds of "layer"

| Layer | Node | Space | Use for |
|---|---|---|---|
| World | everything under the scene root | camera space | the actual game |
| Parallax | `ParallaxBackground` + `ParallaxLayer` | screen space, scrolling | skies, mountains, stars |
| Canvas | `CanvasLayer` | screen space, fixed | HUD, menus, score |

Depth inside a layer is `z_index` (higher draws later). Done.

## Parallax in one picture

```
ParallaxBackground        (layer = -1 → drawn behind the world)
 ├─ ParallaxLayer         motion_scale = [0.15, 0.15]   ← far stars
 │   └─ Sprite
 ├─ ParallaxLayer         motion_scale = [0.4, 0.4]     ← hills
 │   └─ Sprite
 └─ ParallaxLayer         motion_scale = [1, 1]         ← trees, same speed as the world
     └─ Sprite
```

`motion_scale` is the whole trick:

| Value | What the player sees |
|---|---|
| `[0, 0]` | glued to the screen (never moves) |
| `[0.2, 0.2]` | drifts — "very far away" |
| `[0.5, 0.5]` | half speed — mid-distance |
| `[1, 1]` | scrolls exactly like the world (no parallax) |

The layer's origin is placed at the **screen centre** and then pushed by
`-camera_position × motion_scale`, so a sprite at `(0, 0)` inside a layer sits
in the middle of the screen — you author backgrounds around the centre, not
around world zero.

```js
const hills = get_node('Sky/Hills');
hills.motion_scale = new Vector2(0.35, 0.35);   // tweak at runtime
```

### Repeating art forever

Art never needs to be as wide as the level: set `motion_mirroring` and the
layer is drawn again and again, every N pixels, wrapping seamlessly.

```
ParallaxLayer
  motion_scale     = [0.3, 0.3]
  motion_mirroring = [480, 0]      ← your hill image is 480 px wide
```

That turns one 480 px strip into an endless horizon. Mirroring works on both
axes (`[480, 360]` for clouds, star fields, water), and `motion_offset` adds a
manual nudge for fine-tuning a layer's starting position.

> **Zoom-friendly:** by default `scroll_ignore_camera_zoom` keeps backgrounds
> steady when the camera zooms in — what you want in 95 % of games.

## Top-down depth with y-sort

In a top-down game, a character standing further down the screen must be
drawn *in front*. Instead of juggling `z_index`, tick **`y_sort_enabled`** on
the parent (or use a **`YSort`** node, which has it on by default):

```
Dungeon (YSort)
 ├─ Chest      (y = 128)
 ├─ Slime      (y = 160)     ← drawn after the chest because 160 > 128
 └─ Player     (y = 190)     ← drawn on top of both
```

Sorting happens per parent, at draw time, using world Y — so moving a
character one pixel down flips the order instantly. Combine it with
`z_index` for special cases (a flying enemy can set `z_index = 10` and float
above everything).

## Canvas layers, revisited

```js
const hud = get_node('HUD');          // CanvasLayer
hud.layer = 5;                        // higher = drawn later = on top
```

Negative layers are drawn **before** the world (that's where a
`ParallaxBackground` normally lives: `layer = -1`), positive layers after it.
Children of a `CanvasLayer` ignore the camera completely — their coordinates
are pixels on the screen, which is why HUD labels and buttons use small
numbers (`(20, 30)`) while the world uses thousands.

Buttons inside a `CanvasLayer` still receive clicks: input walks canvas layers
from the top down, exactly like drawing does.

---

## Lights: mood in two nodes

| Node | Does |
|---|---|
| `CanvasModulate` | multiplies a tint over the whole world — night, sunset, underwater |
| `PointLight2D` | a soft radial glow: torches, lamps, explosions, headlights |

```js
const night = get_node('Night');        // CanvasModulate, color = '#4a5a8a'
const torch = get_node('Torch');        // PointLight2D

torch.energy = 1.4;                     // brightness
torch.color = '#ffb347';                // warm torch light
torch.texture_scale = 2;                // radius ≈ 256 px
torch.blend_mode = 'add';               // 'add' = glow, 'mix' = a spotlight wash
torch.radius;                           // 128 × texture_scale × scale

torch.flicker(0.2);                     // random jitter — instant campfire
torch.pulse(1.5, 0.3);                  // endless breathing glow
```

Lights are drawn **after** the world geometry with the canvas `lighter`
blend, so they stack, and `CanvasModulate` is applied last — the HUD on a
`CanvasLayer` stays crisp and un-tinted, exactly like Godot.

```js
/* day → night without a single extra asset */
night.fade_to('#0b1030', 2.0);   // tweens the tint over two seconds
night.set_color('#ffffff');      // …and back to neutral instantly
```

**Cheap and effective:** one `CanvasModulate` plus a handful of
`PointLight2D`s turns a flat tilemap into a dungeon. `Dungeon Delve` uses
one modulate node and four torches.

---

## Putting it together

```
Main (Node2D)
 ├─ Sky        (ParallaxBackground, layer = -1)
 │   ├─ Stars  (ParallaxLayer  motion_scale [0.1, 0.1])
 │   └─ Hills  (ParallaxLayer  motion_scale [0.35, 0.35], mirroring [640, 0])
 ├─ Level      (Node2D)
 │   ├─ Tiles   (TileMap)
 │   ├─ Props   (YSort)          ← draws by Y
 │   └─ Enemies (YSort)
 │       └─ Slimes … (NavigationAgent2D children)
 ├─ Night      (CanvasModulate)  ← tints the world blue
 ├─ Torches    (Node2D)           ← PointLight2D children
 └─ HUD        (CanvasLayer, layer = 10)
     ├─ Score   (Label)
     └─ Health  (ProgressBar)
```

That is the whole architecture of **Dungeon Delve**, and of most 2D games
ever made. Add a `Camera2D` with `position_smoothing_enabled` under your
player and you have the feel of the pros.
