/* ==========================================================================
   Goodness Engine — core/save.js
   Persistent data: high scores, settings, save games — per project,
   stored in localStorage with JSON safety nets.

     Save.set('highscore', 1200);
     Save.get('highscore', 0);
     Save.save_game({ level: 3, x: 100 }, 'slot1');
     Save.load_game('slot1');
   ========================================================================== */
(function (GE) {
  'use strict';

  let namespace = 'goodness:default';

  function storage() {
    /* jsdom / node may lack localStorage — degrade to memory */
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      get length() { return mem.size; },
      key: (i) => [...mem.keys()][i],
    };
  }

  const store = storage();

  function key(k) { return `${namespace}:${k}`; }

  const Save = {
    /** Called by the engine when a project loads. */
    _set_namespace(name) { namespace = `goodness:${String(name || 'default').replace(/[^a-z0-9_-]+/gi, '_')}`; },
    get namespace() { return namespace; },

    set(k, v) {
      try { store.setItem(key(k), JSON.stringify(v)); return true; }
      catch (e) { GE.Logger.warn(`Save.set('${k}') failed: ${e.message}`); return false; }
    },
    get(k, default_value = null) {
      try {
        const raw = store.getItem(key(k));
        if (raw === null) return default_value;
        return JSON.parse(raw);
      } catch (e) { return default_value; }
    },
    has(k) { return store.getItem(key(k)) !== null; },
    erase(k) { store.removeItem(key(k)); },
    keys() {
      const out = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(namespace + ':')) out.push(k.slice(namespace.length + 1));
      }
      return out;
    },

    /* named save-game slots */
    save_game(data, slot = 'slot1') { return this.set(`game:${slot}`, { data, saved_at: Date.now() }); },
    load_game(slot = 'slot1') { const rec = this.get(`game:${slot}`); return rec ? rec.data : null; },
    list_slots() { return this.keys().filter((k) => k.startsWith('game:')).map((k) => k.slice(5)); },
  };

  GE.Save = Save;
})(globalThis.GE);
