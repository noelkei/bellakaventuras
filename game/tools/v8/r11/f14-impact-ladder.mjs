// R11 · F14 · copia de la sonda AUD-JUG/ANIM/impact-ladder.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/ANIM · (A) golpe de coche y levantarse (guardado 20/20): cuerpo/pies frente al suelo en caída y al levantarse, tablas,
// saltos de pose; (B) trepa: distancia de cada mano al peldaño más cercano y de cada suela al peldaño de apoyo (FG, EV1, EV2);
// (C) vaso de YINYANG en tabla por el fondo hacia la pared: tabla frente a la superficie.
import { Report, runTest, launch, openGame, clickStart, sleep, place, installHelpers, sim, tap, SAVE_20, FV, FH, TW, THD, arg } from './f14-anim-lib.mjs';
import { installAnim, runScript, summarize } from './f14-anim-lib.mjs';
const R = new Report('r11-f14-impact-ladder');
const only = arg('only') ? new Set(arg('only').split(',')) : null, on = (k) => !only || only.has(k);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(2500); await installHelpers(page); await installAnim(page);
    await page.evaluate(() => window.__bkCamFadeUniform?.value.set(0, 0.01));
    if (on('A')) for (let rep = 1; rep <= 2; rep++) {
      await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) a.cancel?.(); g.input.clear(); });
      const at = await page.evaluate(() => { const g = window.__bk, c = g.cars.cars[0]; const a = Math.atan2(c.pos.z, c.pos.x); const v = c.vel; const dir = Math.sign(-Math.sin(a) * v.x + Math.cos(a) * v.z) || 1; const b2 = a + dir * 0.7; return [17.5 * Math.cos(b2), 0, 17.5 * Math.sin(b2)]; });
      await place(page, R, at, 0, 'walk', `golpe #${rep}`);
      const rows = await page.evaluate(async () => { const rows = []; window.__anim.reset(); const s = window.__bk.skater; await window.__sim(5.0, (t) => { const r = window.__anim.sample(); r.ph = s.impactPhase; r.t = +t.toFixed(3); rows.push(r); }); return rows; });
      const S = summarize(rows.slice(2));
      const byPh = {}; for (const r of rows) { if (!r.ph) continue; const k = r.ph; const m = Math.min(r.fL ?? 9, r.fR ?? 9); byPh[k] = byPh[k] ?? { n: 0, pieMin: 9, pieMax: -9, clips: new Set() }; byPh[k].n++; byPh[k].pieMin = Math.min(byPh[k].pieMin, m); byPh[k].pieMax = Math.max(byPh[k].pieMax, m); byPh[k].clips.add(r.clip); }
      for (const k of Object.keys(byPh)) byPh[k].clips = [...byPh[k].clips];
      const spikes = rows.filter((r) => (r.hipJump ?? 0) > 0.12 || (r.rootTurn ?? 0) > 25).map((r) => ({ t: r.t, ph: r.ph, clip: r.clip, cadera: r.hipJump, giro: r.rootTurn }));
      R.note({ caso: `golpe de coche #${rep}`, locos: S.locos, fases: byPh, dosTablas: S.dosTablas, picos: spikes.slice(0, 8) });
      R.check(!spikes.length, `golpe #${rep}: sin saltos de pose bruscos (cadera ≤ 12 cm/fot., giro ≤ 25°/fot.) fuera del vuelo`, 'vision', spikes.slice(0, 4));
      R.check(Object.entries(byPh).filter(([k]) => k === 'land' || k === 'getup').every(([, v]) => v.pieMin > -0.06), `golpe #${rep}: tumbada y levantándose, ningún pie bajo el suelo > 6 cm`, 'vision', byPh);
      if (rep === 1) for (const tt of [0.6, 1.6, 2.6, 3.6]) { await place(page, R, at, 0, 'walk', `golpe captura ${tt}`);
        const at2 = await page.evaluate(() => { const g = window.__bk, c = g.cars.cars[0]; const a = Math.atan2(c.pos.z, c.pos.x); const v = c.vel; const dir = Math.sign(-Math.sin(a) * v.x + Math.cos(a) * v.z) || 1; const b2 = a + dir * 0.7; return [17.5 * Math.cos(b2), 0, 17.5 * Math.sin(b2)]; });
        await place(page, R, at2, 0, 'walk', `golpe captura ${tt}`); await sim(page, tt); await page.evaluate(() => window.__bk.render()); await R.shot(page, `golpe_${tt}s`); }
    }
    if (on('B')) for (const [lab, p, h] of [['FG', FV(0, -10.9), FH(0, 1)], ['EV1', TW(10.0, -0.55, 1.2), THD(0, 1)], ['EV2', TW(-6.246, 3.5, 5.6), THD(-1, 0)]]) for (let rep = 1; rep <= 2; rep++) {
      await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) a.cancel?.(); g.input.clear(); });
      await place(page, R, p, h, 'walk', `trepa ${lab} #${rep}`); await sim(page, 0.4); await tap(page, 'KeyE'); await sim(page, 0.5);
      const r = await page.evaluate(async () => { const g = window.__bk, V = g.visual, T = window.__bkTHREE, lc = g.activities.find((a) => a.id === 'ladderClimb'); const bones = V.body.skeleton.bones;
        const hand = ['Left', 'Right'].map((sd) => bones.find((b) => new RegExp(sd + 'Hand$').test(b.name))); const L = lc.L; const step = L.rung ?? 0.22; const rungs = []; for (let y = L.bottom + step; y < L.top - 0.02; y += step) rungs.push(y);
        const ax = L.axis, hd = L.heading, out = []; window.__K('KeyW', true);
        for (let i = 0; i < 400 && lc.phase !== 'off'; i++) { await window.__sim(1 / 60); if (lc.phase !== 'climb') continue; V.root.updateMatrixWorld(true);
          const d = hand.map((bn) => { const q = bn.getWorldPosition(new T.Vector3()); const lat = Math.abs((q.x - ax.x) * Math.cos(hd) - (q.z - ax.z) * Math.sin(hd)); const fwd = (q.x - ax.x) * Math.sin(hd) + (q.z - ax.z) * Math.cos(hd); const dy = Math.min(...rungs.map((y) => Math.abs(q.y - y))); return { dy: +dy.toFixed(3), plano: +fwd.toFixed(3) }; });
          const grip = V.grip ? ['Left', 'Right'].map((sd) => +(V.grip[sd].w).toFixed(2)) : null;
          out.push({ ph: lc.phase, u: +lc.u.toFixed(2), d, grip }); }
        window.__K('KeyW', false); return out; });
      const agarre = r.filter((x) => x.grip && x.grip.some((w) => w > 0.8));
      const dys = agarre.flatMap((x) => x.d.filter((_, k) => x.grip[k] > 0.8).map((q) => q.dy)), plano = agarre.flatMap((x) => x.d.filter((_, k) => x.grip[k] > 0.8).map((q) => q.plano));
      const mx = dys.length ? Math.max(...dys) : null;
      R.note({ caso: `trepa ${lab} #${rep}`, frames: r.length, framesConAgarre: agarre.length, manoPeldañoMax: mx, manoPeldañoMedia: dys.length ? +(dys.reduce((a, b2) => a + b2, 0) / dys.length).toFixed(3) : null, distPlanoMinMax: plano.length ? [Math.min(...plano), Math.max(...plano)] : null });
      R.check(mx == null || mx < 0.05, `trepa ${lab} #${rep}: con la mano agarrada, la muñeca está a ≤ 5 cm de un peldaño (en altura)`, 'vision', { mx, n: dys.length });
    }
    if (on('C')) for (let rep = 1; rep <= 2; rep++) {
      await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) a.cancel?.(); g.input.clear(); });
      const fr = await page.evaluate(() => { const p = window.__bk.park.manifest.fries.find((x) => x.id === 'yinyang.visible'); return p.pos.toArray(); });
      for (const hd of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        await place(page, R, fr, hd, 'ride', `vaso YY rumbo ${hd.toFixed(2)} #${rep}`); await sim(page, 0.3);
        const rows = await runScript(page, 3.0, [], ['KeyW']); const S = summarize(rows.slice(10));
        const bad = rows.filter((x) => x.deck != null && x.deck < -0.03).map((x) => ({ t: x.t, st: x.st, deck: x.deck }));
        R.note({ caso: `vaso YY rumbo ${hd.toFixed(2)} #${rep}`, tablaMin: S.tablaMin, locos: S.locos, picos: rows.filter((x) => (x.rootTurn ?? 0) > 15).map((x) => [x.t, x.st, x.rootTurn]).slice(0, 5), bajoSuelo: bad.slice(0, 4) });
        R.check(!bad.length, `vaso YY rumbo ${hd.toFixed(2)} #${rep}: la tabla no atraviesa el suelo del vaso (> 3 cm)`, 'vision', bad.slice(0, 3));
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
