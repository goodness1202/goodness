# Goodness Engine — API Reference

> Generated from the engine source (v0.2.0) by `tools/gen_api_docs.mjs`.
> Every node, property, method and signal the editor knows about.

## Value types

### Vector2 — `new Vector2(x, y)`
`add sub mul div neg · dot cross · length normalized · distance_to direction_to · rotate(deg) · lerp · angle_to · angle_to_point · limit_length`
Constants: `Vector2.ZERO ONE UP DOWN LEFT RIGHT`. Y points **down** (screen space).

### Color — `new Color(r, g, b, a)` (0–1 floats) or `Color.from("#ff8000")`
`lerp lighten darken with_alpha to_css to_hex`. Preset constants: `WHITE BLACK RED GREEN BLUE YELLOW ORANGE PURPLE CYAN GRAY`.

### Rect2 — `new Rect2(x, y, w, h)`
`has(point) intersects(other) grow(by) expand(point) center area`.

### Signals — `node.connect("signal", target, "method")` / `node.signals.name.connect(fn)`
`connect(target, method) · connect(fn) · disconnect · emit(args…)`. Deferred-safe and re-entrancy guarded.

## Node classes

| Class | Extends | Category | Purpose |
|---|---|---|---|
| 🔵 **Node** | — | Logic | Base building block of a scene. Organizes the tree and runs logic. |
| ✳️ **Node2D** | Node | Logic | A node with a 2D transform. Base for everything positioned in the world. |
| 🧱 **StaticBody2D** | PhysicsBody2D | Physics | Immovable collider. Floors, walls, platforms (set one_way for jump-through). |
| 🎳 **RigidBody2D** | PhysicsBody2D | Physics | Bodies pushed by gravity and collisions. Great for balls, crates, debris. |
| 🏃 **CharacterBody2D** | PhysicsBody2D | Physics | Player-style body. Call move_and_slide() every physics frame and it never sticks in walls. |
| 📡 **Area2D** | PhysicsBody2D | Physics | Overlap detector: coins, triggers, hazards. Emits body_entered / area_entered. |
| 🖼️ **Sprite** | Node2D | Visual | Draws a texture. Use built-in art via "goodness://hero", URLs or project images. |
| 🎞️ **AnimatedSprite** | Node2D | Visual | Sprite with named animations. Build frame lists from built-in art or sprite sheets. |
| ⬛ **ColorRect** | Node2D | Visual | Solid rectangle — floors, backgrounds, bars, simple characters. |
| 📐 **Polygon2D** | Node2D | Visual | Solid polygon from a point list (JSON array of [x, y]). |
| 🎥 **Camera2D** | Node2D | Visual | Scrolling camera. Make it follow a node (script sets position) or drag it around. |
| 🪟 **CanvasLayer** | Node | Visual | Screen-space layer for HUDs and menus. Children ignore the camera. |
| 🌄 **ParallaxLayer** | Node2D | Visual | A single layer of a scrolling background. |
| 🏔️ **ParallaxBackground** | CanvasLayer | Visual | Draws ParallaxLayer children behind (or in front of) the world. |
| 🪜 **YSort** | Node2D | Visual | Draws children sorted by their Y position — instant top-down depth. |
| 🌙 **CanvasModulate** | Node | Visual | Tints the entire world at once — night, sunset, underwater, dream. |
| 💡 **PointLight2D** | Node2D | Effects | A soft radial light — torches, lamps, explosions, magic, headlights. |
| 🧩 **TileMap** | Node2D | World | Grid level built from strings of tiles. Draws tiles and collides solids. |
| 🔤 **Label** | Control | UI | Text on screen. Score, dialogue, titles. |
| 🔘 **Button** | Control | UI | Clickable button. Emits the "pressed" signal. |
| 📶 **ProgressBar** | Control | UI | Health bars, loading bars, XP bars. |
| ▭ **Panel** | Control | UI | Rounded translucent panel — the backbone of good-looking HUDs. |
| ⏱️ **Timer** | Node | Logic | Calls its "timeout" signal after wait_time seconds. One-shot or looping. |
| ✨ **Particles2D** | Node2D | Effects | Fire, sparks, dust, explosions, confetti — without any art files. |
| 🎞️ **AnimationPlayer** | Node | Animation | Plays keyframe animations: position, scale, color, method calls. |
| 🧭 **NavigationRegion2D** | Node2D | Navigation | A walkable area for pathfinding. Bakes from a polygon or a TileMap. |
| 🧭 **NavigationAgent2D** | Node2D | Navigation | Finds and follows paths. Put one under any character you want to walk by itself. |
| 📡 **RayCast2D** | Node2D | Navigation | Casts an invisible line and reports what it hits. |
| 🔊 **AudioPlayer** | Node | Audio | Plays an audio file. For quick effects, try the SFX synth (no files needed). |
| 🌐 **HTTPRequest** | Node | Net | Fetch data from the web. Auto-parses JSON. Emits request_completed / request_failed. |

