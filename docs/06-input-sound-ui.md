# 06 · Input, Sound & UI

The three senses of your game: touch, hearing, sight.

---

## Input

### Actions, not keys

Goodness maps friendly **action names** to keys, so "jump" can be Space
*and* the gamepad A button:

| Action | Default bindings |
|---|---|
| `ui_left / ui_right / ui_up / ui_down` | arrows + WASD (+ left stick) |
| `ui_accept` | Enter / Space |
| `ui_cancel` | Escape |
| `jump` | Space / Z / gamepad A |
| `fire` | X / gamepad X |

```js
Input.is_action_pressed('ui_left')        // held?
Input.is_action_just_pressed('jump')      // pressed this frame?
Input.is_action_just_released('jump')     // released this frame?
Input.get_axis('ui_left', 'ui_right')     // -1 · 0 · 1
Input.get_vector('l', 'r', 'u', 'd')      // normalized Vector2
```

### Custom actions

```js
// in a _ready() — keys, mouse buttons, gamepad
Input.map_action('dash', ['KeyL', 'ShiftLeft', 'MouseRight', 'Gamepad3']);
Input.add_action('aim', ['MouseLeft']);
```

Gamepad codes: `Gamepad0…GamepadN` (buttons), `GamepadAxis0Pos/Neg` etc.

### The mouse

```js
Input.mouse_position          // screen pixels
Input.get_world_mouse(this.tree)   // world pixels (camera-aware)
Input.on_event((ev) => { ... })    // every raw event
```

### Raw events in scripts

```js
_input(event) {
  if (event.type === 'key' && event.pressed && event.code === 'KeyE') this.interact();
  if (event.type === 'mouse' && event.pressed) this.shoot_at(event.position);
  return false;   // true = consumed, nobody else sees it
}
```

## Sound — zero files required

All effects are **synthesized** in WebAudio. There is nothing to download:

```js
SFX.jump();  SFX.coin();  SFX.hit();  SFX.hurt();  SFX.explosion();
SFX.laser();  SFX.powerup();  SFX.click();  SFX.blip();  SFX.win();  SFX.lose();
SFX.step();  SFX.spawn();
```

Custom one-shots:

```js
SFX.play({ wave: 'sawtooth', freq: 880, freq_end: 110, dur: 0.3, vol: 0.5, delay: 0.1 });
SFX.play_noise({ dur: 0.4, vol: 0.3 });
```

Chiptune music — notes as data:

```js
Music.play([
  { n: 'E4', d: 0.5 }, { n: 'G4', d: 0.5 }, { n: 'A4', d: 1 },
  { n: '-', d: 0.5 }, { n: 'G4', d: 0.5 }, { n: 'E4', d: 1 },
], { tempo: 132, wave: 'square', loop: true });
Music.stop();
```

For real audio files use an **AudioPlayer** node (URL or data: URL, loop,
volume, `finished` signal).

## UI — HUDs & menus

Put UI under a **CanvasLayer** so it ignores the camera:

```
CanvasLayer "HUD"
 ├─ Panel       (translucent rounded plate)
 │   ├─ Label   (score)
 │   └─ ProgressBar (health)
 └─ Button      (restart)
```

- **Label** — text, font size, color, align, outline, `autowrap`
- **Button** — click → `pressed` signal (connect in the Inspector!)
- **ProgressBar** — `value` / `max_value`, colors, optional text
- **Panel** — rounded translucent plate; the backbone of every HUD

```js
// update a score
this.get_node('../HUD/Score').text = 'Score: ' + this.score;

// react to a button (or wire it in the Inspector's Signals section)
start_btn.connect('pressed', this, '_start');

// a health bar that follows the drama
hp.value = Math.max(0, hp.value - damage);
const t = hp.create_tween();
t.tween_property(hp, 'modulate', new Color(1, 0.4, 0.4), 0.1)
 .tween_property(hp, 'modulate', new Color(1, 1, 1), 0.3);
```

UI nodes can also live in the world (a sign next to a door) — only
CanvasLayer children are screen-locked and click-able.

## Screenshake & feel

```js
camera.shake(0.3, 12);        // duration, strength — the cheapest juice there is
```

---

**Next:** [07 · TileMaps](07-tilemaps.md) — levels from strings.
