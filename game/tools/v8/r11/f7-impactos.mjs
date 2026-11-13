// R11 · F7 · impactos contra props pequeños y NPC, y raíl de esquina (simulación determinista, 2 repeticiones).
//  NPC-03  en tabla de frente contra La Pantera a 8 m/s: sin estrella pero con «golpe» (sacudida o sonido) y caída suave.
//  MOV-13  props pequeños a 12 m/s (`fg_rack`): sin estrella, con golpe y caída suave (no frenazo en silencio).
//  NMG-19  cono del circuito a 7 y 9 m/s: al menos el golpe intermedio (sacudida/sonido) o desvío; no parada en seco en silencio.
//  RAMP-01 raíl de la plaza de esquina a 11 m/s con F: la ventana de enganche crece con la velocidad (≥ 3 de 6 distancias de ollie).
//  No empeorar: contra un NPC a 2 m/s no hay caída; el raíl a 8 m/s sigue enganchando en la mayoría de distancias; sin F nunca engancha.
//   node tools/v8/r11/f7-impactos.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f7-impactos');
const OBS = "if (st === 12) key('KeyW', false); M.shake = Math.max(M.shake || 0, g.rig.shake || 0); if (s.loco === 'impact') M.imp = 1; if (s.loco === 'bail') M.bail = 1; M.vmin = Math.min(M.vmin ?? 99, s.speed);";
const golpe = (r) => (r.shake ?? 0) > 0 || r.ev.some((e) => /^bump/.test(e)) || r.sfx.some((n) => /bail|bump|land|catch/.test(n));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const hacia = (target, d) => (h) => [target[0] - Math.sin(h) * d, target[2] - Math.cos(h) * d];
    const raiz = await page.evaluate(() => { const a = window.__bk.manifest.get('npc.la_pantera'); return [a.pos.x, a.pos.y, a.pos.z]; });
    const pant = await page.evaluate((r) => { const g = window.__bk; let best = null; for (const h of g.npcColliders) { const t = g.world.getCollider(h).translation(), d = Math.hypot(t.x - r[0], t.z - r[2]); if (!best || d < best.d) best = { d, p: [t.x, t.y, t.z] }; } return best.p; }, raiz);
    const fr = Math.atan2(raiz[0] - pant[0], raiz[2] - pant[2]);   // R11: se apunta a la CÁPSULA y se llega de frente (de delante hacia ella)
    // V10 (preparación): literales de V9 girados con la corona (+9°). Cambios de diseño aprobados: los conos del circuito tutorial (NMG-19)
    // desaparecen con NOSVAMOSDEAQUÍ → el prop pequeño equivalente es la papelera de YY (`yy_bin`, 0,75 m), llegando desde dentro; el raíl
    // de la plaza de esquina (RAMP-01, `grind_rail` 4 m, cima 0,34) desaparece con el parque exterior → raíl del exterior `bola_rail`
    // (3,8 m, cima 0,45), por el lado cuyo carril de llegada (4 m) esté libre
    const G = giro(await corona(page));
    const CONO = await page.evaluate(() => { const g = window.__bk; if (g.park.cones?.size) return { t: [-12.38, 0, -32.26], h: 0.3, n: 'cone' };
      let best = null; g.world.forEachCollider((c) => { if (g.park.colliderName(c.handle) !== 'yy_bin') return; const t = c.translation(); if (!best || t.z > best[2]) best = [t.x, 0, t.z]; });
      return best ? { t: best, h: Math.atan2(best[0], best[2]), n: 'yy_bin' } : null; });
    R.fixture(`NMG-19: obstáculo pequeño ${CONO?.n} en ${JSON.stringify(CONO?.t?.map((v) => +v.toFixed(2)))}`, CONO);
    const RAIL = G.rot ? await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, out = [];
        for (const [A, B] of [[[-31.94, -38.59], [-29.33, -41.35]], [[-29.33, -41.35], [-31.94, -38.59]]]) { const L = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
          let libre = true; for (const y of [0.25, 0.9]) for (const lat of [-0.35, 0, 0.35]) { const o = { x: A[0] - u[0] * 4.2 - u[1] * lat, y, z: A[1] - u[1] * 4.2 + u[0] * lat };
            const h = g.world.castRay(new RA.Ray(o, { x: u[0], y: 0, z: u[1] }), 4.0, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider); if (h) { const n = g.park.colliderName(h.collider.handle); if (n !== 'bola_rail' || h.timeOfImpact < 3.6) libre = false; } }
          out.push({ A, B, libre }); }
        return out.find((q) => q.libre) ?? null; }) : { A: [-38.47, -31.96], B: [-41.3, -34.79], libre: true };
    R.fixture(`RAMP-01: raíl ${JSON.stringify(RAIL)}`, RAIL);
    if (!RAIL) R.invalid('RAMP-01: ningún lado del raíl del exterior tiene el carril de llegada libre', {});
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- NPC-03 (La Pantera)
      // R11: rumbo de llegada cuyo PRIMER contacto es la cápsula del NPC (con 0,3 se chocaba antes con el radiocasete y nunca se llegaba a ella)
      const PRIMERO = `if (!M.first && Math.hypot(s.footPos.x - ${pant[0]}, s.footPos.z - ${pant[2]}) < 0.75) M.first = 'NPC';` + "if (!M.first) { for (let i = 0, k = s.kcc.numComputedCollisions(); i < k; i++) { const q = s.kcc.computedCollision(i, s.coll); if (q && q.collider && q.normal1.y < 0.5) { M.first = g.npcColliders.has(q.collider.handle) ? 'NPC' : (g.park.colliderName(q.collider.handle) || '#'); break; } } }";
      // se apunta a la CÁPSULA (delante de la raíz, a la altura de las rodillas) y se llega de frente (rumbos alrededor de su frente)
      let hNpc = null; for (const h of [fr, fr + 0.4, fr - 0.4, fr + 0.8, fr - 0.8]) { const [x, z] = hacia(pant, 5)(h);
        const r0 = await run(page, { p: [x, 0.02, z], h: Math.atan2(pant[0] - x, pant[2] - z), v: 2, sec: 3, pre: "key('KeyW', true)", script: PRIMERO });
        if (r0.first === 'NPC') { hNpc = h; break; } }
      if (hNpc === null) R.invalid(`#${k} NPC-03: ningún rumbo llega a La Pantera sin chocar antes con otra cosa`, {});
      else for (const v of [8, 2]) { const h = hNpc, [x, z] = hacia(pant, v === 2 ? 1.6 : 5)(h);   // a 2 m/s, cerca (soltando W no llega desde 5 m)
        const r = await run(page, { p: [x, 0.02, z], h: Math.atan2(pant[0] - x, pant[2] - z), v, sec: 2.5, pre: "key('KeyW', true)", script: OBS + PRIMERO });
        if (r.first !== 'NPC') { R.invalid(`#${k} NPC-03 ${v} m/s: el primer contacto no fue La Pantera (${r.first})`, {}); continue; }
        if (v === 8) R.check(!r.imp && r.bail && golpe(r), `#${k} NPC-03 La Pantera a 8 m/s: sin estrella (${r.imp ? 'estrella' : 'no'}), con golpe (${golpe(r) ? 'sí' : 'no'}) y caída suave (${r.bail ? 'sí' : 'no'})`, 'input', { ev: r.ev.slice(0, 6), sfx: r.sfx, vmin: r.vmin });
        else R.check(!r.bail && !r.imp, `#${k} no empeorar: contra La Pantera a 2 m/s no hay caída`, 'input', { ev: r.ev.slice(0, 4) }); }
      // ---------------------------------------------------------------- MOV-13 (fg_rack a 12 m/s)
      { const t = G.P([27.28, 0.28, 20.01]), h = G.H(Math.PI), [x, z] = hacia(t, 5)(h); const y = await page.evaluate((x, z) => window.__R11.ray(x, z, 3, 6)?.y, x, z);
        const r = await run(page, { p: [x, (y ?? 0) + 0.02, z], h: Math.atan2(t[0] - x, t[2] - z), v: 12, sec: 2, script: OBS });
        R.check(!r.imp && r.bail && golpe(r), `#${k} MOV-13 fg_rack a 12 m/s: sin estrella, con golpe (${golpe(r) ? 'sí' : 'no'}) y caída suave (${r.bail ? 'sí' : 'no'}) — base: frenazo en silencio a ${r.vmin?.toFixed(1)} m/s`, 'input', { ev: r.ev.slice(0, 6), sfx: r.sfx }); }
      // ---------------------------------------------------------------- NMG-19 (cono del paso 2 del circuito)
      if (CONO) for (const v of [7, 9]) { const t = CONO.t, h = CONO.h, [x, z] = hacia(t, 3)(h);
        const r = await run(page, { p: [x, 0.02, z], h: Math.atan2(t[0] - x, t[2] - z), v, sec: 2, pre: "key('KeyW', true)", script: OBS.replace("if (st === 12) key('KeyW', false); ", '') });
        R.check(golpe(r) || r.bail, `#${k} NMG-19 ${CONO.n === 'cone' ? 'cono' : 'papelera (V10)'} a ${v} m/s: hay golpe (sacudida/sonido) o caída, no parada en seco en silencio (vel. mín. ${r.vmin?.toFixed(1)})`, 'input', { ev: r.ev.slice(0, 6), sfx: r.sfx }); }
      // ---------------------------------------------------------------- RAMP-01 (raíl de esquina)
      if (!RAIL) continue;
      const A0 = RAIL.A, B0 = RAIL.B, L = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), u = [(B0[0] - A0[0]) / L, (B0[1] - A0[1]) / L], h = Math.atan2(u[0], u[1]);
      const raíl = async (v, dj, F = true) => { const p = [A0[0] - u[0] * 4, 0.02, A0[1] - u[1] * 4];
        // ollie cuando quedan `dj` m hasta el comienzo del raíl (A0) a lo largo del eje; F mantenida desde el ollie
        return run(page, { p, h, v, sec: 2.5, script: `{ const al = (${A0[0]} - s.footPos.x) * ${u[0]} + (${A0[1]} - s.footPos.z) * ${u[1]}; if (!M.j && al <= ${dj}) { M.j = st; key('Space', true); } if (M.j && st === M.j + 3) { key('Space', false); ${F ? "key('KeyF', true);" : ''} } if (s.loco === 'grind') M.grind = 1; if (s.loco === 'impact') M.imp = 1; }` }); };
      for (const v of [8, 11]) { let n = 0, imp = false; const prob = [];
        for (const dj of [0.8, 1.2, 1.6, 2.0, 2.6, 3.2]) { const r = await raíl(v, dj); prob.push(`${dj}:${r.grind ? 'G' : r.imp ? 'E' : '.'}`); n += r.grind ? 1 : 0; imp ||= !!r.imp; }
        if (v === 8) R.check(n >= 3 && !imp, `#${k} no empeorar: raíl de esquina a 8 m/s con F engancha en la mayoría de distancias de ollie (${prob.join(' ')})`, 'input', {});
        else R.check(n >= 3 && !imp, `#${k} RAMP-01 raíl de esquina a 11 m/s con F: la ventana de enganche crece con la velocidad (≥ 3 de 6 distancias de ollie entre 0,8 y 3,2 m; ${prob.join(' ')})`, 'input', {}); }
      // V10.1 P03 (D04, P-1, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_1-R2): sin EXTRA el grind es automático
      { const r = await raíl(5, 1.2, false); R.check(!!r.grind && !r.imp, `#${k} V10.1: sin F TAMBIÉN hay grind (automático al caer encima)`, 'input', {}); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
