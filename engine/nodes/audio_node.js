/* ==========================================================================
   Goodness Engine — nodes/audio.js
   AudioPlayer node — plays audio files (URLs / project sounds).
   For zero-asset sound effects use the SFX synth singleton instead.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node } = GE;

  class AudioPlayer extends Node {
    constructor() {
      super();
      this.stream = null;        // url / data: url
      this.volume = 1;           // 0..2
     this.loop = false;
      this.autoplay = false;
      this._buffer = null;
      this._source = null;
      this._gain = null;
      this._playing = false;
      this._started_at = 0;
      this._offset = 0;
      this.add_signal('finished');
    }

    static def = {
      name: 'AudioPlayer', icon: '🔊', kind: 'Audio', base: 'Node',
      desc: 'Plays an audio file. For quick effects, try the SFX synth (no files needed).',
      props: [
        { path: 'stream', type: 'string', doc: 'Audio URL or data: URL (mp3/ogg/wav).' },
        { path: 'volume', type: 'number', min: 0, max: 2, step: 0.05, doc: 'Loudness.' },
        { path: 'loop', type: 'bool', doc: 'Loop playback.' },
        { path: 'autoplay', type: 'bool', doc: 'Play on scene start.' },
      ],
      methods: [
        { sig: 'play() / stop() / pause()', desc: 'Transport controls.' },
      ],
    };

    async _ready() {
      if (this.autoplay && this.stream) this.play();
    }

    async _load() {
      if (this._buffer || !this.stream) return this._buffer;
      const actx = GE.SFX.ensure_context();
      if (!actx) return null;
      try {
        const res = await fetch(this.stream);
        const arr = await res.arrayBuffer();
        this._buffer = await actx.decodeAudioData(arr);
      } catch (e) {
        GE.Logger.warn(`AudioPlayer '${this.name}': cannot load ${String(this.stream).slice(0, 60)} (${e.message})`);
        this._buffer = null;
      }
      return this._buffer;
    }

    async play(from = 0) {
      const buf = await this._load();
      if (!buf) return;
      this.stop();
      const actx = GE.SFX.ensure_context();
      if (!actx) return;
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.loop = this.loop;
      const gain = actx.createGain();
      gain.gain.value = this.volume;
      src.connect(gain).connect(actx.destination);
      src.onended = () => {
        if (this._source === src) {
          this._playing = false;
          if (!this.loop) this.signals.finished.emit();
        }
      };
      src.start(0, from);
      this._source = src;
      this._gain = gain;
      this._playing = true;
      this._started_at = actx.currentTime - from;
      this._offset = from;
    }

    stop() {
      if (this._source) {
        try { this._source.onended = null; this._source.stop(); } catch (e) {}
        this._source = null;
      }
      this._playing = false;
      this._offset = 0;
    }
    pause() {
      if (!this._playing) return;
      const actx = GE.SFX.ensure_context();
      this._offset += actx ? actx.currentTime - this._started_at : 0;
      this.stop();
      this._playing = false;
    }
    get playing() { return this._playing; }

    _process() {
      if (this._gain) this._gain.gain.value = this.volume;
    }
  }

  GE.Classes.register(AudioPlayer);
  GE.AudioPlayer = AudioPlayer;
})(globalThis.GE);
