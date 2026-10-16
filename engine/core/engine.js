/* ==========================================================================
   Goodness Engine — core/engine.js
   The Engine: boots a SceneTree, drives the main loop with a fixed
   physics timestep, feeds input and renders to a canvas.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;

  class Engine {
    constructor(options = {}) {
      this.options = Object.assign({
        canvas: null,          // HTMLCanvasElement (browser)
        width: 1280,
        height: 720,
        background: '#10131f',
        headless: false,       // node/jsdom testing mode
        project: null,         // project object (see docs)
        physics: {},
      }, options);

      this.size = { w: this.options.width, h: this.options.height };
      this.canvas = this.options.canvas;
      this.ctx = null;
      if (!this.options.headless && this.canvas) {
        try {
          this.canvas.width = this.size.w;
          this.canvas.height = this.size.h;
          this.ctx = this.canvas.getContext('2d');
        } catch (e) {
          Logger.warn('Canvas 2D context unavailable — running without rendering.');
        }
      }

      this.tree = new GE.SceneTree({
        background: this.options.background,
        physics: this.options.physics,
      });
      this.tree.engine = this;
      this.tree.project = this.options.project || null;

      this.running = false;
      this.paused = false;
      this._last_time = 0;
      this._acc = 0;
      this._fps = 60;
      this._fps_frames = 0;
      this._fps_time = 0;
      this._raf_id = null;
      this._bound_frame = this._frame.bind(this);
      this._renderer = new GE.Renderer(this);
      this._destroyed = false;
    }

    /* ---------------------------------------------------------------- */
    /* Lifecycle                                                          */
    /* ---------------------------------------------------------------- */

    async start() {
      const project = this.options.project;
      if (project && project.scenes) {
        const main = project.main_scene || Object.keys(project.scenes)[0];
        if (main && project.scenes[main]) {
          const node = await GE.SceneBuilder.build(project.scenes[main], project, this.tree);
          this.tree.set_current_scene(node, main);
        } else {
          Logger.warn(`Project has no scene '${main}'.`);
        }
      }
      this.running = true;
      this._last_time = now();
      if (!this.options.headless && typeof requestAnimationFrame === 'function') {
        this._raf_id = requestAnimationFrame(this._bound_frame);
      }
      OS._register_engine(this);
      Logger.info(`Goodness Engine v${GE.VERSION} started ${this.options.headless ? '(headless)' : ''}.`);
      return this;
    }

    stop() {
      this.running = false;
      this._destroyed = true;
      if (this._raf_id !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._raf_id);
        this._raf_id = null;
      }
      OS._unregister_engine(this);
    }

    /* ---------------------------------------------------------------- */
    /* Main loop                                                          */
    /* ---------------------------------------------------------------- */

    _frame(timestamp) {
      if (!this.running || this._destroyed) return;
      const t = now();
      let delta = (t - this._last_time) / 1000;
      this._last_time = t;
      if (delta > 0.05) delta = 0.05;           /* clamp huge frame gaps */
      if (delta < 0) delta = 0;

      /* fps counter */
      this._fps_frames++; this._fps_time += delta;
      if (this._fps_time >= 0.5) { this._fps = Math.round(this._fps_frames / this._fps_time); this._fps_frames = 0; this._fps_time = 0; }

      this.step(delta);
      this.render();

      if (!this._destroyed) this._raf_id = requestAnimationFrame(this._bound_frame);
    }

    /** Advance one step (physics fixed steps + process). Used by tests too. */
    step(delta) {
      /* deliver queued input events to nodes (UI first, then _input) */
      GE.Input._dispatch(this.tree);
      GE.Input._new_frame();
      /* fixed timestep physics */
      this._acc += delta;
      const h = 1 / 60;
      let steps = 0;
      while (this._acc >= h && steps < 8) {
        if (!this.tree.paused) this.tree.physics_process(h);
        this._acc -= h;
        steps++;
      }
      this.tree.process(delta);
      GE.Input._end_frame();
    }

    render() {
      this._renderer.draw(this.tree);
    }

    /* Manually pump N frames — headless testing and step-debugging. */
    async pump(frames = 1, delta = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        this.step(delta);
        await 0; /* let microtasks (async script code) breathe */
      }
    }
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /* ------------------------------------------------------------------ */
  /* OS singleton — engine & platform info                               */
  /* ------------------------------------------------------------------ */
  const engines = new Set();
  const OS = {
    get engines() { return [...engines]; },
    get fps() { const e = [...engines][0]; return e ? e._fps : 0; },
    get frames_drawn() { const e = [...engines][0]; return e ? e.tree._frame : 0; },
    get window_size() { const e = [...engines][0]; return e ? new GE.Vector2(e.size.w, e.size.h) : new GE.Vector2(1280, 720); },
    get platform() {
      if (typeof navigator === 'undefined') return 'unknown';
      const ua = navigator.userAgent || '';
      if (/Android|iPhone|iPad|Mobile/i.test(ua)) return 'web-mobile';
      return 'web-desktop';
    },
    get ticks_msec() { return Math.floor(now()); },
    get datetime() { return new Date(); },
    get is_debug() { return true; },
    can_use_webgl: () => false,
    _register_engine(e) { engines.add(e); },
    _unregister_engine(e) { engines.delete(e); },
  };

  GE.Engine = Engine;
  GE.OS = OS;
})(globalThis.GE);
