/* ==========================================================================
   Goodness Engine — core/assets.js
   Asset loading: built-in procedural textures, project images, remote
  URLs and data URLs — with caching and CORS fallbacks.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;

  const _tex_cache = new Map();   // src -> Texture
  const _pending = new Map();

  class Texture {
    constructor(img, w, h, src) {
      this.image = img;           // CanvasImageSource (or null in headless)
      this.width = w;
      this.height = h;
      this.src = src;
    }
    get size() { return new GE.Vector2(this.width, this.height); }
    to_prop() { return this.src; }
  }

  const Assets = {
    Texture,
    get cache() { return _tex_cache; },

    /** Load a texture. Accepts:
     *   'goodness://circle'         — built-in procedural art
     *   'name'                      — project image key
     *   'https://…' or 'data:…'     — external/inline image
     */
    async load_texture(src, project = null) {
      if (!src) return null;
      if (typeof src !== 'string') {
        if (src instanceof Texture) return src;
        return null;
      }
      const key = src;
      if (_tex_cache.has(key)) return _tex_cache.get(key);
      if (_pending.has(key)) return _pending.get(key);

      const p = (async () => {
        let tex = null;
        /* 1. built-in procedural texture */
        if (src.startsWith('goodness://')) {
          tex = GE.ProceduralTextures.create(src.slice('goodness://'.length));
          if (!tex) Logger.warn(`No built-in texture '${src}'.`);
        } else if (project && project.assets && project.assets.images && project.assets.images[src]) {
          /* 2. project image */
          const entry = project.assets.images[src];
          const url = typeof entry === 'string' ? entry : entry.src;
          tex = await this._load_image_url(url, key);
        } else if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
          /* 3. direct URL */
          tex = await this._load_image_url(src, key);
        } else {
          Logger.warn(`Texture '${src}' not found (not built-in, not in project, not a URL).`);
        }
        if (tex) _tex_cache.set(key, tex);
        return tex;
      })();
      _pending.set(key, p);
      const result = await p;
      _pending.delete(key);
      return result;
    },

    _load_image_url(url, key) {
      return new Promise((resolve) => {
        if (typeof Image === 'undefined') {
          /* headless: fabricate a placeholder so games still run */
          resolve(new Texture(null, 64, 64, key || url));
          return;
        }
        const attempt = (cors) => {
          const img = new Image();
          if (cors) img.crossOrigin = 'anonymous';
          let settled = false;
          const done = (ok) => {
            if (settled) return;
            settled = true;
            if (ok) resolve(new Texture(img, img.naturalWidth || img.width, img.naturalHeight || img.height, key || url));
            else if (cors) attempt(false); /* retry without CORS (canvas may taint, drawing still works) */
            else { Logger.warn(`Failed to load image '${url}'.`); resolve(null); }
          };
          img.onload = () => done(true);
          img.onerror = () => done(false);
          img.src = url;
          /* 20s timeout guard */
          if (typeof setTimeout === 'function') setTimeout(() => done(false), 20000);
        };
        attempt(url.startsWith('data:') === false);
      });
    },

    /** Preload many textures at once. */
    async preload(sources, project = null) {
      const list = await Promise.all(sources.map((s) => this.load_texture(s, project)));
      return list.filter(Boolean);
    },

    /** List built-in texture names (for editors). */
    builtin_names() { return GE.ProceduralTextures.names(); },

    /** Fetch JSON (used by SceneBuilder / services). */
    async load_json(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
      return res.json();
    },
  };

  GE.Assets = Assets;
})(globalThis.GE);
