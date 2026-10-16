/* Example: Masterpiece Match — a memory game whose cards are real
   paintings from the Art Institute of Chicago (a free, keyless, CC0 API).

   It shows off four engine systems at once:
     • API.art        — every round is a brand-new deck of public-domain art
     • AnimationPlayer — card flips, match pops and shake, driven by keyframes
     • ParallaxBackground/ParallaxLayer — a drifting, mirroring star field
     • Tweens + Particles + Save — the deal-in, the sparkles, the best score

   Offline? API.art.offline_deck() keeps the game playable with procedural art. */
export default {
  name: 'masterpiece-match',
  settings: { width: 1280, height: 720, background: '#0e1220' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          /* ---------- drifting star backdrop (mirroring parallax) ---------- */
          { type: 'ParallaxBackground', name: 'Sky', props: { layer: -1 }, children: [
            { type: 'ParallaxLayer', name: 'FarStars', props: { motion_scale: [0.06, 0.06], motion_mirroring: [420, 300] }, children: [
              { type: 'Sprite', name: 'S1', props: { position: [60, 70], texture: 'goodness://star', scale: [0.5, 0.5], modulate: '#8ea3c8' } },
              { type: 'Sprite', name: 'S2', props: { position: [250, 210], texture: 'goodness://diamond', scale: [0.28, 0.28], modulate: '#6f86ad' } },
              { type: 'Sprite', name: 'S3', props: { position: [370, 120], texture: 'goodness://circle', scale: [0.35, 0.35], modulate: '#5f7699' } },
              { type: 'Sprite', name: 'S4', props: { position: [150, 260], texture: 'goodness://star', scale: [0.3, 0.3], modulate: '#7d92b8' } },
            ] },
            { type: 'ParallaxLayer', name: 'NearStars', props: { motion_scale: [0.22, 0.18], motion_mirroring: [520, 360] }, children: [
              { type: 'Sprite', name: 'N1', props: { position: [90, 40], texture: 'goodness://star', scale: [0.75, 0.75] } },
              { type: 'Sprite', name: 'N2', props: { position: [430, 300], texture: 'goodness://diamond', scale: [0.5, 0.5], modulate: '#ffd257' } },
              { type: 'Sprite', name: 'N3', props: { position: [330, 60], texture: 'goodness://circle', scale: [0.4, 0.4], modulate: '#9fe8c5' } },
            ] },
          ] },

          /* ------------------------- the game board ------------------------- */
          { type: 'Node2D', name: 'Board', script: `
{
  extends: 'Node2D',

  /* grid geometry — 8 pairs on a 4x4 board */
  cols: 4, rows: 4, total: 8,
  card_w: 190, card_h: 150, gap: 18, origin_x: 233, origin_y: 52,

  cards: [], picked: [], busy: false, matches: 0, moves: 0, elapsed: 0, done: false,

  async _ready() {
    this.hud = this.get_node('../HUD');
    this.status = this.hud.get_node('Status');
    this.moves_label = this.hud.get_node('Moves');
    this.bar = this.hud.get_node('Pairs');
    this.sparkle = this.get_node('../Sparkle');
    this.hud.get_node('NewBtn').connect('pressed', () => this.new_gallery());

    /* the card back is generated at runtime — no image files anywhere */
    this.back_tex = Goodness.ProceduralTextures.create_custom('art_card_back', 128, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#2b3a63');
      g.addColorStop(1, '#141d33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#4fd38c';
      ctx.lineWidth = 7;
      ctx.strokeRect(7, 7, s - 14, s - 14);
      ctx.fillStyle = 'rgba(159,232,197,0.9)';
      ctx.font = 'bold 62px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', s / 2, s / 2 + 3);
    });

    await this.new_gallery();
  },

  /* ---------------- round setup ---------------- */
  async new_gallery() {
    this._clear();
    this.done = false;
    this.matches = 0; this.moves = 0; this.elapsed = 0;
    this.moves_label.text = 'Moves: 0   Pairs: 0 / ' + this.total;
    this.bar.value = 0;
    this.status.text = 'Contacting the Art Institute of Chicago…';

    let deck = null;
    try {
      deck = await API.art.collection(this.total, { query: 'painting', public_domain: true });
      this.online = true;
    } catch (err) {
      deck = API.art.offline_deck(this.total);
      this.online = false;
    }
    if (!deck || !deck.length) {
      deck = API.art.offline_deck(this.total);
      this.online = false;
    }

    this.artworks = deck;
    const faces = [];
    for (const a of deck) { faces.push(a); faces.push(a); }   /* two cards per artwork */
    this._shuffle(faces);

    faces.forEach((art, i) => this._make_card(i, art));

    this.status.text = this.online
      ? 'Live gallery: ' + deck.length + ' public-domain works · click a card'
      : 'Offline gallery — procedural stand-ins · click a card';
    SFX.spawn();
  },

  _shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = randi_range(0, i);
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
  },

  _clear() {
    for (const c of this.cards) c.queue_free();
    this.cards = [];
    this.picked = [];
    this.busy = false;
  },

  _make_card(i, art) {
    const col = i % this.cols, row = Math.floor(i / this.cols);
    const x = this.origin_x + col * (this.card_w + this.gap) + this.card_w / 2;
    const y = this.origin_y + row * (this.card_h + this.gap) + this.card_h / 2;

    const slot = new Goodness.Node2D();
    slot.name = 'Card' + i;
    slot.position = new Vector2(x, y + 340);      /* dealt in from below */
    slot.art = art;
    slot.revealed = false;
    slot.matched = false;

    /* underside */
    slot.back = new Goodness.Sprite();
    slot.back.name = 'Back';
    slot.back.texture = this.back_tex;
    const bs = Math.min(this.card_w / 128, this.card_h / 128);
    slot.back.scale = new Vector2(bs, bs);
    slot.add_child(slot.back);

    /* artwork side (loaded asynchronously) */
    slot.face = new Goodness.Sprite();
    slot.face.name = 'Face';
    slot.face.visible = false;
    slot.add_child(slot.face);
    Assets.load_texture(art.image_url || 'goodness://square').then((tex) => {
      if (!tex || slot._freed) return;
      slot.face.texture = tex;
      const w = tex.width || 128, h = tex.height || 128;
      const sc = Math.min(this.card_w / w, this.card_h / h);
      slot.face.scale = new Vector2(sc, sc);
    });

    /* one AnimationPlayer per card: flip, match pop, wrong-pair shake */
    const anim = new Goodness.AnimationPlayer();
    anim.name = 'Anim';
    slot.add_child(anim);
    anim.animations = {
      flip: { length: 0.28, tracks: [
        { property: 'scale.x', keys: [[0, 1], [0.14, 0.03, 'sine_in'], [0.28, 1, 'sine_out']] },
        { method: '_flip_mid', at: 0.14 },
      ] },
      pop: { length: 0.45, tracks: [
        { property: 'scale', keys: [[0, [1, 1]], [0.18, [1.16, 1.16], 'back_out'], [0.45, [1, 1], 'sine_out']] },
        { property: 'rotation', keys: [[0, 0], [0.2, 3, 'sine_out'], [0.45, 0]] },
      ] },
      shake: { length: 0.32, tracks: [
        { property: 'rotation', keys: [[0, 0], [0.08, -5], [0.16, 5], [0.24, -3], [0.32, 0]] },
      ] },
    };
    /* the flip's midpoint swaps the visible side (method track) */
    slot._flip_mid = () => {
      slot.revealed = !slot.revealed;
      slot.back.visible = !slot.revealed;
      slot.face.visible = slot.revealed;
      SFX.blip();
    };
    slot.flip = () => anim.play('flip', { restart: true });
    slot.play_anim = (n) => anim.play(n);

    this.add_child(slot);
    this.cards.push(slot);

    /* deal-in: a tween per card, staggered by index */
    const tween = slot.create_tween();
    if (tween) {
      tween.interval(i * 0.05)
        .tween_property(slot, 'position', new Vector2(x, y), 0.5)
        .set_trans('back_out');
    }
  },

  /* ---------------- input ---------------- */
  _input(ev) {
    if (ev.type === 'key' && ev.pressed) {
      if (ev.code === 'KeyR' || ev.code === 'Space') { this.new_gallery(); return true; }
      return false;
    }
    if (ev.type !== 'mouse' || !ev.pressed || ev.button !== 0) return false;
    if (this.busy || this.done) return false;

    /* mouse events arrive in screen space — convert to the world */
    const world = Input.get_world_mouse(this.tree);
    for (const card of this.cards) {
      if (card.matched || card.revealed || !card.face) continue;
      const gp = card.global_position;
      if (Math.abs(world.x - gp.x) <= this.card_w / 2 && Math.abs(world.y - gp.y) <= this.card_h / 2) {
        card.flip();
        SFX.click();
        this.picked.push(card);
        if (this.picked.length === 2) { this.busy = true; this._settle = 0.62; }
        return true;
      }
    }
    return false;
  },

  /* ---------------- game loop ---------------- */
  _process(delta) {
    if (!this.done) this.elapsed += delta;
    if (this.busy) {
      this._settle -= delta;
      if (this._settle <= 0) this._resolve();
    }
    this.moves_label.text = 'Moves: ' + this.moves + '   Pairs: ' + this.matches + ' / ' + this.total +
      '   Time: ' + this.elapsed.toFixed(1) + 's';
  },

  _resolve() {
    this.busy = false;
    const a = this.picked[0], b = this.picked[1];
    this.picked = [];
    this.moves++;

    if (a.art === b.art) {
      a.matched = b.matched = true;
      this.matches++;
      this.bar.value = this.matches / this.total * 100;
      SFX.coin();
      for (const c of [a, b]) {
        c.play_anim('pop');
        this.sparkle.global_position = c.global_position;
        this.sparkle.burst(20);
      }
      this.status.text = '✨ ' + a.art.title + ' — ' + a.art.artist +
        (a.art.date ? ' · ' + a.art.date : '');
      if (this.matches >= this.total) this._win();
    } else {
      for (const c of [a, b]) { c.play_anim('shake'); c.flip(); }
      SFX.hit();
      this.status.text = 'Not a pair — keep looking.';
    }
  },

  _win() {
    this.done = true;
    SFX.win();
    const best = Save.get('art_best_moves', null);
    const is_best = best === null || this.moves < best;
    if (is_best) Save.set('art_best_moves', this.moves);
    this.status.text = 'Gallery complete! ' + this.moves + ' moves in ' + this.elapsed.toFixed(1) + 's' +
      (is_best ? ' — NEW BEST!' : ' (best: ' + best + ' moves)') + '   ·   press R for a new gallery';
    this.bar.value = 100;
    for (const c of this.cards) c.play_anim('pop');
    this.sparkle.global_position = new Vector2(640, 700);
    this.sparkle.burst(60);
  },
}`, children: [] },

          { type: 'Particles2D', name: 'Sparkle', props: {
            emitting: false, amount: 0, lifetime: 0.85, spread: 360, direction: 0,
            speed_min: 90, speed_max: 340, gravity: [0, 520],
            colors: ['#ffd257', '#7ef0b0', '#9cc4ff', '#ff8fd4'], scale_min: 0.4, scale_max: 1.1,
          } },

          /* ---------------------------- HUD ---------------------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Title', props: { position: [233, 8], text: '🖼️  Masterpiece Match', font_size: 26, size: [700, 34], color: '#eaf1ff', outline: 2 } },
            { type: 'Label', name: 'Moves', props: { position: [233, 690], text: 'Moves: 0   Pairs: 0 / 8', font_size: 18, size: [600, 24], color: '#9db0d0' } },
            { type: 'Label', name: 'Status', props: { position: [233, 718], text: 'Loading…', font_size: 17, size: [820, 26], color: '#7ef0b0' } },
            { type: 'Panel', name: 'BarPanel', props: { position: [233, 676], size: [820, 4], color: '#1b2438' } },
            { type: 'ProgressBar', name: 'Pairs', props: { position: [233, 676], size: [820, 6], value: 0, fill_color: '#4fd38c', show_text: false } },
            { type: 'Button', name: 'NewBtn', props: { position: [1055, 690], size: [190, 46], text: '🎨 New gallery', font_size: 17 } },
            { type: 'Label', name: 'Credit', props: { position: [1055, 8], text: 'art: Art Institute of Chicago (CC0)', font_size: 13, size: [220, 40], color: '#5f6f8f', autowrap: true } },
          ] },
        ],
      },
    },
  },
};
