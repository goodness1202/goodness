# 04 · Scripting — behaviour without boilerplate

Goodness scripts are plain JavaScript object literals attached to nodes.
No imports, no classes, no build step. This page is the complete tour.

---

## The shape of a script

```js
{
  extends: 'Sprite',        // which node class this enhances

  // ---- properties: defaults, editable per instance ----
  speed: 300,
  jump_force: 500,
  glow_color: '#7ef0b0',

  // ---- lifecycle ----
  _ready() {
    // once, when the node enters the tree
    this.sprite = this.get_node('Sprite');
  },
  _process(delta) {
    // every frame (use for visuals, input, timers)
  },
  _physics_process(delta) {
    // every physics tick, 60 Hz fixed (use for movement)
  },
  _input(event) {
    // every input event; return true to consume it
  },
  _exit_tree() {
    // cleanup
  },

  // ---- your own methods ----
  take_damage(n) {
    this.hp -= n;
    SFX.hurt();
  },
}
```

Attach scripts in the editor (Inspector → 📜 banner) or reference them in
scene JSON with `"script_name": "player.js"`.

## `this` is the node

Inside every method, `this` **is the node**. All node properties and
methods are right there:

```js
this.position            // Vector2
this.position.x += 5
this.rotation = 45       // degrees
this.visible = false
this.queue_free()        // delete safely
this.get_node('Sprite')  // find relatives
this.get_tree()          // the world
this.add_child(node)
this.add_to_group('boss')
this.create_tween()      // animations
this.global_position     // world space
this.look_at(target)     // face a point
```

And script methods become real methods — other scripts can call them:

```js
get_node('../Player').take_damage(10);
```

## The script environment

These names are available everywhere, no `Goodness.` prefix needed:

| Group | Names |
|---|---|
| Singletons | `Input` `OS` `SFX` `Music` `Save` `Assets` `API` |
| Types | `Vector2` `Color` `Rect2` |
| Math | `lerp clamp lerp_angle remap smoothstep deg2rad rad2deg` |
| Random | `randf randi randf_range randi_range choose` |
| Everything | `Goodness` (the full engine namespace) |

```js
this.position = this.position.lerp(new Vector2(640, 360), 0.05);
this.rotation = lerp_angle(this.rotation, 90, 0.2);
if (randf() < 0.01) SFX.blip();
```

## Movement patterns

```js
// smooth follow
this.position = this.position.lerp(target, delta * 4);

// constant speed toward a point
this.move_toward(player.position, 200 * delta);

// velocity + physics (the platformer controller)
this.velocity.x = Input.get_axis('ui_left', 'ui_right') * this.speed;
this.velocity.y += 1000 * delta;
this.move_and_slide();

// top-down 8-direction
const v = Input.get_vector('ui_left', 'ui_right', 'ui_up', 'ui_down');
this.position = this.position.add(v.mul(this.speed * delta));
```

## Signals

```js
// connect to a plain function
this.connect('body_entered', (body) => { /* ... */ });

// connect to a method on another node (by name — like the Inspector does)
timer.connect('timeout', hud, '_on_timeout');

// emit your own
this.add_signal('exploded');
this.emit_signal('exploded', this.position);
```

## Spawning & instancing at runtime

```js
// a bullet from thin air
const bullet = new Goodness.Sprite();
bullet.texture_src = 'goodness://laser';
bullet.position = this.global_position;
this.get_parent().add_child(bullet);

// particles for the boom
const boom = new Goodness.Particles2D();
boom.emitting = false; boom.amount = 0;
boom.position = this.global_position;
this.get_parent().add_child(boom);
boom.burst(30);
```

## Timers

```js
// fire-and-forget (auto-cleans)
this.get_tree().create_timer(1.5, () => SFX.blip());

// a Timer node you configured in the editor
const t = this.get_node('GunCooldown');
t.connect('timeout', this, '_shoot');
t.start();
```

## Tweens — animate anything

```js
this.create_tween()
  .tween_property(this, 'position', new Vector2(400, 200), 0.6)
  .set_trans('back_out')
  .callback(() => SFX.blip())
  .tween_property(this.get_child(0), 'scale', new Vector2(2, 2), 0.2)
  .set_loops(0);
```

Easings: `linear · sine/quad/cubic/quart/expo _in/_out · back_in/out ·
elastic_out · bounce_out`.

## Handling errors & debugging

- `Goodness.Logger.info/warn/error(msg)` → the editor Console.
- Script errors print the node and keep the game running.
- A `_process` that throws is disabled after the first error (no console
  spam), fix it and press ▶ again.

## Async: `await` in scripts

Scripts are friendly to `async` methods — this is how you call web APIs
without freezing the game:

```js
{
  extends: 'Node',
  _ready() { this._load(); },
  async _load() {
    try {
      const weather = await API.weather.current();
      Goodness.Logger.info(weather.description);
    } catch (e) { /* offline fallback */ }
  },
}
```

Full API call guide: **[08 · Free APIs](08-free-apis.md)**.

---

**Next:** [05 · Physics](05-physics.md).
