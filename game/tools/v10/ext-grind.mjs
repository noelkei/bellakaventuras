// V10 IT2 · ext-grind · plan 10 E-16 (Bola de Oro §16 «probar … rail en entrada, uso, salida, salto, giro y grind»; zona «TE grind»): los
// raíles del exterior se grindan como el raíl de esquina de V9. Para cada raíl dado de alta (`g.park.rails` con nombre `bola_rail`) y cada
// sentido cuyo carril de llegada (4,2 m, a 0,25 y 0,9 m de alto y ±0,35 m de lado) está libre (fixture declarada):
//  · a 5 y 8 m/s, ollie (Espacio real) a 0,8 / 1,2 / 1,6 / 2,0 / 2,6 / 3,2 m del principio y F mantenida (como f7 RAMP-01): nunca
//    estrella; grind limpio (loco 'grind', sale sin caída) en ≥ 3 de 6 y el mejor tramo ≥ 1 m;
//  · V10.1 P03: sin F TAMBIÉN hay grind (automático al caer alineada; ya no hay botón EXTRA).
// Además: los tres raíles largos del contrato están dados de alta (≥ 3) y cada uno tiene al menos un sentido de llegada libre.
// Uso: node tools/v10/ext-grind.mjs --url v10 --task V10-IT2 --label final
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('ext-grind');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const rails = await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, out = [];
      for (const r of g.park.rails.filter((q) => q.name === 'bola_rail')) {
        const lados = [];
        for (const [A, B] of [[r.a, r.b], [r.b, r.a]]) { const L = Math.hypot(B.x - A.x, B.z - A.z), u = [(B.x - A.x) / L, (B.z - A.z) / L];
          let libre = true; for (const y of [0.25, 0.9]) for (const lat of [-0.35, 0, 0.35]) { const o = { x: A.x - u[0] * 4.2 - u[1] * lat, y, z: A.z - u[1] * 4.2 + u[0] * lat };
            const h = g.world.castRay(new RA.Ray(o, { x: u[0], y: 0, z: u[1] }), 4.0, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
            if (h && (g.park.colliderName(h.collider.handle) !== 'bola_rail' || h.timeOfImpact < 3.6)) libre = false; }
          lados.push({ A: [A.x, A.z], B: [B.x, B.z], L, libre }); }
        out.push({ top: r.top, lados }); }
      return out; });
    R.measure('raíles', rails.map((r) => ({ top: +r.top.toFixed(2), L: +r.lados[0].L.toFixed(2), libres: r.lados.filter((l) => l.libre).length })));
    R.check(rails.length >= 3, `raíles del exterior dados de alta para grind: ${rails.length} (contrato: 3 raíles largos)`, 'static', rails.map((r) => r.lados[0].A));
    for (const [i, r] of rails.entries()) {
      const libres = r.lados.filter((l) => l.libre);
      R.fixture(`raíl ${i}: ${libres.length} sentido(s) con carril de llegada libre`, libres);
      R.check(libres.length >= 1, `raíl ${i} (${r.lados[0].A.map((v) => v.toFixed(1)).join(', ')}): al menos un sentido de llegada libre`, 'static', r.lados);
      for (const l of libres) { const u = [(l.B[0] - l.A[0]) / l.L, (l.B[1] - l.A[1]) / l.L], h = Math.atan2(u[0], u[1]), p = [l.A[0] - u[0] * 4, 0.02, l.A[1] - u[1] * 4];
        const SCRIPT = (F, dj = 1.6) => `{ const al = (${l.A[0]} - s.footPos.x) * ${u[0]} + (${l.A[1]} - s.footPos.z) * ${u[1]}; if (!M.j && al <= ${dj}) { M.j = st; key('Space', true); }
          if (M.j && st === M.j + 3) { key('Space', false); ${F ? "key('KeyF', true);" : ''} } if (s.loco === 'grind') { M.g = (M.g || 0) + 1; M.s0 ??= -al; M.s1 = -al; }
          if (s.loco === 'impact') M.imp = 1; if (s.loco === 'bail') M.bail = 1; }`;
        // (IT2a/b: con un solo ollie a 1,6 m, a 8 m/s el vuelo pasaba casi todo el raíl y el tramo era 0,6–0,9 m: se usan las 6 distancias
        // de ollie de f7-impactos)
        for (const v of [5, 8]) { const res = [];
          for (const dj of [0.8, 1.2, 1.6, 2.0, 2.6, 3.2]) { const rr = await run(page, { p, h, v, sec: 2.5, script: SCRIPT(true, dj) }); res.push({ dj, g: rr.g ?? 0, tramo: rr.g ? +(rr.s1 - rr.s0).toFixed(2) : 0, imp: !!rr.imp, caida: !!(rr.bail || rr.bails), ev: rr.ev.slice(0, 8) }); }
          const best = Math.max(...res.map((q) => q.tramo)), ok = res.filter((q) => q.g > 0 && !q.caida);
          // nunca estrella; el grind sale (sin caída) en al menos 3 de las 6 distancias (criterio de r11/f7-impactos RAMP-01) y el mejor tramo es ≥ 1 m (un ollie tardío puede dar
          // con la punta del raíl: golpe y caída suave, como cualquier prop fino)
          R.check(res.every((q) => !q.imp) && ok.length >= 3 && best >= 1, `raíl ${i} desde (${l.A.map((q) => q.toFixed(1)).join(', ')}) a ${v} m/s: ollie a 0,8–3,2 m + F: grind limpio en ${ok.length}/6, mejor tramo ${best} m (≥ 1), sin estrella`, 'input', res); }
        // V10.1 P03 (D04, P-1: cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_1-R2): sin botón EXTRA, el grind es AUTOMÁTICO
        // al caer alineada sobre el raíl, en todos los dispositivos (antes: «sin F no hay grind»)
        { const res = []; for (const dj of [1.2, 1.6, 2.0]) { const rr = await run(page, { p, h, v: 5, sec: 2.5, script: SCRIPT(false, dj) }); res.push({ dj, g: rr.g ?? 0, caida: !!(rr.bail || rr.bails), imp: !!rr.imp, ev: rr.ev.slice(0, 6) }); }
          R.check(res.some((q) => q.g > 0 && !q.caida) && res.every((q) => !q.imp), `raíl ${i} desde (${l.A.map((q) => q.toFixed(1)).join(', ')}): SIN F también hay grind (automático al caer encima), sin estrella`, 'input', res); }
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
