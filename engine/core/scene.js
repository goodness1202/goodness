/* ==========================================================================
   Goodness Engine — core/scene.js
   SceneBuilder: turns scene JSON (files like scenes/main.json in a
  project) into a live node tree — instantiating nodes, applying
  properties, attaching scripts and wiring signal connections.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger, Classes, Vector2, Color } = GE;

  const SceneBuilder = {
    /** Build a full scene from JSON: { root: {...} } or a node dict directly. */
    async build(scene_data, project, tree = null) {
      const root_data = scene_data && scene_data.root ? scene_data.root : scene_data;
      if (!root_data || !root_data.type) {
        Logger.error('Scene JSON must contain a root node with a "type".');
        return null;
      }
      return await this.build_node(root_data, project, tree);
    },

    /** Recursively instantiate one node (and its children). */
    async build_node(data, project, tree) {
      if (!data || !data.type) { Logger.error('build_node: node data missing "type".'); return null; }

      /* scene instancing: { type: 'Instance', scene: 'enemy.json' } */
      if (data.type === 'Instance' && project && data.scene) {
        const sub = project.scenes[data.scene];
        if (!sub) { Logger.error(`Instance: scene '${data.scene}' not found.`); return null; }
        const inner = await this.build(sub, project, tree);
        if (!inner) return null;
        if (data.name) inner.name = data.name;
        this._apply_props(inner, data.props || {}, project);
        await this._attach(inner, data, project, tree);
        /* edits: add extra children listed after the instanced children */
        for (const cd of (data.children || [])) {
          const c = await this.build_node(cd, project, tree);
          if (c) inner.add_child(c);
        }
        return inner;
      }

      const cls = Classes.get(data.type);
      if (!cls) { Logger.error(`build_node: unknown node type '${data.type}'.`); return null; }
      const node = new cls();
      if (data.name) node.name = data.name;
      if (data.editor_id) node._editor_id = data.editor_id;

      /* connect signal wiring is stored for later (targets must exist) */
      node._connections_saved = data.connections || null;

      this._apply_props(node, data.props || {}, project);
      await this._attach(node, data, project, tree);

      for (const cd of (data.children || [])) {
        const c = await this.build_node(cd, project, tree);
        if (c) node.add_child(c);
      }
      return node;
    },

    _apply_props(node, props, project) {
      for (const [path, value] of Object.entries(props || {})) {
        try { this._set_prop(node, path, value, project); }
        catch (e) { Logger.warn(`Could not set ${node.name}.${path}: ${e.message}`); }
      }
    },

    _set_prop(node, path, value, project) {
      const parts = path.split('.');
      let obj = node, last = parts[parts.length - 1];
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]] === undefined || obj[parts[i]] === null) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      /* typed coercion for known engine value classes */
      const current = obj[last];
      if (current instanceof Vector2 || (last === 'position' || last === 'scale' || last === 'size')) {
        if (Array.isArray(value) || typeof value === 'object') { obj[last] = Vector2.from(value); return; }
      }
      if (current instanceof Color) { obj[last] = Color.from(value); return; }
      if (typeof current === 'number' && typeof value === 'string' && value !== '' && !isNaN(Number(value))) {
        obj[last] = Number(value); return;
      }
      obj[last] = value;
    },

    async _attach(node, data, project, tree) {
      /* script: inline source or a named asset */
      if (data.script_name && project && project.assets && project.assets.scripts && project.assets.scripts[data.script_name]) {
        node._script_name = data.script_name;
        GE.Scripts.attach_source(node, project.assets.scripts[data.script_name]);
      } else if (data.script) {
        node._script_name = data.script_name || 'inline';
        GE.Scripts.attach_source(node, data.script);
      }
      /* textures need async loading */
      if (node._needs_texture_load && typeof node._needs_texture_load === 'function') {
        await node._needs_texture_load(project);
      }
    },

    /** Wire saved signal connections once the whole tree exists. */
    connect_scene(node) {
      const walk = (n) => {
        if (n._connections_saved) {
          for (const cn of n._connections_saved) {
            const target = cn.to ? node.get_node(cn.to) || n.get_node(cn.to) : n;
            if (!target) { Logger.warn(`${n}: connection target '${cn.to}' not found.`); continue; }
            const sig = cn.signal;
            if (!n.has_signal(sig)) { Logger.warn(`${n}: no signal '${sig}'.`); continue; }
            const handler = cn.method;
            n.connect(sig, (a, b, c) => {
              if (target._script && typeof target._script[handler] === 'function') target._script[handler].call(target, a, b, c);
              else if (typeof target[handler] === 'function') target[handler](a, b, c);
              else Logger.warn(`${n}: signal '${sig}' -> ${target.name}.${handler}() not found.`);
            });
          }
          n._connections_saved = null;
        }
        for (const c of n.children) walk(c);
      };
      walk(node);
    },
  };

  GE.SceneBuilder = SceneBuilder;
})(globalThis.GE);
