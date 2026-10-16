/* ==========================================================================
   Goodness Engine — nodes/animation_player.js
   AnimationPlayer + Animation: keyframe animation without a single extra
   library. Property tracks (numbers, vectors, colors, booleans), method
   tracks, loop modes, speed scale, queues — the Godot experience, in ~350
   friendly lines.

       anim.play('bounce')            # name only
       anim.play('bounce', {speed: 2, from_end: true})
       anim.queue('idle')             # plays right after

   Animations can be authored in the editor (Inspector → AnimationPlayer)
   or built at runtime:

       anim.make('bounce', {
         length: 1.0,
         loop: 'pingpong',
         tracks: [
           { node: '.',      property: 'position.y', keys: [[0, 0], [0.4, -60, 'back_out'], [1, 0]] },
           { node: 'Sprite', property: 'modulate',   keys: [[0, '#ffffff'], [0.5, '#ff5a5f'], [1, '#ffffff']] },
           { node: '.',      method: 'squash',       at: 0.4, args: [2] },
         ],
       });
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node, Node2D, Vector2, Color, Logger } = GE;

  const EASE_ALIASES = {
    ease_in: 'quad_in', ease_out: 'quad_out', ease_in_out: 'cubic_in_out',
    smooth: 'sine_in_out', smoothstep: 'sine_in_out', in: 'quad_in', out: 'quad_out',
    in_out: 'cubic_in_out', spring: 'elastic_out', out_back: 'back_out',
    in_back: 'back_in', out_bounce: 'bounce_out', ease: 'sine_in_out',
    ease_out_elastic: 'elastic_out',
  };

  function ease_name(name) {
    if (!name) return 'linear';
    const key = EASE_ALIASES[name] || String(name);
    return GE.Ease && GE.Ease[key] ? key : 'linear';
  }

  function is_color_like(v) {
    if (v instanceof Color) return true;
    if (typeof v === 'string') return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
    if (Array.isArray(v)) return false;
    if (v && typeof v === 'object' && v.r !== undefined) return true;
    return false;
  }

  function to_vec(v) {
    if (v instanceof Vector2) return v;
    if (Array.isArray(v)) return new Vector2(Number(v[0]) || 0, Number(v[1]) || 0);
    if (v && typeof v === 'object' && v.x !== undefined) return new Vector2(v.x, v.y);
    if (typeof v === 'number') return new Vector2(v, v);
    return new Vector2();
  }

  function blend_value(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (a instanceof Vector2 || b instanceof Vector2) return to_vec(a).lerp(to_vec(b), t);
    if (a instanceof Color || b instanceof Color) return Color.from(a).lerp(Color.from(b), t);
    if (typeof a === 'boolean' || typeof b === 'boolean') return t >= 1 ? b : a;
    if (typeof a === 'string' && typeof b === 'string' && is_color_like(a) && is_color_like(b)) {
      return Color.from(a).lerp(Color.from(b), t);
    }
    if (Array.isArray(a) && Array.isArray(b)) return to_vec(a).lerp(to_vec(b), t);
    return t >= 1 ? b : a;
  }

  /* ------------------------------------------------------------------ */
  /* Animation — one list of tracks with a length and a loop mode.       */
  /* ------------------------------------------------------------------ */
  class Animation {
    constructor(name = 'animation') {
      this.name = name;
      this.length = 1.0;
      this.loop_mode = 'none';       // 'none' | 'linear' | 'pingpong'
      this.tracks = [];
    }

    /** add_track({node, property, keys:[[t, value, ease], ...], interp, ease}) */
    add_track(def = {}) {
      const track = {
        node: def.node || '.',
        property: def.property,
        interp: def.interp || 'linear',            // 'linear' | 'nearest' | 'cubic'
        ease: def.ease || null,
        keys: (def.keys || []).map((k) => (Array.isArray(k)
          ? { t: Number(k[0]) || 0, value: k[1], ease: k[2] || null }
          : { t: Number(k.at ?? k.t) || 0, value: k.value, ease: k.ease || null })),
      };
      track.keys.sort((a, b) => a.t - b.t);
      if (!track.property) { Logger.warn('Animation.add_track needs a `property`.'); return null; }
      this.tracks.push(track);
      this._sync_length();
      return track;
    }

    /** add_method_track({node, method, at|keys, args}) — call a method at a time. */
    add_method_track(def = {}) {
      const keys = def.keys
        ? def.keys.map((k) => (Array.isArray(k) ? { t: Number(k[0]) || 0, args: k[1] } : { t: Number(k.at) || 0, args: k.args }))
        : [{ t: Number(def.at ?? def.time) || 0, args: def.args }];
      keys.sort((a, b) => a.t - b.t);
      const track = { node: def.node || '.', method: def.method, args: def.args || [], keys, method_track: true };
      this.tracks.push(track);
      this._sync_length();
      return track;
    }

    _sync_length() {
      let max = 0;
      for (const t of this.tracks) {
        for (const k of t.keys) max = Math.max(max, k.t);
      }
      if (max > 0 && (this._auto_length !== false)) this.length = Math.max(this.length, max);
    }

    get track_count() { return this.tracks.length; }

    /** Sample one track at `time` (clamped) and return the value. */
    sample_track(track, time) {
      const keys = track.keys;
      if (!keys.length) return undefined;
      if (keys.length === 1 || time <= keys[0].t) return keys[0].value;
      const last = keys[keys.length - 1];
      if (time >= last.t) return last.value;
      let i = 0;
      while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
      const a = keys[i], b = keys[i + 1];
      /* 'nearest' is a hold/step track in Godot: keep the previous key's value
         until the next key is reached. */
      if (track.interp === 'nearest') return a.value;
      const span = b.t - a.t || 1e-6;
      let t = GE.math.clamp((time - a.t) / span, 0, 1);
      const ease = ease_name(a.ease || track.ease || 'linear');
      t = GE.Ease[ease](t);
      return blend_value(a.value, b.value, t);
    }

    to_dict() {
      return {
        length: this.length,
        loop: this.loop_mode,
        tracks: this.tracks.map((t) => (t.method_track
          ? { node: t.node, method: t.method, at: t.keys[0] && t.keys[0].t, args: t.args }
          : { node: t.node, property: t.property, interp: t.interp, ease: t.ease, keys: t.keys.map((k) => (k.ease ? [k.t, k.value, k.ease] : [k.t, k.value])) })),
      };
    }

    /** Animation.from({length, loop, tracks}) — the shape used in project JSON. */
    static from(def = {}, name = def.name || 'animation') {
      const anim = new Animation(name);
      anim.loop_mode = def.loop || def.loop_mode || 'none';
      anim.length = Number(def.length) || 1;
      anim._auto_length = false;
      for (const t of def.tracks || []) {
        if (t.method) {
          if (Array.isArray(t.at)) {
            for (const at of t.at) anim.add_method_track({ node: t.node, method: t.method, at, args: t.args });
          } else anim.add_method_track(t);
        } else anim.add_track(t);
      }
      anim._auto_length = true;
      return anim;
    }
  }

  /* ------------------------------------------------------------------ */
  /* AnimationPlayer                                                     */
  /* ------------------------------------------------------------------ */
  class AnimationPlayer extends Node {
    constructor() {
      super();
      this.speed_scale = 1;
      this.playback_default_blend_time = 0;
      this.animations = {};        // name -> Animation
      this.autoplay = '';          // name played in _ready()
      this._current = null;
      this._time = 0;
      this._playing = false;
      this._paused = false;
      this._queue = null;
      this._direction = 1;         // for pingpong
      for (const s of ['animation_started', 'animation_finished', 'animation_changed',
        'animation_looped', 'track_keyframe_reached']) this.add_signal(s);
    }

    static def = {
      name: 'AnimationPlayer', icon: '🎞️', kind: 'Animation', base: 'Node',
      desc: 'Plays keyframe animations: position, scale, color, method calls.',
      props: [
        { path: 'autoplay', type: 'string', doc: 'Animation played automatically on _ready().' },
        { path: 'speed_scale', type: 'number', step: 0.1, doc: 'Playback speed multiplier.' },
        {
          path: 'animations', type: 'json', doc: 'Animation dictionary (see docs 11-animation.md).',
          sample: {
            bounce: {
              length: 0.6, loop: 'pingpong',
              tracks: [{ node: '.', property: 'position.y', keys: [[0, 0, 'quad_in'], [0.5, -40, 'quad_out']] }],
            },
          },
        },
      ],
      methods: [
        { sig: "play(name, {speed, from_end})", desc: 'Start (or restart) an animation.' },
        { sig: 'stop()', desc: 'Stop and reset to time 0.' },
        { sig: 'pause()/resume()', desc: 'Freeze or continue playback.' },
        { sig: 'queue(name)', desc: 'Play another animation right after this one.' },
        { sig: 'seek(time)', desc: 'Jump to a time in seconds and apply it.' },
        { sig: 'is_playing()', desc: 'True while an animation runs.' },
      ],
      signals: [
        { name: 'animation_started', args: ['name'], desc: 'An animation began.' },
        { name: 'animation_finished', args: ['name'], desc: 'A non-looping animation ended.' },
        { name: 'animation_changed', args: ['old', 'new'], desc: 'The player switched animations.' },
      ],
    };

    /* ---------------- authoring ---------------- */
    set animations(v) {
      this._animations = {};
      if (v && typeof v === 'object') {
        for (const [name, def] of Object.entries(v)) this._animations[name] = def instanceof Animation ? def : Animation.from(def, name);
      }
    }
    get animations() { return this._animations || (this._animations = {}); }

    add_animation(name, def = {}) {
      const anim = def instanceof Animation ? def : Animation.from(def, name);
      anim.name = name;
      this.animations[name] = anim;
      return anim;
    }

    get_animation(name) { return this.animations[name] || null; }
    has_animation(name) { return !!this.animations[name]; }
    get animation_names() { return Object.keys(this.animations); }
    get animation_list() { return this.animation_names; }

    animation_length(name) {
      const a = this.animations[name];
      return a ? a.length : 0;
    }

    /** make(name, def) — build an animation and play it straight away. */
    make(name, def = {}) {
      const anim = this.add_animation(name, def);
      this.play(name);
      return anim;
    }

    /** Backwards-compatible helper used by older examples: `anim.play_once()`. */
    play_once(name, speed = 1) { return this.play(name, { speed }); }

    /* ---------------- playback ---------------- */
    get current_animation() { return this._current; }
    get current_animation_length() { return this._current ? this.animation_length(this._current) : 0; }
    get current_animation_position() { return this._time; }
    get playing() { return this._playing; }
    set playing(v) { if (v) this.play(this._current || this.animation_names[0]); else this.stop(); }
    get speed() { return this.speed_scale; }
    set speed(v) { this.speed_scale = Number(v) || 1; }
    get next_animation() { return this._queue; }

    is_playing() { return this._playing && !this._paused; }

    play(name, opts = {}) {
      if (typeof opts === 'number') opts = { speed: opts };
      if (name && typeof name === 'object') {                 // play({animation: 'x'})
        opts = name;
        name = opts.name || opts.animation;
      }
      if (!name) name = this.animation_names[0];
      if (!name) { Logger.warn('AnimationPlayer.play: no animation to play.'); return false; }
      if (!this.animations[name]) {
        Logger.warn(`AnimationPlayer.play: "${name}" is not defined (have: ${this.animation_names.join(', ') || 'none'}).`);
        return false;
      }
      const old = this._current;
      this._current = name;
      this._time = opts.from_end ? this.animation_length(name) : (opts.from || 0);
      this._speed = opts.speed === undefined ? 1 : opts.speed;
      this.speed_scale = this._speed === undefined ? 1 : this.speed_scale;
      this._direction = opts.speed < 0 ? -1 : 1;
      this._playing = true;
      this._paused = false;
      this._finished = false;
      if (old !== name) this.emit_signal('animation_changed', old, name);
      this.emit_signal('animation_started', name);
      this._apply(0);
      return true;
    }

    stop(reset = true) {
      if (this._playing && this._current) this.emit_signal('animation_finished', this._current);
      this._playing = false;
      this._paused = false;
      if (reset) {
        this._time = 0;
        this._direction = 1;
      }
      return this;
    }

    pause() { if (this._playing) this._paused = true; return this; }
    resume() { if (this._playing) this._paused = false; return this; }
    toggle_pause() { if (this._paused) this.resume(); else this.pause(); return this; }

    /** queue(name) — play next when the current animation finishes. */
    queue(name) { this._queue = name; return this; }

    /** seek(time) — jump and immediately apply the sampled pose. */
    seek(time) {
      this._time = Number(time) || 0;
      this._apply(this._time);
      return this;
    }

    /** advance(delta) — exposed for tests and custom loops. */
    advance(delta) { this._process(delta); return this; }

    /* ---------------- internals ---------------- */
    _ready() {
      if (this.autoplay) this.play(this.autoplay);
    }

    _resolve(path) {
      if (path === undefined || path === null || path === '' || path === '.') return this.parent || this;
      let node = null;
      try { node = this.get_node(path); } catch (e) { node = null; }
      if (!node && this.parent) {
        try { node = this.parent.get_node(path); } catch (e) { node = null; }
        if (!node && this.parent.parent) { try { node = this.parent.parent.get_node(path); } catch (e) { node = null; } }
      }
      if (!node) { try { node = this.tree && this.tree.get_node(path); } catch (e) { node = null; } }
      if (!node && !this._warned_missing) {
        this._warned_missing = this._warned_missing || {};
        if (!this._warned_missing[path]) {
          this._warned_missing[path] = true;
          Logger.warn(`AnimationPlayer: track target "${path}" not found (relative to ${this.path}).`);
        }
      }
      return node;
    }

    _write_property(node, property, value) {
      if (!node || !property) return;
      const parts = String(property).split('.');
      let target = node;
      for (let i = 0; i < parts.length - 1; i++) {
        target = target ? target[parts[i]] : null;
        if (!target) return;
      }
      const key = parts[parts.length - 1];
      const current = target[key];
      let out = value;
      if (current instanceof Vector2) out = to_vec(value);
      else if (current instanceof Color) out = Color.from(value);
      else if (typeof current === 'number' && typeof value !== 'number') out = Number(value) || 0;
      else if (typeof current === 'boolean') out = !!value;
      try { target[key] = out; } catch (e) { /* read-only property — skip */ }
    }

    _apply(time) {
      const anim = this.animations[this._current];
      if (!anim) return;
      for (const track of anim.tracks) {
        const node = this._resolve(track.node);
        if (!node) continue;
        if (track.method_track) continue;
        const v = anim.sample_track(track, time);
        this._write_property(node, track.property, v);
      }
    }

    _fire_methods(anim, from, to) {
      for (const track of anim.tracks) {
        if (!track.method_track) continue;
        const node = this._resolve(track.node);
        if (!node) continue;
        for (const k of track.keys) {
          const hit = from === to ? Math.abs(k.t - to) < 1e-6 : (k.t > from && k.t <= to);
          if (!hit) continue;
          if (typeof node[track.method] !== 'function') {
            Logger.warn(`AnimationPlayer: ${node} has no method "${track.method}()" to call.`);
            continue;
          }
          try { node[track.method].apply(node, k.args || track.args || []); }
          catch (e) { Logger.error(`Animation method track ${track.method}() failed: ${e.message}`); }
          this.emit_signal('track_keyframe_reached', track.node, track.method, k.t);
        }
      }
    }

    _process(delta) {
      if (!this._playing || this._paused) return;
      const anim = this.animations[this._current];
      if (!anim) { this._playing = false; return; }
      const prev = this._time;
      const dir = this._direction === -1 ? -1 : 1;
      let next = prev + delta * this.speed_scale * dir * Math.max(0, this._speed === undefined ? 1 : 1);
      const len = anim.length;

      if (len <= 0) { this._time = 0; return; }

      if (anim.loop_mode === 'linear' || anim.loop_mode === 'loop') {
        if (next >= len) {
          const overshoot = next - len;
          this.emit_signal('animation_looped', this._current);
          this._time = 0;
          this._apply(0);
          if (overshoot > 0) {
            this._fire_methods(anim, len, len);
            this._time = Math.min(overshoot, len);
            this._apply(this._time);
            this._fire_methods(anim, 0, this._time);
          }
          return;
        }
        if (next < 0 && dir < 0) next = len;
      } else if (anim.loop_mode === 'pingpong') {
        if (next >= len) { next = len - (next - len); this._direction = -1; if (next < 0) next = 0; }
        else if (next <= 0) { next = -next; this._direction = 1; if (next > len) next = len; }
      } else if (next >= len) {                       // 'none'
        next = len;
        this._time = next;
        this._apply(next);
        this._fire_methods(anim, prev, next);
        this._playing = false;
        this.emit_signal('animation_finished', this._current);
        const q = this._queue;
        this._queue = null;
        if (q) this.play(q);
        return;
      }

      this._time = next;
      this._apply(next);
      this._fire_methods(anim, prev, next);
    }
  }

  GE.Animation = Animation;
  GE.Classes.register(AnimationPlayer);
  GE.AnimationPlayer = AnimationPlayer;
})(typeof globalThis.GE !== 'undefined' ? globalThis.GE : (globalThis.GE = {}));
