// V10.3 R1 · guardián de la valla del centro (W04, W-D05, W-D06, W-D07, W-D33; R3-01…R3-05):
//  · con 0 patatas los coches derrapan (activos y visibles) y su caja nunca pasa de r 21,7 (≥ 0,3 m hasta la cara interior de la valla, r 22,0);
//  · empujando a ANMI contra la valla en 8 ángulos (andando, en tabla rápido y con ollie al llegar) nunca entra (r ≥ 22,0);
//  · música: pegada a la valla (r 22,5) domina SN (≥ 0,95) y en la mitad exterior del paseo (r 24,5) la zona (SN ≤ 0,05);
//  · el aviso de «señal rota» salta junto a la valla;
//  · un punto guardado dentro del centro con < 20 patatas sale al paseo interior al cargar;
//  · con 20 y la revelación vista no hay valla (invisible, sin colisiones); con 20 sin ver, la revelación la hunde y quita sus colisiones.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('valla-centro');
const fence = () => { const g = window.__bk, v = g.park.valla; return v ? { up: !!g.park.vallaUp, vis: v.group.visible, y: +v.group.position.y.toFixed(3), on: v.colliders.filter((c) => c.isEnabled()).length, n: v.colliders.length } : null; };
await runTest(R, async () => {
  const b = await launch();
  try {
    // ------------------------------------------------------------------ 0 patatas
    { const page = await openGame(b, R, { save: { ...FRESH, checkpoint: { x: 2, y: 0, z: 9, heading: 0 }, checkpointRevision: 9 } }); await clickStart(page); await sleep(1200);
      const f0 = await page.evaluate(fence), p0 = await page.evaluate(() => { const p = window.__bk.skater.footPos; return { r: +Math.hypot(p.x, p.z).toFixed(2) }; });
      R.measure('valla_0', f0);
      R.check(!!f0 && f0.up && f0.on === f0.n && f0.n > 0, `con 0 patatas la valla está de pie con todas sus colisiones (${f0?.on}/${f0?.n})`, 'input', f0);
      R.check(p0.r >= 22.6, `punto guardado dentro del centro con < 20 → recolocado fuera de la valla (r ${p0.r})`, 'input', p0);
      // coches: activos y su caja (4 esquinas) nunca más allá de r 21,7 durante 4 s
      const cars = await page.evaluate(async () => { const g = window.__bk, C = g.cars; let maxR = 0; const H = { x: 0.93, z: 2.15 };
        for (let k = 0; k < 120; k++) { for (const c of C.cars) { const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
            for (const [lx, lz] of [[H.x, H.z], [-H.x, H.z], [H.x, -H.z], [-H.x, -H.z]]) { const x = c.pos.x + lx * cs + lz * sn, z = c.pos.z - lx * sn + lz * cs; maxR = Math.max(maxR, Math.hypot(x, z)); } }
          await new Promise((r) => setTimeout(r, 33)); }
        return { active: C.active, vis: C.group.visible && C.cars.every((c) => c.g.visible), maxR: +maxR.toFixed(3), speed: +C.avgSpeed.toFixed(2) }; });
      R.measure('coches_0', cars);
      R.check(cars.active && cars.vis, 'con 0 patatas los coches derrapan (activos y visibles)', 'input', cars);
      R.check(cars.maxR <= 21.7, `la caja de los coches no pasa de r 21,7 (máx ${cars.maxR}; valla en r 22,0)`, 'input', cars);
      // empujones contra la valla
      await page.evaluate(() => { const g = window.__bk, s = g.skater, r0 = g.render.bind(g); window.__vmin = 99; g.render = () => { r0(); const p = s.footPos; window.__vmin = Math.min(window.__vmin, Math.hypot(p.x, p.z)); }; });
      const rows = [];
      for (let k = 0; k < 8; k++) for (const mode of ['walk', 'ride', 'ollie']) {
        const a = (k / 8) * Math.PI * 2 + 0.13;
        await page.evaluate((a, mode) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const p = new T.Vector3(Math.cos(a) * 26.5, 0, Math.sin(a) * 26.5);
          g.skater.teleport(p, Math.atan2(-p.x, -p.z), mode === 'walk' ? 'walk' : 'ride'); g.skater.impactProtectUntil = -1; g.rig.snapBehind(g.skater); window.__vmin = 99; }, a, mode);
        await sleep(250);
        await page.keyboard.down('KeyW'); if (mode === 'walk') await page.keyboard.down('ShiftLeft');
        if (mode === 'ollie') { await sleep(900); await page.keyboard.press('Space'); await sleep(1300); } else await sleep(mode === 'ride' ? 2400 : 2600);
        await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await sleep(500);
        const m = await page.evaluate(() => ({ min: +window.__vmin.toFixed(3), loco: window.__bk.skater.loco }));
        rows.push({ k, mode, ...m });
      }
      R.measure('empujones', rows);
      R.check(rows.every((x) => x.min >= 22.0), `ANMI nunca entra en el centro empujando contra la valla (mín r ${Math.min(...rows.map((x) => x.min)).toFixed(3)})`, 'input', rows.filter((x) => x.min < 22.3));
      // música por mitades del paseo interior
      const mus = [];
      for (const r of [22.6, 24.5]) {
        await page.evaluate((r) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(r * Math.cos(1.0), 0, r * Math.sin(1.0)), 0, 'walk'); }, r);
        await sleep(900); mus.push({ r, sn: await page.evaluate(() => +(window.__bk.musicDebug?.secretnovio ?? -1).toFixed(3)) });
      }
      R.measure('musica', mus);
      R.check(mus[0].sn >= 0.95, `pegada a la valla (r ${mus[0].r}) suena SN (peso ${mus[0].sn})`, 'input', mus);
      R.check(mus[1].sn >= 0 && mus[1].sn <= 0.05, `en la mitad exterior del paseo (r 24,5) suena la zona (SN ${mus[1].sn})`, 'input', mus);
      const toast = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(23, 0, 0), -Math.PI / 2, 'walk'); for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 100)); const t = document.getElementById('toast'); if (t && !t.hidden && /señal/i.test(t.textContent)) return t.textContent; } return null; });
      R.check(!!toast, 'junto a la valla salta el aviso de la señal rota', 'input', toast);
      await page.close(); }
    // ------------------------------------------------------------------ 20 con la revelación vista: sin valla
    { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1000);
      const f = await page.evaluate(fence); R.measure('valla_20', f);
      R.check(!!f && !f.up && !f.vis && f.on === 0, 'con 20 y la revelación vista no hay valla (invisible y sin colisiones)', 'input', f);
      await page.close(); }
    // ------------------------------------------------------------------ 20 sin ver la revelación: la valla baja dentro de ella
    { const page = await openGame(b, R, { save: { ...SAVE_20, revealSeen: false } }); await clickStart(page);
      const tr = await page.evaluate(async () => { const out = []; for (let i = 0; i < 90; i++) { const g = window.__bk, v = g.park.valla; out.push({ t: g.revealT, y: +v.group.position.y.toFixed(2), on: v.colliders.filter((c) => c.isEnabled()).length, vis: v.group.visible });
        await new Promise((r) => setTimeout(r, 100)); } return out; });
      const during = tr.filter((x) => x.t > 0), last = tr.at(-1);
      R.measure('revelacion', { n: during.length, first: during[0], last });
      R.check(during.length > 5 && during.every((x) => x.on === 0), 'durante la revelación la valla no tiene colisiones (nadie queda encerrado)', 'input', during.slice(0, 4));
      R.check(during.some((x) => x.y < -0.5 && x.vis) && !last.vis && last.on === 0, 'la valla se hunde en el suelo y desaparece al acabar', 'input', { last });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
