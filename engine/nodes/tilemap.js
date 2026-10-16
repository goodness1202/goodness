/* ==========================================================================
   Goodness Engine — nodes/tilemap.js
   TileMap with a built-in procedural tileset. Levels are written as
   arrays of strings — the friendliest level format around:

     tiles: [
       "GGGGGGGGGG",
       "G........G",
       "G..C..P..G",
       "GGGGGGGGGG"
     ]

   Legend (built-in tileset):
     .  empty        G grass        D dirt         # stone
     B brick         W water(solid) = platform     L ladder
     C coin          ^ spike        T torch        X door
     P player spawn  E enemy spawn  F flag
   Solid by default: G D # B W.  One-way: =.  The rest are decorative
   or gameplay markers your scripts can query with get_cells_by_type().
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2, Rect2 } = GE;

  const SOLID = new Set(['G', 'D', '#', 'B', 'W']);
  const ONE_WAY = new Set(['=']);
  const DEFAULT_SOLID_TILES = 'GD#BW';

  /* ---------------- procedural tile painters ---------------- */
  const tile_painters = {
    G(ctx, s) {
      ctx.fillStyle = '#8a5a33'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#4fc46f'; ctx.fillRect(0, 0, s, s * 0.3);
      ctx.fillStyle = '#3da65d'; ctx.fillRect(0, s * 0.3, s, s * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, s * 0.36, s, s * 0.64);
      ctx.fillStyle = '#6d4426';
      for (let i = 0; i < 4; i++) ctx.fillRect((i * s) / 4 + 2, s * 0.45 + (i % 2) * 6, s / 4 - 4, s / 5);
    },
    D(ctx, s) {
      ctx.fillStyle = '#8a5a33'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#6d4426';
      for (let i = 0; i < 5; i++) ctx.fillRect(((i * 7) % (s - 6)) + 2, ((i * 13) % (s - 8)) + 2, s / 5, s / 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);
    },
    '#': (ctx, s) => {
      ctx.fillStyle = '#7d8798'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#9aa5b8'; ctx.fillRect(2, 2, s / 2 - 3, s / 2 - 3); ctx.fillRect(s / 2 + 1, s / 2 + 1, s / 2 - 3, s / 2 - 3);
      ctx.strokeStyle = '#5c6a82'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);
    },
    B(ctx, s) {
      ctx.fillStyle = '#b3502d'; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#e8ded2'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
      ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s / 2);
      ctx.moveTo(0, 0); ctx.lineTo(s, s);
      ctx.moveTo(s / 4, s / 2); ctx.lineTo(s / 4, s);
      ctx.moveTo(s * 0.75, s / 2); ctx.lineTo(s * 0.75, s);
      ctx.stroke();
    },
    W(ctx, s) {
      ctx.fillStyle = '#2f6fd6'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, 0, s, s * 0.18);
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath(); ctx.moveTo(0, s * 0.4);
      for (let x = 0; x <= s; x += s / 8) ctx.lineTo(x, s * 0.4 + Math.sin(x / s * Math.PI * 2) * 3);
      ctx.lineTo(s, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    },
    '=': (ctx, s) => {
      ctx.fillStyle = '#a4713f'; ctx.fillRect(0, s * 0.3, s, s * 0.28);
      ctx.fillStyle = '#7c5024'; ctx.fillRect(0, s * 0.58, s, s * 0.06);
      ctx.fillStyle = '#c98d52';
      for (let i = 0; i < 3; i++) ctx.fillRect(i * s / 3 + 3, s * 0.34, s / 3 - 6, s * 0.2);
    },
    L(ctx, s) {
      ctx.strokeStyle = '#a4713f'; ctx.lineWidth = Math.max(3, s / 10);
      ctx.beginPath();
      ctx.moveTo(s * 0.25, 0); ctx.lineTo(s * 0.25, s);
      ctx.moveTo(s * 0.75, 0); ctx.lineTo(s * 0.75, s);
      ctx.stroke();
      ctx.lineWidth = Math.max(2, s / 14);
      for (let y = s / 6; y < s; y += s / 4) {
        ctx.beginPath(); ctx.moveTo(s * 0.25, y); ctx.lineTo(s * 0.75, y); ctx.stroke();
      }
    },
    C(ctx, s) {
      ctx.translate(s / 2, s / 2);
      const t = GE.ProceduralTextures.create('coin');
      if (t && t.image) ctx.drawImage(t.image, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
      else { ctx.fillStyle = '#ffd257'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
    },
    '^': (ctx, s) => {
      const t = GE.ProceduralTextures.create('spike');
      if (t && t.image) ctx.drawImage(t.image, s * 0.1, s * 0.1, s * 0.8, s * 0.8);
      else { ctx.fillStyle = '#cdd7e6'; ctx.beginPath(); ctx.moveTo(s / 2, s * 0.1); ctx.lineTo(s * 0.9, s * 0.9); ctx.lineTo(s * 0.1, s * 0.9); ctx.closePath(); ctx.fill(); }
    },
    T(ctx, s) {
      const t = GE.ProceduralTextures.create('torch');
      if (t && t.image) ctx.drawImage(t.image, s * 0.15, s * 0.05, s * 0.7, s * 0.9);
    },
    X(ctx, s) {
      const t = GE.ProceduralTextures.create('door');
      if (t && t.image) ctx.drawImage(t.image, s * 0.1, 0, s * 0.8, s);
    },
    P(ctx, s) {
      const t = GE.ProceduralTextures.create('flag');
      if (t && t.image) ctx.drawImage(t.image, s * 0.15, s * 0.1, s * 0.7, s * 0.8);
    },
    F(ctx, s) {
      const t = GE.ProceduralTextures.create('flag');
      if (t && t.image) ctx.drawImage(t.image, s * 0.15, s * 0.1, s * 0.7, s * 0.8);
    },
  };

  class TileMap extends Node2D {
    constructor() {
      super();
      this.tiles = ['G....G', 'GGGGGG'];
      this.cell_size = 48;
      this.solid_tiles = DEFAULT_SOLID_TILES;
      this._tile_textures = new Map();
      this._dirty_rows = true;
      this._rows = [];
    }

    static def = {
      name: 'TileMap', icon: '🧩', kind: 'World', base: 'Node2D',
      desc: 'Grid level built from strings of tiles. Draws tiles and collides solids.',
      props: [
        { path: 'tiles', type: 'tiles', doc: 'Rows of characters — the level itself.' },
        { path: 'cell_size', type: 'number', min: 8, max: 256, step: 1, doc: 'Tile size in pixels.' },
        { path: 'solid_tiles', type: 'string', doc: 'Characters that collide (default GD#BW).' },
      ],
      methods: [
        { sig: 'get_cell(x, y) / set_cell(x, y, char)', desc: 'Edit tiles at runtime.' },
        { sig: 'world_to_map(p) / map_to_world(x, y)', desc: 'Convert world pixels <-> grid cells.' },
        { sig: "get_cells_by_type('C')", desc: 'Positions (grid coords) of all cells with a char.' },
        { sig: 'is_cell_solid(x, y)', desc: 'Check solidity at a grid cell.' },
      ],
    };

    _rows_from_tiles() {
      if (this._dirty_rows) {
        this._rows = (this.tiles || []).map((r) => String(r));
        this._dirty_rows = false;
      }
      return this._rows;
    }
    set tiles(v) { this._tiles = v; this._dirty_rows = true; }
    get tiles() { return this._tiles; }

    get grid_size() {
      const rows = this._rows_from_tiles();
      return new Vector2(Math.max(0, ...rows.map((r) => r.length)), rows.length);
    }
    get map_rect() {
      const g = this.grid_size;
      return new Rect2(0, 0, g.x * this.cell_size, g.y * this.cell_size);
    }

    get_cell(x, y) {
      const rows = this._rows_from_tiles();
      if (y < 0 || y >= rows.length) return '.';
      const row = rows[y];
      if (x < 0 || x >= row.length) return '.';
      return row[x] || '.';
    }
    set_cell(x, y, ch) {
      const rows = this._rows_from_tiles();
      if (y < 0 || y >= rows.length) return;
      const row = rows[y].padEnd(Math.max(x + 1, rows[y].length), '.');
      rows[y] = row.substring(0, x) + ch + row.substring(x + 1);
      this._tiles = rows.slice();
    }
    is_cell_solid(x, y) {
      const ch = this.get_cell(x, y);
      return this.solid_tiles.includes(ch);
    }
    is_cell_one_way(x, y) {
      return this.get_cell(x, y) === '=';
    }
    world_to_map(p) {
      const v = Vector2.from(p).sub(this.global_position);
      return new Vector2(Math.floor(v.x / this.cell_size), Math.floor(v.y / this.cell_size));
    }
    map_to_world(x, y) {
      return this.global_position.add(new Vector2((x + 0.5) * this.cell_size, (y + 0.5) * this.cell_size));
    }
    get_cells_by_type(ch) {
      const rows = this._rows_from_tiles();
      const out = [];
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push(new Vector2(x, y));
      });
      return out;
    }

    /* ---------------- physics provider ---------------- */
    get_solids(rect, opts = {}) {
      const out = [];
      const rows = this._rows_from_tiles();
      const x0 = Math.max(0, Math.floor((rect.x - this.global_position.x) / this.cell_size));
      const y0 = Math.max(0, Math.floor((rect.y - this.global_position.y) / this.cell_size));
      const x1 = Math.min(rows.reduce((m, r) => Math.max(m, r.length), 0), Math.ceil((rect.x + rect.w - this.global_position.x) / this.cell_size));
      const y1 = Math.min(rows.length, Math.ceil((rect.y + rect.h - this.global_position.y) / this.cell_size));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const ch = this.get_cell(x, y);
          if (ch === '.' || ch === ' ') continue;
          const solid = this.solid_tiles.includes(ch);
          const one_way = ch === '=';
          if (!solid && !one_way) continue;
          const aabb = {
            x: this.global_position.x + x * this.cell_size,
            y: this.global_position.y + y * this.cell_size,
            w: this.cell_size, h: this.cell_size,
          };
          out.push({ body: this, aabb, one_way, cell: new Vector2(x, y), char: ch });
        }
      }
      return out;
    }

    raycast_solids(from, to, opts = {}) {
      const hits = [];
      const solids = this.get_solids({
        x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x) + 1, h: Math.abs(to.y - from.y) + 1,
      });
      const d = to.sub(from);
      const len = d.length || 1;
      const dir = d.div(len);
      for (const s of solids) {
        let tmin = 0, tmax = len, normal = new Vector2();
        let hit = true;
        for (const [axis, sizeKey] of [['x', 'w'], ['y', 'h']]) {
          const da = axis === 'x' ? dir.x : dir.y;
          const fa = axis === 'x' ? from.x : from.y;
          const lo = s.aabb[axis], hi = s.aabb[axis] + s.aabb[sizeKey];
          if (Math.abs(da) < 1e-9) {
            if (fa < lo || fa > hi) { hit = false; break; }
          } else {
            let t1 = (lo - fa) / da, t2 = (hi - fa) / da;
            let n = new Vector2(axis === 'x' ? -Math.sign(da) : 0, axis === 'y' ? -Math.sign(da) : 0);
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = n.neg(); }
            if (t1 > tmin) { tmin = t1; normal = n; }
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) { hit = false; break; }
          }
        }
        if (hit && tmin >= 0 && tmin <= len) {
          hits.push({ point: from.add(dir.mul(tmin)), normal, distance: tmin });
        }
      }
      return hits;
    }

    /* ---------------- rendering ---------------- */
    _tile_texture(ch, size) {
      const key = ch + ':' + size;
      if (this._tile_textures.has(key)) return this._tile_textures.get(key);
      let tex = null;
      if (typeof document !== 'undefined') {
        const painter = tile_painters[ch];
        if (painter) {
          const cnv = document.createElement('canvas');
          cnv.width = size; cnv.height = size;
          const ctx = cnv.getContext('2d');
          if (ctx) { ctx.save(); painter(ctx, size); ctx.restore(); tex = new GE.Assets.Texture(cnv, size, size, `tile:${ch}`); }
        }
      }
      if (!tex) tex = new GE.Assets.Texture(null, size, size, `tile:${ch}`);
      this._tile_textures.set(key, tex);
      return tex;
    }

    _draw_this() { return true; }
    _draw(ctx, renderer) {
      const rows = this._rows_from_tiles();
      const s = this.cell_size;
      /* cull to view */
      let vx0 = -Infinity, vy0 = -Infinity, vx1 = Infinity, vy1 = Infinity;
      if (renderer && renderer.view_rect) {
        const vr = renderer.view_rect;
        const gp = this.global_position;
        vx0 = Math.floor((vr.x - gp.x) / s) - 1;
        vy0 = Math.floor((vr.y - gp.y) / s) - 1;
        vx1 = Math.ceil((vr.x + vr.w - gp.x) / s) + 1;
        vy1 = Math.ceil((vr.y + vr.h - gp.y) / s) + 1;
      }
      for (let y = 0; y < rows.length; y++) {
        if (y < vy0 || y > vy1) continue;
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
          if (x < vx0 || x > vx1) continue;
          const ch = row[x];
          if (ch === '.' || ch === ' ') continue;
          const tex = this._tile_texture(ch, s);
          if (tex && tex.image) ctx.drawImage(tex.image, x * s, y * s, s, s);
          else {
            /* fallback fill for unknown chars */
            ctx.fillStyle = SOLID.has(ch) ? '#7d8798' : 'rgba(255,255,255,0.2)';
            ctx.fillRect(x * s, y * s, s, s);
          }
        }
      }
    }
  }

  GE.Classes.register(TileMap);
  GE.TileMap = TileMap;
})(globalThis.GE);
