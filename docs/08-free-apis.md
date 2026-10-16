# 08 · Free APIs — the internet as your content pipeline

**The big idea:** games feel alive when their content is real. Goodness
ships with first-class support for three complete, **free, no-API-key,
forever** public APIs — and the tools to wire up any other API in minutes.

> Train yourself interactively: **editor → 🌐 API + Snippets tab** — every
> example below is runnable there, right now. The 📚 Tutorials tab also has
> the guided lesson **“Free APIs in your game”**.

| API | Wrapper | What your game gets |
|---|---|---|
| 🐾 **PokéAPI** — [pokeapi.co](https://pokeapi.co) | `API.pokemon` | 1025 creatures: sprites, stats, types, moves, damage charts |
| ❓ **Open Trivia DB** — [opentdb.com](https://opentdb.com) | `API.trivia` | 4000+ quiz questions, 24 categories, 3 difficulties |
| 🌦 **Open-Meteo** — [open-meteo.com](https://open-meteo.com) | `API.weather` | live weather for any point on Earth |

All calls are `async`, cached, and timeout-guarded. All three send
CORS headers, so they work from any web page — no server needed.

---

## PokéAPI — creatures as content

```js
// one creature by name or id
const mon = await API.pokemon.get('pikachu');
mon.name          // "Pikachu"
mon.types         // ["electric"]
mon.stats         // { hp: 35, attack: 55, defense: 40, speed: 90, ... }
mon.sprites.front // image URL — hand straight to a Sprite
mon.weight_kg     // 6

// a random creature out of 1025
const foe = await API.pokemon.random();

// the sprite, ready-made as a Texture
const tex = await API.pokemon.sprite(foe.id);
await player_sprite.set_texture(foe.sprites.front);
player_sprite.scale = new Vector2(3, 3);   // sprites are 96 px

// real type-effectiveness math (from the API's damage charts)
const mult = await API.pokemon.effectiveness(['electric'], ['water', 'flying']);
// → 2   (electric is super effective vs both)
```

**Pattern: fetch → normalize → apply**

```js
const mon = await API.pokemon.random();
hp_bar.max_value = mon.stats.hp * 2;
hp_bar.value = hp_bar.max_value;
damage = (mon.stats.attack * (1 + Math.random() * 0.5) - foe.stats.defense * 0.4) * type_mult;
```

Complete game built on this: **Creature Clash** (File → Load Example).

## Open Trivia DB — quizzes on tap

```js
const questions = await API.trivia.questions({
  amount: 10,
  category: 15,          // Video Games (see API.trivia.categories)
  difficulty: 'medium',  // 'easy' | 'medium' | 'hard'
  // type: 'boolean'     // true/false questions
});

questions[0];
// {
//   question: 'Which …?',        // HTML already decoded for you
//   answers: ['A', 'B', 'C', 'D'],   // shuffled, correct included
//   correct_index: 2,
//   category: 'Video Games',
// }
```

The engine decodes OpenTDB's HTML entities and shuffles answers for you.
Complete game: **Trivia Quest**.

## Open-Meteo — the actual sky

```js
const w = await API.weather.current();          // defaults: Amsterdam
const w = await API.weather.current({ lat: 35.68, lon: 139.76 });  // Tokyo

w.description    // 'Light rain'
w.icon           // '🌦️'
w.temperature_c  // 12.3
w.wind_kmh       // 21.5
w.is_raining     // true  → spawn rain particles
w.is_day         // true  → pick your palette
w.sky_tint       // '#5d708c' — a ready background color
```

Idea: a farming game whose weather *is* the player's weather.

## Your own API — `API.http` & HTTPRequest

```js
// anywhere in a script
const data = await API.http.get('https://api.github.com/repos/godotengine/godot');

// or as a scene node with signals (see the 🌐 API tab for the full recipe)
const http = new Goodness.HTTPRequest();
this.add_child(http);
http.connect('request_completed', (data) => { /* … */ });
http.connect('request_failed', (err) => { /* … */ });
http.request_json('https://pokeapi.co/api/v2/pokemon/25');
```

`API.http.get(url)` · `API.http.post(url, body)` ·
`API.http.cached_json(url, ttl_seconds)`.

## The four golden rules

1. **`try/catch` everything.** Players go offline on trains. Catch, then
   fall back to built-in data:

   ```js
   let questions;
   try {
     questions = await API.trivia.questions({ amount: 10 });
   } catch (e) {
     questions = this.builtin_questions;   // the game always works
   }
   ```

2. **Never block the frame.** Use `async`/`await` in `_ready` or helper
   methods — the loop keeps rendering while data loads. (Goodness never
   gives you a synchronous network call, on purpose.)

3. **Cache.** `API.*` caches automatically (24 h PokéAPI, 10 min weather),
   and you can persist with `API.http.cached_json(url, ttl)`.

4. **Timeouts.** Every call has one (default 12 s) so a dead network can't
   freeze a promise chain.

## Full API reference

The 🌐 **API + Snippets** tab in the editor documents every wrapper method
with runnable examples — this doc is the companion, not the replacement.

---

**Next:** [09 · Saving & Publishing](09-saving-and-publishing.md).
