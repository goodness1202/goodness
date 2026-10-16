/* ==========================================================================
   Goodness Engine — nodes/lights.js
   Mood in two nodes:

       CanvasModulate     tints the whole world (night, sunset, dream)
       PointLight2D       a soft radial glow: torches, lamps, magic, muzzle flash

   No shadow maps, no shaders to write — lights are drawn with the canvas
   `lighter` blend, so they stack, animate and tween like any other property:

       const torch = get_node('Torch');
       torch.create_tween().set_loops(0)
         .tween_property(torch, 'energy', 1.3, 0.4).set_trans('sine_in_out')
         .tween_property(torch, 'energy', 0.85, 0.4).set_trans('sine_in_out');

       const night = get_node('Night');            // CanvasModulate
       night.create_tween().tween_property(night, 'color', '#0b1030', 1.5);
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node, Node2D, Vector2, Color, Logger } = GE;

  /** One shared radial-gradient texture per colour — cheap and pretty. */
  const gradient_cache = new Map();
  function radial_texture(size = 256) {
    const key = 'radial:' + size;
    if (gradient_cache.has(key)) return gradient_cache.get(key);
    let tex = null;
    if (typeof document !== 'undefined' && GE.ProceduralTextures && GE.ProceduralTextures.create_custom) {
      tex = GE.ProceduralTextures.create_custom('light:radial', size, (ctx, s) => {
        const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
      });
    }
    gradient_cache.set(key, tex);
    return tex;
  }

  /* ------------------------------------------------------------------ */
  /* CanvasModulate — "make it night"                                    */
  /* ------------------------------------------------------------------ */
  class CanvasModulate extends Node {
    constructor() {
      super();
      this.color = new Color(1, 1, 1, 1);
      this.visible = true;
      this.add_signal('color_changed');
    }

    static def = {
      name: 'CanvasModulate', icon: '🌙', kind: 'Visual', base: 'Node',
      desc: 'Tints the entire world at once — night, sunset, underwater, dream.',
      props: [
        { path: 'color', type: 'color', doc: 'Multiplied over every world pixel. #ffffff = off.' },
        { path: 'visible', type: 'bool', doc: 'Turn the tint off without deleting the node.' },
      ],
      methods: [
        { sig: 'set_color(color)', desc: 'Set the tint (accepts "#0b1030", Color, [r,g,b,a]).' },
        { sig: 'fade_to(color, duration)', desc: 'Tween the tint over time.' },
      ],
      signals: [{ name: 'color_changed', args: ['color'], desc: 'The tint changed.' }],
    };

    set_color(c) {
      this.color = c instanceof Color ? c : Color.from(c);
      this.emit_signal('color_changed', this.color);
      return this;
    }

    fade_to(c, duration = 1) {
      const target = c instanceof Color ? c : Color.from(c);
      this.create_tween().tween_property(this, 'color', target, duration);
      return this;
    }

    get enabled() { return this.visible !== false && (this.color.a > 0) && !is_white(this.color); }
  }

  function is_white(c) {
    return c && c.r > 0.999 && c.g > 0.999 && c.b > 0.999;
  }

  /* ------------------------------------------------------------------ */
  /* PointLight2D — a soft radial glow                                   */
  /* ------------------------------------------------------------------ */
  class PointLight2D extends Node2D {
    constructor() {
      super();
      this.color = new Color(1, 0.92, 0.7, 1);
      this.energy = 1.2;
      this.texture_scale = 2;        // world radius = texture_scale * 128px
      this.blend_mode = 'add';       // 'add' (glow) | 'mix' (spotlight wash)
      this.enabled = true;
      this.texture = null;
      this._is_light = true;
    }

    static def = {
      name: 'PointLight2D', icon: '💡', kind: 'Effects', base: 'Node2D',
      desc: 'A soft radial light — torches, lamps, explosions, magic, headlights.',
      props: [
        { path: 'color', type: 'color', doc: 'Light colour.' },
        { path: 'energy', type: 'number', min: 0, step: 0.1, doc: 'Brightness. Animate it for flicker.' },
        { path: 'texture_scale', type: 'number', min: 0.1, step: 0.1, doc: 'Size multiplier (2 ≈ 260 px across).' },
        { path: 'blend_mode', type: 'enum', options: ['add', 'mix'], doc: 'add = glow on top, mix = replaces the area.' },
        { path: 'enabled', type: 'bool', doc: 'Switch the light off.' },
        { path: 'texture', type: 'texture', doc: 'Optional custom light shape (defaults to a soft circle).' },
      ],
      methods: [
        { sig: 'flicker(amount)', desc: 'Randomize energy slightly — instant torch flicker.' },
        { sig: 'pulse(speed, amount)', desc: 'Endless breathing glow.' },
        { sig: 'radius', desc: 'Current world radius in pixels.' },
      ],
    };

    get radius() { return 128 * (Number(this.texture_scale) || 1) * (this.scale.x || 1); }

    set_color(c) { this.color = c instanceof Color ? c : Color.from(c); return this; }

    flicker(amount = 0.15) {
      this.energy = Math.max(0, this.energy + GE.randf_range(-amount, amount));
      return this;
    }

    pulse(speed = 1, amount = 0.25) {
      const base = this.energy;
      this.create_tween().set_loops(0)
        .tween_property(this, 'energy', base * (1 + amount), 0.5 / speed).set_trans('sine_in_out')
        .tween_property(this, 'energy', base * (1 - amount * 0.4), 0.5 / speed).set_trans('sine_in_out');
      return this;
    }

    _draw_this() { return this.enabled !== false; }

    _draw(ctx) {
      const tex = (this.texture && this.texture.image) ? this.texture : radial_texture(256);
      const r = 128 * (Number(this.texture_scale) || 1);
      const c = this.color instanceof Color ? this.color : Color.from(this.color || '#ffffff');
      ctx.globalAlpha = Math.max(0, Math.min(1, (Number(this.energy) || 0) * (c.a === undefined ? 1 : c.a)));
      ctx.globalCompositeOperation = this.blend_mode === 'mix' ? 'source-over' : 'lighter';
      ctx.fillStyle = c.to_css();
      if (tex && tex.image && typeof ctx.drawImage === 'function') {
        /* draw the white gradient, then tint it with the light colour */
        const tint = create_tinted(tex, c);
        if (tint && tint.image) ctx.drawImage(tint.image, -r, -r, r * 2, r * 2);
        else ctx.drawImage(tex.image, -r, -r, r * 2, r * 2);
      } else {
        const g = ctx.createRadialGradient ? ctx.createRadialGradient(0, 0, 0, 0, 0, r) : null;
        if (g) {
          g.addColorStop(0, c.to_css());
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
        }
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* Tint cache for the radial gradient (kept small: one per colour). */
  const tint_cache = new Map();
  function create_tinted(tex, color) {
    if (typeof document === 'undefined' || !tex.image) return null;
    const key = color.to_css();
    if (tint_cache.has(key)) return tint_cache.get(key);
    if (tint_cache.size > 24) tint_cache.clear();
    try {
      const size = tex.width || 256;
      const cnv = document.createElement('canvas');
      cnv.width = size; cnv.height = size;
      const ctx = cnv.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(tex.image, 0, 0, size, size);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color.to_css();
      ctx.fillRect(0, 0, size, size);
      const out = new GE.Assets.Texture(cnv, size, size, 'light:' + key);
      tint_cache.set(key, out);
      return out;
    } catch (e) {
      Logger.warn('PointLight2D could not tint its texture: ' + e.message);
      return null;
    }
  }

  GE.CanvasModulate = CanvasModulate;
  GE.PointLight2D = PointLight2D;
  GE.Classes.register(CanvasModulate);
  GE.Classes.register(PointLight2D);
})(typeof globalThis.GE !== 'undefined' ? globalThis.GE : (globalThis.GE = {}));
