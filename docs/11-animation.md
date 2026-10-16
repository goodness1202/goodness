# 11 · Animation — make it move, make it feel good

Two tools, one goal: things that move nicely.

| Tool | Best for | Lives in |
|---|---|---|
| **`AnimationPlayer`** | authored, reusable, keyframed motion you want to tweak later | a node in the scene |
| **`Tween`** | one-off motion from code ("slide this to there in 0.4 s") | created on the fly |

Both are honest to Godot's design: `Animation` holds keyframe **tracks**,
`AnimationPlayer` plays them, and `create_tween()` gives you a throwaway
animation without touching the player.

---

## AnimationPlayer in 30 seconds

```js
const anim = get_node('Anim');

anim.play('bounce');                     // start (or restart)
anim.play('bounce', { speed: 2 });       // twice as fast
anim.play('bounce', { from_end: true }); // play backwards
anim.queue('idle');                      // …then this one
anim.seek(0.25);                         // scrub to a moment
anim.pause(); anim.resume(); anim.stop();
anim.is_playing();                       // true / false
anim.animation_length('bounce');         // seconds
```

Signals you can connect in the editor (**Node → Signals**) or from a script:

```js
anim.connect('animation_finished', () => console.log('done!'));
anim.connect('animation_started', (name) => console.log('started', name));
anim.connect('animation_changed', (old_name, new_name) => {});
anim.connect('track_keyframe_reached', (node, method, t) => {});
```

## Authoring animations

In the **Inspector**, the `AnimationPlayer.animations` property is a small
dictionary. Paste this and press ▶:

```js
{
  bounce: {
    length: 0.6,
    loop: 'pingpong',            // 'none' | 'linear' | 'pingpong'
    tracks: [
      { property: 'position.y', keys: [[0, 0, 'quad_in'], [0.3, -48, 'quad_out']] },
      { property: 'scale',      keys: [[0, 1], [0.15, 1.25], [0.3, 1]] }
    ]
  }
}
```

Prefer code? `AnimationPlayer.make()` builds *and* plays:

```js
const anim = get_node('Anim');
anim.make('pop', {
  length: 0.35,
  tracks: [
    { node: 'Sprite', property: 'scale', keys: [[0, [0.2, 0.2], 'back_out'], [0.35, [1, 1]]] },
    { node: '.', method: 'flash', at: 0.1, args: [3] },
  ],
});
```

### Tracks

| Track shape | What it animates |
|---|---|
| `{ property: 'position.y', keys: [[t, value], …] }` | any numeric / vector / color property |
| `{ node: 'Sprite', property: 'modulate', keys: [[0, '#ffffff'], [1, '#ff5a5f']] }` | another node in the same branch |
| `{ node: 'Sprite', method: 'flash', at: 0.2, args: [3] }` | calls a method at a moment in time |

**Key format:** `[time, value]` or `[time, value, easing]`.
`interp: 'nearest'` turns a track into a *hold/step* track (Godot's "Nearest").

**Easings:** `linear`, `sine_in/out/in_out`, `quad_*`, `cubic_*`, `quart_*`,
`expo_*`, `back_in/out`, `elastic_out`, `bounce_out` — plus friendly aliases
(`ease_in`, `ease_out`, `smooth`, `spring`, `out_back`).

**Loop modes:** `none` (fires `animation_finished`), `linear` (restarts from
0), `pingpong` (bounces back and forth — perfect for idle bobs).

**Node paths** in a track are relative to the player's *parent*: `'.'` means
"the node the player sits under", `'Sprite'` means a sibling-ish child, and a
full path like `'Enemies/Slime1'` works too.

---

## Tweens — the one-off kind

```js
const t = create_tween();              // on any Node
t.tween_property(sprite, 'position', { x: 400, y: 200 }, 0.5).set_ease('back_out');
t.tween_property(sprite, 'modulate', '#ff5a5f', 0.2);
t.tween_callback(() => SFX.coin());
t.set_loops(3);                        // or a big number for "forever"
t.kill();                              // stop early
```

Tweens are fire-and-forget: no node, no authoring, no cleanup. Reach for
`AnimationPlayer` when the motion belongs to the *character* (it is part of
what that thing is), and for tweens when it is a reaction to something that
just happened.

---

## Recipes

**Pop a button**

```js
_on_pressed() {
  this.get_node('Anim').make('pop', {
    length: 0.3,
    tracks: [{ node: '.', property: 'scale', keys: [[0, [1, 1]], [0.12, [0.9, 0.9]], [0.3, [1, 1], 'back_out']] }],
  });
}
```

**Walk cycle without a spritesheet** — bob the body, not the legs:

```js
const anim = this.get_node('Anim');
anim.add_animation('walk', {
  length: 0.5, loop: 'pingpong',
  tracks: [
    { node: 'Body', property: 'position.y', keys: [[0, 0], [0.25, -3]] },
    { node: 'Body', property: 'rotation', keys: [[0, -4], [0.5, 4]] },
  ],
});
anim.play('walk');   // call stop() when the player stops moving
```

**Hit flash**

```js
anim.add_animation('hurt', {
  length: 0.4,
  tracks: [{ node: 'Body', property: 'modulate', keys: [[0, '#ffffff'], [0.1, '#ff5a5f'], [0.4, '#ffffff']] }],
});
```

**Explosion that shakes and then frees itself**

```js
anim.add_animation('boom', {
  length: 0.6,
  tracks: [
    { property: 'scale', keys: [[0, [0.4, 0.4]], [0.2, [1.3, 1.3], 'back_out'], [0.6, [1.1, 1.1]]] },
    { method: '_die', at: 0.55 },
  ],
});
anim.play('boom');
```

Complete games that lean on this: **Art Gallery** (card flips), **Word Duel**
(option buttons popping in), **Dungeon Delve** (slime squash).

> **Editor tip:** the AnimationPlayer node works in the editor preview too —
> set `autoplay`, press ▶, and watch the animation drive the real scene.
