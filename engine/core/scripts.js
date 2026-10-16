/* ==========================================================================
   Goodness Engine — core/scripts.js
   The script system. Scripts are plain JavaScript object literals:

     {
       extends: 'Sprite',          // which node class this script extends
       speed: 220,                 // default instance properties
       _ready() { ... },           // lifecycle: once, when entering the tree
       _process(delta) { ... },    // lifecycle: every frame
       _physics_process(delta) {}, // lifecycle: every physics tick (60 Hz)
       _input(event) {},           // lifecycle: on every input event
       _exit_tree() {},            // lifecycle: when removed from the tree
     }

   Methods run with `this` bound to the node, and common engine helpers
   (Input, OS, API, Assets, SFX, Music, Save, Vector2, lerp, ...) are
   available as bare names.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;

  /** Names injected into every script's scope. */
  function script_env() {
    return {
      Goodness: GE.api,
      Input: GE.Input,
      OS: GE.OS,
      API: GE.API,
      Assets: GE.Assets,
      SFX: GE.SFX,
      Music: GE.Music,
      Save: GE.Save,
      Autoloads: GE.Autoloads,
      Physics: null, // per-tree; patched at attach time via closure param
      Vector2: GE.Vector2,
      Color: GE.Color,
      Rect2: GE.Rect2,
      lerp: GE.math.lerp,
      clamp: GE.math.clamp,
      lerp_angle: GE.math.lerp_angle,
      remap: GE.math.remap,
      smoothstep: GE.math.smoothstep,
      deg2rad: GE.math.deg2rad,
      rad2deg: GE.math.rad2deg,
      randf: GE.randf,
      randi: GE.randi,
      randf_range: GE.randf_range,
      randi_range: GE.randi_range,
      choose: GE.choose,
    };
  }

  const Scripts = {
    /** Compile script source into a definition object.
     *  Returns { def, error } — def is null on failure. */
    compile(src) {
      if (!src || typeof src !== 'string') return { def: null, error: 'Empty script.' };
      try {
        const env = script_env();
        const names = Object.keys(env);
        const fn = new Function(...names, `"use strict";\nreturn (\n${src}\n);`);
        const def = fn(...names.map((n) => env[n]));
        if (!def || typeof def !== 'object' || Array.isArray(def)) {
          return { def: null, error: 'A script must be an object literal like { extends: "Sprite", _ready() {} }.' };
        }
        return { def, error: null };
      } catch (err) {
        return { def: null, error: describe_error(err) };
      }
    },

    /** Attach script source to a node (compiles + applies defaults). */
    attach_source(node, src) {
      const { def, error } = this.compile(src);
      if (error) { Logger.error(`Script error on ${node}: ${error}`); return false; }
      node.attach_script(def, src);
      return true;
    },
  };

  function describe_error(err) {
    const msg = err && err.message ? err.message : String(err);
    return `${msg}`;
  }

  GE.Scripts = Scripts;
})(globalThis.GE);
