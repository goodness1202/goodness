/* ==========================================================================
   Goodness Engine — core/signal.js
   Godot-style signals: observable events with safe, ordered dispatch.
   ========================================================================== */
(function (GE) {
  'use strict';

  let _id = 0;

  class Signal {
    constructor(name = '', owner = null) {
      this.name = name;
      this.owner = owner;
      this._connections = []; // { id, callable, target, method_name, once, flags }
      this._emitting = false;
    }

    /** Connect a callback. Godot signature sugar:
     *  sig.connect(node, 'method')   — calls node.method(owner_args...)
     *  sig.connect(fn)               — calls fn(owner_args...)
     */
    connect(target, method) {
      const conn = (typeof target === 'function')
        ? { id: ++_id, callable: target, target: null, method_name: null, once: false }
        : { id: ++_id, callable: null, target, method_name: method, once: false };
      this._connections.push(conn);
      return conn.id;
    }

    connect_once(target, method) {
      const id = this.connect(target, method);
      const c = this._connections.find((c) => c.id === id);
      if (c) c.once = true;
      return id;
    }

    disconnect(target, method) {
      this._connections = this._connections.filter((c) => {
        if (c.callable) return c.callable !== target;
        return !(c.target === target && c.method_name === method);
      });
    }

    get connections() { return this._connections.slice(); }

    emit(...args) {
      if (this._emitting) return; // prevent re-entrancy loops
      this._emitting = true;
      const list = this._connections.slice();
      const dead = [];
      for (const c of list) {
        try {
          if (c.callable) c.callable(...args);
          else if (c.target && typeof c.target[c.method_name] === 'function') c.target[c.method_name](...args);
          /* script methods (attached via attach_script) */
          else if (c.target && c.target._script && typeof c.target._script[c.method_name] === 'function') {
            c.target._script[c.method_name].call(c.target, ...args);
          }
        } catch (err) {
          GE.Logger && GE.Logger.error(`Signal error in '${this.name}' -> ${c.method_name || 'callable'}: ${err.message}`);
        }
        if (c.once) dead.push(c.id);
      }
      if (dead.length) this._connections = this._connections.filter((c) => !dead.includes(c.id));
      this._emitting = false;
    }
  }

  GE.Signal = Signal;
})(globalThis.GE);
