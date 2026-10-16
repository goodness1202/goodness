/* ==========================================================================
   Goodness Engine — input/input.js
   Godot-style input singleton: actions with bindings, keyboard, mouse,
   gamepad. Works in the browser and can be fed synthetic events in tests.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Vector2, Logger } = GE;

  /* event queue + state */
  const state = {
    pressed: new Set(),        // currently held codes
    just_pressed: new Set(),   // pressed since last frame end
    just_released: new Set(),
    actions: new Map(),        // action -> Set<code>
    mouse_screen: new Vector2(),
    mouse_motion: new Vector2(),
    queue: [],                 // pending events for this frame
    listeners: [],             // user callbacks: fn(event)
  };

  const DEFAULT_ACTIONS = {
    ui_left: ['ArrowLeft', 'KeyA', 'GamepadAxis0Neg'],
    ui_right: ['ArrowRight', 'KeyD', 'GamepadAxis0Pos'],
    ui_up: ['ArrowUp', 'KeyW', 'GamepadAxis1Neg'],
    ui_down: ['ArrowDown', 'KeyS', 'GamepadAxis1Pos'],
    ui_accept: ['Enter', 'Space', 'NumpadEnter', 'Gamepad0'],
    ui_cancel: ['Escape', 'Gamepad1'],
    jump: ['Space', 'KeyZ', 'Gamepad0'],
    fire: ['KeyX', 'Gamepad2'],
  };

  function reset_actions() {
    state.actions.clear();
    for (const [a, codes] of Object.entries(DEFAULT_ACTIONS)) state.actions.set(a, new Set(codes));
  }
  reset_actions();

  /* gamepad snapshot (refreshed each frame) */
  const pad = { connected: false, axes: [0, 0, 0, 0], buttons: [] };

  const Input = {
    /* -------------------------------------------------------------- */
    /* Setup                                                            */
    /* -------------------------------------------------------------- */
    _register_canvas(canvas, engine) {
      if (!canvas || canvas.__goodness_bound) return;
      canvas.__goodness_bound = true;
      this._canvas = canvas;
      this._engine = engine;

      const to_local = (e) => {
        const r = canvas.getBoundingClientRect();
        return new Vector2(
          (e.clientX - r.left) * (canvas.width / (r.width || 1)),
          (e.clientY - r.top) * (canvas.height / (r.height || 1))
        );
      };

      canvas.addEventListener('keydown', (e) => {
        if (!e.repeat) this._feed(make_key_event(e, true));
        e.preventDefault();
      });
      canvas.addEventListener('keyup', (e) => { this._feed(make_key_event(e, false)); e.preventDefault(); });
      canvas.addEventListener('mousemove', (e) => {
        const p = to_local(e);
        this._feed({ type: 'mouse_motion', position: p, relative: p.sub(state.mouse_screen) });
      });
      canvas.addEventListener('mousedown', (e) => {
        canvas.focus();
        this._feed({ type: 'mouse', button: e.button, pressed: true, position: to_local(e) });
      });
      canvas.addEventListener('mouseup', (e) => {
        this._feed({ type: 'mouse', button: e.button, pressed: false, position: to_local(e) });
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      /* make the canvas focusable so it receives keyboard events */
      if (canvas.tabIndex < 0) canvas.tabIndex = 0;
      canvas.style.outline = 'none';
    },

    /* Synthetic event entry point (used by tests and the editor). */
    _feed(ev) {
      if (ev.type === 'key') {
        if (ev.pressed) {
          if (!state.pressed.has(ev.code)) {
            state.pressed.add(ev.code);
            state.just_pressed.add(ev.code);
          }
        } else {
          state.pressed.delete(ev.code);
          state.just_released.add(ev.code);
        }
      } else if (ev.type === 'mouse') {
        const code = `Mouse${ev.button === 0 ? 'Left' : ev.button === 1 ? 'Middle' : 'Right'}`;
        state.mouse_screen = ev.position ? ev.position.copy() : state.mouse_screen;
        if (ev.pressed) { state.pressed.add(code); state.just_pressed.add(code); }
        else { state.pressed.delete(code); state.just_released.add(code); }
      } else if (ev.type === 'mouse_motion') {
        state.mouse_screen = ev.position.copy();
        state.mouse_motion = ev.relative ? ev.relative.copy() : new Vector2();
      }
      ev.action_hint = null;
      state.queue.push(ev);
      return ev;
    },

    /* Flush queued events into the tree — called by Engine.step. */
    _dispatch(tree) {
      this._poll_gamepad();
      if (!tree) return;
      const q = state.queue.splice(0);
      for (const ev of q) {
        ev.actions = this.actions_for_event(ev);
        tree.handle_input(ev);
        for (const fn of state.listeners) {
          try { fn(ev); } catch (e) { Logger.error(`Input listener error: ${e.message}`); }
        }
      }
    },

    _new_frame() { state.mouse_motion = new Vector2(); },
    _end_frame() { state.just_pressed.clear(); state.just_released.clear(); },

    /* -------------------------------------------------------------- */
    /* Actions                                                          */
    /* -------------------------------------------------------------- */
    map_action(action, codes) {
      if (!Array.isArray(codes)) codes = [codes];
      state.actions.set(action, new Set(codes));
    },
    add_action(action, codes) {
      if (!state.actions.has(action)) state.actions.set(action, new Set());
      for (const c of (Array.isArray(codes) ? codes : [codes])) state.actions.get(action).add(c);
    },
    get_actions() { return [...state.actions.keys()]; },
    get_action_codes(action) { return [...(state.actions.get(action) || [])]; },

    actions_for_event(ev) {
      const out = [];
      if (ev.type === 'key') {
        for (const [a, codes] of state.actions) if (codes.has(ev.code)) out.push(a);
      } else if (ev.type === 'mouse') {
        const code = `Mouse${ev.button === 0 ? 'Left' : ev.button === 1 ? 'Middle' : 'Right'}`;
        for (const [a, codes] of state.actions) if (codes.has(code)) out.push(a);
      }
      return out;
    },

    /* -------------------------------------------------------------- */
    /* Queries                                                          */
    /* -------------------------------------------------------------- */
    is_action_pressed(action) { return this._codes_for(action).some((c) => state.pressed.has(c)); },
    is_action_just_pressed(action) { return this._codes_for(action).some((c) => state.just_pressed.has(c)); },
    is_action_just_released(action) { return this._codes_for(action).some((c) => state.just_released.has(c)); },
    is_key_pressed(code) { return state.pressed.has(code); },

    get_axis(negative, positive) {
      return (this.is_action_pressed(positive) ? 1 : 0) - (this.is_action_pressed(negative) ? 1 : 0);
    },
    get_vector(left, right, up, down) {
      const v = new Vector2(
        (this.is_action_pressed(right) ? 1 : 0) - (this.is_action_pressed(left) ? 1 : 0),
        (this.is_action_pressed(down) ? 1 : 0) - (this.is_action_pressed(up) ? 1 : 0)
      );
      if (pad.connected && v.length === 0) {
        const gx = pad.axes[0] || 0, gy = pad.axes[1] || 0;
        if (Math.abs(gx) > 0.2 || Math.abs(gy) > 0.2) return new Vector2(gx, gy).limit_length(1);
      }
      return v.length > 1 ? v.normalized : v;
    },

    get mouse_position() { return state.mouse_screen.copy(); },
    get mouse_relative() { return state.mouse_motion.copy(); },
    get gamepad_connected() { return pad.connected; },
    get gamepad_axes() { return pad.axes.slice(0, 4); },

    /* World-space mouse position for a tree (accounts for camera). */
    get_world_mouse(tree) {
      const p = state.mouse_screen.copy();
      if (!tree) return p;
      const cam = tree.active_camera;
      const { w, h } = (tree.engine ? tree.engine.size : { w: 1280, h: 720 });
      if (!cam) return p;
      const c = cam.get_viewport_center(w, h);
      /* screen -> world: undo translate(w/2), scale(zoom), translate(-cam) */
      return p.sub(new Vector2(w / 2, h / 2)).div(cam.zoom).add(c);
    },

    on_event(fn) { state.listeners.push(fn); return () => { const i = state.listeners.indexOf(fn); if (i >= 0) state.listeners.splice(i, 1); }; },

    _reset() { state.pressed.clear(); state.just_pressed.clear(); state.just_released.clear(); state.queue.length = 0; },

    _codes_for(action) {
      const s = state.actions.get(action);
      if (!s) return [];
      const codes = [...s];
      /* gamepad virtual codes */
      if (pad.connected) {
        if (s.has('GamepadAxis0Pos') && (pad.axes[0] || 0) > 0.4) codes.push('GamepadAxis0Pos');
        if (s.has('GamepadAxis0Neg') && (pad.axes[0] || 0) < -0.4) codes.push('GamepadAxis0Neg');
        if (s.has('GamepadAxis1Pos') && (pad.axes[1] || 0) > 0.4) codes.push('GamepadAxis1Pos');
        if (s.has('GamepadAxis1Neg') && (pad.axes[1] || 0) < -0.4) codes.push('GamepadAxis1Neg');
        pad.buttons.forEach((b, i) => {
          if (b && b.pressed && s.has(`Gamepad${i}`)) codes.push(`Gamepad${i}`);
        });
      }
      return codes;
    },

    _poll_gamepad() {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      try {
        const pads = navigator.getGamepads();
        const gp = pads && [...pads].find((p) => p && p.connected);
        if (gp) {
          pad.connected = true;
          pad.axes = gp.axes.map((a) => a || 0);
          pad.buttons = gp.buttons.map((b) => ({ pressed: b.pressed }));
        } else pad.connected = false;
      } catch (e) { pad.connected = false; }
    },
  };

  function make_key_event(e, pressed) {
    return {
      type: 'key',
      code: e.code,
      key: e.key,
      pressed,
      echo: e.repeat,
      shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey,
      get pressed_string() { return this.key; },
    };
  }

  GE.Input = Input;
})(globalThis.GE);
