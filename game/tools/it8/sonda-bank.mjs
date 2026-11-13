// IT8 · sonda (medida) del bank de NMG para clasificar esc-routes D1/D2: perfil de alturas y colliders a lo largo del rumbo del ancla
// `nmg.bank.foot` (de −7 m a +4 m) y en el rumbo contrario; y dónde queda la pieza `nmg_bank` respecto al ancla.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, saveJson } from './lib8.mjs';
const R = new Report('it8-sonda-bank', { task: arg('task', 'IT8') });
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await open8(b, R, dev('pc720'), 'h', { save: S20 }); await start8(page, false); await sleep(1200);
    const out = await page.evaluate(() => {
      const g = window.__bk, RA = window.__bkRapier, F = RA.QueryFilterFlags.EXCLUDE_SENSORS, s = g.skater, a = g.manifest.get('nmg.bank.foot');
      const prof = (sign) => { const r = []; for (let d = -7; d <= 4.01; d += 0.5) { const x = a.pos.x + Math.sin(a.heading) * d * sign, z = a.pos.z + Math.cos(a.heading) * d * sign;
        const h = g.world.castRay(new RA.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 10, true, F, undefined, s.collider); r.push({ d, y: h ? +(6 - h.timeOfImpact).toFixed(2) : null, n: h ? g.park.colliderName(h.handle) : null }); } return r; };
      let bank = null; g.world.forEachCollider((c) => { if (g.park.colliderName(c.handle) === 'nmg_bank') { const t = c.translation(); bank = [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)]; } });
      const plat = g.manifest.get('nmg.platform');
      return { ancla: { p: [a.pos.x, a.pos.z].map((v) => +v.toFixed(2)), h: +a.heading.toFixed(3) }, plataforma: { p: [plat.pos.x, plat.pos.y, plat.pos.z].map((v) => +v.toFixed(2)), h: +plat.heading.toFixed(3) }, bank, adelante: prof(1), atras: prof(-1) };
    });
    console.log(JSON.stringify(out.ancla), JSON.stringify(out.plataforma), 'bank', JSON.stringify(out.bank));
    console.log('adelante', out.adelante.map((q) => `${q.d}:${q.y}${q.n && q.n !== 'ground' ? '(' + q.n + ')' : ''}`).join(' '));
    console.log('atrás', out.atras.map((q) => `${q.d}:${q.y}${q.n && q.n !== 'ground' ? '(' + q.n + ')' : ''}`).join(' '));
    const maxF = Math.max(...out.adelante.map((q) => q.y ?? 0)), maxB = Math.max(...out.atras.map((q) => q.y ?? 0));
    R.measure('perfil', out); R.check(true, `sonda del bank: altura máx. delante ${maxF} m, detrás ${maxB} m`, 'unit', { maxF, maxB });
    saveJson('sondas/bank-nmg.json', out);
  } finally { await b.close(); }
});
