# 07 · TileMaps — levels from strings

A `TileMap` turns text into a drawn, colliding level. This is the
friendliest level format you will ever use:

```
GGGGGGGGGGGGGG
G....C.......G
G..P....==...G
G............G
G......E..X..G
GGGGGGGGGGGGGG
```

That's a real level: walls, a coin, a spawn point, a jump-through
platform, an enemy spawn and a door.

---

## The legend

| Char | Tile | Solid? |
|---|---|---|
| `.` | air | no |
| `G` | grass block | **yes** |
| `D` | dirt | **yes** |
| `#` | stone | **yes** |
| `B` | brick | **yes** |
| `W` | water | **yes** |
| `=` | platform | **one-way** (jump through from below) |
| `L` | ladder | no |
| `C` | coin | no — gameplay marker |
| `^` | spike | no — check it in your scripts! |
| `T` | torch | no |
| `X` | door / exit | no — marker |
| `P` | player spawn | no — marker |
| `E` | enemy spawn | no — marker |
| `F` | flag | no |

Solid characters are configurable (`solid_tiles` property, default
`"GD#BW"`). Rows can have different lengths; missing cells are air.

## Drawing & size

Each tile is `cell_size` pixels (default 48). The map is drawn with the
camera-aware culling and collides like any physics body — **one TileMap
node is the whole level's collision.**

## Editing

- **Editor:** select the TileMap → the `tiles` property is a textarea;
  type/paste rows. The Inspector shows the legend.
- **Code:** `set_cell(x, y, 'C')` — instant redraw & re-collide.

## Reading the map in scripts

```js
const level = this.get_node('../Level');

level.world_to_map(world_point)   // Vector2 pixels → grid cell
level.map_to_world(x, y)          // cell center in world pixels
level.get_cell(x, y)              // character at cell
level.is_cell_solid(x, y)
level.get_cells_by_type('C')      // every coin cell: [Vector2(x, y), …]
level.grid_size                   // Vector2(cols, rows)
```

## Spawning things from markers

The classic pattern (used by the Coin Rush example):

```js
{
  extends: 'Node2D',
  _ready() {
    const level = this.get_node('../Level');
    for (const cell of level.get_cells_by_type('C')) {
      const coin = new Goodness.Area2D();
      coin.position = level.map_to_world(cell.x, cell.y);   // snap to grid
      coin.shape = { type: 'circle', radius: 20 };
      coin.add_child(this._make_coin_sprite());
      this.add_child(coin);
    }
  },
}
```

`'P'` and `'E'` work the same way for player and enemy spawns.

## Hazards from tiles

Spikes aren't solid — check for them on the player:

```js
const cell = level.world_to_map(this.global_position.add(new Vector2(0, 18)));
if (level.get_cell(cell.x, cell.y) === '^') this._hurt();
```

## Doors / exits

```js
const cell = level.world_to_map(this.global_position);
if (level.get_cell(cell.x, cell.y) === 'X') this._next_level();
```

## Raycasts against tiles

TileMaps automatically answer `physics.raycast(from, to)` — line of sight
works out of the box.

---

**Next:** [08 · Free APIs](08-free-apis.md) — the internet as a content pipeline.
