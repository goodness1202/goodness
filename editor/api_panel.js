/* ==========================================================================
   Goodness Engine — editor/api_panel.js
   A searchable, in-editor API reference with LIVE runnable snippets —
   including a full guide to the built-in free APIs (PokéAPI, Open
   Trivia DB, Open-Meteo). Select a snippet, press Run, watch it work.
   ========================================================================== */
(function (GE) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Runnable snippet engine                                             */
  /* ------------------------------------------------------------------ */
  /** The sandbox every snippet and trainer task runs inside. */
  function snippet_env(overrides = {}) {
    return Object.assign({
      Goodness: GE.api,
      Input: GE.Input, OS: GE.OS, API: GE.API, Assets: GE.Assets,
      SFX: GE.SFX, Music: GE.Music, Save: GE.Save, Logger: GE.Logger,
      Autoloads: GE.Autoloads,
      Vector2: GE.Vector2, Color: GE.Color, Rect2: GE.Rect2,
      lerp: GE.math.lerp, clamp: GE.math.clamp,
      randf: GE.randf, randi: GE.randi, randf_range: GE.randf_range,
      randi_range: GE.randi_range, choose: GE.choose,
    }, overrides);
  }

  /** Run user code and hand back the returned value — used by snippets
   *  *and* by the trainer (which grades the result). */
  async function eval_code(code, overrides = {}) {
    const env = snippet_env(overrides);
    const names = Object.keys(env);
    const t0 = performance.now();
    try {
      const fn = new Function(...names, `"use strict";\nreturn (async () => {\n${code}\n})();`);
      const value = await fn(...names.map((n) => env[n]));
      return { value, ms: performance.now() - t0, error: null };
    } catch (e) {
      return { value: undefined, ms: performance.now() - t0, error: (e && e.message) || String(e) };
    }
  }

  async function runSnippet(code, output) {
    output.textContent = 'running…';
    const { value, ms, error } = await eval_code(code);
    if (error) {
      output.textContent = '✗ ' + error;
      output.style.color = '#ff8f8f';
    } else {
      let text = `✓ ${ms.toFixed(0)} ms`;
      if (value !== undefined) text += '\n' + stringify(value);
      output.textContent = text;
      output.style.color = '#7ef0b0';
    }
    GE.TutorialEvents && GE.TutorialEvents.emit('api_snippet_ran');
  }

  function stringify(v, depth = 0) {
    if (v === null) return 'null';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return '[' + v.slice(0, 12).map((x) => stringify(x)).join(', ') + (v.length > 12 ? `, …${v.length} items` : '') + ']';
    if (v instanceof GE.Vector2) return v.toString();
    if (typeof v === 'object') {
      try {
        const keys = Object.keys(v).slice(0, 14);
        return '{\n' + keys.map((k) => '  '.repeat(depth + 1) + k + ': ' + stringify(v[k], depth + 1)).join('\n') + '\n' + '  '.repeat(depth) + '}';
      } catch (e) { return String(v); }
    }
    return String(v);
  }

  /* ------------------------------------------------------------------ */
  /* Content: categories of documentation                                */
  /* ------------------------------------------------------------------ */
  const DOCS = [];

  /* ---- free APIs ---- */
  DOCS.push({
    cat: 'Free APIs', id: 'api-intro', name: '🌐 Overview',
    html: `
      <h2>Free APIs — the internet is your content pipeline</h2>
      <p>Goodness ships with first-class wrappers for three <b>complete, free, forever-key-less</b> public APIs. They work in the browser (CORS-friendly), cache responses, and are guarded by timeouts. All calls are <code>async</code>.</p>
      <table>
        <tr><th>API</th><th>What you get</th><th>Wrapper</th></tr>
        <tr><td>🐾 PokéAPI</td><td>1025 creatures: sprites, stats, types, moves, damage charts</td><td><code>API.pokemon</code></td></tr>
        <tr><td>❓ Open Trivia DB</td><td>4000+ quiz questions in 24 categories</td><td><code>API.trivia</code></td></tr>
        <tr><td>🌦 Open-Meteo</td><td>Live weather for any coordinates on Earth</td><td><code>API.weather</code></td></tr>
        <tr><td>🖼️ Art Institute of Chicago</td><td>120,000+ public-domain artworks + IIIF images</td><td><code>API.art</code></td></tr>
        <tr><td>📚 Datamuse</td><td>Rhymes, synonyms, meanings, syllables — a word engine</td><td><code>API.words</code></td></tr>
      </table>
      <p><b>New here?</b> Open the <b>🎯 API Trainer</b> section (below) — it gives you real
      tasks, runs your code against the live APIs and tells you when you're right.</p>
      <p>For any other web API use <code>API.http.get(url)</code> or an <b>HTTPRequest</b> node. Golden rules: <b>try/catch everything</b>, <b>never block the frame</b>, <b>ship an offline fallback</b>.</p>
      <h3>Your first API call — right here, right now</h3>
      ${snippet('api-first', `/* Press ▶ Run — fetches a random creature from PokéAPI */
const mon = await API.pokemon.random();
return '✨ ' + mon.name + ' — ' + mon.types.join('/') + ' — HP ' + mon.stats.hp;`)}
      <p style="color:var(--faint);font-size:11.5px">(No output or an error? You're offline — the same fallback thinking applies to your games.)</p>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-pokemon', name: '🐾 PokéAPI',
    html: `
      <h2>API.pokemon — creatures as content</h2>
      <p>Docs: <a href="https://pokeapi.co" target="_blank" style="color:var(--blue)">pokeapi.co</a> — free, no key, no rate limit for fair use.</p>
      <h3>Try it live</h3>
      ${snippet('api-pokemon-1', `const mon = await API.pokemon.get('pikachu');
return {
  name: mon.name,
  types: mon.types,
  stats: mon.stats,
  sprite_url: mon.sprites.front,
};`)}
      ${snippet('api-pokemon-2', `/* random creature + its sprite as a ready Texture */
const mon = await API.pokemon.random();
const tex = await API.pokemon.sprite(mon.id);
return mon.name + ' — texture ' + (tex ? tex.width + 'x' + tex.height : 'unavailable (offline)');`)}
      ${snippet('api-pokemon-3', `/* real damage math from the type chart */
const atk = await API.pokemon.effectiveness(['electric'], ['water', 'flying']);
const def = await API.pokemon.effectiveness(['ground'], ['electric']);
return 'electric → water/flying: x' + atk + '\\nground → electric: x' + def;`)}
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>get(id_or_name)</code></td><td>normalized creature: <code>{ id, name, types[], stats{hp,attack,defense,speed,…}, sprites{front,back,front_shiny}, height_m, weight_kg, moves[], raw }</code></td></tr>
        <tr><td><code>random()</code></td><td>a random creature out of 1025</td></tr>
        <tr><td><code>sprite(id, {back, shiny})</code></td><td>a Goodness <code>Texture</code> ready for <code>sprite.set_texture()</code></td></tr>
        <tr><td><code>effectiveness(atk_types, def_types)</code></td><td>damage multiplier: 0, 0.5, 1, 2, 4…</td></tr>
      </table>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-trivia', name: '❓ Open Trivia DB',
    html: `
      <h2>API.trivia — quiz content on tap</h2>
      <p>Docs: <a href="https://opentdb.com" target="_blank" style="color:var(--blue)">opentdb.com</a> — free, no key.</p>
      ${snippet('api-trivia-1', `const qs = await API.trivia.questions({ amount: 3, category: 15, difficulty: 'easy' });
return qs.map((q) => q.question);`)}
      ${snippet('api-trivia-2', `/* full question object */
const [q] = await API.trivia.questions({ amount: 1, type: 'boolean' });
return q;`)}
      ${snippet('api-trivia-3', `/* no internet? a built-in bank keeps the quiz alive — same shape */
try {
  return await API.trivia.questions({ amount: 1 });
} catch (err) {
  return API.trivia.offline_questions(1)[0];
}`)}
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>questions({amount, category, difficulty, type})</code></td><td><code>[{ question, answers[4], correct_index, category, difficulty }]</code> — HTML decoded &amp; shuffled for you</td></tr>
        <tr><td><code>offline_questions(n)</code></td><td>built-in question bank, no network needed — a drop-in fallback</td></tr>
        <tr><td><code>categories</code></td><td>id → name map (9 General … 32 Cartoons)</td></tr>
      </table>
      <p>Difficulty: <code>'easy' | 'medium' | 'hard'</code>. Type: <code>'multiple' | 'boolean'</code>.</p>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-weather', name: '🌦 Open-Meteo',
    html: `
      <h2>API.weather — the sky, live</h2>
      <p>Docs: <a href="https://open-meteo.com" target="_blank" style="color:var(--blue)">open-meteo.com</a> — free, no key. Defaults to Amsterdam.</p>
      ${snippet('api-weather-1', `const w = await API.weather.current();
return w.description + ' ' + w.icon + ' · ' + w.temperature_c + '°C · wind ' + w.wind_kmh + ' km/h';`)}
      ${snippet('api-weather-2', `/* drive game mood from real weather */
const w = await API.weather.current({ lat: 52.37, lon: 4.9 });  // Amsterdam
return {
  sky_tint: w.sky_tint,       // ready-made color for your background
  is_raining: w.is_raining,   // spawn rain particles?
  is_day: w.is_day,           // day/night palette
};`)}
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>current({lat, lon})</code></td><td><code>{ temperature_c, feels_like_c, humidity, wind_kmh, code, description, icon, is_day, is_raining, is_snowing, sky_tint, raw }</code></td></tr>
      </table>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-art', name: '🖼️ Art Institute of Chicago',
    html: `
      <h2>API.art — a museum in your game</h2>
      <p>Docs: <a href="https://api.artic.edu/docs" target="_blank" style="color:var(--blue)">api.artic.edu</a> —
      120,000+ artworks from the Art Institute of Chicago, <b>CC0 / public domain</b>, no key, images included.
      Perfect for card games, galleries, puzzles, "spot the painting" and art-of-the-day screens.</p>
      <h3>Try it live</h3>
      ${snippet('api-art-1', `const a = await API.art.random({ query: 'water lilies' });
return a.title + ' — ' + a.artist + ' (' + a.date + ')\\n' + a.image_url;`)}
      ${snippet('api-art-2', `/* a deck of 6 paintings, ready for card art */
const deck = await API.art.collection(6, { query: 'landscape painting' });
return deck.map((a) => a.title + ' / ' + a.artist);`)}
      ${snippet('api-art-3', `/* any image size you like, straight from the IIIF server */
const a = await API.art.random();
return {
  thumb: API.art.image_url(a.image_id, 200),
  full:  API.art.image_url(a.image_id, 843),
  public_domain: a.is_public_domain,
};`)}
      <p>Offline? <code>API.art.offline_deck(8)</code> returns procedural stand-ins with the
      same shape, so your game never shows an empty screen.</p>
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>search(query, {limit, page, with_images, public_domain})</code></td><td>array of artworks</td></tr>
        <tr><td><code>get(id)</code></td><td>one artwork</td></tr>
        <tr><td><code>random({query})</code> / <code>collection(n, {query})</code></td><td>1 / n distinct artworks</td></tr>
        <tr><td><code>texture(id_or_artwork, {width})</code></td><td>a Goodness <code>Texture</code> for <code>sprite.set_texture()</code></td></tr>
        <tr><td><code>image_url(image_id, width)</code></td><td>IIIF URL at any size</td></tr>
        <tr><td><code>offline_deck(n)</code></td><td>built-in fallback art (no network)</td></tr>
      </table>
      <p>Artwork object: <code>{ id, title, artist, date, medium, origin, department,
      is_public_domain, image_id, image_url, thumbnail_url, color, raw }</code>.</p>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-words', name: '📚 Datamuse (words)',
    html: `
      <h2>API.words — the word engine</h2>
      <p>Docs: <a href="https://www.datamuse.com/api/" target="_blank" style="color:var(--blue)">datamuse.com/api</a> —
      free, no key, CORS-friendly. Rhymes, synonyms, meanings, syllables and autocomplete:
      everything a word game, name generator or dialogue system needs.</p>
      <h3>Try it live</h3>
      ${snippet('api-words-1', `const rhymes = await API.words.rhymes('game', 6);
return 'rhymes: ' + rhymes.map((r) => r.word).join(', ');`)}
      ${snippet('api-words-2', `const syn = await API.words.synonyms('brave', 6);
return syn.map((w) => w.word);`)}
      ${snippet('api-words-3', `/* definition + syllables + part of speech */
const info = await API.words.describe('extraordinary');
return info.word + ' — ' + info.syllables + ' syllables — ' + info.part_of_speech + ': ' + info.definition;`)}
      ${snippet('api-words-4', `/* a ready-made word puzzle: one word, many answers */
const puzzle = await API.words.puzzle();
return { word: puzzle.word, answers: puzzle.answers.slice(0, 6).map((a) => a.word) };`)}
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>like(phrase, n)</code></td><td>words with a similar meaning</td></tr>
        <tr><td><code>synonyms(word, n)</code> / <code>antonyms(word, n)</code></td><td>synonyms / opposites</td></tr>
        <tr><td><code>rhymes(word, n)</code> / <code>near_rhymes(word, n)</code></td><td>perfect / approximate rhymes</td></tr>
        <tr><td><code>sounds_like(word, n)</code> / <code>spelled_like(pattern, n)</code></td><td>phonetic &amp; wildcard matches (<code>'c*t'</code>)</td></tr>
        <tr><td><code>suggest(prefix, n)</code></td><td>autocomplete list (strings)</td></tr>
        <tr><td><code>describe(word)</code></td><td><code>{ word, syllables, definition, part_of_speech, tags, defs }</code></td></tr>
        <tr><td><code>random({max_syllables})</code></td><td>a random real word</td></tr>
        <tr><td><code>puzzle(word?)</code></td><td><code>{ word, answers[] }</code> — game-ready</td></tr>
        <tr><td><code>offline_puzzle()</code></td><td>built-in fallback round</td></tr>
      </table>
      <p>Word entries are normalised to
      <code>{ word, score, syllables, tags, defs }</code>.</p>`,
  });
  DOCS.push({
    cat: 'Free APIs', id: 'api-http', name: '🛠 Any other API',
    html: `
      <h2>API.http + HTTPRequest node — bring your own API</h2>
      ${snippet('api-http-1', `/* generic JSON GET with timeout */
const data = await API.http.get('https://api.github.com/repos/godotengine/godot', { timeout: 8 });
return data.full_name + ' ★ ' + data.stargazers_count;`)}
      <p>In a scene, prefer the <b>HTTPRequest</b> node:</p>
      <div class="snippet">{
  extends: 'Node',
  _ready() {
    const http = new Goodness.HTTPRequest();
    this.add_child(http);
    http.connect('request_completed', (data) => {
      Goodness.Logger.info('got data: ' + JSON.stringify(data).slice(0, 80));
    });
    http.connect('request_failed', (err) => {
      Goodness.Logger.warn('request failed: ' + err);
    });
    http.request_json('https://pokeapi.co/api/v2/pokemon/25');
  },
}</div>
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Notes</th></tr>
        <tr><td><code>API.http.get(url, opts)</code></td><td>JSON GET</td></tr>
        <tr><td><code>API.http.post(url, body)</code></td><td>JSON POST</td></tr>
        <tr><td><code>API.http.cached_json(url, ttl, key)</code></td><td>memory + localStorage cache</td></tr>
      </table>`,
  });

  /* ---- engine singletons ---- */
  DOCS.push({
    cat: 'Engine', id: 'input', name: '⌨️ Input',
    html: `
      <h2>Input</h2>
      <p>Default actions: <code>ui_left/right/up/down</code>, <code>ui_accept</code>, <code>ui_cancel</code>, <code>jump</code> (Space), <code>fire</code> (X).</p>
      <table>
        <tr><th>Call</th><th>Notes</th></tr>
        <tr><td><code>is_action_pressed(a)</code></td><td>held down</td></tr>
        <tr><td><code>is_action_just_pressed(a)</code></td><td>this frame only</td></tr>
        <tr><td><code>is_action_just_released(a)</code></td><td>this frame only</td></tr>
        <tr><td><code>get_axis(neg, pos)</code></td><td>-1 / 0 / 1</td></tr>
        <tr><td><code>get_vector(l, r, u, d)</code></td><td>normalized Vector2 (gamepad-aware)</td></tr>
        <tr><td><code>map_action(name, codes)</code></td><td>e.g. <code>['Space','KeyL','MouseLeft']</code></td></tr>
        <tr><td><code>mouse_position</code></td><td>screen space</td></tr>
        <tr><td><code>get_world_mouse(tree)</code></td><td>world space (camera aware)</td></tr>
      </table>`,
  });
  DOCS.push({
    cat: 'Engine', id: 'audio', name: '🔊 SFX & Music',
    html: `
      <h2>Sound with zero files</h2>
      <p>All effects are synthesized in WebAudio — nothing to download.</p>
      ${snippet('sfx-1', `SFX.jump(); SFX.coin(); SFX.laser();
return 'played jump, coin and laser — hear them?';`)}
      ${snippet('sfx-2', `/* tiny chiptune: notes + durations in beats */
Music.play([
  { n: 'E4', d: 0.5 }, { n: 'G4', d: 0.5 },
  { n: 'A4', d: 1 }, { n: 'G4', d: 0.5 }, { n: 'E4', d: 1 },
], { tempo: 120 });
return 'music started (Music.stop() to end it)';`)}
      <table>
        <tr><th>Presets</th><td><code>jump, coin, hit, hurt, explosion, laser, powerup, click, blip, win, lose, step, spawn</code></td></tr>
        <tr><th>Custom</th><td><code>SFX.play({wave:'square', freq:440, freq_end:220, dur:0.2, vol:0.4, delay:0})</code></td></tr>
        <tr><th>Music</th><td><code>Music.play(notes, {tempo, wave, volume, loop})</code> · <code>Music.stop()</code></td></tr>
      </table>`,
  });
  DOCS.push({
    cat: 'Engine', id: 'save', name: '💾 Save',
    html: `
      <h2>Persistent data</h2>
      ${snippet('save-1', `Save.set('highscore', 1200);
const best = Save.get('highscore', 0);
Save.save_game({ level: 3, coins: 12 }, 'slot1');
return { best, slot: Save.load_game('slot1'), slots: Save.list_slots() };`)}
      <p>Stored per-project in <code>localStorage</code>: high scores, settings, save-game slots.</p>`,
  });
  DOCS.push({
    cat: 'Engine', id: 'tween-doc', name: '🎬 Tween',
    html: `
      <h2>Tweens</h2>
      <div class="snippet">node.create_tween()
  .tween_property(sprite, 'position', new Vector2(400, 0), 0.5)
  .set_trans('quad_out')          // sine, quad, cubic, quart, expo, back, elastic, bounce + _in/_out
  .callback(() => SFX.blip())
  .tween_property(sprite, 'modulate', new Color(1, 0, 0), 0.3)
  .set_loops(3);                  // 0 = forever</div>
      <p>Also: <code>tween_method(fn, from, to, dur)</code>, <code>interval(t)</code>, <code>parallel()</code>, <code>tween_property_offset(node, prop, offset, dur)</code>.</p>`,
  });
  DOCS.push({
    cat: 'Engine', id: 'math-doc', name: '📐 Math & helpers',
    html: `
      <h2>Bare names in scripts</h2>
      <p><code>Vector2</code>, <code>Color</code>, <code>lerp</code>, <code>clamp</code>, <code>lerp_angle</code>, <code>remap</code>, <code>smoothstep</code>, <code>deg2rad</code>, <code>rad2deg</code>, <code>randf</code>, <code>randi</code>, <code>randf_range</code>, <code>randi_range</code>, <code>choose</code>, <code>OS</code>, <code>Goodness</code> (everything).</p>
      ${snippet('math-1', `return {
  lerp: lerp(0, 100, 0.25),
  v: new Vector2(3, 4).length,
  angle: lerp_angle(350, 10, 0.5),
  pick: choose(['a', 'b', 'c']),
};`)}
      <p><code>Vector2</code>: <code>add sub mul div neg dot cross length normalized distance_to direction_to rotate(deg) lerp angle</code>. Y points <b>down</b> (screen space), rotations are in <b>degrees</b>.</p>`,
  });

  /* ---- node classes (auto-generated from defs) ---- */
  for (const cls of GE.Classes.all()) {
    const def = cls.def;
    if (def.hidden) continue;
    let html = `<h2>${def.icon} ${def.name}</h2><p>${def.desc || ''}</p>`;
    if (def.base && def.base !== 'Node') html += `<p>Extends <code>${def.base}</code>.</p>`;
    if (def.props && def.props.length) {
      html += `<h3>Properties</h3><table><tr><th>Property</th><th>Type</th><th>Description</th></tr>`;
      for (const p of def.props) html += `<tr><td><code>${p.path}</code></td><td>${p.type}</td><td>${p.doc || ''}</td></tr>`;
      html += `</table>`;
    }
    if (def.methods && def.methods.length) {
      html += `<h3>Methods</h3><table><tr><th>Method</th><th>Description</th></tr>`;
      for (const m of def.methods) html += `<tr><td><code>${m.sig}</code></td><td>${m.desc}</td></tr>`;
      html += `</table>`;
    }
    DOCS.push({ cat: 'Nodes', id: 'node-' + def.name, name: `${def.icon} ${def.name}`, html });
  }

  /* ================================================================== */
  /* 🎯 API Trainer — learn the five free APIs by doing, not reading     */
  /* Each task runs YOUR code against the real API, then grades the      */
  /* returned value. Progress is remembered between sessions.            */
  /* ================================================================== */
  const TRAINER_KEY = 'goodness:trainer:progress';

  const TASKS = [
    {
      id: 'task-pokemon-name',
      title: '1 · Fetch a creature',
      api: 'API.pokemon',
      brief: `Return the <b>name</b> and <b>types</b> of the Pokémon with id <code>25</code>.<br>
              <span class="hint-line">Use <code>await API.pokemon.get(25)</code> — inspect what comes back with a quick <code>return mon;</code> first.</span>`,
      starter: `const mon = await API.pokemon.get(25);\nreturn { name: '…', types: [] };`,
      solution: `const mon = await API.pokemon.get(25);\nreturn { name: mon.name, types: mon.types };`,
      check: (v) => v && String(v.name).toLowerCase() === 'pikachu' && Array.isArray(v.types) && v.types.includes('electric'),
      expect: 'name "Pikachu" and types containing "electric"',
    },
    {
      id: 'task-pokemon-stats',
      title: '2 · Read the stats',
      api: 'API.pokemon',
      brief: `A boss battle needs numbers. Return <code>{ hp, attack }</code> for <b>charizard</b>, and a
              <b>boosted</b> hp that is 3× the base value.<br>
              <span class="hint-line">Stats live in <code>mon.stats</code>.</span>`,
      starter: `const mon = await API.pokemon.get('charizard');\nreturn { hp: 0, attack: 0, boosted_hp: 0 };`,
      solution: `const mon = await API.pokemon.get('charizard');\nreturn { hp: mon.stats.hp, attack: mon.stats.attack, boosted_hp: mon.stats.hp * 3 };`,
      check: (v) => v && typeof v.hp === 'number' && v.hp > 0 && v.boosted_hp === v.hp * 3 && v.attack > 0,
      expect: 'an object with hp, attack and boosted_hp === hp * 3',
    },
    {
      id: 'task-pokemon-damage',
      title: '3 · Real damage maths',
      api: 'API.pokemon',
      brief: `Use the type chart: how much does a <b>water</b> move hurt a <b>fire</b> creature, and a
              <b>normal</b> move hurt a <b>ghost</b>?<br>
              <span class="hint-line">One call answers both: <code>API.pokemon.effectiveness(attacker_types, defender_types)</code>.</span>`,
      starter: `const water_vs_fire = await API.pokemon.effectiveness(['water'], ['fire']);\nreturn { water_vs_fire, normal_vs_ghost: 0 };`,
      solution: `const water_vs_fire = await API.pokemon.effectiveness(['water'], ['fire']);\nconst normal_vs_ghost = await API.pokemon.effectiveness(['normal'], ['ghost']);\nreturn { water_vs_fire, normal_vs_ghost };`,
      check: (v) => v && v.water_vs_fire === 2 && v.normal_vs_ghost === 0,
      expect: 'water→fire = 2 and normal→ghost = 0',
    },
    {
      id: 'task-trivia',
      title: '4 · Build a quiz round',
      api: 'API.trivia',
      brief: `Fetch <b>3 easy multiple-choice questions</b> and return them as
              <code>{ count, first_question, answer_count }</code>.<br>
              <span class="hint-line">The answers are already shuffled and HTML-decoded for you.</span>`,
      starter: `const qs = await API.trivia.questions({ amount: 3, difficulty: 'easy', type: 'multiple' });\nreturn { count: 0, first_question: '', answer_count: 0 };`,
      solution: `const qs = await API.trivia.questions({ amount: 3, difficulty: 'easy', type: 'multiple' });\nreturn { count: qs.length, first_question: qs[0].question, answer_count: qs[0].answers.length };`,
      check: (v) => v && v.count === 3 && typeof v.first_question === 'string' && v.first_question.length > 5 && v.answer_count === 4,
      expect: '3 questions, a real first question and 4 answers each',
    },
    {
      id: 'task-weather',
      title: '5 · Weather-driven game',
      api: 'API.weather',
      brief: `Fetch the weather for <b>London</b> (lat <code>51.5074</code>, lon <code>-0.1278</code>) and return
              <code>{ city, temp, raining, sky_tint }</code>.<br>
              <span class="hint-line">These fields are made for games: <code>is_raining</code>, <code>sky_tint</code>, <code>is_day</code>.</span>`,
      starter: `const w = await API.weather.current({ lat: 51.5074, lon: -0.1278 });\nreturn { city: 'London', temp: 0, raining: false, sky_tint: '' };`,
      solution: `const w = await API.weather.current({ lat: 51.5074, lon: -0.1278 });\nreturn { city: 'London', temp: w.temperature_c, raining: w.is_raining, sky_tint: w.sky_tint };`,
      check: (v) => v && typeof v.temp === 'number' && typeof v.raining === 'boolean' && /^#|rgb/.test(String(v.sky_tint)),
      expect: 'a numeric temperature, a boolean and a usable sky colour',
    },
    {
      id: 'task-art',
      title: '6 · Fill a gallery',
      api: 'API.art',
      brief: `Build a card game deck: return <b>4 artworks</b> that each have a title and an image URL.<br>
              <span class="hint-line"><code>API.art.collection(4, { query: 'flowers' })</code> does the heavy lifting.</span>`,
      starter: `const deck = await API.art.collection(4, { query: 'flowers' });\nreturn deck.map((a) => ({ title: a.title, image: a.image_url }));`,
      solution: `const deck = await API.art.collection(4, { query: 'flowers' });\nreturn deck.map((a) => ({ title: a.title, image: a.image_url }));`,
      check: (v) => Array.isArray(v) && v.length >= 4 && v.every((a) => a && a.title && /^(https?:|goodness:)/.test(String(a.image))),
      expect: 'an array of 4 { title, image } objects',
    },
    {
      id: 'task-words',
      title: '7 · Rhyme master',
      api: 'API.words',
      brief: `Return <b>5 words</b> that rhyme with <code>game</code>, plus how many syllables
              <code>extraordinary</code> has.<br>
              <span class="hint-line">Two calls: <code>API.words.rhymes()</code> and <code>API.words.describe()</code>.</span>`,
      starter: `const rhymes = await API.words.rhymes('game', 5);\nconst info = await API.words.describe('extraordinary');\nreturn { rhymes: [], syllables: 0 };`,
      solution: `const rhymes = await API.words.rhymes('game', 5);\nconst info = await API.words.describe('extraordinary');\nreturn { rhymes: rhymes.map((r) => r.word), syllables: info.syllables };`,
      check: (v) => v && Array.isArray(v.rhymes) && v.rhymes.length >= 5 && v.rhymes.every((w) => typeof w === 'string' && w.length > 1) && v.syllables === 5,
      expect: '5 rhyme strings and syllables === 5',
    },
    {
      id: 'task-words-puzzle',
      title: '8 · Invent a word game',
      api: 'API.words',
      brief: `Ask the engine for a puzzle, then return the challenge word plus at least <b>4</b> valid answers.<br>
              <span class="hint-line"><code>API.words.puzzle()</code> returns <code>{ word, answers }</code> — perfect for “name a synonym” rounds.</span>`,
      starter: `const p = await API.words.puzzle();\nreturn { word: '', answers: [] };`,
      solution: `const p = await API.words.puzzle();\nreturn { word: p.word, answers: p.answers.map((a) => a.word).slice(0, 6) };`,
      check: (v) => v && typeof v.word === 'string' && v.word.length > 1 && Array.isArray(v.answers) && v.answers.length >= 4,
      expect: 'a challenge word and at least 4 answers',
    },
    {
      id: 'task-resilient',
      title: '9 · Never crash (pro move)',
      api: 'robustness',
      brief: `The network <b>will</b> fail. This task runs your code with a <b>broken</b> API —
              wrap the call in <code>try/catch</code> and return a fallback:<br>
              <code>{ source: 'offline', hot: true }</code> when the fetch fails.<br>
              <span class="hint-line">Try running it first: you will see the error the trainer injects.</span>`,
      starter: `try {\n  const w = await API.weather.current();\n  return { source: 'live', temp: w.temperature_c };\n} catch (e) {\n  return { source: 'offline' };\n}`,
      solution: `try {\n  const w = await API.weather.current();\n  return { source: 'live', temp: w.temperature_c };\n} catch (e) {\n  Logger.warn('weather unavailable: ' + e.message);\n  return { source: 'offline', hot: true };\n}`,
      env: () => ({ API: new Proxy({}, { get: () => () => { throw new Error('network down (trainer simulation)'); } }) }),
      check: (v) => v && v.source === 'offline' && v.hot === true,
      expect: "{ source: 'offline', hot: true } — the game keeps running",
    },
    {
      id: 'task-boss',
      title: '10 · Boss: a live battle screen',
      api: 'everything',
      brief: `Combine three APIs. Return<br>
              <code>{ creature, hp, question, painting, sky }</code><br>
              — a random creature name, its hp (doubled), a trivia question, an artwork title and a sky colour.<br>
              <span class="hint-line">Five awaits, one object. This is what the example games do.</span>`,
      starter: `const mon = await API.pokemon.random();\nreturn { creature: '', hp: 0, question: '', painting: '', sky: '' };`,
      solution: `const [mon, [q], art, w] = await Promise.all([\n  API.pokemon.random(),\n  API.trivia.questions({ amount: 1 }),\n  API.art.random(),\n  API.weather.current(),\n]);\nreturn { creature: mon.name, hp: mon.stats.hp * 2, question: q.question, painting: art.title, sky: w.sky_tint };`,
      check: (v) => v && typeof v.creature === 'string' && v.creature.length > 1 && typeof v.hp === 'number' && v.hp > 0 &&
        typeof v.question === 'string' && v.question.length > 5 && typeof v.painting === 'string' && v.painting.length > 0 && /^#|rgb/.test(String(v.sky)),
      expect: 'all five fields filled in from live APIs',
    },
  ];

  const trainer_progress = {
    load() {
      try { return JSON.parse(localStorage.getItem(TRAINER_KEY) || '{}'); } catch (e) { return {}; }
    },
    mark(id) {
      const p = this.load(); p[id] = Date.now();
      try { localStorage.setItem(TRAINER_KEY, JSON.stringify(p)); } catch (e) {}
      GE.TutorialEvents && GE.TutorialEvents.emit('api_task_passed', id);
    },
    count() { return Object.keys(this.load()).length; },
    reset() { try { localStorage.removeItem(TRAINER_KEY); } catch (e) {} },
  };

  function trainer_html() {
    const done = trainer_progress.count();
    return `
      <h2>🎯 API Trainer</h2>
      <p>Ten tasks. Real APIs. Your code runs for real and gets graded — pass them all and
      you can wire any web API into any game.</p>
      <div class="trainer-progress"><div class="tp-bar"><i style="width:${Math.round(done / TASKS.length * 100)}%"></i></div>
      <span>${done} / ${TASKS.length} passed</span></div>
      <div id="trainer-tasks"></div>
      <p style="margin-top:18px"><button class="trainer-btn ghost" id="trainer-reset">Reset progress</button></p>`;
  }

  function mount_trainer(root) {
    const host = root.querySelector('#trainer-tasks');
    if (!host) return;
    const progress = trainer_progress.load();
    for (const task of TASKS) {
      const passed = !!progress[task.id];
      const card = document.createElement('div');
      card.className = 'trainer-card' + (passed ? ' passed' : '');
      card.innerHTML = `
        <div class="tc-head">
          <div>
            <div class="tc-title">${escapeHtml(task.title)} ${passed ? '<span class="tc-badge">✓ passed</span>' : ''}</div>
            <div class="tc-api">${escapeHtml(task.api)}</div>
          </div>
          <button class="trainer-btn ghost tc-toggle">Show / hide</button>
        </div>
        <div class="tc-body">
          <p class="tc-brief">${task.brief}</p>
          <textarea class="trainer-code" spellcheck="false">${escapeHtml(task.starter)}</textarea>
          <div class="tc-actions">
            <button class="trainer-btn" data-act="run">▶ Run &amp; grade</button>
            <button class="trainer-btn ghost" data-act="hint">💡 Hint</button>
            <button class="trainer-btn ghost" data-act="solution">🔓 Show solution</button>
          </div>
          <div class="trainer-out">Waiting for you…</div>
        </div>`;
      const body = card.querySelector('.tc-body');
      if (!passed) body.style.display = 'none';
      card.querySelector('.tc-toggle').onclick = () => {
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
      };
      const out = card.querySelector('.trainer-out');
      const code_el = card.querySelector('.trainer-code');
      const run = async () => {
        out.className = 'trainer-out';
        out.textContent = 'running against the live API…';
        const overrides = task.env ? task.env() : {};
        const { value, ms, error } = await eval_code(code_el.value, overrides);
        if (error) {
          out.classList.add('bad');
          out.textContent = `✗ ${error}\n\nThe API threw — that is often the lesson (see task 9).`;
          return;
        }
        let ok = false;
        try { ok = !!task.check(value); } catch (e) { ok = false; }
        if (ok) {
          out.classList.add('good');
          out.textContent = `✓ Passed in ${ms.toFixed(0)} ms — expected ${task.expect}.\nreturned: ${stringify(value)}`;
          trainer_progress.mark(task.id);
          card.classList.add('passed');
          const badge = card.querySelector('.tc-title');
          if (!badge.innerHTML.includes('passed')) badge.innerHTML += ' <span class="tc-badge">✓ passed</span>';
          const bar = root.querySelector('.tp-bar i');
          if (bar) {
            const c = trainer_progress.count();
            bar.style.width = Math.round(c / TASKS.length * 100) + '%';
            const label = root.querySelector('.trainer-progress span');
            if (label) label.textContent = `${c} / ${TASKS.length} passed`;
          }
        } else {
          out.classList.add('bad');
          out.textContent = `✗ Not yet. Expected ${task.expect}.\nyou returned: ${stringify(value)}`;
        }
      };
      card.querySelector('[data-act="run"]').onclick = run;
      card.querySelector('[data-act="hint"]').onclick = () => {
        out.className = 'trainer-out hint';
        out.textContent = '💡 ' + task.brief.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      };
      card.querySelector('[data-act="solution"]').onclick = () => {
        code_el.value = task.solution;
        out.className = 'trainer-out hint';
        out.textContent = 'Solution loaded — read it, then press ▶ Run & grade to prove it works.';
      };
      host.appendChild(card);
    }
    const reset = root.querySelector('#trainer-reset');
    if (reset) reset.onclick = () => { trainer_progress.reset(); GE.ApiPanel.render(root.parentElement); };
  }

  DOCS.push({
    cat: 'Trainer', id: 'api-trainer', name: '🎯 API Trainer (10 tasks)',
    html: trainer_html(), mount: mount_trainer,
  });

  /* helper to build a runnable snippet block */
  function snippet(id, code) {
    return `<div class="snippet" data-snippet="${id}"><button class="run-btn">▶ Run</button>${escapeHtml(code)}</div><div class="snippet-output" id="out-${id}"></div>`;
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------------------------------------------ */
  /* Panel                                                               */
  /* ------------------------------------------------------------------ */
  GE.ApiPanel = {
    get tasks() { return TASKS.slice(); },
    get progress() { return trainer_progress.load(); },
    /** @private used by the automated editor tests */
    __eval(code, overrides) { return eval_code(code, overrides || {}); },
    render(container) {
      container.innerHTML = '';

      const sidebar = document.createElement('div');
      sidebar.id = 'api-sidebar';
      const main = document.createElement('div');
      main.id = 'api-main';

      const search = document.createElement('input');
      search.id = 'api-search';
      search.placeholder = 'Search the API… (nodes, methods, APIs)';
      sidebar.appendChild(search);
      const list = document.createElement('div');
      sidebar.appendChild(list);

      container.appendChild(sidebar);
      container.appendChild(main);

      const cats = {};
      for (const doc of DOCS) (cats[doc.cat] = cats[doc.cat] || []).push(doc);

      const renderList = (filter) => {
        list.innerHTML = '';
        for (const [cat, docs] of Object.entries(cats)) {
          const shown = docs.filter((d) => !filter || d.name.toLowerCase().includes(filter) || d.html.toLowerCase().includes(filter));
          if (!shown.length) continue;
          const catEl = document.createElement('div');
          catEl.className = 'api-cat';
          catEl.textContent = cat;
          list.appendChild(catEl);
          for (const d of shown) {
            const item = document.createElement('div');
            item.className = 'api-item';
            item.textContent = d.name;
            item.onclick = () => {
              list.querySelectorAll('.api-item').forEach((x) => x.classList.remove('active'));
              item.classList.add('active');
              main.innerHTML = d.html;
              main.scrollTop = 0;
              wireSnippets(main);
              if (typeof d.mount === 'function') { try { d.mount(main); } catch (e) { GE.Logger.warn('panel section failed: ' + e.message); } }
            };
            list.appendChild(item);
          }
        }
      };
      renderList('');
      search.oninput = () => renderList(search.value.trim().toLowerCase());

      /* default page */
      main.innerHTML = DOCS[0].html;
      wireSnippets(main);
      if (typeof DOCS[0].mount === 'function') { try { DOCS[0].mount(main); } catch (e) {} }
    },
  };

  function wireSnippets(root) {
    root.querySelectorAll('.snippet').forEach((el) => {
      const btn = el.querySelector('.run-btn');
      if (!btn) return;
      btn.onclick = async () => {
        const code = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('');
        const out = root.querySelector('#out-' + el.dataset.snippet) || el.nextElementSibling;
        if (out) await runSnippet(code, out);
      };
    });
  }
})(globalThis.GE);
