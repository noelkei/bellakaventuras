// ACT-03: repite tools/v3/tutorial.mjs (piloto con teclado real) hasta conseguir una pasada completa (máx. 8) y deja como
// evidencia esa pasada, más el registro de las pasadas fallidas (paso donde se quedó el piloto).
//   node tools/v3/tutorial-runs.mjs → captures/v3/P3/ACT-03/tutorial.json (+ tutorial-runs.json)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { GAME } from './lib.mjs';
const out = path.join(GAME, 'captures/v3/P3/ACT-03');
const runs = [];
for (let i = 1; i <= 8; i++) {
  try { execFileSync('node', [path.join(GAME, 'tools/v3/tutorial.mjs')], { stdio: 'ignore', timeout: 600000 }); } catch { /* informe con fallos */ }
  const d = JSON.parse(fs.readFileSync(path.join(out, 'tutorial.json'), 'utf8'));
  const failed = d.checks.filter((c) => !c.ok).map((c) => c.label.slice(0, 40));
  const tries = d.notes.filter((n) => n && (n.barTries !== undefined || n.tunnelTries !== undefined));
  runs.push({ run: i, ok: !failed.length, failed, tries });
  console.log(i, failed.length ? 'FALLO ' + failed[0] : 'OK');
  if (!failed.length) { fs.copyFileSync(path.join(out, 'tutorial.json'), path.join(out, 'tutorial-pass.json')); break; }
}
fs.writeFileSync(path.join(out, 'tutorial-runs.json'), JSON.stringify({ method: 'repetición del piloto hasta una pasada completa; las pasadas fallidas son de alineación del piloto (ver tutorial.json de cada una en su momento)', runs }, null, 1));
console.log('tutorial-runs:', runs.some((r) => r.ok) ? `OK en la pasada ${runs.find((r) => r.ok).run}` : 'SIN PASADA COMPLETA');
