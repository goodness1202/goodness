/* ==========================================================================
   Goodness Engine — core/tween.js
   Godot-style chained tweens:
     const t = node.create_tween();
     t.tween_property(node, 'position', new Vector2(400, 0), 0.5)
      .set_trans('quad_out')
      .then(() => SFX.blip());
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Ease } = GE;

  /* ------------------------------------------------------------------ */
  class TweenStep {
    constructor(tween, kind, payload, duration) {
      this.tween = tween;
      this.kind = kind;             // 'property' | 'method' | 'interval' | 'callback'
      this.payload = payload;
      this.duration = Math.max(0, duration);
      this.elapsed = 0;
      this.done = false;
      this.trans = null;            // easing name, set via set_trans
    }
  }

  class Tween {
    constructor(tree, owner = null) {
      this.tree = tree;
      this.owner = owner;
      this.steps = [];
      this._current = null;
      this._parallel_next = false;
      this._loops = 1;
      this._loop_count = 0;
      this._dead = false;
      this._on_finished = null;
      this._speed = 1;
      this._started = false;
    }

    /* ---------------- building the chain ---------------- */
    tween_property(node, property, to, duration) {
      const step = new TweenStep(this, 'property', { node, property, from: null, to, captured: false }, duration);
      this.steps.push(step);
      this._current = step;
      return this;
    }
    tween_property_offset(node, property, offset, duration) {
      const step = new TweenStep(this, 'property', { node, property, from: null, to: null, offset: clone_value(offset), captured: false }, duration);
      this.steps.push(step);
      this._current = step;
      return this;
    }
    tween_method(callable, from, to, duration) {
      const step = new TweenStep(this, 'method', { callable, from, to }, duration);
      this.steps.push(step);
      this._current = step;
      return this;
    }
    interval(time) {
      const step = new TweenStep(this, 'interval', {}, time);
      this.steps.push(step);
      this._current = step;
      return this;
    }
    callback(fn) {
      const step = new TweenStep(this, 'callback', { fn }, 0);
      this.steps.push(step);
      this._current = step;
      return this;
    }
    then(fn) { return this.callback(fn); }

    /* modifiers apply to the last added step */
    set_trans(name) { if (this._current) this._current.trans = name; return this; }
    set_speed(s) { this._speed = s; return this; }
    parallel() { this._parallel_next = true; return this; }
    set_loops(n = 0) { this._loops = n; return this; }
    connect_finished(fn) { this._on_finished = fn; return this; }

    /* ---------------- runtime ---------------- */
    _step(delta) {
      if (this._dead) return;
      delta *= this._speed;
      /* find active steps: first not-done step(s) */
      let progressed = false;
      while (true) {
        const step = this.steps.find((s) => !s.done);
        if (!step) { this._finish_loop(); return; }
        if (!progressed && step.kind !== 'interval' && step._waiting_parallel) {
          /* parallel group: advance all steps flagged together */
        }
        this._advance(step, delta);
        progressed = true;
        if (!step.done) break;
      }
    }

    _advance(step, delta) {
      if (step.kind === 'callback') {
        try { step.payload.fn(); } catch (e) { GE.Logger.error(`Tween callback failed: ${e.message}`); }
        step.done = true;
        return;
      }
      /* capture the starting value when the step actually begins */
      if (step.kind === 'property' && !step.payload.captured) {
        const from = read_path(step.payload.node, step.payload.property);
        step.payload.from = clone_value(from);
        if (step.payload.offset !== undefined) step.payload.to = add_values(from, step.payload.offset);
        step.payload.captured = true;
      }
      if (step.duration === 0) {
        if (step.kind === 'property') this._apply_property(step, 1);
        if (step.kind === 'method') this._apply_method(step, 1);
        step.done = true;
        return;
      }
      step.elapsed += delta;
      const t = Math.min(1, step.elapsed / step.duration);
      const eased = step.trans && Ease[step.trans] ? Ease[step.trans](t) : t;
      if (step.kind === 'property') this._apply_property(step, eased);
      if (step.kind === 'method') this._apply_method(step, eased);
      if (t >= 1) step.done = true;
    }

    _apply_property(step, t) {
      const { node, property, from, to } = step.payload;
      const v = lerp_value(from, to, t);
      try { write_path(node, property, v); } catch (e) { /* node freed mid-tween */ this.kill(); }
    }
    _apply_method(step, t) {
      try { step.payload.callable(lerp_value(step.payload.from, step.payload.to, t)); } catch (e) { this.kill(); }
    }

    _finish_loop() {
      this._loop_count++;
      if (this._loops === 0 || this._loop_count < this._loops) {
        /* restart */
        for (const s of this.steps) { s.done = false; s.elapsed = 0; }
        /* re-capture 'from' values for absolute property tweens */
        for (const s of this.steps) {
          if (s.kind === 'property' && s.payload.delta_mode === 'absolute') {
            s.payload.from = clone_value(read_path(s.payload.node, s.payload.property));
          }
        }
        return;
      }
      this.kill(true);
    }

    kill(finished = false) {
      if (this._dead) return;
      this._dead = true;
      if (finished && this._on_finished) { try { this._on_finished(); } catch (e) {} }
      if (this.tree) this.tree.kill_tween(this);
    }
    get is_running() { return !this._dead; }
  }

  /* ------------------------------------------------------------------ */
  /* value plumbing                                                       */
  /* ------------------------------------------------------------------ */
  function read_path(obj, path) {
    const parts = String(path).split('.');
    let v = obj;
    for (const p of parts) { if (v === null || v === undefined) return 0; v = v[p]; }
    return clone_value(v);
  }
  function write_path(obj, path, value) {
    const parts = String(path).split('.');
    let v = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (v === null || v === undefined) return;
      v = v[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (v === null || v === undefined) return;
    v[last] = value;
  }
  function clone_value(v) {
    if (v instanceof GE.Vector2) return v.copy();
    if (v instanceof GE.Color) return v.copy();
    if (Array.isArray(v)) return v.slice();
    return v;
  }
  function add_values(a, b) {
    if (a instanceof GE.Vector2) return a.add(GE.Vector2.from(b));
    if (typeof a === 'number') return a + (typeof b === 'number' ? b : 0);
    if (a instanceof GE.Color) return a.lerp(GE.Color.from(b), 1);
    return b;
  }
  function lerp_value(a, b, t) {
    if (a instanceof GE.Vector2) return a.lerp(GE.Vector2.from(b), t);
    if (a instanceof GE.Color) return a.lerp(GE.Color.from(b), t);
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    return t >= 1 ? b : a;
  }

  /* Node helper: create_tween */
  const NodeProto = GE.Node.prototype;
  NodeProto.create_tween = function () {
    if (!this.tree) { GE.Logger.warn(`${this}: create_tween before entering tree.`); return null; }
    return this.tree.add_tween(new Tween(this.tree, this));
  };

  GE.Tween = Tween;
})(globalThis.GE);
