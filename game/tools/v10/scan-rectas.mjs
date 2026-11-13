// V10 · herramienta (sin comprobaciones): busca las rectas libres más largas del parque para las pruebas de velocidad (como V5 T5-00
// «scan-lines»). Para rectas a cada 3° y desplazamientos de 2 m, barre la cápsula del controlador (r 0,4, alto 1,7) cada 0,5 m sobre
// suelo llano (|y| ≤ 0,05; sin coches) y guarda el tramo libre continuo más largo. Imprime los 12 mejores con su inicio y rumbo three.
// Uso: node tools/v10/scan-rectas.mjs --url v10 --task V10-R3 --label rectas
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('scan-rectas');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    const best = await page.evaluate(() => {
      const g = window.__bk, RA = window.__bkRapier, W = g.world, cap = new RA.Capsule(0.45, 0.4), FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const skip = (c) => g.npcColliders.has(c.handle) || c === g.skater.collider;
      const ok = (x, z) => { const h = W.castRay(new RA.Ray({ x, y: 4, z }, { x: 0, y: -1, z: 0 }), 6, true, FL, undefined, undefined, undefined, (c) => !skip(c)); const y = h ? 4 - h.timeOfImpact : -9;
        if (Math.abs(y) > 0.05) return false; return !W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, FL, undefined, undefined, undefined, (c) => !skip(c)); };
      const out = [];
      for (let a = 0; a < 180; a += 3) { const t = a * Math.PI / 180, ux = Math.sin(t), uz = Math.cos(t), nx = uz, nz = -ux;
        for (let o = -44; o <= 44; o += 2) { let run = 0, s0 = null, bestRun = 0, bestS0 = 0;
          for (let s = -75; s <= 75; s += 0.5) { const x = nx * o + ux * s, z = nz * o + uz * s; if (Math.abs(x) > 52.2 || Math.abs(z) > 52.2) { run = 0; s0 = null; continue; }
            if (ok(x, z)) { if (s0 === null) s0 = s; run = s - s0; if (run > bestRun) { bestRun = run; bestS0 = s0; } } else { run = 0; s0 = null; } }
          if (bestRun > 60) out.push({ a, o, len: +bestRun.toFixed(2), start: [+(nx * o + ux * bestS0).toFixed(2), +(nz * o + uz * bestS0).toFixed(2)], heading: +t.toFixed(4) }); } }
      return out.sort((p, q) => q.len - p.len).slice(0, 12); });
    R.measure('rectas', best);
    for (const r of best) console.log(`recta ${r.len} m · inicio (${r.start}) · rumbo ${r.a}° (${r.heading} rad) · desplazamiento ${r.o}`);
    R.note('herramienta: sin comprobaciones');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
