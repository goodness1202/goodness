/* ==========================================================================
   Goodness Engine — core/renderer.js
   Canvas2D renderer: world pass (camera transform) + canvas layers (UI).

   Every drawable node is drawn with its own world transform applied
   (translate → rotate → scale), so children of a rotated parent inherit the
   rotation exactly like Godot's CanvasItem transforms do. Depth sorting is
   done per (z_index, paint order) and, when a node sets `y_sort_enabled` (or
   is a YSort node), its children are sorted by their world Y instead.
   ========================================================================== */
(function (GE) {
  'use strict';

  class Renderer {
    constructor(engine) {
      this.engine = engine;
      this.ctx = engine.ctx;
      this._items = [];
      this.last_camera = { x: engine.size.w / 2, y: engine.size.h / 2, zoom: 1 };
    }

    draw(tree) {
      const ctx = this.ctx;
      if (!ctx) return;
      const { w, h } = this.engine.size;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = tree.background || '#10131f';
      ctx.fillRect(0, 0, w, h);

      /* ---- background canvas layers (layer < 0, screen space) ---- */
      const layers = [...tree._canvas_layers].sort((a, b) => (a.layer || 0) - (b.layer || 0));
      for (const layer of layers) {
        if (layer.visible === false || (layer.layer || 0) >= 0) continue;
        if (typeof layer._stage_parallax === 'function') layer._stage_parallax(this.last_camera, { w, h });
        this._draw_pass(layer, (layer.layer || 0) * 0.01, ctx, true);
      }

      /* ---- world pass ---- */
      const cam = tree.active_camera;
      let camX = w / 2, camY = h / 2, zoom = 1, rot = 0, shakeX = 0, shakeY = 0;
      if (cam) {
        cam._update_smooth(w, h);
        const c = cam.get_viewport_center(w, h);
        camX = c.x; camY = c.y; zoom = cam.zoom || 1;
        rot = cam.rotation;
        const sk = cam._shake();
        shakeX = sk.x; shakeY = sk.y;
      }
      this.last_camera = { x: camX, y: camY, zoom };
      ctx.save();
      ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
      if (rot) ctx.rotate(rot * Math.PI / 180);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      /* visible world rect for culling (tilemaps) */
      this.view_rect = { x: camX - w / 2 / zoom, y: camY - h / 2 / zoom, w: w / zoom, h: h / zoom };

      this._draw_pass(tree.current_scene, 0, ctx, false);
      ctx.restore();

      /* ---- canvas layer pass (screen space, sorted by `layer`) ---- */
      for (const layer of layers) {
        if (layer.visible === false || (layer.layer || 0) < 0) continue;
        /* ParallaxBackgrounds re-stage their layers every frame */
        if (typeof layer._stage_parallax === 'function') layer._stage_parallax(this.last_camera, { w, h });
        this._draw_pass(layer, (layer.layer || 0) * 0.01, ctx, true);
      }
    }

    /** collect + sort + draw one subtree, applying each node's transform. */
    _draw_pass(root, base_z, ctx, screen_space) {
      if (!root || root._freed || root.visible === false) return;
      this._items.length = 0;
      this._collect(root, base_z, screen_space);
      this._items.sort((a, b) => a.z - b.z || a.oi - b.oi);
      for (const it of this._items) {
        const node = it.node;
        ctx.save();
        if (node instanceof GE.Node2D) this.apply_transform(ctx, node);
        if (node.modulate && typeof node.modulate.alpha === 'number' && node.modulate.alpha < 1) {
          ctx.globalAlpha = ctx.globalAlpha * node.modulate.alpha;
        }
        try { node._draw(ctx, this); }
        catch (e) { GE.Logger.error(`${node}._draw() failed: ${e.message}`); }
        ctx.restore();
      }
    }

    /** Recursively collect drawable nodes with their world transforms. */
    _collect(node, z, screen_space = false, oi = { i: 0 }) {
      if (node._freed || node.visible === false) return;
      const z_here = z;
      const oi_here = oi.i++;
      if (node instanceof GE.Node2D) {
        node._update_world();
        if (node._draw_this && node._draw_this()) {
          this._items.push({ node, z: z_here + (node.z_index || 0), oi: oi_here });
        }
      }
      const child_z = z + (node.z_index || 0);

      /* Parallax mirroring: draw the subtree once per repeat offset. */
      if (GE.ParallaxLayer && node instanceof GE.ParallaxLayer &&
          node._mirror_shifts && node._mirror_shifts.length > 1) {
        const shifts = node._mirror_shifts;
        const last = shifts[shifts.length - 1];
        for (const s of shifts) {
          node._parallax_shift = s;
          node._dirty = true;
          node._update_world();
          for (const c of node.children) this._collect(c, child_z, screen_space, oi);
        }
        node._parallax_shift = GE.Vector2.ZERO;
        node._dirty = true;
        void last;
        return;
      }

      /* Y-sorting: children paint back-to-front ordered by world Y. */
      if (node.y_sort_enabled || (GE.YSort && node instanceof GE.YSort)) {
        const kids = node.children.slice();
        kids.sort((a, b) => {
          const ay = a instanceof GE.Node2D ? a.global_position.y : -Infinity;
          const by = b instanceof GE.Node2D ? b.global_position.y : -Infinity;
          return ay - by;
        });
        kids.forEach((c, i) => this._collect(c, child_z + (i + 1) * 0.0001, screen_space, oi));
        return;
      }
      for (const c of node.children) this._collect(c, child_z, screen_space, oi);
    }

    /* helpers for nodes */
    apply_transform(ctx, node) {
      if (node instanceof GE.Node2D) {
        const w = node._world;
        ctx.translate(w.x, w.y);
        if (w.rot) ctx.rotate(w.rot * Math.PI / 180);
        if (w.sx !== 1 || w.sy !== 1) ctx.scale(w.sx, w.sy);
      }
    }
  }

  GE.Renderer = Renderer;
})(globalThis.GE);
