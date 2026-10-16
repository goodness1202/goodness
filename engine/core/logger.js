/* ==========================================================================
   Goodness Engine — core/logger.js
   Central logging with levels; the editor console subscribes to this.
   ========================================================================== */
(function (GE) {
  'use strict';

  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, off: 99 };
  const listeners = [];
  let level = LEVELS.debug;

  function emit(lvl, parts) {
    if (LEVELS[lvl] < level) return;
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const ss = String(time.getSeconds()).padStart(2, '0');
    const rec = {
      level: lvl,
      text: parts.map((p) => (typeof p === 'string' ? p : safeStr(p))).join(' '),
      time: `${hh}:${mm}:${ss}`,
    };
    for (const fn of listeners) {
      try { fn(rec); } catch (e) { /* listener errors must never break the engine */ }
    }
    /* also mirror to the browser console */
    if (typeof console !== 'undefined') {
      const fn = lvl === 'error' ? console.error : (lvl === 'warn' ? console.warn : console.log);
      fn(`[Goodness ${rec.time}] ${rec.text}`);
    }
  }

  function safeStr(o) {
    if (o instanceof Error) return o.stack || o.message;
    try { return typeof o === 'object' && o !== null ? JSON.stringify(o) : String(o); }
    catch (e) { return String(o); }
  }

  GE.Logger = {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
    on_message(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    set_level(l) { level = LEVELS[l] || LEVELS.debug; },
    LEVELS,
  };
})(globalThis.GE);
