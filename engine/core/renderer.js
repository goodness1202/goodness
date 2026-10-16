/* ==========================================================================
   Goodness Engine — core/renderer.js
   Canvas2D renderer: world pass (camera transform) + canvas layers (UI).
   ========================================================================== */
(function (GE) {
  'use strict';

  class Renderer {
    constructor(engine) {
      this.engine = engine;
      this.ctx = engine.ctx;
      this._items = [];
    }

    draw(tree) {
      const ctx = this.ctx;
      if (!ctx) return;
      const { w, h } = this.engine.size;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = tree.background || '#10131f';
      ctx.fillRect(0, 0, w, h);

      /* ---- world pass ---- */
      const cam = tree.active_camera;
      let camX = w / 2, camY = h / 2, zoom = 1, rot = 0, shakeX = 0, shakeY = 0;
      if (cam) {
        cam._update_smooth(w, h);
        const c = cam.get_viewport_center(w, h);
        camX = c.x; camY = c.y; zoom = cam.zoom;
        rot = cam.rotation;
        const sk = cam._shake();
        shakeX = sk.x; shakeY = sk.y;
      }
      ctx.save();
      ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
      if (rot) ctx.rotate(rot * Math.PI / 180);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      /* visible world rect for culling (tilemaps) */
      this.view_rect = { x: camX - w / 2 / zoom, y: camY - h / 2 / zoom, w: w / zoom, h: h / zoom };

      this._items.length = 0;
      if (tree.current_scene) this._collect(tree.current_scene, 0);
      this._items.sort((a, b) => a.z - b.z || a.oi - b.oi);
      for (const it of this._items) it.node._draw(ctx, this);
      ctx.restore();

      /* ---- canvas layer pass (screen space) ---- */
      for (const layer of tree._canvas_layers) {
        if (!layer.visible) continue;
        this._items.length = 0;
        this._collect(layer, layer.layer * 0.01, true);
        this._items.sort((a, b) => a.z - b.z || a.oi - b.oi);
        for (const it of this._items) it.node._draw(ctx, this);
      }
    }

    /** Recursively collect drawable nodes with their world transforms. */
    _collect(node, z, screen_space = false, oi = { i: 0 }) {
      if (node._freed || node.visible === false) return;
      let z_here = z;
      let oi_here = oi.i++;
      if (node instanceof GE.Node2D) {
        node._update_world();
        if (node._draw_this && node._draw_this()) {
          this._items.push({ node, z: z_here + (node.z_index || 0), oi: oi_here });
        }
      }
      for (const c of node.children) this._collect(c, z + (node.z_index || 0), screen_space, oi);
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
