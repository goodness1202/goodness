/* Example: Hello Ball — your first Goodness game (2 minutes).
   A ball bounces around, particles burst where you click. */
export default {
  name: 'hello-ball',
  settings: { width: 1280, height: 720, background: '#141a2e' },
  main_scene: 'main',
  assets: {
    scripts: {},
    images: {},
  },
  scenes: {
    main: {
      root: {
        type: 'Node2D', name: 'Main',
        children: [
          { type: 'Sprite', name: 'Ball', props: { position: [200, 200], texture: 'goodness://ball' }, script: `
{
  extends: 'Sprite',
  vx: 380, vy: 300,
  _ready() { SFX.blip(); },
  _process(delta) {
    this.position.x += this.vx * delta;
    this.position.y += this.vy * delta;
    if (this.position.x < 48 || this.position.x > 1232) { this.vx *= -1; SFX.blip(); }
    if (this.position.y < 48 || this.position.y > 672) { this.vy *= -1; SFX.blip(); }
    this.rotation += 160 * delta;
  }
}` },
          { type: 'Particles2D', name: 'Burst', props: { amount: 0, emitting: false, lifetime: 0.8, speed_min: 120, speed_max: 360, spread: 360, direction: 0, gravity: [0, 500], colors: ['#ffd257', '#66e0d5', '#ff8fd4'] }, script: `
{
  extends: 'Particles2D',
  _input(ev) {
    if (ev.type === 'mouse' && ev.pressed) {
      this.global_position = ev.position;
      this.burst(26);
      SFX.click();
    }
  }
}` },
          { type: 'CanvasLayer', name: 'HUD', children: [
            { type: 'Label', name: 'Title', props: { position: [340, 60], text: 'Hello, Goodness!', font_size: 52, align: 'center', size: [600, 60], outline: 3 } },
            { type: 'Label', name: 'Hint', props: { position: [340, 660], text: 'click anywhere for sparkles', font_size: 20, align: 'center', size: [600, 26], color: '#8ea3c8' } },
          ] },
        ],
      },
    },
  },
};
