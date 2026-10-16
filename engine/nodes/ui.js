/* ==========================================================================
   Goodness Engine — nodes/ui.js
   UI controls: Label, Button, ProgressBar, Panel.
   Put them under a CanvasLayer for a camera-independent HUD.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Node2D, Vector2, Color } = GE;

  const FONT = (px, bold) => `${bold ? 'bold ' : ''}${px}px "Segoe UI", Inter, system-ui, sans-serif`;

  /* ==================================================================== */
  class Control extends Node2D {
    constructor() {
      super();
      this.size = new Vector2(120, 40);
    }
    static def = {
      name: 'Control', icon: '🧭', kind: 'UI', base: 'Node2D',
      desc: 'Base UI element (use Label / Button / ProgressBar / Panel).',
      props: [{ path: 'size', type: 'vector2', doc: 'Element size.' }],
      hidden: true,
    };
    get_rect() {
      const p = this.global_position;
      return new GE.Rect2(p.x, p.y, this.size.x, this.size.y);
    }
    contains_point(p) {
      const r = this.get_rect();
      /* position is the top-left corner for UI elements */
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    }
  }

  /* ==================================================================== */
  class Label extends Control {
    constructor() {
      super();
      this.text = 'Hello, Goodness!';
      this.font_size = 24;
      this.color = new Color(1, 1, 1);
      this.align = 'left';           // left | center | right
      this.outline = 0;
      this.outline_color = new Color(0, 0, 0);
      this.autowrap = false;         // wrap text inside size.x
      this.line_spacing = 1.25;
    }
    static def = {
      name: 'Label', icon: '🔤', kind: 'UI', base: 'Control',
      desc: 'Text on screen. Score, dialogue, titles.',
      props: [
        { path: 'text', type: 'string', doc: 'Text to show.' },
        { path: 'font_size', type: 'number', min: 8, max: 200, step: 1, doc: 'Font size.' },
        { path: 'color', type: 'color', doc: 'Text color.' },
        { path: 'align', type: 'enum', options: ['left', 'center', 'right'], doc: 'Alignment inside size.x.' },
        { path: 'outline', type: 'number', min: 0, max: 10, step: 1, doc: 'Outline thickness.' },
        { path: 'autowrap', type: 'bool', doc: 'Wrap words inside size.x.' },
        { path: 'size', type: 'vector2', doc: 'Wrap box (when autowrap is on).' },
      ],
    };
    _draw_this() { return true; }
    _wrap(ctx) {
      const max_w = this.size.x > 0 ? this.size.x : Infinity;
      const lines = [];
      for (const para of String(this.text).split('\n')) {
        const words = para.split(' ');
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > max_w && line) {
            lines.push(line); line = w;
          } else line = test;
        }
        lines.push(line);
      }
      return lines;
    }
    _draw(ctx) {
      ctx.font = FONT(this.font_size, true);
      ctx.textBaseline = 'top';
      const lines = this.autowrap ? this._wrap(ctx) : String(this.text).split('\n');
      const w = this.size.x > 0 ? this.size.x : (ctx.measureText(this.text).width || 0);
      let x = 0;
      if (this.align === 'center') x = w / 2;
      if (this.align === 'right') x = w;
      ctx.textAlign = this.align === 'left' ? 'left' : (this.align === 'center' ? 'center' : 'right');
      const lh = this.font_size * this.line_spacing;
      lines.forEach((line, i) => {
        if (this.outline > 0) {
          ctx.strokeStyle = this.outline_color.to_css();
          ctx.lineWidth = this.outline * 2;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, x, i * lh);
        }
        ctx.fillStyle = this.color.to_css();
        ctx.fillText(line, x, i * lh);
      });
    }
  }

  /* ==================================================================== */
  class Button extends Control {
    constructor() {
      super();
      this.text = 'Click me';
      this.font_size = 20;
      this.size = new Vector2(160, 48);
      this.bg_color = new Color(0.16, 0.20, 0.31);
      this.hover_color = new Color(0.22, 0.30, 0.47);
      this.pressed_color = new Color(0.12, 0.35, 0.55);
      this.text_color = new Color(1, 1, 1);
      this.corner_radius = 10;
      this.disabled = false;
      this._hover = false;
      this._pressed = false;
      this.add_signal('pressed');
      this.add_signal('hovered');
    }
    static def = {
      name: 'Button', icon: '🔘', kind: 'UI', base: 'Control',
      desc: 'Clickable button. Emits the "pressed" signal.',
      props: [
        { path: 'text', type: 'string', doc: 'Button label.' },
        { path: 'font_size', type: 'number', min: 8, max: 120, step: 1, doc: 'Font size.' },
        { path: 'size', type: 'vector2', doc: 'Button size.' },
        { path: 'bg_color', type: 'color', doc: 'Normal background.' },
        { path: 'hover_color', type: 'color', doc: 'Mouse-over background.' },
        { path: 'pressed_color', type: 'color', doc: 'While pressed.' },
        { path: 'text_color', type: 'color', doc: 'Label color.' },
        { path: 'corner_radius', type: 'number', min: 0, max: 40, step: 1, doc: 'Rounded corners.' },
        { path: 'disabled', type: 'bool', doc: 'Ignore clicks.' },
      ],
      methods: [
        { sig: "connect('pressed', node, 'method')", desc: 'React to clicks.' },
      ],
    };

    _ui_event(event) {
      if (this.disabled) return false;
      const p = event.position;
      if (event.type === 'mouse_motion') {
        const over = this.contains_point(p);
        if (over && !this._hover) { this._hover = true; this.signals.hovered.emit(); }
        if (!over) this._hover = false;
        return false;
      }
      if (event.type !== 'mouse') return false;
      if (event.button !== 0) return false;
      const over = this.contains_point(p);
      if (event.pressed) {
        if (over) { this._pressed = true; return true; }
        return false;
      }
      /* release */
      if (this._pressed && over) {
        this._pressed = false;
        this._hover = over;
        this.signals.pressed.emit();
        this._call_script_or_method('_on_pressed');
        return true;
      }
      this._pressed = false;
      return false;
    }

    _draw_this() { return true; }
    _draw(ctx) {
      const w = this.size.x, h = this.size.y;
      let bg = this.bg_color;
      if (this._pressed) bg = this.pressed_color;
      else if (this._hover) bg = this.hover_color;
      ctx.fillStyle = bg.to_css();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, w, h, this.corner_radius);
      else ctx.rect(0, 0, w, h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = FONT(this.font_size, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.text_color.to_css();
      ctx.fillText(this.text, w / 2, h / 2 + 1);
    }
  }

  /* ==================================================================== */
  class ProgressBar extends Control {
    constructor() {
      super();
      this.value = 70;
      this.max_value = 100;
      this.min_value = 0;
      this.bg_color = new Color(0.1, 0.12, 0.18);
      this.fill_color = new Color(0.35, 0.8, 0.45);
      this.show_text = false;
      this.font_size = 16;
      this.corner_radius = 8;
    }
    static def = {
      name: 'ProgressBar', icon: '📶', kind: 'UI', base: 'Control',
      desc: 'Health bars, loading bars, XP bars.',
      props: [
        { path: 'value', type: 'number', doc: 'Current value.' },
        { path: 'max_value', type: 'number', doc: 'Value at full bar.' },
        { path: 'size', type: 'vector2', doc: 'Bar size.' },
        { path: 'bg_color', type: 'color', doc: 'Track color.' },
        { path: 'fill_color', type: 'color', doc: 'Fill color.' },
        { path: 'show_text', type: 'bool', doc: 'Show the value as text.' },
      ],
    };
    _draw_this() { return true; }
    _draw(ctx) {
      const w = this.size.x, h = this.size.y;
      const ratio = GE.math.clamp((this.value - this.min_value) / ((this.max_value - this.min_value) || 1), 0, 1);
      ctx.fillStyle = this.bg_color.to_css();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, w, h, this.corner_radius); else ctx.rect(0, 0, w, h);
      ctx.fill();
      if (ratio > 0) {
        ctx.fillStyle = this.fill_color.to_css();
        ctx.beginPath();
        const fw = w * ratio;
        if (ctx.roundRect) ctx.roundRect(0, 0, fw, h, this.corner_radius); else ctx.rect(0, 0, fw, h);
        ctx.fill();
      }
      if (this.show_text) {
        ctx.font = FONT(this.font_size, true);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${Math.round(this.value)} / ${Math.round(this.max_value)}`, w / 2, h / 2);
      }
    }
  }

  /* ==================================================================== */
  class Panel extends Control {
    constructor() {
      super();
      this.size = new Vector2(320, 200);
      this.color = new Color(0.08, 0.10, 0.16, 0.85);
      this.border_color = new Color(1, 1, 1, 0.12);
      this.border_width = 1.5;
      this.corner_radius = 14;
    }
    static def = {
      name: 'Panel', icon: '▭', kind: 'UI', base: 'Control',
      desc: 'Rounded translucent panel — the backbone of good-looking HUDs.',
      props: [
        { path: 'size', type: 'vector2', doc: 'Panel size.' },
        { path: 'color', type: 'color', doc: 'Fill (alpha supported).' },
        { path: 'border_color', type: 'color', doc: 'Border color.' },
        { path: 'corner_radius', type: 'number', min: 0, max: 60, step: 1, doc: 'Corner rounding.' },
      ],
    };
    _draw_this() { return true; }
    _draw(ctx) {
      const w = this.size.x, h = this.size.y;
      ctx.fillStyle = this.color.to_css();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, w, h, this.corner_radius); else ctx.rect(0, 0, w, h);
      ctx.fill();
      if (this.border_width > 0) {
        ctx.strokeStyle = this.border_color.to_css();
        ctx.lineWidth = this.border_width;
        ctx.stroke();
      }
    }
  }

  for (const cls of [Control, Label, Button, ProgressBar, Panel]) GE.Classes.register(cls);
  GE.Control = Control;
  GE.Label = Label;
  GE.Button = Button;
  GE.ProgressBar = ProgressBar;
  GE.Panel = Panel;
})(globalThis.GE);