---

### 🔵 Node

Base building block of a scene. Organizes the tree and runs logic.

| Property | Type | Description |
|---|---|---|
| `name` | string | Unique name of this node among its siblings. |

| Method | Description |
|---|---|
| `add_child(node)` | Add a child node. Fails on invalid names or cycles. |
| `get_node(path)` | Fetch a relative or absolute node, e.g. 'Player/Sprite' or '../../HUD'. |
| `get_parent()` | Return the parent node (null for the root). |
| `queue_free()` | Delete this node safely at the end of the frame. |
| `connect(signal, target, method)` | Connect one of this node's signals to a method. |
| `emit_signal(name, ...args)` | Fire a signal with arguments. |
| `add_to_group(name) / is_in_group(name)` | Group management (e.g. "enemies"). |
| `create_tween()` | Build a chained tween driven by this node. |

---

### ✳️ Node2D

A node with a 2D transform. Base for everything positioned in the world.

| Property | Type | Description |
|---|---|---|
| `position` | vector2 | Position relative to the parent (pixels). |
| `rotation` | number | Rotation in degrees. |
| `scale` | vector2 | Scale (1,1 = normal). |
| `z_index` | number | Draw order. Higher draws on top. |
| `y_sort_enabled` | bool | Paint children front-to-back by their Y (top-down games). |
| `visible` | bool | Hide or show this branch. |

| Method | Description |
|---|---|
| `move_toward(target, max_dist)` | Move toward a point, at most max_dist pixels. |
| `get_angle_to(point)` | Angle (degrees) from this node to a world point. |
| `to_local(world_point) / to_global(local_point)` | Convert coordinates between local and world space. |
| `look_at(point)` | Rotate to face a world point. |

---

### 🧱 StaticBody2D

Immovable collider. Floors, walls, platforms (set one_way for jump-through).
*Extends `PhysicsBody2D`.*

| Property | Type | Description |
|---|---|---|
| `one_way_collision` | bool | Only collide from the top (platforms). |

---

### 🎳 RigidBody2D

Bodies pushed by gravity and collisions. Great for balls, crates, debris.
*Extends `PhysicsBody2D`.*

| Property | Type | Description |
|---|---|---|
| `mass` | number | Heavier bodies push lighter ones. |
| `gravity_scale` | number | 0 = floating, 2 = double gravity. |
| `bounce` | number | 0..1 bounciness. |
| `linear_damp` | number | Air resistance. |

| Method | Description |
|---|---|
| `apply_impulse(vec)` | Kick the body with an impulse (px/s). |

---

### 🏃 CharacterBody2D

Player-style body. Call move_and_slide() every physics frame and it never sticks in walls.
*Extends `PhysicsBody2D`.*

| Property | Type | Description |
|---|---|---|
| `coyote_time` | number | Seconds of jump grace after leaving a ledge. |

