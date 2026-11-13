// T5-13 · Trazado quarter/palmera (REV04-003, DT-03). (1) ningún tronco de palmera intersecta otro collider sólido; (2) la
// huella de cada isla (1,9 × 1,9) queda a ≥ 0,8 m del collider del quarter NMG; (3) recorrido del quarter ida y vuelta con
// entrada real desde la arista baja: en tabla (W 1,6 s y soltar: sube y vuelve) y a pie (sube andando y vuelve con S), 3/3.
// Más un par general con la referencia 01.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, recStart, recStop, directShot, r3 } from '../lib.mjs';
const R = new Report('quarter-palm');
const th = (33 + 9) * Math.PI / 180, /* V10: corona girada 9° (D-EX-01) */ O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)], X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
const V = (x, z, h = 0) => [O[0] + X[0] * x + Z[0] * z, h, O[1] + X[1] * x + Z[1] * z];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const geo = await page.evaluate(() => {
      const g = window.__bk, P = g.park, RA = window.__bkRapier, out = { trunks: [], quarterAabb: null };
      let q = null; g.world.forEachCollider((c) => { if (P.colliderName(c.handle) === 'nmg_quarter') q = c; });
      const v = q.shape.vertices; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2]); }
      out.quarterAabb = [x0, x1, z0, z1];
      g.world.forEachCollider((c) => { if (P.colliderName(c.handle) !== 'palm_trunk') return; const t = c.translation();
        const hits = []; g.world.intersectionsWithShape(t, c.rotation(), c.shape, (o) => { if (o.handle !== c.handle) hits.push(P.colliderName(o.handle)); return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS);
        // distancia horizontal mínima de la isla (cuadrado 1,9 alrededor del tronco) a la huella del quarter: muestreo
        let dmin = 1e9; for (let a = -0.95; a <= 0.95; a += 0.19) for (let bb = -0.95; bb <= 0.95; bb += 0.19) { const px = t.x + a, pz = t.z + bb;
          const cast = g.world.projectPoint({ x: px, y: 0.3, z: pz }, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (o) => o.handle === q.handle); if (cast) dmin = Math.min(dmin, Math.hypot(cast.point.x - px, cast.point.z - pz)); }
        out.trunks.push({ at: [+t.x.toFixed(2), +t.z.toFixed(2)], hits: hits.filter((h) => !/ground/.test(h)), islandToQuarter: +dmin.toFixed(2) }); });
      return out;
    });
    R.measure('geometria', geo);
    R.check(geo.trunks.every((t) => t.hits.length === 0), 'ningún tronco de palmera dentro de otro collider', 'unit', geo.trunks);
    R.check(geo.trunks.every((t) => t.islandToQuarter >= 0.8), 'islas a ≥ 0,8 m del collider del quarter NMG', 'unit', geo.trunks.map((t) => t.islandToQuarter));
    const runs = [];
    for (const loco of ['ride', 'walk']) for (let rep = 0; rep < 3; rep++) {
      const st = V(10.0, 1.4), hd = Math.atan2(X[0], X[1]);
      await fixture(page, R, `delante de la arista baja del quarter (${loco})`, (p, h, l) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, l); g.rig.snapBehind(g.skater); g.skater.impactLog.length = 0; return {}; }, st, hd, loco);
      await sleep(300); await recStart(page);
      if (loco === 'ride') { await page.keyboard.down('KeyW'); await sleep(1600); await page.keyboard.up('KeyW'); await sleep(3200); }
      else { await page.keyboard.down('KeyW'); await sleep(2200); await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await sleep(2500); await page.keyboard.up('KeyS'); }
      const rows = await recStop(page); const ev = await page.evaluate(() => ({ imp: window.__bk.skater.impactLog.length, bails: window.__bk.skater.bails }));
      const ymax = Math.max(...rows.map((r) => r.y)), back = rows.at(-1).y < 0.1;
      runs.push({ loco, rep, ymax: r3(ymax), back, impacts: ev.imp, locos: [...new Set(rows.map((r) => r.loco))] });
    }
    R.measure('recorridos', runs); console.log(JSON.stringify(runs));
    for (const loco of ['ride', 'walk']) { const rr = runs.filter((r) => r.loco === loco); R.check(rr.every((r) => r.ymax > 0.5 && r.back && r.impacts === 0 && !r.locos.includes('bail')), `quarter ida y vuelta ${loco === 'ride' ? 'en tabla' : 'a pie'} sin caída ni impacto (${rr.filter((r) => r.ymax > 0.5 && r.back && r.impacts === 0).length}/3)`, 'input', rr); }
    await directShot(page, R, 'general_ref01', V(-6, 14, 9), V(6, 3, 0), 70);
    R.pendingHuman('Par general con la referencia 01 (palmera en el lado derecho del cluster)');
  } finally { await b.close(); }
});
