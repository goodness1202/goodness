/* Example: Particles Playground — click to burst, try the presets,
   watch tweens orbit. A tour of Goodness effects with zero assets. */
export default {
  name: 'particles-playground',
  settings: { width: 1280, height: 720, background: '#0d1120' },
  main_scene: 'main',
  assets: { scripts: {}, images: {} },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Node2D', name: 'FX', script: `
{
  extends: 'Node2D',
  presets: {
    fire:      { direction: -90, spread: 30, speed_min: 60, speed_max: 180, gravity: [0, -80], colors: ['#ff5a5f', '#ff9f43', '#ffd257'], lifetime: 1.0, scale_min: 0.8, scale_max: 2.0 },
    rain:      { direction: 90, spread: 8, speed_min: 300, speed_max: 420, gravity: [0, 200], colors: ['#58a6ff', '#66e0d5'], lifetime: 1.4, scale_min: 0.2, scale_max: 0.5 },
    confetti:  { direction: -90, spread: 360, speed_min: 100, speed_max: 400, gravity: [0, 400], colors: ['#ff5a5f', '#ffd257', '#59d98c', '#58a6ff', '#ff8fd4'], lifetime: 1.8, scale_min: 0.4, scale_max: 1.0 },
    fountain:  { direction: -90, spread: 50, speed_min: 250, speed_max: 450, gravity: [0, 500], colors: ['#66e0d5', '#7ef0b0', '#58a6ff'], lifetime: 1.2, scale_min: 0.4, scale_max: 1.0 },
    stars:     { direction: 0, spread: 360, speed_min: 20, speed_max: 90, gravity: [0, 0], colors: ['#ffffff', '#ffe98a', '#b18cff'], lifetime: 2.2, scale_min: 0.3, scale_max: 0.9 },
  },
  current: 'fire',

  _ready() {
    this.hud = this.get_node('../HUD');
    const names = Object.keys(this.presets);
    names.forEach((name, i) => {
      const b = this.hud.get_node('Btn' + i);
      b.text = name;
      b.connect('pressed', () => this._pick(name, b));
    });
    this._pick('fire', this.hud.get_node('Btn0'));
    /* spinning showcase sprites */
    for (let i = 0; i < 6; i++) {
      const s = new Goodness.Sprite();
      s.texture_src = choose(['goodness://star', 'goodness://gem', 'goodness://coin', 'goodness://heart']);
      s._angle = (i / 6) * Math.PI * 2;
      s._r = 190 + randf(60);
      this.add_child(s);
      this._orbiters = this._orbiters || [];
      this._orbiters.push(s);
    }
  },

  _pick(name, btn) {
    this.current = name;
    const p = this.presets[name];
    const label = this.hud.get_node('Preset');
    label.text = 'preset: ' + name + ' — click anywhere to burst!';
    for (let i = 0; i < 5; i++) this.hud.get_node('Btn' + i).bg_color = new Goodness.Color(0.16, 0.2, 0.31);
    if (btn) btn.bg_color = new Goodness.Color(0.12, 0.35, 0.55);
  },

  _input(ev) {
    if (ev.type === 'mouse' && ev.pressed) {
      const p = new Goodness.Particles2D();
      const pre = this.presets[this.current];
      for (const k of ['direction', 'spread', 'speed_min', 'speed_max', 'gravity', 'colors', 'lifetime', 'scale_min', 'scale_max']) {
        p[k] = Array.isArray(pre[k]) ? pre[k].slice() : pre[k];
      }
      p.emitting = false;
      p.amount = 0;
      p.global_position = ev.position;
      this.add_child(p);
      p.burst(40);
      SFX.play({ wave: 'triangle', freq: 300 + randf(300), freq_end: 900, dur: 0.12, vol: 0.25 });
      /* auto-clean after the show */
      this.get_tree().create_timer(3, () => p.queue_free());
    }
  },

  _process(delta) {
    const t = OS.ticks_msec / 1000;
    for (const s of (this._orbiters || [])) {
      const a = s._angle + t * 0.6;
      s.position = new Vector2(640 + Math.cos(a) * s._r, 330 + Math.sin(a) * s._r * 0.55);
      s.rotation += delta * 2;
    }
  }
}` },

          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Preset', props: { position: [140, 40], text: 'preset: fire', font_size: 26, size: [800, 32] } },
            { type: 'Button', name: 'Btn0', props: { position: [140, 640], size: [160, 48], text: 'fire' } },
            { type: 'Button', name: 'Btn1', props: { position: [320, 640], size: [160, 48], text: 'rain' } },
            { type: 'Button', name: 'Btn2', props: { position: [500, 640], size: [160, 48], text: 'confetti' } },
            { type: 'Button', name: 'Btn3', props: { position: [680, 640], size: [160, 48], text: 'fountain' } },
            { type: 'Button', name: 'Btn4', props: { position: [860, 640], size: [160, 48], text: 'stars' } },
          ] },
        ],
      },
    },
  },
};
