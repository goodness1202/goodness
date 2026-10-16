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
  async function runSnippet(code, output) {
    output.textContent = 'running…';
    const t0 = performance.now();
    try {
      const env = {
        Goodness: GE.api,
        Input: GE.Input, OS: GE.OS, API: GE.API, Assets: GE.Assets,
        SFX: GE.SFX, Music: GE.Music, Save: GE.Save,
        Vector2: GE.Vector2, Color: GE.Color, Rect2: GE.Rect2,
        lerp: GE.math.lerp, clamp: GE.math.clamp,
        randf: GE.randf, randi: GE.randi, randf_range: GE.randf_range,
        randi_range: GE.randi_range, choose: GE.choose,
      };
      const names = Object.keys(env);
      const fn = new Function(...names, `"use strict";\nreturn (async () => {\n${code}\n})();`);
      const result = await fn(...names.map((n) => env[n]));
      const dt = (performance.now() - t0).toFixed(0);
      let text = `✓ ${dt} ms`;
      if (result !== undefined) {
        text += '\n' + stringify(result);
      }
      output.textContent = text;
      output.style.color = '#7ef0b0';
    } catch (e) {
      output.textContent = '✗ ' + (e.message || e);
      output.style.color = '#ff8f8f';
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
      </table>
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
      <h3>Reference</h3>
      <table>
        <tr><th>Call</th><th>Returns</th></tr>
        <tr><td><code>questions({amount, category, difficulty, type})</code></td><td><code>[{ question, answers[4], correct_index, category, difficulty }]</code> — HTML decoded &amp; shuffled for you</td></tr>
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
