/* ==========================================================================
   Goodness Engine — nodes/parallax.js
   Scrolling backgrounds the easy way:

       ParallaxBackground      a CanvasLayer that scrolls its ParallaxLayers
         ParallaxLayer         motion_scale (0,0 = glued to the screen,
                               1,1 = scrolls exactly with the camera)
           Sprite              your art, as usual

   motion_mirroring repeats a layer forever, so a 400 px hill image can fill
   a 1280 px screen without seams.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { CanvasLayer, Node2D, Vector2 } = GE;

  class ParallaxLayer extends Node2D {
    constructor() {
      super();
      this.motion_scale = new Vector2(1, 1);
      this.motion_mirroring = new Vector2(0, 0);
      this.motion_offset = new Vector2(0, 0);
      this._parallax_origin = new Vector2();
      this.scroll_offset = new Vector2();
    }

    static def = {
      name: 'ParallaxLayer', icon: '🌄', kind: 'Visual', base: 'Node2D',
      desc: 'A single layer of a scrolling background.',
      props: [
        { path: 'motion_scale', type: 'vector2', doc: '0 = glued to the screen, 1 = scrolls with the camera, 0.3 = far away.' },
        { path: 'motion_mirroring', type: 'vector2', doc: 'Repeat the layer every N pixels (0 = no repeat).' },
        { path: 'motion_offset', type: 'vector2', doc: 'Extra manual offset.' },
        { path: 'position', type: 'vector2', doc: 'Position inside the layer.' },
      ],
    };

    /** The layer's parent transform *is* the parallax origin (+ mirror repeat). */
    _parent_world() {
      const o = this._parallax_origin || Vector2.ZERO;
      const s = this._parallax_shift || Vector2.ZERO;
      return { x: o.x + s.x, y: o.y + s.y, rot: 0, sx: 1, sy: 1 };
    }

    /* Nothing to mirror by hand: the renderer re-draws this subtree once per
       repeat when `_mirror_shifts` has more than one entry. */
    get mirror_shifts() { return this._mirror_shifts || []; }
  }

  class ParallaxBackground extends CanvasLayer {
    constructor() {
      super();
      this.layer = -1;                       // behind the world
      this.scroll_scale = new Vector2(1, 1);
      this.scroll_base_offset = new Vector2(0, 0);
      this.scroll_ignore_camera_zoom = true;
      this.scroll_offset = new Vector2(0, 0);
      this.visible = true;
      this.follow_viewport = true;
    }

    static def = {
      name: 'ParallaxBackground', icon: '🏔️', kind: 'Visual', base: 'CanvasLayer',
      desc: 'Draws ParallaxLayer children behind (or in front of) the world.',
      props: [
        { path: 'layer', type: 'number', doc: 'Negative draws behind the world, positive in front.' },
        { path: 'scroll_scale', type: 'vector2', doc: 'Multiplies every child layer\'s motion_scale.' },
        { path: 'scroll_base_offset', type: 'vector2', doc: 'Offset added to the whole background.' },
        { path: 'scroll_ignore_camera_zoom', type: 'bool', doc: 'Keep the background stable when zooming.' },
      ],
      methods: [
        { sig: 'scroll_offset', desc: 'Read-only current scroll offset (updated every frame).' },
      ],
    };

    /** Called by the renderer every frame, before the layers are drawn.
     *  Layer origin (in screen space) = viewport centre - camera * motion_scale. */
    _stage_parallax(camera, view) {
      const cam = camera || { x: 0, y: 0, zoom: 1 };
      const view_w = (view && view.w) || 1280, view_h = (view && view.h) || 720;
      const cx = view_w / 2, cy = view_h / 2;
      const scale = this.scroll_scale || new Vector2(1, 1);
      const layers = [];
      (function collect(n) {
        for (const c of n.children) {
          if (c instanceof ParallaxLayer) layers.push(c);
          else collect(c);
        }
      })(this);
      for (const child of layers) {
        const ms = child.motion_scale || new Vector2(1, 1);
        const mirror = child.motion_mirroring || Vector2.ZERO;
        const org = child._parallax_origin || (child._parallax_origin = new Vector2());
        org.x = cx - cam.x * ms.x * scale.x + this.scroll_base_offset.x + (child.motion_offset ? child.motion_offset.x : 0);
        org.y = cy - cam.y * ms.y * scale.y + this.scroll_base_offset.y + (child.motion_offset ? child.motion_offset.y : 0);

        const shifts = [Vector2.ZERO];
        if (mirror.x > 0) {
          org.x = mod(org.x + mirror.x / 2, mirror.x) - mirror.x / 2;
          const count = Math.min(8, Math.ceil(view_w / mirror.x) + 1);
          for (let i = 1; i < count; i++) shifts.push(new Vector2(mirror.x * i, 0));
        }
        if (mirror.y > 0) {
          org.y = mod(org.y + mirror.y / 2, mirror.y) - mirror.y / 2;
          const base = shifts.slice();
          const count = Math.min(8, Math.ceil(view_h / mirror.y) + 1);
          for (let i = 1; i < count; i++) {
            for (const s of base) shifts.push(new Vector2(s.x, mirror.y * i));
          }
        }
        child._mirror_shifts = shifts;
        child._parallax_shift = Vector2.ZERO;
        child.scroll_offset = new Vector2(org.x, org.y);
        /* the offset changes every frame — force a fresh world transform */
        child._dirty = true;
        for (const c of child.children) if (c._dirty !== undefined) c._dirty = true;
      }
      if (layers.length) this.scroll_offset = new Vector2(layers[layers.length - 1]._parallax_origin.x, layers[layers.length - 1]._parallax_origin.y);
    }
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  /* YSort: a Node2D that paints its children front-to-back by world Y.
     (Node2D.y_sort_enabled does the same on any node.) */
  class YSort extends Node2D {
    constructor() {
      super();
      this.y_sort_enabled = true;
    }

    static def = {
      name: 'YSort', icon: '🪜', kind: 'Visual', base: 'Node2D',
      desc: 'Draws children sorted by their Y position — instant top-down depth.',
      props: [
        { path: 'position', type: 'vector2', doc: 'Position in the world.' },
        { path: 'y_sort_enabled', type: 'bool', doc: 'On by default for YSort.' },
      ],
    };
  }

  GE.ParallaxLayer = ParallaxLayer;
  GE.ParallaxBackground = ParallaxBackground;
  GE.YSort = YSort;
  GE.Classes.register(ParallaxLayer);
  GE.Classes.register(ParallaxBackground);
  GE.Classes.register(YSort);
})(typeof globalThis.GE !== 'undefined' ? globalThis.GE : (globalThis.GE = {}));
