/* ==========================================================================
   Goodness Engine — net/services.js
   Goodness ships with first-class support for five complete, free,
   no-API-key, CORS-friendly public APIs:

     API.pokemon  —  PokéAPI (https://pokeapi.co)             creatures & stats
     API.trivia   —  Open Trivia DB (https://opentdb.com)     quiz questions
     API.weather  —  Open-Meteo (https://open-meteo.com)      live weather
     API.art      —  Art Institute of Chicago (artic.edu)     artworks + images
     API.words    —  Datamuse (datamuse.com)                  rhymes & meanings

   Everything is cached, timeout-guarded and normalized into friendly
   shapes. Every wrapper ships an offline fallback so games keep working
   without a network (see the trivia-quest, art-gallery and word-duel
   examples).
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

    /** Built-in question bank — quizzes keep working with no network at all.
     *  Same shape as questions(), so it is a drop-in fallback:
     *
     *    let qs;
     *    try { qs = await API.trivia.questions({ amount: 5 }); }
     *    catch (e) { qs = API.trivia.offline_questions(5); }
     */
    offline_questions(amount = 8) {
      const bank = [
        ['Which of these is a 2D game engine that runs in a web browser?', ['Goodness Engine', 'Blender', 'Audacity', 'Photoshop'], 0, 'Computers', 'easy'],
        ['In a Godot-style node tree, what does a child node inherit from its parent?', ['Its transform', 'Its name', 'Its script', 'Its signals'], 0, 'Computers', 'medium'],
        ['What file format is a Goodness project saved in?', ['JSON', 'PNG', 'ZIP', 'EXE'], 0, 'Computers', 'easy'],
        ['Which data structure does A* pathfinding expand next?', ['The lowest cost estimate', 'The first added', 'The largest node', 'A random node'], 0, 'Computers', 'medium'],
        ['What does a RayCast2D report?', ['What a line hits', 'The mouse position', 'The camera zoom', 'The sound volume'], 0, 'Computers', 'easy'],
        ['How many degrees are in a full rotation?', ['360', '100', '180', '270'], 0, 'Mathematics', 'easy'],
        ['Which number is prime?', ['17', '21', '27', '33'], 0, 'Mathematics', 'easy'],
        ['What is the time complexity of binary search?', ['O(log n)', 'O(n)', 'O(n²)', 'O(1)'], 0, 'Mathematics', 'medium'],
        ['Which planet is known as the Red Planet?', ['Mars', 'Venus', 'Jupiter', 'Mercury'], 0, 'Science & Nature', 'easy'],
        ['What gas do plants absorb from the air?', ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'], 0, 'Science & Nature', 'easy'],
        ['Which animal is the tallest living land animal?', ['Giraffe', 'Elephant', 'Camel', 'Horse'], 0, 'Animals', 'easy'],
        ['What is the largest ocean on Earth?', ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], 0, 'Geography', 'easy'],
        ['Which city hosted the 2012 Summer Olympics?', ['London', 'Paris', 'Tokyo', 'Rio de Janeiro'], 0, 'Sports', 'easy'],
        ['Who painted the Mona Lisa?', ['Leonardo da Vinci', 'Michelangelo', 'Vincent van Gogh', 'Claude Monet'], 0, 'Art', 'easy'],
      ];
      const pool = bank.slice();
      for (let j = pool.length - 1; j > 0; j--) {          // shuffle the bank
        const r = GE.randi_range(0, j);
        [pool[j], pool[r]] = [pool[r], pool[j]];
      }
      return pool.slice(0, Math.min(amount, pool.length)).map(([question, choices, right_ix, category, difficulty], i) => {
        const answers = choices.slice();
        for (let j = answers.length - 1; j > 0; j--) {      // shuffle the answers
          const r = GE.randi_range(0, j);
          [answers[j], answers[r]] = [answers[r], answers[j]];
        }
        return {
          id: i,
          question,
          answers,
          correct_index: answers.indexOf(choices[right_ix]),
          category,
          difficulty,
          type: 'multiple',
          offline: true,
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

  /* ==================================================================== */
  /* Art Institute of Chicago — 120,000+ public-domain artworks            */
  /* (https://api.artic.edu/docs — free, no key, CORS-friendly, images)    */
  /* ==================================================================== */
  const ART_FIELDS = [
    'id', 'title', 'image_id', 'artist_title', 'artist_display', 'date_display',
    'medium_display', 'dimensions', 'is_public_domain', 'department_title',
    'place_of_origin', 'thumbnail', 'color',
  ].join(',');

  const art = {
    base: 'https://api.artic.edu/api/v1',
    iiif: 'https://www.artic.edu/iiif/2',
    doc: 'https://api.artic.edu/docs',

    /** IIIF image URL for an artwork's image_id. width 400 = thumbnail. */
    image_url(image_id, width = 843) {
      if (!image_id) return null;
      return `${this.iiif}/${image_id}/full/${width},/0/default.jpg`;
    },

    _normalize(d, config) {
      if (!d) return null;
      const iiif = (config && config.iiif_url) || this.iiif;
      return {
        id: d.id,
        title: d.title || 'Untitled',
        artist: d.artist_title || 'Unknown artist',
        artist_display: d.artist_display || '',
        date: d.date_display || '',
        medium: d.medium_display || '',
        dimensions: d.dimensions || '',
        department: d.department_title || '',
        origin: d.place_of_origin || '',
        is_public_domain: d.is_public_domain !== false,
        image_id: d.image_id || null,
        color: (d.color && (d.color.h) !== undefined) ? d.color : null,
        image_url: d.image_id ? `${iiif}/${d.image_id}/full/843,/0/default.jpg` : null,
        thumbnail_url: d.image_id ? `${iiif}/${d.image_id}/full/400,/0/default.jpg` : null,
        raw: d,
      };
    },

    /** Search the collection. opts: { limit, page, fields, public_domain } */
    async search(query, opts = {}) {
      const { limit = 12, page = 1, public_domain = false } = opts;
      const params = new URLSearchParams({
        q: query || 'painting',
        limit: String(Math.min(100, Math.max(1, limit))),
        page: String(Math.max(1, page)),
        fields: opts.fields || ART_FIELDS,
      });
      const data = await http.cached_json(`${this.base}/artworks/search?${params}`, 6 * 3600);
      const config = data.config || {};
      let items = (data.data || []).map((d) => this._normalize(d, config)).filter(Boolean);
      if (opts.with_images !== false) {
        const with_img = items.filter((a) => a.image_url);
        if (with_img.length) items = with_img;
      }
      if (public_domain) items = items.filter((a) => a.is_public_domain);
      return items;
    },

    /** One artwork by id. */
    async get(id) {
      const data = await http.cached_json(`${this.base}/artworks/${encodeURIComponent(id)}?fields=${ART_FIELDS}`, 24 * 3600, `goodness:cache:art:${id}`);
      return this._normalize(data.data, data.config);
    },

    /** A random artwork from the public collection. */
    async random({ query = 'painting', page = null } = {}) {
      const p = page || GE.randi_range(1, 400);
      const items = await this.search(query, { limit: 12, page: p });
      if (!items.length) return null;
      return GE.choose(items);
    },

    /** Many artworks at once (a "deck"): great for galleries and card games. */
    async collection(count = 8, opts = {}) {
      const seen = new Map();
      let guard = 0;
      while (seen.size < count && guard++ < 6) {
        const items = await this.search(opts.query || 'painting', { limit: Math.min(50, count * 3), page: GE.randi_range(1, 250) });
        for (const it of items) seen.set(it.id, it);
      }
      const list = [...seen.values()];
      for (let i = list.length - 1; i > 0; i--) {
        const j = GE.randi_range(0, i);
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list.slice(0, count);
    },

    /** Load an artwork as a ready-to-draw Goodness Texture. */
    async texture(id_or_artwork, { width = 843 } = {}) {
      const a = typeof id_or_artwork === 'object' ? id_or_artwork : await this.get(id_or_artwork);
      if (!a || !a.image_id) return null;
      return GE.Assets.load_texture(this.image_url(a.image_id, width));
    },

    /** Fallback art so galleries keep working offline (procedural, no network). */
    offline_deck(count = 8) {
      const shapes = GE.ProceduralTextures.names().filter((n) => !['bullet', 'laser'].includes(n));
      const titles = ['Study in Blue', 'Golden Hour', 'Silent Forms', 'Field Notes', 'Red Composition',
        'Two Figures', 'Still Life', 'After the Rain', 'Night Window', 'Paper Garden'];
      const out = [];
      for (let i = 0; i < count; i++) {
        const name = shapes[(i * 7 + 3) % shapes.length];
        out.push({
          id: -1 - i,
          title: titles[i % titles.length] + ' #' + (i + 1),
          artist: 'Procedural Collective',
          image_url: `goodness://${name}`,
          thumbnail_url: `goodness://${name}`,
          is_public_domain: true,
          offline: true,
        });
      }
      return out;
    },
  };

  /* ==================================================================== */
  /* Datamuse — the word engine (https://www.datamuse.com/api/)            */
  /* free, no key, CORS-friendly: rhymes, synonyms, meanings, syllables    */
  /* ==================================================================== */
  const words = {
    base: 'https://api.datamuse.com',
    doc: 'https://www.datamuse.com/api/',

    _query(params, ttl = 24 * 3600) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        qs.set(k, String(v));
      }
      return qs.toString();
    },

    /** Raw endpoint to anything Datamuse supports (ml, rel_rhy, sp, …). */
    async query(params, { ttl = 24 * 3600, endpoint = 'words' } = {}) {
      const qs = this._query(params);
      const data = await http.cached_json(`${this.base}/${endpoint}?${qs}`, ttl);
      return Array.isArray(data) ? data : [];
    },

    /** Clean up Datamuse's word list into {word, score, syllables, tags}. */
    _normalize(list, limit) {
      return (list || []).slice(0, limit).map((w) => ({
        word: w.word,
        score: w.score || 0,
        syllables: w.numSyllables !== undefined ? w.numSyllables : null,
        tags: w.tags || [],
        defs: (w.defs || []).map((d) => {
          const [pos, text] = String(d).split('\t');
          return { part_of_speech: pos, text: text || pos };
        }),
      }));
    },

    /** Words with a similar meaning ("means like"). */
    async like(phrase, n = 20) { return this._normalize(await this.query({ ml: phrase, max: n }), n); },
    /** Synonyms. */
    async synonyms(word, n = 20) { return this._normalize(await this.query({ rel_syn: word, max: n }), n); },
    /** Rhymes — the classic word-game engine. */
    async rhymes(word, n = 20) { return this._normalize(await this.query({ rel_rhy: word, max: n }), n); },
    /** Near rhymes (imperfect — wider net). */
    async near_rhymes(word, n = 20) { return this._normalize(await this.query({ rel_nry: word, max: n }), n); },
    /** Antonyms. */
    async antonyms(word, n = 20) { return this._normalize(await this.query({ rel_ant: word, max: n }), n); },
    /** Words that sound like this one. */
    async sounds_like(word, n = 20) { return this._normalize(await this.query({ sl: word, max: n }), n); },
    /** Words spelled like this pattern ("c*t" → cat, cot…). */
    async spelled_like(pattern, n = 20) { return this._normalize(await this.query({ sp: pattern, max: n }), n); },
    /** Autocomplete / prefix suggestions. */
    async suggest(prefix, n = 10) {
      const list = await this.query({ s: prefix, max: n }, { endpoint: 'sug', ttl: 7 * 86400 });
      return list.slice(0, n).map((w) => w.word);
    },
    /** Definition + part of speech + syllables of a word. */
    async describe(word) {
      const list = await this.query({ sp: word, md: 'dpsf', max: 3, ipa: 0 }, { ttl: 7 * 86400 });
      const exact = list.find((w) => w.word.toLowerCase() === String(word).toLowerCase()) || list[0];
      if (!exact) return null;
      const defs = (exact.defs || []).map((d) => {
        const [pos, text] = String(d).split('\t');
        return { part_of_speech: pos, text: text || pos };
      });
      return {
        word: exact.word,
        syllables: exact.numSyllables !== undefined ? exact.numSyllables : null,
        tags: exact.tags || [],
        defs,
        definition: defs.length ? defs[0].text : '',
        part_of_speech: defs.length ? defs[0].part_of_speech : '',
      };
    },
    /** A random real word (with optional syllable cap). */
    async random({ max_syllables = 3, min_length = 3 } = {}) {
      const letters = 'abcdefghijklmnoprstuw';
      for (let tries = 0; tries < 6; tries++) {
        const prefix = letters[GE.randi_range(0, letters.length - 1)] + letters[GE.randi_range(0, letters.length - 1)];
        const list = await this.suggest(prefix, 40);
        const pool = list.filter((w) => w.length >= min_length && !w.includes(' ') && (max_syllables ? count_syllables(w) <= max_syllables : true));
        if (pool.length) return GE.choose(pool);
      }
      return null;
    },
    /** Word puzzles: how many words mean the same thing as `word`? */
    async puzzle(word = null) {
      const target = word || await this.random({ max_syllables: 2 });
      if (!target) throw new Error('Could not find a word to puzzle with.');
      const alike = await this.like(target, 40);
      const answers = alike.filter((w) => w.word.length > 2 && !w.word.includes(' '));
      if (answers.length < 4) throw new Error(`Not enough related words for “${target}”.`);
      const pick = answers.slice(0, 24);
      return { word: target, answers: pick };
    },
    /** Offline stand-in so word games never hard-fail. */
    offline_puzzle() {
      const rounds = [
        { word: 'happy', answers: ['glad', 'cheerful', 'joyful', 'content', 'merry', 'pleased', 'elated', 'sunny'] },
        { word: 'fast', answers: ['quick', 'swift', 'rapid', 'speedy', 'brisk', 'hasty', 'fleet', 'snappy'] },
        { word: 'brave', answers: ['bold', 'fearless', 'valiant', 'heroic', 'gutsy', 'daring', 'stout', 'gallant'] },
        { word: 'calm', answers: ['serene', 'peaceful', 'tranquil', 'placid', 'quiet', 'still', 'collected', 'mellow'] },
      ];
      return GE.choose(rounds);
    },
  };

  /** Cheap syllable estimate for offline word filtering. */
  function count_syllables(w) {
    const word = String(w).toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    const groups = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
    return groups ? groups.length : 1;
  }

  /* ------------------------------------------------------------------ */
  GE.API = {
    http, pokemon, trivia, weather, art, words,
    decode_entities,
    count_syllables,
    /** clear API caches */
    clear_cache() { mem_cache.clear(); },
    /** Every wrapped service — handy for the editor's trainer + docs. */
    get services() {
      return [
        { key: 'pokemon', name: 'PokéAPI', url: pokemon.doc, what: '1025 creatures: sprites, stats, type chart' },
        { key: 'trivia', name: 'Open Trivia DB', url: trivia.doc, what: '4000+ quiz questions across 24 categories' },
        { key: 'weather', name: 'Open-Meteo', url: weather.doc, what: 'live weather for any coordinates' },
        { key: 'art', name: 'Art Institute of Chicago', url: art.doc, what: '120k+ public-domain artworks and images' },
        { key: 'words', name: 'Datamuse', url: words.doc, what: 'rhymes, synonyms, meanings, syllables' },
      ];
    },
  };
})(globalThis.GE);
