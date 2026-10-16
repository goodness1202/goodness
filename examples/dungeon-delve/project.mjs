/* Example: Dungeon Delve — a top-down dungeon crawler that shows off the
   engine's navigation, sensing and animation systems.

     • NavigationRegion2D — bakes the TileMap's walls into a walkable grid
     • NavigationAgent2D  — every slime chases you *around* the walls
     • RayCast2D          — line of sight: slimes only hunt what they can see
     • AnimationPlayer    — slime bobbing, gem spinning, hit flashes
     • Autoload 'Run'     — a project-wide singleton that survives scene
                            reloads (Godot-style autoloads)
     • Signal wiring      — the Timer's `timeout` is connected in the scene file

   Controls: WASD / arrows to move, X to dash, N to show the navigation grid. */
export default {
  name: 'dungeon-delve',
  settings: { width: 1280, height: 704, background: '#0b0f1a' },
  main_scene: 'main',

  /* project-wide singleton — reachable from any script as Autoloads.Run */
  autoloads: {
    Run: { script: `{
  extends: 'Node',
  score: 0,
  gems: 0,
  deaths: 0,
  best: 0,
  last_time: 0,

  reset() { this.score = 0; this.gems = 0; this.last_time = 0; },

  add_gem(value) {
    this.gems++;
    this.score += value;
    SFX.coin();
    return this.score;
  },

  die() {
    this.deaths++;
    this.score = Math.max(0, this.score - 25);
  },

  escaped(seconds, gems_left) {
    this.last_time = seconds;
    this.score += 250 + gems_left * 25;
    if (this.score > this.best) { this.best = this.score; Save.set('delve_best', this.best); }
    return this.score;
  },
}` },
  },

  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          /* --------------------------- floor & walls --------------------------- */
          { type: 'Polygon2D', name: 'Floor', props: {
            points: [[0, 0], [1280, 0], [1280, 704], [0, 704]], color: '#161c2e', z_index: -5,
          } },
          { type: 'TileMap', name: 'Level', props: { cell_size: 32, solid_tiles: '#', tiles: [
            '########################################',
            '#..........#...............#...........#',
            '#..........#..E............#...........#',
            '#..g.............g.........#...........#',
            '#......E...#............g..#...........#',
            '#..........#.......................g...#',
            '#..........#...............#...........#',
            '######.############.#############.######',
            '#..........#...............#...........#',
            '#..........#.........E.....#...........#',
            '#..........#...............#...........#',
            '#....P..............g......#...........#',
            '#..........#............E........E.....#',
            '#.......g..#...............#...........#',
            '#..........#...............#...........#',
            '####.############.################.#####',
            '#..........#...............#...........#',
            '#..........#....E..........#...g.......#',
            '#..........#...........................#',
            '#.....E....................#.......g.X.#',
            '#..........#...............#...........#',
            '########################################',
          ] } },

          /* the walkable grid is baked from the tilemap at scene start */
          { type: 'NavigationRegion2D', name: 'Nav', props: { agent_radius: 9, auto_tilemap: true } },

          { type: 'Node2D', name: 'Gems', script: `
{
  extends: 'Node2D',
  pickups: [],

  _ready() {
    this.level = this.get_node('../Level');
    this.player = this.get_node('../Player');
    const cells = this.level.get_cells_by_type('g');
    for (const cell of cells) {
      this.level.set_cell(cell.x, cell.y, '.');
      this._spawn(this.level.map_to_world(cell.x, cell.y));
    }
  },

  _spawn(world_pos) {
    const holder = new Goodness.Node2D();
    holder.name = 'Gem' + (this.pickups.length + 1);
    holder.position = world_pos;
    holder.taken = false;
    holder.modulate = new Goodness.Color(1, 1, 1, 1);

    const sprite = new Goodness.Sprite();
    sprite.name = 'Sprite';
    sprite.texture_src = 'goodness://gem';
    sprite.scale = new Vector2(0.5, 0.5);
    holder.add_child(sprite);

    /* each gem floats and spins with its own tiny AnimationPlayer */
    const anim = new Goodness.AnimationPlayer();
    anim.name = 'Anim';
    holder.add_child(anim);
    const base_y = holder.position.y;
    anim.animations = {
      float: { length: 1.6, loop: true, tracks: [
        { property: 'position.y', keys: [[0, base_y], [0.8, base_y - 9, 'sine_in_out'], [1.6, base_y]] },
      ] },
      spin: { length: 2, loop: true, tracks: [
        { node: 'Sprite', property: 'rotation', keys: [[0, 0], [2, 360]] },
      ] },
      collect: { length: 0.3, tracks: [
        { property: 'scale', keys: [[0, [1, 1]], [0.3, [1.7, 1.7], 'sine_out']] },
        { property: 'modulate', keys: [[0, '#ffffff'], [0.3, '#ffffff00']] },
      ] },
    };
    anim.play('float');
    anim.play('spin', { restart: true });

    this.add_child(holder);
    this.pickups.push(holder);
  },

  _process(delta) {
    if (!this.player || this.player.dead) return;
    for (const gem of this.pickups) {
      if (gem.taken || gem._freed) continue;
      const d = gem.global_position.distance_to(this.player.global_position);
      if (d < 26) {
        gem.taken = true;
        gem.get_node('Anim').play('collect');
        this.player.collect_gem(gem.global_position);
        const t = gem.create_tween();
        if (t) t.interval(0.3).then(() => gem.queue_free());
      }
    }
    this.pickups = this.pickups.filter((g) => !g._freed);
  },
}` },

          { type: 'Node2D', name: 'Enemies', script: `
{
  extends: 'Node2D',
  slimes: [],

  /* Every slime is a CharacterBody2D built at runtime *and given a script*
     with Goodness.Scripts — the same script system the editor uses. */
  slime_script: \`{
    extends: 'CharacterBody2D',
    speed: 62,
    sense_range: 300,
    damage: 1,
    cooldown: 0,

    _ready() {
      this.agent = this.get_node('Agent');
      this.anim = this.get_node('Anim');
      this.sprite = this.get_node('Sprite');
      this.eye = this.get_node('Eye');
      this.player = this.get_node('../../Player');
      this.home = this.position.copy();
      this.anim.play('bob');
    },

    _physics_process(delta) {
      if (!this.player || this.player.dead) { this.velocity = new Vector2(); this.move_and_slide(); return; }
      const to_player = this.player.global_position.sub(this.global_position);
      const dist = to_player.length;
      this.eye.target_position = to_player;
      const sees = dist < this.sense_range && !this.eye.is_colliding();

      if (sees) {
        this.agent.set_target(this.player.global_position);
        this.sprite.flip_h = to_player.x < 0;
      } else if (this.agent.is_navigation_finished(this.global_position)) {
        this.agent.set_target(this.home);
      }

      const dir = this.agent.move_body(this, delta, this.speed);
      this.anim.speed_scale = dir.length > 0.01 ? 1.7 : 0.8;

      if (this.cooldown > 0) this.cooldown -= delta;
      if (dist < 30 && this.cooldown <= 0) {
        this.cooldown = 1.2;
        this.player.take_hit(this.global_position);
      }
    },
  }\`,

  _ready() {
    this.level = this.get_node('../Level');
    this.nav = this.get_node('../Nav');
    const cells = this.level.get_cells_by_type('E');
    for (const cell of cells) {
      this.level.set_cell(cell.x, cell.y, '.');
      this._spawn(this.level.map_to_world(cell.x, cell.y));
    }
  },

  _spawn(world_pos) {
    const slime = new Goodness.CharacterBody2D();
    slime.name = 'Slime' + (this.slimes.length + 1);
    slime.position = world_pos;
    slime.shape = { type: 'circle', radius: 13 };

    const sprite = new Goodness.Sprite();
    sprite.name = 'Sprite';
    sprite.texture_src = 'goodness://slime';
    sprite.scale = new Vector2(0.5, 0.5);
    slime.add_child(sprite);

    const anim = new Goodness.AnimationPlayer();
    anim.name = 'Anim';
    slime.add_child(anim);
    anim.animations = {
      bob: { length: 1, loop: true, tracks: [
        { property: 'scale', keys: [[0, [1, 1]], [0.5, [1.12, 0.88], 'sine_in_out'], [1, [1, 1]]] },
      ] },
    };

    const agent = new Goodness.NavigationAgent2D();
    agent.name = 'Agent';
    agent.path_desired_distance = 12;
    agent.target_desired_distance = 14;
    slime.add_child(agent);

    const eye = new Goodness.RayCast2D();
    eye.name = 'Eye';
    eye.exclude_parent = true;
    slime.add_child(eye);

    Goodness.Scripts.attach_source(slime, this.slime_script);
    this.add_child(slime);
    this.slimes.push(slime);
    return slime;
  },

  _process(delta) {
    this.slimes = this.slimes.filter((s) => !s._freed);
  },

  count() { return this.slimes.length; },
}` },

          /* ------------------------------- the hero ------------------------------- */
          { type: 'CharacterBody2D', name: 'Player', props: {
            position: [176, 368],
            shape: { type: 'rect', width: 22, height: 26 },
          }, script: `
{
  extends: 'CharacterBody2D',
  speed: 210,
  dash_speed: 520,
  hp: 5,
  max_hp: 5,
  invuln: 0,
  dead: false,
  elapsed: 0,
  dash: 0,
  dash_cd: 0,

  _ready() {
    this.sprite = this.get_node('Sprite');
    this.cam = this.get_node('Camera');
    this.eye = this.get_node('Eye');
    this.anim = this.get_node('Anim');
    this.dust = this.get_node('Dust');
    this.sparkle = this.get_node('Sparkle');
    this.level = this.get_node('../Level');
    this.gems_node = this.get_node('../Gems');
    this.nav = this.get_node('../Nav');
    this.hud = this.get_node('../HUD');
    this.hp_label = this.hud.get_node('HP');
    this.score_label = this.hud.get_node('Score');
    this.message = this.hud.get_node('Message');
    this.msg_timer = 5;
    Autoloads.Run.reset();
    this.message.text = 'Find the door ★ — ' + this.gems_node.pickups.length + ' gems are hidden in the dark.';
    this._update_hud();
  },

  _physics_process(delta) {
    if (this.dead) return;
    this.elapsed += delta;

    /* --- movement --- */
    const dir = Input.get_vector('ui_left', 'ui_right', 'ui_up', 'ui_down');
    if (dir.length > 0.01) this.sprite.flip_h = dir.x < 0;
    this.dust.emitting = dir.length > 0.01;

    if (this.dash_cd > 0) this.dash_cd -= delta;
    if (Input.is_action_just_pressed('fire') && this.dash_cd <= 0 && dir.length > 0.01) {
      this.dash = 0.16;
      this.dash_cd = 0.9;
      SFX.laser();
    }
    if (this.dash > 0) {
      this.dash -= delta;
      this.velocity = dir.normalized.mul(this.dash_speed);
    } else {
      this.velocity = dir.mul(this.speed);
    }
    this.move_and_slide();
    this.rotation = 0;

    /* --- line of sight to the nearest slime (RayCast2D showcase) --- */
    const enemies = this.get_node('../Enemies');
    let nearest = null, best = 1e9;
    for (const s of enemies.slimes) {
      const d = s.global_position.distance_to(this.global_position);
      if (d < best) { best = d; nearest = s; }
    }
    if (nearest) this.eye.target_position = nearest.global_position.sub(this.global_position);

    /* --- invulnerability flicker --- */
    if (this.invuln > 0) {
      this.invuln -= delta;
      this.modulate = new Color(1, 1, 1, 0.55 + Math.sin(this.elapsed * 22) * 0.35);
    } else {
      this.modulate = new Color(1, 1, 1, 1);
    }
    if (this.msg_timer > 0) {
      this.msg_timer -= delta;
      if (this.msg_timer <= 0) this.message.text = '';
    }

    /* --- reached the exit? --- */
    const cell = this.level.world_to_map(this.global_position);
    if (this.level.get_cell(cell.x, cell.y) === 'X') this._escape();

    this._update_hud();
  },

  _input(ev) {
    if (ev.type === 'key' && ev.pressed && ev.code === 'KeyN') {
      this.nav.debug_draw = !this.nav.debug_draw;
      this._say(this.nav.debug_draw ? 'Navigation grid ON (green = walkable)' : 'Navigation grid off');
      return true;
    }
    return false;
  },

  _say(text) {
    this.message.text = text;
    this.msg_timer = 4;
  },

  collect_gem(pos) {
    Autoloads.Run.add_gem(10);
    this.sparkle.global_position = this.global_position;
    this.sparkle.burst(14);
    const left = this.gems_node.pickups.filter((g) => !g.taken).length;
    if (left === 0) this._say('Every gem collected! The door is worth more now ★');
    this._update_hud();
  },

  take_hit(from_pos) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= 1;
    this.invuln = 1.1;
    this.anim.play('hurt', { restart: true });
    this.cam.shake(0.3, 11);
    SFX.hurt();
    const away = this.global_position.sub(from_pos);
    if (away.length > 0.01) {
      const push = away.normalized.mul(240);
      this.tree.physics.move_character(this, push, 1 / 60, {});
    }
    if (this.hp <= 0) this._die();
    this._update_hud();
  },

  _die() {
    this.dead = true;
    Autoloads.Run.die();
    SFX.explosion();
    this.cam.shake(0.6, 18);
    this.sparkle.burst(40);
    Save.set('delve_runs', Save.get('delve_runs', 0) + 1);
    this._say('You fell in the dark… the dungeon rewinds (score ' + Autoloads.Run.score + ')');
    this.hp_label.text = '💀 defeated';
    /* the Timer in the scene file restarts us — no code needed */
    this.get_node('../Restart').start();
  },

  _escape() {
    if (this._escaped) return;
    this._escaped = true;
    SFX.win();
    const left = this.gems_node.pickups.filter((g) => !g.taken).length;
    const score = Autoloads.Run.escaped(this.elapsed, left);
    this.sparkle.burst(60);
    this._say('You escaped in ' + this.elapsed.toFixed(1) + 's with ' + Autoloads.Run.gems +
      '/8 gems — score ' + score + ' (best ' + Autoloads.Run.best + ')');
    this.get_node('../Restart').start();
  },

  _update_hud() {
    this.hp_label.text = '❤'.repeat(Math.max(0, this.hp)) + '·'.repeat(Math.max(0, this.max_hp - this.hp));
    const left = this.gems_node ? this.gems_node.pickups.filter((g) => !g.taken).length : 8;
    this.score_label.text = 'Score ' + Autoloads.Run.score + ' · gems ' + (8 - left) + '/8 · deaths ' +
      Autoloads.Run.deaths + ' · ' + this.elapsed.toFixed(1) + 's';
  },
}`, children: [
            { type: 'AnimationPlayer', name: 'Anim', props: { autoplay: 'idle', animations: {
              idle: { length: 1.2, loop: true, tracks: [
                { property: 'scale', keys: [[0, [1, 1]], [0.6, [1.04, 0.97], 'sine_in_out'], [1.2, [1, 1]]] },
              ] },
              hurt: { length: 0.4, tracks: [
                { property: 'modulate', keys: [[0, '#ffffff'], [0.1, '#ff5a5f'], [0.4, '#ffffff']] },
                { property: 'rotation', keys: [[0, 0], [0.1, -12], [0.25, 10], [0.4, 0]] },
              ] },
            } } },
            { type: 'Sprite', name: 'Sprite', props: { texture: 'goodness://hero', scale: [0.44, 0.44] } },
            { type: 'Camera2D', name: 'Camera', props: { current: true, smoothing_enabled: true, smoothing_speed: 6, limit_left: 0, limit_top: 0, limit_right: 1280, limit_bottom: 704 } },
            { type: 'RayCast2D', name: 'Eye', props: { target_position: [0, 0], debug_draw: false } },
            { type: 'Particles2D', name: 'Dust', props: {
              emitting: false, amount: 0, lifetime: 0.5, spread: 40, direction: 90,
              speed_min: 20, speed_max: 70, gravity: [0, 40], colors: ['#5f6f8f', '#3f4c66'], scale_min: 0.2, scale_max: 0.45,
            } },
            { type: 'Particles2D', name: 'Sparkle', props: {
              emitting: false, amount: 0, lifetime: 0.7, spread: 360, direction: 0,
              speed_min: 60, speed_max: 240, gravity: [0, 300], colors: ['#ffd257', '#7ef0b0'], scale_min: 0.3, scale_max: 0.8,
            } },
          ] },

          /* a Timer wired to the game *by the scene file* — no code at all */
          { type: 'Timer', name: 'Restart', props: { wait_time: 6, one_shot: true, autostart: false },
            connections: [{ signal: 'timeout', to: 'Game', method: '_on_restart' }] },
          { type: 'Node', name: 'Game', script: `
{
  extends: 'Node',
  _ready() { this.reload_guard = 0; },

  /* connected in the scene file to the Restart timer's timeout signal */
  _on_restart() {
    if (this.reload_guard) return;
    this.reload_guard = 1;
    Goodness.Logger.info('Restarting the dungeon…');
    this.tree.reload_current_scene();
  },
}` },

          /* --------------------------------- HUD --------------------------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Title', props: { position: [24, 14], text: '🗝️  Dungeon Delve', font_size: 24, size: [420, 30], color: '#eaf1ff', outline: 2 } },
            { type: 'Label', name: 'HP', props: { position: [24, 48], text: '❤❤❤❤❤', font_size: 22, size: [300, 28], color: '#ff8f8f' } },
            { type: 'Label', name: 'Score', props: { position: [24, 76], text: 'Score 0 · gems 0/8', font_size: 16, size: [520, 22], color: '#9db0d0' } },
            { type: 'Label', name: 'Message', props: { position: [24, 640], text: '', font_size: 20, size: [1000, 28], color: '#7ef0b0' } },
            { type: 'Label', name: 'Hint', props: { position: [24, 672], text: 'WASD / arrows move · X dash · N toggle the navigation grid', font_size: 14, size: [900, 20], color: '#5f6f8f' } },
          ] },
        ],
      },
    },
  },
};
