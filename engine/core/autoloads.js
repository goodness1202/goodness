/* ==========================================================================
   Goodness Engine — core/autoloads.js
   Project-wide singletons ("autoloads" in Godot): one instance of a node
   that every scene can reach. Perfect for score, settings, music, save
   state — anything that must survive a scene change.

   Declare them in the project file:

     {
       "autoloads": {
         "Score": { "script": "{ extends: 'Node', points: 0, add(n){ this.points += n; } }" },
         "Music": { "type": "AudioPlayer", "props": { ... } }
       }
     }

   …then use them anywhere, from any script or node:

     Autoloads.Score.add(10);          // injected into every script
     this.get_node('/root/Score')      // …or as a plain node path
     Goodness.autoload('Score')        // …or through the API object
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;

  const registry = new Map();
  let booted_project = null;

  const Autoloads = {
    /** Fetch an autoload node by name. */
    get(name) { return registry.get(name) || null; },
    has(name) { return registry.has(name); },
    /** Every autoload node, in declaration order. */
    all() { return [...registry.values()]; },
    names() { return [...registry.keys()]; },
    get size() { return registry.size; },

    /** Instantiate the project's autoloads under the tree root. */
    async boot(project, tree) {
      this.clear(tree);
      booted_project = project;
      const defs = (project && project.autoloads) || {};
      const names = Object.keys(defs);
      if (!names.length) return this;
      for (const name of names) {
        const def = defs[name] || {};
        let node = null;
        try {
          /* a whole scene as an autoload */
          if (def.scene && project.scenes && project.scenes[def.scene]) {
            node = await GE.SceneBuilder.build(project.scenes[def.scene], project, tree);
          }
          if (!node) {
            const cls = GE.Classes.get(def.type || 'Node') || GE.Node;
            node = new cls();
          }
          node.name = name;
          if (def.props) GE.SceneBuilder._apply_props(node, def.props, project);
          if (def.script) {
            node._script_name = def.script_name || `autoload:${name}`;
            GE.Scripts.attach_source(node, def.script);
          }
          tree.root.add_child(node);
          if (typeof node._enter_tree_internal === 'function') node._enter_tree_internal();
          registry.set(name, node);
          /* expose as a property: Autoloads.Score */
          this[name] = node;
        } catch (e) {
          Logger.error(`Autoload '${name}' failed: ${e.message}`);
        }
      }
      Logger.info(`Autoloads ready: ${this.names().join(', ')}.`);
      return this;
    },

    /** Remove every autoload (called when the engine stops / restarts). */
    clear(tree = null) {
      for (const [name, node] of registry) {
        try {
          if (node.parent) node.parent.remove_child(node);
          if (tree) tree._free_subtree(node);
          node._freed = true;
        } catch (e) { /* already gone */ }
        delete this[name];
      }
      registry.clear();
      booted_project = null;
    },

    get project() { return booted_project; },
  };

  GE.Autoloads = Autoloads;
})(globalThis.GE);
