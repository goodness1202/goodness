/* ==========================================================================
   Goodness Engine — core/node2d.js
   2D transform node: position, rotation (degrees), scale, z_index.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node, Vector2 } = GE;

  class Node2D extends Node {
    constructor() {
      super();
      this._position = new Vector2();
      this._rotation = 0;        // degrees
      this._scale = new Vector2(1, 1);
      this.z_index = 0;
      this.visible = true;
      this.y_sort_enabled = false;   // sort children by world Y (top-down depth)
      this._dirty = true;
      this._world = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
    }

    static def = {
      name: 'Node2D',
      icon: '✳️',
      kind: 'Logic',
      base: 'Node',
      desc: 'A node with a 2D transform. Base for everything positioned in the world.',
      props: [
        { path: 'position', type: 'vector2', doc: 'Position relative to the parent (pixels).' },
        { path: 'rotation', type: 'number', doc: 'Rotation in degrees.' },
        { path: 'scale', type: 'vector2', doc: 'Scale (1,1 = normal).' },
        { path: 'z_index', type: 'number', doc: 'Draw order. Higher draws on top.' },
        { path: 'y_sort_enabled', type: 'bool', doc: 'Paint children front-to-back by their Y (top-down games).' },
        { path: 'visible', type: 'bool', doc: 'Hide or show this branch.' },
      ],
      methods: [
        { sig: 'move_toward(target, max_dist)', desc: 'Move toward a point, at most max_dist pixels.' },
        { sig: 'get_angle_to(point)', desc: 'Angle (degrees) from this node to a world point.' },
        { sig: 'to_local(world_point) / to_global(local_point)', desc: 'Convert coordinates between local and world space.' },
        { sig: 'look_at(point)', desc: 'Rotate to face a world point.' },
      ],
    };

    get position() { return this._position; }
    set position(v) { this._position = Vector2.from(v); this._dirty = true; }
    get x() { return this._position.x; }
    set x(v) { this._position.x = v; this._dirty = true; }
    get y() { return this._position.y; }
    set y(v) { this._position.y = v; this._dirty = true; }

    get rotation() { return this._rotation; }
    set rotation(d) { this._rotation = d; this._dirty = true; }
    get rotation_radians() { return this._rotation * Math.PI / 180; }
    set rotation_radians(r) { this._rotation = r * 180 / Math.PI; this._dirty = true; }

    get scale() { return this._scale; }
    set scale(v) { this._scale = Vector2.from(v); if (this._scale.x === 0) this._scale.x = 0.0001; if (this._scale.y === 0) this._scale.y = 0.0001; this._dirty = true; }

    /* world-space transform (computed from ancestors) */
    get global_position() {
      this._update_world();
      return new Vector2(this._world.x, this._world.y);
    }
    set global_position(p) {
      const parent = this._parent_world();
      this.position = Vector2.from(p).sub(parent);
    }
    get global_rotation() {
      this._update_world();
      return this._world.rot;
    }
    set global_rotation(d) {
      const pd = this._parent_world().rot;
      this.rotation = d - pd;
    }

    _parent_world() {
      if (this.parent && this.parent._update_world) {
        this.parent._update_world();
        return this.parent._world;
      }
      return { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
    }

    _update_world() {
      if (!this._dirty && this._pw_checked === (this.parent || null)) return;
      const p = this._parent_world();
      const rad = p.rot * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const x = this._position.x * p.sx, y = this._position.y * p.sy;
      this._world.x = p.x + x * c - y * s;
      this._world.y = p.y + x * s + y * c;
      this._world.rot = p.rot + this._rotation;
      this._world.sx = p.sx * this._scale.x;
      this._world.sy = p.sy * this._scale.y;
      this._dirty = false;
      this._pw_checked = this.parent || null;
      for (const ch of this.children) if (ch._dirty !== undefined) ch._dirty = true;
    }

    to_global(local) {
      this._update_world();
      const v = Vector2.from(local);
      const rad = this._world.rot * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      return new Vector2(
        this._world.x + v.x * c * this._world.sx - v.y * s * this._world.sy,
        this._world.y + v.x * s * this._world.sx + v.y * c * this._world.sy
      );
    }
    to_local(world) {
      this._update_world();
      const v = Vector2.from(world).sub(new Vector2(this._world.x, this._world.y));
      const rad = -this._world.rot * Math.PI / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      return new Vector2(
        (v.x * c - v.y * s) / (this._world.sx || 1),
        (v.x * s + v.y * c) / (this._world.sy || 1)
      );
    }
    look_at(point) {
      const gp = this.global_position;
      this.rotation = Math.atan2(point.y - gp.y, point.x - gp.x) * 180 / Math.PI;
    }
    get_angle_to(point) {
      const gp = this.global_position;
      return Math.atan2(point.y - gp.y, point.x - gp.x) * 180 / Math.PI;
    }
    move_toward(target, max_dist) {
      const t = Vector2.from(target);
      const d = t.sub(this.position);
      const l = d.length;
      if (l <= max_dist || l === 0) this.position = t;
      else this.position = this.position.add(d.mul(max_dist / l));
    }
    translate(offset) { this.position = this.position.add(Vector2.from(offset)); }
  }

  GE.Node2D = Node2D;
  GE.Classes.register(Node2D);
})(globalThis.GE);
