/* ==========================================================================
   Goodness Engine — physics/bodies.js
   Physics nodes: StaticBody2D, RigidBody2D, CharacterBody2D, Area2D.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2 } = GE;
  const default_shape = () => ({ type: 'rect', width: 32, height: 32, offset: new Vector2() });

  /* ==================================================================== */
  class PhysicsBody2D extends Node2D {
    constructor() {
      super();
      this.shape = default_shape();
      this.enabled = true;
      this._contacts = null;
      this._overlaps = null;
      this.add_signal('body_entered');
      this.add_signal('body_exited');
    }
    static def = {
      name: 'PhysicsBody2D', icon: '🧱', kind: 'Physics', base: 'Node2D',
      desc: 'Base class for physics bodies (use Static/Rigid/Character/Area).',
      props: [
        { path: 'shape.type', type: 'enum', options: ['rect', 'circle'], doc: 'Collision shape.' },
        { path: 'shape.width', type: 'number', min: 2, step: 1, doc: 'Rect width (rect shape).' },
        { path: 'shape.height', type: 'number', min: 2, step: 1, doc: 'Rect height (rect shape).' },
        { path: 'shape.radius', type: 'number', min: 2, step: 1, doc: 'Radius (circle shape).' },
        { path: 'enabled', type: 'bool', doc: 'Participate in physics.' },
      ],
      hidden: true,
    };
    get_shape_size() {
      return this.shape.type === 'circle'
        ? new Vector2(this.shape.radius * 2, this.shape.radius * 2)
        : new Vector2(this.shape.width, this.shape.height);
    }
  }

  /* ==================================================================== */
  class StaticBody2D extends PhysicsBody2D {
    constructor() {
      super();
      this.one_way_collision = false;
    }
    static def = {
      name: 'StaticBody2D', icon: '🧱', kind: 'Physics', base: 'PhysicsBody2D',
      desc: 'Immovable collider. Floors, walls, platforms (set one_way for jump-through).',
      props: [
        { path: 'one_way_collision', type: 'bool', doc: 'Only collide from the top (platforms).' },
      ],
    };
  }

  /* ==================================================================== */
  class RigidBody2D extends PhysicsBody2D {
    constructor() {
      super();
      this.velocity = new Vector2();
      this.mass = 1;
      this.gravity_scale = 1;
      this.bounce = 0.4;
      this.linear_damp = 0;
      this._integrate = null; /* scripts may override for custom motion */
    }
    static def = {
      name: 'RigidBody2D', icon: '🎳', kind: 'Physics', base: 'PhysicsBody2D',
      desc: 'Bodies pushed by gravity and collisions. Great for balls, crates, debris.',
      props: [
        { path: 'mass', type: 'number', min: 0.01, step: 0.1, doc: 'Heavier bodies push lighter ones.' },
        { path: 'gravity_scale', type: 'number', step: 0.1, doc: '0 = floating, 2 = double gravity.' },
        { path: 'bounce', type: 'number', min: 0, max: 1, step: 0.05, doc: '0..1 bounciness.' },
        { path: 'linear_damp', type: 'number', min: 0, step: 0.05, doc: 'Air resistance.' },
      ],
      methods: [
        { sig: 'apply_impulse(vec)', desc: 'Kick the body with an impulse (px/s).' },
      ],
    };
    apply_impulse(v) { this.velocity = this.velocity.add(Vector2.from(v).div(this.mass)); }
    get linear_velocity() { return this.velocity; }
    set linear_velocity(v) { this.velocity = Vector2.from(v); }
  }

  /* ==================================================================== */
  class CharacterBody2D extends PhysicsBody2D {
    constructor() {
      super();
      this.velocity = new Vector2();
      this.on_floor = false;
      this.on_ceiling = false;
      this.on_wall = false;
      this.floor_snap_length = 4;
      this._coyote_timer = 0;
      this.coyote_time = 0.12;
    }
    static def = {
      name: 'CharacterBody2D', icon: '🏃', kind: 'Physics', base: 'PhysicsBody2D',
      desc: 'Player-style body. Call move_and_slide() every physics frame and it never sticks in walls.',
      props: [
        { path: 'coyote_time', type: 'number', min: 0, max: 1, step: 0.01, doc: 'Seconds of jump grace after leaving a ledge.' },
      ],
      methods: [
        { sig: 'move_and_slide(velocity)', desc: 'Move with collision sliding. Updates on_floor / on_wall / on_ceiling.' },
        { sig: 'is_on_floor()', desc: 'True while standing on ground (or within coyote_time).' },
      ],
    };
    move_and_slide(velocity = this.velocity) {
      if (!this.tree) return { on_floor: false };
      const v = Vector2.from(velocity);
      const res = this.tree.physics.move_character(this, v, 1 / 60, { floor_snap: this.floor_snap_length > 0 });
      this.on_floor = res.on_floor;
      this.on_ceiling = res.on_ceiling;
      this.on_wall = res.on_wall;
      /* Godot 4 semantics: sliding kills the velocity component into the surface */
      if (res.on_floor && this.velocity.y > 0) this.velocity.y = 0;
      if (res.on_ceiling && this.velocity.y < 0) this.velocity.y = 0;
      if (res.on_wall) this.velocity.x = 0;
      if (res.on_floor) this._coyote_timer = this.coyote_time;
      return res;
    }
    is_on_floor() { return this.on_floor || this._coyote_timer > 0; }
    is_on_wall() { return this.on_wall; }
    is_on_ceiling() { return this.on_ceiling; }

    _physics_process_default() {}
    get linear_velocity() { return this.velocity; }
    set linear_velocity(v) { this.velocity = Vector2.from(v); }
  }

  /* ==================================================================== */
  class Area2D extends PhysicsBody2D {
    constructor() {
      super();
      this.monitoring = true;
      this.detect_statics = false;
      this.add_signal('area_entered');
      this.add_signal('area_exited');
    }
    static def = {
      name: 'Area2D', icon: '📡', kind: 'Physics', base: 'PhysicsBody2D',
      desc: 'Overlap detector: coins, triggers, hazards. Emits body_entered / area_entered.',
      props: [
        { path: 'monitoring', type: 'bool', doc: 'Detect overlaps.' },
        { path: 'detect_statics', type: 'bool', doc: 'Also detect static bodies (triggers).' },
      ],
      methods: [
        { sig: 'get_overlapping_bodies()', desc: 'Bodies currently inside this area.' },
      ],
    };
    get_overlapping_bodies() { return this._overlaps ? [...this._overlaps] : []; }
    get_overlapping_areas() {
      return this.get_overlapping_bodies().filter((b) => b instanceof GE.Area2D);
    }
  }

  /* register all */
  for (const cls of [PhysicsBody2D, StaticBody2D, RigidBody2D, CharacterBody2D, Area2D]) {
    GE.Classes.register(cls);
  }
  GE.PhysicsBody2D = PhysicsBody2D;
  GE.StaticBody2D = StaticBody2D;
  GE.RigidBody2D = RigidBody2D;
  GE.CharacterBody2D = CharacterBody2D;
  GE.Area2D = Area2D;
})(globalThis.GE);
