/* ==========================================================================
   Goodness Engine — core/textures.js
   The built-in art library: 30+ procedurally drawn textures so you can
   build complete games with zero downloaded assets. All names are used
   as 'goodness://<name>' in Sprite.texture.
   ========================================================================== */
(function (GE) {
  'use strict';

  const { Logger } = GE;
  const registry = new Map();   // name -> {size, draw}
  const cache = new Map();      // name -> Texture

  /* ---------- tiny drawing helpers (all take normalized 0..1 coords) --- */
  const P = (ctx) => ({
    px: (v, s) => v * s,
    circle(ctx, s, x, y, r, fill) {
      ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },
    rect(ctx, s, x, y, w, h, fill, r = 0) {
      const rr = Math.min(r, w / 2, h / 2) * s;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x * s, y * s, w * s, h * s, rr);
      else ctx.rect(x * s, y * s, w * s, h * s);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },
    poly(ctx, s, pts, fill) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },
    stroke(ctx, s, pts, color, w = 2) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)));
      ctx.strokeStyle = color; ctx.lineWidth = w * (s / 64); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    },
  });

  /* palette */
  const C = {
    ink: '#1b2130', white: '#f4f7ff', gold: '#ffd257', goldDark: '#d9a521',
    red: '#ff5a5f', redDark: '#c93a44', green: '#59d98c', greenDark: '#2f9e63',
    blue: '#58a6ff', blueDark: '#2f6fd6', purple: '#b18cff', cyan: '#66e0d5',
    skin: '#ffd9b3', orange: '#ff9f43', gray: '#9aa5b8', grayDark: '#5c6a82',
    steel: '#cdd7e6', steelDark: '#8a99b4', pink: '#ff8fd4', brown: '#a4713f',
    brownDark: '#7c5024', yellow: '#ffe98a',
  };

  /* ==================================================================== */
  /* Texture definitions                                                    */
  /* ==================================================================== */
  function define(name, size, draw) { registry.set(name, { size, draw }); }

  /* --- primitives --- */
  define('circle', 64, (ctx, s) => {
    const d = P(ctx);
    const g = ctx.createRadialGradient(s * 0.38, s * 0.35, s * 0.05, s * 0.5, s * 0.5, s * 0.5);
    g.addColorStop(0, '#8fd0ff'); g.addColorStop(1, C.blueDark);
    d.circle(ctx, s, 0.5, 0.5, 0.5, g);
    d.circle(ctx, s, 0.38, 0.36, 0.1, 'rgba(255,255,255,0.65)');
  });
  define('square', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.04, 0.04, 0.92, 0.92, C.orange, 0.12);
    d.rect(ctx, s, 0.12, 0.12, 0.76, 0.28, 'rgba(255,255,255,0.25)', 0.06);
    d.stroke(ctx, s, [[0.14, 0.62], [0.5, 0.24], [0.86, 0.62]], C.brownDark, 5);
  });
  define('star', 64, (ctx, s) => {
    const d = P(ctx);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.5 : 0.21;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    d.poly(ctx, s, pts, C.gold);
    d.circle(ctx, s, 0.44, 0.42, 0.05, '#fff2c2');
  });
  define('triangle', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.05], [0.95, 0.95], [0.05, 0.95]], C.cyan);
    d.poly(ctx, s, [[0.5, 0.3], [0.7, 0.85], [0.3, 0.85]], '#3aa89e');
  });
  define('diamond', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.02], [0.95, 0.5], [0.5, 0.98], [0.05, 0.5]], C.purple);
    d.poly(ctx, s, [[0.5, 0.18], [0.8, 0.5], [0.5, 0.82], [0.2, 0.5]], '#cbb0ff');
  });

  /* --- pickups --- */
  define('coin', 64, (ctx, s) => {
    const d = P(ctx);
    d.circle(ctx, s, 0.5, 0.5, 0.48, C.goldDark);
    d.circle(ctx, s, 0.5, 0.5, 0.4, C.gold);
    d.circle(ctx, s, 0.5, 0.5, 0.26, C.goldDark);
    ctx.fillStyle = C.gold; ctx.font = `bold ${s * 0.32}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', s * 0.5, s * 0.54);
  });
  define('gem', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.02], [0.9, 0.3], [0.5, 0.98], [0.1, 0.3]], C.cyan);
    d.poly(ctx, s, [[0.5, 0.02], [0.7, 0.3], [0.5, 0.6], [0.3, 0.3]], '#aef4ec');
  });
  define('heart', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.96);
    ctx.bezierCurveTo(s * 0.05, s * 0.62, s * 0.1, s * 0.06, s * 0.5, s * 0.3);
    ctx.bezierCurveTo(s * 0.9, s * 0.06, s * 0.95, s * 0.62, s * 0.5, s * 0.96);
    ctx.fillStyle = C.red; ctx.fill();
    d.circle(ctx, s, 0.34, 0.34, 0.08, 'rgba(255,255,255,0.55)');
  });
  define('key', 64, (ctx, s) => {
    const d = P(ctx);
    d.circle(ctx, s, 0.3, 0.3, 0.24, null);
    ctx.strokeStyle = C.gold; ctx.lineWidth = s * 0.09;
    ctx.beginPath(); ctx.arc(s * 0.3, s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.stroke();
    d.stroke(ctx, s, [[0.46, 0.46], [0.92, 0.92]], C.gold, 7);
    d.stroke(ctx, s, [[0.74, 0.74], [0.74, 0.92]], C.gold, 7);
    d.stroke(ctx, s, [[0.9, 0.72], [0.9, 0.9]], C.gold, 7);
  });
  define('potion', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.4, 0.04, 0.2, 0.16, C.steel, 0.03);
    d.circle(ctx, s, 0.5, 0.62, 0.34, C.pink);
    d.rect(ctx, s, 0.44, 0.18, 0.12, 0.1, '#d5609f');
    d.circle(ctx, s, 0.38, 0.5, 0.05, 'rgba(255,255,255,0.6)');
  });

  /* --- characters --- */
  define('hero', 64, (ctx, s) => {
    const d = P(ctx);
    /* body */
    d.rect(ctx, s, 0.22, 0.4, 0.56, 0.42, C.blue, 0.18);
    /* head */
    d.circle(ctx, s, 0.5, 0.28, 0.22, C.skin);
    /* eyes */
    d.circle(ctx, s, 0.42, 0.26, 0.035, C.ink);
    d.circle(ctx, s, 0.58, 0.26, 0.035, C.ink);
    /* cap */
    d.rect(ctx, s, 0.28, 0.12, 0.44, 0.12, C.red, 0.08);
    d.rect(ctx, s, 0.28, 0.22, 0.3, 0.05, C.redDark, 0.02);
    /* feet */
    d.rect(ctx, s, 0.26, 0.8, 0.18, 0.12, C.ink, 0.04);
    d.rect(ctx, s, 0.56, 0.8, 0.18, 0.12, C.ink, 0.04);
  });
  define('slime', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.beginPath();
    ctx.moveTo(s * 0.06, s * 0.9);
    ctx.bezierCurveTo(s * 0.02, s * 0.3, s * 0.98, s * 0.3, s * 0.94, s * 0.9);
    ctx.closePath();
    ctx.fillStyle = C.green; ctx.fill();
    d.circle(ctx, s, 0.36, 0.55, 0.06, C.ink);
    d.circle(ctx, s, 0.64, 0.55, 0.06, C.ink);
    d.stroke(ctx, s, [[0.4, 0.72], [0.47, 0.78], [0.6, 0.72]], C.ink, 3);
    d.circle(ctx, s, 0.3, 0.42, 0.05, 'rgba(255,255,255,0.5)');
  });
  define('ghost', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.42, s * 0.42, Math.PI, 0);
    ctx.lineTo(s * 0.92, s * 0.88);
    for (let i = 0; i < 4; i++) {
      const x0 = s * (0.92 - i * 0.22), x1 = s * (0.92 - (i + 1) * 0.22);
      ctx.quadraticCurveTo((x0 + x1) / 2, s * (i % 2 ? 0.78 : 0.98), x1, s * 0.88);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(235,240,255,0.94)'; ctx.fill();
    d.circle(ctx, s, 0.38, 0.4, 0.06, C.ink);
    d.circle(ctx, s, 0.62, 0.4, 0.06, C.ink);
  });
  define('alien', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.04], [0.86, 0.4], [0.68, 0.94], [0.32, 0.94], [0.14, 0.4]], C.green);
    d.circle(ctx, s, 0.5, 0.36, 0.16, '#eafff2');
    d.circle(ctx, s, 0.44, 0.36, 0.05, C.ink);
    d.circle(ctx, s, 0.58, 0.36, 0.05, C.ink);
    d.stroke(ctx, s, [[0.4, 0.66], [0.6, 0.66]], C.ink, 3);
  });
  define('robot', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.18, 0.16, 0.64, 0.56, C.steel, 0.1);
    d.rect(ctx, s, 0.28, 0.28, 0.44, 0.2, C.ink, 0.05);
    d.circle(ctx, s, 0.38, 0.38, 0.045, C.cyan);
    d.circle(ctx, s, 0.62, 0.38, 0.045, C.cyan);
    d.rect(ctx, s, 0.3, 0.56, 0.4, 0.08, C.steelDark, 0.03);
    d.rect(ctx, s, 0.44, 0.04, 0.12, 0.12, C.grayDark, 0.02);
    d.circle(ctx, s, 0.5, 0.04, 0.05, C.red);
    d.rect(ctx, s, 0.26, 0.76, 0.14, 0.16, C.grayDark, 0.04);
    d.rect(ctx, s, 0.6, 0.76, 0.14, 0.16, C.grayDark, 0.04);
  });
  define('skull', 64, (ctx, s) => {
    const d = P(ctx);
    d.circle(ctx, s, 0.5, 0.42, 0.42, '#e8ecf5');
    d.rect(ctx, s, 0.32, 0.66, 0.36, 0.24, '#e8ecf5', 0.06);
    d.circle(ctx, s, 0.36, 0.4, 0.1, C.ink);
    d.circle(ctx, s, 0.64, 0.4, 0.1, C.ink);
    d.poly(ctx, s, [[0.5, 0.5], [0.56, 0.62], [0.44, 0.62]], C.ink);
    ctx.fillStyle = C.ink;
    for (let i = 0; i < 3; i++) ctx.fillRect(s * (0.36 + i * 0.1), s * 0.72, s * 0.05, s * 0.14);
  });

  /* --- world --- */
  define('cloud', 96, (ctx, s) => {
    const d = P(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(s * 0.3, s * 0.6, s * 0.2, 0, Math.PI * 2);
    ctx.arc(s * 0.52, s * 0.45, s * 0.26, 0, Math.PI * 2);
    ctx.arc(s * 0.75, s * 0.62, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(s * 0.28, s * 0.6, s * 0.48, s * 0.2);
  });
  define('tree', 96, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.44, 0.6, 0.12, 0.36, C.brownDark, 0.02);
    d.poly(ctx, s, [[0.5, 0.02], [0.82, 0.42], [0.18, 0.42]], '#2f9e63');
    d.poly(ctx, s, [[0.5, 0.2], [0.9, 0.64], [0.1, 0.64]], '#3bb876');
    d.poly(ctx, s, [[0.5, 0.38], [0.96, 0.84], [0.04, 0.84]], '#4fd38c');
  });
  define('bush', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.fillStyle = '#3bb876';
    ctx.beginPath();
    ctx.arc(s * 0.3, s * 0.65, s * 0.2, 0, Math.PI * 2);
    ctx.arc(s * 0.55, s * 0.55, s * 0.25, 0, Math.PI * 2);
    ctx.arc(s * 0.8, s * 0.68, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    d.circle(ctx, s, 0.5, 0.5, 0.04, C.red);
    d.circle(ctx, s, 0.66, 0.6, 0.04, C.red);
  });
  define('rock', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.1, 0.9], [0.16, 0.5], [0.42, 0.24], [0.78, 0.34], [0.92, 0.72], [0.82, 0.9]], C.grayDark);
    d.poly(ctx, s, [[0.16, 0.5], [0.42, 0.24], [0.5, 0.5], [0.3, 0.62]], C.gray);
  });
  define('spike', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.02], [0.94, 0.96], [0.06, 0.96]], C.steel);
    d.poly(ctx, s, [[0.5, 0.2], [0.78, 0.92], [0.4, 0.9]], C.steelDark);
    d.rect(ctx, s, 0.02, 0.92, 0.96, 0.08, C.grayDark, 0.02);
  });
  define('flag', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.12, 0.04, 0.06, 0.92, C.grayDark, 0.02);
    d.poly(ctx, s, [[0.18, 0.08], [0.9, 0.24], [0.18, 0.44]], C.red);
  });
  define('door', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.12, 0.04, 0.76, 0.92, C.brownDark, 0.06);
    d.rect(ctx, s, 0.2, 0.12, 0.6, 0.84, C.brown, 0.05);
    d.circle(ctx, s, 0.68, 0.52, 0.05, C.gold);
  });
  define('chest', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.08, 0.42, 0.84, 0.5, C.brown, 0.06);
    ctx.beginPath();
    ctx.moveTo(s * 0.08, s * 0.44);
    ctx.quadraticCurveTo(s * 0.5, s * 0.06, s * 0.92, s * 0.44);
    ctx.closePath();
    ctx.fillStyle = C.brownDark; ctx.fill();
    d.rect(ctx, s, 0.42, 0.4, 0.2, 0.16, C.gold, 0.02);
    d.rect(ctx, s, 0.44, 0.44, 0.12, 0.12, C.goldDark, 0.02);
  });
  define('torch', 64, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.44, 0.4, 0.12, 0.56, C.brownDark, 0.02);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.02);
    ctx.quadraticCurveTo(s * 0.78, s * 0.22, s * 0.58, s * 0.42);
    ctx.lineTo(s * 0.42, s * 0.42);
    ctx.quadraticCurveTo(s * 0.22, s * 0.22, s * 0.5, s * 0.02);
    ctx.fillStyle = C.orange; ctx.fill();
    d.circle(ctx, s, 0.5, 0.3, 0.08, C.yellow);
  });
  define('flame', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.02);
    ctx.quadraticCurveTo(s * 0.9, s * 0.5, s * 0.6, s * 0.86);
    ctx.quadraticCurveTo(s * 0.5, s * 0.96, s * 0.4, s * 0.86);
    ctx.quadraticCurveTo(s * 0.1, s * 0.5, s * 0.5, s * 0.02);
    ctx.fillStyle = C.orange; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.3);
    ctx.quadraticCurveTo(s * 0.68, s * 0.6, s * 0.5, s * 0.82);
    ctx.quadraticCurveTo(s * 0.32, s * 0.6, s * 0.5, s * 0.3);
    ctx.fillStyle = C.yellow; ctx.fill();
  });
  define('bubble', 64, (ctx, s) => {
    const d = P(ctx);
    ctx.strokeStyle = 'rgba(140,220,255,0.9)'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(160,230,255,0.25)';
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.4, 0, Math.PI * 2); ctx.fill();
    d.circle(ctx, s, 0.36, 0.34, 0.08, 'rgba(255,255,255,0.8)');
  });

  /* --- arcade --- */
  define('ship', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.02], [0.78, 0.62], [0.5, 0.5], [0.22, 0.62]], C.steel);
    d.poly(ctx, s, [[0.5, 0.02], [0.62, 0.52], [0.5, 0.46], [0.38, 0.52]], C.cyan);
    d.poly(ctx, s, [[0.42, 0.56], [0.58, 0.56], [0.5, 0.95]], C.orange);
  });
  define('bullet', 32, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.4, 0.05, 0.2, 0.7, C.yellow, 0.08);
    d.poly(ctx, s, [[0.5, 0.02], [0.72, 0.4], [0.5, 0.3], [0.28, 0.4]], C.gold);
  });
  define('laser', 32, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.42, 0.0, 0.16, 1.0, C.cyan, 0.06);
    d.rect(ctx, s, 0.46, 0.0, 0.08, 1.0, C.white, 0.03);
  });
  define('paddle', 96, (ctx, s) => {
    const d = P(ctx);
    d.rect(ctx, s, 0.03, 0.3, 0.94, 0.4, C.blue, 0.14);
    d.rect(ctx, s, 0.1, 0.38, 0.8, 0.12, C.cyan, 0.06);
  });
  define('ball', 64, (ctx, s) => {
    const d = P(ctx);
    d.circle(ctx, s, 0.5, 0.5, 0.48, C.orange);
    ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.48, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.5); ctx.lineTo(s * 0.5, s * 0.03); ctx.stroke();
    d.circle(ctx, s, 0.38, 0.38, 0.09, 'rgba(255,255,255,0.5)');
  });
  define('arrow', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.95, 0.5], [0.5, 0.12], [0.5, 0.34], [0.05, 0.34], [0.05, 0.66], [0.5, 0.66], [0.5, 0.88]], C.white);
  });
  define('shield', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.04], [0.9, 0.2], [0.84, 0.7], [0.5, 0.96], [0.16, 0.7], [0.1, 0.2]], C.steel);
    d.poly(ctx, s, [[0.5, 0.16], [0.76, 0.28], [0.72, 0.62], [0.5, 0.8], [0.28, 0.62], [0.24, 0.28]], C.blue);
  });
  define('sword', 64, (ctx, s) => {
    const d = P(ctx);
    d.poly(ctx, s, [[0.5, 0.02], [0.6, 0.2], [0.6, 0.62], [0.4, 0.62], [0.4, 0.2]], C.steel);
    d.rect(ctx, s, 0.26, 0.6, 0.48, 0.08, C.brown, 0.03);
    d.rect(ctx, s, 0.44, 0.68, 0.12, 0.24, C.gold, 0.03);
  });
  define('smiley', 64, (ctx, s) => {
    const d = P(ctx);
    d.circle(ctx, s, 0.5, 0.5, 0.48, C.gold);
    d.circle(ctx, s, 0.34, 0.38, 0.07, C.ink);
    d.circle(ctx, s, 0.66, 0.38, 0.07, C.ink);
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.54, s * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.06; ctx.stroke();
  });

  /* ==================================================================== */
  /* Public API                                                             */
  /* ==================================================================== */
  const ProceduralTextures = {
    /** Create (and cache) a built-in texture by name. */
    create(name) {
      if (cache.has(name)) return cache.get(name);
      const def = registry.get(name);
      if (!def) return null;
      if (typeof document === 'undefined') {
        /* headless environments: placeholder keeps sizes consistent */
        const tex = new GE.Assets.Texture(null, def.size, def.size, `goodness://${name}`);
        cache.set(name, tex);
        return tex;
      }
      const cnv = document.createElement('canvas');
      cnv.width = def.size; cnv.height = def.size;
      const ctx = cnv.getContext('2d');
      if (!ctx) {
        const tex = new GE.Assets.Texture(null, def.size, def.size, `goodness://${name}`);
        cache.set(name, tex);
        return tex;
      }
      try { def.draw(ctx, def.size); } catch (e) { Logger.warn(`Procedural texture '${name}' failed: ${e.message}`); }
      const tex = new GE.Assets.Texture(cnv, def.size, def.size, `goodness://${name}`);
      cache.set(name, tex);
      return tex;
    },

    names() { return [...registry.keys()]; },
    has(name) { return registry.has(name); },

    /** Build your own texture at runtime: draw(ctx, size) — great for prototypes. */
    create_custom(name, size, draw) {
      if (typeof document === 'undefined') return new GE.Assets.Texture(null, size, size, name);
      const cnv = document.createElement('canvas');
      cnv.width = size; cnv.height = size;
      const ctx = cnv.getContext('2d');
      if (!ctx) return new GE.Assets.Texture(null, size, size, name);
      try { draw(ctx, size); } catch (e) { Logger.warn(`Custom texture '${name}' failed: ${e.message}`); }
      return new GE.Assets.Texture(cnv, size, size, name);
    },
  };

  GE.ProceduralTextures = ProceduralTextures;
})(globalThis.GE);
