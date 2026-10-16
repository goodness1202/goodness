/* ==========================================================================
   Goodness Engine — core/node.js
   The base Node class: tree management, signals, groups, lifecycle,
   script attachment and the class registry used by the editor.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Signal, Logger } = GE;

  /* ------------------------------------------------------------------ */
  /* Class registry — every node type registers itself here.             */
  /* The editor, the "Add Node" dialog, the inspector and the docs       */
  /* generator all read from this single source of truth.                */
  /* ------------------------------------------------------------------ */
  const Classes = {
    _map: new Map(),
    register(cls) { this._map.set(cls.def.name, cls); },
    get(name) {
      if (this._map.has(name)) return this._map.get(name);
      Logger.warn(`Unknown node class '${name}'. Did you register it?`);
      return null;
    },
    all() { return [...this._map.values()]; },
    /** Build a default instance by class name. */
    create(name) {
      const cls = this.get(name);
      return cls ? new cls() : null;
    },
  };
  GE.Classes = Classes;

  /* ------------------------------------------------------------------ */
  /* Node                                                                */
  /* ------------------------------------------------------------------ */
  let _auto = 0;

  class Node {
    constructor() {
      this.name = this.constructor.def ? this.constructor.def.name + (_auto++) : 'Node' + (_auto++);
      this.parent = null;
      this.children = [];
      this.tree = null;            // set when added to a SceneTree
      this._script = null;         // attached script instance data (methods+props)
      this._script_src = null;     // raw script source (string)
      this._script_def = null;     // compiled object-literal definition
      this._freed = false;
      this._ready_done = false;
      this._editor_id = null;      // stable id used by the editor
      this._groups = new Set();

      /* built-in signals */
      this.add_signal('ready');
      this.add_signal('renamed');
      this.add_signal('tree_entered');
      this.add_signal('tree_exited');
      this.add_signal('child_entered_tree');
      this.add_signal('child_exiting_tree');
    }

    static def = {
      name: 'Node',
      icon: '🔵',
      kind: 'Logic',
      base: null,
      desc: 'Base building block of a scene. Organizes the tree and runs logic.',
      props: [
        { path: 'name', type: 'string', doc: 'Unique name of this node among its siblings.' },
      ],
      methods: [
        { sig: 'add_child(node)', desc: 'Add a child node. Fails on invalid names or cycles.' },
        { sig: 'get_node(path)', desc: "Fetch a relative or absolute node, e.g. 'Player/Sprite' or '../../HUD'." },
        { sig: 'get_parent()', desc: 'Return the parent node (null for the root).' },
        { sig: 'queue_free()', desc: 'Delete this node safely at the end of the frame.' },
        { sig: 'connect(signal, target, method)', desc: 'Connect one of this node\'s signals to a method.' },
        { sig: 'emit_signal(name, ...args)', desc: 'Fire a signal with arguments.' },
        { sig: 'add_to_group(name) / is_in_group(name)', desc: 'Group management (e.g. "enemies").' },
        { sig: 'create_tween()', desc: 'Build a chained tween driven by this node.' },
      ],
    };

    /* ---------------- tree management ---------------- */
    add_child(child, keep_name = false) {
      if (!child || child === this) { Logger.error('add_child: invalid child node.'); return null; }
      if (child.parent) child.parent.remove_child(child);
      /* enforce unique name among siblings */
      if (!keep_name && this.children.some((c) => c.name === child.name)) {
        child.name = unique_sibling_name(this, child.name);
      }
      child.parent = this;
      child._propagate_tree(this.tree ? this.tree : (this === this.tree ? null : this.tree));
      this.children.push(child);
      if (this.tree) {
        this.tree._notify_add(child);
        child.signals.tree_entered.emit();
        this.signals.child_entered_tree.emit(child);
      }
      return child;
    }

    remove_child(child) {
      const i = this.children.indexOf(child);
      if (i < 0) return;
      this.children.splice(i, 1);
      child.parent = null;
      const tree = child.tree;
      if (tree) {
        child.signals.child_exiting_tree.emit();
        child._propagate_tree(null, true);
        tree._notify_remove(child);
      }
    }

    _propagate_tree(tree, exiting = false) {
      this.tree = tree;
      if (exiting && this._freed === false && this._exit_tree_done !== true) {
        try { this._dispatch_lifecycle('_exit_tree'); } catch (e) { Logger.error(`${this}. _exit_tree failed: ${e.message}`); }
        this._exit_tree_done = true;
        /* nodes may re-enter the tree later */
        setTimeout(() => { this._exit_tree_done = false; }, 0);
      }
      for (const c of this.children) c._propagate_tree(tree, exiting);
    }

    get_parent() { return this.parent; }
    get_child(n) { return this.children[n]; }
    get_child_count() { return this.children.length; }
    get_children() { return this.children.slice(); }

    get path() {
      if (!this.parent) return '/root';
      const parts = [];
      let n = this;
      while (n && n.parent) { parts.unshift(n.name); n = n.parent; }
      return '/' + parts.join('/');
    }

    get scene_file_path() { return this.tree && this.tree.current_scene_name; }

    _root() {
      let n = this;
      while (n.parent) n = n.parent;
      return n;
    }

    /** Resolve a node path like 'Player/Sprite', '..' or '/root/Main/HUD'. */
    get_node(path) {
      if (typeof path !== 'string' || path === '') return null;
      if (path === '.' ) return this;
      let node = this;
      if (path.startsWith('/')) {
        node = this._root();
        path = path.replace(/^\/root\/?/, '');
        if (path === '') return node;
        if (path.startsWith('/')) path = path.slice(1);
      }
      for (const part of path.split('/')) {
        if (part === '.') continue;
        if (part === '..') { node = node.parent; if (!node) return null; continue; }
        node = node.children.find((c) => c.name === part && !c._freed);
        if (!node) return null;
      }
      return node;
    }
    /* common convenience lookups */
    get_node_or_null(p) { return this.get_node(p); }
    find_child(name, recursive = true, owned = true) {
      for (const c of this.children) {
        if (c.name === name) return c;
        if (recursive) { const r = c.find_child(name, recursive, owned); if (r) return r; }
      }
      return null;
    }
    has_node(path) { return !!this.get_node(path); }

    get_tree() { return this.tree; }

    /* ---------------- groups ---------------- */
    add_to_group(group) {
      this._groups.add(group);
      if (this.tree) this.tree._add_to_group(group, this);
    }
    remove_from_group(group) {
      this._groups.delete(group);
      if (this.tree) this.tree._remove_from_group(group, this);
    }
    is_in_group(group) { return this._groups.has(group); }

    /* ---------------- signals ---------------- */
    add_signal(name) {
      if (!this.signals) this.signals = {};
      if (!this.signals[name]) this.signals[name] = new Signal(name, this);
      return this.signals[name];
    }
    has_signal(name) { return !!(this.signals && this.signals[name]); }
    connect(sig, target, method) {
      if (!this.has_signal(sig)) { Logger.warn(`${this}: no signal '${sig}' to connect.`); return; }
      return this.signals[sig].connect(target, method);
    }
    disconnect(sig, target, method) {
      if (this.has_signal(sig)) this.signals[sig].disconnect(target, method);
    }
    emit_signal(sig, ...args) {
      if (!this.has_signal(sig)) { Logger.warn(`${this}: no signal '${sig}' to emit.`); return; }
      this.signals[sig].emit(...args);
    }

    /* ---------------- lifecycle ---------------- */
    /** Called by the SceneTree when the whole scene is in place. */
    _enter_tree_internal() {
      if (this._ready_done) return;
      this._ready_done = true;
      try { this._dispatch_lifecycle('_ready'); }
      catch (e) { Logger.error(`${this}._ready() failed: ${e.message}\n${e.stack || ''}`); }
      if (this.has_signal('ready')) this.signals.ready.emit();
      for (const c of this.children) c._enter_tree_internal();
    }

    /* Run a lifecycle virtual: the native class method first (if the
       script did not replace it), then the script's own method. This is
       what lets a Timer keep its autostart while a script also has
       _ready(), and Particles keep simulating while scripted. */
    _dispatch_lifecycle(name, ...args) {
      const native = this.constructor.prototype[name];
      const inst = this[name];
      if (typeof native === 'function' && native !== inst) native.call(this, ...args);
      if (typeof inst === 'function') return inst.call(this, ...args);
      return undefined;
    }

    /* Script callbacks by convention (e.g. _on_pressed, _on_timeout). */
    _call_script_or_method(name, ...args) {
      if (typeof this[name] === 'function') return this[name](...args);
      if (this._script && typeof this._script[name] === 'function') return this._script[name].apply(this, args);
      return undefined;
    }

    _process_internal(delta) {
      try { this._dispatch_lifecycle('_process', delta); }
      catch (e) { Logger.error(`${this}._process() failed: ${e.message}`); this._process_broken = true; }
    }
    _physics_process_internal(delta) {
      try { this._dispatch_lifecycle('_physics_process', delta); }
      catch (e) { Logger.error(`${this}._physics_process() failed: ${e.message}`); this._physics_broken = true; }
    }
    _input_internal(ev) {
      try { return this._dispatch_lifecycle('_input', ev); }
      catch (e) { Logger.error(`${this}._input() failed: ${e.message}`); }
      return undefined;
    }

    /* ---------------- scripts ---------------- */
    /** Attach a compiled script definition (object literal w/ extends + methods). */
    attach_script(def, src = null) {
      if (!def || typeof def !== 'object') { Logger.warn('attach_script: definition must be an object.'); return; }
      const base = def.extends || 'Node';
      const cls = Classes.get(base);
      if (!cls) { Logger.warn(`attach_script: unknown base class '${base}'.`); return; }
      /* native type check: script base must match or be a parent of this node's class */
      if (!(this instanceof cls)) {
        Logger.warn(`${this}: script extends '${base}' but node is a '${this.class_name}'. Some APIs may be missing.`);
      }
      this._script_def = def;
      this._script_src = src;
      /* methods are installed on a per-instance object; `this` inside them is the node */
      const script = {};
      for (const key of Object.keys(def)) {
        if (key === 'extends') continue;
        if (typeof def[key] === 'function') script[key] = def[key];
      }
      this._script = script;
      /* Godot-style: script methods become callable as this.method().
         Methods starting with '_' always install (engine virtuals);
         others refuse to shadow built-ins to keep the engine working. */
      for (const key of Object.keys(script)) {
        const existing = this[key];
        if (typeof existing === 'function' && !key.startsWith('_') && !existing._from_script) {
          Logger.warn(`${this}: script method '${key}' would shadow a built-in — skipped.`);
          continue;
        }
        const fn = script[key];
        fn._from_script = true;
        this[key] = fn;
      }
      /* non-function keys become default property values */
      const proto = this.constructor.prototype;
      for (const key of Object.keys(def)) {
        if (key === 'extends' || typeof def[key] === 'function') continue;
        const cur = this[key];
        if (cur === undefined || cur === null || cur === proto[key]) this[key] = def[key];
      }
    }

    _apply_script_defaults(def) {
      for (const key of Object.keys(def)) {
        if (key === 'extends' || typeof def[key] === 'function') continue;
        if (!(key in this) || this[key] === null || this[key] === undefined) {
          /* only set defaults for values the node doesn't already have */
        }
        if (this[`_defaulted_${key}`]) continue;
      }
      /* defaults are applied in Scene builder BEFORE _ready; kept for future use */
    }

    get script_source() { return this._script_src; }
    get has_script() { return !!this._script_def; }

    /* ---------------- misc ---------------- */
    queue_free() { if (this.tree) this.tree._queue_free(this); else this._freed = true; }
    free() {
      if (this.parent) this.parent.remove_child(this);
      this._freed = true;
    }
    get is_freed() { return this._freed; }

    get class_name() { return this.constructor.def ? this.constructor.def.name : 'Node'; }
    get node_kind() { return this.constructor.def ? (this.constructor.def.kind || 'Logic') : 'Logic'; }

    toString() { return `<${this.class_name} '${this.name}'>`; }

    /** Serialize this node (and children) to plain JSON for scene files. */
    to_scene_dict(include_children = true) {
      const out = { type: this.class_name, name: this.name, props: this._serialize_props() };
      if (this._script_src) out.script = this._script_src;
      if (this._script_name) out.script_name = this._script_name;
      if (this._connections_saved && this._connections_saved.length) out.connections = this._connections_saved;
      if (include_children && this.children.length) out.children = this.children.map((c) => c.to_scene_dict());
      return out;
    }

    _serialize_props() {
      const props = {};
      const def = this.constructor.def;
      if (def && def.props) {
        for (const p of def.props) {
          const v = this._get_prop(p.path);
          if (v !== undefined) props[p.path] = v;
        }
      }
      return props;
    }

    _get_prop(path) {
      const parts = path.split('.');
      let v = this;
      for (const p of parts) {
        if (v === null || v === undefined) return undefined;
        v = v[p];
      }
      return this._prop_out(path, v);
    }

    _prop_out(path, v) {
      if (v === undefined) return undefined;
      if (v === null) return null;
      if (typeof v.to_prop === 'function') return v.to_prop();
      if (typeof v === 'number') return Math.round(v * 10000) / 10000;
      return v;
    }
  }

  /* ------------------------------------------------------------------ */
  function unique_sibling_name(parent, base) {
    let n = 2;
    while (parent.children.some((c) => c.name === `${base}${n}`)) n++;
    return `${base}${n}`;
  }
  GE._unique_sibling_name = unique_sibling_name;

  GE.Node = Node;
  GE.Classes.register(Node);
})(globalThis.GE);
