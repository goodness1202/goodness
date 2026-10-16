# 05 · Physics — bodies, areas and rays

Goodness ships focused 2D arcade physics: axis-aligned shapes, gravity,
perfect for platformers, top-down games and shooters. (Rotations are
visual-only — the classic trade for rock-solid, beginner-friendly collisions.)

---

## The four bodies

| Node | Moves? | Collides? | Use for |
|---|---|---|---|
| `StaticBody2D` | never | others bounce off it | floors, walls, platforms |
| `CharacterBody2D` | **you** move it | slides along surfaces | players, enemies |
| `RigidBody2D` | gravity & bounces | full | balls, crates, debris |
| `Area2D` | you move it | *detects only* | coins, triggers, hazards |

All bodies have a **shape** — `rect` (width × height) or `circle` (radius),
centered on the node. Set it in the Inspector.

## CharacterBody2D — the player body

The pattern that powers every platformer:

```js
{
  extends: 'CharacterBody2D',
  speed: 340,
  jump_speed: 560,
  _physics_process(delta) {
    // 1. steer
    this.velocity.x = Input.get_axis('ui_left', 'ui_right') * this.speed;
    if (Input.is_action_just_pressed('jump') && this.is_on_floor()) {
      this.velocity.y = -this.jump_speed;
      SFX.jump();
    }
    // 2. gravity
    this.velocity.y += 1000 * delta;
    // 3. move!
    this.move_and_slide();
  },
}
```

`move_and_slide()` does everything: moves in substeps, resolves walls and
floors, slides along surfaces, and updates:

- `this.on_floor / on_ceiling / on_wall`
- `this.is_on_floor()` — includes a **coyote-time** grace (0.12 s default)
- zeroes `this.velocity` into the surface (Godot 4 style)

Jump-through platforms: make the platform a `StaticBody2D` with
`one_way_collision = true`.

## RigidBody2D — things that tumble

Set `bounce` (0–1), `gravity_scale`, `mass`, `linear_damp` and let go:

```js
ball.gravity_scale = 1.4;
ball.apply_impulse(new Vector2(200, -300));   // kick it
```

Contacts fire signals:

```js
ball.connect('body_entered', (other) => {
  if (other.name === 'Floor') SFX.bounce();
});
```

## Area2D — the pickup / trigger

Areas don't push anything; they *notice* things:

```js
{
  extends: 'Area2D',
  _ready() {
    this.connect('body_entered', (body) => {
      if (body.name === 'Player') {
        SFX.coin();
        this.queue_free();
      }
    });
  },
}
```

Signals: `body_entered`, `body_exited`, `area_entered`, `area_exited`.
Also `this.get_overlapping_bodies()` any time.

## Gravity & the physics tick

- Default gravity **980 px/s² downward** — change it in **Project Settings**.
- Physics runs at a **fixed 60 Hz**, separate from rendering: smooth
  movement on any monitor. `_physics_process(delta)` is where movement
  belongs; `_process(delta)` is for visuals.

## Raycasts & queries

```js
const hit = this.tree.physics.raycast(from, to, { exclude: [self] });
if (hit) {
  hit.collider   // what was hit
  hit.point      // Vector2 where
  hit.normal     // surface normal
  hit.distance   // from 'from'
}
```

Ground probes, line-of-sight, laser sights. Also:
`physics.query_point(p)` → everything at a point (great for click-to-select).

## TileMap colliders

Tiles marked solid (`G D # B W` by default) collide automatically — the
whole level is one physics object. See [07 · TileMaps](07-tilemaps.md).

## Common recipes

**Stomp on enemies** (check fall direction on contact):

```js
// on the player, in _physics_process after move_and_slide()
for (const body of this.get_overlapping_bodies()) { /* if falling & above: stomp */ }
```

**Bounce pad:**

```js
// StaticBody2D child Area2D:
this.connect('body_entered', (body) => {
  if (body instanceof Goodness.CharacterBody2D) body.velocity.y = -900;
});
```

**Squash & stretch** (the juice that sells it):

```js
const target = this.on_floor ? new Vector2(1.1, 0.95) : new Vector2(0.9, 1.15);
this.sprite.scale = this.sprite.scale.lerp(target, 0.2);
```

---

**Next:** [06 · Input, Sound & UI](06-input-sound-ui.md).
