// T5-23 · Marca de charla por proximidad (OPUS-016, plan 15 §5) y encuadre del baile (OPUS-025, plan 15 §6), en escritorio,
// vertical y horizontal (emulación de viewport; entrada de teclado real).
//  · Marcas: a 7 m del borde el recuadro de la charla no se ve; a 3 m y dentro se ve con opacidad 0,55. La llegada está a
//    ~3 m del borde, así que desde ella se ve (más tenue que en V4): se registra como dato.
//  · Baile: entrada real (andar al recuadro + E), 3 rondas jugadas con flechas reales leyendo la secuencia del DOM; en cada
//    ronda y en su celebración, por fotograma (muestreo ~40 ms): ¿alguna bailarina MÁS CERCA de la cámara que ANMI tapa > 15 %
//    de la caja cabeza+torso de ANMI en pantalla? Aceptación: 0 fotogramas en las 3 rondas y los 3 layouts.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, SAVE_20, r3, arg } from './lib.mjs';
const R = new Report('actividades-ux');
const LAYOUTS = arg('layouts', 'escritorio,vertical,horizontal').split(',');
const VPS = { escritorio: VIEWPORTS.desktop, vertical: VIEWPORTS.phone, horizontal: VIEWPORTS.phoneLand };
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const lay of LAYOUTS) {
      const save = { ...SAVE_20, activities: { ...SAVE_20.activities, danceCombo: false }, partials: { ...(SAVE_20.partials ?? {}), danceRounds: 0 } };
      const page = await openGame(b, R, { viewport: VPS[lay], save }); await clickStart(page); await sleep(1000);
      // ---------------------------------------------------------------- marcas por proximidad
      const area = (id) => page.evaluate((id) => { const a = window.__bk.park.areas.find((x) => x.mesh.name === 'AREA_' + id); return { vis: a.mesh.visible, op: +a.mesh.material.opacity.toFixed(3) }; }, id);
      await fixture(page, R, `${lay}: llegada NMG`, () => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(400); const far = await area('act.pantherTalk');
      const dSpawn = await page.evaluate(() => { const g = window.__bk, a = g.park.areas.find((x) => x.mesh.name === 'AREA_act.pantherTalk'), p = g.skater.footPos; return Math.max(Math.abs(p.x - a.x), Math.abs(p.z - a.z)) - a.half; });
      await fixture(page, R, `${lay}: a 7 m del borde del recuadro de charla`, () => { const g = window.__bk, T = window.__bkTHREE, a = g.park.areas.find((x) => x.mesh.name === 'AREA_act.pantherTalk'); g.skater.teleport(new T.Vector3(a.x + a.half + 7, 0, a.z), -Math.PI / 2, 'walk'); return {}; });
      await sleep(300); const far7 = await area('act.pantherTalk');
      await fixture(page, R, `${lay}: a 3 m del borde del recuadro de charla`, () => { const g = window.__bk, T = window.__bkTHREE, a = g.park.areas.find((x) => x.mesh.name === 'AREA_act.pantherTalk'); g.skater.teleport(new T.Vector3(a.x + a.half + 3, 0, a.z), -Math.PI / 2, 'walk'); return {}; });
      await sleep(300); const near = await area('act.pantherTalk');
      await fixture(page, R, `${lay}: dentro del recuadro de charla`, () => { const g = window.__bk, T = window.__bkTHREE, a = g.park.areas.find((x) => x.mesh.name === 'AREA_act.pantherTalk'); g.skater.teleport(new T.Vector3(a.x, 0, a.z), 0, 'walk'); return {}; });
      await sleep(300); const inside = await area('act.pantherTalk');
      R.check(!far7.vis, `${lay}: marca de charla oculta a 7 m del borde`, 'unit', { far7 });
      R.measure(`${lay}_marca_desde_la_llegada`, { dSpawn: r3(dSpawn), ...far });   // la llegada está a ~3 m: se ve (tenue, 0,55)
      R.check(near.vis && Math.abs(near.op - 0.55) < 0.01 && inside.vis && Math.abs(inside.op - 0.55) < 0.01, `${lay}: marca visible (0,55) a 3 m y dentro`, 'unit', { near, inside });
      // ---------------------------------------------------------------- baile
      await fixture(page, R, `${lay}: junto al recuadro del baile`, () => { const g = window.__bk, z = g.park.zones.get('act.danceCombo'); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(600); await page.keyboard.press('KeyE'); await sleep(1500);
      const started = await page.evaluate(() => !document.getElementById('dance').hidden);
      if (!started) { R.invalid(`${lay}: el baile no empezó con E`); await page.close(); continue; }
      await page.evaluate(() => {
        const g = window.__bk, T = window.__bkTHREE;
        window.__dz = { on: false, rows: [] };
        const box = (root, re) => { const cam = g.rig.cam, W = innerWidth, H = innerHeight, pts = [], ds = []; root.traverse((o) => { if (o.isBone && re.test(o.name)) { const p = new T.Vector3(); o.getWorldPosition(p); ds.push(p.distanceTo(cam.position)); const n = p.project(cam); pts.push([(n.x + 1) / 2 * W, (1 - n.y) / 2 * H]); } });
          if (!pts.length) return null; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), d: Math.min(...ds) }; };
        const loop = () => { const D = window.__dz; if (D.on) {
          const a = box(g.visual.root, /(Head|Neck|Spine2|Spine1|Spine|Hips)$/); const pad = 0.02 * innerHeight; a.x -= pad; a.y -= pad; a.w += 2 * pad; a.h += 2 * pad;
          let worst = 0, who = null; (g.npcs.get('bella') ?? []).forEach((n, i) => { const q = box(n.root, /./); if (!q || q.d >= a.d) return;
            const o = Math.max(0, Math.min(a.x + a.w, q.x + q.w) - Math.max(a.x, q.x)) * Math.max(0, Math.min(a.y + a.h, q.y + q.h) - Math.max(a.y, q.y)) / (a.w * a.h); if (o > worst) { worst = o; who = i; } });
          D.rows.push({ worst: +worst.toFixed(3), who }); }
          requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      const per = [];
      for (let round = 0; round < 3; round++) {
        await page.evaluate(() => { window.__dz.rows = []; window.__dz.on = true; });
        await sleep(600);
        const seq = await page.evaluate(() => [...document.querySelectorAll('#dance-seq span')].map((s) => s.getAttribute('aria-label')));
        for (const k of seq) { await page.keyboard.press(KEY[k]); await sleep(160); }
        await sleep(2600);   // celebración (se mide también)
        const rows = await page.evaluate(() => { window.__dz.on = false; return window.__dz.rows; });
        const bad = rows.filter((r) => r.worst > 0.15);
        per.push({ round: round + 1, seq: seq.join(','), frames: rows.length, occluded: bad.length, worstFrac: r3(Math.max(0, ...rows.map((r) => r.worst))) });
        if (round < 2) { await page.keyboard.press('ArrowUp'); await sleep(900); }   // salta lo que quede de celebración
      }
      const done = await page.evaluate(() => window.__bk.state.p.activities.danceCombo);
      console.log(lay, JSON.stringify(per), 'completado', done);
      R.measure(`baile_${lay}`, per);
      if (!done) R.invalid(`${lay}: el baile no se completó (las rondas no llegaron a jugarse enteras)`, per);
      else R.check(per.every((p) => p.occluded === 0), `${lay}: ninguna bailarina entre la cámara y ANMI en las 3 rondas (fotogramas ocluidos: ${per.map((p) => p.occluded).join('/')})`, 'vision', per);
      await R.shot(page, `baile_${lay}`);
      await page.close();
    }
    R.pendingHuman('Revisión visual del baile y de la marca de charla (G8-V)');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
