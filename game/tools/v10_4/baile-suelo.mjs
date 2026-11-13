// V10.4 R13 · guardián (usuario: «el baile 1 BREAK… te hundes la mitad del cuerpo»): con cada uno de los 4 bailes libres, en el suelo del parque y
// encima del escenario de FG, ningún punto del cuerpo de ANMI baja más de 4 cm por debajo de donde pisa durante 4 s de baile (antes, el BREAK
// la metía 1,17 m: la guarda de los bailes que levitaban la bajaba hasta que pisara la suela, y en el BREAK las piernas van por el aire).
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('baile-suelo');
const SPOTS = [['suelo de NMG', [30, 0.05, -20]], ['escenario de FG', null]];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(2500);
    const deck = await page.evaluate(() => { const g = window.__bk, all = g.world.colliders.getAll(); for (const c of all) { if (g.park.colliderName(c.handle) !== 'fg_deck') continue; let h; try { h = c.halfExtents(); } catch { continue; } if (h.x > 0.8 && h.z > 0.8) { const t = c.translation(); return [t.x - 1.2, t.y + h.y + 0.05, t.z]; } } return null; });
    SPOTS[1][1] = deck;
    for (const [name, p] of SPOTS) for (let n = 1; n <= 4; n++) {
      if (!p) { R.invalid(`${name}: sin sitio`); continue; }
      await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(...p), 0, 'walk'); }, p); await sleep(1200);
      await page.keyboard.press(`Digit${n}`); await sleep(250);
      let worst = 9, ov = null, danced = false;
      for (let k = 0; k < 16; k++) { const r = await page.evaluate(() => { const g = window.__bk, v = g.visual, s = g.skater, T = window.__bkTHREE; const bb = new T.Box3().setFromObject(v.body ?? v.model, true);   /* con la pose real (vértices deformados) */
          return { d: bb.min.y - s.footPos.y, ov: v.override, on: g.activities.find((a) => a.id === 'freeDance').dancing >= 0 }; });
        if (r.on) { danced = true; ov = r.ov; worst = Math.min(worst, r.d); } await sleep(250); }
      if (!danced) { R.invalid(`${name} · baile ${n}: no empezó (sin sitio para bailar)`); continue; }
      R.check(worst >= -0.07, `${name} · baile ${n} (${ov}): el cuerpo no se mete en el suelo (punto más bajo ${worst.toFixed(2)} m respecto al pie)`, 'input', { worst, ov });
      await page.keyboard.press('KeyW'); await sleep(400);
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
