/* Example: Coin Rush — a complete platformer with a tilemap level,
   coins, a patrolling enemy, spikes, camera follow, HUD and a saved
   best time. No art files — everything is procedural.

   Tile legend: G grass · # stone · = one-way platform · C coin
                ^ spike · P spawn · X door · E enemy spawn
   Solid: G # B W D.  The map below is 28 x 11 cells of 48 px. */
export default {
  name: 'coin-rush',
  settings: { width: 1280, height: 720, background: '#1a2238' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          /* ------------------- level ------------------- */
          { type: 'TileMap', name: 'Level', props: { cell_size: 48, tiles: [
            'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
            'G..........................G',
            'G..C...........C...........G',
            'G.....G.....GG......===....G',
            'G...........C.......C..C...G',
            'G....==.........GGGGGGGGGG.G',
            'G......C...E...............G',
            'G..GG.......GGG....^^......G',
            'G.......................C..G',
            'G.....C.....P.....^^...XGGGG',
            'GGGGGGGGGGGGGGGGGGGGGGGGGGGG',
          ] } },

          /* ------------------- player ------------------- */
          { type: 'CharacterBody2D', name: 'Player', props: { position: [612, 450], shape: { type: 'rect', width: 30, height: 44 } }, script: `
{
  extends: 'CharacterBody2D',
  speed: 340,
  jump_speed: 560,
  score: 0,
  total_coins: 0,

  _ready() {
    this.sprite = this.get_node('Sprite');
    this.cam = this.get_node('Camera');
    this.label = this.get_node('../HUD/Score');
    this.msg = this.get_node('../HUD/Message');
    this.level = this.get_node('../Level');
    this.total_coins = this.level.get_cells_by_type('C').length;
    this.label.text = 'Coins: 0 / ' + this.total_coins + '    Time: 0.0s';
    this.spawn = this.position.copy();
    this._start = OS.ticks_msec / 1000;
  },

  _physics_process(delta) {
    /* run */
    const dir = Input.get_axis('ui_left', 'ui_right');
    this.velocity.x = dir * this.speed;
    if (dir !== 0) this.sprite.flip_h = dir < 0;

    /* jump — CharacterBody2D gives us coyote time for free */
    if (Input.is_action_just_pressed('jump') && this.is_on_floor()) {
      this.velocity.y = -this.jump_speed;
      SFX.jump();
    }
    /* gravity */
    this.velocity.y += 1000 * delta;
    this.move_and_slide();

    /* squash & stretch */
    const target_y = this.on_floor ? 1 : 1.15;
    this.sprite.scale = this.sprite.scale.lerp(new Vector2(1.1, target_y), 0.15);

    /* hazards & pits */
    if (this.global_position.y > 760 || this._on_spikes()) this._hurt();

    /* reached the door? */
    const cell = this.level.world_to_map(this.global_position);
    if (this.level.get_cell(cell.x, cell.y) === 'X' || this.level.get_cell(cell.x, cell.y + 1) === 'X') this._win();

    /* HUD */
    const t = OS.ticks_msec / 1000 - this._start;
    this.label.text = 'Coins: ' + this.score + ' / ' + this.total_coins + '    Time: ' + t.toFixed(1) + 's';
  },

  _on_spikes() {
    const cell = this.level.world_to_map(this.global_position.add(new Vector2(0, 18)));
    return this.level.get_cell(cell.x, cell.y) === '^';
  },

  collect() {
    this.score++;
    SFX.coin();
    if (this.score >= this.total_coins) {
      this.msg.text = 'All coins! Run to the door →';
      this.msg.visible = true;
    }
  },

  _hurt() {
    SFX.hurt();
    this.global_position = this.spawn;
    this.velocity = new Vector2(0, 0);
    this.cam.shake(0.35, 10);
  },

  _win() {
    if (this._won) return;
    this._won = true;
    SFX.win();
    const time = OS.ticks_msec / 1000 - this._start;
    const best = Save.get('best_time', null);
    let extra = (best === null || time < best)
      ? ' — NEW BEST!'
      : ' (best: ' + best.toFixed(1) + 's)';
    if (best === null || time < best) Save.set('best_time', time);
    this.msg.text = 'You made it! ' + this.score + '/' + this.total_coins + ' coins in ' + time.toFixed(1) + 's' + extra;
    this.msg.visible = true;
  }
}`, children: [
            { type: 'Sprite', name: 'Sprite', props: { texture: 'goodness://hero', scale: [1.1, 1.1] } },
            { type: 'Camera2D', name: 'Camera', props: { current: true, smoothing_enabled: true, smoothing_speed: 4, zoom: 1.15, offset: [0, -60], limit_left: 0, limit_top: -200, limit_right: 1344, limit_bottom: 528 } },
          ] },

          /* ------------------- coins ------------------- */
          { type: 'Node2D', name: 'Coins', script: `
{
  extends: 'Node2D',
  _ready() {
    /* build a coin Area2D for every 'C' cell in the tilemap */
    const level = this.get_node('../Level');
    const player = this.get_node('../Player');
    for (const cell of level.get_cells_by_type('C')) {
      const coin = new Goodness.Area2D();
      coin.name = 'Coin';
      coin.position = level.map_to_world(cell.x, cell.y);
      coin.shape = { type: 'circle', radius: 20 };
      const sprite = new Goodness.Sprite();
      sprite.texture_src = 'goodness://coin';
      coin.add_child(sprite);
      coin.add_to_group('coins');
      coin.connect('body_entered', (body) => {
        if (body.name === 'Player' && !coin._taken) {
          coin._taken = true;
          player.collect();
          const t = sprite.create_tween();
          t.tween_property(sprite, 'scale', new Vector2(1.8, 1.8), 0.12)
           .then(() => coin.queue_free());
        }
      });
      this.add_child(coin);
    }
  },
  _process(delta) {
    /* spin the coins */
    for (const c of this.get_children()) {
      const s = c.get_child(0);
      s.rotation += 3 * delta;
      s.scale = new Vector2(0.9 * Math.abs(Math.cos(s.rotation * 0.7)) + 0.15, 0.9);
    }
  }
}` },

          /* ------------------- enemy ------------------- */
          { type: 'CharacterBody2D', name: 'Enemy', props: { position: [552, 312], shape: { type: 'rect', width: 36, height: 36 } }, script: `
{
  extends: 'CharacterBody2D',
  dir: -1,
  speed: 130,

  _ready() { this.sprite = this.get_node('Sprite'); },

  _physics_process(delta) {
    this.velocity.x = this.dir * this.speed;
    this.velocity.y += 1000 * delta;
    this.move_and_slide();
    if (this.on_wall) this.dir *= -1;
    this.sprite.flip_h = this.dir > 0;
    const player = this.get_node('../Player');
    if (this.global_position.distance_to(player.global_position) < 42) player._hurt();
  }
}`, children: [
            { type: 'Sprite', name: 'Sprite', props: { texture: 'goodness://slime' } },
          ] },

          /* ------------------- HUD ------------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Panel', name: 'Panel', props: { position: [16, 16], size: [460, 54] } },
            { type: 'Label', name: 'Score', props: { position: [30, 30], text: 'Coins: 0', font_size: 24, size: [430, 30] } },
            { type: 'Label', name: 'Message', props: { position: [240, 90], text: '', font_size: 30, align: 'center', size: [800, 40], visible: false, outline: 3 } },
            { type: 'Label', name: 'Hint', props: { position: [240, 660], text: 'A/D or ←/→ move · Space jump · grab coins, dodge the slime, reach the door', font_size: 17, align: 'center', size: [800, 24], color: '#8ea3c8' } },
          ] },
        ],
      },
    },
  },
};
