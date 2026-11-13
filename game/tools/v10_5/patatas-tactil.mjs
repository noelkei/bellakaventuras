// V10.5 R0 · guardián de la caja de recogida de las patatas en táctil (AM-26; E5-27, E5-42, T10):
//  · en táctil, ANMI colocada a +0,10 m por fuera de la caja de siempre (en x o en z) coge la patata; en ordenador, no (igual que antes);
//  · con +0,15 m en x/z, ninguna patata se coge a través de un sólido (24 puntos del borde nuevo de cada una, rayo hacia la patata);
//  · la patata de práctica del tutorial sigue en 0,9 m (no cambia).
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('patatas-tactil');
const S = { ...SAVE_20, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, finalDone: false, revealSeen: false, settings: { iosAppAsked: true } };
const IDS = ['no_me_guillo.visible', 'yinyang.visible', 'tratratra.visible', 'fashion_girl.visible', 'nosvamosdeaqui.hidden'];
/** Coloca a ANMI a `m` metros por fuera de la caja de la patata (por el lado con suelo a su altura) y dice si se recoge en 1 s. */
const tryAt = (page, id, m) => page.evaluate(async (id, m) => {
  const g = window.__bk, RA = window.__bkRapier, T = window.__bkTHREE, p = g.pickups.find((x) => x.id === id); if (!p || p.collected) return { id, err: 'sin patata' };
  const sp = p.spawn, F = RA.QueryFilterFlags.EXCLUDE_SENSORS;
  for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = sp.pos.x + ux * (sp.trigger.x + m), z = sp.pos.z + uz * (sp.trigger.z + m);
    const hit = g.world.castRay(new RA.Ray({ x, y: sp.pos.y + 1.5, z }, { x: 0, y: -1, z: 0 }), 3, true, F, undefined, g.skater.collider); if (!hit) continue;
    const fy = sp.pos.y + 1.5 - hit.timeOfImpact; if (Math.abs(fy - sp.pos.y) > 0.3) continue;
    g.skater.teleport(new T.Vector3(x, fy + 0.02, z), 0, 'walk'); g.skater.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 1000));
    const f = g.skater.footPos, d = Math.max(Math.abs(f.x - sp.pos.x) - sp.trigger.x, Math.abs(f.z - sp.pos.z) - sp.trigger.z);
    return { id, got: p.collected, fuera: +d.toFixed(3) };
  }
  return { id, err: 'sin sitio' };
}, id, m);

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const [di, o, touch] of [['ip14', 'h', true], ['pc720', 'h', false]]) {
      const page = await open7(b, R, dev(di), o, { save: S, query: '?bktest=1&narr=off', errors }); await start7(page, touch); await sleep(1500);
      const rs = []; for (const id of IDS) rs.push(await tryAt(page, id, 0.10));
      const ok = rs.filter((r) => !r.err && r.fuera > 0.02 && r.fuera < 0.15);
      if (touch) R.check(ok.length >= 3 && ok.every((r) => r.got), 'táctil: a +0,10 m por fuera de la caja de siempre, la patata se coge', 'unit', rs);
      else R.check(ok.length >= 3 && ok.every((r) => !r.got), 'ordenador: a +0,10 m por fuera de la caja, no se coge (como antes)', 'unit', rs);
      if (touch) {
        const risk = await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, F = RA.QueryFilterFlags.EXCLUDE_SENSORS, out = [];
          for (const p of g.pickups) { const sp = p.spawn; if (!sp) continue; let bad = 0; const tx = sp.trigger.x + 0.15, tz = sp.trigger.z + 0.15;
            for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = sp.pos.x + Math.cos(a) * tx, z = sp.pos.z + Math.sin(a) * tz;
              const hit = g.world.castRay(new RA.Ray({ x, y: sp.pos.y + 2.5, z }, { x: 0, y: -1, z: 0 }), 6, true, F); if (!hit) continue;
              const fy = sp.pos.y + 2.5 - hit.timeOfImpact; const yOk = sp.reach ? fy >= sp.reach[0] && fy <= sp.reach[1] : fy - sp.pos.y > -0.55 && fy - sp.pos.y < sp.trigger.y + 0.4; if (!yOk) continue;
              const from = { x, y: fy + 0.5, z }, to = { x: sp.pos.x, y: sp.pos.y + 0.5, z: sp.pos.z }, d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, L = Math.hypot(d.x, d.y, d.z);
              const h2 = g.world.castRay(new RA.Ray(from, { x: d.x / L, y: d.y / L, z: d.z / L }), L, true, F, undefined, g.skater.collider); if (h2 && h2.timeOfImpact < L - 0.05) bad++; }
            if (bad) out.push({ id: p.id, bad }); }
          return out; });
        R.check(risk.length === 0, 'con +0,15 m, ninguna patata se coge a través de un sólido', 'unit', risk);
      }
      await page.close();
    }
    // la patata de práctica no cambia: a 0,95 m no se coge, a 0,85 m sí (táctil)
    { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...S, collected: [], narr: { v: 1, estado: 'nuevo', paso: 'PLA-09', practica: false, vistos: ['PLA-01', 'PLA-02', 'PLA-03', 'PLA-05', 'PLA-06', 'PLA-08'], ayuda: null } }, query: '?bktest=1', errors }); await start7(page, true);
      let ex = null; for (let i = 0; i < 300 && ex !== 'PLA-09'; i++) { ex = await page.evaluate(() => { const g = window.__bk, n = g.narr; if (n.exercise) { const id = n.exercise.id; if (id === 'PLA-09') return id;
          if (id === 'PLA-05' || id === 'PLA-08') { if (!window.__q || performance.now() - window.__q > 2500) { window.__q = performance.now(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q' })); } return id; }
          let m = null; g.scene.traverse((o) => { if (o.name === 'TUTORIAL_MARCA') m = o; }); if (m) g.skater.teleport(m.position.clone().setY(g.skater.footPos.y), g.skater.heading, id === 'PLA-06' ? 'ride' : 'walk'); return id; }
        const d = document.getElementById('d2'); if (d && !d.hidden) d.querySelector('.d2-btn.primary')?.click(); return null; }); await sleep(500); }
      const r = await page.evaluate(async () => { const g = window.__bk, k = g.narr.practice, T = window.__bkTHREE; if (!k) return null; const at = async (dd) => { g.skater.teleport(new T.Vector3(k.base.x + dd, g.skater.footPos.y, k.base.z), 0, 'walk'); await new Promise((r) => setTimeout(r, 700)); return k.collected; };
        const far = await at(0.97), near = await at(0.8); return { far, near }; });
      R.check(ex === 'PLA-09' && r && !r.far && r.near, 'la patata de práctica sigue en 0,9 m también en táctil', 'unit', { ex, r });
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