| Method | Description |
|---|---|
| `move_and_slide(velocity)` | Move with collision sliding. Updates on_floor / on_wall / on_ceiling. |
| `is_on_floor()` | True while standing on ground (or within coyote_time). |

---

### 📡 Area2D

Overlap detector: coins, triggers, hazards. Emits body_entered / area_entered.
*Extends `PhysicsBody2D`.*

| Property | Type | Description |
|---|---|---|
| `monitoring` | bool | Detect overlaps. |
| `detect_statics` | bool | Also detect static bodies (triggers). |

| Method | Description |
|---|---|
| `get_overlapping_bodies()` | Bodies currently inside this area. |

---

### 🖼️ Sprite

Draws a texture. Use built-in art via "goodness://hero", URLs or project images.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `texture` | texture | Image to draw ("goodness://star", URL or project image). |
| `modulate` | color | Tint color. |
| `flip_h` | bool | Mirror horizontally. |
| `flip_v` | bool | Mirror vertically. |
| `region` | json | Optional sub-rect {x,y,w,h} for sprite sheets. |

| Method | Description |
|---|---|
| `get_rect()` | World-space rect covered by this sprite. |
| `set_texture(src)` | Async: set texture from a source string. |

---

### 🎞️ AnimatedSprite

Sprite with named animations. Build frame lists from built-in art or sprite sheets.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `animations` | json | Animation dictionary (JSON). |
| `autoplay` | string | Animation to play on start. |
| `speed_scale` | number | Playback speed multiplier. |
| `modulate` | color | Tint color. |

| Method | Description |
|---|---|
| `play('walk')` | Play an animation (loops unless loop:false). |
| `stop() / pause()` | Control playback. |

---

### ⬛ ColorRect

Solid rectangle — floors, backgrounds, bars, simple characters.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `size` | vector2 | Width/height in pixels. |
| `color` | color | Fill color. |
| `corner_radius` | number | Rounded corners. |

---

### 📐 Polygon2D

Solid polygon from a point list (JSON array of [x, y]).
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `points` | json | Array of [x,y] points. |
| `color` | color | Fill color. |

---

### 🎥 Camera2D

Scrolling camera. Make it follow a node (script sets position) or drag it around.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `zoom` | number | Zoom (2 = half size, 0.5 = double). |
| `offset` | vector2 | Viewport offset in pixels. |
| `current` | bool | Use this camera. |
| `smoothing_enabled` | bool | Ease into position. |
| `smoothing_speed` | number | Smoothing speed. |
| `limit_left` | number | Left scroll limit. |
| `limit_top` | number | Top scroll limit. |
| `limit_right` | number | Right scroll limit. |
| `limit_bottom` | number | Bottom scroll limit. |

| Method | Description |
|---|---|
| `make_current()` | Activate this camera. |
| `shake(duration, strength)` | Screen shake! |

---

### 🪟 CanvasLayer

Screen-space layer for HUDs and menus. Children ignore the camera.

| Property | Type | Description |
|---|---|---|
| `layer` | number | Draw order between layers. |
| `visible` | bool | Show/hide the layer. |

---

### 🌄 ParallaxLayer

A single layer of a scrolling background.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `motion_scale` | vector2 | 0 = glued to the screen, 1 = scrolls with the camera, 0.3 = far away. |
| `motion_mirroring` | vector2 | Repeat the layer every N pixels (0 = no repeat). |
| `motion_offset` | vector2 | Extra manual offset. |
| `position` | vector2 | Position inside the layer. |

---

### 🏔️ ParallaxBackground

Draws ParallaxLayer children behind (or in front of) the world.
*Extends `CanvasLayer`.*

| Property | Type | Description |
|---|---|---|
| `layer` | number | Negative draws behind the world, positive in front. |
| `scroll_scale` | vector2 | Multiplies every child layer's motion_scale. |
| `scroll_base_offset` | vector2 | Offset added to the whole background. |
| `scroll_ignore_camera_zoom` | bool | Keep the background stable when zooming. |

