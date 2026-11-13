// V10.1 · P02 (D02, D03, P-2, D1-04, D1-05) guardián de correr y de bajar/subir en marcha, con teclado, táctil (stick) y mando:
//  · andar: adelante < 0,8 s → ≤ 2,5 m/s; mantenido → corre y llega a 5 ± 0,15 m/s; al soltar baja a andar y para (sin frenazo en seco);
//    girar a fondo corriendo baja hacia andar (teclado);
//  · bajar de la tabla: a 2 m/s baja andando, a 4 m/s baja CORRIENDO (sigue > 2,5), a 6 m/s no deja (aviso); subir corriendo a 4,5 m/s →
//    sale en tabla con esa velocidad;
//  · pies: corriendo a 5 m/s la suela de apoyo no patina (velocidad horizontal del pie más bajo, en contacto, ≤ 0,9 m/s de mediana).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
const R = new Report('correr-v10-1');
const hv = (page) => page.evaluate(() => { const s = window.__bk.skater; return { v: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), loco: s.loco, run: s.running, state: s.state }; });
async function place(page, label, loco = 'walk', v = 0) {
  return fixture(page, R, `${label}: ANMI en la recta larga del paseo (NMG → exterior), ${loco} a ${v} m/s`, (loco, v) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
    // recta libre de 40 m: el suelo turquesa del exterior hacia el norte del cuadrado (z −46, de x −30 a +30)
    s.teleport(new T.Vector3(-28, 0, -46.5), Math.PI / 2, loco); s.vel.set(v, 0, 0); g.rig.snapBehind(s); g.input.clear(); return { ok: true }; }, loco, v);
}
async function drive(page, dev, on, k = 1) {
  if (dev === 'teclado') { if (on) await page.keyboard.down('KeyW'); else await page.keyboard.up('KeyW'); }
  else if (dev === 'tactil') await page.evaluate((on, k) => { window.__bk.input.move = on ? { x: 0, y: k } : { x: 0, y: 0 }; }, on, k);
  else await page.evaluate((on, k) => { const I = window.__bk.input; I.fakePad ??= { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true }; I.fakePad.axes[1] = on ? -k : 0; }, on, k);
}
async function board(page, dev) {
  if (dev === 'teclado') await page.keyboard.press('KeyQ');
  else if (dev === 'tactil') await page.evaluate(() => { window.__bk.input['edge'].board++; });   // = toque en SUBIR/BAJAR (el mismo flanco que el botón)
  else { await page.evaluate(() => { window.__bk.input.fakePad.buttons[4] = { pressed: true, value: 1 }; }); await sleep(100); await page.evaluate(() => { window.__bk.input.fakePad.buttons[4] = { pressed: false, value: 0 }; }); }
}
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const dev of ['teclado', 'tactil', 'mando']) {
      const page = await openGame(b, R, { save: SAVE_20, viewport: dev === 'tactil' ? VIEWPORTS.phoneLand : VIEWPORTS.desktop }); await clickStart(page); await sleep(1200);
      if (dev === 'mando') await drive(page, dev, false);
      // ---------------- andar / correr
      await place(page, `${dev} andar`); await sleep(300);
      await drive(page, dev, true); await sleep(600); const w = await hv(page);
      await sleep(2600); const r = await hv(page);
      let t0 = Date.now(), top = 0; while (Date.now() - t0 < 1200) { top = Math.max(top, (await hv(page)).v); await sleep(60); }
      // pies a 5 m/s (solo teclado: la medida es la misma en los tres)
      let feet = null;
      if (dev === 'teclado') feet = await page.evaluate(async () => { const g = window.__bk, v = g.visual, T = window.__bkTHREE, b = v.body, out = []; const idx = v['soleIdx']; const tv = new T.Vector3();
        let prev = null; for (let k = 0; k < 50; k++) { await new Promise((r) => requestAnimationFrame(r)); b.skeleton.update(); let low = null;
          for (const i of idx) { b.getVertexPosition(i, tv).applyMatrix4(b.matrixWorld); if (!low || tv.y < low.y) low = tv.clone(); }
          const now = performance.now(); if (prev && low.y < g.skater.visualPos.y + 0.03) out.push(Math.hypot(low.x - prev.p.x, low.z - prev.p.z) / ((now - prev.t) / 1000)); prev = { p: low, t: now }; }
        out.sort((a, b2) => a - b2); return { med: +(out[out.length >> 1] ?? 99).toFixed(2), n: out.length, clip: v.activeActions.join(' ') }; });
      await drive(page, dev, false); await sleep(350); const rel1 = await hv(page); await sleep(1600); const rel2 = await hv(page);
      if (dev === 'teclado') { await place(page, `${dev} girar corriendo`); await drive(page, dev, true); await sleep(2600); await page.keyboard.down('KeyA'); await sleep(700); const turn = await hv(page); await page.keyboard.up('KeyA'); await drive(page, dev, false);
        R.check(turn.v < 3.4 && turn.v > 1.5, `${dev}: corriendo, girar a fondo baja hacia andar (${turn.v} m/s)`, 'input', turn); }
      R.check(w.v <= 2.55 && !w.run, `${dev}: adelante 0,6 s → anda (${w.v} m/s ≤ 2,5)`, 'input', w);
      R.check(r.run && Math.abs(top - 5) <= 0.15, `${dev}: mantenido → corre hasta 5 m/s (${top})`, 'input', { r, top });
      R.check(rel1.v > 1.5 && rel2.v < 0.2, `${dev}: al soltar baja a andar y para (${rel1.v} → ${rel2.v} m/s)`, 'input', { rel1, rel2 });
      if (feet) R.check(feet.n >= 10 && feet.med <= 0.9, `corriendo a 5 m/s la suela de apoyo no patina (mediana ${feet.med} m/s, ${feet.n} muestras; ${feet.clip})`, 'vision', feet);
      // ---------------- bajar de la tabla en marcha
      const dm = {};
      for (const v of [2, 4, 6]) { await place(page, `${dev} bajar a ${v}`, 'ride', v); await sleep(200);
        if (v > 2.5) await drive(page, dev, true, 1);   // mantiene adelante: al bajar a 4 sigue corriendo
        await page.evaluate((v) => { const s = window.__bk.skater; s.vel.set(v, 0, 0); }, v); await board(page, dev); await sleep(650); dm[v] = await hv(page);
        await drive(page, dev, false); await sleep(300); }
      R.check(dm[2].loco === 'walk' && dm[2].v <= 2.5, `${dev}: a 2 m/s baja de la tabla andando`, 'input', dm[2]);
      R.check(dm[4].loco === 'walk' && dm[4].v > 2.5 && dm[4].run, `${dev}: a 4 m/s baja CORRIENDO (${dm[4].v} m/s)`, 'input', dm[4]);
      R.check(dm[6].loco === 'ride', `${dev}: a 6 m/s no deja bajar (aviso)`, 'input', dm[6]);
      // ---------------- subir corriendo
      await place(page, `${dev} subir corriendo`); await drive(page, dev, true); await sleep(2400); const pre = await hv(page); await board(page, dev); await sleep(600); const mt = await hv(page); await drive(page, dev, false);
      R.check(pre.run && mt.loco === 'ride' && mt.v > 3.8, `${dev}: corriendo (${pre.v} m/s) sube a la tabla y sale con esa velocidad (${mt.v} m/s)`, 'input', { pre, mt });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
