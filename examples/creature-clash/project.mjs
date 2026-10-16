/* Example: Creature Clash — a turn-based battler powered by PokéAPI
   (https://pokeapi.co), a complete, free, no-key API.

   Two random creatures are fetched live: sprites, stats, types and
   type-effectiveness all come from the API. If you are offline, the
   game falls back to home-grown goo beasts so it always plays. */
export default {
  name: 'creature-clash',
  settings: { width: 1280, height: 720, background: '#101a2e' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Node2D', name: 'Battle', script: `
{
  extends: 'Node2D',
  state: 'loading',  // loading | menu | anim | over
  turn: 'you',

  _ready() {
    this.hud = this.get_node('../HUD');
    this.you = this.get_node('YouMon');
    this.foe = this.get_node('FoeMon');
    this.log = this.hud.get_node('Log');
    this.attack_btn = this.hud.get_node('Attack');
    this.new_btn = this.hud.get_node('NewBattle');
    this.attack_btn.connect('pressed', this, '_attack');
    this.new_btn.connect('pressed', this, '_new_battle');
    this.you_hp = this.hud.get_node('YouHP');
    this.foe_hp = this.hud.get_node('FoeHP');
    this.you_name = this.hud.get_node('YouName');
    this.foe_name = this.hud.get_node('FoeName');
    this.banner = this.hud.get_node('Banner');
    this._new_battle();
  },

  async _new_battle() {
    this.state = 'loading';
    this.banner.text = 'Consulting the creature archives… 🌐';
    this.banner.visible = true;
    this.attack_btn.visible = false;
    this.new_btn.visible = false;
    this.you._clear(); this.foe._clear();
    this.you_name.text = '…'; this.foe_name.text = '…';

    let yours, enemies;
    try {
      [yours, enemies] = await Promise.all([API.pokemon.random(), API.pokemon.random()]);
      /* type effectiveness straight from the API */
      const [atk_mult, def_mult] = await Promise.all([
        API.pokemon.effectiveness(yours.types, enemies.types),
        API.pokemon.effectiveness(enemies.types, yours.types),
      ]);
      this._mult = { you: atk_mult, foe: def_mult };
      this.online = true;
      this.log.text = 'Live data from PokéAPI · ' + yours.name + ' (' + yours.types.join('/') + ') vs ' + enemies.name + ' (' + enemies.types.join('/') + ')';
    } catch (err) {
      /* offline fallback: goo beasts with random stats */
      this.online = false;
      this._mult = { you: 1, foe: 1 };
      yours = this._goo('Goo A');
      enemies = this._goo('Goo B');
      this.log.text = 'Offline — battling home-grown goo. (Connect to the internet for 1000+ real creatures!)';
    }

    this.you_hp.max_value = yours.stats.hp * 2;
    this.foe_hp.max_value = enemies.stats.hp * 2;
    this._set_mon(this.you, yours, this.you_name, this.you_hp, false);
    this._set_mon(this.foe, enemies, this.foe_name, this.foe_hp, true);
    this.banner.visible = false;
    this.attack_btn.visible = true;
    this.state = 'menu';
    SFX.spawn();
  },

  _goo(name) {
    return {
      name: name,
      types: ['goo'],
      stats: { hp: randi_range(40, 80), attack: randi_range(30, 70), defense: randi_range(20, 60), speed: 50 },
      sprite: 'goodness://slime',
    };
  },

  async _set_mon(sprite, data, label, bar, flip) {
    label.text = data.name + '  ' + (data.types || []).map((t) => t.toUpperCase()).join(' / ') + '  ·  ATK ' + data.stats.attack + ' DEF ' + data.stats.defense;
    bar.value = bar.max_value;
    if (data.sprites && data.sprites.front) {
      await sprite.set_texture(data.sprites.front);
      sprite.scale = new Vector2(3, 3);   /* sprites are 96px — scale to ~288 */
    } else {
      await sprite.set_texture(data.sprite || 'goodness://slime');
      sprite.scale = new Vector2(3.5, 3.5);
    }
    sprite.flip_h = flip;
    sprite._data = data;
    sprite._max_hp = bar.max_value;
    sprite._hp = bar.max_value;
    sprite.visible = true;
    /* dramatic entrance */
    sprite.position = sprite.position.add(new Vector2(0, -60));
    sprite.create_tween().tween_property(sprite, 'position', sprite._home, 0.5).set_trans('back_out');
  },

  _attack() {
    if (this.state !== 'menu') return;
    this.state = 'anim';
    const attacker = this.turn === 'you' ? this.you : this.foe;
    const defender = this.turn === 'you' ? this.foe : this.you;
    const atk_bar = this.turn === 'you' ? this.foe_hp : this.you_hp;
    const mult = this.turn === 'you' ? this._mult.you : this._mult.foe;

    const power = attacker._data.stats.attack;
    const guard = defender._data.stats.defense;
    let dmg = Math.max(2, Math.round((power * (1 + Math.random() * 0.5) - guard * 0.4) * mult));
    const eff = mult > 1.01 ? ' — SUPER EFFECTIVE!' : mult < 0.99 ? ' — not very effective…' : '';
    const verb = choose(['strikes', 'bops', 'zaps', 'tackles', 'bites']);
    this.log.text = attacker._data.name + ' ' + verb + ' ' + defender._data.name + ' for ' + dmg + eff;

    /* lunge -> flash + shake -> damage bar */
    const home = attacker._home;
    const dir = this.turn === 'you' ? new Vector2(120, -40) : new Vector2(-120, -40);
    const t = attacker.create_tween();
    t.tween_property(attacker, 'position', home.add(dir), 0.16).set_trans('quad_in')
     .callback(() => {
        SFX.hit();
        this._burst_at(defender);
        defender._flash = 0.25;
        this.get_node('Cam').shake(0.2, 8);
        defender._hp = Math.max(0, defender._hp - dmg);
        atk_bar.value = defender._hp;
     })
     .tween_property(attacker, 'position', home, 0.22).set_trans('quad_out')
     .then(() => this._after_attack(defender));
  },

  _burst_at(node) {
    const p = this.get_node('Hits');
    p.global_position = node.global_position;
    p.burst(24);
  },

  _after_attack(defender) {
    if (defender._hp <= 0) {
      this.state = 'over';
      SFX.win();
      defender.visible = false;
      const winner = defender === this.foe ? this.you._data.name : this.foe._data.name;
      this.banner.text = winner + ' WINS! 🏆';
      this.banner.visible = true;
      this.attack_btn.visible = false;
      this.new_btn.visible = true;
      this.log.text += '   ·   ' + winner + ' takes the crown!';
      return;
    }
    this.turn = this.turn === 'you' ? 'foe' : 'you';
    this.state = 'menu';
    if (this.turn === 'foe') {
      /* the enemy answers on its own */
      this.get_tree().create_timer(0.7, () => { if (this.state === 'menu') this._attack(); });
    }
  }
}`, children: [
            { type: 'Camera2D', name: 'Cam', props: { current: true, position: [640, 360] } },
            { type: 'Sprite', name: 'YouMon', props: { position: [330, 430] }, script: `
{
  extends: 'Sprite',
  _ready() { this._home = this.position.copy(); this.visible = false; this._flash = 0; },
  _clear() { this.visible = false; },
  _process(delta) {
    if (this._flash > 0) {
      this._flash -= delta;
      this.modulate = Math.floor(OS.ticks_msec / 60) % 2 === 0 ? new Goodness.Color(1, 0.3, 0.3) : new Goodness.Color(1, 1, 1);
    } else if (this.visible) {
      this.modulate = new Goodness.Color(1, 1, 1);
      /* idle bob */
      if (!this._busy) this.position = this._home.add(new Vector2(0, Math.sin(OS.ticks_msec / 400) * 6));
    }
  }
}` },
            { type: 'Sprite', name: 'FoeMon', props: { position: [950, 380] }, script: `
{
  extends: 'Sprite',
  _ready() { this._home = this.position.copy(); this.visible = false; this._flash = 0; },
  _clear() { this.visible = false; },
  _process(delta) {
    if (this._flash > 0) {
      this._flash -= delta;
      this.modulate = Math.floor(OS.ticks_msec / 60) % 2 === 0 ? new Goodness.Color(1, 0.3, 0.3) : new Goodness.Color(1, 1, 1);
    } else if (this.visible) {
      this.modulate = new Goodness.Color(1, 1, 1);
      if (!this._busy) this.position = this._home.add(new Vector2(0, Math.sin(OS.ticks_msec / 460) * 6));
    }
  }
}` },
            { type: 'Particles2D', name: 'Hits', props: { emitting: false, amount: 0, lifetime: 0.6, spread: 360, direction: 0, speed_min: 60, speed_max: 320, gravity: [0, 200], colors: ['#ffd257', '#ff9f43', '#ffffff'], scale_min: 0.5, scale_max: 1.4 } },
          ] },

          /* ---------------- HUD ---------------- */
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Panel', name: 'Plate', props: { position: [80, 470], size: [500, 90] } },
            { type: 'Label', name: 'YouName', props: { position: [100, 482], text: '…', font_size: 19, size: [460, 26] } },
            { type: 'ProgressBar', name: 'YouHP', props: { position: [100, 516], size: [460, 26], value: 100, show_text: true, fill_color: '#59d98c' } },
            { type: 'Panel', name: 'Plate2', props: { position: [700, 110], size: [500, 90] } },
            { type: 'Label', name: 'FoeName', props: { position: [720, 122], text: '…', font_size: 19, size: [460, 26] } },
            { type: 'ProgressBar', name: 'FoeHP', props: { position: [720, 156], size: [460, 26], value: 100, show_text: true, fill_color: '#ff5a5f' } },
            { type: 'Label', name: 'Banner', props: { position: [140, 250], text: '', font_size: 40, align: 'center', size: [1000, 50], outline: 3, visible: false } },
            { type: 'Label', name: 'Log', props: { position: [140, 590], text: '', font_size: 21, size: [1000, 30], color: '#cfe0ff' } },
            { type: 'Button', name: 'Attack', props: { position: [540, 630], size: [200, 60], text: '⚔ Attack', font_size: 26, visible: false } },
            { type: 'Button', name: 'NewBattle', props: { position: [510, 630], size: [260, 60], text: '🔄 New Battle', font_size: 24, visible: false } },
            { type: 'Label', name: 'Credit', props: { position: [140, 680], text: 'creatures & stats from PokéAPI (pokeapi.co) — free, no API key, forever', font_size: 15, size: [900, 20], color: '#5f6f8f' } },
          ] },
        ],
      },
    },
  },
};
