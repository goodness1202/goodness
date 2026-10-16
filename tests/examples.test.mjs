/* ==========================================================================
   Goodness Engine — example game smoke tests (headless)
   Run:  node tests/examples.test.mjs
   Boots every example project and pumps frames + synthetic input.
   Network calls fail in this sandbox on purpose — which exercises the
   offline fallback paths of the API-powered examples.
   ========================================================================== */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const loader_src = readFileSync(path.join(ROOT, 'engine/loader.js'), 'utf8');
const FILES = [...loader_src.match(/FILES\s*=\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
for (const f of FILES) require(path.join(ROOT, f));
const GE = globalThis.GE;

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const examples_dir = path.join(ROOT, 'examples');
const examples = readdirSync(examples_dir).filter((d) => {
  try { return require('node:fs').statSync(path.join(examples_dir, d, 'project.json')).isFile(); }
  catch { return false; }
});

console.log(`\nSmoke-testing ${examples.length} example games (headless, offline network)\n`);

for (const name of examples) {
  const project = JSON.parse(readFileSync(path.join(examples_dir, name, 'project.json'), 'utf8'));
  try {
    const engine = new GE.Engine({ headless: true, project });
    await engine.start();
    ok(!!engine.tree.current_scene, `${name}: scene loaded`);

    /* simulate 4 seconds of play with wandering input */
    GE.Input._reset();
    const keys = ['KeyA', 'KeyD', 'Space', 'KeyW', 'KeyX'];
    let frame = 0;
    for (let step = 0; step < 240; step++) {
      if (step % 17 === 0) {
        GE.Input._feed({ type: 'key', code: keys[frame++ % keys.length], pressed: true });
        GE.Input._feed({ type: 'mouse', button: 0, pressed: true, position: new GE.Vector2(640, 360) });
      }
      if (step % 17 === 5) {
        GE.Input._feed({ type: 'key', code: keys[frame % keys.length], pressed: false });
        GE.Input._feed({ type: 'mouse', button: 0, pressed: false, position: new GE.Vector2(640, 360) });
      }
      await engine.pump(1, 1 / 60);
    }
    ok(true, `${name}: 240 frames pumped`);
    const node_count = engine.tree._count_nodes();
    ok(node_count > 0, `${name}: tree alive (${node_count} nodes)`);
    engine.stop();
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: crashed — ${e.message}\n${e.stack}`);
  }
}

/* deeper assertions for specific games ------------------------------- */
{
  const project = JSON.parse(readFileSync(path.join(examples_dir, 'coin-rush', 'project.json'), 'utf8'));
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  const main = engine.tree.current_scene;
  const player = main.get_node('Player');
  const level = main.get_node('Level');
  ok(level.get_cells_by_type('C').length === 8, `coin-rush: 8 coins in map (got ${level.get_cells_by_type('C').length})`);
  ok(main.get_node('Coins').children.length === 8, `coin-rush: 8 coin nodes spawned (got ${main.get_node('Coins').children.length})`);
  /* press right + jump for 2s: player should have moved */
  const start_x = player.global_position.x;
  GE.Input._reset();
  for (let i = 0; i < 120; i++) {
    GE.Input._feed({ type: 'key', code: 'KeyD', pressed: true });
    if (i === 10) GE.Input._feed({ type: 'key', code: 'Space', pressed: true });
    if (i === 12) GE.Input._feed({ type: 'key', code: 'Space', pressed: false });
    await engine.pump(1, 1 / 60);
  }
  ok(player.global_position.x > start_x + 100, `coin-rush: player ran right (${(player.global_position.x - start_x).toFixed(0)}px)`);
  ok(player.on_floor || player.global_position.y > 400, 'coin-rush: player still in the world');
  engine.stop();
}

{
  const project = JSON.parse(readFileSync(path.join(examples_dir, 'trivia-quest', 'project.json'), 'utf8'));
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  const quiz = engine.tree.current_scene.get_node('Quiz');
  /* wait for the offline fallback (the blocked fetch times out after ~12s) */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 90 && quiz.state === 'loading'; i++) { await wait(250); await engine.pump(1, 1 / 60); }
  ok(quiz.questions.length > 0, `trivia-quest: questions loaded (offline fallback: ${quiz.questions.length})`);
  ok(quiz.state === 'asking', `trivia-quest: asking state (${quiz.state})`);
  const q = quiz.questions[0];
  ok(q.answers.includes('Goodness Engine'), 'trivia-quest: fallback question present');
  /* answer a question via direct call */
  quiz._last_pressed = q.correct_index;
  quiz._answer();
  ok(quiz.state === 'reveal', 'trivia-quest: answer accepted');
  await engine.pump(90, 1 / 60);
  ok(quiz.state === 'asking', 'trivia-quest: advanced to next question');
  engine.stop();
}

/* ---------------- masterpiece-match (art API + AnimationPlayer) ---------------- */
{
  const project = JSON.parse(readFileSync(path.join(examples_dir, 'art-gallery', 'project.json'), 'utf8'));
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  const board = engine.tree.current_scene.get_node('Board');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && board.cards.length === 0; i++) { await wait(150); await engine.pump(1, 1 / 60); }
  ok(board.artworks.length === 8, `art-gallery: 8 artworks in the deck (${board.artworks.length})`);
  ok(board.online === false, 'art-gallery: fell back to the offline deck without network');
  ok(board.cards.length === 16, `art-gallery: 16 cards dealt (${board.cards.length})`);
  const card = board.cards[0];
  ok(card.back && card.face, 'art-gallery: each card has two sides');
  ok(card.get_node('Anim') instanceof GE.AnimationPlayer, 'art-gallery: each card owns an AnimationPlayer');
  ok(card.get_node('Anim').animation_names.includes('flip'), 'art-gallery: flip animation defined');
  /* deal-in tweens must not leave the cards piled up */
  await engine.pump(120, 1 / 60);
  const spread = new Set(board.cards.map((c) => Math.round(c.global_position.x) + ':' + Math.round(c.global_position.y))).size;
  ok(spread === 16, `art-gallery: cards spread across the board (${spread} slots)`);

  /* flip one card the same way a click does */
  card.flip();
  await engine.pump(20, 1 / 60);
  ok(card.revealed && card.face.visible && !card.back.visible, 'art-gallery: flipping reveals the artwork');

  /* match a pair by clicking at their world positions (cards 1 and its partner
     are still face-down, card 0 was flipped by hand above) */
  /* pick two still-face-down cards that share an artwork (the deal is random) */
  let first = null, partner = null;
  for (const c of board.cards) {
    if (c.revealed) continue;
    const mate = board.cards.find((o) => o !== c && !o.revealed && o.art === c.art);
    if (mate) { first = c; partner = mate; break; }
  }
  ok(!!first && !!partner, `art-gallery: a face-down pair is on the board (${board.cards.map((c) => c.art && c.art.id).join(',')})`);
  if (!partner) engine.stop();
  const click = (target) => {
    GE.Input._feed({ type: 'mouse', button: 0, pressed: true, position: new GE.Vector2(target.global_position.x, target.global_position.y) });
    GE.Input._feed({ type: 'mouse', button: 0, pressed: false, position: new GE.Vector2(target.global_position.x, target.global_position.y) });
  };
  click(first);
  await engine.pump(25, 1 / 60);
  click(partner);
  await engine.pump(60, 1 / 60);
  ok(board.matches === 1, `art-gallery: a matching pair scores (${board.matches})`);
  ok(board.moves === 1, 'art-gallery: the move was counted');
  ok(board.bar.value > 0, 'art-gallery: the progress bar moved');
  ok(GE.Save.get('art_best_moves', null) === null || typeof GE.Save.get('art_best_moves') === 'number', 'art-gallery: best-score slot is sane');
  engine.stop();
}

/* ---------------- dungeon-delve (navigation + raycast + autoloads) ---------------- */
{
  const project = JSON.parse(readFileSync(path.join(examples_dir, 'dungeon-delve', 'project.json'), 'utf8'));
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  const main = engine.tree.current_scene;
  const nav = main.get_node('Nav');
  const player = main.get_node('Player');
  const enemies = main.get_node('Enemies');
  const gems = main.get_node('Gems');

  ok(GE.Autoloads.has('Run'), 'dungeon-delve: Run autoload booted from the project file');
  eq_run: {
    ok(nav.is_baked, 'dungeon-delve: navigation grid baked from the tilemap');
    ok(nav.is_walkable(new GE.Vector2(player.global_position.x, player.global_position.y)), 'dungeon-delve: the spawn point is walkable');
  }
  ok(enemies.slimes.length === 7, `dungeon-delve: 7 slimes spawned (${enemies.slimes.length})`);
  ok(gems.pickups.length === 8, `dungeon-delve: 8 gems spawned (${gems.pickups.length})`);
  const slime = enemies.slimes[0];
  ok(slime.has_script && slime._script_def, 'dungeon-delve: runtime scripts attached to spawned slimes');
  ok(!!slime.get_node('Agent') && !!slime.get_node('Eye'), 'dungeon-delve: slimes carry an agent and a raycast');

  /* walk the player next to a slime: it should sense, path and close in */
  slime.global_position = new GE.Vector2(200, 300);
  slime.get_node('Agent')._dirty = true;
  player.global_position = new GE.Vector2(300, 300);
  const distance_before = slime.global_position.distance_to(player.global_position);
  for (let i = 0; i < 120; i++) await engine.pump(1, 1 / 60);
  const distance_after = slime.global_position.distance_to(player.global_position);
  ok(distance_after < distance_before, `dungeon-delve: a slime chases the hero (${distance_before.toFixed(0)}px -> ${distance_after.toFixed(0)}px)`);

  /* the raycast reports what is in the way */
  const eye = slime.get_node('Eye');
  ok(typeof eye.is_colliding() === 'boolean', 'dungeon-delve: line-of-sight ray answers');

  /* gems feed the autoload */
  const score_before = GE.Autoloads.Run.score;
  const gem = gems.pickups.find((g) => !g.taken);
  player.global_position = gem.global_position;
  for (let i = 0; i < 20; i++) await engine.pump(1, 1 / 60);
  ok(GE.Autoloads.Run.gems >= 1, `dungeon-delve: gem collected through the autoload (${GE.Autoloads.Run.gems})`);
  ok(GE.Autoloads.Run.score >= score_before + 10, 'dungeon-delve: the autoload added score');

  /* the scene-file connection: Timer.timeout -> Game._on_restart */
  const restart = main.get_node('Restart');
  ok(restart.signals.timeout.connections.length === 1, 'dungeon-delve: timer signal wired from the scene file');
  /* escaping the dungeon routes through the autoload and reloads the scene */
  const exit_cell_holder = main.get_node('Level');
  player.global_position = exit_cell_holder.map_to_world(37, 19);
  await engine.pump(3, 1 / 60);
  ok(player._escaped === true, 'dungeon-delve: reaching the door wins the run');
  ok(GE.Autoloads.Run.best > 0, `dungeon-delve: best score recorded (${GE.Autoloads.Run.best})`);
  ok(GE.Save.get('delve_best', 0) > 0, 'dungeon-delve: best score persisted');
  engine.stop();
}

/* ---------------- word-duel (Datamuse + feedback animations) ---------------- */
{
  const project = JSON.parse(readFileSync(path.join(examples_dir, 'word-duel', 'project.json'), 'utf8'));
  const engine = new GE.Engine({ headless: true, project });
  await engine.start();
  const duel = engine.tree.current_scene.get_node('Duel');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && duel.options.length === 0; i++) { await wait(150); await engine.pump(1, 1 / 60); }
  ok(duel.online === false, 'word-duel: offline word pack used without network');
  ok(duel.options.length === 4, `word-duel: four options offered (${duel.options.length})`);
  ok(typeof duel.target === 'string' && duel.target.length > 1, `word-duel: a word to guess (${duel.target})`);
  ok(duel.related.includes(duel.correct_word), 'word-duel: the answer is in the API-related list');
  ok(duel.buttons.every((b) => b.text.length > 0), 'word-duel: every option button is labelled');

  const correct_index = duel.options.indexOf(duel.correct_word);
  const score_before = duel.score;
  duel.answer(correct_index);
  ok(duel.score > score_before, `word-duel: a right answer scores (${duel.score})`);
  ok(duel.streak === 1, 'word-duel: the streak counted');
  /* round 2 needs the (failing) network call to time out first */
  const settle_round = async (round_number) => {
    for (let i = 0; i < 100; i++) {
      if (duel.round === round_number && duel.locked === false && duel.options.length === 4) return true;
      await wait(200);
      await engine.pump(1, 1 / 60);
    }
    return false;
  };
  await engine.pump(120, 1 / 60);
  ok(await settle_round(2), `word-duel: the next round began (round ${duel.round})`);

  /* a wrong answer costs the streak but never crashes */
  const wrong = duel.options.findIndex((o) => o !== duel.correct_word);
  duel.answer(wrong);
  ok(duel.streak === 0, 'word-duel: a miss resets the streak');
  await engine.pump(150, 1 / 60);
  ok(await settle_round(3), `word-duel: the duel keeps going (round ${duel.round})`);

  /* timeout path */
  duel.answer(-1, true);
  ok(duel.locked === true || duel._waiting_next, 'word-duel: running out of time ends the round safely');
  await settle_round(4);

  /* hints use the API dictionary */
  await duel.use_hint();
  ok(duel.hint_used, 'word-duel: hint consumed once per round');
  ok(duel.message.text.length > 0, 'word-duel: the hint explains the word');
  engine.stop();
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed — ${failed === 0 ? 'ALL GREEN ✅' : 'FAILURES ❌'}`);
console.log('='.repeat(60));
if (failed > 0) process.exit(1);
