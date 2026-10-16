/* Example: Trivia Quest — a quiz game powered by a real, free,
   no-key API: the Open Trivia DB (https://opentdb.com).

   This is the canonical "use a free API in your game" example:
   - questions are fetched live with API.trivia.questions()
   - offline? a small built-in fallback keeps the game playable
   - UI is built from Panels, Labels, Buttons and a Timer bar. */
export default {
  name: 'trivia-quest',
  settings: { width: 1280, height: 720, background: '#141a2e' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Node2D', name: 'Quiz', script: `
{
  extends: 'Node2D',
  questions: [],
  index: 0,
  score: 0,
  streak: 0,
  best_streak: 0,
  state: 'loading',   // loading | asking | reveal | done

  /* Offline safety net — if the API is unreachable we still play. */
  fallback: [
    { question: 'Which engine powers this game?', answers: ['Goodness Engine', 'Badness Engine', 'Mediocrity Engine', 'No Engine'], correct_index: 0 },
    { question: 'What does a Timer node emit when it finishes?', answers: ['timeout', 'time-in', 'ding', 'finished'], correct_index: 0 },
    { question: 'Which node detects overlaps without colliding?', answers: ['Area2D', 'StaticBody2D', 'Camera2D', 'Label'], correct_index: 0 },
    { question: 'What is gravity by default in Goodness (px/s²)?', answers: ['980', '98', '9.8', '9800'], correct_index: 0 },
    { question: 'Which API provides this quiz when online?', answers: ['Open Trivia DB', 'Closed Trivia DB', 'Trivia Vault', 'QuizCorp'], correct_index: 0 },
    { question: 'Pixels travel downward along which axis?', answers: ['Y', 'X', 'Z', 'W'], correct_index: 0 },
    { question: 'Which method runs once when a node enters the tree?', answers: ['_ready()', '_start()', '_boot()', '_init_tree()'], correct_index: 0 },
    { question: 'What moves a CharacterBody2D safely?', answers: ['move_and_slide()', 'walk_please()', 'teleport()', 'shuffle()'], correct_index: 0 },
  ],

  _ready() {
    this.hud = this.get_node('../HUD');
    this.q_label = this.hud.get_node('Question');
    this.meta = this.hud.get_node('Meta');
    this.bar = this.hud.get_node('TimeBar');
    this.panel = this.hud.get_node('Panel');
    this.reveal = this.hud.get_node('Reveal');
    this.celebration = this.get_node('Celebration');
    this.buttons = [];
    for (let i = 0; i < 4; i++) {
      const b = this.hud.get_node('Answer' + i);
      b._idx = i;
      b.connect('pressed', () => { this._last_pressed = b._idx; this._answer(); });
      this.buttons.push(b);
    }
    this._load();
  },

  async _load() {
    this.q_label.text = 'Summoning questions…';
    this.meta.text = '';
    let online = true;
    try {
      this.questions = await API.trivia.questions({ amount: 8, category: 9, difficulty: 'medium' });
      this.meta.text = 'live from the Open Trivia DB 🌐';
    } catch (err) {
      online = false;
      this.questions = this.fallback;
      this.meta.text = 'offline mode — built-in questions';
    }
    this.index = 0; this.score = 0; this.streak = 0; this.best_streak = 0;
    this.state = 'asking';
    SFX.blip();
    this._show();
  },

  _show() {
    const q = this.questions[this.index];
    this.q_label.text = 'Q' + (this.index + 1) + '.  ' + q.question;
    for (let i = 0; i < 4; i++) {
      const b = this.buttons[i];
      const has = q.answers[i] !== undefined;
      b.visible = has;
      b.disabled = false;
      b.text = has ? q.answers[i] : '';
      b.bg_color = new Goodness.Color(0.16, 0.2, 0.31);
    }
    this.reveal.visible = false;
    this._time_left = 15;
    this._tick_timer = 0;
  },

  _answer() {
    if (this.state !== 'asking') return;
    const q = this.questions[this.index];
    const picked = this._last_pressed;
    const correct = picked === q.correct_index;
    if (correct) {
      this.score += 10 + Math.floor(this._time_left);
      this.streak++;
      this.best_streak = Math.max(this.best_streak, this.streak);
      this.buttons[picked].bg_color = new Goodness.Color(0.2, 0.6, 0.32);
      SFX.coin();
      this.celebration.position = this.buttons[picked].position.add(new Vector2(80, 20));
      this.celebration.burst(24);
    } else {
      this.streak = 0;
      if (picked >= 0) this.buttons[picked].bg_color = new Goodness.Color(0.7, 0.25, 0.25);
      this.buttons[q.correct_index].bg_color = new Goodness.Color(0.2, 0.6, 0.32);
      SFX.hurt();
    }
    this.state = 'reveal';
    this._reveal_timer = 1.2;
    this.reveal.text = correct ? 'Correct! ' + (this.streak > 1 ? this.streak + 'x streak! ' : '') : 'Nope — it was: ' + q.answers[q.correct_index];
    this.reveal.color = correct ? '#7ef0b0' : '#ff8f8f';
    this.reveal.visible = true;
  },

  _process(delta) {
    this.meta.text = this.meta.text.split(' · ')[0] + ' · score ' + this.score + ' · streak ' + this.streak;

    if (this.state === 'asking') {
      this._time_left -= delta;
      this.bar.value = Math.max(0, this._time_left / 15 * 100);
      if (this._time_left <= 0) {
        this._last_pressed = -1;
        this._answer();
      }
    } else if (this.state === 'reveal') {
      this._reveal_timer -= delta;
      if (this._reveal_timer <= 0) {
        this.index++;
        if (this.index >= this.questions.length) this._finish();
        else { this.state = 'asking'; this._show(); }
      }
    } else if (this.state === 'done-wait') {
      this._restart_timer -= delta;
      if (this._restart_timer <= 0) this._load();
    }
  },

  _finish() {
    this.state = 'done';
    SFX.win();
    const grade = this.score >= 100 ? 'S' : this.score >= 70 ? 'A' : this.score >= 40 ? 'B' : 'C';
    const prev_best = Save.get('trivia_best', 0);
    if (this.score > prev_best) Save.set('trivia_best', this.score);
    this.q_label.text = 'Finished!  Score: ' + this.score + '  (best streak ' + this.best_streak + ', grade ' + grade + ')';
    this.reveal.text = 'best: ' + Math.max(prev_best, this.score) + ' — restarting in 5s…';
    this.reveal.visible = true;
    for (const b of this.buttons) b.visible = false;
    this._restart_timer = 5;
    this.state = 'done-wait';
  },

}`, children: [
            { type: 'Particles2D', name: 'Celebration', props: { emitting: false, amount: 0, lifetime: 0.9, spread: 360, direction: 0, speed_min: 80, speed_max: 300, gravity: [0, 400], colors: ['#ffd257', '#7ef0b0', '#66e0d5', '#ff8fd4'], scale_min: 0.5, scale_max: 1.3 } },
          ] },

          /* ---------------- HUD ---------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Panel', name: 'Panel', props: { position: [140, 130], size: [1000, 200] } },
            { type: 'Label', name: 'Question', props: { position: [170, 155], text: 'Loading…', font_size: 30, size: [940, 150], autowrap: true } },
            { type: 'Label', name: 'Meta', props: { position: [140, 100], text: '', font_size: 20, size: [800, 26], color: '#9db0d0' } },
            { type: 'Button', name: 'Answer0', props: { position: [140, 360], size: [485, 60], font_size: 21, text: '…' } },
            { type: 'Button', name: 'Answer1', props: { position: [655, 360], size: [485, 60], font_size: 21, text: '…' } },
            { type: 'Button', name: 'Answer2', props: { position: [140, 440], size: [485, 60], font_size: 21, text: '…' } },
            { type: 'Button', name: 'Answer3', props: { position: [655, 440], size: [485, 60], font_size: 21, text: '…' } },
            { type: 'ProgressBar', name: 'TimeBar', props: { position: [140, 530], size: [1000, 16], value: 100, fill_color: '#7ef0b0' } },
            { type: 'Label', name: 'Reveal', props: { position: [140, 570], text: '', font_size: 26, size: [1000, 34], color: '#7ef0b0', visible: false } },
            { type: 'Label', name: 'Credit', props: { position: [140, 660], text: 'questions © Open Trivia DB (opentdb.com) — a free, keyless API', font_size: 15, size: [900, 20], color: '#5f6f8f' } },
          ] },
        ],
      },
    },
  },
};
