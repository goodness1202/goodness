// shared/audio.js — dopamine audio system
// HIT  -> a calm beat (soft tonal note with decay)
// MISS -> noise (unpredictable static burst)
window.DopamineAudio = class DopamineAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
  }
  boot() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.10;
    this.master.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') {
      const resume = () => {
        this.ctx.resume();
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    }
    return this.ctx;
  }
  _note(f, t, type, gainV, dur) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainV, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  // calm beat: a gentle, musical note (plus a soft higher echo)
  playHit() {
    this.boot();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33];
    const f = notes[Math.floor(Math.random() * notes.length)];
    this._note(f, t, 'triangle', 0.05, 0.35);
    setTimeout(() => {
      if (this.ctx) this._note(f * 1.5, this.ctx.currentTime, 'sine', 0.02, 0.2);
    }, 140);
  }
  // noise: white-noise burst through a lowpass filter
  playMiss() {
    this.boot();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.25);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.25);
  }
};
