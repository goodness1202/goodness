# 03 · Nodes & Scenes — the mental model

Everything in Goodness is a **node** in a **tree**. If you know Godot,
you already know this. If you don't — ten minutes and you will.

---

## Nodes

A node is *one thing in your game*: an image, a collider, a timer, a label,
a camera. Nodes have:

- a **name** (unique among siblings)
- **properties** (position, color, size…)
- optional **children**
- an optional **script** (behaviour)

The node tree gives you composition: a `CharacterBody2D` player with a
`Sprite` child (how it looks), a `Camera2D` child (what follows it), and an
`Area2D` child (its hurtbox) is four small things instead of one big class.

## The node families

| Family | Nodes | Use them for |
|---|---|---|
| **Logic** | `Node`, `Node2D`, `Timer`, `HTTPRequest` | organization, timing, web data |
| **Visual** | `Sprite`, `AnimatedSprite`, `ColorRect`, `Polygon2D`, `Camera2D`, `CanvasLayer`, `ParallaxBackground`, `ParallaxLayer`, `YSort` | everything you see — see [13 · World Layers](13-world-layers.md) |
| **Physics** | `StaticBody2D`, `RigidBody2D`, `CharacterBody2D`, `Area2D` | floors, balls, players, pickups |
| **UI** | `Label`, `Button`, `ProgressBar`, `Panel` | HUDs and menus |
| **World** | `TileMap` | grid levels drawn with text |
| **Animation** | `AnimationPlayer` | keyframed motion — see [11 · Animation](11-animation.md) |
| **Navigation** | `NavigationRegion2D`, `NavigationAgent2D`, `RayCast2D` | enemies that hunt you — see [12 · Navigation](12-navigation.md) |
| **Effects** | `Particles2D` | fire, sparks, confetti |
| **Audio** | `AudioPlayer` | audio files (for synth sounds see `SFX`) |

Full property list per node: **[API Reference](api-reference.md)**.

## Transforms

`Node2D` and everything below it has **position, rotation (degrees), scale,
z_index**. A child lives in its parent's space:

```
Main (position 100, 100)
 └─ Sprite (position 50, 0)   ← 150, 100 in the world
```

Moving the parent moves the whole branch. Cameras parented to a player
follow automatically. Y points **down** (screen space) — gravity is +980.

## Scenes

A **scene** is a saved node tree — the unit of organization. Your project
has many scenes; one is the **main scene**. Build scenes in the editor, or
in JSON (that's what the editor edits under the hood):

```json
{
  "root": {
    "type": "Node2D", "name": "Main",
    "children": [
      { "type": "Sprite", "name": "Ball",
        "props": { "position": [320, 240], "texture": "goodness://ball" } },
      { "type": "CanvasLayer", "name": "HUD", "children": [
        { "type": "Label", "name": "Score", "props": { "text": "0" } }
      ]}
    ]
  }
}
```

### Scene instancing

Scene A can embed scene B with an `Instance` node — edit B once, every use
updates (this is how you make one enemy and spawn twelve):

```json
{ "type": "Instance", "name": "Goblin1", "scene": "goblin.json",
  "props": { "position": [400, 300] } }
```

In scripts you can instance from code:

```js
const goblin = await Goodness.SceneBuilder.build(
  this.tree.project.scenes['goblin'], this.tree.project, this.tree);
goblin.position = new Vector2(400, 300);
this.add_child(goblin);
```

## Finding nodes

```js
this.get_node('Sprite');            // child
this.get_node('../Enemy');          // sibling
this.get_node('../../HUD/Score');   // anywhere
this.get_tree().current_scene;      // the scene root
```

## Groups

Tag nodes into buckets and query them:

```js
this.add_to_group('enemies');                        // anywhere
for (const e of this.get_tree().get_nodes_in_group('enemies')) e._stun();
```

## Signals

Nodes announce events; you subscribe. In the Inspector's **Signals**
section, connect with a click, or from code:

```js
this.connect('body_entered', (body) => {
  if (body.name === 'Player') this.queue_free();
});
```

Common signals: `body_entered / body_exited` (physics), `area_entered`,
`pressed` (Button), `timeout` (Timer), `request_completed` (HTTPRequest),
`animation_finished` (AnimatedSprite).

## Deleting nodes safely

`this.queue_free()` — removes the node (and children) at the end of the
frame, after physics and drawing are done. Never delete mid-collision.

---

**Next:** [04 · Scripting](04-scripting.md) — the full language tour.
