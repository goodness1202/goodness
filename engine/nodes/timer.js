/* ==========================================================================
   Goodness Engine — nodes/timer.js
   Timer node: countdown with a timeout signal.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node } = GE;

  class Timer extends Node {
    constructor() {
      super();
      this.wait_time = 1;
      this.one_shot = true;
      this.autostart = false;
      this.time_left = 0;
      this.process_always = false;   // keep ticking while the tree is paused
      this._running = false;
      this.add_signal('timeout');
    }

    static def = {
      name: 'Timer', icon: '⏱️', kind: 'Logic', base: 'Node',
      desc: 'Calls its "timeout" signal after wait_time seconds. One-shot or looping.',
      props: [
        { path: 'wait_time', type: 'number', min: 0.01, step: 0.1, doc: 'Seconds per cycle.' },
        { path: 'one_shot', type: 'bool', doc: 'Fire once (true) or loop (false).' },
        { path: 'autostart', type: 'bool', doc: 'Start automatically.' },
        { path: 'process_always', type: 'bool', doc: 'Keep running while paused.' },
      ],
      methods: [
        { sig: 'start(time)', desc: 'Start (optionally with a new wait_time).' },
        { sig: 'stop()', desc: 'Stop and reset.' },
      ],
    };

    _ready() { if (this.autostart) this.start(); }

    start(time = null) {
      if (time !== null) this.wait_time = time;
      this.time_left = this.wait_time;
      this._running = true;
    }
    stop() { this._running = false; this.time_left = 0; }
    pause() { this._running = false; }
    resume() { this._running = this.time_left > 0; }
    get is_stopped() { return !this._running; }

    _process(delta) {
      if (!this._running) return;
      if (this.tree && this.tree.paused && !this.process_always) return;
      this.time_left -= delta;
      while (this.time_left <= 0) {
        if (this.one_shot) {
          this.time_left = 0;
          this._running = false;
          this.signals.timeout.emit();
          this._call_script_or_method('_on_timeout');
          return;
        }
        this.time_left += this.wait_time;
        this.signals.timeout.emit();
        this._call_script_or_method('_on_timeout');
      }
    }
  }

  GE.Classes.register(Timer);
  GE.Timer = Timer;
})(globalThis.GE);
