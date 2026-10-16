/* ==========================================================================
   Goodness Engine — nodes/sprites.js
   Visual nodes: Sprite, AnimatedSprite, ColorRect, Polygon2D.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2, Color, Assets, Logger } = GE;

  /* ==================================================================== */
  class Sprite extends Node2D {
    constructor() {
      super();
      this.texture = null;        // Texture object or null
      this.texture_src = null;    // 'goodness://…' | url | project key
      this.modulate = new Color(1, 1, 1);
      this.flip_h = false;
      this.flip_v = false;
      this.region = null;         // {x,y,w,h} in texture pixels
      this._placeholder_size = new Vector2(32, 32);
    }

    static def = {
      name: 'Sprite', icon: '🖼️', kind: 'Visual', base: 'Node2D',
      desc: 'Draws a texture. Use built-in art via "goodness://hero", URLs or project images.',
      props: [
        { path: 'texture', type: 'texture', doc: 'Image to draw ("goodness://star", URL or project image).' },
        { path: 'modulate', type: 'color', doc: 'Tint color.' },
        { path: 'flip_h', type: 'bool', doc: 'Mirror horizontally.' },
        { path: 'flip_v', type: 'bool', doc: 'Mirror vertically.' },
        { path: 'region', type: 'json', doc: 'Optional sub-rect {x,y,w,h} for sprite sheets.' },
      ],
      methods: [
        { sig: 'get_rect()', desc: 'World-space rect covered by this sprite.' },
        { sig: 'set_texture(src)', desc: 'Async: set texture from a source string.' },
      ],
    };

    /* texture property accepts a source string; convert async */
    set texture_src(v) {
      if (v && typeof v === 'string' && v !== this._src) {
        this._src = v;
        Assets.load_texture(v, this.tree && this.tree.project).then((t) => {
          if (t) this.texture = t;
        });
      } else if (!v) { this._src = null; this.texture = null; }
    }
    get texture_src() { return this._src; }

    _needs_texture_load(project) {
      if (!this._src) return Promise.resolve();
      return Assets.load_texture(this._src, project).then((t) => { if (t) this.texture = t; });
    }

    async set_texture(src) {
      this._src = src;
      const t = await Assets.load_texture(src, this.tree && this.tree.project);
      if (t) this.texture = t;
      return t;
    }

    get texture_size() {
      return this.texture ? new Vector2(this.texture.width, this.texture.height) : this._placeholder_size.copy();
    }

    get_rect() {
      const s = this.texture_size;
      const w = this.region ? this.region.w : s.x;
      const h = this.region ? this.region.h : s.y;
      const pos = this.global_position.sub(new Vector2(w / 2 * this.scale.x, h / 2 * this.scale.y));
      return new GE.Rect2(pos.x, pos.y, w * this.scale.x, h * this.scale.y);
    }

    _draw_this() { return true; }

    _draw(ctx) {
      if (!this.texture || !this.texture.image) {
        /* placeholder so you never render "nothing" by accident */
        ctx.fillStyle = this.modulate.to_css();
        const w = this._placeholder_size.x, h = this._placeholder_size.y;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        return;
      }
      ctx.fillStyle = this.modulate.to_css();
      const tex = this.texture;
      let sx = 0, sy = 0, sw = tex.width, sh = tex.height;
      if (this.region) {
        sx = this.region.x; sy = this.region.y;
        sw = Math.min(this.region.w, tex.width - sx);
        sh = Math.min(this.region.h, tex.height - sy);
      }
      try {
        if (this.flip_h || this.flip_v) {
          ctx.save();
          ctx.scale(this.flip_h ? -1 : 1, this.flip_v ? -1 : 1);
          ctx.drawImage(tex.image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
          ctx.restore();
        } else {
          ctx.drawImage(tex.image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
        }
      } catch (e) { /* tainted/missing image — silently skip */ }
    }

    _serialize_props() {
      const props = super._serialize_props();
      props.texture = this._src || null;
      delete props.texture_src;
      return props;
    }
  }

  /* ==================================================================== */
  class AnimatedSprite extends Node2D {
    constructor() {
      super();
      this.animations = {};   // name -> { frames: [{texture, duration}], loop: true, fps: 8 }
      this.current_animation = '';
      this.playing = false;
      this.speed_scale = 1;
      this.autoplay = '';
      this.modulate = new Color(1, 1, 1);
      this._frame = 0;
      this._time = 0;
      this._textures = [];
      this.add_signal('animation_finished');
      this.add_signal('frame_changed');
    }

    static def = {
      name: 'AnimatedSprite', icon: '🎞️', kind: 'Visual', base: 'Node2D',
      desc: 'Sprite with named animations. Build frame lists from built-in art or sprite sheets.',
      props: [
        { path: 'animations', type: 'json', doc: 'Animation dictionary (JSON).' },
        { path: 'autoplay', type: 'string', doc: 'Animation to play on start.' },
        { path: 'speed_scale', type: 'number', min: 0.1, step: 0.1, doc: 'Playback speed multiplier.' },
        { path: 'modulate', type: 'color', doc: 'Tint color.' },
      ],
      methods: [
        { sig: "play('walk')", desc: 'Play an animation (loops unless loop:false).' },
        { sig: 'stop() / pause()', desc: 'Control playback.' },
      ],
    };

    async _needs_texture_load(project) {
      const jobs = [];
      for (const an of Object.values(this.animations)) {
        for (const f of an.frames || []) {
          jobs.push(Assets.load_texture(f.texture, project).then((t) => { f._tex = t; }));
        }
      }
      await Promise.all(jobs);
      this._refresh_frame_list();
    }

    _refresh_frame_list() {
      const an = this.animations[this.current_animation];
      this._textures = an && an.frames ? an.frames.map((f) => f._tex).filter(Boolean) : [];
      if (this._frame >= this._textures.length) this._frame = 0;
    }

    play(name = this.current_animation) {
      if (name && this.animations[name]) {
        if (name !== this.current_animation) { this.current_animation = name; this._frame = 0; this._time = 0; this._refresh_frame_list(); }
        this.playing = true;
      } else Logger.warn(`AnimatedSprite '${this.name}': no animation '${name}'.`);
    }
    stop() { this.playing = false; }
    pause() { this.playing = false; }

    _ready() { if (this.autoplay) this.play(this.autoplay); }

    _process(delta) {
      if (!this.playing) return;
      const an = this.animations[this.current_animation];
      if (!an || !an.frames || !an.frames.length) return;
      const fps = (an.fps || 8) * this.speed_scale;
      this._time += delta * fps;
      while (this._time >= 1) {
        this._time -= 1;
        this._frame++;
        if (this._frame >= an.frames.length) {
          if (an.loop === false) {
            this._frame = an.frames.length - 1;
            this.playing = false;
            this.signals.animation_finished.emit();
            this._call_script_or_method('_on_animation_finished');
            return;
          }
          this._frame = 0;
        }
        this.signals.frame_changed.emit(this._frame);
      }
    }

    _draw_this() { return true; }
    _draw(ctx) {
      const tex = this._textures[this._frame];
      if (!tex || !tex.image) return;
      ctx.globalAlpha = this.modulate.a;
      ctx.drawImage(tex.image, -tex.width / 2, -tex.height / 2);
      ctx.globalAlpha = 1;
    }
  }

  /* ==================================================================== */
  class ColorRect extends Node2D {
    constructor() {
      super();
      this.size = new Vector2(100, 100);
      this.color = new Color(0.35, 0.4, 0.55);
      this.corner_radius = 0;
    }
    static def = {
      name: 'ColorRect', icon: '⬛', kind: 'Visual', base: 'Node2D',
      desc: 'Solid rectangle — floors, backgrounds, bars, simple characters.',
      props: [
        { path: 'size', type: 'vector2', doc: 'Width/height in pixels.' },
        { path: 'color', type: 'color', doc: 'Fill color.' },
        { path: 'corner_radius', type: 'number', min: 0, step: 1, doc: 'Rounded corners.' },
      ],
    };
    _draw_this() { return true; }
    _draw(ctx) {
      ctx.fillStyle = this.color.to_css();
      const w = this.size.x, h = this.size.y;
      if (this.corner_radius > 0 && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, this.corner_radius);
        ctx.fill();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
    }
  }

  /* ==================================================================== */
  class Polygon2D extends Node2D {
    constructor() {
      super();
      this.points = [[-40, -20], [40, -20], [0, 40]];
      this.color = new Color(0.4, 0.8, 0.9);
    }
    static def = {
      name: 'Polygon2D', icon: '📐', kind: 'Visual', base: 'Node2D',
      desc: 'Solid polygon from a point list (JSON array of [x, y]).',
      props: [
        { path: 'points', type: 'json', doc: 'Array of [x,y] points.' },
        { path: 'color', type: 'color', doc: 'Fill color.' },
      ],
    };
    _draw_this() { return this.points && this.points.length >= 3; }
    _draw(ctx) {
      ctx.beginPath();
      this.points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = this.color.to_css();
      ctx.fill();
    }
  }

  /* ==================================================================== */
  /* Camera + layers                                                       */
  /* ==================================================================== */
  class Camera2D extends Node2D {
    constructor() {
      super();
      this.zoom = 1;
      this.offset = new Vector2();
      this.current = false;
      this.smoothing_enabled = false;
      this.smoothing_speed = 5;
      this.limit_left = -Infinity; this.limit_top = -Infinity;
      this.limit_right = Infinity; this.limit_bottom = Infinity;
      this._smpos = new Vector2();
      this._shake_time = 0;
      this._shake_strength = 0;
      this._sm_init = false;
    }
    static def = {
      name: 'Camera2D', icon: '🎥', kind: 'Visual', base: 'Node2D',
      desc: 'Scrolling camera. Make it follow a node (script sets position) or drag it around.',
      props: [
        { path: 'zoom', type: 'number', min: 0.05, max: 8, step: 0.05, doc: 'Zoom (2 = half size, 0.5 = double).' },
        { path: 'offset', type: 'vector2', doc: 'Viewport offset in pixels.' },
        { path: 'current', type: 'bool', doc: 'Use this camera.' },
        { path: 'smoothing_enabled', type: 'bool', doc: 'Ease into position.' },
        { path: 'smoothing_speed', type: 'number', min: 0.5, step: 0.5, doc: 'Smoothing speed.' },
        { path: 'limit_left', type: 'number', doc: 'Left scroll limit.' },
        { path: 'limit_top', type: 'number', doc: 'Top scroll limit.' },
        { path: 'limit_right', type: 'number', doc: 'Right scroll limit.' },
        { path: 'limit_bottom', type: 'number', doc: 'Bottom scroll limit.' },
      ],
      methods: [
        { sig: 'make_current()', desc: 'Activate this camera.' },
        { sig: 'shake(duration, strength)', desc: 'Screen shake!' },
      ],
    };
    make_current() { this.current = true; }
    shake(duration = 0.3, strength = 12) {
      this._shake_time = duration;
      this._shake_strength = strength;
    }
    _update_smooth(w, h) {
      if (!this._sm_init) { this._smpos = this.position.copy(); this._sm_init = true; }
      if (this.smoothing_enabled) {
        const t = Math.min(1, this.smoothing_speed * (1 / 60));
        this._smpos = this._smpos.lerp(this.position, t);
      } else {
        this._smpos = this.position.copy();
      }
    }
    get_viewport_center(w, h) {
      let c = this._smpos.add(this.offset);
      /* clamp so we never see past the limits */
      const hw = w / 2 / this.zoom, hh = h / 2 / this.zoom;
      if (this.limit_right !== Infinity && this.limit_left !== -Infinity) {
        const span_x = this.limit_right - this.limit_left;
        if (span_x >= w / this.zoom) c.x = GE.math.clamp(c.x, this.limit_left + hw, this.limit_right - hw);
        else c.x = (this.limit_left + this.limit_right) / 2;
      }
      if (this.limit_bottom !== Infinity && this.limit_top !== -Infinity) {
        const span_y = this.limit_bottom - this.limit_top;
        if (span_y >= h / this.zoom) c.y = GE.math.clamp(c.y, this.limit_top + hh, this.limit_bottom - hh);
        else c.y = (this.limit_top + this.limit_bottom) / 2;
      }
      return c;
    }
    _shake() {
      if (this._shake_time > 0) {
        this._shake_time -= 1 / 60;
        return new Vector2(GE.randf_range(-1, 1) * this._shake_strength, GE.randf_range(-1, 1) * this._shake_strength);
      }
      return new Vector2();
    }
  }

  /* ==================================================================== */
  class CanvasLayer extends GE.Node {
    constructor() {
      super();
      this.layer = 1;
      this.visible = true;
    }
    static def = {
      name: 'CanvasLayer', icon: '🪟', kind: 'Visual', base: 'Node',
      desc: 'Screen-space layer for HUDs and menus. Children ignore the camera.',
      props: [
        { path: 'layer', type: 'number', step: 1, doc: 'Draw order between layers.' },
        { path: 'visible', type: 'bool', doc: 'Show/hide the layer.' },
      ],
    };

    _handle_input(event) {
      if (!this.visible || event.type !== 'mouse' && event.type !== 'mouse_motion') return false;
      const buttons = [];
      const walk = (n) => {
        if (n._freed || n.visible === false) return;
        if (n instanceof GE.Button) buttons.push(n);
        for (const c of n.children) walk(c);
      };
      walk(this);
      /* topmost (last drawn) first */
      buttons.reverse();
      for (const b of buttons) {
        if (b._ui_event(event)) return true;
      }
      return false;
    }
  }

  for (const cls of [Sprite, AnimatedSprite, ColorRect, Polygon2D, Camera2D, CanvasLayer]) {
    GE.Classes.register(cls);
  }
  GE.Sprite = Sprite;
  GE.AnimatedSprite = AnimatedSprite;
  GE.ColorRect = ColorRect;
  GE.Polygon2D = Polygon2D;
  GE.Camera2D = Camera2D;
  GE.CanvasLayer = CanvasLayer;
})(globalThis.GE);
