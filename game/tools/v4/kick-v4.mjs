// V4-ANIM-03 · Continuidad de la tabla en kickflip/heelflip con TECLADO REAL y PASOS FIJOS (Game.simulate: simulación +
// presentación a 1/60 s, el bucle real solo dibuja): sin ritmo de fotogramas, capturas ni reloj de pared en la medida.
// Por paso: cuaternión LOCAL del hueso Board separado en (a) BASE de los clips mezclados y (b) capa de giro del truco, más
// fase del truco y pesos. Hallazgo C2 V3: 44,8°/68,8° por fotograma frente a límite 43,5° (medida en RAF con normalización).
// Criterio: el salto de la BASE por paso (mezcla de clips) ≤ 15°; el total ≤ giro esperado de la capa en ese paso + 15°.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('ANIM-03', 'kick-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    const runs = [];
    for (const [kind, key] of [['kickflip', null], ['heelflip', 'KeyD'], ['kickflip', null]]) {
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; document.getElementById('hint').hidden = true; g.autoMode = true; g.skater.teleport(new T.Vector3(-6, 0, 6), Math.PI / 2, 'walk'); g.input.clear(); });
      await page.keyboard.press('KeyQ'); await page.evaluate(() => window.__bk.simulate(0.9));
      await page.keyboard.down('KeyW'); await page.evaluate(() => window.__bk.simulate(1.6)); await page.keyboard.up('KeyW');
      await page.keyboard.press('Space'); await page.evaluate(() => window.__bk.simulate(0.12));
      if (key) await page.keyboard.down(key);
      await page.keyboard.press('Space');
      const res = await page.evaluate(async () => {
        const g = window.__bk, v = g.visual, T = window.__bkTHREE; const rows = []; let pb = null, pt = null;
        await g.simulate(1.3, () => {
          const tr = g.skater.trick, base = (v.boardLayered ? v.boardBase : v.boardBone.quaternion).clone(), tot = v.boardBone.quaternion.clone();
          if (pb) rows.push({ st: g.skater.state, trick: tr?.kind ?? null, prog: tr ? +g.skater.trickProgress.toFixed(3) : null, clip: v.currentName,
            dBase: +(base.angleTo(pb) * 180 / Math.PI).toFixed(2), dTot: +(tot.angleTo(pt) * 180 / Math.PI).toFixed(2), q: base.toArray().map((x) => +x.toFixed(4)) });
          pb = base; pt = tot;
        });
        g.autoMode = false;
        return { rows, tricks: g.skater.trickLog.slice(-2) };
      });
      if (key) await page.keyboard.up(key);
      runs.push({ kind, ...res });
      await sleep(300);
    }
    // giro esperado de la capa por paso: 360°·ease'(k)/((rel1−rel0)·dur)/60; ease suave → pico ≈ 1,5× la media
    const out = runs.map((r) => {
      const flipRows = r.rows.filter((x) => x.trick === r.kind);
      const maxBase = Math.max(0, ...r.rows.map((x) => x.dBase));
      const worst = r.rows.reduce((a, x) => (x.dBase > (a?.dBase ?? -1) ? x : a), null);
      const maxTot = Math.max(0, ...flipRows.map((x) => x.dTot));
      return { kind: r.kind, steps: r.rows.length, flipSteps: flipRows.length, maxBase, worst, maxTot, done: r.tricks.map((t) => ({ kind: t.kind, ok: t.ok })) };
    });
    R.note({ runs: out });
    R.check(out.every((o) => o.flipSteps > 5), 'los tres trucos se ejecutan con teclado real (Q, W, Espacio×2 [+D])', 'input', out.map((o) => ({ kind: o.kind, flipSteps: o.flipSteps, done: o.done })));
    R.check(out.every((o) => o.maxBase <= 15), 'mezcla de clips de la tabla continua: salto de la BASE ≤ 15° por paso de 1/60 s', 'unit', out.map((o) => ({ kind: o.kind, maxBase: o.maxBase, worst: o.worst })));
    R.check(out.every((o) => o.maxTot <= 43.5), 'giro total de la tabla por paso ≤ 43,5° (límite V3, sin ruido de fotogramas)', 'unit', out.map((o) => ({ kind: o.kind, maxTot: o.maxTot })));
    R.data.runs = runs.map((r) => ({ kind: r.kind, rows: r.rows }));
  } finally { await browser.close(); }
});
