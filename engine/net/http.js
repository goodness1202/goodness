/* ==========================================================================
   Goodness Engine — net/http.js
   HTTPRequest node — Godot-style web requests:

     const http = get_node('HTTPRequest');
     http.connect('request_completed', this, '_on_data');
     http.request_json('https://pokeapi.co/api/v2/pokemon/25');

   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node, Logger } = GE;

  class HTTPRequest extends Node {
    constructor() {
      super();
      this.timeout = 15; // seconds
      this.add_signal('request_completed');  // (data, response)
      this.add_signal('request_failed');     // (error)
      this._abort = null;
      this.busy = false;
    }

    static def = {
      name: 'HTTPRequest', icon: '🌐', kind: 'Net', base: 'Node',
      desc: 'Fetch data from the web. Auto-parses JSON. Emits request_completed / request_failed.',
      props: [
        { path: 'timeout', type: 'number', min: 1, max: 120, step: 1, doc: 'Seconds before giving up.' },
      ],
      methods: [
        { sig: "request(url, {method, headers, body})", desc: 'Start a request (emits request_completed with text).' },
        { sig: "request_json(url)", desc: 'Same, but parses JSON for you.' },
      ],
    };

    async request(url, options = {}) {
      if (this.busy) { Logger.warn(`${this}: request already in flight.`); return false; }
      this.busy = true;
      try {
        const { text, status } = await GE.API.http.raw(url, Object.assign({ timeout: this.timeout }, options));
        this.busy = false;
        this.signals.request_completed.emit(text, { status, url });
        return true;
      } catch (err) {
        this.busy = false;
        this.signals.request_failed.emit(String(err && err.message || err));
        return false;
      }
    }

    async request_json(url, options = {}) {
      if (this.busy) { Logger.warn(`${this}: request already in flight.`); return false; }
      this.busy = true;
      try {
        const data = await GE.API.http.json(url, Object.assign({ timeout: this.timeout }, options));
        this.busy = false;
        this.signals.request_completed.emit(data, { status: 200, url });
        return true;
      } catch (err) {
        this.busy = false;
        this.signals.request_failed.emit(String(err && err.message || err));
        return false;
      }
    }
  }

  GE.Classes.register(HTTPRequest);
  GE.HTTPRequest = HTTPRequest;
})(globalThis.GE);
