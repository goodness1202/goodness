/* ==========================================================================
   Goodness Engine — net/services.js
   Goodness ships with first-class support for three complete, free,
   no-API-key, CORS-friendly public APIs:

     API.pokemon  —  PokéAPI (https://pokeapi.co)        creatures & stats
     API.trivia   —  Open Trivia DB (https://opentdb.com) quiz questions
     API.weather  —  Open-Meteo (https://open-meteo.com)  live weather

   Everything is cached, timeout-guarded and normalized into friendly
   shapes. Games keep working offline when you add fallbacks (see the
   trivia-quest example).
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;

  /* ------------------------------------------------------------------ */
  /* Low-level helpers                                                    */
  /* ------------------------------------------------------------------ */
  const mem_cache = new Map();

  async function fetch_with_timeout(url, options = {}, timeout = 12) {
    if (typeof fetch !== 'function') throw new Error('fetch() is not available in this environment.');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = ctrl && setTimeout ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, timeout * 1000) : null;
    try {
      const res = await fetch(url, { ...options, signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error(`Request timed out after ${timeout}s.`);
      throw err;
    } finally {
      if (tid && clearTimeout) clearTimeout(tid);
    }
  }

  const http = {
    async raw(url, { method = 'GET', headers = {}, body = null, timeout = 12 } = {}) {
      const res = await fetch_with_timeout(url, {
        method, headers, body: body !== null ? JSON.stringify(body) : undefined,
      }, timeout);
      return { text: await res.text(), status: res.status };
    },
    async json(url, options = {}) {
      const { text } = await this.raw(url, options, options.timeout || 12);
      try { return JSON.parse(text); }
      catch (e) { throw new Error(`Invalid JSON from ${String(url).slice(0, 60)}…`); }
    },
    async get(url, options) { return this.json(url, { ...options, method: 'GET' }); },
    async post(url, body, options = {}) {
      return this.json(url, { ...options, method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    },
    /** cached JSON GET (memory + localStorage, TTL in seconds) */
    async cached_json(url, ttl_sec = 86400, storage_key = null) {
      const now = Math.floor(Date.now() / 1000);
      const mem = mem_cache.get(url);
      if (mem && now - mem.t < ttl_sec) return mem.data;
      if (storage_key && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(storage_key);
          if (raw) {
            const rec = JSON.parse(raw);
            if (rec.url === url && now - rec.t < ttl_sec) { mem_cache.set(url, rec); return rec.data; }
          }
        } catch (e) { /* corrupted cache — ignore */ }
      }
      const data = await this.json(url);
      mem_cache.set(url, { t: now, data });
      if (storage_key && typeof localStorage !== 'undefined') {
        try { localStorage.setItem(storage_key, JSON.stringify({ url, t: now, data })); }
        catch (e) { /* storage full — fine */ }
      }
      return data;
    },
  };

  /* ------------------------------------------------------------------ */
  /* HTML entity decode (OpenTDB returns HTML-encoded strings)            */
  /* ------------------------------------------------------------------ */
  function decode_entities(s) {
    if (typeof s !== 'string') return s;
    if (typeof document !== 'undefined' && document.createElement) {
      const el = document.createElement('textarea');
      el.innerHTML = s;
      return el.value;
    }
    /* node fallback */
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C', eacute: '\u00E9' };
    return s
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-fA-F]+);/g, (m, d) => String.fromCharCode(parseInt(d, 16)))
      .replace(/&([a-zA-Z]+);/g, (m, n) => named[n] !== undefined ? named[n] : m);
  }

  /* ==================================================================== */
  /* PokéAPI                                                              */
  /* ==================================================================== */
  const POKEMON_COUNT = 1025;
  const pokemon = {
    base: 'https://pokeapi.co/api/v2',
    doc: 'https://pokeapi.co',

    /** Get a creature by id (1..1025) or name. Returns a normalized object. */
    async get(id_or_name) {
      const key = String(id_or_name).toLowerCase();
      const data = await http.cached_json(`${this.base}/pokemon/${encodeURIComponent(key)}`, 86400, `goodness:cache:pokemon:${key}`);
      const stats = {};
      for (const s of data.stats || []) stats[s.stat.name.replace('-', '_')] = s.base_stat;
      return {
        id: data.id,
        name: String(data.name || '').replace(/(^|-)([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase()),
        types: (data.types || []).map((t) => t.type.name),
        height_m: (data.height || 0) / 10,
        weight_kg: (data.weight || 0) / 10,
        stats: {
          hp: stats.hp || 50, attack: stats.attack || 50, defense: stats.defense || 50,
          special_attack: stats.special_attack || 50, special_defense: stats.special_defense || 50,
          speed: stats.speed || 50,
        },
        sprites: {
          front: (data.sprites && data.sprites.front_default) || null,
          back: (data.sprites && data.sprites.back_default) || null,
          front_shiny: (data.sprites && data.sprites.front_shiny) || null,
        },
        moves: (data.moves || []).slice(0, 30).map((m) => m.move.name),
        raw: data,
      };
    },

    /** Random creature. */
    async random() { return this.get(GE.randi_range(1, POKEMON_COUNT)); },

    /** Load a creature sprite as a Goodness Texture (use in Sprite.set_texture). */
    async sprite(id_or_name, { back = false, shiny = false } = {}) {
      const mon = await this.get(id_or_name);
      const url = back ? (shiny ? mon.sprites.back && mon.sprites.back.replace('/shiny/', '/shiny/') : mon.sprites.back) : (shiny ? mon.sprites.front_shiny : mon.sprites.front);
      const chosen = url || mon.sprites.front || mon.sprites.back;
      if (!chosen) return null;
      return GE.Assets.load_texture(chosen);
    },

    /** Damage multiplier for attacker types vs defender types (e.g. 2, 0.5, 0). */
    async effectiveness(attacker_types, defender_types) {
      let mult = 1;
      for (const atk of attacker_types) {
        const rel = await this._type_relations(atk);
        if (!rel) continue;
        for (const def of defender_types) {
          if (rel.no_damage_to.includes(def)) mult *= 0;
          else if (rel.double_damage_to.includes(def)) mult *= 2;
          else if (rel.half_damage_to.includes(def)) mult *= 0.5;
        }
      }
      return mult;
    },

    async _type_relations(type) {
      try {
        const data = await http.cached_json(`${this.base}/type/${encodeURIComponent(type)}`, 7 * 86400, `goodness:cache:type:${type}`);
        return {
          double_damage_to: (data.damage_relations.double_damage_to || []).map((t) => t.name),
          half_damage_to: (data.damage_relations.half_damage_to || []).map((t) => t.name),
          no_damage_to: (data.damage_relations.no_damage_to || []).map((t) => t.name),
        };
      } catch (e) {
        Logger.warn(`PokéAPI type '${type}' unavailable: ${e.message}`);
        return null;
      }
    },
  };

  /* ==================================================================== */
  /* Open Trivia DB                                                       */
  /* ==================================================================== */
  const trivia = {
    base: 'https://opentdb.com/api.php',
    doc: 'https://opentdb.com',

    categories: {
      9: 'General Knowledge', 10: 'Books', 11: 'Film', 12: 'Music', 13: 'Musicals & Theatres',
      14: 'Television', 15: 'Video Games', 16: 'Board Games', 17: 'Science & Nature',
      18: 'Computers', 19: 'Mathematics', 20: 'Mythology', 21: 'Sports', 22: 'Geography',
      23: 'History', 24: 'Politics', 25: 'Art', 26: 'Celebrities', 27: 'Animals', 28: 'Vehicles',
      29: 'Comics', 30: 'Gadgets', 31: 'Anime & Manga', 32: 'Cartoons & Animation',
    },

    /** Fetch quiz questions. opts: { amount, category, difficulty: 'easy'|'medium'|'hard', type: 'multiple'|'boolean' } */
    async questions(opts = {}) {
      const { amount = 10, category = null, difficulty = null, type = null } = opts;
      const params = new URLSearchParams({ amount: String(Math.min(50, Math.max(1, amount))) });
      if (category) params.set('category', String(category));
      if (difficulty) params.set('difficulty', difficulty);
      if (type) params.set('type', type);
      const data = await http.json(`${this.base}?${params.toString()}`, {}, 12);
      if (data.response_code === 1) throw new Error('No trivia questions matched those options — try widening them.');
      if (data.response_code !== 0) throw new Error(`OpenTDB error code ${data.response_code}`);
      return (data.results || []).map((q, i) => {
        const correct = decode_entities(q.correct_answer);
        const answers = [correct, ...(q.incorrect_answers || []).map(decode_entities)];
        /* deterministic-ish shuffle */
        for (let j = answers.length - 1; j > 0; j--) {
          const r = GE.randi_range(0, j);
          [answers[j], answers[r]] = [answers[r], answers[j]];
        }
        return {
          id: i,
          question: decode_entities(q.question),
          answers,
          correct_index: answers.indexOf(correct),
          category: decode_entities(q.category),
          difficulty: q.difficulty,
          type: q.type,
        };
      });
    },
  };

  /* ==================================================================== */
  /* Open-Meteo (live weather; default = Amsterdam)                        */
  /* ==================================================================== */
  const WMO = {
    0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
    61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'],
    80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
  };

  const weather = {
    base: 'https://api.open-meteo.com/v1/forecast',
    doc: 'https://open-meteo.com',

    /** opts: { lat, lon } — defaults to Amsterdam. */
    async current({ lat = 52.3728, lon = 4.8936 } = {}) {
      const params = new URLSearchParams({
        latitude: String(lat), longitude: String(lon),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
      });
      const data = await http.cached_json(`${this.base}?${params}`, 600);
      const c = data.current || {};
      const code = c.weather_code !== undefined ? c.weather_code : 0;
      const [desc, icon] = WMO[code] || ['Unknown', '🌡️'];
      return {
        temperature_c: c.temperature_2m,
        feels_like_c: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        wind_kmh: c.wind_speed_10m,
        code,
        description: desc,
        icon,
        is_day: !!c.is_day,
        is_raining: [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code),
        is_snowing: [71, 73, 75, 77, 85, 86].includes(code),
        /* game tuning helpers */
        sky_tint: code <= 1 ? '#8ec9ff' : code <= 3 ? '#a8bfd4' : (WMO[code] && WMO[code][1] === '🌧️') ? '#5d708c' : '#93a7c4',
        raw: data,
      };
    },
  };

  /* ------------------------------------------------------------------ */
  GE.API = {
    http, pokemon, trivia, weather,
    decode_entities,
    /** clear API caches */
    clear_cache() { mem_cache.clear(); },
  };
})(globalThis.GE);
