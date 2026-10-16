/* ==========================================================================
   Goodness Engine — editor/editor.js
   The visual editor: scene tree, inspector, viewport, play mode,
   script editor, assets, undo/redo and project I/O.

   The scene JSON is the single source of truth. Every edit mutates the
   JSON and refreshes (a) the preview tree in the viewport, (b) the
   panels. Play mode builds a live runtime from the same JSON.
   ========================================================================== */
(function () {
  'use strict';

  const GE = globalThis.GE;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  /* ================================================================== */
  /* State                                                                */
  /* ================================================================== */
  const App = {
    project: null,        // project object (same schema as examples)
    sceneName: null,      // currently open scene
    selectedId: null,     // _id of selected node JSON
    openScript: null,     // name of script in the editor
    undoStack: [], redoStack: [],
    snap: false,
    view: { x: 0, y: 0, zoom: 1 },   // editor pan/zoom (world -> screen)
    previewTree: null,    // static SceneTree used for rendering the edit view
    play: null,           // { engine, paused } while playing
    collapsed: new Set(), // collapsed tree rows
    tutorial: null,       // active tutorial runner
  };

  const STORAGE_KEY = 'goodness:editor-project';

  /* ================================================================== */
  /* Small helpers                                                       */
  /* ================================================================== */
  const uid = () => 'n' + Math.random().toString(36).slice(2, 9);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function status(msg) { $('#status-left').textContent = msg; }
  function log_line(rec) {
    const box = $('#console-log');
    const div = document.createElement('div');
    div.className = `log-line ${rec.level}`;
    div.innerHTML = `<span class="t">${rec.time}</span>`;
    div.appendChild(document.createTextNode(rec.text));
    box.appendChild(div);
    while (box.children.length > 500) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }
  GE.Logger.on_message(log_line);

  /* ================================================================== */
  /* Project & scene JSON helpers                                        */
  /* ================================================================== */
  function newProject(name = 'My Game') {
    return {
      name,
      settings: { width: 1280, height: 720, background: '#10131f', gravity: 980 },
      assets: { scripts: {}, images: {} },
      scenes: {
        main: { root: { type: 'Node2D', name: 'Main', _id: uid(), props: {}, children: [] } },
      },
      main_scene: 'main',
    };
  }

  function sceneJSON() {
    return App.project.scenes[App.sceneName];
  }
  function nodeRoot() { return sceneJSON().root; }

  function walkNodes(node, fn, parent = null) {
    if (!node) return;
    fn(node, parent);
    for (const c of node.children || []) walkNodes(c, fn, node);
  }
  function findNode(id) {
    let found = null;
    walkNodes(nodeRoot(), (n) => { if (n._id === id) found = n; });
    return found;
  }
  function findParent(id) {
    let par = null;
    walkNodes(nodeRoot(), (n, p) => { if (n._id === id) par = p; });
    return par;
  }
  function findNodeByPath(path) {
    const parts = path.split('/').filter(Boolean);
    let n = nodeRoot();
    for (const p of parts) {
      n = (n.children || []).find((c) => c.name === p);
      if (!n) return null;
    }
    return n;
  }

  function ensureIds() {
    for (const s of Object.values(App.project.scenes)) walkNodes(s.root, (n) => { if (!n._id) n._id = uid(); });
  }

  /* Inline scripts (from hand-written examples) become named assets. */
  function normalizeProject(p) {
    let migrated = 0;
    for (const [sname, scene] of Object.entries(p.scenes || {})) {
      walkNodes(scene.root, (n) => {
        if (n.script && typeof n.script === 'string') {
          const skey = `${n.name || 'node'}.js`;
          p.assets.scripts[skey] = n.script;
          n.script_name = skey;
          delete n.script;
          migrated++;
        }
      });
    }
    if (migrated) GE.Logger.info(`Imported ${migrated} inline script(s) into project assets.`);
    return p;
  }

  function loadProject(p, { silent = false } = {}) {
    App.project = normalizeProject(p);
    ensureIds();
    App.undoStack = []; App.redoStack = [];
    App.sceneName = App.project.main_scene || Object.keys(App.project.scenes)[0];
    App.selectedId = nodeRoot()._id;
    App.play && stopPlay();
    saveLocal();
    rebuildPreview();
    refreshAll();
    if (!silent) status(`Project "${App.project.name}" loaded.`);
    GE.TutorialEvents && GE.TutorialEvents.emit('project_loaded');
  }

  const saveLocal = debounce(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(App.project)); } catch (e) {}
  }, 400);

  function pushUndo() {
    App.undoStack.push(JSON.stringify(sceneJSON()));
    if (App.undoStack.length > 100) App.undoStack.shift();
    App.redoStack.length = 0;
  }
  function undo() {
    if (!App.undoStack.length) return;
    App.redoStack.push(JSON.stringify(sceneJSON()));
    App.project.scenes[App.sceneName] = JSON.parse(App.undoStack.pop());
    ensureIds(); rebuildPreview(); refreshAll();
    status('Undo.');
  }
  function redo() {
    if (!App.redoStack.length) return;
    App.undoStack.push(JSON.stringify(sceneJSON()));
    App.project.scenes[App.sceneName] = JSON.parse(App.redoStack.pop());
    ensureIds(); rebuildPreview(); refreshAll();
    status('Redo.');
  }

  /* ================================================================== */
  /* Preview tree (static, scripts not running)                          */
  /* ================================================================== */
  let previewBuildToken = 0;
  async function rebuildPreview() {
    const token = ++previewBuildToken;
    const tree = new GE.SceneTree({ background: App.project.settings.background });
    tree.project = App.project;
    let root = null;
    try {
      root = await GE.SceneBuilder.build(clone(sceneJSON()), App.project, tree);
    } catch (e) {
      GE.Logger.error('Preview build failed: ' + e.message);
    }
    if (token !== previewBuildToken) return;   /* superseded */
    if (App.previewTree) { try { App.previewTree._remove_scene(); } catch (e) {} }
    tree.current_scene = root;
    tree.current_scene_name = App.sceneName;
    if (root) {
      tree.root.add_child(root, true);
      /* enter the tree WITHOUT _ready (static preview — like Godot's editor) */
      const staticEnter = (n) => { n._ready_done = true; n.children.forEach(staticEnter); };
      staticEnter(root);
    }
    App.previewTree = tree;
    App.previewTree.engine = { size: { w: App.project.settings.width, h: App.project.settings.height } };
  }

  /* ================================================================== */
  /* Viewport rendering (editor view: no camera, grid + gizmos)          */
  /* ================================================================== */
  const canvas = $('#viewport');
  const ctx = canvas.getContext('2d');

  function worldToScreen(p) {
    return { x: (p.x - App.view.x) * App.view.zoom, y: (p.y - App.view.y) * App.view.zoom };
  }
  function screenToWorld(p) {
    return { x: p.x / App.view.zoom + App.view.x, y: p.y / App.view.zoom + App.view.y };
  }
  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (canvas.width / r.width), y: (ev.clientY - r.top) * (canvas.height / r.height) };
  }

  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderFrame(); });
  }

  function renderFrame() {
    if (!ctx) return;   /* no 2D context (tests) — panels still work */
    const w = canvas.width, h = canvas.height;
    const settings = App.project.settings;
    canvas.width = settings.width; canvas.height = settings.height; /* keep in sync */

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0d16';
    ctx.fillRect(0, 0, w, h);

    if (App.play) {
      /* live game — the play loop (in startPlay) owns stepping+rendering */
      return;
    }

    /* editor view */
    const z = App.view.zoom;
    ctx.translate(-App.view.x * z, -App.view.y * z);
    ctx.scale(z, z);

    /* grid */
    drawGrid(w, h);

    /* game bounds */
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(0, 0, w, h);

    /* the scene (static preview, no camera transform) */
    if (App.previewTree && App.previewTree.current_scene) {
      const items = [];
      collectDrawables(App.previewTree.current_scene, 0, items);
      items.sort((a, b) => a.z - b.z || a.oi - b.oi);
      for (const it of items) {
        ctx.save();
        try { it.node._draw(ctx, { view_rect: null }); } catch (e) {}
        ctx.restore();
      }
    }

    /* selection gizmo */
    drawSelection();
  }

  function drawGrid(w, h) {
    const z = App.view.zoom;
    const step = 48;
    ctx.lineWidth = 1 / z;
    const x0 = Math.floor(App.view.x / step) * step;
    const y0 = Math.floor(App.view.y / step) * step;
    ctx.strokeStyle = 'rgba(120, 140, 190, 0.07)';
    ctx.beginPath();
    for (let x = x0; x < App.view.x + w / z; x += step) { ctx.moveTo(x, App.view.y); ctx.lineTo(x, App.view.y + h / z); }
    for (let y = y0; y < App.view.y + h / z; y += step) { ctx.moveTo(App.view.x, y); ctx.lineTo(App.view.x + w / z, y); }
    ctx.stroke();
    /* origin */
    ctx.strokeStyle = 'rgba(120, 140, 190, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, App.view.y); ctx.lineTo(0, App.view.y + h / z);
    ctx.moveTo(App.view.x, 0); ctx.lineTo(App.view.x + w / z, 0);
    ctx.stroke();
  }

  function collectDrawables(node, z, out, oi = { i: 0 }) {
    if (node._freed || node.visible === false) return;
    if (node instanceof GE.Node2D) {
      node._update_world();
      if (typeof node._draw_this === 'function' && node._draw_this()) {
        out.push({ node, z: z + (node.z_index || 0), oi: oi.i++ });
      }
    }
    for (const c of node.children) collectDrawables(c, z + (node.z_index || 0), out, oi);
  }

  function selectedNode() { return App.selectedId ? findNode(App.selectedId) : null; }

  function nodeWorldRect(nodeJson, liveNode) {
    /* approximate bounds of a node for hit-testing & gizmos */
    const n = liveNode;
    if (!n) return null;
    if (typeof n.get_rect === 'function') {
      const r = n.get_rect();
      return { x: r.x, y: r.y, w: r.w || r.size.x, h: r.h || r.size.y };
    }
    if (n.texture) {
      const gp = n.global_position;
      const tw = n.texture.width, th = n.texture.height;
      return { x: gp.x - tw / 2, y: gp.y - th / 2, w: tw, h: th };
    }
    const gp = n.global_position;
    return { x: gp.x - 14, y: gp.y - 14, w: 28, h: 28 };
  }

  function findLiveNode(nodeJson) {
    if (!App.previewTree || !App.previewTree.current_scene || !nodeJson) return null;
    const path = jsonPathOf(nodeJson);
    return path ? App.previewTree.current_scene.get_node(path) : null;
  }
  function jsonPathOf(nodeJson) {
    const chain = [];
    let cur = nodeJson;
    const byId = (parent, id) => (parent.children || []).find((c) => c._id === id);
    /* walk up using findParent repeatedly (cheap enough for editor sizes) */
    let n = nodeJson;
    while (n) {
      chain.unshift(n.name);
      n = findParent(n._id);
    }
    chain.shift(); /* drop root name — paths are relative to the scene root */
    return chain.join('/');
  }

  function drawSelection() {
    const nj = selectedNode();
    if (!nj) return;
    const live = findLiveNode(nj);
    if (!live) return;
    const r = nodeWorldRect(nj, live);
    if (!r) return;
    const z = App.view.zoom;
    ctx.strokeStyle = '#4fd38c';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    ctx.setLineDash([]);
    /* corner handles */
    ctx.fillStyle = '#4fd38c';
    const hs = 5 / z;
    for (const [hx, hy] of [[r.x - 4, r.y - 4], [r.x + r.w + 4, r.y - 4], [r.x - 4, r.y + r.h + 4], [r.x + r.w + 4, r.y + r.h + 4]]) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
    /* name tag */
    ctx.font = `${12 / z}px sans-serif`;
    ctx.fillStyle = '#4fd38c';
    ctx.fillText(nj.name, r.x - 4, r.y - 10 / z);
  }

  /* ================================================================== */
  /* Viewport input                                                      */
  /* ================================================================== */
  let dragging = null;   /* {mode:'pan'|'move', ...} */

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (App.play) return;
    const p = canvasPoint(ev);
    const before = screenToWorld(p);
    App.view.zoom *= ev.deltaY < 0 ? 1.12 : 0.89;
    App.view.zoom = Math.min(4, Math.max(0.1, App.view.zoom));
    const after = screenToWorld(p);
    App.view.x += before.x - after.x;
    App.view.y += before.y - after.y;
    updateViewportInfo();
    requestRender();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.focus();
    if (App.play) return;
    const p = canvasPoint(ev);
    if (ev.button === 1 || ev.button === 2 || spaceHeld) {
      dragging = { mode: 'pan', sx: p.x, sy: p.y, ox: App.view.x, oy: App.view.y };
      canvas.style.cursor = 'grabbing';
      ev.preventDefault();
      return;
    }
    if (ev.button === 0) {
      const world = screenToWorld(p);
      const hit = hitTest(world);
      if (hit) {
        selectNode(hit._id);
        const live = findLiveNode(hit);
        dragging = {
          mode: 'move', id: hit._id,
          startWorld: world,
          startPos: live ? { x: live.position.x, y: live.position.y } : null,
        };
      } else {
        selectNode(null);
      }
      requestRender();
    }
  });

  window.addEventListener('pointerup', () => {
    if (dragging && dragging.mode === 'move') {
      /* commit final position to JSON (already live-updated during drag) */
      saveLocal();
      GE.TutorialEvents && GE.TutorialEvents.emit('node_moved');
    }
    dragging = null;
    canvas.style.cursor = 'default';
    requestRender();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!dragging || App.play) return;
    const p = canvasPoint(ev);
    if (dragging.mode === 'pan') {
      App.view.x = dragging.ox - (p.x - dragging.sx) / App.view.zoom;
      App.view.y = dragging.oy - (p.y - dragging.sy) / App.view.zoom;
      requestRender();
      return;
    }
    if (dragging.mode === 'move') {
      const world = screenToWorld(p);
      const nj = findNode(dragging.id);
      const live = findLiveNode(nj);
      if (!nj || !live) return;
      let nx = dragging.startPos.x + (world.x - dragging.startWorld.x);
      let ny = dragging.startPos.y + (world.y - dragging.startWorld.y);
      if (App.snap) { nx = Math.round(nx / 24) * 24; ny = Math.round(ny / 24) * 24; }
      live.position = new GE.Vector2(nx, ny);
      nj.props = nj.props || {};
      nj.props.position = [Math.round(nx * 10) / 10, Math.round(ny * 10) / 10];
      if (App.selectedId === nj._id) syncInspectorTransform(nj);
      requestRender();
    }
  });

  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  let spaceHeld = false;
  window.addEventListener('keydown', (ev) => { if (ev.code === 'Space') spaceHeld = true; });
  window.addEventListener('keyup', (ev) => { if (ev.code === 'Space') spaceHeld = false; });

  function hitTest(world) {
    /* topmost drawable node containing the point (reverse draw order) */
    if (!App.previewTree || !App.previewTree.current_scene) return null;
    const items = [];
    collectDrawables(App.previewTree.current_scene, 0, items);
    items.sort((a, b) => a.z - b.z || a.oi - b.oi);
    const nodeToJson = new Map();
    walkNodes(nodeRoot(), (n) => nodeToJson.set(n.name, n));
    for (let i = items.length - 1; i >= 0; i--) {
      const n = items[i].node;
      let r = null;
      if (typeof n.get_rect === 'function') {
        const rr = n.get_rect();
        r = { x: rr.x, y: rr.y, w: rr.w || rr.size.x, h: rr.h || rr.size.y };
      } else if (n.texture) {
        const gp = n.global_position;
        r = { x: gp.x - n.texture.width / 2, y: gp.y - n.texture.height / 2, w: n.texture.width, h: n.texture.height };
      } else {
        const gp = n.global_position;
        r = { x: gp.x - 12, y: gp.y - 12, w: 24, h: 24 };
      }
      /* allow slight forgiveness */
      r = { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 };
      if (world.x >= r.x && world.x <= r.x + r.w && world.y >= r.y && world.y <= r.y + r.h) {
        /* map live node back to JSON node via its path */
        const path = livePathOf(n);
        const nj = path !== null ? findNodeByPath(path) : null;
        if (nj) return nj;
      }
    }
    return null;
  }
  function livePathOf(liveNode) {
    const parts = [];
    let n = liveNode;
    while (n && n.parent && n.parent !== App.previewTree.root) { parts.unshift(n.name); n = n.parent; }
    if (!n || !n.parent) return null;
    return parts.join('/');
  }

  function updateViewportInfo() {
    $('#viewport-info').textContent = Math.round(App.view.zoom * 100) + '%';
  }

  /* ================================================================== */
  /* Scene tree panel                                                    */
  /* ================================================================== */
  function renderTree() {
    const box = $('#scene-tree');
    box.innerHTML = '';
    const addRow = (nj, depth) => {
      const row = document.createElement('div');
      row.className = 'tree-node' + (nj._id === App.selectedId ? ' selected' : '') + (nj.script_name || nj.script ? ' has-script' : '');
      row.style.paddingLeft = (6 + depth * 16) + 'px';
      const cls = GE.Classes.get(nj.type);
      const hasKids = (nj.children || []).length > 0;
      const collapsed = App.collapsed.has(nj._id);
      const caret = document.createElement('span');
      caret.className = 'tree-caret';
      caret.textContent = hasKids ? (collapsed ? '▸' : '▾') : '';
      if (hasKids) caret.onclick = (e) => { e.stopPropagation(); collapsed ? App.collapsed.delete(nj._id) : App.collapsed.add(nj._id); renderTree(); };
      row.appendChild(caret);
      const icon = document.createElement('span');
      icon.className = 'node-icon';
      icon.textContent = cls ? cls.def.icon : '❓';
      row.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = nj.name;
      row.appendChild(name);
      const type = document.createElement('span');
      type.className = 'node-type';
      type.textContent = nj.type;
      row.appendChild(type);
      row.onclick = () => selectNode(nj._id);
      row.ondblclick = () => renameNode(nj);
      box.appendChild(row);
      if (hasKids && !collapsed) for (const c of nj.children) addRow(c, depth + 1);
    };
    addRow(nodeRoot(), 0);
  }

  function selectNode(id, { refresh = true } = {}) {
    App.selectedId = id;
    if (refresh) refreshSelection();
    requestRender();
    GE.TutorialEvents && GE.TutorialEvents.emit('node_selected');
  }

  function refreshSelection() {
    renderTree();
    renderInspector();
  }

  function renameNode(nj) {
    const name = prompt('Rename node:', nj.name);
    if (name && name.trim()) {
      pushUndo();
      nj.name = name.trim();
      ensureUniqueNames();
      rebuildPreview(); refreshAll();
    }
  }
  function ensureUniqueNames() {
    walkNodes(nodeRoot(), (n) => {
      /* crude but effective: re-unique within each parent */
    });
    /* handled by add_child at build time anyway */
  }

  /* ================================================================== */
  /* Add / delete / move nodes                                           */
  /* ================================================================== */
  function addChildNode(parentId, type, nameOverride = null) {
    const parent = parentId ? findNode(parentId) : nodeRoot();
    if (!parent) return null;
    pushUndo();
    const cls = GE.Classes.get(type);
    if (!cls) { status(`Unknown node type '${type}'.`); return null; }
    const nj = { type, name: nameOverride || type, _id: uid(), props: {} };
    /* default props from class definition */
    if (cls.def.props) {
      for (const p of cls.def.props) {
        if (p.type === 'tiles') { nj.props.tiles = ['........', '........']; nj.props.cell_size = 48; nj.props.solid_tiles = 'GD#BW'; }
      }
    }
    if (type === 'Sprite') nj.props.texture = 'goodness://circle';
    /* unique name among siblings */
    let base = nj.name, n = 2;
    while ((parent.children || []).some((c) => c.name === nj.name)) nj.name = base + (n++);
    parent.children = parent.children || [];
    parent.children.push(nj);
    rebuildPreview(); refreshAll();
    selectNode(nj._id);
    GE.TutorialEvents && GE.TutorialEvents.emit('node_added', { type });
    status(`Added ${type} "${nj.name}".`);
    return nj;
  }

  function deleteNode(id) {
    const parent = findParent(id);
    if (!parent) { status('Cannot delete the scene root.'); return; }
    pushUndo();
    parent.children = parent.children.filter((c) => c._id !== id);
    if (App.selectedId === id) App.selectedId = nodeRoot()._id;
    rebuildPreview(); refreshAll();
    GE.TutorialEvents && GE.TutorialEvents.emit('node_deleted');
    status('Node deleted.');
  }

  function moveNode(id, dir) {
    const parent = findParent(id);
    if (!parent) return;
    const idx = parent.children.findIndex((c) => c._id === id);
    const ni = idx + dir;
    if (ni < 0 || ni >= parent.children.length) return;
    pushUndo();
    [parent.children[idx], parent.children[ni]] = [parent.children[ni], parent.children[idx]];
    rebuildPreview(); refreshAll();
  }

  /* ================================================================== */
  /* Inspector                                                           */
  /* ================================================================== */
  function renderInspector() {
    const box = $('#inspector');
    const nj = selectedNode();
    if (!nj) { box.innerHTML = '<div class="empty-hint">Select a node to edit its properties.</div>'; return; }
    box.innerHTML = '';
    const cls = GE.Classes.get(nj.type);
    if (!cls) { box.innerHTML = '<div class="empty-hint">Unknown node type.</div>'; return; }
    const live = findLiveNode(nj);

    /* header */
    const header = document.createElement('div');
    header.className = 'insp-class-header';
    header.innerHTML = `<span class="big-icon">${cls.def.icon}</span>
      <div><div class="cls-name">${nj.name} <span style="color:var(--faint);font-weight:400">· ${nj.type}</span></div>
      <div class="cls-desc">${cls.def.desc || ''}</div></div>`;
    box.appendChild(header);

    /* script banner */
    const scriptBanner = document.createElement('div');
    scriptBanner.className = 'insp-script-banner';
    if (nj.script_name) {
      scriptBanner.textContent = `📜 script: ${nj.script_name} — click to edit`;
      scriptBanner.onclick = () => openScriptTab(nj.script_name);
    } else {
      scriptBanner.textContent = '📜 + Attach a script (creates one for you)';
      scriptBanner.onclick = () => attachNewScript(nj);
    }
    box.appendChild(scriptBanner);

    /* transform section (all Node2D) */
    const is2D = live instanceof GE.Node2D;
    if (is2D) box.appendChild(section('Transform', (rows) => {
      const pos = nj.props.position || [0, 0];
      rows.appendChild(propVec2('position', pos, (v) => setProp(nj, 'position', v), 'Position'));
      rows.appendChild(propNumber('rotation', nj.props.rotation || 0, (v) => setProp(nj, 'rotation', v), 'Rotation °'));
      const sc = nj.props.scale || [1, 1];
      rows.appendChild(propVec2('scale', sc, (v) => setProp(nj, 'scale', v), 'Scale'));
      rows.appendChild(propNumber('z_index', nj.props.z_index || 0, (v) => setProp(nj, 'z_index', v), 'Z index'));
      rows.appendChild(propBool('visible', nj.props.visible !== false, (v) => setProp(nj, 'visible', v), 'Visible'));
    }));

    /* node-specific props from the class definition */
    const defProps = (cls.def.props || []).filter((p) => !['position', 'rotation', 'scale', 'z_index', 'visible', 'name'].includes(p.path));
    if (defProps.length) {
      box.appendChild(section(cls.def.name, (rows) => {
        for (const p of defProps) rows.appendChild(propEditorFor(nj, p));
      }));
    }

    /* physics shape section */
    if (live instanceof GE.PhysicsBody2D) {
      box.appendChild(section('Collision Shape', (rows) => {
        const shape = nj.props.shape = nj.props.shape || { type: 'rect', width: 32, height: 32 };
        rows.appendChild(propSelect('shape.type', shape.type || 'rect', ['rect', 'circle'], (v) => { pushUndo(); shape.type = v; rebuildPreview(); renderInspector(); }));
        if ((shape.type || 'rect') === 'rect') {
          rows.appendChild(propNumber('shape.width', shape.width || 32, (v) => { shape.width = v; liveShape(nj, live); }));
          rows.appendChild(propNumber('shape.height', shape.height || 32, (v) => { shape.height = v; liveShape(nj, live); }));
        } else {
          rows.appendChild(propNumber('shape.radius', shape.radius || 16, (v) => { shape.radius = v; liveShape(nj, live); }));
        }
        rows.appendChild(propDocRow('Shapes are centered on the node. Physics is axis-aligned.'));
      }));
    }

    /* signals section */
    if (live) {
      const sigs = Object.keys(live.signals || {}).filter((s) => !['ready', 'renamed', 'tree_entered', 'tree_exited', 'child_entered_tree', 'child_exiting_tree'].includes(s));
      if (sigs.length) {
        box.appendChild(section('Signals', (rows) => {
          for (const sig of sigs) {
            const row = document.createElement('div');
            row.className = 'insp-signal';
            row.innerHTML = `<span class="sig-name">⚡ ${sig}</span>`;
            const btn = document.createElement('button');
            btn.textContent = 'Connect…';
            btn.onclick = () => connectSignalDialog(nj, sig);
            row.appendChild(btn);
            const conns = (nj.connections || []).filter((c) => c.signal === sig);
            for (const c of conns) {
              const tag = document.createElement('span');
              tag.style.color = 'var(--dim)';
              tag.style.fontSize = '11px';
              tag.textContent = `→ ${c.to || '(self)'}.${c.method}`;
              row.appendChild(tag);
            }
            rows.appendChild(row);
          }
        }));
      }
    }
  }

  function liveShape(nj, live) {
    if (live && live.shape) {
      live.shape = nj.props.shape;
      requestRender();
    }
    saveLocal();
  }

  function syncInspectorTransform(nj) {
    /* update just the transform inputs without a full re-render */
    const inputs = $$('#inspector input[data-prop]');
    for (const inp of inputs) {
      const p = inp.dataset.prop;
      if (p === 'position.x') inp.value = nj.props.position?.[0] ?? 0;
      if (p === 'position.y') inp.value = nj.props.position?.[1] ?? 0;
    }
  }

  function section(title, fill) {
    const sec = document.createElement('div');
    sec.className = 'insp-section';
    const t = document.createElement('div');
    t.className = 'insp-title';
    t.textContent = title;
    sec.appendChild(t);
    const rows = document.createElement('div');
    rows.className = 'insp-rows';
    fill(rows);
    sec.appendChild(rows);
    return sec;
  }

  function propRow(label, inputWrap, doc) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    l.title = label;
    row.appendChild(l);
    row.appendChild(inputWrap);
    if (doc) {
      const d = document.createElement('div');
      d.className = 'prop-doc';
      d.textContent = doc;
      row.appendChild(d);
    }
    return row;
  }
  function propDocRow(text) {
    const d = document.createElement('div');
    d.className = 'prop-doc';
    d.style.gridColumn = '1 / -1';
    d.textContent = text;
    return d;
  }
  function propNumber(name, value, onChange, label = name, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = value;
    if (opts.step) inp.step = opts.step;
    if (opts.min !== undefined) inp.min = opts.min;
    inp.dataset.prop = name;
    inp.onchange = () => onChange(parseFloat(inp.value) || 0);
    wrap.appendChild(inp);
    return propRow(label, wrap);
  }
  function propString(name, value, onChange, label = name) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value ?? '';
    inp.onchange = () => onChange(inp.value);
    wrap.appendChild(inp);
    return propRow(label, wrap);
  }
  function propBool(name, value, onChange, label = name) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!value;
    inp.onchange = () => onChange(inp.checked);
    wrap.appendChild(inp);
    return propRow(label, wrap);
  }
  function propVec2(name, value, onChange, label = name) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    for (const [i, axis] of ['x', 'y'].entries()) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = 'any';
      inp.value = value?.[i] ?? 0;
      inp.dataset.prop = `${name}.${axis}`;
      inp.onchange = () => {
        const v = [parseFloat(wrap.children[0].value) || 0, parseFloat(wrap.children[1].value) || 0];
        onChange(v);
      };
      wrap.appendChild(inp);
    }
    return propRow(label, wrap);
  }
  function propColor(name, value, onChange, label = name) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    const inp = document.createElement('input');
    inp.type = 'color';
    const c = GE.Color.from(value || '#ffffff');
    inp.value = c.to_hex();
    inp.oninput = () => onChange(inp.value);
    wrap.appendChild(inp);
    return propRow(label, wrap);
  }
  function propSelect(name, value, options, onChange, label = name) {
    const wrap = document.createElement('div');
    wrap.className = 'prop-input';
    const sel = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => onChange(sel.value);
    wrap.appendChild(sel);
    return propRow(label, wrap);
  }

  function propEditorFor(nj, p) {
    const getVal = () => {
      /* dotted path lookup in props */
      const parts = p.path.split('.');
      let v = nj.props;
      for (const part of parts) v = v ? v[part] : undefined;
      return v;
    };
    const setVal = (v, rebuild = true) => {
      pushUndo();
      const parts = p.path.split('.');
      let obj = nj.props;
      for (let i = 0; i < parts.length - 1; i++) { obj[parts[i]] = obj[parts[i]] || {}; obj = obj[parts[i]]; }
      obj[parts[parts.length - 1]] = v;
      if (rebuild) { rebuildPreview(); requestRender(); }
      saveLocal();
      GE.TutorialEvents && GE.TutorialEvents.emit('prop_changed', { path: p.path, value: v });
    };
    const val = getVal();
    switch (p.type) {
      case 'number': return propNumber(p.path, val ?? 0, setVal, p.path, { step: p.step, min: p.min, max: p.max });
      case 'string': return propString(p.path, val ?? '', setVal, p.path);
      case 'bool': return propBool(p.path, val ?? false, setVal, p.path);
      case 'color': return propColor(p.path, val ?? '#ffffff', setVal, p.path);
      case 'enum': return propSelect(p.path, val ?? p.options[0], p.options, setVal, p.path);
      case 'vector2': return propVec2(p.path, val ?? [0, 0], setVal, p.path);
      case 'texture': {
        const wrap = document.createElement('div');
        wrap.className = 'prop-input';
        const sel = document.createElement('select');
        const names = GE.ProceduralTextures.names();
        const projectImages = Object.keys(App.project.assets.images || {});
        for (const n of names) { const o = document.createElement('option'); o.value = 'goodness://' + n; o.textContent = '● ' + n; sel.appendChild(o); }
        for (const n of projectImages) { const o = document.createElement('option'); o.value = n; o.textContent = '🖼 ' + n; sel.appendChild(o); }
        if (val && typeof val === 'string' && !sel.querySelector(`option[value="${CSS.escape(val)}"]`)) {
          const o = document.createElement('option'); o.value = val; o.textContent = '🔗 ' + val.slice(0, 40); sel.appendChild(o);
        }
        sel.value = val || '';
        sel.onchange = () => setVal(sel.value);
        wrap.appendChild(sel);
        return propRow(p.path, wrap, p.doc);
      }
      case 'json': {
        const wrap = document.createElement('div');
        wrap.className = 'prop-input';
        const ta = document.createElement('textarea');
        ta.value = val === undefined ? '' : JSON.stringify(val, null, 0);
        ta.rows = 3;
        ta.onchange = () => {
          try {
            const parsed = ta.value.trim() === '' ? undefined : JSON.parse(ta.value);
            setVal(parsed);
            ta.style.borderColor = '';
          } catch (e) {
            ta.style.borderColor = 'var(--red)';
            status('Invalid JSON: ' + e.message);
          }
        };
        wrap.appendChild(ta);
        return propRow(p.path, wrap, p.doc);
      }
      case 'tiles': {
        const wrap = document.createElement('div');
        wrap.className = 'prop-input';
        const ta = document.createElement('textarea');
        ta.value = (val || []).join('\n');
        ta.rows = Math.min(14, (val || []).length + 1);
        ta.spellcheck = false;
        ta.style.fontFamily = 'ui-monospace, Consolas, monospace';
        ta.style.lineHeight = '1.35';
        ta.onchange = () => {
          setVal(ta.value.split('\n').map((r) => r.replace(/[^GDBW=#LC^TXPE .]/g, '.')));
          renderInspector();
        };
        wrap.appendChild(ta);
        return propRow(p.path, wrap, p.doc || 'Legend: G grass · D dirt · # stone · B brick · W water · = platform · C coin · ^ spike · T torch · X door · P/E spawn points · . empty');
      }
      default: return propString(p.path, val ?? '', setVal, p.path);
    }
  }

  function setProp(nj, path, value) {
    pushUndo();
    nj.props = nj.props || {};
    nj.props[path] = value;
    const live = findLiveNode(nj);
    if (live) {
      try { GE.SceneBuilder._set_prop(live, path, value, App.project); } catch (e) {}
    }
    saveLocal();
    requestRender();
    GE.TutorialEvents && GE.TutorialEvents.emit('prop_changed', { path, value });
  }

  /* ================================================================== */
  /* Signals connect dialog                                              */
  /* ================================================================== */
  function connectSignalDialog(nj, sig) {
    const nodes = [];
    walkNodes(nodeRoot(), (n) => { if (n._id !== nj._id) nodes.push(n); });
    openModal(`Connect "${sig}" on ${nj.name}`, (body, actions) => {
      body.innerHTML = `
        <div class="modal-form-row"><label>Emits from</label><input type="text" value="${nj.name} ⚡ ${sig}" disabled></div>
        <div class="modal-form-row"><label>Call method on</label>
          <select id="conn-target"><option value="">(this node)</option>${nodes.map((n) => `<option value="${n._id}">${n.name} (${n.type})</option>`).join('')}</select>
        </div>
        <div class="modal-form-row"><label>Method name</label><input type="text" id="conn-method" value="_on_${nj.name.replace(/[^a-zA-Z0-9_]/g, '_')}_${sig}"></div>
        <p style="color:var(--dim);font-size:12px">The method runs on the target node's script. Remember to define it there!</p>`;
      actions.push(btn('Cancel', closeModal));
      actions.push(btn('Connect', () => {
        const targetSel = body.querySelector('#conn-target').value;
        const method = body.querySelector('#conn-method').value.trim();
        if (!method) return;
        const target = nodes.find((n) => n._id === targetSel);
        let relPath = '';
        if (target) {
          /* relative path from the TARGET back to nothing — connections use target-relative 'to' */
          relPath = relPathBetween(nj, target);
        }
        pushUndo();
        nj.connections = nj.connections || [];
        nj.connections.push({ signal: sig, to: relPath || undefined, method });
        saveLocal();
        closeModal();
        renderInspector();
        status(`Connected ${nj.name}.${sig} → ${target ? target.name : nj.name}.${method}()`);
      }, 'primary'));
    });
  }
  function relPathBetween(fromNode, toNode) {
    /* path from EMITTER's parent scope: the engine resolves 'to' from the
       scene root first, then the emitter — so a root-relative path is fine */
    const chain = [];
    let n = toNode;
    while (n) { chain.unshift(n.name); n = findParent(n._id); }
    chain.shift();
    return chain.join('/');
  }

  /* ================================================================== */
  /* Assets panel                                                        */
  /* ================================================================== */
  let assetsTab = 'scenes';
  function renderAssets() {
    const box = $('#assets-body');
    box.innerHTML = '';
    $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.atab === assetsTab));

    if (assetsTab === 'scenes') {
      for (const [name, scene] of Object.entries(App.project.scenes)) {
        const item = document.createElement('div');
        item.className = 'asset-item' + (name === App.sceneName ? ' selected' : '');
        const isMain = name === App.project.main_scene;
        item.innerHTML = `<span class="star">${isMain ? '★' : '◌'}</span><span>🎬 ${name}</span><span class="spacer"></span>`;
        const open = document.createElement('button');
        open.textContent = 'Open';
        open.onclick = (e) => { e.stopPropagation(); switchScene(name); };
        const main = document.createElement('button');
        main.textContent = isMain ? 'Main' : 'Set main';
        main.onclick = (e) => { e.stopPropagation(); App.project.main_scene = name; saveLocal(); renderAssets(); };
        item.onclick = () => switchScene(name);
        item.appendChild(open); item.appendChild(main);
        box.appendChild(item);
      }
      const add = document.createElement('button');
      add.textContent = '＋ New scene';
      add.style.margin = '8px 4px';
      add.onclick = () => {
        const name = prompt('Scene name:', 'scene' + (Object.keys(App.project.scenes).length + 1));
        if (!name) return;
        App.project.scenes[name] = { root: { type: 'Node2D', name: 'Main', _id: uid(), props: {}, children: [] } };
        saveLocal(); switchScene(name);
      };
      box.appendChild(add);
    }

    if (assetsTab === 'scripts') {
      const names = Object.keys(App.project.assets.scripts);
      if (!names.length) box.innerHTML = '<div class="assets-note">No scripts yet — create one below or attach a script to a node.</div>';
      for (const name of names) {
        const item = document.createElement('div');
        item.className = 'asset-item' + (name === App.openScript ? ' selected' : '');
        item.innerHTML = `<span>📜 ${name}</span><span class="spacer"></span>`;
        item.onclick = () => openScriptTab(name);
        const del = document.createElement('button');
        del.textContent = '✕';
        del.onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`Delete script "${name}"? Nodes using it will lose their behaviour.`)) return;
          delete App.project.assets.scripts[name];
          walkNodes(nodeRoot(), (n) => { if (n.script_name === name) { delete n.script_name; delete n.script; } });
          saveLocal(); rebuildPreview(); renderAssets(); renderTree();
        };
        item.appendChild(del);
        box.appendChild(item);
      }
      const add = document.createElement('button');
      add.textContent = '＋ New script';
      add.style.margin = '8px 4px';
      add.onclick = newScriptDialog;
      box.appendChild(add);
    }

    if (assetsTab === 'textures') {
      const note = document.createElement('div');
      note.className = 'assets-note';
      note.textContent = 'Built-in art (click to assign to the selected Sprite). Add your own below.';
      box.appendChild(note);
      const grid = document.createElement('div');
      grid.className = 'asset-grid';
      for (const n of GE.ProceduralTextures.names()) {
        const tile = document.createElement('div');
        tile.className = 'asset-tile';
        const tex = GE.ProceduralTextures.create(n);
        if (tex && tex.image) {
          try { tile.style.backgroundImage = `url(${tex.image.toDataURL('image/png')})`; } catch (e) {}
        }
        tile.textContent = n;
        tile.onclick = () => {
          const nj = selectedNode();
          if (!nj) { status('Select a Sprite first.'); return; }
          pushUndo();
          nj.props = nj.props || {};
          nj.props.texture = 'goodness://' + n;
          rebuildPreview(); renderInspector(); requestRender();
          GE.TutorialEvents && GE.TutorialEvents.emit('texture_assigned');
        };
        grid.appendChild(tile);
      }
      box.appendChild(grid);
      const addBtn = document.createElement('button');
      addBtn.textContent = '＋ Add image (URL or file)';
      addBtn.style.margin = '10px 4px';
      addBtn.onclick = () => {
        const url = prompt('Image URL (or leave empty to pick a file):');
        if (url === null) return;
        if (url.trim()) {
          const key = 'img' + (Object.keys(App.project.assets.images).length + 1);
          App.project.assets.images[key] = { src: url.trim(), name: url.split('/').pop().slice(0, 24) };
          saveLocal(); renderAssets();
        } else {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const key = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_');
              App.project.assets.images[key] = { src: reader.result, name: file.name };
              saveLocal(); renderAssets();
              status(`Added image "${key}".`);
            };
            reader.readAsDataURL(file);
          };
          input.click();
        }
      };
      box.appendChild(addBtn);
      for (const [key, img] of Object.entries(App.project.assets.images || {})) {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.innerHTML = `<span>🖼 ${img.name || key}</span><span class="spacer"></span>`;
        item.onclick = () => {
          const nj = selectedNode();
          if (!nj) { status('Select a Sprite first.'); return; }
          pushUndo();
          nj.props.texture = key;
          rebuildPreview(); renderInspector(); requestRender();
        };
        box.appendChild(item);
      }
    }
  }

  function switchScene(name) {
    if (!App.project.scenes[name]) return;
    App.sceneName = name;
    App.selectedId = nodeRoot()._id;
    rebuildPreview(); refreshAll();
    GE.TutorialEvents && GE.TutorialEvents.emit('scene_switched');
  }

  /* ================================================================== */
  /* Script editor                                                       */
  /* ================================================================== */
  const SCRIPT_TEMPLATES = {
    'Basic (empty)': `{
  extends: 'Node',
  // properties become defaults on the node
  my_value: 10,
  _ready() {
    // runs once when the scene starts
  },
  _process(delta) {
    // runs every frame
  },
}`,
    'Move with arrows (Sprite)': `{
  extends: 'Sprite',
  speed: 300,
  _process(delta) {
    const dir = Input.get_axis('ui_left', 'ui_right');
    this.position.x += dir * this.speed * delta;
  },
}`,
    'Platformer controller (CharacterBody2D)': `{
  extends: 'CharacterBody2D',
  speed: 340,
  jump_speed: 560,
  _physics_process(delta) {
    this.velocity.x = Input.get_axis('ui_left', 'ui_right') * this.speed;
    if (Input.is_action_just_pressed('jump') && this.is_on_floor()) {
      this.velocity.y = -this.jump_speed;
      SFX.jump();
    }
    this.velocity.y += 1000 * delta;
    this.move_and_slide();
  },
}`,
    'Coin pickup (Area2D)': `{
  extends: 'Area2D',
  _ready() {
    this.connect('body_entered', (body) => {
      if (body.name === 'Player') {
        SFX.coin();
        this.queue_free();
      }
    });
  },
  _process(delta) {
    this.rotation += 2 * delta;
  },
}`,
    'Fetch from a free API (any node)': `{
  extends: 'Node',
  _ready() {
    this._load();
  },
  async _load() {
    try {
      const mon = await API.pokemon.random();
      Goodness.Logger.info('Fetched: ' + mon.name + ' types: ' + mon.types.join(','));
    } catch (e) {
      Goodness.Logger.warn('Offline: ' + e.message);
    }
  },
}`,
    'Timer pattern': `{
  extends: 'Node',
  _ready() {
    this.get_tree().create_timer(1.0, () => {
      Goodness.Logger.info('one second passed!');
    });
  },
}`,
  };

  function openScriptTab(name) {
    if (!name || !(name in (App.project?.assets.scripts || {}))) return;
    App.openScript = name;
    $('#script-editor').value = App.project.assets.scripts[name];
    refreshScriptSelect();
    switchBottomTab('script');
    checkScript();
  }

  function refreshScriptSelect() {
    const sel = $('#script-select');
    sel.innerHTML = '';
    for (const name of Object.keys(App.project.assets.scripts)) {
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      if (name === App.openScript) o.selected = true;
      sel.appendChild(o);
    }
  }

  function saveScript() {
    if (!App.openScript) return;
    App.project.assets.scripts[App.openScript] = $('#script-editor').value;
    saveLocal();
    checkScript();
    rebuildPreview();
    renderTree();
    GE.TutorialEvents && GE.TutorialEvents.emit('script_saved');
  }

  function checkScript() {
    const stat = $('#script-status');
    if (!App.openScript) { stat.textContent = ''; return; }
    const { error } = GE.Scripts.compile($('#script-editor').value);
    if (error) {
      stat.textContent = '✗ ' + error;
      stat.className = 'err';
    } else {
      stat.textContent = '✓ compiles cleanly';
      stat.className = 'ok';
    }
  }

  function newScriptDialog() {
    openModal('New Script', (body, actions) => {
      body.innerHTML = `
        <div class="modal-form-row"><label>Name</label><input type="text" id="ns-name" value="my_script.js"></div>
        <div class="modal-form-row" style="align-items:start"><label>Template</label>
          <select id="ns-template">${Object.keys(SCRIPT_TEMPLATES).map((t) => `<option>${t}</option>`).join('')}</select>
        </div>`;
      actions.push(btn('Cancel', closeModal));
      actions.push(btn('Create', () => {
        let name = body.querySelector('#ns-name').value.trim() || 'script.js';
        if (!name.endsWith('.js')) name += '.js';
        if (App.project.assets.scripts[name] && !confirm(`Overwrite "${name}"?`)) return;
        App.project.assets.scripts[name] = SCRIPT_TEMPLATES[body.querySelector('#ns-template').value];
        saveLocal();
        openScriptTab(name);
        closeModal();
        renderAssets();
      }, 'primary'));
    });
  }

  function attachNewScript(nj) {
    let name = (nj.name.replace(/[^a-zA-Z0-9_-]+/g, '_')) + '.js';
    let n = 2;
    while (App.project.assets.scripts[name]) name = (nj.name.replace(/[^a-zA-Z0-9_-]+/g, '_')) + (n++) + '.js';
    const cls = nj.type || 'Node';
    App.project.assets.scripts[name] = `{
  extends: '${cls}',
  _ready() {
    // "${nj.name}" wakes up here
  },
  _process(delta) {
    // every frame
  },
}`;
    pushUndo();
    nj.script_name = name;
    saveLocal();
    openScriptTab(name);
    renderTree(); renderInspector();
    GE.TutorialEvents && GE.TutorialEvents.emit('script_attached');
  }

  /* ================================================================== */
  /* Play mode                                                           */
  /* ================================================================== */
  async function startPlay() {
    if (App.play) return;
    saveScript(); /* persist open edits before playing */
    const engine = new GE.Engine({
      canvas,
      width: App.project.settings.width,
      height: App.project.settings.height,
      background: App.project.settings.background,
      project: clone(App.project),
      physics: { gravity: App.project.settings.gravity ?? 980 },
    });
    /* make sure the current scene is what plays */
    engine.options.project.main_scene = App.sceneName;
    try { await engine.start(); } catch (e) {
      GE.Logger.error('Play failed: ' + e.message);
      return;
    }
    GE.Input._register_canvas(canvas, engine);
    App.play = { engine, paused: false };
    $('#btn-play').classList.add('playing');
    $('#btn-pause').disabled = false;
    $('#btn-stop').disabled = false;
    $('#play-overlay-label').hidden = false;
    GE.TutorialEvents && GE.TutorialEvents.emit('play_started');
    const loop = () => {
      if (!App.play) return;
      if (!App.play.paused) engine.step(1 / 60);
      if (engine.ctx) engine.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    status(`▶ Playing "${App.sceneName}" — Esc or ⏹ to stop.`);
  }

  function pausePlay() {
    if (!App.play) return;
    App.play.paused = !App.play.paused;
    $('#btn-pause').classList.toggle('active', App.play.paused);
    status(App.play.paused ? '⏸ Paused.' : '▶ Resumed.');
  }

  function stopPlay() {
    if (!App.play) return;
    try { App.play.engine.stop(); } catch (e) {}
    App.play = null;
    $('#btn-play').classList.remove('playing');
    $('#btn-pause').disabled = true;
    $('#btn-stop').disabled = true;
    $('#play-overlay-label').hidden = true;
    rebuildPreview();
    requestRender();
    GE.TutorialEvents && GE.TutorialEvents.emit('play_stopped');
    status('Stopped — back to editing.');
  }

  /* ================================================================== */
  /* Modals                                                              */
  /* ================================================================== */
  function openModal(title, fill) {
    $('#modal-title').textContent = title;
    const body = $('#modal-body');
    const actionsBox = $('#modal-actions');
    body.innerHTML = ''; actionsBox.innerHTML = '';
    const actions = [];   /* dialogs push buttons; we append at the end */
    fill(body, actions);
    for (const b of actions) actionsBox.appendChild(b);
    $('#modal-backdrop').hidden = false;
  }
  function closeModal() { $('#modal-backdrop').hidden = true; }
  $('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  function btn(text, onclick, cls = '') {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = cls;
    b.onclick = onclick;
    return b;
  }

  /* ---------------- add node dialog ---------------- */
  function addNodeDialog() {
    const parentId = App.selectedId || nodeRoot()._id;
    const parent = findNode(parentId);
    openModal(`Add Child Node — under "${parent ? parent.name : '?'}"`, (body, actions) => {
      const cats = {};
      for (const cls of GE.Classes.all()) {
        if (cls.def.hidden) continue;
        const kind = cls.def.kind || 'Logic';
        (cats[kind] = cats[kind] || []).push(cls);
      }
      const list = document.createElement('div');
      list.className = 'node-picker-list';
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search node types…';
      search.style.width = '100%';
      search.style.marginBottom = '8px';
      body.appendChild(search);
      body.appendChild(list);
      const render = (filter) => {
        list.innerHTML = '';
        for (const [cat, clss] of Object.entries(cats)) {
          const shown = clss.filter((c) => !filter || c.def.name.toLowerCase().includes(filter) || (c.def.desc || '').toLowerCase().includes(filter));
          if (!shown.length) continue;
          const catEl = document.createElement('div');
          catEl.className = 'node-cat';
          catEl.textContent = cat;
          list.appendChild(catEl);
          for (const cls of shown) {
            const item = document.createElement('div');
            item.className = 'node-pick';
            item.innerHTML = `<span class="np-icon">${cls.def.icon}</span><span><div class="np-name">${cls.def.name}</div><div class="np-desc">${cls.def.desc || ''}</div></span>`;
            item.onclick = () => { addChildNode(parentId, cls.def.name); closeModal(); };
            list.appendChild(item);
          }
        }
      };
      render('');
      search.oninput = () => render(search.value.trim().toLowerCase());
      actions.push(btn('Cancel', closeModal));
    });
  }

  /* ---------------- project settings ---------------- */
  function projectSettingsDialog() {
    openModal('Project Settings', (body, actions) => {
      const s = App.project.settings;
      body.innerHTML = `
        <div class="modal-form-row"><label>Project name</label><input type="text" id="ps-name" value="${App.project.name}"></div>
        <div class="modal-form-row"><label>Width</label><input type="number" id="ps-w" value="${s.width}"></div>
        <div class="modal-form-row"><label>Height</label><input type="number" id="ps-h" value="${s.height}"></div>
        <div class="modal-form-row"><label>Background</label><input type="color" id="ps-bg" value="${s.background}"></div>
        <div class="modal-form-row"><label>Gravity</label><input type="number" id="ps-gr" value="${s.gravity ?? 980}" step="10"></div>`;
      actions.push(btn('Cancel', closeModal));
      actions.push(btn('Apply', () => {
        App.project.name = body.querySelector('#ps-name').value || 'My Game';
        s.width = Math.max(64, parseInt(body.querySelector('#ps-w').value) || 1280);
        s.height = Math.max(64, parseInt(body.querySelector('#ps-h').value) || 720);
        s.background = body.querySelector('#ps-bg').value;
        s.gravity = parseFloat(body.querySelector('#ps-gr').value) || 980;
        GE.Save._set_namespace(App.project.name);
        saveLocal(); rebuildPreview(); requestRender();
        GE.TutorialEvents && GE.TutorialEvents.emit('settings_changed');
        closeModal();
      }, 'primary'));
    });
  }

  /* ---------------- load example ---------------- */
  function loadExampleDialog() {
    const EXAMPLES = [
      ['hello', 'Hello Ball', 'a bouncing ball + click particles (2 min)'],
      ['coin-rush', 'Coin Rush', 'full platformer: tiles, coins, enemy, camera'],
      ['nova-strike', 'Nova Strike', 'arcade shooter: waves, lasers, explosions'],
      ['trivia-quest', 'Trivia Quest', 'quiz game powered by the free Open Trivia API'],
      ['creature-clash', 'Creature Clash', 'turn-based battler powered by PokéAPI'],
      ['particles-playground', 'Particles Playground', 'effects & tween showcase'],
    ];
    openModal('Load an Example Project', (body, actions) => {
      body.innerHTML = '<p style="color:var(--dim);margin-bottom:10px">Examples are complete, loadable games. Loading one replaces the current project (saved in your browser automatically).</p>';
      for (const [slug, name, desc] of EXAMPLES) {
        const item = document.createElement('div');
        item.className = 'node-pick';
        item.style.marginBottom = '6px';
        item.innerHTML = `<span class="np-icon">🎮</span><span><div class="np-name">${name}</div><div class="np-desc">${desc}</div></span>`;
        item.onclick = async () => {
          try {
            const project = await GE.Assets.load_json(`examples/${slug}/project.json`);
            loadProject(project);
            GE.TutorialEvents.emit('example_loaded', slug);
            closeModal();
            switchBottomTab('tutorial');
          } catch (e) { status('Could not load example: ' + e.message); }
        };
        body.appendChild(item);
      }
      actions.push(btn('Cancel', closeModal));
    });
  }

  /* ================================================================== */
  /* Refresh everything                                                  */
  /* ================================================================== */
  function refreshAll() {
    renderTree();
    renderInspector();
    renderAssets();
    refreshScriptSelect();
    $('#scene-title').textContent = `${App.project.name} — ${App.sceneName}`;
    $('#status-right').textContent = `${Object.keys(App.project.scenes).length} scenes · ${Object.keys(App.project.assets.scripts).length} scripts · ${GE.Classes.all().length} node types`;
    updateViewportInfo();
    requestRender();
  }

  /* ================================================================== */
  /* Wiring                                                              */
  /* ================================================================== */
  function wire() {
    /* menus */
    $$('.menu').forEach((menu) => {
      menu.querySelector('.menu-btn').onclick = (e) => {
        e.stopPropagation();
        $$('.menu').forEach((m) => { if (m !== menu) m.classList.remove('open'); });
        menu.classList.toggle('open');
      };
    });
    window.addEventListener('click', () => $$('.menu').forEach((m) => m.classList.remove('open')));
    $$('.menu-list button').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'new-project') {
          if (!confirm('Start a new project? The current one stays in your browser until replaced.')) return;
          loadProject(newProject(prompt('Project name:', 'My Game') || 'My Game'));
        }
        if (act === 'save-project') { saveLocal(); saveScript(); status('Project saved to your browser.'); }
        if (act === 'export-project') exportProject();
        if (act === 'import-project') importProject();
        if (act === 'load-example') loadExampleDialog();
        if (act === 'undo') undo();
        if (act === 'redo') redo();
        if (act === 'project-settings') projectSettingsDialog();
        if (act === 'open-tutorials') switchBottomTab('tutorial');
        if (act === 'open-api') switchBottomTab('api');
        if (act === 'open-docs') window.open('docs/01-getting-started.md', '_blank');
      };
    });

    /* play */
    $('#btn-play').onclick = () => App.play ? null : startPlay();
    $('#btn-pause').onclick = pausePlay;
    $('#btn-stop').onclick = stopPlay;
    $('#btn-run-tab').onclick = () => {
      saveScript();
      try { localStorage.setItem('goodness:runtime-project', JSON.stringify(App.project)); } catch (e) {}
      window.open('player.html', '_blank');
    };

    /* scene dock */
    $('#btn-add-node').onclick = addNodeDialog;
    $('#btn-del-node').onclick = () => App.selectedId && deleteNode(App.selectedId);
    $('#btn-node-up').onclick = () => App.selectedId && moveNode(App.selectedId, -1);
    $('#btn-node-down').onclick = () => App.selectedId && moveNode(App.selectedId, 1);

    /* assets tabs */
    $$('.tab-btn').forEach((b) => { b.onclick = () => { assetsTab = b.dataset.atab; renderAssets(); }; });

    /* viewport toolbar */
    $('#btn-tool-select').onclick = () => { /* only one tool for now */ };
    $('#btn-snap').onclick = (e) => {
      App.snap = !App.snap;
      $('#btn-snap').classList.toggle('active', App.snap);
      status(App.snap ? 'Grid snap on (24 px).' : 'Grid snap off.');
    };

    /* bottom tabs */
    $$('#bottom-tabs button[data-btab]').forEach((b) => b.onclick = () => switchBottomTab(b.dataset.btab));
    $('#btn-clear-console').onclick = () => { $('#console-log').innerHTML = ''; };
    $('#bottom-collapse').onclick = () => {
      $('#bottom').classList.toggle('collapsed');
      $('#bottom-collapse').textContent = $('#bottom').classList.contains('collapsed') ? '▴' : '▾';
    };

    /* script editor */
    $('#script-select').onchange = (e) => openScriptTab(e.target.value);
    $('#btn-new-script').onclick = newScriptDialog;
    $('#btn-save-script').onclick = saveScript;
    $('#btn-attach-script').onclick = () => {
      const nj = selectedNode();
      if (!nj) { status('Select a node first.'); return; }
      if (!App.openScript) { status('Open a script first.'); return; }
      pushUndo();
      nj.script_name = App.openScript;
      saveLocal(); renderTree(); renderInspector();
      status(`Attached ${App.openScript} to ${nj.name}.`);
      GE.TutorialEvents && GE.TutorialEvents.emit('script_attached');
    };
    $('#btn-detach-script').onclick = () => {
      const nj = selectedNode();
      if (!nj || !nj.script_name) return;
      pushUndo();
      delete nj.script_name;
      delete nj.script;
      saveLocal(); renderTree(); renderInspector();
    };
    $('#script-editor').addEventListener('input', debounce(checkScript, 400));
    $('#script-editor').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target;
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveScript(); }
    });

    /* keyboard shortcuts */
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.code === 'F5') { e.preventDefault(); App.play ? null : startPlay(); }
      if (e.code === 'F6') { e.preventDefault(); pausePlay(); }
      if (e.code === 'F8' || (e.code === 'Escape' && App.play)) { e.preventDefault(); stopPlay(); }
      if (e.code === 'Delete' || e.code === 'Backspace') { if (App.selectedId && !App.play) { e.preventDefault(); deleteNode(App.selectedId); } }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); saveLocal(); saveScript(); status('Saved.'); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !App.play) { e.preventDefault(); addNodeDialog(); }
      if (e.code === 'KeyQ') $('#btn-tool-select').click();
    });

    /* autosave on leave */
    window.addEventListener('beforeunload', () => { try { saveScript(); localStorage.setItem(STORAGE_KEY, JSON.stringify(App.project)); } catch (e) {} });
  }

  function switchBottomTab(name) {
    $$('#bottom-tabs button[data-btab]').forEach((b) => b.classList.toggle('active', b.dataset.btab === name));
    $$('.btab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
    if ($('#bottom').classList.contains('collapsed')) $('#bottom-collapse').click();
    if (name === 'tutorial' && GE.Tutorials) GE.Tutorials.render($('#tab-tutorial'));
    if (name === 'api' && GE.ApiPanel) GE.ApiPanel.render($('#tab-api'));
  }

  /* ================================================================== */
  /* Project I/O                                                         */
  /* ================================================================== */
  function exportProject() {
    saveScript();
    const blob = new Blob([JSON.stringify(App.project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (App.project.name || 'project').replace(/[^a-z0-9_-]+/gi, '_') + '.goodness.json';
    a.click();
    URL.revokeObjectURL(a.href);
    status('Project exported.');
  }
  function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadProject(JSON.parse(reader.result));
        } catch (e) { status('Import failed: ' + e.message); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ================================================================== */
  /* Boot                                                                */
  /* ================================================================== */
  function boot() {
    wire();
    /* let tutorials read editor state and switch tabs */
    if (GE.Tutorials) {
      GE.Tutorials.bind({
        selectedJson: () => selectedNode(),
        switchTab: switchBottomTab,
        addNode: addChildNode,
      });
    }
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { loadProject(JSON.parse(raw), { silent: true }); restored = true; }
    } catch (e) {}
    if (!restored) {
      /* starter project: a friendly welcome scene */
      const p = newProject('My First Game');
      p.scenes.main.root.children = [
        { type: 'Sprite', name: 'Ball', _id: uid(), props: { position: [340, 240], texture: 'goodness://ball' }, children: [] },
        { type: 'Label', name: 'Title', _id: uid(), props: { position: [340, 400], text: 'Welcome to Goodness!', font_size: 40, align: 'center', size: [600, 50] }, children: [] },
        { type: 'CanvasLayer', name: 'Hint', _id: uid(), props: {}, children: [
          { type: 'Label', name: 'HintLabel', _id: uid(), props: { position: [340, 660], text: 'Select the Ball, click ＋ to add nodes, or open 📚 Tutorials below', font_size: 16, align: 'center', size: [600, 24], color: '#8ea3c8' }, children: [] },
        ] },
      ];
      loadProject(p, { silent: true });
      status('Welcome! Your project autosaves in this browser. Open 📚 Tutorials to learn the engine.');
    }
    /* open tutorials dock by default for first-time users */
    if (!restored) switchBottomTab('tutorial');
    GE.Logger.info('Goodness Editor ready. Press ▶ (or F5) to play the current scene.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
