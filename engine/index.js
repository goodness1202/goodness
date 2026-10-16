/* ==========================================================================
   Goodness Engine — index.js
   Assembles the public `Goodness` API object handed to scripts.
   ========================================================================== */
(function (GE) {
  'use strict';

  GE.VERSION = '0.2.0';
  GE.ENGINE_NAME = 'Goodness Engine';

  /* Everything a script might reach for, in one namespace. */
  GE.api = {
    VERSION: GE.VERSION,

    /* core classes */
    Engine: GE.Engine,
    SceneTree: GE.SceneTree,
    SceneBuilder: GE.SceneBuilder,
    Classes: GE.Classes,
    Node: GE.Node,
    Node2D: GE.Node2D,
    Signal: GE.Signal,
    Tween: GE.Tween,

    /* visual nodes */
    Sprite: GE.Sprite,
    AnimatedSprite: GE.AnimatedSprite,
    ColorRect: GE.ColorRect,
    Polygon2D: GE.Polygon2D,
    Camera2D: GE.Camera2D,
    CanvasLayer: GE.CanvasLayer,
    TileMap: GE.TileMap,
    YSort: GE.YSort,
    ParallaxLayer: GE.ParallaxLayer,
    ParallaxBackground: GE.ParallaxBackground,

    /* animation */
    Animation: GE.Animation,
    AnimationPlayer: GE.AnimationPlayer,

    /* navigation */
    NavigationRegion2D: GE.NavigationRegion2D,
    NavigationAgent2D: GE.NavigationAgent2D,
    RayCast2D: GE.RayCast2D,

    /* physics */
    PhysicsBody2D: GE.PhysicsBody2D,
    StaticBody2D: GE.StaticBody2D,
    RigidBody2D: GE.RigidBody2D,
    CharacterBody2D: GE.CharacterBody2D,
    Area2D: GE.Area2D,

    /* ui */
    Control: GE.Control,
    Label: GE.Label,
    Button: GE.Button,
    ProgressBar: GE.ProgressBar,
    Panel: GE.Panel,

    /* logic */
    Timer: GE.Timer,
    HTTPRequest: GE.HTTPRequest,
    AudioPlayer: GE.AudioPlayer,
    Particles2D: GE.Particles2D,

    /* singletons */
    Input: GE.Input,
    OS: GE.OS,
    API: GE.API,
    Assets: GE.Assets,
    ProceduralTextures: GE.ProceduralTextures,
    SFX: GE.SFX,
    Music: GE.Music,
    Save: GE.Save,
    Logger: GE.Logger,
    Scripts: GE.Scripts,
    Autoloads: GE.Autoloads,

    /* project-wide singletons (autoloads) by name, e.g. Goodness.Game */
    autoload(name) { return GE.Autoloads ? GE.Autoloads.get(name) : null; },

    /* value types */
    Vector2: GE.Vector2,
    Rect2: GE.Rect2,
    Color: GE.Color,

    /* math */
    math: GE.math,
    Ease: GE.Ease,
    RandomNumberGenerator: GE.RandomNumberGenerator,
    randf: GE.randf, randi: GE.randi,
    randf_range: GE.randf_range, randi_range: GE.randi_range,
    choose: GE.choose,
  };

  /* Shorthand run helpers --------------------------------------------- */
  GE.api.run = async function (options) {
    const engine = new GE.Engine(options);
    if (options.auto_start !== false) await engine.start();
    return engine;
  };

  /** Boot a project object (see docs/project-format.md) onto a canvas. */
  GE.api.boot_project = async function (project, canvas, extra = {}) {
    if (project && project.settings) {
      extra.width = extra.width || project.settings.width;
      extra.height = extra.height || project.settings.height;
      if (project.settings.background) extra.background = project.settings.background;
      extra.physics = extra.physics || {};
      if (project.settings.gravity !== undefined) extra.physics.gravity = project.settings.gravity;
    }
    extra.project = project;
    extra.canvas = canvas;
    GE.Save._set_namespace(project && project.name);
    const engine = new GE.Engine(extra);
    await engine.start();
    return engine;
  };

  if (typeof console !== 'undefined') {
    /* console banner — a little joy */
    try {
      console.log('%c⚡ Goodness Engine v' + GE.VERSION + ' %c complex inside, kind outside ',
        'background:#4fd38c;color:#10131f;font-weight:bold;padding:3px 6px;border-radius:4px 0 0 4px;',
        'background:#1d2436;color:#9fe8c5;padding:3px 6px;border-radius:0 4px 4px 0;');
    } catch (e) {}
  }
})(globalThis.GE);
