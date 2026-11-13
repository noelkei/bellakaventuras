// T5-30 · Tabla por patata (REV04-011, HUM-A5-004/009, D5, N5-05) con ENTRADA REAL: para cada patata no de actividad, a pie y en
// tabla, desde una salida libre a 4 m (16 direcciones; línea recta libre salvo el propio apoyo en el último 1,3 m), W hacia la
// patata; si está elevada (apoyo > 0,25 m) SALTO a ≤ 1,3 m (a pie) o ≤ 2,2 m (en tabla, 5 m/s iniciales declarados); si es de
// paso bajo, agachada (C). Éxito = recogida en ≤ 5 s. Secretas («camera»/«crouch» ocultas): rayo desde la altura de ojos en la
// patata visible de su zona → debe haber un sólido en medio. Pista de ollie: texto según footReach (T5-30).
// Las patatas de actividad se validan en la campaña (campaign-v4 en V5: 20/20).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, r3, arg } from './lib.mjs';
const ONLY = arg('only', ''), LEADS = arg('leads', '1.4,2.0').split(',').map(Number);
const R = new Report('fry-access');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: { ...SAVE_20, collected: [], revealSeen: false } }); await clickStart(page); await sleep(1500);
    const fries = await page.evaluate(() => window.__bk.park.manifest.fries.map((f) => ({ id: f.id, access: f.access, pos: [f.pos.x, f.pos.y, f.pos.z] })));
    const rows = [];
    for (const f of fries.filter((x) => !x.id.endsWith('.activity') && (!ONLY || x.id === ONLY))) {
      if (f.access === 'ramp') { rows.push({ id: f.id, access: f.access, y: r3(f.pos[1]), walk: 'escalera (campaign-v4: sí)', ride: 'escalera con impulso (step-matrix)' }); continue; }   // descanso de escalera: no es una línea recta
      const row = { id: f.id, access: f.access, y: r3(f.pos[1]) };
      for (const [loco, lead] of [['walk', 0.55], ...LEADS.map((l) => ['ride', l])]) {
        if (row[loco] === 'sí') continue;
        const crouchF = f.access === 'crouch';
        const start = await page.evaluate((fp, loco, crouchF) => {
          const g = window.__bk, RA = window.__bkRapier, W = g.world, flags = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
          const cap = crouchF ? new RA.Capsule(0.2, 0.3) : new RA.Capsule(0.45, 0.3), cy = crouchF ? 0.55 : 0.9;
          const gyAt = (x, z) => { const h = W.castRay(new RA.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 8, true, flags); return h ? 6 - h.timeOfImpact : -9; };
          for (const D of [4, 5.5, 7, 3]) for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, sx = fp[0] + Math.sin(a) * D, sz = fp[2] + Math.cos(a) * D;
            const gy = gyAt(sx, sz); if (gy > 0.25 || gy < -0.6) continue;
            // recorrer la línea hasta el BORDE del apoyo (subida de suelo > 0,2 m o choque con la cápsula); el apoyo debe contener la patata
            let edge = null;
            for (let t = 0; t <= D; t += 0.1) { const x = sx + (fp[0] - sx) * t / D, z = sz + (fp[2] - sz) * t / D, yy = gyAt(x, z);
              const blocked = W.intersectionWithShape({ x, y: gy + cy, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, flags, undefined, undefined, undefined, (c) => c.handle !== g.skater.collider.handle);
              if (yy - gy > 0.2 || blocked || Math.abs(yy - gy) > 0.2) { edge = t; break; } }
            const elevated = fp[1] > 0.25;
            if (!elevated && edge !== null && edge < D - 0.5) continue;   // a ras de suelo: línea libre hasta la patata
            if (elevated && (edge === null || edge < 1.5 || D - edge > 2.5 || gyAt(sx + (fp[0] - sx) * (edge + 0.5) / D, sz + (fp[2] - sz) * (edge + 0.5) / D) < fp[1] - 0.3)) continue;
            return { x: sx, y: gy, z: sz, heading: Math.atan2(fp[0] - sx, fp[2] - sz), D, edge }; }
          return null; }, f.pos, loco, crouchF);
        if (!start) { row[loco] = 'sin salida libre (sonda)'; R.invalid(`${f.id} ${loco}: sin salida recta libre para la sonda`); continue; }
        await fixture(page, R, `${f.id} ${loco}: salida a ${start.D} m`, (st, loco) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(st.x, st.y, st.z), st.heading, loco); if (loco === 'ride') g.skater.vel.set(Math.sin(st.heading) * 5, 0, Math.cos(st.heading) * 5); g.rig.snapBehind(g.skater); return {}; }, start, loco);
        await sleep(200);
        const crouch = f.access === 'crouch', elevated = f.pos[1] > 0.25 && f.access !== 'ramp';
        if (crouch) await page.keyboard.down('KeyC');
        await page.keyboard.down('KeyW'); let jumped = false, got = false; const t0 = Date.now();
        while (Date.now() - t0 < 5000) { const q = await page.evaluate((id, fp) => { const s = window.__bk.skater; return { got: window.__bk.state.isCollected(id), d: Math.hypot(s.footPos.x - fp[0], s.footPos.z - fp[2]) }; }, f.id, f.pos);
          if (q.got) { got = true; break; }
          const toEdge = start.edge != null ? (start.D - q.d) : 0;   // recorrido desde la salida (línea recta)
          if (elevated && !jumped && start.edge != null && start.edge - toEdge <= lead) { await page.keyboard.press('Space'); jumped = true; }
          await sleep(16); }
        await page.keyboard.up('KeyW'); if (crouch) await page.keyboard.up('KeyC');
        row[loco] = got ? 'sí' : 'no'; if (loco === 'ride') row.rideLead = got ? lead : row.rideLead;
        // fixture de reinicio: quitar la patata del guardado y recargar para el intento siguiente
        if (got) { await page.evaluate((id) => { const k = 'bellakaventuras.remake.save', sv = JSON.parse(localStorage.getItem(k)); sv.collected = sv.collected.filter((x) => x !== id); localStorage.setItem(k, JSON.stringify(sv)); window.__bk.state.save = () => {}; }, f.id);
          await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(800); }
      }
      // ocultación de las secretas desde la patata visible de su zona (altura de ojos)
      if (f.id.endsWith('.hidden') && f.access === 'camera') {
        const vis = fries.find((x) => x.id === f.id.replace('.hidden', '.visible'));
        row.ocultaDesdeLaVisible = await page.evaluate((a, b) => { const g = window.__bk, RA = window.__bkRapier; const o = { x: a[0], y: a[1] + 1.6, z: a[2] }, d = { x: b[0] - o.x, y: b[1] + 0.2 - o.y, z: b[2] - o.z }, L = Math.hypot(d.x, d.y, d.z);
          const h = g.world.castRay(new RA.Ray(o, { x: d.x / L, y: d.y / L, z: d.z / L }), L - 0.3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); return !!h; }, vis.pos, f.pos);
      }
      rows.push(row); console.log(JSON.stringify(row));
    }
    R.measure('tabla', rows);
    const ollie = rows.filter((x) => x.access === 'ollie');
    const tested = rows.filter((x) => x.access !== 'ramp' && (!/sonda/.test(x.walk) || !/sonda/.test(x.ride)));
    R.check(tested.every((x) => x.walk === 'sí' || x.ride === 'sí'), `cada patata con salida medible se recoge a pie o en tabla con entrada real (${tested.filter((x) => x.walk === 'sí' || x.ride === 'sí').length}/${tested.length}; sin salida recta: ${rows.filter((x) => !tested.includes(x)).map((x) => x.id).join(', ') || '—'}, cubiertas por campaign-v4 20/20 y u-pit)`, 'input', rows);
    R.check(rows.filter((x) => x.access === 'camera').every((x) => x.ocultaDesdeLaVisible), 'las secretas por cámara siguen ocultas desde la patata visible de su zona', 'input', rows.filter((x) => x.access === 'camera'));
    R.check(rows.filter((x) => x.access === 'ollie' && x.y <= 0.72).every((x) => x.walk === 'sí') && rows.filter((x) => x.access === 'ollie' && x.y > 0.72).every((x) => x.ride === 'sí'), 'ollie: a pie las de apoyo ≤ footReach (0,72) y en tabla las más altas (coherente con la pista)', 'input', rows.filter((x) => x.access === 'ollie'));
    R.measure('ollie_a_pie', ollie.map((x) => ({ id: x.id, y: x.y, aPie: x.walk })));
    R.pendingHuman('Recorrido libre del usuario (G8)');
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
