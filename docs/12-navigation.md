# 12 · Navigation — enemies that actually hunt you

Three nodes turn a tilemap into a living level:

| Node | Job |
|---|---|
| **`NavigationRegion2D`** | bakes the walkable area (from a TileMap, a polygon, or both) |
| **`NavigationAgent2D`** | asks for a path and walks a body along it |
| **`RayCast2D`** | "can this guard see the player?" |

The region **bakes itself** the first time anything asks it for a path, so the
shortest setup is literally: drop in a region, add an agent under the enemy,
call `set_target()`.

---

## Setup

```
World (Node2D)
 ├─ Level (TileMap)                  ← walls come from '#' cells
 ├─ Nav   (NavigationRegion2D)       ← walks the tilemap, no config needed
 └─ Slimes (Node2D)
     └─ Slime1 (CharacterBody2D)
         └─ Agent (NavigationAgent2D)   ← steers Slime1
```

A `NavigationRegion2D` with an empty `polygon` bakes from the **first TileMap
in the scene**. Set `polygon` (a list of `[x, y]` points) when you'd rather
describe the walkable area by hand, and `obstacles` (a list of polygons) to
cut holes in it.

| Property | Meaning |
|---|---|
| `cell_size` | bake resolution in pixels. **Leave it alone** → it copies the TileMap's cell size |
| `agent_radius` | clearance kept around walls, in pixels (agents stop hugging corners) |
| `tilemap` | node path of a specific TileMap to read |
| `auto_bake` | `true` = bake on first use. `false` = only when **you** call `bake()` |

## Driving an enemy

```js
{
  extends: 'CharacterBody2D',
  speed: 70,
  vision: 220,
  _ready() {
    this.agent = this.get_node('Agent');
    this.eye = this.get_node('Eye');            // RayCast2D
    this.player = this.get_tree().get_first_node_in_group('player');
  },
  _physics_process(delta) {
    if (!this.player) return;
    const seen = this.eye.is_colliding() && this.eye.get_collider() === this.player;
    const distance = this.global_position.distance_to(this.player.global_position);
    if (seen || distance < this.vision) {
      this.agent.set_target(this.player.global_position);   // chase!
      this.agent.move_body(this, delta, this.speed);        // walk there
    } else {
      this.velocity = Vector2.ZERO;
    }
  },
}
```

`move_body(body, delta, speed)` does three jobs: it re-paths every
`repath_interval` seconds (0.35 by default), it moves the body with
`move_and_slide()` so it slides along walls, and it turns the body to face
where it is going. It also emits `target_reached` the frame the body arrives.

### Agent API

```js
agent.set_target(new Vector2(400, 120));   // ask for a path (world coords)
agent.get_path();                          // [Vector2, …] waypoints
agent.get_next_path_position();            // next corner to walk toward
agent.is_navigation_finished();            // true once the target is reached
agent.distance_to_target();
agent.repath();                            // force an immediate re-path
agent.connect('target_reached', () => this.state = 'idle');
agent.connect('path_changed', (points) => this.path = points);
```

`debug_path = true` draws the current path on screen — the fastest way to see
what the pathfinder is thinking.

### Region API (handy for scripting)

```js
nav.bake();                          // rebuild (after editing the tilemap)
nav.is_baked();
nav.is_walkable(point);              // is this world point navigable?
nav.find_path(from, to);             // [Vector2, …] — smoothed, wall-hugging-free
nav.random_point();                  // a random walkable spot → great for patrols
```

```js
/* the laziest wander AI in the world */
if (this.agent.is_navigation_finished()) this.agent.set_target(this.nav.random_point());
```

---

## RayCast2D — eyes, lasers, line of sight

A ray is a single line from the node to `target_position` (relative to it).
It updates every physics frame.

```js
const eye = get_node('Eye');        // RayCast2D, target_position = [200, 0]
if (eye.is_colliding()) {
  eye.get_collider();               // the node that was hit
  eye.get_collision_point();        // world position of the hit
  eye.get_collision_normal();       // surface normal, for spark effects
  eye.get_collision_distance();
}
eye.force_raycast_update();         // re-cast right now (outside physics frames)
```

Set `debug = true` in the Inspector to *see* the ray while you build.

**Rotate the ray, not the code:** make it a child node and set
`rotation` — `RayCast2D` follows its parent like any other `Node2D`, which is
how you build a vision cone from three rays, or a turret that tracks a
target with `look_at()`.

---

## Performance notes

- Baking is a one-shot cost: a 40×22 tilemap bakes in a couple of
  milliseconds. Re-bake only when the level actually changes
  (`nav.bake()`), then connected agents re-path on their own schedule.
- The grid is capped at ~300 000 cells; raise `cell_size` if a level is huge.
- Pathfinding uses A* with a binary heap plus string-pulling, so paths are
  short (a few corners) and every agent can re-path a few times per second
  without noticing.
- Prefer **one region per level** and many agents: regions hold the grid,
  agents are nearly free.

Working example: **Dungeon Delve** (File → Load Example) — 7 slimes, one
region, raycast eyes, and a player they lose track of behind walls.
