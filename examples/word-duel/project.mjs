/* Example: Word Duel — a fast synonym duel powered by the Datamuse API
   (free, keyless, CORS-friendly).

   How it plays: a word appears, four options follow, you pick the one that
   *means the same thing* — against the clock, with a growing streak bonus.
   Every answer is checked against the live API, so the game never lies.

   Engine features on show:
     • API.words.puzzle() / like() / describe() / suggest() — the word engine
     • Timer + ProgressBar countdown, Buttons as a menu, Particles for juice
     • AnimationPlayer for the button feedback and the shake on a miss
     • Save for the best score, and an offline fallback so it always runs */
export default {
  name: 'word-duel',
  settings: { width: 1280, height: 720, background: '#12182b' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Node', name: 'Duel', script: `
{
  extends: 'Node',

  /* round state */
  round: 0,
  score: 0,
  best: 0,
  streak: 0,
  best_streak: 0,
  target: '',
  correct_word: '',
  options: [],
  related: [],        /* every word the API says is related to the target */
  time_left: 0,
  time_limit: 10,
  locked: true,
  online: true,
  hint_used: false,

  /* a small pool of unrelated words, used as decoys (checked against the API
     so a decoy can never be a real synonym) */
  decoy_pool: [
    'ladder', 'pepper', 'window', 'guitar', 'harbour', 'lantern', 'cactus', 'marble',
    'sofa', 'thunder', 'basket', 'pencil', 'orbit', 'velvet', 'anchor', 'compass',
    'muffin', 'cobweb', 'tunnel', 'glacier', 'hammock', 'puzzle', 'saddle', 'meadow',
    'cavern', 'quilt', 'zeppelin', 'wrench', 'pebble', 'bramble', 'canyon', 'fjord',
  ],

  _ready() {
    this.hud = this.get_node('../HUD');
    this.word_label = this.hud.get_node('Word');
    this.meta = this.hud.get_node('Meta');
    this.message = this.hud.get_node('Message');
    this.hint_label = this.hud.get_node('Hint');
    this.bar = this.hud.get_node('TimeBar');
    this.burst = this.get_node('../Burst');
    this.buttons = [];
    for (let i = 0; i < 4; i++) {
      const b = this.hud.get_node('Option' + i);
      b._index = i;
      b.connect('pressed', () => this.answer(b._index));
      this.buttons.push(b);
    }
    this.best = Save.get('word_duel_best', 0);
    this.next_round();
  },

  /* ---------------- rounds ---------------- */
  async next_round() {
    this.round++;
    this.locked = true;
    this.hint_used = false;
    this.time_limit = Math.max(6, 11 - Math.floor(this.round / 3));
    this.hint_label.text = 'H = hint (costs 3)   ·   1-4 to answer   ·   R = restart';
    this.message.text = 'Thinking of a word…';
    this.word_label.text = '…';
    for (const b of this.buttons) { b.text = ''; b.visible = false; b.disabled = true; }

    let puzzle = null;
    try {
      puzzle = await API.words.puzzle();
      this.online = true;
    } catch (err) {
      puzzle = API.words.offline_puzzle();
      this.online = false;
    }
    if (!puzzle || !puzzle.answers || puzzle.answers.length < 3) {
      puzzle = API.words.offline_puzzle();
      this.online = false;
    }

    this.target = puzzle.word;
    /* every related word counts as correct — the API grades, not a hardcoded key */
    this.related = puzzle.answers.map((a) => (typeof a === 'string' ? a : a.word)).filter((w) => w && !w.includes(' '));
    this.correct_word = choose(this.related.slice(0, 6));

    /* live check: ask the API which words mean the same thing as the target */
    try {
      const live = await API.words.like(this.target, 50);
      for (const w of live) {
        if (w.word && !w.word.includes(' ') && this.related.indexOf(w.word) === -1) this.related.push(w.word);
      }
    } catch (err) { /* offline: the puzzle's own answer list is enough */ }

    /* build the options: the right word plus decoys the API agrees are unrelated */
    const decoys = [];
    for (const w of this.decoy_pool) {
      if (this.related.indexOf(w) !== -1) continue;
      if (w === this.target) continue;
      if (decoys.length < 3) decoys.push(w);
    }
    while (decoys.length < 3) decoys.push('token' + randi_range(100, 999));
    this.options = [this.correct_word].concat(decoys);
    /* shuffle */
    for (let i = this.options.length - 1; i > 0; i--) {
      const j = randi_range(0, i);
      const t = this.options[i]; this.options[i] = this.options[j]; this.options[j] = t;
    }

    this.word_label.text = '“' + this.target + '”';
    const shown = Math.min(4, this.options.length);
    for (let i = 0; i < 4; i++) {
      const b = this.buttons[i];
      const has = i < shown;
      b.visible = has;
      b.disabled = !has;
      b.text = has ? this.options[i] : '';
      b.bg_color = new Color(0.13, 0.17, 0.26);
      b.anim && b.anim.play('appear', { restart: true });
    }
    this.meta.text = (this.online ? 'live from Datamuse 🌐' : 'offline word pack') +
      '   ·   round ' + this.round + '   ·   score ' + this.score + '   ·   streak ' + this.streak;
    this.message.text = 'Which word means the same as the big one?';
    this.message.color = '#9db0d0';
    this.time_left = this.time_limit;
    this.bar.value = 100;
    this.locked = false;
    SFX.blip();
  },

  /* ---------------- answering ---------------- */
  answer(index, automatic = false) {
    if (this.locked) return;
    const picked = this.options[index];
    if (!automatic && !picked) return;
    this.locked = true;

    const correct = automatic ? false : this.related.indexOf(picked) !== -1;
    if (correct) {
      this.streak++;
      this.best_streak = Math.max(this.best_streak, this.streak);
      const time_bonus = Math.round(this.time_left * 2);
      const streak_bonus = Math.min(20, this.streak * 2);
      this.score += 10 + time_bonus + streak_bonus;
      this.buttons[index].bg_color = new Color(0.18, 0.6, 0.34);
      this.buttons[index].anim && this.buttons[index].anim.play('pop', { restart: true });
      this.burst.position = this.buttons[index].position.add(new Vector2(this.buttons[index].size.x / 2, 24));
      this.burst.burst(24);
      SFX.coin();
      this.message.text = 'Correct!  “' + picked + '” ≈ “' + this.target + '”   (+' +
        (10 + time_bonus + streak_bonus) + ')' + (this.streak > 1 ? '   ' + this.streak + 'x streak' : '');
      this.message.color = '#7ef0b0';
      this._reveal_answer();
      this._after(0.9);
    } else {
      this.streak = 0;
      if (!automatic) {
        this.buttons[index].bg_color = new Color(0.66, 0.22, 0.26);
        this.buttons[index].anim && this.buttons[index].anim.play('shake', { restart: true });
      }
      SFX.hurt();
      this.score = Math.max(0, this.score - 2);
      this.message.text = automatic
        ? 'Time up! The answer was “' + this.correct_word + '”.'
        : 'Not quite — “' + picked + '” is not a synonym of “' + this.target + '”.';
      this.message.color = '#ff8f8f';
      this._reveal_answer();
      this._after(1.3);
    }
    this.meta.text = (this.online ? 'live from Datamuse 🌐' : 'offline word pack') +
      '   ·   round ' + this.round + '   ·   score ' + this.score + '   ·   streak ' + this.streak;
    if (this.score > this.best) { this.best = this.score; Save.set('word_duel_best', this.best); }
  },

  _reveal_answer() {
    for (const b of this.buttons) {
      if (!b.visible) continue;
      if (b.text === this.correct_word) b.bg_color = new Color(0.18, 0.6, 0.34);
      else if (b.text && this.related.indexOf(b.text) !== -1) b.bg_color = new Color(0.2, 0.42, 0.3);
      b.disabled = true;
    }
  },

  _after(seconds) {
    this._next_in = seconds;
    this._waiting_next = true;
  },

  /* ---------------- hints & keys ---------------- */
  async use_hint() {
    if (this.locked || this.hint_used) return;
    this.hint_used = true;
    this.score = Math.max(0, this.score - 3);
    /* the API can define the target word for us — free education */
    let info = null;
    try { info = await API.words.describe(this.target); } catch (err) { info = null; }
    if (info && info.definition) {
      this.message.text = '📖 ' + this.target + ' (' + (info.part_of_speech || 'word') + '): ' + info.definition;
    } else {
      this.message.text = '📖 No definition available offline — narrowing the options!';
    }
    this.message.color = '#ffd257';
    /* remove one wrong option */
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (!b.visible || b.text === this.correct_word) continue;
      if (this.related.indexOf(b.text) !== -1) continue;
      b.visible = false;
      b.disabled = true;
      break;
    }
    SFX.powerup();
  },

  _input(ev) {
    if (ev.type !== 'key' || !ev.pressed) return false;
    if (ev.code === 'KeyH') { this.use_hint(); return true; }
    if (ev.code === 'KeyR') { this.score = 0; this.streak = 0; this.round = 0; this.next_round(); return true; }
    const n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 4) {
      const b = this.buttons[n - 1];
      if (b && b.visible && !b.disabled) this.answer(n - 1);
      return true;
    }
    return false;
  },

  /* ---------------- loop ---------------- */
  _process(delta) {
    if (this._waiting_next) {
      this._next_in -= delta;
      if (this._next_in <= 0) { this._waiting_next = false; this.next_round(); }
      return;
    }
    if (this.locked) return;
    this.time_left -= delta;
    this.bar.value = Math.max(0, this.time_left / this.time_limit * 100);
    if (this.time_left <= 0) this.answer(-1, true);
  },
}`, children: [] },

          { type: 'Particles2D', name: 'Burst', props: {
            emitting: false, amount: 0, lifetime: 0.7, spread: 360, direction: 0,
            speed_min: 90, speed_max: 300, gravity: [0, 420],
            colors: ['#ffd257', '#7ef0b0', '#9cc4ff'], scale_min: 0.3, scale_max: 0.9,
          } },

          /* --------------------------------- HUD --------------------------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Title', props: { position: [340, 34], text: '📚  Word Duel', font_size: 34, size: [600, 44], align: 'center', color: '#eaf1ff', outline: 3 } },
            { type: 'Label', name: 'Meta', props: { position: [340, 92], text: 'loading…', font_size: 17, size: [600, 24], align: 'center', color: '#9db0d0' } },
            { type: 'Panel', name: 'CardPanel', props: { position: [340, 130], size: [600, 150], color: '#161c2e' } },
            { type: 'Label', name: 'Word', props: { position: [340, 168], text: '…', font_size: 62, size: [600, 80], align: 'center', color: '#ffd257', outline: 4 } },
            { type: 'Button', name: 'Option0', props: { position: [340, 310], size: [290, 74], font_size: 26, text: '…' }, children: [
              { type: 'AnimationPlayer', name: 'Anim', props: { animations: {
                appear: { length: 0.3, tracks: [ { property: 'scale', keys: [[0, [0.9, 0.9]], [0.3, [1, 1], 'back_out']] } ] },
                pop: { length: 0.35, tracks: [ { property: 'scale', keys: [[0, [1, 1]], [0.15, [1.08, 1.08], 'back_out'], [0.35, [1, 1]]] } ] },
                shake: { length: 0.34, tracks: [ { property: 'rotation', keys: [[0, 0], [0.08, -3], [0.16, 3], [0.24, -2], [0.34, 0]] } ] },
              } } },
            ] },
            { type: 'Button', name: 'Option1', props: { position: [650, 310], size: [290, 74], font_size: 26, text: '…' }, children: [
              { type: 'AnimationPlayer', name: 'Anim', props: { animations: {
                appear: { length: 0.3, tracks: [ { property: 'scale', keys: [[0, [0.9, 0.9]], [0.3, [1, 1], 'back_out']] } ] },
                pop: { length: 0.35, tracks: [ { property: 'scale', keys: [[0, [1, 1]], [0.15, [1.08, 1.08], 'back_out'], [0.35, [1, 1]]] } ] },
                shake: { length: 0.34, tracks: [ { property: 'rotation', keys: [[0, 0], [0.08, -3], [0.16, 3], [0.24, -2], [0.34, 0]] } ] },
              } } },
            ] },
            { type: 'Button', name: 'Option2', props: { position: [340, 398], size: [290, 74], font_size: 26, text: '…' }, children: [
              { type: 'AnimationPlayer', name: 'Anim', props: { animations: {
                appear: { length: 0.3, tracks: [ { property: 'scale', keys: [[0, [0.9, 0.9]], [0.3, [1, 1], 'back_out']] } ] },
                pop: { length: 0.35, tracks: [ { property: 'scale', keys: [[0, [1, 1]], [0.15, [1.08, 1.08], 'back_out'], [0.35, [1, 1]]] } ] },
                shake: { length: 0.34, tracks: [ { property: 'rotation', keys: [[0, 0], [0.08, -3], [0.16, 3], [0.24, -2], [0.34, 0]] } ] },
              } } },
            ] },
            { type: 'Button', name: 'Option3', props: { position: [650, 398], size: [290, 74], font_size: 26, text: '…' }, children: [
              { type: 'AnimationPlayer', name: 'Anim', props: { animations: {
                appear: { length: 0.3, tracks: [ { property: 'scale', keys: [[0, [0.9, 0.9]], [0.3, [1, 1], 'back_out']] } ] },
                pop: { length: 0.35, tracks: [ { property: 'scale', keys: [[0, [1, 1]], [0.15, [1.08, 1.08], 'back_out'], [0.35, [1, 1]]] } ] },
                shake: { length: 0.34, tracks: [ { property: 'rotation', keys: [[0, 0], [0.08, -3], [0.16, 3], [0.24, -2], [0.34, 0]] } ] },
              } } },
            ] },
            { type: 'ProgressBar', name: 'TimeBar', props: { position: [340, 500], size: [600, 14], value: 100, fill_color: '#7ef0b0', show_text: false } },
            { type: 'Label', name: 'Message', props: { position: [240, 536], text: '', font_size: 21, size: [800, 60], align: 'center', color: '#9db0d0', autowrap: true } },
            { type: 'Label', name: 'Hint', props: { position: [240, 610], text: '', font_size: 16, size: [800, 24], align: 'center', color: '#5f6f8f' } },
            { type: 'Label', name: 'Credit', props: { position: [240, 668], text: 'words & meanings: Datamuse (datamuse.com) — a free, keyless API · best score is saved', font_size: 14, size: [800, 20], align: 'center', color: '#4d5b78' } },
          ] },
        ],
      },
    },
  },
};
