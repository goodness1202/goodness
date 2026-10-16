/* ==========================================================================
   Goodness Engine — nodes/navigation.js
   Pathfinding the friendly way:

     NavigationRegion2D   a walkable area (a polygon, a TileMap, or both)
     NavigationAgent2D    "walk me to this point, please"
     RayCast2D            line-of-sight checks, bullets, vision cones

   The region bakes itself into a grid the first time it is needed, so a
   TileMap level becomes navigable with zero setup:

       const slime = tree.get_node('Slimes/Slime1');
       slime.get_node('Agent').set_target(player.global_position);
       ...
       slime.get_node('Agent').move_body(slime, delta, 90);
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2, Logger } = GE;

  /* ------------------------------------------------------------------ */
  /* Baking helpers                                                      */
  /* ------------------------------------------------------------------ */

  /** Normalise `polygon` / `points` props into an array of Vector2. */
  function to_points(raw) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    for (const p of raw) {
      if (Array.isArray(p)) out.push(new Vector2(Number(p[0]) || 0, Number(p[1]) || 0));
      else if (p && typeof p === 'object' && p.x !== undefined) out.push(new Vector2(Number(p.x) || 0, Number(p.y) || 0));
    }
    return out.length >= 3 ? out : null;
  }

  function point_in_polygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      const hit = ((a.y > p.y) !== (b.y > p.y)) &&
        (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
      if (hit) inside = !inside;
    }
    return inside;
  }

  /** Simple binary-heap priority queue (keeps A* snappy on big levels). */
  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item, priority) {
      const it = { item, priority };
      this.items.push(it);
      let i = this.items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.items[parent].priority <= this.items[i].priority) break;
        [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
        i = parent;
      }
    }
    pop() {
      const top = this.items[0];
      const last = this.items.pop();
      if (this.items.length) {
        this.items[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let small = i;
          if (l < this.items.length && this.items[l].priority < this.items[small].priority) small = l;
          if (r < this.items.length && this.items[r].priority < this.items[small].priority) small = r;
          if (small === i) break;
          [this.items[small], this.items[i]] = [this.items[i], this.items[small]];
          i = small;
        }
      }
      return top ? top.item : undefined;
    }
  }

  /* ------------------------------------------------------------------ */
  /* NavigationRegion2D                                                  */
  /* ------------------------------------------------------------------ */
  class NavigationRegion2D extends Node2D {
    constructor() {
      super();
      this.polygon = [];            // [[x,y], ...] explicit walkable area
      this.obstacles = [];          // [[[x,y],...], ...] holes in the area
      this._cell_size = 16;         // bake resolution in pixels
      this._cell_size_explicit = false;
      this.tilemap = '';            // optional node path of a TileMap to read
      this.auto_tilemap = true;     // use the first TileMap in the scene
      this.agent_radius = 2;        // pixels of clearance kept around walls
      this.auto_bake = true;
      this._grid = null;
      this._origin = new Vector2();
      this.add_signal('baked');
    }

    static def = {
      name: 'NavigationRegion2D', icon: '🧭', kind: 'Navigation', base: 'Node2D',
      desc: 'A walkable area for pathfinding. Bakes from a polygon or a TileMap.',
      props: [
        { path: 'polygon', type: 'json', doc: 'Walkable polygon, e.g. [[0,0],[640,0],[640,360],[0,360]].' },
        { path: 'obstacles', type: 'json', doc: 'Array of polygons to cut out of the area.' },
        { path: 'cell_size', type: 'number', min: 4, step: 4, doc: 'Bake resolution in pixels (smaller = finer).' },
        { path: 'tilemap', type: 'string', doc: 'Node path of a TileMap to bake from (optional).' },
        { path: 'auto_tilemap', type: 'bool', doc: 'Use the first TileMap in the scene when no polygon is set.' },
        { path: 'agent_radius', type: 'number', min: 0, step: 1, doc: 'Clearance kept around walls, in pixels.' },
        { path: 'auto_bake', type: 'bool', doc: 'Bake on the first query instead of asking.' },
      ],
      methods: [
        { sig: 'bake()', desc: 'Rebuild the navigation grid (call after editing a TileMap).' },
        { sig: 'is_baked()', desc: 'True when the grid is ready.' },
        { sig: 'is_walkable(point)', desc: 'Is this world point navigable?' },
        { sig: 'find_path(from, to)', desc: 'Array of world points from A to B (empty if no route).' },
        { sig: 'random_point()', desc: 'A random walkable world point.' },
      ],
      signals: [{ name: 'baked', args: ['cells'], desc: 'The grid was rebuilt.' }],
    };

    is_baked() { return !!this._grid; }

    _resolve_tilemap() {
      if (this.tilemap) {
        try {
          const n = this.get_node(this.tilemap) || (this.tree && this.tree.get_node(this.tilemap));
          if (n) return n;
        } catch (e) { /* fall through */ }
      }
      if (this.auto_tilemap && this.tree && this.tree.root) {
        const found = [];
        (function collect(n) {
          if (n.class_name === 'TileMap') found.push(n);
          for (const c of n.children) collect(c);
        })(this.tree.root);
        if (found.length) return found[0];
      }
      return null;
    }

    /** Bake resolution. Left at the default it follows the source TileMap. */
    get cell_size() { return this._cell_size; }
    set cell_size(v) { this._cell_size = Math.max(4, Number(v) || 16); this._cell_size_explicit = true; }

    bake() {
      const poly = to_points(this.polygon);
      const tilemap = poly ? (this.tilemap ? this._resolve_tilemap() : null) : this._resolve_tilemap();
      const cell = this._cell_size_explicit
        ? this._cell_size
        : Math.max(4, Number(tilemap && tilemap.cell_size) || this._cell_size);
      let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
      const consider = (x, y) => {
        min_x = Math.min(min_x, x); min_y = Math.min(min_y, y);
        max_x = Math.max(max_x, x); max_y = Math.max(max_y, y);
      };

      if (poly) for (const p of poly) consider(p.x, p.y);
      if (tilemap && tilemap.grid_size) {
        const cs = Number(tilemap.cell_size) || 32;
        const size = tilemap.grid_size;                  // in cells
        const pos = tilemap.global_position;
        consider(pos.x, pos.y);
        consider(pos.x + size.x * cs, pos.y + size.y * cs);
      }
      if (!isFinite(min_x)) {                       // nothing to bake from: use the viewport
        const vw = (this.tree && this.tree.engine && this.tree.engine.size) || { w: 1280, h: 720 };
        min_x = 0; min_y = 0; max_x = vw.w || 1280; max_y = vw.h || 720;
      }

      const origin = new Vector2(min_x, min_y);
      const cols = Math.max(1, Math.ceil((max_x - min_x) / cell));
      const rows = Math.max(1, Math.ceil((max_y - min_y) / cell));
      if (cols * rows > 300000) {
        Logger.warn(`NavigationRegion2D: ${cols}x${rows} cells is too fine — increase cell_size.`);
        return false;
      }

      const solid = new Uint8Array(cols * rows);
      const idx = (c, r) => r * cols + c;
      const cell_center = (c, r) => new Vector2(origin.x + (c + 0.5) * cell, origin.y + (r + 0.5) * cell);

      /* 1. solid cells from an obstacle polygon list */
      const obstacles = Array.isArray(this.obstacles) ? this.obstacles : [];
      for (const raw of obstacles) {
        const op = to_points(raw) || (Array.isArray(raw) && raw.polygon ? to_points(raw.polygon) : null);
        if (!op) continue;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (solid[idx(c, r)]) continue;
            if (point_in_polygon(cell_center(c, r), op)) solid[idx(c, r)] = 1;
          }
        }
      }

      /* 2. walkability from a TileMap (solid tiles block the cell) */
      if (tilemap && typeof tilemap.is_cell_solid === 'function') {
        const cell_px = Number(tilemap.cell_size) || 32;
        const to_map = (p) => (typeof tilemap.world_to_map === 'function'
          ? tilemap.world_to_map(p)
          : new Vector2(Math.floor(p.x / cell_px), Math.floor(p.y / cell_px)));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const p = cell_center(c, r);
            if (solid[idx(c, r)]) continue;
            if (poly && !point_in_polygon(p, poly)) { solid[idx(c, r)] = 1; continue; }
            const cell_rc = to_map(p);
            if (tilemap.is_cell_solid(Math.floor(cell_rc.x), Math.floor(cell_rc.y))) solid[idx(c, r)] = 1;
          }
        }
      } else if (poly) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!solid[idx(c, r)] && !point_in_polygon(cell_center(c, r), poly)) solid[idx(c, r)] = 1;
          }
        }
      }

      /* 3. clearance: dilate walls by agent_radius so agents don't hug corners */
      const radius_cells = Math.max(0, Math.round((Number(this.agent_radius) || 0) / cell));
      if (radius_cells > 0) {
        const padded = solid.slice();
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!solid[idx(c, r)]) continue;
            for (let dr = -radius_cells; dr <= radius_cells; dr++) {
              for (let dc = -radius_cells; dc <= radius_cells; dc++) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
                if (dc * dc + dr * dr > radius_cells * radius_cells + radius_cells) continue;
                padded[idx(cc, rr)] = 1;
              }
            }
          }
        }
        solid.set(padded);
      }

      this._grid = { cols, rows, cell, solid, origin };
      let open = 0;
      for (let i = 0; i < solid.length; i++) if (!solid[i]) open++;
      this.emit_signal('baked', open);
      if (!open) Logger.warn('NavigationRegion2D: baked an empty area — check the polygon/obstacles.');
      return this._grid;
    }

    _ensure_baked() {
      if (this._grid) return true;
      if (this.auto_bake) return this.bake();
      return false;
    }

    _cell_at(world) {
      const g = this._grid;
      const p = Vector2.from(world);
      const c = Math.floor((p.x - g.origin.x) / g.cell);
      const r = Math.floor((p.y - g.origin.y) / g.cell);
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
      return { c, r };
    }

    _cell_center(c, r) {
      const g = this._grid;
      return new Vector2(g.origin.x + (c + 0.5) * g.cell, g.origin.y + (r + 0.5) * g.cell);
    }

    is_walkable(world) {
      if (!this._ensure_baked()) return false;
      const cell = this._cell_at(world);
      if (!cell) return false;
      const g = this._grid;
      return !g.solid[cell.r * g.cols + cell.c];
    }

    /** Nearest walkable cell centre to a world point (spiral search). */
    _closest_open(world) {
      const g = this._grid;
      const cell = this._cell_at(world);
      if (!cell) return null;
      if (!g.solid[cell.r * g.cols + cell.c]) return this._cell_center(cell.c, cell.r);
      for (let ring = 1; ring <= Math.max(g.cols, g.rows); ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
          for (let dc = -ring; dc <= ring; dc++) {
            if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
            const c = cell.c + dc, r = cell.r + dr;
            if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
            if (!g.solid[r * g.cols + c]) return this._cell_center(c, r);
          }
        }
      }
      return null;
    }

    _line_clear(a, b) {
      const g = this._grid;
      const steps = Math.ceil(a.distance_to(b) / (g.cell * 0.5)) + 1;
      for (let i = 0; i <= steps; i++) {
        const p = a.lerp(b, i / steps);
        const cell = this._cell_at(p);
        if (!cell || g.solid[cell.r * g.cols + cell.c]) return false;
      }
      return true;
    }

    /** A* over the baked grid; returns smoothed world-space waypoints. */
    find_path(from, to) {
      if (!this._ensure_baked()) return [];
      const g = this._grid;
      const start = this._closest_open(from);
      const goal = this._closest_open(to);
      if (!start || !goal) return [];
      const sc = this._cell_at(start), gc = this._cell_at(goal);
      if (!sc || !gc) return [];
      const start_i = sc.r * g.cols + sc.c, goal_i = gc.r * g.cols + gc.c;
      if (start_i === goal_i) return [goal];

      const size = g.cols * g.rows;
      const g_score = new Float64Array(size).fill(Infinity);
      const came = new Int32Array(size).fill(-1);
      const closed = new Uint8Array(size);
      const open = new MinHeap();
      const h = (i) => {
        const c = i % g.cols, r = (i - c) / g.cols;
        const dx = Math.abs(c - gc.c), dy = Math.abs(r - gc.r);
        return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
      };
      g_score[start_i] = 0;
      open.push(start_i, h(start_i));
      const NEI = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
      let found = false;
      let guard = 0;
      while (open.size && guard++ < size * 4) {
        const cur = open.pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === goal_i) { found = true; break; }
        const cc = cur % g.cols, rr = (cur - cc) / g.cols;
        for (const [dc, dr, cost] of NEI) {
          const c = cc + dc, r = rr + dr;
          if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
          const i = r * g.cols + c;
          if (g.solid[i] || closed[i]) continue;
          /* no diagonal corner cutting */
          if (dc && dr && (g.solid[rr * g.cols + c] || g.solid[r * g.cols + cc])) continue;
          const tentative = g_score[cur] + cost;
          if (tentative < g_score[i] - 1e-9) {
            g_score[i] = tentative;
            came[i] = cur;
            open.push(i, tentative + h(i));
          }
        }
      }
      if (!found) return [];

      const cells = [];
      let i = goal_i;
      while (i !== -1 && cells.length < size) { cells.push(i); i = came[i]; }
      cells.reverse();
      const raw = cells.map((ci) => {
        const c = ci % g.cols, r = (ci - c) / g.cols;
        return this._cell_center(c, r);
      });

      /* string-pulling: keep only the corners we actually need */
      const out = [];
      let anchor = 0;
      while (anchor < raw.length) {
        let next = raw.length - 1;
        while (next > anchor + 1 && !this._line_clear(raw[anchor], raw[next])) next--;
        out.push(raw[next]);
        if (next === anchor) break;
        anchor = next;
      }
      const last = Vector2.from(to);
      if (out.length && this._line_clear(out[out.length - 1], last)) out[out.length - 1] = last;
      return out;
    }

    random_point() {
      if (!this._ensure_baked()) return Vector2.from(this.global_position);
      const g = this._grid;
      const open_cells = [];
      for (let i = 0; i < g.solid.length; i++) if (!g.solid[i]) open_cells.push(i);
      if (!open_cells.length) return Vector2.from(this.global_position);
      const pick = open_cells[Math.floor(GE.randf() * open_cells.length)];
      const c = pick % g.cols, r = (pick - c) / g.cols;
      return this._cell_center(c, r);
    }

    /** Debug helper: paint the baked grid (great while learning). */
    debug_draw(ctx, color = 'rgba(79,211,140,0.25)') {
      if (!this._grid) return;
      const g = this._grid;
      ctx.fillStyle = color;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (g.solid[r * g.cols + c]) continue;
          const p = this._cell_center(c, r);
          ctx.fillRect(p.x - g.cell / 2, p.y - g.cell / 2, g.cell, g.cell);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* NavigationAgent2D                                                   */
  /* ------------------------------------------------------------------ */
  class NavigationAgent2D extends Node2D {
    constructor() {
      super();
      this.target_position = new Vector2();
      this.region = '';                 // optional node path of a NavigationRegion2D
      this.path_desired_distance = 8;   // how close counts as "reached this corner"
      this.target_desired_distance = 8; // how close counts as "arrived"
      this.repath_interval = 0.35;      // seconds between automatic re-paths
      this.avoidance_enabled = false;
      this.debug_path = false;
      this._path = [];
      this._index = 0;
      this._target = new Vector2(NaN, NaN);
      this._since_repath = 0;
      this._finished = true;
      this.add_signal('path_changed');
      this.add_signal('target_reached');
    }

    static def = {
      name: 'NavigationAgent2D', icon: '🧭', kind: 'Navigation', base: 'Node2D',
      desc: 'Finds and follows paths. Put one under any character you want to walk by itself.',
      props: [
        { path: 'target_position', type: 'vector2', doc: 'Where to walk (world coordinates).' },
        { path: 'region', type: 'string', doc: 'Node path of the NavigationRegion2D (auto-detected if empty).' },
        { path: 'path_desired_distance', type: 'number', min: 1, doc: 'Distance at which a corner counts as reached.' },
        { path: 'target_desired_distance', type: 'number', min: 1, doc: 'Distance at which the target counts as reached.' },
        { path: 'repath_interval', type: 'number', min: 0, step: 0.05, doc: 'Seconds between automatic re-paths.' },
        { path: 'debug_path', type: 'bool', doc: 'Draw the current path (learning aid).' },
      ],
      methods: [
        { sig: 'set_target(point)', desc: 'Ask for a new path to a world point.' },
        { sig: 'get_next_path_position()', desc: 'The next waypoint to walk toward.' },
        { sig: 'is_navigation_finished()', desc: 'True when the target was reached.' },
        { sig: 'distance_to_target()', desc: 'Straight-line distance to the target.' },
        { sig: "move_body(body, delta, speed)", desc: "Walk a CharacterBody2D one step along the path." },
      ],
      signals: [
        { name: 'path_changed', args: ['points'], desc: 'A new path was computed.' },
        { name: 'target_reached', desc: 'The agent finished walking.' },
      ],
    };

    _resolve_region() {
      if (this._region) return this._region;
      if (this.region) {
        try {
          const n = this.get_node(this.region) || (this.tree && this.tree.get_node(this.region));
          if (n) { this._region = n; return n; }
        } catch (e) { /* fall through */ }
      }
      if (!this.tree) return null;
      const found = [];
      const collect = (n) => { if (n instanceof NavigationRegion2D) found.push(n); for (const c of n.children) collect(c); };
      collect(this.tree.root);
      this._region = found[0] || null;
      return this._region;
    }

    set_target(point, { force = false } = {}) {
      const p = Vector2.from(point);
      this.target_position = p;
      const moved = !(Math.abs(p.x - this._target.x) < 0.01 && Math.abs(p.y - this._target.y) < 0.01);
      if (!force && !moved && this._path.length) return this._path;
      this._target = p;
      return this.repath();
    }

    /** Whose position we steer from: the last body passed to move_body(). */
    _here() { return this._steer_pos ? Vector2.from(this._steer_pos) : this.global_position; }

    repath() {
      const region = this._resolve_region();
      if (!region) { this._path = []; this._index = 0; this._finished = true; return []; }
      const from = this._here();
      this._path = region.find_path(from, this._target);
      this._index = 0;
      this._finished = this._path.length === 0;
      this._since_repath = 0;
      this.emit_signal('path_changed', this._path.slice());
      return this._path;
    }

    get path() { return this._path.slice(); }
    get_path() { return this._path.slice(); }
    get next_position() { return this.get_next_path_position(); }

    get_next_path_position() {
      if (!this._path.length) return Vector2.from(this._target);
      const here = this._here();
      while (this._index < this._path.length - 1 &&
        here.distance_to(this._path[this._index]) <= this.path_desired_distance) this._index++;
      return this._path[this._index];
    }

    /** Pass a position to test a body's progress instead of the agent's own. */
    is_navigation_finished(position = null) {
      if (this._finished && !this._path.length) return true;
      const here = position ? Vector2.from(position) : this.global_position;
      return here.distance_to(this._target) <= this.target_desired_distance;
    }

    distance_to_target(position = null) {
      const here = position ? Vector2.from(position) : this.global_position;
      return here.distance_to(this._target);
    }

    /** Walk `body` toward the next waypoint at `speed` px/s. Returns the direction. */
    move_body(body, delta, speed = 100) {
      const region = this._resolve_region();
      if (region && region.is_baked && !region.is_baked()) region.bake();
      /* follow the body we are steering, not the agent node itself */
      this._steer_pos = Vector2.from(body.global_position);
      this._since_repath += delta;
      if (this._since_repath >= this.repath_interval && this.repath_interval > 0) {
        this._since_repath = 0;
        const before = this._path.length;
        this.repath();
        void before;
      }
      if (this.is_navigation_finished()) {
        if (!this._finished) { this._finished = true; this.emit_signal('target_reached'); }
        if (body.velocity) body.velocity = Vector2.ZERO;
        return Vector2.ZERO;
      }
      this._finished = false;
      const next = this.get_next_path_position();
      const here = body.global_position;
      const to = next.sub(here);
      const dir = to.length < 1 ? Vector2.ZERO : to.normalized;
      if (body.velocity) body.velocity = dir.mul(speed);
      if (typeof body.move_and_slide === 'function') body.move_and_slide();
      else if (typeof body.move_and_collide === 'function') body.move_and_collide(dir.mul(speed * delta));
      else body.global_position = here.add(dir.mul(speed * delta));
      if (body.get_angle_to) {
        const ang = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
        if (dir.length > 0) body.rotation = ang;
      }
      /* the step that arrives is the step that announces it */
      if (!this._finished && this.is_navigation_finished(body.global_position)) {
        this._finished = true;
        this.emit_signal('target_reached');
      }
      return dir;
    }

    _process(delta) {
      if (!this.debug_path || !this.tree) return;
      this._since_repath += delta;
    }

    _draw(ctx) {
      if (!this.debug_path || !this._path.length) return;
      ctx.strokeStyle = 'rgba(110,168,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const here = this.to_local(this.global_position);
      ctx.moveTo(here.x, here.y);
      for (const p of this._path.slice(this._index)) {
        const l = this.to_local(p);
        ctx.lineTo(l.x, l.y);
      }
      ctx.stroke();
      const n = this._path[this._index];
      if (n) {
        const l = this.to_local(n);
        ctx.fillStyle = '#ffd257';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _draw_this() { return !!this.debug_path && this._path.length > 0; }
  }

  /* ------------------------------------------------------------------ */
  /* RayCast2D — line-of-sight, bullets, "can the guard see me?"         */
  /* ------------------------------------------------------------------ */
  class RayCast2D extends Node2D {
    constructor() {
      super();
      this.enabled = true;
      this.target_position = new Vector2(100, 0);   // relative to this node
      this.collide_with_areas = true;
      this.collide_with_bodies = true;
      this.exclude_parent = true;
      this.debug = false;
      this._collider = null;
      this._point = null;
      this._normal = null;
      this._distance = 0;
    }

    static def = {
      name: 'RayCast2D', icon: '📡', kind: 'Navigation', base: 'Node2D',
      desc: 'Casts an invisible line and reports what it hits.',
      props: [
        { path: 'enabled', type: 'bool', doc: 'Turn the ray on or off.' },
        { path: 'target_position', type: 'vector2', doc: 'Ray end, relative to this node.' },
        { path: 'collide_with_bodies', type: 'bool', doc: 'Hit physics bodies (true) or only areas.' },
        { path: 'collide_with_areas', type: 'bool', doc: 'Include Area2D nodes.' },
        { path: 'exclude_parent', type: 'bool', doc: 'Ignore this node\'s parent (the guard itself).' },
        { path: 'debug', type: 'bool', doc: 'Draw the ray while learning.' },
      ],
      methods: [
        { sig: 'force_raycast_update()', desc: 'Re-cast immediately.' },
        { sig: 'is_colliding()', desc: 'Did the ray hit anything this frame?' },
        { sig: 'get_collider() / get_collision_point() / get_collision_normal()', desc: 'What and where it hit.' },
        { sig: 'get_collision_distance()', desc: 'Distance from the ray origin to the hit.' },
      ],
    };

    _physics_process() {
      if (this.enabled) this.force_raycast_update();
    }

    force_raycast_update() {
      const from = this.global_position;
      const to = from.add(this.target_position);
      const exclude = this.exclude_parent && this.parent ? [this.parent] : [];
      const hit = this.tree && this.tree.physics
        ? this.tree.physics.raycast(from, to, {
          exclude,
          collide_with_areas: this.collide_with_areas,
          collide_with_bodies: this.collide_with_bodies,
        })
        : null;
      this._collider = hit ? hit.collider : null;
      this._point = hit ? hit.point : null;
      this._normal = hit ? hit.normal : null;
      this._distance = hit ? hit.distance : from.distance_to(to);
      return hit;
    }

    is_colliding() { return !!this._collider; }
    get_collider() { return this._collider; }
    get_collision_point() { return this._point ? Vector2.from(this._point) : null; }
    get_collision_normal() { return this._normal ? Vector2.from(this._normal) : null; }
    get_collision_distance() { return this._distance; }

    _draw_this() { return !!this.debug; }

    _draw(ctx) {
      const t = this.target_position;
      ctx.strokeStyle = this._collider ? '#ff5a5f' : 'rgba(79,211,140,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const p = this._collider && this._point ? this.to_local(this._point) : t;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  GE.NavigationRegion2D = NavigationRegion2D;
  GE.NavigationAgent2D = NavigationAgent2D;
  GE.RayCast2D = RayCast2D;
  GE.Classes.register(NavigationRegion2D);
  GE.Classes.register(NavigationAgent2D);
  GE.Classes.register(RayCast2D);
})(typeof globalThis.GE !== 'undefined' ? globalThis.GE : (globalThis.GE = {}));
