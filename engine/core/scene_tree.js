/* ==========================================================================
   Goodness Engine — core/scene_tree.js
   Owns the node tree: current scene, groups, physics world, cameras,
  canvas layers, deferred deletions and the process order.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node, Logger, Vector2 } = GE;

  class SceneTree {
    constructor(options = {}) {
      this.root = new Node();
      this.root.name = 'root';
      this.root.tree = this;
      this.current_scene = null;       // root node of the active scene
      this.current_scene_name = null;
      this.paused = false;
      this.time_scale = 1;

      this._groups = new Map();        // group -> Set<Node>
      this._free_queue = [];
      this._frame = 0;
      this._process_nodes = [];        // cached flat list (rebuilt lazily)
      this._dirty = true;
      this._tweens = new Set();
      this._cameras = [];
      this._canvas_layers = [];
      this._active_camera = null;

      this.physics = new GE.PhysicsServer(this, options.physics || {});
      this.background = options.background || '#10131f';
      this.engine = null;              // set by Engine

      this.signals = {
        process_frame: new GE.Signal('process_frame'),
        physics_frame: new GE.Signal('physics_frame'),
        scene_changed: new GE.Signal('scene_changed'),
      };
    }

    /* ---------------- scenes ---------------- */
    set_current_scene(node, name = 'scene') {
      if (this.current_scene) this._remove_scene();
      this.current_scene = node;
      this.current_scene_name = name;
      if (node) {
        this.root.add_child(node, true);
        /* wire the connections saved in the scene file before _ready runs */
        if (GE.SceneBuilder && GE.SceneBuilder.connect_scene) GE.SceneBuilder.connect_scene(node);
        node._enter_tree_internal();
      }
      this.signals.scene_changed.emit(name);
      Logger.info(`Scene '${name}' ready (${this._count_nodes()} nodes).`);
    }

    _remove_scene() {
      const old = this.current_scene;
      this.current_scene = null;
      if (old) {
        /* detach and free the entire old scene */
        this.root.remove_child(old);
        this._free_subtree(old);
      }
      this._groups.clear();
      this._free_queue.length = 0;
      this._dirty = true;
    }

    _free_subtree(node) {
      for (const c of node.children.slice()) this._free_subtree(c);
      node._freed = true;
      node.children.length = 0;
      for (const g of node._groups) {
        const s = this._groups.get(g);
        if (s) s.delete(node);
      }
    }

    /** Change scene by name from the loaded project. */
    async change_scene(name) {
      if (!this.project) { Logger.warn('change_scene: no project loaded.'); return; }
      const data = this.project.scenes[name];
      if (!data) { Logger.error(`change_scene: scene '${name}' not found.`); return; }
      const node = await GE.SceneBuilder.build(data, this.project, this);
      this.set_current_scene(node, name);
    }

    reload_current_scene() {
      if (this.current_scene_name) return this.change_scene(this.current_scene_name);
    }

    _count_nodes() {
      let n = 0;
      const walk = (node) => { n++; node.children.forEach(walk); };
      if (this.current_scene) walk(this.current_scene);
      return n;
    }

    /* ---------------- groups ---------------- */
    _add_to_group(group, node) {
      if (!this._groups.has(group)) this._groups.set(group, new Set());
      this._groups.get(group).add(node);
    }
    _remove_from_group(group, node) {
      const s = this._groups.get(group);
      if (s) s.delete(node);
    }
    get_nodes_in_group(group) {
      const s = this._groups.get(group);
      return s ? [...s] : [];
    }
    get_tree() { return this; }

    /* ---------------- internal registration ---------------- */
    _notify_add(node) {
      this._dirty = true;
      const walk = (n) => {
        if (n instanceof GE.Camera2D) this._cameras.push(n);
        if (n instanceof GE.CanvasLayer) this._canvas_layers.push(n);
        this.physics._register(n);
        for (const g of n._groups) this._add_to_group(g, n);
        for (const c of n.children) walk(c);
      };
      walk(node);
    }
    _notify_remove(node) {
      this._dirty = true;
      const walk = (n) => {
        const ci = this._cameras.indexOf(n); if (ci >= 0) this._cameras.splice(ci, 1);
        const li = this._canvas_layers.indexOf(n); if (li >= 0) this._canvas_layers.splice(li, 1);
        this.physics._unregister(n);
        for (const c of n.children) walk(c);
      };
      walk(node);
      this._remove_from_groups_rec(node);
    }
    _remove_from_groups_rec(node) {
      for (const g of node._groups) this._remove_from_group(g, node);
      for (const c of node.children) this._remove_from_groups_rec(c);
    }

    _queue_free(node) { this._free_queue.push(node); }

    /* ---------------- frame processing ---------------- */
    _flat_nodes() {
      if (this._dirty) {
        const list = [];
        const walk = (n) => {
          if (!n._freed) {
            list.push(n);
            for (const c of n.children) walk(c);
          }
        };
        walk(this.root);
        this._process_nodes = list;
        this._dirty = false;
      }
      return this._process_nodes;
    }

    process(delta) {
      if (this.paused) { this._flush_free(); return; }
      delta *= this.time_scale;
      const nodes = this._flat_nodes();
      for (const n of nodes) {
        if (!n._freed && !n._process_broken) n._process_internal(delta);
      }
      for (const tw of [...this._tweens]) tw._step(delta);
      this._frame++;
      this._flush_free();
      this.signals.process_frame.emit(delta);
    }

    physics_process(delta) {
      if (this.paused) return;
      delta *= this.time_scale;
      const nodes = this._flat_nodes();
      for (const n of nodes) {
        if (!n._freed && !n._physics_broken) n._physics_process_internal(delta);
      }
      this.physics.step(delta);      /* collision detection + resolution */
      this.physics.flush_signals();  /* deferred contact signals */
      this.signals.physics_frame.emit(delta);
    }

    handle_input(event) {
      /* UI nodes (buttons) get the event first, in reverse z order */
      for (let i = this._canvas_layers.length - 1; i >= 0; i--) {
        if (this._canvas_layers[i]._handle_input(event)) return;
      }
      const nodes = this._flat_nodes();
      for (const n of nodes) {
        if (n._freed) continue;
        if (n._input_internal(event) === true) return; /* consume */
      }
    }

    _flush_free() {
      if (!this._free_queue.length) return;
      const q = this._free_queue.splice(0);
      for (const n of q) {
        if (n._freed) continue;
        if (n.parent) n.parent.remove_child(n);
        this._free_subtree(n);
      }
      this._dirty = true;
    }

    /* ---------------- cameras ---------------- */
    get active_camera() {
      if (this._active_camera && !this._active_camera._freed && this._active_camera.current) return this._active_camera;
      this._active_camera = this._cameras.find((c) => c.current && !c._freed) || null;
      return this._active_camera;
    }

    /* ---------------- tweens ---------------- */
    add_tween(tween) { this._tweens.add(tween); return tween; }
    kill_tween(tween) { this._tweens.delete(tween); }

    /* ---------------- helpers exposed to scripts ---------------- */
    get_frame() { return this._frame; }

    create_timer(time, callback, loop = false) {
      const t = new GE.Timer();
      t.wait_time = time;
      t.one_shot = !loop;
      t.autostart = true;
      t.connect('timeout', () => {
        callback();
        if (!loop) t.queue_free();   /* one-shots clean themselves up */
      });
      /* attach under root so it keeps ticking */
      this.root.add_child(t);
      return t;
    }
  }

  GE.SceneTree = SceneTree;
})(globalThis.GE);
