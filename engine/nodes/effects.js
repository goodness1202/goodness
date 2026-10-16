/* ==========================================================================
   Goodness Engine — nodes/effects.js
   Particles2D: a friendly, powerful little particle emitter.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2, Color, Assets } = GE;

  class Particles2D extends Node2D {
    constructor() {
      super();
      this.emitting = true;
      this.amount = 40;              // particles alive at once
      this.lifetime = 1.2;           // seconds per particle
      this.direction = -90;          // degrees (up)
      this.spread = 45;              // degrees of cone
      this.speed_min = 60;
      this.speed_max = 220;
      this.gravity = new Vector2(0, 320);
      this.scale_min = 0.5;
      this.scale_max = 1.4;
      this.colors = ['#ffd257', '#ff9f43', '#ff5a5f'];
      this.fade_out = true;
      this.explosiveness = 0;        // 0 = stream, 1 = burst
      this.texture = null;           // optional texture (else circles)
      this._src = null;
      this._pool = [];
      this._emit_acc = 0;
      this._burst_fired = false;
      this.one_shot = false;
      this.add_signal('finished');
    }

    static def = {
      name: 'Particles2D', icon: '✨', kind: 'Effects', base: 'Node2D',
      desc: 'Fire, sparks, dust, explosions, confetti — without any art files.',
      props: [
        { path: 'emitting', type: 'bool', doc: 'Spawn particles.' },
        { path: 'amount', type: 'number', min: 1, max: 2000, step: 1, doc: 'Particles alive at once.' },
        { path: 'lifetime', type: 'number', min: 0.05, step: 0.1, doc: 'Seconds each particle lives.' },
        { path: 'direction', type: 'number', step: 5, doc: 'Emission angle in degrees.' },
        { path: 'spread', type: 'number', min: 0, max: 360, step: 5, doc: 'Cone width around direction.' },
        { path: 'speed_min', type: 'number', min: 0, step: 10, doc: 'Min launch speed.' },
        { path: 'speed_max', type: 'number', min: 0, step: 10, doc: 'Max launch speed.' },
        { path: 'gravity', type: 'vector2', doc: 'Per-particle gravity.' },
        { path: 'scale_min', type: 'number', min: 0.1, step: 0.1, doc: 'Min size.' },
        { path: 'scale_max', type: 'number', min: 0.1, step: 0.1, doc: 'Max size.' },
        { path: 'colors', type: 'json', doc: 'Color ramp, e.g. ["#ffd257", "#ff5a5f"].' },
        { path: 'explosiveness', type: 'number', min: 0, max: 1, step: 0.1, doc: '0 = stream, 1 = burst.' },
        { path: 'texture', type: 'texture', doc: 'Optional particle texture.' },
      ],
      methods: [
        { sig: 'burst(count)', desc: 'Spawn a one-off burst immediately.' },
      ],
    };

    set texture(v) {
      this._texture = v;
      if (typeof v === 'string' && v) {
        this._src = v;
        Assets.load_texture(v, this.tree && this.tree.project).then((t) => { this._texture = t; });
      } else if (v === null || v === undefined) {
        this._src = null; this._texture = null;
      }
    }
    get texture() { return this._texture; }

    _needs_texture_load(project) {
      if (!this._src) return Promise.resolve();
      return Assets.load_texture(this._src, project).then((t) => { if (t) this._texture = t; });
    }

    _colors_parsed() {
      const raw = Array.isArray(this.colors) ? this.colors : ['#ffffff'];
      return raw.map((c) => (c instanceof Color ? c : Color.from(c)));
    }

    burst(count = this.amount) {
      for (let i = 0; i < count; i++) this._spawn();
    }

    _spawn() {
      if (this._pool.length >= 4000) return;
      const ang = (this.direction + GE.randf_range(-this.spread / 2, this.spread / 2)) * Math.PI / 180;
      const speed = GE.randf_range(this.speed_min, this.speed_max);
      const colors = this._colors_parsed();
      this._pool.push({
        x: 0, y: 0,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        age: 0,
        life: this.lifetime * GE.randf_range(0.7, 1.3),
        size: GE.randf_range(this.scale_min, this.scale_max) * 10,
        color: colors[Math.floor(GE.randf() * colors.length)],
      });
    }

    _ready() {
      if (this.explosiveness >= 1 && this.emitting) {
        this.burst();
        this._burst_fired = true;
        if (this.one_shot) this.emitting = false;
      }
    }

    _process(delta) {
      const target_alive = this.emitting ? this.amount : 0;
      if (this.explosiveness > 0 && this.explosiveness < 1) {
        /* partial explosiveness: chunked emission */
        this._emit_acc += delta * (target_alive / this.lifetime) * (1 + this.explosiveness * 8);
        while (this._emit_acc >= 1 && this._alive_count() < target_alive + this.explosiveness * 20) {
          this._spawn(); this._emit_acc -= 1;
        }
      } else if (this.explosiveness === 0) {
        this._emit_acc += delta * (target_alive / this.lifetime);
        while (this._emit_acc >= 1) { this._spawn(); this._emit_acc -= 1; }
      }
      /* integrate */
      const g = this.gravity;
      for (const p of this._pool) {
        p.age += delta;
        p.vx += g.x * delta;
        p.vy += g.y * delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
      }
      this._pool = this._pool.filter((p) => p.age < p.life);
    }

    _alive_count() { return this._pool.length; }

    _draw_this() { return this._pool.length > 0; }
    _draw(ctx) {
      const tex = this._texture;
      for (const p of this._pool) {
        const t = p.age / p.life;
        const a = this.fade_out ? 1 - t : 1;
        const s = p.size * (1 - t * 0.4);
        ctx.globalAlpha = GE.math.clamp(a, 0, 1);
        if (tex && tex.image) {
          ctx.drawImage(tex.image, p.x - s, p.y - s, s * 2, s * 2);
        } else {
          ctx.fillStyle = p.color.to_css();
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  GE.Classes.register(Particles2D);
  GE.Particles2D = Particles2D;
})(globalThis.GE);
