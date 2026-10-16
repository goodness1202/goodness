/* ==========================================================================
   Goodness Engine — audio/sfx.js
   A tiny WebAudio synthesizer: ready-made game SFX and a chiptune music
   sequencer — so every game has sound without shipping audio files.

     SFX.jump();  SFX.coin();  SFX.explosion();
     Music.play([{ n: 'E4', d: 0.5 }, { n: 'G4', d: 0.5 }, ...]);
   ========================================================================== */
(function (GE) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;

  function ensure_context() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  /* unlock audio on first user gesture (browser autoplay policy) */
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const unlock = () => { ensure_context(); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  /* ------------------------------------------------------------------ */
  /* Core synth voice                                                     */
  /* ------------------------------------------------------------------ */
  function tone({ wave = 'square', freq = 440, freq_end = null, dur = 0.15, vol = 0.5, attack = 0.005, decay = null, delay = 0 }) {
    const c = ensure_context();
    if (!c || muted) return;
    try {
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t0);
      if (freq_end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq_end), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* audio best-effort */ }
  }

  function noise({ dur = 0.25, vol = 0.4, delay = 0, filter_from = 3000, filter_to = 300 }) {
    const c = ensure_context();
    if (!c || muted) return;
    try {
      const t0 = c.currentTime + delay;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filter_from, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, filter_to), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(g).connect(master);
      src.start(t0);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Ready-made game sounds                                               */
  /* ------------------------------------------------------------------ */
  const SFX = {
    ensure_context,
    get muted() { return muted; },
    set_muted(m) { muted = !!m; if (master) master.gain.value = m ? 0 : 0.5; },

    jump() { tone({ wave: 'square', freq: 240, freq_end: 660, dur: 0.18, vol: 0.35 }); },
    coin() { tone({ wave: 'square', freq: 987, dur: 0.07, vol: 0.3 }); tone({ wave: 'square', freq: 1318, dur: 0.22, vol: 0.3, delay: 0.07 }); },
    hit() { tone({ wave: 'sawtooth', freq: 300, freq_end: 90, dur: 0.12, vol: 0.4 }); },
    hurt() { tone({ wave: 'sawtooth', freq: 200, freq_end: 70, dur: 0.28, vol: 0.45 }); },
    explosion() { noise({ dur: 0.5, vol: 0.55, filter_from: 2000, filter_to: 80 }); tone({ wave: 'triangle', freq: 110, freq_end: 40, dur: 0.4, vol: 0.4 }); },
    laser() { tone({ wave: 'sawtooth', freq: 1400, freq_end: 220, dur: 0.14, vol: 0.25 }); },
    powerup() { [523, 659, 784, 1046].forEach((f, i) => tone({ wave: 'square', freq: f, dur: 0.09, vol: 0.3, delay: i * 0.07 })); },
    click() { tone({ wave: 'triangle', freq: 900, dur: 0.04, vol: 0.25 }); },
    blip() { tone({ wave: 'square', freq: 660, dur: 0.05, vol: 0.2 }); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ wave: 'square', freq: f, dur: 0.14, vol: 0.32, delay: i * 0.11 })); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone({ wave: 'triangle', freq: f, dur: 0.2, vol: 0.35, delay: i * 0.15 })); },
    step() { noise({ dur: 0.05, vol: 0.12, filter_from: 900, filter_to: 200 }); },
    spawn() { tone({ wave: 'sine', freq: 330, freq_end: 660, dur: 0.12, vol: 0.3 }); },

    /* fully custom one-shot */
    play({ wave = 'square', freq = 440, freq_end = null, dur = 0.15, vol = 0.4, delay = 0 } = {}) {
      tone({ wave, freq, freq_end, dur, vol, delay });
    },
    play_noise({ dur = 0.25, vol = 0.4, delay = 0 } = {}) {
      noise({ dur, vol, delay });
    },
  };

  /* ------------------------------------------------------------------ */
  /* Music: a cute step sequencer                                         */
  /* ------------------------------------------------------------------ */
  const NOTES = {};
  (() => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let octave = 1; octave <= 7; octave++) {
      for (let i = 0; i < 12; i++) {
        const midi = (octave + 1) * 12 + i;
        NOTES[names[i] + octave] = 440 * Math.pow(2, (midi - 69) / 12);
      }
    }
  })();

  let music_state = { playing: false, timer: null, index: 0, notes: [], opts: {} };

  const Music = {
    get playing() { return music_state.playing; },
    note_freq(n) { return NOTES[n] || 0; },

    /** Play a melody: [{n: 'E4', d: 0.5}, ...] (d = beats). */
    play(melody, opts = {}) {
      const o = Object.assign({ tempo: 120, wave: 'square', volume: 0.18, loop: true, bass: true, bass_wave: 'triangle', bass_volume: 0.10 }, opts);
      if (!Array.isArray(melody) || !melody.length) return;
      this.stop();
      music_state = { playing: true, index: 0, notes: melody.slice(), opts: o };
      const beat = 60 / o.tempo;
      const schedule_next = () => {
        if (!music_state.playing) return;
        const s = music_state;
        if (s.index >= s.notes.length) {
          if (!o.loop) { this.stop(); return; }
          s.index = 0;
        }
        const note = s.notes[s.index];
        const dur = (note.d || 1) * beat;
        if (note.n && note.n !== '-') {
          tone({ wave: o.wave, freq: NOTES[note.n] || 440, dur: Math.min(dur * 0.92, dur), vol: o.volume });
          /* simple bass: root one octave down every note */
          if (o.bass && (s.index % 2 === 0)) {
            tone({ wave: o.bass_wave, freq: (NOTES[note.n] || 440) / 2, dur: dur * 1.6, vol: o.bass_volume });
          }
        }
        s.index++;
        music_state.timer = typeof setTimeout !== 'undefined' ? setTimeout(schedule_next, dur * 1000) : null;
      };
      schedule_next();
    },

    stop() {
      music_state.playing = false;
      if (music_state.timer && typeof clearTimeout !== 'undefined') clearTimeout(music_state.timer);
      music_state.timer = null;
    },
  };

  GE.SFX = SFX;
  GE.Music = Music;
})(globalThis.GE);
