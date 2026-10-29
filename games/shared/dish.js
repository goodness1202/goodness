// shared/dish.js — "brain cells in a dish" visualization
// Calm ripples spread after a hit; erratic static flashes after a miss.
// Base firing is rhythmic when dopamine is high, chaotic when it is low.
window.NeuronDish = class NeuronDish {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.neurons = [];
    for (let i = 0; i < 48; i++) {
      this.neurons.push({
        x: 0.10 + Math.random() * 0.80,
        y: 0.08 + Math.random() * 0.84,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.9
      });
    }
    // Sparse fixed connectivity: each neuron wired to its 4 nearest neighbors
    this.edges = [];
    for (let i = 0; i < this.neurons.length; i++) {
      const others = this.neurons.map((n, j) => ({
        j,
        d: Math.hypot(n.x - this.neurons[i].x, n.y - this.neurons[i].y)
      })).sort((a, b) => a.d - b.d).slice(1, 5);
      others.forEach(e => this.edges.push([i, e.j]));
    }

    this.wave = 0;      // calm ripple (0..1) after a hit
    this.waveX = 0.5;
    this.waveY = 0.5;
    this.flashes = [];  // noise flashes after a miss
    this.t = 0;
  }
  resize() {
    const r = this.dpr;
    this.c.width = this.c.clientWidth * r;
    this.c.height = this.c.clientHeight * r;
    this.ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  hit() {
    this.wave = 1;
    this.waveX = 0.25 + Math.random() * 0.5;
    this.waveY = 0.25 + Math.random() * 0.5;
  }
  miss() {
    for (let i = 0; i < 10; i++) {
      this.flashes.push({
        x: Math.random(), y: Math.random(),
        r: 0.04 + Math.random() * 0.10,
        t: 0, life: 0.35 + Math.random() * 0.45
      });
    }
  }
  draw(dopamine) {
    const ctx = this.ctx;
    const w = this.c.width / this.dpr;
    const h = this.c.height / this.dpr;
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, w, h);
    this.t += 0.015;

    // Synapses
    ctx.beginPath();
    for (const [i, j] of this.edges) {
      const a = this.neurons[i];
      const b = this.neurons[j];
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
    }
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.08 + dopamine * 0.14})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Spontaneous firing: rhythmic when dopamine is high, erratic when low
    this.neurons.forEach(n => {
      const fire = Math.sin(this.t * n.speed + n.phase) * 0.5 + 0.5;
      const chance = dopamine * 0.55 + (1 - dopamine) * 0.30;
      if (fire > 0.92 && Math.random() < chance) {
        ctx.beginPath();
        ctx.arc(n.x * w, n.y * h, 2 + dopamine * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96, 230, 200, ${0.5 + dopamine * 0.6})`;
        ctx.fill();
      }
    });

    // Calm ripple after a hit
    if (this.wave > 0.015) {
      const radius = (1 - this.wave) * 0.92;
      ctx.beginPath();
      ctx.arc(this.waveX * w, this.waveY * h, radius * Math.min(w, h), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(60, 230, 180, ${this.wave * 0.55})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      this.wave *= 0.94;
    }

    // Noise flashes after a miss
    this.flashes = this.flashes.filter(f => (f.t += 0.015) < f.life);
    this.flashes.forEach(f => {
      const a = 1 - f.t / f.life;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.r * w * (1 + f.t * 3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 240, 220, ${a * 0.9})`;
      ctx.fill();
    });
  }
};
