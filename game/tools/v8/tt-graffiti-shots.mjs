// V7 R1 · primeros planos de los grafitis TT (cámara directa, solo revisión visual; el arte es del usuario). Uno por grafiti,
// a 2,6 m de su cara y a su altura, con ANMI fuera de cuadro. Uso: node game/tools/v7/tt-graffiti-shots.mjs --url v7 --task R1
import { Report, runTest, launch, openGame, clickStart, directShot, sleep } from './lib.mjs';
import { W, KIT } from './tt-lib.mjs';
import path from 'node:path';
const R = new Report('tt-graffiti-shots');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), 0); }, W(30, -6));
    R.fixture('ANMI fuera de cuadro', W(30, -6)); await sleep(1500);
    const P = Object.fromEntries(KIT.pillars.list.map(([x, y, top, sx, sy, n]) => [n, { x, y, sx, sy }]));
    const files = {};
    for (const it of KIT.graffiti.list.filter((g) => !g.id.startsWith('W'))) {
      const n = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }[it.face];
      const c = it.pillar ? [P[it.pillar].x + n[0] * P[it.pillar].sx / 2, P[it.pillar].y + n[1] * P[it.pillar].sy / 2] : it.at;
      const d = 1.2 + it.size * 1.3;
      files[it.id] = path.basename(await directShot(page, R, it.id, W(c[0] + n[0] * d + n[1] * 0.4, c[1] + n[1] * d - n[0] * 0.4, it.h + 0.15), W(c[0], c[1], it.h), 50));
    }
    R.measure('shots', files); R.check(Object.keys(files).length === 10, '10 grafitis capturados', 'vision');
  } finally { await b.close(); }
});
