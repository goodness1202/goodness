/* ==========================================================================
   Goodness Engine — loader.js
   Synchronously loads every engine module in dependency order.
   Include this one script tag and `GE.api` is ready:

     <script src="engine/loader.js"></script>
   ========================================================================== */
(function () {
  'use strict';

  var FILES = [
    'engine/core/math.js',
    'engine/core/signal.js',
    'engine/core/logger.js',
    'engine/core/node.js',
    'engine/core/node2d.js',
    'engine/core/scene_tree.js',
    'engine/core/engine.js',
    'engine/core/renderer.js',
    'engine/core/assets.js',
    'engine/core/textures.js',
    'engine/core/scripts.js',
    'engine/core/scene.js',
    'engine/core/autoloads.js',
    'engine/core/tween.js',
    'engine/core/save.js',
    'engine/input/input.js',
    'engine/physics/physics.js',
    'engine/physics/bodies.js',
    'engine/nodes/sprites.js',
    'engine/nodes/parallax.js',
    'engine/nodes/tilemap.js',
    'engine/nodes/ui.js',
    'engine/nodes/timer.js',
    'engine/nodes/effects.js',
    'engine/nodes/animation_player.js',
    'engine/nodes/navigation.js',
    'engine/nodes/audio_node.js',
    'engine/audio/sfx.js',
    'engine/net/http.js',
    'engine/net/services.js',
    'engine/index.js',
  ];

  /* expose the manifest for tests and build tooling */
  if (typeof window !== 'undefined') window.GE_FILES = FILES;
  if (typeof globalThis !== 'undefined') globalThis.GE_FILES = FILES;

  if (typeof document !== 'undefined' && document.currentScript) {
    var base = document.currentScript.src.replace(/[^/]*$/, '');
    for (var i = 0; i < FILES.length; i++) {
      document.write('<script src="' + base + FILES[i] + '"></script>');
    }
  }
})();