| Method | Description |
|---|---|
| `scroll_offset` | Read-only current scroll offset (updated every frame). |

---

### 🪜 YSort

Draws children sorted by their Y position — instant top-down depth.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `position` | vector2 | Position in the world. |
| `y_sort_enabled` | bool | On by default for YSort. |

---

### 🌙 CanvasModulate

Tints the entire world at once — night, sunset, underwater, dream.

| Property | Type | Description |
|---|---|---|
| `color` | color | Multiplied over every world pixel. #ffffff = off. |
| `visible` | bool | Turn the tint off without deleting the node. |

| Method | Description |
|---|---|
| `set_color(color)` | Set the tint (accepts "#0b1030", Color, [r,g,b,a]). |
| `fade_to(color, duration)` | Tween the tint over time. |

---

### 💡 PointLight2D

A soft radial light — torches, lamps, explosions, magic, headlights.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `color` | color | Light colour. |
| `energy` | number | Brightness. Animate it for flicker. |
| `texture_scale` | number | Size multiplier (2 ≈ 260 px across). |
| `blend_mode` | enum | add = glow on top, mix = replaces the area. |
| `enabled` | bool | Switch the light off. |
| `texture` | texture | Optional custom light shape (defaults to a soft circle). |

| Method | Description |
|---|---|
| `flicker(amount)` | Randomize energy slightly — instant torch flicker. |
| `pulse(speed, amount)` | Endless breathing glow. |
| `radius` | Current world radius in pixels. |

---

### 🧩 TileMap

