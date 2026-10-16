/* Build example projects: import each project.mjs and emit project.json.
   Run: node examples/build.mjs */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = ['hello', 'coin-rush', 'nova-strike', 'trivia-quest', 'creature-clash', 'particles-playground', 'art-gallery', 'dungeon-delve', 'word-duel'];

for (const name of EXAMPLES) {
  const mod = await import(`./${name}/project.mjs`);
  const project = mod.default;
  const out = path.join(__dirname, name, 'project.json');
  writeFileSync(out, JSON.stringify(project, null, 2));
  const scene = project.scenes[project.main_scene];
  const nodes = count(scene.root);
  console.log(`✓ ${name.padEnd(22)} → project.json (${nodes} nodes, ${Object.keys(project.assets.scripts).length + count_scripts(scene.root)} scripts)`);
}

function count(node, n = 1) {
  for (const c of node.children || []) n += count(c);
  return n;
}
function count_scripts(node, n = 0) {
  if (node.script) n++;
  for (const c of node.children || []) n += count_scripts(c);
  return n;
}
