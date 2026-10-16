/* ==========================================================================
   Goodness Engine — physics/physics.js
   The 2D physics server: spatial-hash broadphase, rect/circle shapes,
   rigid-body integration, area overlaps, raycasts and point queries.
   Shapes are axis-aligned (rotations are visual only) — perfect for
   platformers, top-down games and arcade physics.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Vector2, Logger } = GE;

  const default_shape = () => ({ type: 'rect', width: 32, height: 32, offset: new Vector2() });

  function shape_aabb(shape, pos) {
    const o = shape.offset || Vector2.ZERO;
    if (shape.type === 'circle') {
      const r = shape.radius;
      return { x: pos.x + o.x - r, y: pos.y + o.y - r, w: r * 2, h: r * 2 };
    }
    const w = shape.width, h = shape.height;
    return { x: pos.x + o.x - w / 2, y: pos.y + o.y - h / 2, w, h };
  }

  function aabb_overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class PhysicsServer {
    constructor(tree, options = {}) {
      this.tree = tree;
      this.gravity = options.gravity !== undefined ? options.gravity : 980;
      this.cell = 96;
      this.statics = [];    // StaticBody2D + TileMap providers
      this.rigids = [];
      this.characters = [];
      this.areas = [];
      this._signal_queue = []; // deferred signals: [signal, node, other]
    }

    _register(node) {
      if (node._freed) return;
      if (node instanceof GE.RigidBody2D) this.rigids.push(node);
      else if (node instanceof GE.CharacterBody2D) this.characters.push(node);
      else if (node instanceof GE.StaticBody2D) this.statics.push(node);
      else if (node instanceof GE.Area2D) this.areas.push(node);
      else if (node instanceof GE.TileMap) this.statics.push(node);
    }
    _unregister(node) {
      const rm = (arr) => { const i = arr.indexOf(node); if (i >= 0) arr.splice(i, 1); };
      rm(this.statics); rm(this.rigids); rm(this.characters); rm(this.areas);
      /* purge from contact tracking */
      for (const b of [...this.rigids, ...this.characters, ...this.areas]) {
        b._contacts && b._contacts.delete(node);
      }
    }

    get bodies() { return [...this.statics, ...this.rigids, ...this.characters]; }

    /* ================================================================ */
    /* Solids queries (static bodies + tilemaps)                          */
    /* ================================================================ */

    /** All solid AABBs (with owners) intersecting a rect. */
    solids_in_rect(rect, opts = {}) {
      const out = [];
      for (const s of this.statics) {
        if (s._freed) continue;
        if (s.get_solids) {
          out.push(...s.get_solids(rect, opts));
        } else {
          const bb = shape_aabb(s.shape, s.global_position);
          if (aabb_overlap(rect, bb)) out.push({ body: s, aabb: bb, one_way: !!s.one_way_collision, shape: s.shape });
        }
      }
      return out;
    }

    /** Collide a moving body against solids, resolving penetration. */
    _resolve_body(body, pos, opts = {}) {
      /* returns {pos, hit_x, hit_y, normals:[Vector2], hit_bodies:Set} */
      const shape = body.shape;
      let aabb = shape_aabb(shape, pos);
      let hit_x = false, hit_y = false;
      const normals = [];
      const hit_bodies = new Set();
      const one_way_only_down = opts.moving_down !== false;

      for (let iter = 0; iter < 4; iter++) {
        const solids = this.solids_in_rect(aabb, {});
        let best = null;
        for (const s of solids) {
          if (s.body === body) continue;
          if (opts.skip && opts.skip.has(s.body)) continue;
          if (s.one_way) {
            /* one-way: only blocks when falling onto its top */
            const body_bottom_prev = aabb.y + aabb.h;
            const platform_top = s.aabb.y;
            if (!opts.moving_down || body_bottom_prev > platform_top + Math.max(6, (opts.velocity_y || 0) * -1 * 0 + 8)) continue;
          }
          if (!aabb_overlap(aabb, s.aabb)) continue;
          /* penetration depths */
          const dx_left = (s.aabb.x + s.aabb.w) - aabb.x;      /* push body right */
          const dx_right = (aabb.x + aabb.w) - s.aabb.x;       /* push body left */
          const dy_top = (s.aabb.y + s.aabb.h) - aabb.y;       /* push body down */
          const dy_bottom = (aabb.y + aabb.h) - s.aabb.y;      /* push body up */
          const dx = Math.min(dx_left, dx_right);
          const dy = Math.min(dy_top, dy_bottom);
          if (dx < 0 || dy < 0) continue;
          if (!best || Math.min(dx, dy) < Math.min(best.dx, best.dy)) {
            best = { s, dx, dy, dx_left, dx_right, dy_top, dy_bottom };
          }
        }
        if (!best) break;
        const { s, dx, dy } = best;
        hit_bodies.add(s.body);
        if (dx < dy) {
          /* resolve horizontally */
          if (best.dx_left < best.dx_right) { pos = pos.add(new Vector2(dx, 0)); normals.push(new Vector2(1, 0)); }
          else { pos = pos.sub(new Vector2(dx, 0)); normals.push(new Vector2(-1, 0)); }
          hit_x = true;
        } else {
          if (best.dy_top < best.dy_bottom) { pos = pos.add(new Vector2(0, dy)); normals.push(new Vector2(0, 1)); }
          else { pos = pos.sub(new Vector2(0, dy)); normals.push(new Vector2(0, -1)); }
          hit_y = true;
        }
        aabb = shape_aabb(shape, pos);
      }
      return { pos, hit_x, hit_y, normals, hit_bodies };
    }

    /* ================================================================ */
    /* Step                                                               */
    /* ================================================================ */
    step(delta) {
      /* ---- rigid bodies ---- */
      for (const body of this.rigids) {
        if (body._freed || !body.enabled) continue;
        if (body.gravity_scale !== 0) body.velocity.y += this.gravity * body.gravity_scale * delta;
        body.velocity = body.velocity.mul(1 - Math.min(0.99, body.linear_damp * delta));
        if (body._integrate) body._integrate(delta, this);
        else {
          /* default: substepped translation + resolution */
          const motion = body.velocity.mul(delta);
          const steps = Math.max(1, Math.ceil(motion.length / 8));
          let pos = body.global_position;
          const moving_down = body.velocity.y > 0;
          const vel_y = body.velocity.y;
          for (let i = 0; i < steps; i++) {
            pos = pos.add(motion.div(steps));
            const r = this._resolve_body(body, pos, { moving_down, velocity_y: vel_y });
            pos = r.pos;
            if (r.hit_y) {
              if (body.bounce > 0 && Math.abs(body.velocity.y) > 30) body.velocity.y = -body.velocity.y * body.bounce;
              else body.velocity.y = 0;
            }
            if (r.hit_x) {
              if (body.bounce > 0 && Math.abs(body.velocity.x) > 30) body.velocity.x = -body.velocity.x * body.bounce;
              else body.velocity.x = 0;
            }
            if (r.hit_bodies.size) this._track_contacts(body, r.hit_bodies);
          }
          body.global_position = pos;
        }
        /* rigid vs rigid separation (positional, cheap) */
      }
      this._separate_rigids();

      /* ---- areas ---- */
      for (const area of this.areas) {
        if (area._freed || !area.monitoring) continue;
        this._update_area(area);
      }

      /* ---- contact enter/exit bookkeeping for characters ---- */
      for (const ch of this.characters) {
        if (ch._contacts && ch._contacts.size && !ch._freed) {
          /* contacts persist one frame; exited handled on next overlap check */
        }
      }
    }

    _separate_rigids() {
      const rs = this.rigids.filter((r) => !r._freed && r.enabled);
      for (let i = 0; i < rs.length; i++) {
        for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          const aa = shape_aabb(a.shape, a.global_position);
          const bb = shape_aabb(b.shape, b.global_position);
          if (!aabb_overlap(aa, bb)) continue;
          const dx = Math.min((aa.x + aa.w) - bb.x, (bb.x + bb.w) - aa.x);
          const dy = Math.min((aa.y + aa.h) - bb.y, (bb.y + bb.h) - aa.y);
          const half_a = a.mass / (a.mass + b.mass);
          const half_b = b.mass / (a.mass + b.mass);
          if (dx < dy) {
            const dir = (aa.x + aa.w / 2) < (bb.x + bb.w / 2) ? -1 : 1;
            a.global_position = a.global_position.add(new Vector2(dir * dx * half_a, 0));
            b.global_position = b.global_position.add(new Vector2(-dir * dx * half_b, 0));
            a.velocity.x *= 0.5; b.velocity.x *= 0.5;
          } else {
            const dir = (aa.y + aa.h / 2) < (bb.y + bb.h / 2) ? -1 : 1;
            a.global_position = a.global_position.add(new Vector2(0, dir * dy * half_a));
            b.global_position = b.global_position.add(new Vector2(0, -dir * dy * half_b));
            a.velocity.y *= 0.5; b.velocity.y *= 0.5;
          }
          this._track_contacts(a, new Set([b]));
          this._track_contacts(b, new Set([a]));
        }
      }
    }

    _track_contacts(body, others) {
      if (!body._contacts) body._contacts = new Map(); // other -> frames_since_contact
      for (const o of others) {
        if (!body._contacts.has(o)) this._signal_queue.push([body, 'body_entered', o]);
        body._contacts.set(o, 0);
      }
    }

    /** Character body movement with sliding (called from move_and_slide). */
    move_character(body, velocity, delta, opts = {}) {
      const motion = Vector2.from(velocity).mul(delta);
      let pos = body.global_position;
      let on_floor = false, on_ceiling = false, on_wall = false;
      const normals = [];
      const hit_bodies = new Set();

      /* horizontal pass */
      if (motion.x !== 0) {
        pos = pos.add(new Vector2(motion.x, 0));
        const r = this._resolve_body(body, pos, { moving_down: false });
        if (r.hit_x) { on_wall = true; for (const n of r.normals) if (n.x !== 0) normals.push(n); }
        pos = r.pos;
        for (const b of r.hit_bodies) hit_bodies.add(b);
      }
      /* vertical pass */
      if (motion.y !== 0) {
        const moving_down = motion.y > 0;
        pos = pos.add(new Vector2(0, motion.y));
        const r = this._resolve_body(body, pos, { moving_down, velocity_y: motion.y / delta });
        if (r.hit_y) {
          if (moving_down) { on_floor = true; for (const n of r.normals) if (n.y < 0) normals.push(n); }
          else { on_ceiling = true; for (const n of r.normals) if (n.y > 0) normals.push(n); }
        }
        pos = r.pos;
        for (const b of r.hit_bodies) hit_bodies.add(b);
      }
      body.global_position = pos;

      /* floor probe when standing still (stick to ground) */
      if (motion.y === 0 && (opts.floor_snap !== false)) {
        const probe = pos.add(new Vector2(0, 2));
        const r = this._resolve_body(body, probe, { moving_down: true });
        if (r.hit_y && r.pos.y < probe.y) { body.global_position = r.pos; on_floor = true; }
      }

      if (hit_bodies.size) this._track_contacts(body, hit_bodies);
      return { on_floor, on_ceiling, on_wall, normals, hit_bodies };
    }

    /* ================================================================ */
    /* Areas                                                              */
    /* ================================================================ */
    _update_area(area) {
      const pos = area.global_position;
      const aabb = shape_aabb(area.shape, pos);
      const seen = new Set();
      /* bodies */
      for (const b of [...this.rigids, ...this.characters]) {
        if (b._freed || !b.enabled) continue;
        if (aabb_overlap(aabb, shape_aabb(b.shape, b.global_position))) {
          seen.add(b);
          this._area_contact(area, b, 'body');
        }
      }
      /* other areas */
      for (const a of this.areas) {
        if (a === area || a._freed || !a.monitoring) continue;
        if (aabb_overlap(aabb, shape_aabb(a.shape, a.global_position))) {
          seen.add(a);
          this._area_contact(area, a, 'area');
        }
      }
      /* statics (Godot areas do detect statics by default — useful for triggers) */
      if (area.detect_statics) {
        for (const s of this.solids_in_rect(aabb)) {
          if (s.body instanceof GE.TileMap) continue; /* tiles are too noisy */
          if (aabb_overlap(aabb, s.aabb)) { seen.add(s.body); this._area_contact(area, s.body, 'body'); }
        }
      }
      /* exited */
      if (area._overlaps) {
        for (const o of [...area._overlaps]) {
          if (!seen.has(o) || o._freed) {
            area._overlaps.delete(o);
            const kind = o instanceof GE.Area2D ? 'area_exited' : 'body_exited';
            this._signal_queue.push([area, kind, o]);
          }
        }
      }
    }

    _area_contact(area, other, kind_prefix) {
      if (!area._overlaps) area._overlaps = new Set();
      if (!area._overlaps.has(other)) {
        area._overlaps.add(other);
        const sig = kind_prefix === 'area' ? 'area_entered' : 'body_entered';
        this._signal_queue.push([area, sig, other]);
      }
    }

    /* ================================================================ */
    /* Queries                                                            */
    /* ================================================================ */
    raycast(from, to, opts = {}) {
      const f = Vector2.from(from), t = Vector2.from(to);
      const dir = t.sub(f);
      const len = dir.length;
      if (len === 0) return null;
      const d = dir.div(len);
      let best = null;

      const test_body = (body, aabb) => {
        if (opts.exclude && opts.exclude.includes(body)) return;
        if (opts.collide_with_areas === false && body instanceof GE.Area2D) return;
        /* slab test */
        let tmin = 0, tmax = len;
        let normal = Vector2.ZERO;
        for (const axis of ['x', 'y']) {
          const da = axis === 'x' ? d.x : d.y;
          const fa = axis === 'x' ? f.x : f.y;
          const lo = aabb[axis], hi = aabb[axis] + (axis === 'x' ? aabb.w : aabb.h);
          if (Math.abs(da) < 1e-9) {
            if (fa < lo || fa > hi) return;
          } else {
            let t1 = (lo - fa) / da, t2 = (hi - fa) / da;
            let n = new Vector2(axis === 'x' ? -Math.sign(da) : 0, axis === 'y' ? -Math.sign(da) : 0);
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = n.neg(); }
            if (t1 > tmin) { tmin = t1; normal = n; }
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return;
          }
        }
        if (tmin >= 0 && tmin <= len && (!best || tmin < best.distance)) {
          best = { collider: body, point: f.add(d.mul(tmin)), normal, distance: tmin };
        }
      };

      for (const s of this.statics) {
        if (s._freed) continue;
        if (s.raycast_solids) {
          const hits = s.raycast_solids(f, t, opts);
          for (const h of hits) {
            if (h && (!best || h.distance < best.distance)) best = { collider: s, ...h };
          }
        } else {
          test_body(s, shape_aabb(s.shape, s.global_position));
        }
      }
      if (opts.collide_with_bodies !== false) {
        for (const b of [...this.rigids, ...this.characters]) {
          if (b._freed || !b.enabled) continue;
          test_body(b, shape_aabb(b.shape, b.global_position));
        }
      }
      if (opts.collide_with_areas) {
        for (const a of this.areas) {
          if (a._freed || !a.monitoring) continue;
          test_body(a, shape_aabb(a.shape, a.global_position));
        }
      }
      return best;
    }

    query_point(point) {
      const p = Vector2.from(point);
      const rect = { x: p.x - 0.5, y: p.y - 0.5, w: 1, h: 1 };
      const out = [];
      for (const b of [...this.rigids, ...this.characters, ...this.areas]) {
        if (b._freed || !b.enabled) continue;
        if (aabb_overlap(rect, shape_aabb(b.shape, b.global_position))) out.push(b);
      }
      for (const s of this.solids_in_rect(rect)) out.push(s.body);
      return out;
    }

    /* Deferred signal flush — called by the SceneTree after each physics step. */
    flush_signals() {
      /* rigid/character contact enter/exit */
      for (const b of [...this.rigids, ...this.characters]) {
        if (!b._contacts) continue;
        for (const [other, age] of [...b._contacts]) {
          if (other._freed) { b._contacts.delete(other); this._signal_queue.push([b, 'body_exited', other]); continue; }
          b._contacts.set(other, age + 1);
          if (age >= 2) { /* not refreshed for 2 frames -> exited */
            b._contacts.delete(other);
            this._signal_queue.push([b, 'body_exited', other]);
          }
        }
      }
      const q = this._signal_queue.splice(0);
      for (const [node, sig, other] of q) {
        if (node._freed || !node.has_signal(sig)) continue;
        node.signals[sig].emit(other);
      }
    }
  }

  PhysicsServer.default_shape = default_shape;
  PhysicsServer.shape_aabb = shape_aabb;
  PhysicsServer.aabb_overlap = aabb_overlap;
  GE.PhysicsServer = PhysicsServer;
})(globalThis.GE);
