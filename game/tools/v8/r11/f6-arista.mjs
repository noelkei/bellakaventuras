// R11 · F6 · apoyo falso en aristas (simulación determinista, 2 repeticiones). «Colgada» = apoyada (grounded) sin suelo bajo la sonda
// central (supportGap > 0,15 m). Esperado tras el arreglo: ≤ 0,3 s seguidos colgada.
//  YY-05  (vaso) entrando al vaso desde el deck rodando: no se queda colgada del labio a −0,1…−0,4 (casos a y b de la ficha).
//  YY-09  saltando a pie junto a la rana no se queda de pie sobre su colisor (> 0,3 m del suelo).
//  NMG-15 ollie tardío contra la plataforma 0,7 de NMG: no se queda colgada de la arista.
//  (NMG-14, mismo mecanismo que NMG-15, no se reproduce con este método determinista en la base: lo cubre NMG-15.)
//  MOV-04 ranura entre la barandilla de E2 oeste y tt_recta: colocada en el aire sin apoyo, cae (no se queda congelada).
//  NMG-08 caída (bail) estando apoyada en una arista sin suelo debajo: cae (no queda «de pie» en el aire).
//  No empeorar: entrar al vaso desde el deck por N1 (#840) sigue cayendo/enganchando dentro sin caída; subir a la plataforma 0,7 con un
//  ollie a tiempo sigue funcionando; la rana sigue siendo sólida de frente (no se la atraviesa andando).
//   node tools/v8/r11/f6-arista.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, racha, paredes, sleep, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f6-arista');
const COLGADA = (extra = 'true') => racha('colg', `s.grounded && s.supportGap > 0.15 && s.loco !== 'grind' && !(s.pool && s.pool.active) && (${extra})`);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const P = await paredes(page);
    // V10 (preparación): las posiciones literales de V9 giran con la corona (+9°; `yy_pool.json` ya viene girado). La plataforma 0,7 del
    // circuito tutorial (`tut_platform`) desaparece con NOSVAMOSDEAQUÍ (cambio de diseño aprobado): NMG-15, NMG-08 y su «no empeorar» se
    // hacen contra la cara diagonal de `nmg_platform` (cima 0,6), de frente y a la misma distancia de la cara que en V9 (1,098 m)
    const G = giro(await corona(page));
    const PLAT = G.rot ? { p: [24.47, 0.02, -27.21], h: -0.733, top: 0.6 } : { p: [-27.01, 0.02, -19.63], h: -2.199, top: 0.7 };
    { const fc = await page.evaluate((o) => { const g = window.__bk, RA = window.__bkRapier, d = { x: Math.sin(o.h), y: 0, z: Math.cos(o.h) };
        const r = g.world.castRayAndGetNormal(new RA.Ray({ x: o.p[0], y: 0.3, z: o.p[2] }, d), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
        return r ? { name: g.park.colliderName(r.collider.handle), d: +r.timeOfImpact.toFixed(3), frente: +(-(r.normal.x * d.x + r.normal.z * d.z)).toFixed(3) } : null; }, PLAT);
      R.fixture(`plataforma de NMG-15: ${fc?.name} a ${fc?.d} m de frente (coseno ${fc?.frente})`, fc);
      if (!fc || fc.d < 1.0 || fc.d > 1.2 || fc.frente < 0.98) R.invalid('la plataforma de NMG-15 no está donde se espera', fc); }
    // la rana se carga por cercanía: acercarse en tiempo real y esperar
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.autoMode = false; g.skater.teleport(new T.Vector3(...p), 0, 'walk'); }, G.P([-37, 0, 9]));
    await page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0], { timeout: 30000 }); await sleep(1000);
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- YY-05 (acotado al vaso)
      for (const [tag, p, h, v] of [['(a) lóbulo derecho N2', [-26.63, 0.02, 14.83], -3.372, 5], ['(b) esquina del lóbulo N1', [-36.95, 0.02, 6.66], 1.353, 8]]) {
        const r = await run(page, { p: G.P(p), h: G.H(h), v, sec: 3, script: COLGADA('s.footPos.y < -0.08 && s.footPos.y > -0.45') });
        const t = +((r.colg ?? 0) / 60).toFixed(2);
        R.check(t <= 0.3, `#${k} YY-05 ${tag}: al entrar al vaso no se queda colgada del labio (racha ${t} s ≤ 0,3)`, 'input', { log: r.log.slice(0, 4), end: r.end });
      }
      { const w = P[840], p = [w[0] - w[2] * 1.6, 0.02, w[1] - w[3] * 1.6]; const r = await run(page, { p, h: Math.atan2(w[2], w[3]), v: 4, sec: 3 });
        R.check(r.end[1] < -0.7 && r.bails === 0, `#${k} no empeorar: entrar al vaso desde el deck por N1 #840 a 4 m/s acaba dentro sin caída (y ${r.end[1]})`, 'input', { log: r.log.slice(0, 4) }); }
      // ---------------------------------------------------------------- YY-09 (rana)
      { const fr = await page.evaluate(() => window.__bk.npcs.get('rana')[0].root.position.toArray());
        const r = await run(page, { p: [fr[0] - 3.5, 0.02, fr[2]], h: Math.PI / 2, v: 0, loco: 'walk', sec: 3, pre: "key('KeyW', true)",
          script: `if (!M.salto && s.footPos.x > ${fr[0]} - 0.9) { M.salto = st; key('Space', true); key('KeyW', false); } if (M.salto && st === M.salto + 3) key('Space', false); ` + racha('encima', `s.footPos.y > 0.3 && Math.abs(s.vy) < 1 && Math.hypot(s.footPos.x - ${fr[0]}, s.footPos.z - ${fr[2]}) < 1.2`) });
        const t = +((r.encima ?? 0) / 60).toFixed(2);
        R.check(r.salto && t <= 0.3, `#${k} YY-09: saltando a pie junto a la rana no se queda de pie sobre su colisor (racha ${t} s ≤ 0,3)`, 'input', { end: r.end });
        const r2 = await run(page, { p: [fr[0] - 3.5, 0.02, fr[2]], h: Math.PI / 2, v: 0, loco: 'walk', sec: 2.5, pre: "key('KeyW', true)", script: `M.dmin = Math.min(M.dmin ?? 99, Math.hypot(s.footPos.x - ${fr[0]}, s.footPos.z - ${fr[2]}));` });
        R.check(r2.dmin >= 0.3, `#${k} no empeorar: andando de frente contra la rana no se la atraviesa (distancia mínima ${r2.dmin.toFixed(2)} m)`, 'input', {}); }
      // ---------------------------------------------------------------- NMG-15 (plataforma 0,7)
      { const r = await run(page, { p: PLAT.p, h: PLAT.h, v: 2, sec: 3, pre: "key('KeyW', true)", script: "if (st === 15) key('Space', true); if (st === 18) key('Space', false); " + COLGADA() });
        const t = +((r.colg ?? 0) / 60).toFixed(2);
        R.check(t <= 0.3, `#${k} NMG-15: ollie tardío contra la plataforma ${PLAT.top}: no se queda colgada de la arista (racha ${t} s ≤ 0,3)`, 'input', { end: r.end, ev: r.ev.filter((e) => /step|leave|bump/.test(e)).slice(0, 4) }); }
      { const h = PLAT.h, p = [PLAT.p[0] - Math.sin(h) * 1.5, 0.02, PLAT.p[2] - Math.cos(h) * 1.5];
        const r = await run(page, { p, h, v: 4, sec: 2, pre: "key('KeyW', true)", script: "if (st === 9) key('Space', true); if (st === 12) key('Space', false); if (s.grounded) M.ymax = Math.max(M.ymax ?? 0, s.footPos.y);" });
        R.check(r.ymax > PLAT.top - 0.1, `#${k} no empeorar: con el ollie a tiempo sube a la plataforma ${PLAT.top} (cota máx. apoyada ${r.ymax?.toFixed(2)})`, 'input', { end: r.end }); }
      // ---------------------------------------------------------------- MOV-04 (ranura de la barandilla E2 oeste)
      { const r = await run(page, { p: G.P([-6.33, 4.86, 32.771]), h: G.H(1.1647), v: 0, loco: 'walk', sec: 2, script: "M.y0 = M.y0 ?? s.footPos.y; M.ymin = Math.min(M.ymin ?? 99, s.footPos.y);" });
        const caida = +(r.y0 - r.ymin).toFixed(2);
        R.check(caida >= 0.5, `#${k} MOV-04: en la ranura entre la barandilla de E2 y tt_recta, sin apoyo, cae (bajó ${caida} m en 2 s)`, 'input', { end: r.end }); }
      // ---------------------------------------------------------------- NMG-08 (caída apoyada en una arista sin suelo debajo)
      { const r = await run(page, { p: PLAT.p, h: PLAT.h, v: 2, sec: 3, pre: "key('KeyW', true)",
          script: "if (st === 15) key('Space', true); if (st === 18) key('Space', false); if (!M.bail && st > 20 && s.grounded && s.supportGap > 0.15) { M.bail = st; M.yb = s.footPos.y; key('KeyW', false); s.bail('r11-arista'); } if (M.bail && st === M.bail + 30) M.y30 = s.footPos.y; " + racha('colgB', "s.loco === 'bail' && s.grounded && s.supportGap > 0.15") });
        if (!r.bail) R.invalid(`#${k} NMG-08: no llegó a apoyarse en la arista (no se pudo provocar la caída ahí)`, { end: r.end });
        else { const t = +((r.colgB ?? 0) / 60).toFixed(2);
          R.check(t <= 0.3, `#${k} NMG-08: caída (bail) apoyada en una arista sin suelo debajo: cae, no se queda de pie en el aire (racha ${t} s ≤ 0,3; y ${r.yb?.toFixed(2)} → ${r.y30?.toFixed(2)} a los 0,5 s)`, 'input', { end: r.end }); } }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
