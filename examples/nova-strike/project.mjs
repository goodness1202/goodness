/* Example: Nova Strike — a top-down arcade shooter.
   Waves of aliens, lasers, explosions, screen shake, HUD, high score.
   Demonstrates: instancing from scripts, pooling, particles, UI,
   game state, chiptune music and saved high scores. */
export default {
  name: 'nova-strike',
  settings: { width: 1280, height: 720, background: '#070a14' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Node2D', name: 'Game', script: `
{
  extends: 'Node2D',
  score: 0,
  wave: 0,
  lives: 3,
  state: 'title',   // title | playing | over

  _ready() {
    this.hud = this.get_node('../HUD');
    this.player = this.get_node('Player');
    this.player.visible = false;
    this.spawner = this.get_node('Spawner');
    this.cam = this.get_node('Camera');
    this.start_btn = this.hud.get_node('Start');
    this.start_btn.connect('pressed', this, '_start');
    this.best = Save.get('highscore', 0);
    this._refresh();
  },

  _refresh() {
    const h = this.hud;
    h.get_node('Score').text = 'Score ' + this.score + '   Wave ' + this.wave + '   Best ' + Math.max(this.best, this.score);
    h.get_node('Health').value = this.lives * 33.4;
    h.get_node('Title').visible = this.state !== 'playing';
    this.start_btn.visible = this.state !== 'playing';
    h.get_node('Over').visible = this.state === 'over';
  },

  _start() {
    this.score = 0; this.wave = 0; this.lives = 3;
    this.state = 'playing';
    this.player._reset();
    this.player.visible = true;
    for (const e of this.spawner.get_children()) e.queue_free();
    this.spawner._wave_timer = 0;
    this.spawner.enabled = true;
    this._refresh();
    SFX.powerup();
    Music.play([
      { n: 'E4', d: 0.5 }, { n: 'E4', d: 0.25 }, { n: 'G4', d: 0.25 }, { n: 'A4', d: 0.5 },
      { n: 'G4', d: 0.5 }, { n: 'E4', d: 0.5 }, { n: 'D4', d: 0.5 }, { n: 'E4', d: 1 },
    ], { tempo: 140, volume: 0.10 });
  },

  add_score(n) {
    this.score += n;
    if (this.score > this.best) { this.best = this.score; Save.set('highscore', this.score); }
    this._refresh();
  },

  player_hit() {
    if (this.state !== 'playing') return;
    this.lives--;
    this.cam.shake(0.4, 16);
    SFX.explosion();
    this.player._explode();
    this._refresh();
    if (this.lives <= 0) {
      this.state = 'over';
      this.spawner.enabled = false;
      for (const e of this.spawner.get_children()) e.queue_free();
      Music.stop();
      SFX.lose();
      this._refresh();
    } else {
      this.player._reset();
    }
  }
}`, children: [
            /* ---------------- player ---------------- */
            { type: 'Area2D', name: 'Player', props: { position: [640, 620], shape: { type: 'circle', radius: 22 } }, script: `
{
  extends: 'Area2D',
  speed: 420,
  fire_rate: 0.16,
  _cool: 0,
  _invuln: 0,

  _ready() {
    this.sprite = this.get_node('Sprite');
    this.thruster = this.get_node('Thruster');
    this.game = this.get_node('..');
    this.bullets = this.get_node('../Bullets');
  },

  _reset() {
    this.position = new Vector2(640, 620);
    this._invuln = 2;
  },

  _explode() {
    this.get_node('Boom').burst(40);
    this._invuln = 1.5;
  },

  _process(delta) {
    if (this.game.state !== 'playing') { this.visible = false; return; }
    this.visible = true;
    if (this._invuln > 0) {
      this._invuln -= delta;
      this.sprite.visible = Math.floor(OS.ticks_msec / 80) % 2 === 0;
    } else this.sprite.visible = true;

    /* fly */
    const v = Input.get_vector('ui_left', 'ui_right', 'ui_up', 'ui_down');
    this.position = this.position.add(v.mul(this.speed * delta));
    this.position.x = clamp(this.position.x, 30, 1250);
    this.position.y = clamp(this.position.y, 80, 690);
    this.sprite.rotation = v.x * 0.22;

    /* fire */
    this._cool -= delta;
    if ((Input.is_action_pressed('fire') || Input.is_action_pressed('ui_accept')) && this._cool <= 0) {
      this._cool = this.fire_rate;
      this.bullets._spawn(this.position.add(new Vector2(0, -30)), false);
      SFX.laser();
    }
  }
}`, children: [
              { type: 'Sprite', name: 'Sprite', props: { texture: 'goodness://ship', scale: [1.2, 1.2] } },
              { type: 'Particles2D', name: 'Thruster', props: { position: [0, 26], amount: 14, lifetime: 0.4, direction: 90, spread: 24, speed_min: 60, speed_max: 140, gravity: [0, -40, ], scale_min: 0.4, scale_max: 0.9, colors: ['#66e0d5', '#58a6ff'] } },
              { type: 'Particles2D', name: 'Boom', props: { emitting: false, amount: 0, lifetime: 0.9, spread: 360, direction: 0, speed_min: 80, speed_max: 340, gravity: [0, 0], colors: ['#ffd257', '#ff9f43', '#ff5a5f'], scale_min: 0.6, scale_max: 1.6 } },
            ] },

            /* ---------------- bullets ---------------- */
            { type: 'Node2D', name: 'Bullets', script: `
{
  extends: 'Node2D',
  _ready() { this.game = this.get_node('..'); this.spawner = this.get_node('../Spawner'); },
  _spawn(pos, enemy_bullet) {
    const b = new Goodness.Sprite();
    b.name = enemy_bullet ? 'EnemyBullet' : 'Bullet';
    b.texture_src = enemy_bullet ? 'goodness://ball' : 'goodness://laser';
    if (enemy_bullet) { b.scale = new Vector2(0.6, 0.6); b.modulate = new Goodness.Color(1, 0.4, 0.3); }
    b.position = pos;
    b._vy = enemy_bullet ? 300 : -720;
    this.add_child(b);
  },
  _process(delta) {
    for (const b of this.get_children()) {
      b.position.y += b._vy * delta;
      const gone = b.position.y < -30 || b.position.y > 750;
      if (gone) { b.queue_free(); continue; }
      if (b.name === 'Bullet') {
        for (const e of this.spawner.get_children()) {
          if (b.position.distance_to(e.position) < 30) {
            b.queue_free();
            e._hit();
            break;
          }
        }
      } else {
        const player = this.get_node('../Player');
        if (this.game.state === 'playing' && b.position.distance_to(player.position) < 28 && player._invuln <= 0) {
          b.queue_free();
          this.game.player_hit();
        }
      }
    }
  }
}` },

            /* ---------------- enemy spawner ---------------- */
            { type: 'Node2D', name: 'Spawner', script: `
{
  extends: 'Node2D',
  enabled: false,
  _wave_timer: 1.5,
  _t: 0,

  _ready() {
    this.game = this.get_node('..');
    this.bullets = this.get_node('../Bullets');
  },

  _process(delta) {
    if (!this.enabled) return;
    this._t += delta;
    this._wave_timer -= delta;
    if (this._wave_timer <= 0) {
      this.game.wave++;
      this.game._refresh();
      this._wave_timer = Math.max(3.5, 9 - this.game.wave * 0.6);
      const count = Math.min(10, 3 + this.game.wave);
      for (let i = 0; i < count; i++) this._spawn_enemy(i, count);
      SFX.spawn();
    }
    /* enemy behaviour + shooting */
    for (const e of this.get_children()) {
      e.position.y += e._vy * delta;
      e.position.x = e._base_x + Math.sin(this._t * e._wobble_speed + e._phase) * e._wobble;
      if (e._shoot_timer !== undefined) {
        e._shoot_timer -= delta;
        if (e._shoot_timer <= 0 && e.position.y > 0 && e.position.y < 500) {
          e._shoot_timer = randf_range(1.5, 4);
          this.bullets._spawn(e.position.add(new Vector2(0, 26)), true);
        }
      }
      if (e.position.y > 780) e.queue_free();
    }
  },

  _spawn_enemy(i, count) {
    const e = new Goodness.Sprite();
    e.name = 'Enemy';
    e.texture_src = choose(['goodness://alien', 'goodness://ghost', 'goodness://robot']);
    e._base_x = 120 + (i + 0.5) * (1040 / count);
    e.position = new Vector2(e._base_x, -40 - randf(60));
    e._vy = randf_range(46, 84) + this.game.wave * 4;
    e._wobble = randf_range(24, 70);
    e._wobble_speed = randf_range(1.2, 2.6);
    e._phase = randf(6.28);
    e._hp = 1 + Math.floor(this.game.wave / 4);
    e._shoot_timer = randf_range(0.8, 3.5);
    e._hit = () => {
      e._hp--;
      if (e._hp > 0) {
        e.modulate = new Goodness.Color(1, 0.5, 0.5);
        SFX.hit();
        const t = e.create_tween();
        t.tween_property(e, 'modulate', new Goodness.Color(1, 1, 1), 0.25);
        return;
      }
      /* boom! */
      const boom = new Goodness.Particles2D();
      boom.emitting = false; boom.amount = 0; boom.one_shot = true;
      boom.position = e.position.copy();
      boom.lifetime = 0.7; boom.spread = 360; boom.direction = 0;
      boom.speed_min = 80; boom.speed_max = 320;
      boom.colors = ['#ffd257', '#ff9f43', '#ff5a5f'];
      this.get_parent().add_child(boom);
      boom.burst(30);
      SFX.explosion();
      this.game.add_score(10);
      this.game.cam.shake(0.08, 3);
      e.queue_free();
    };
    this.add_child(e);
  }
}` },

            /* ---------------- camera ---------------- */
            { type: 'Camera2D', name: 'Camera', props: { current: true, position: [640, 360] } },
          ] },

          /* ---------------- HUD ---------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Title', props: { position: [340, 200], text: 'NOVA STRIKE', font_size: 84, align: 'center', size: [600, 90], outline: 4 } },
            { type: 'Label', name: 'Sub', props: { position: [340, 300], text: 'WASD / arrows to fly · X or Space to shoot', font_size: 22, align: 'center', size: [600, 30], color: '#9db0d0' } },
            { type: 'Label', name: 'Over', props: { position: [340, 260], text: 'GAME OVER', font_size: 64, align: 'center', size: [600, 70], color: '#ff6b6b', outline: 4, visible: false } },
            { type: 'Button', name: 'Start', props: { position: [560, 380], size: [160, 54], text: 'Launch!', font_size: 24 } },
            { type: 'Label', name: 'Score', props: { position: [24, 20], text: 'Score 0', font_size: 24, size: [700, 30] } },
            { type: 'ProgressBar', name: 'Health', props: { position: [24, 60], size: [240, 18], value: 100, show_text: false } },
          ] },
        ],
      },
    },
  },
};
