/* ==========================================================================
   Goodness Engine — editor/tutorials.js
   Interactive, step-by-step tutorials that watch what you do and
   auto-advance. This is the engine training *you* — including a full
   lesson on using free web APIs in your games.
   ========================================================================== */
(function (GE) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Tiny event bus the editor emits to (node_added, play_started, …)    */
  /* ------------------------------------------------------------------ */
  const listeners = new Map();
  GE.TutorialEvents = {
    emit(type, data) {
      for (const fn of listeners.get(type) || []) { try { fn(data); } catch (e) {} }
      for (const fn of listeners.get('*') || []) { try { fn(type, data); } catch (e) {} }
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => { const a = listeners.get(type) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },
  };

  /* access to editor internals is injected by editor.js at render time */
  const Editor = {
    addNode: null, select: null, selected: null, play: null, stop: null,
    switchTab: null, openScript: null, status: null,
  };
  let _ed = null; /* real editor App reference */

  /* ================================================================== */
  /* Lessons                                                             */
  /* ================================================================== */
  const LESSONS = [
    {
      id: 'hello',
      icon: '👋',
      title: 'Hello, Game!',
      time: '5 min',
      desc: 'Add a sprite, drag it around, attach a script, press Play. The complete editor loop.',
      steps: [
        {
          title: 'Meet the Scene tree',
          body: `Every Goodness game is a <b>tree of nodes</b>. On the left you can see your scene: a <code>Node2D</code> called <b>Main</b> with a <b>Ball</b> sprite inside.<br><br>➜ Click on <b>Ball</b> in the Scene panel to select it.`,
          check: { event: 'node_selected', when: (d, ctx) => ctx.selectedName() === 'Ball' },
        },
        {
          title: 'Drag it in the viewport',
          body: `The green dashed box is your selection. ➜ <b>Drag the ball</b> anywhere in the viewport with the left mouse button. Pan with middle-drag, zoom with the wheel.`,
          check: { event: 'node_moved' },
        },
        {
          title: 'Add a new node',
          body: `➜ Click the <b>＋</b> button above the Scene panel (top-left) and add a <b>Particles2D</b> node under Ball. Search for "particles" if the list is long.`,
          check: { event: 'node_added', when: (d) => d && d.type === 'Particles2D' },
        },
        {
          title: 'Give the ball a script',
          body: `With <b>Ball</b> selected, find the Inspector on the right and click the green banner <b>“📜 + Attach a script”</b>. A script editor opens with a template.<br><br>Replace the file content with this and press <b>💾 Save &amp; Check</b>:
          <div class="snippet">{
  extends: 'Sprite',
  vx: 320, vy: 260,
  _process(delta) {
    this.position.x += this.vx * delta;
    this.position.y += this.vy * delta;
    if (this.position.x &lt; 48 || this.position.x &gt; 1232) this.vx *= -1;
    if (this.position.y &lt; 48 || this.position.y &gt; 672) this.vy *= -1;
  },
}</div>`,
          check: { event: 'script_saved', when: (d, ctx) => ctx.selectedHasScript() },
        },
        {
          title: 'Press Play ▶',
          body: `Time to see it alive. Press the <b>▶</b> button in the top bar (or <code>F5</code>). The ball bounces around! Press <b>⏹</b> (or <code>Esc</code>) to come back to editing.`,
          check: { event: 'play_started' },
        },
        {
          title: 'Done! 🎉',
          body: `You just used the whole engine loop: <b>select → edit → script → play</b>. Your project autosaves in this browser.<br><br>Next: try <b>Coin Rush in 15 minutes</b> to build a real platformer, or <b>Free APIs in your game</b> to fetch live data from the internet.`,
          check: null,
        },
      ],
    },
    {
      id: 'platformer',
      icon: '🪙',
      title: 'Coin Rush in 15 minutes',
      time: '15 min',
      desc: 'Build a complete platformer: tilemap level, player controller, coins, HUD.',
      steps: [
        {
          title: 'A fresh scene',
          body: `➜ Open <b>File → New Project…</b>, call it "Coin Rush". You get an empty <code>Main</code> node.`,
          check: { event: 'project_loaded' },
        },
        {
          title: 'Paint a level with text',
          body: `➜ Click <b>＋</b> and add a <b>TileMap</b>. In the Inspector, find the <b>tiles</b> box and type your level — each character is a tile:<br>
          <div class="snippet">GGGGGGGGGGGG
G..........G
G..C....P..G
G....==....G
G..........G
GGGGGGGGGGGG</div>
          <code>G</code> grass (solid) · <code>=</code> one-way platform · <code>C</code> coin · <code>P</code> spawn marker · <code>.</code> air. Rows can be any length.`,
          check: { event: 'prop_changed', when: (d) => d && d.path === 'tiles' },
        },
        {
          title: 'The player body',
          body: `➜ Add a <b>CharacterBody2D</b> node named <code>Player</code>, then a <b>Sprite</b> child with texture <code>goodness://hero</code>. In the Inspector give the Player a collision shape: type <code>rect</code>, width 30, height 44. Set its <b>position</b> to about <code>(300, 150)</code> — above the floor.`,
          check: { event: 'node_added', when: (d) => d && d.type === 'CharacterBody2D' },
        },
        {
          title: 'The player script',
          body: `Select <b>Player</b> and attach this script:
          <div class="snippet">{
  extends: 'CharacterBody2D',
  speed: 340,
  jump_speed: 560,
  _physics_process(delta) {
    this.velocity.x = Input.get_axis('ui_left', 'ui_right') * this.speed;
    if (Input.is_action_just_pressed('jump') &amp;&amp; this.is_on_floor()) {
      this.velocity.y = -this.jump_speed;
      SFX.jump();
    }
    this.velocity.y += 1000 * delta;
    this.move_and_slide();
  },
}</div>
          This is the classic Goodness platformer controller — gravity, run, jump, done.`,
          check: { event: 'script_saved', when: (d, ctx) => ctx.selectedHasScript() },
        },
        {
          title: 'Press Play ▶',
          body: `Run around with <code>A/D</code> or the arrows and jump with <code>Space</code>. The camera… wait, there is no camera yet! Stop the game and continue.`,
          check: { event: 'play_started' },
        },
        {
          title: 'Follow camera',
          body: `➜ Add a <b>Camera2D</b> as a <b>child of Player</b>. Because it lives inside the player, it follows automatically. Tick <b>current</b> (it's on by default now) and enable <b>smoothing_enabled</b> for buttery motion. Play again!`,
          check: { event: 'node_added', when: (d) => d && d.type === 'Camera2D' },
        },
        {
          title: 'Coins that count',
          body: `Coins deserve drama. Add an <b>Area2D</b> named <code>Coin</code> with a <b>Sprite</b> child (texture <code>goodness://coin</code>) and this script, then place it in the level:
          <div class="snippet">{
  extends: 'Area2D',
  _ready() {
    this.connect('body_entered', (body) => {
      if (body.name === 'Player') {
        SFX.coin();
        const t = this.create_tween();
        t.tween_property(this.get_child(0), 'scale', new Vector2(2, 2), 0.15)
         .then(() =&gt; this.queue_free());
      }
    });
  },
  _process(delta) { this.rotation += 3 * delta; },
}</div>`,
          check: { event: 'script_saved', when: (d, ctx) => ctx.selectedHasScript() },
        },
        {
          title: 'Keep going 🚀',
          body: `You have a platformer! Ideas to try next:<br>
          • Add an <b>enemy</b> — a CharacterBody2D that patrols and an <b>Area2D</b> that hurts the player<br>
          • Add <b>spikes</b> — put <code>^</code> in your tilemap and check for it with <code>level.world_to_map()</code><br>
          • Add a <b>HUD</b> — a <b>CanvasLayer</b> with a <b>Label</b> score<br>
          • Or load the <b>Coin Rush</b> example (File → Load Example) and read its scripts — they use everything you just learned.`,
          check: null,
        },
      ],
    },
    {
      id: 'api',
      icon: '🌐',
      title: 'Free APIs in your game',
      time: '12 min',
      desc: 'Fetch live data from PokéAPI / OpenTDB / Open-Meteo — free, no keys — and train yourself to wire any web API into a scene.',
      steps: [
        {
          title: 'What is an API, in 20 seconds',
          body: `An API is a website that returns <b>data instead of pages</b>. Goodness ships with a friendly wrapper for three complete, free, key-less APIs:<br><br>
          🐾 <b>PokéAPI</b> — creatures, stats, sprites, type charts<br>
          ❓ <b>Open Trivia DB</b> — thousands of quiz questions<br>
          🌦 <b>Open-Meteo</b> — live weather anywhere on Earth<br><br>
          In the <b>🌐 API + Snippets</b> tab you can run live examples right now — go ahead, open it, and press <b>Run</b> on the first snippet.`,
          check: { event: 'api_snippet_ran' },
          openTab: 'api',
        },
        {
          title: 'Fetch inside a script',
          body: `Scripts can call APIs with <code>await</code> — the game keeps running while data loads. Attach this to any node to pull a random creature:
          <div class="snippet">{
  extends: 'Node',
  _ready() { this._load(); },
  async _load() {
    try {
      const mon = await API.pokemon.random();
      Goodness.Logger.info('✨ ' + mon.name + ' — HP ' + mon.stats.hp);
      // mon.sprites.front is an image URL you can give to a Sprite
    } catch (e) {
      Goodness.Logger.warn('Offline: ' + e.message);
    }
  },
}</div>
          ➜ Attach it to the scene root (select <b>Main</b>, attach a script), press ▶ and watch the <b>Console</b>.`,
          check: { event: 'play_started' },
        },
        {
          title: 'Turn data into gameplay',
          body: `Stats want to be hit points. The pattern: <b>fetch → normalize → apply</b>.
          <div class="snippet">const mon = await API.pokemon.random();
hp_bar.max_value = mon.stats.hp * 2;
hp_bar.value = hp_bar.max_value;
await player_sprite.set_texture(mon.sprites.front);</div>
          The example game <b>Creature Clash</b> (File → Load Example) is a complete battler built on exactly this — sprites, HP bars and damage all come from the API, with an offline fallback.`,
          check: { event: 'example_loaded', when: (d) => d === 'creature-clash' || d === 'trivia-quest' },
        },
        {
          title: 'The golden rules',
          body: `1. <b>Always try/catch</b> — players go offline. Fall back to built-in data.<br>
          2. <b>Cache</b> — <code>API.*</code> caches for you (24h for PokéAPI, 10 min for weather).<br>
          3. <b>Never block</b> — use <code>async/await</code>, never freeze the loop.<br>
          4. <b>Any other API?</b> Use <code>API.http.get(url)</code> or the <b>HTTPRequest</b> node.<br><br>
          That's the whole skill. Check the 🌐 API tab for every endpoint, and <code>docs/07-free-apis.md</code> for the deep dive.`,
          check: null,
        },
      ],
    },
    {
      id: 'effects',
      icon: '✨',
      title: 'Juice it up',
      time: '8 min',
      desc: 'Tweens, particles, screen shake and sound — make it feel amazing.',
      steps: [
        {
          title: 'Tween anything',
          body: `Tweens animate values over time. Attach to any node:
          <div class="snippet">{
  extends: 'Sprite',
  _ready() {
    this.create_tween()
      .set_loops(0)                              // forever
      .tween_property(this, 'scale', new Vector2(1.3, 1.3), 0.4)
      .set_trans('sine_in_out')
      .tween_property(this, 'scale', new Vector2(1, 1), 0.4);
  },
}</div>`,
          check: { event: 'script_saved' },
        },
        {
          title: 'Particles without art',
          body: `Add a <b>Particles2D</b> node and play with direction, spread, gravity and the color ramp. Particles are perfect for dust when landing, fire on torches, explosions… <br><br>➜ Add a Particles2D node now.`,
          check: { event: 'node_added', when: (d) => d && d.type === 'Particles2D' },
        },
        {
          title: 'Shake the camera',
          body: `Any Camera2D can <code>shake()</code>. Put this where the action happens:
          <div class="snippet">camera.shake(0.3, 12);   // duration, strength
SFX.explosion();</div>
          Sound matters as much as pixels — <code>SFX.jump()</code>, <code>SFX.coin()</code>, <code>SFX.laser()</code>… all synthesized, no files needed. There's a full list in the 🌐 API tab.`,
          check: { event: 'play_started' },
        },
        {
          title: 'Go make something! 🚀',
          body: `You know the loop now. Ship a tiny game, then a bigger one. The <b>docs/</b> folder has a whole book, and every example game is a readable lesson.`,
          check: null,
        },
      ],
    },
  ];

  /* ================================================================== */
  /* Runner                                                              */
  /* ================================================================== */
  const Runner = {
    lesson: null,
    index: 0,
    unsub: [],

    start(lesson) {
      this.stop();
      this.lesson = lesson;
      this.index = 0;
      this.unsub = [];
      GE.TutorialEvents.emit('tutorial_started', lesson.id);
      this.render();
    },
    stop() {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.lesson = null;
    },
    checkCurrent() {
      const step = this.lesson.steps[this.index];
      if (!step || !step.check) return false;
      return !!step._satisfied;
    },
    advance() {
      if (this.index < this.lesson.steps.length - 1) {
        this.index++;
        this.render();
        GE.TutorialEvents.emit('tutorial_step', this.index);
      }
    },
    satisfy() {
      const step = this.lesson.steps[this.index];
      if (step && step.check && !step._satisfied) {
        step._satisfied = true;
        setTimeout(() => this.render(), 250);   /* let the user see the effect */
      }
    },
    render() {
      const box = document.getElementById('tab-tutorial');
      if (!box) return;
      if (!this.lesson) { GE.Tutorials.render(box); return; }
      const step = this.lesson.steps[this.index];
      const doneCount = this.index + (this.checkCurrent() ? 1 : 0);

      box.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'tut-runner';

      const nav = document.createElement('div');
      nav.className = 'tut-nav';
      const back = document.createElement('button');
      back.textContent = '← All tutorials';
      back.onclick = () => this.stop() || GE.Tutorials.render(box);
      const quit = document.createElement('button');
      quit.textContent = '✕ Exit lesson';
      quit.onclick = () => { this.stop(); GE.Tutorials.render(box); };
      nav.appendChild(back); nav.appendChild(quit);
      wrap.appendChild(nav);

      const h = document.createElement('h2');
      h.textContent = `${this.lesson.icon} ${this.lesson.title}`;
      wrap.appendChild(h);
      const prog = document.createElement('div');
      prog.className = 'progress';
      prog.textContent = `Step ${this.index + 1} of ${this.lesson.steps.length} · ${this.lesson.time}`;
      wrap.appendChild(prog);

      const card = document.createElement('div');
      card.className = 'tut-step' + (this.checkCurrent() ? ' done' : '');
      const title = document.createElement('div');
      title.className = 'step-title';
      title.textContent = `${this.index + 1}. ${step.title}`;
      card.appendChild(title);
      const body = document.createElement('div');
      body.className = 'step-body';
      body.innerHTML = step.body;
      card.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'step-actions';
      if (this.index > 0) {
        const prev = document.createElement('button');
        prev.textContent = '← Back';
        prev.onclick = () => { this.index--; this.render(); };
        actions.appendChild(prev);
      }
      const next = document.createElement('button');
      const isLast = this.index === this.lesson.steps.length - 1;
      next.textContent = this.checkCurrent() || !step.check
        ? (isLast ? 'Finish 🎉' : 'Next →')
        : 'Skip step →';
      next.onclick = () => {
        if (isLast) { this.stop(); GE.Tutorials.render(box); }
        else this.advance();
      };
      if (this.checkCurrent() || !step.check) next.style.borderColor = 'var(--accent)';
      actions.appendChild(next);
      card.appendChild(actions);

      if (this.checkCurrent()) {
        const yay = document.createElement('div');
        yay.style.cssText = 'color:#7ef0b0;font-size:12px;margin-top:8px';
        yay.textContent = '✓ Looks right — auto-advanced is armed, press Next';
        card.appendChild(yay);
      }
      wrap.appendChild(card);
      box.appendChild(wrap);

      /* open the tab the step wants */
      if (step.openTab && _ed && _ed.switchTab) _ed.switchTab(step.openTab);

      /* subscribe to completion events */
      const c = step.check;
      if (c) {
        const handler = (data) => {
          const ctx = makeCtx();
          if (!c.when || c.when(data, ctx)) this.satisfy();
        };
        this.unsub.push(GE.TutorialEvents.on(c.event, handler));
      }
    },
  };

  function makeCtx() {
    return {
      selectedName: () => _ed && _ed.selectedJson ? (_ed.selectedJson()?.name || '') : '',
      selectedHasScript: () => !!(_ed && _ed.selectedJson && _ed.selectedJson()?.script_name),
    };
  }

  /* ================================================================== */
  /* Public                                                              */
  /* ================================================================== */
  GE.Tutorials = {
    lessons: LESSONS,
    runner: Runner,
    /** Editor injects hooks so tutorials can drive the editor. */
    bind(editorApi) { _ed = editorApi; },
    render(container) {
      container.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'padding:16px 20px 0;color:var(--dim);font-size:12.5px';
      head.innerHTML = `<b style="color:var(--text)">📚 Learn Goodness</b> — guided lessons that watch your moves and auto-advance. No reading marathon: you build while you learn.`;
      container.appendChild(head);
      const list = document.createElement('div');
      list.className = 'tut-list';
      for (const lesson of LESSONS) {
        const card = document.createElement('div');
        card.className = 'tut-card';
        card.innerHTML = `<h3>${lesson.icon} ${lesson.title}</h3><p>${lesson.desc}</p>`;
        const meta = document.createElement('div');
        meta.style.display = 'flex';
        meta.style.justifyContent = 'space-between';
        meta.style.alignItems = 'center';
        meta.innerHTML = `<span class="tag">⏱ ${lesson.time}</span>`;
        const go = document.createElement('button');
        go.textContent = 'Start →';
        go.style.borderColor = 'var(--accent)';
        go.onclick = () => Runner.start(lesson);
        meta.appendChild(go);
        card.appendChild(meta);
        list.appendChild(card);
      }
      container.appendChild(list);
    },
  };
})(globalThis.GE);
