/* ==========================================================================
   Goodness Engine — core/math.js
   Math primitives: Vector2, Rect2, Color, easing, random numbers.
   Part of the Goodness Engine (https://github.com/goodness1202/goodness)
   ========================================================================== */
(function (GE) {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  /* ------------------------------------------------------------------ */
  /* Vector2                                                              */
  /* ------------------------------------------------------------------ */
  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }

    /* --- properties --- */
    get length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    get length_squared() { return this.x * this.x + this.y * this.y; }
    get angle() { return Math.atan2(this.y, this.x) * RAD; }      // degrees, Godot-style
    get normalized() {
      const l = this.length;
      return l === 0 ? new Vector2() : new Vector2(this.x / l, this.y / l);
    }
    get perpendicular() { return new Vector2(-this.y, this.x); }

    /* --- arithmetic (always return a new Vector2) --- */
    add(o) { return new Vector2(this.x + o.x, this.y + o.y); }
    sub(o) { return new Vector2(this.x - o.x, this.y - o.y); }
    mul(n) { return new Vector2(this.x * n, this.y * n); }
    div(n) { return n === 0 ? new Vector2() : new Vector2(this.x / n, this.y / n); }
    neg() { return new Vector2(-this.x, -this.y); }

    dot(o) { return this.x * o.x + this.y * o.y; }
    cross(o) { return this.x * o.y - this.y * o.x; }
    distance_to(o) { return this.sub(o).length; }
    distance_squared_to(o) { return this.sub(o).length_squared; }
    direction_to(o) { return o.sub(this).normalized; }
    angle_to(o) { return Math.acos(clamp(this.dot(o) / (this.length * o.length || 1), -1, 1)) * RAD; }
    angle_to_point(o) { return o.sub(this).angle; }

    lerp(o, t) { return new Vector2(lerp(this.x, o.x, t), lerp(this.y, o.y, t)); }
    slerp(o, t) { return this.lerp(o, t); } // good-enough slerp for games
    limit_length(max = 1) {
      const l = this.length;
      return l > max && l > 0 ? this.mul(max / l) : this.copy();
    }
    rotate(deg) {
      const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
      return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
    copy() { return new Vector2(this.x, this.y); }
    clone() { return this.copy(); }
    equals(o) { return this.x === o.x && this.y === o.y; }

    /* constants */
    static ZERO = new Vector2(0, 0);
    static ONE = new Vector2(1, 1);
    static UP = new Vector2(0, -1);
    static DOWN = new Vector2(0, 1);
    static LEFT = new Vector2(-1, 0);
    static RIGHT = new Vector2(1, 0);

    toString() { return `(${round2(this.x)}, ${round2(this.y)})`; }

    /* parse "[x, y]" arrays (used by scene JSON) or objects */
    static from(v) {
      if (v instanceof Vector2) return v;
      if (Array.isArray(v)) return new Vector2(Number(v[0]) || 0, Number(v[1]) || 0);
      if (v && typeof v === 'object') return new Vector2(Number(v.x) || 0, Number(v.y) || 0);
      return new Vector2(Number(v) || 0, 0);
    }
    toArray() { return [this.x, this.y]; }
  }
  // Aliases used in operations above (hoisted function helpers below)
  var lerp = (a, b, t) => a + (b - a) * t;
  var clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  var round2 = (v) => Math.round(v * 100) / 100;

  /* ------------------------------------------------------------------ */
  /* Rect2                                                                */
  /* ------------------------------------------------------------------ */
  class Rect2 {
    constructor(x = 0, y = 0, w = 0, h = 0) {
      if (x instanceof Vector2 && y instanceof Vector2) { // pos, size
        this.pos = x.copy(); this.size = y.copy();
      } else {
        this.pos = new Vector2(x, y); this.size = new Vector2(w, h);
      }
    }
    get x() { return this.pos.x; } get y() { return this.pos.y; }
    get w() { return this.size.x; } get h() { return this.size.y; }
    get end() { return this.pos.add(this.size); }
    get center() { return this.pos.add(this.size.mul(0.5)); }
    get area() { return this.size.x * this.size.y; }
    has(point) {
      return point.x >= this.pos.x && point.x <= this.pos.x + this.size.x &&
             point.y >= this.pos.y && point.y <= this.pos.y + this.size.y;
    }
    intersects(other) {
      return this.pos.x < other.pos.x + other.size.x && this.pos.x + this.size.x > other.pos.x &&
             this.pos.y < other.pos.y + other.size.y && this.pos.y + this.size.y > other.pos.y;
    }
    expand(point) {
      const r = new Rect2(this.pos.x, this.pos.y, this.size.x, this.size.y);
      const ex = Math.max(r.pos.x + r.size.x, point.x), ey = Math.max(r.pos.y + r.size.y, point.y);
      r.pos = new Vector2(Math.min(r.pos.x, point.x), Math.min(r.pos.y, point.y));
      r.size = new Vector2(ex - r.pos.x, ey - r.pos.y);
      return r;
    }
    grow(by) { return new Rect2(this.pos.x - by, this.pos.y - by, this.size.x + by * 2, this.size.y + by * 2); }
    copy() { return new Rect2(this.pos.x, this.pos.y, this.size.x, this.size.y); }
    clone() { return this.copy(); }
    toString() { return `Rect2(${round2(this.x)}, ${round2(this.y)}, ${round2(this.w)}, ${round2(this.h)})`; }
  }

  /* ------------------------------------------------------------------ */
  /* Color                                                                */
  /* ------------------------------------------------------------------ */
  class Color {
    constructor(r = 1, g = 1, b = 1, a = 1) { this.r = r; this.g = g; this.b = b; this.a = a; }
    lerp(o, t) {
      return new Color(lerp(this.r, o.r, t), lerp(this.g, o.g, t), lerp(this.b, o.b, t), lerp(this.a, o.a, t));
    }
    lighten(f) { return this.lerp(new Color(1, 1, 1, this.a), f); }
    darken(f) { return this.lerp(new Color(0, 0, 0, this.a), f); }
    with_alpha(a) { return new Color(this.r, this.g, this.b, a); }
    copy() { return new Color(this.r, this.g, this.b, this.a); }
    clone() { return this.copy(); }
    equals(o) { return !!o && this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a; }
    to_css() {
      const c = (v) => clamp(Math.round(v * 255), 0, 255);
      return `rgba(${c(this.r)}, ${c(this.g)}, ${c(this.b)}, ${round2(this.a)})`;
    }
    to_hex() {
      const c = (v) => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
      return `#${c(this.r)}${c(this.g)}${c(this.b)}`;
    }
    toString() { return this.to_css(); }

    static from(v) {
      if (v instanceof Color) return v;
      if (typeof v === 'string') return Color.from_string(v);
      if (Array.isArray(v)) return new Color(v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]);
      return new Color();
    }
    static from_string(str) {
      if (typeof str !== 'string') return new Color();
      str = str.trim();
      if (str[0] === '#') {
        let h = str.slice(1);
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (h.length === 6 || h.length === 8) {
          const r = parseInt(h.slice(0, 2), 16) / 255;
          const g = parseInt(h.slice(2, 4), 16) / 255;
          const b = parseInt(h.slice(4, 6), 16) / 255;
          const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
          return new Color(r, g, b, a);
        }
      }
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const p = m[1].split(',').map((s) => parseFloat(s.trim()));
        if (p.length >= 3) {
          return new Color(p[0] / 255, p[1] / 255, p[2] / 255, p[3] === undefined ? 1 : p[3]);
        }
      }
      return new Color();
    }
    toArray() { return [round4(this.r), round4(this.g), round4(this.b), round4(this.a)]; }
    static TRANSPARENT = new Color(0, 0, 0, 0);
  }
  var round4 = (v) => Math.round(v * 10000) / 10000;

  Color.WHITE = new Color(1, 1, 1);
  Color.BLACK = new Color(0, 0, 0);
  Color.RED = new Color(0.92, 0.26, 0.21);
  Color.GREEN = new Color(0.30, 0.69, 0.31);
  Color.BLUE = new Color(0.26, 0.52, 0.96);
  Color.YELLOW = new Color(0.98, 0.80, 0.18);
  Color.ORANGE = new Color(1.0, 0.60, 0.10);
  Color.PURPLE = new Color(0.61, 0.35, 0.96);
  Color.CYAN = new Color(0.20, 0.85, 0.90);
  Color.GRAY = new Color(0.5, 0.5, 0.5);

  /* ------------------------------------------------------------------ */
  /* Math helpers                                                         */
  /* ------------------------------------------------------------------ */
  const math = {
    lerp, clamp,
    lerp_angle(a, b, t) { // shortest-path angle lerp, degrees, result in [0, 360)
      let d = (b - a) % 360;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      let r = (a + d * t) % 360;
      if (r < 0) r += 360;
      return r;
    },
    deg2rad: (d) => d * DEG,
    rad2deg: (r) => r * RAD,
    remap(v, a1, a2, b1, b2) { return b1 + (v - a1) * (b2 - b1) / (a2 - a1 || 1); },
    smoothstep(from, to, x) {
      x = clamp((x - from) / (to - from || 1), 0, 1);
      return x * x * (3 - 2 * x);
    },
    sign: (v) => (v > 0 ? 1 : (v < 0 ? -1 : 0)),
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow, sin: Math.sin, cos: Math.cos,
    sin_deg: (d) => Math.sin(d * DEG), cos_deg: (d) => Math.cos(d * DEG),
    exp_decay(value, to, decay, delta) { return to + (value - to) * Math.exp(-decay * delta); },
    ease(t, kind = 'linear') { return Ease[kind] ? Ease[kind](t) : t; },
  };

  /* Easing functions (degrees of freedom for tweens) */
  const Ease = {
    linear: (t) => t,
    sine_in: (t) => 1 - Math.cos(t * Math.PI / 2),
    sine_out: (t) => Math.sin(t * Math.PI / 2),
    sine_in_out: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    quad_in: (t) => t * t,
    quad_out: (t) => 1 - (1 - t) * (1 - t),
    quad_in_out: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    cubic_in: (t) => t * t * t,
    cubic_out: (t) => 1 - Math.pow(1 - t, 3),
    cubic_in_out: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    quart_in: (t) => Math.pow(t, 4),
    quart_out: (t) => 1 - Math.pow(1 - t, 4),
    expo_in: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    expo_out: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    back_in: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
    back_out: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    elastic_out: (t) => t === 0 ? 0 : (t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    bounce_out: (t) => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Random                                                               */
  /* ------------------------------------------------------------------ */
  class RandomNumberGenerator {
    constructor(seed = 12345) { this.seed(seed); }
    seed(s) { this._s = (s >>> 0) || 12345; }
    randi() { // xorshift32
      let x = this._s;
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      this._s = x;
      return x;
    }
    randf() { return this.randi() / 4294967296; }
    randi_range(a, b) { return a + Math.floor(this.randf() * (b - a + 1)); }
    randf_range(a, b) { return a + this.randf() * (b - a); }
    choose(arr) { return arr[Math.floor(this.randf() * arr.length)]; }
  }

  const randi = () => Math.floor(Math.random() * 4294967296);
  const randf = () => Math.random();
  const randi_range = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const randf_range = (a, b) => a + Math.random() * (b - a);
  const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

  GE.Vector2 = Vector2;
  GE.Rect2 = Rect2;
  GE.Color = Color;
  GE.math = math;
  GE.Ease = Ease;
  GE.RandomNumberGenerator = RandomNumberGenerator;
  GE.randi = randi; GE.randf = randf;
  GE.randi_range = randi_range; GE.randf_range = randf_range;
  GE.choose = choose;
})(typeof globalThis.GE !== 'undefined' ? globalThis.GE : (globalThis.GE = {}));