Grid level built from strings of tiles. Draws tiles and collides solids.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `tiles` | tiles | Rows of characters — the level itself. |
| `cell_size` | number | Tile size in pixels. |
| `solid_tiles` | string | Characters that collide (default GD#BW). |

| Method | Description |
|---|---|
| `get_cell(x, y) / set_cell(x, y, char)` | Edit tiles at runtime. |
| `world_to_map(p) / map_to_world(x, y)` | Convert world pixels <-> grid cells. |
| `get_cells_by_type('C')` | Positions (grid coords) of all cells with a char. |
| `is_cell_solid(x, y)` | Check solidity at a grid cell. |

---

### 🔤 Label

Text on screen. Score, dialogue, titles.
*Extends `Control`.*

| Property | Type | Description |
|---|---|---|
| `text` | string | Text to show. |
| `font_size` | number | Font size. |
| `color` | color | Text color. |
| `align` | enum | Alignment inside size.x. |
| `outline` | number | Outline thickness. |
| `autowrap` | bool | Wrap words inside size.x. |
| `size` | vector2 | Wrap box (when autowrap is on). |

---

### 🔘 Button

Clickable button. Emits the "pressed" signal.
*Extends `Control`.*

| Property | Type | Description |
|---|---|---|
| `text` | string | Button label. |
| `font_size` | number | Font size. |
| `size` | vector2 | Button size. |
| `bg_color` | color | Normal background. |
| `hover_color` | color | Mouse-over background. |
| `pressed_color` | color | While pressed. |
| `text_color` | color | Label color. |
| `corner_radius` | number | Rounded corners. |
| `disabled` | bool | Ignore clicks. |

| Method | Description |
|---|---|
| `connect('pressed', node, 'method')` | React to clicks. |

---

### 📶 ProgressBar

Health bars, loading bars, XP bars.
*Extends `Control`.*

| Property | Type | Description |
|---|---|---|
| `value` | number | Current value. |
| `max_value` | number | Value at full bar. |
| `size` | vector2 | Bar size. |
| `bg_color` | color | Track color. |
| `fill_color` | color | Fill color. |
| `show_text` | bool | Show the value as text. |

---

### ▭ Panel

Rounded translucent panel — the backbone of good-looking HUDs.
*Extends `Control`.*

| Property | Type | Description |
|---|---|---|
| `size` | vector2 | Panel size. |
| `color` | color | Fill (alpha supported). |
| `border_color` | color | Border color. |
| `corner_radius` | number | Corner rounding. |

---

### ⏱️ Timer

Calls its "timeout" signal after wait_time seconds. One-shot or looping.

| Property | Type | Description |
|---|---|---|
| `wait_time` | number | Seconds per cycle. |
| `one_shot` | bool | Fire once (true) or loop (false). |
| `autostart` | bool | Start automatically. |
| `process_always` | bool | Keep running while paused. |

| Method | Description |
|---|---|
| `start(time)` | Start (optionally with a new wait_time). |
| `stop()` | Stop and reset. |

---

### ✨ Particles2D

Fire, sparks, dust, explosions, confetti — without any art files.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `emitting` | bool | Spawn particles. |
| `amount` | number | Particles alive at once. |
| `lifetime` | number | Seconds each particle lives. |
| `direction` | number | Emission angle in degrees. |
| `spread` | number | Cone width around direction. |
| `speed_min` | number | Min launch speed. |
| `speed_max` | number | Max launch speed. |
| `gravity` | vector2 | Per-particle gravity. |
| `scale_min` | number | Min size. |
| `scale_max` | number | Max size. |
| `colors` | json | Color ramp, e.g. ["#ffd257", "#ff5a5f"]. |
| `explosiveness` | number | 0 = stream, 1 = burst. |
| `texture` | texture | Optional particle texture. |

| Method | Description |
|---|---|
| `burst(count)` | Spawn a one-off burst immediately. |

---

### 🎞️ AnimationPlayer

Plays keyframe animations: position, scale, color, method calls.

| Property | Type | Description |
|---|---|---|
| `autoplay` | string | Animation played automatically on _ready(). |
| `speed_scale` | number | Playback speed multiplier. |
| `animations` | json | Animation dictionary (see docs 11-animation.md). |

| Method | Description |
|---|---|
| `play(name, {speed, from_end})` | Start (or restart) an animation. |
| `stop()` | Stop and reset to time 0. |
| `pause()/resume()` | Freeze or continue playback. |
| `queue(name)` | Play another animation right after this one. |
| `seek(time)` | Jump to a time in seconds and apply it. |
| `is_playing()` | True while an animation runs. |

---

### 🧭 NavigationRegion2D

A walkable area for pathfinding. Bakes from a polygon or a TileMap.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `polygon` | json | Walkable polygon, e.g. [[0,0],[640,0],[640,360],[0,360]]. |
| `obstacles` | json | Array of polygons to cut out of the area. |
| `cell_size` | number | Bake resolution in pixels (smaller = finer). |
| `tilemap` | string | Node path of a TileMap to bake from (optional). |
| `auto_tilemap` | bool | Use the first TileMap in the scene when no polygon is set. |
| `agent_radius` | number | Clearance kept around walls, in pixels. |
| `auto_bake` | bool | Bake on the first query instead of asking. |

| Method | Description |
|---|---|
| `bake()` | Rebuild the navigation grid (call after editing a TileMap). |
| `is_baked()` | True when the grid is ready. |
| `is_walkable(point)` | Is this world point navigable? |
| `find_path(from, to)` | Array of world points from A to B (empty if no route). |
| `random_point()` | A random walkable world point. |

---

### 🧭 NavigationAgent2D

Finds and follows paths. Put one under any character you want to walk by itself.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `target_position` | vector2 | Where to walk (world coordinates). |
| `region` | string | Node path of the NavigationRegion2D (auto-detected if empty). |
| `path_desired_distance` | number | Distance at which a corner counts as reached. |
| `target_desired_distance` | number | Distance at which the target counts as reached. |
| `repath_interval` | number | Seconds between automatic re-paths. |
| `debug_path` | bool | Draw the current path (learning aid). |

| Method | Description |
|---|---|
| `set_target(point)` | Ask for a new path to a world point. |
| `get_next_path_position()` | The next waypoint to walk toward. |
| `is_navigation_finished()` | True when the target was reached. |
| `distance_to_target()` | Straight-line distance to the target. |
| `move_body(body, delta, speed)` | Walk a CharacterBody2D one step along the path. |

---

### 📡 RayCast2D

Casts an invisible line and reports what it hits.
*Extends `Node2D`.*

| Property | Type | Description |
|---|---|---|
| `enabled` | bool | Turn the ray on or off. |
| `target_position` | vector2 | Ray end, relative to this node. |
| `collide_with_bodies` | bool | Hit physics bodies (true) or only areas. |
| `collide_with_areas` | bool | Include Area2D nodes. |
| `exclude_parent` | bool | Ignore this node's parent (the guard itself). |
| `debug` | bool | Draw the ray while learning. |

| Method | Description |
|---|---|
| `force_raycast_update()` | Re-cast immediately. |
| `is_colliding()` | Did the ray hit anything this frame? |
| `get_collider() / get_collision_point() / get_collision_normal()` | What and where it hit. |
| `get_collision_distance()` | Distance from the ray origin to the hit. |

---

### 🔊 AudioPlayer

Plays an audio file. For quick effects, try the SFX synth (no files needed).

| Property | Type | Description |
|---|---|---|
| `stream` | string | Audio URL or data: URL (mp3/ogg/wav). |
| `volume` | number | Loudness. |
| `loop` | bool | Loop playback. |
| `autoplay` | bool | Play on scene start. |

| Method | Description |
|---|---|
| `play() / stop() / pause()` | Transport controls. |

---

### 🌐 HTTPRequest

Fetch data from the web. Auto-parses JSON. Emits request_completed / request_failed.

| Property | Type | Description |
|---|---|---|
| `timeout` | number | Seconds before giving up. |

| Method | Description |
|---|---|
| `request(url, {method, headers, body})` | Start a request (emits request_completed with text). |
| `request_json(url)` | Same, but parses JSON for you. |

---

## Singletons (bare names inside scripts)

| Name | What it does | Highlights |
|---|---|---|
| `Input` | keyboard/mouse/gamepad with actions | `is_action_pressed` `is_action_just_pressed` `get_axis` `get_vector` `map_action` `mouse_position` `get_world_mouse(tree)` |
| `SFX` | synthesized sound effects | `jump coin hit hurt explosion laser powerup click blip win lose step spawn` + `play({wave,freq,…})` |
| `Music` | chiptune sequencer | `play([{n:"E4",d:0.5},…], {tempo,wave,loop})` `stop()` |
| `OS` | engine & platform info | `fps ticks_msec window_size platform datetime` |
| `Save` | persistent data | `set get has erase keys` `save_game(slot) load_game(slot)` |
| `Assets` | textures & files | `load_texture(src) preload` `builtin_names()` |
| `API` | free web APIs | `pokemon.*` `trivia.*` `weather.*` `http.*` (see docs/08-free-apis.md) |
| `Goodness` | the whole engine | every class, `boot_project`, `run` |

Math helpers available as bare names: `lerp clamp lerp_angle remap smoothstep deg2rad rad2deg randf randi randf_range randi_range choose`, plus `Vector2 Color Rect2`.

## Script lifecycle

| Method | When it runs |
|---|---|
| `_ready()` | once, when the node enters the scene tree |
| `_process(delta)` | every rendered frame |
| `_physics_process(delta)` | every physics tick (60 Hz fixed) |
| `_input(event)` | every input event (return `true` to consume) |
| `_exit_tree()` | when the node leaves the tree |

Non-function properties in a script literal become default values on the node:

```js
{
  extends: "Sprite",
  speed: 300,               // this.speed === 300
  _process(delta) { this.position.x += this.speed * delta; },
}
```
