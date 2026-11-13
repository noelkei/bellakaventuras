// R11 · F6 · MOV-11, MOV-12, MOV-05 (simulación determinista, 2 repeticiones).
//  MOV-11  quieta 2,2 s encima del techo de la barandilla de E2 oeste o de un poste: NO se guarda como punto seguro (lastSafe/checkpoint).
//  MOV-12  saliendo de un borde en manual (techo del túnel del circuito, 1,65 m; V10: techo del paso T1 de NVDA, 1,49 m): en el aire ya no está en manual y el 2.º SALTO hace truco.
//  MOV-05  subiendo la rampa de FG pegada al bordillo lateral, la cápsula no se hunde en la rampa (suelo bajo el pie ≤ 6 cm por encima del pie).
//  No empeorar: quieta en el llano de NMG el punto seguro sí se actualiza; el manual en llano sigue funcionando (entra y se mantiene).
//   node tools/v8/r11/f6-varios.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f6-varios');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    // V10 (preparación): las posiciones literales de V9 giran con la corona (+9°). El túnel del circuito tutorial desaparece con
    // NOSVAMOSDEAQUÍ (cambio de diseño aprobado): MOV-12 se hace desde el techo del paso agachado T1 (`nv.t1`, cima 1,49 m), saliendo
    // en manual por su boca +x local (la −x da a la rampa R1)
    const G = giro(await corona(page)), LS = G.P([20, 0.03, -36]);
    const M12 = G.rot ? await page.evaluate(() => { const g = window.__bk, bx = g.park.boxes.get('nv.t1'), ax = [Math.cos(bx.yaw), -Math.sin(bx.yaw)], d = -bx.h.x + 0.3;
      const x = bx.c.x + ax[0] * d, z = bx.c.z + ax[1] * d, top = window.__R11.ray(x, z, 4, 4).y; return { p: [x, top + 0.02, z], h: Math.atan2(ax[0], ax[1]), top }; }) : { p: [-16.5, 1.68, -23], h: -Math.PI / 2 };
    R.fixture(`MOV-12: borde de salida en manual a ${M12.p[1].toFixed(2)} m`, M12);
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- MOV-11
      for (const [tag, p] of [['techo de la barandilla E2 oeste', [-6.697, 5.08, 32.523]], ['techo de la barandilla E2 oeste (2)', [-6.69, 5.38, 33.15]], ['poste', [-1.77, 5.51, 36.904]], ['llano de NMG (control)', [20, 0.02, -38]]].map(([t, q]) => [t, G.P(q)])) {
        // punto seguro previo conocido (fixture), después quieta 2,2 s encima
        const r = await run(page, { p, h: 0, v: 0, loco: 'walk', sec: 2.2, pre: `s.lastSafe.set(${LS.join(", ")}); M.y0 = s.footPos.y;`, script: "M.y = s.footPos.y; M.ls = [s.lastSafe.x, s.lastSafe.y, s.lastSafe.z];" });
        const d = Math.hypot(r.ls[0] - p[0], r.ls[2] - p[2]), sobre = r.y > p[1] - 0.3;
        if (tag.includes('control')) R.check(d < 0.5, `#${k} no empeorar: quieta en el llano de NMG el punto seguro se actualiza ahí (a ${d.toFixed(2)} m)`, 'input', { ls: r.ls });
        else if (!sobre) R.invalid(`#${k} MOV-11 ${tag}: no se sostuvo encima (y ${r.y.toFixed(2)})`, { ls: r.ls });
        else R.check(d > 0.5, `#${k} MOV-11 ${tag}: quieta encima 2,2 s NO se guarda como punto seguro (punto seguro a ${d.toFixed(2)} m del techo)`, 'input', { ls: r.ls, y: r.y });
      }
      // ---------------------------------------------------------------- MOV-12 (manual al vacío desde el techo del túnel del circuito)
      { const r = await run(page, { p: M12.p, h: M12.h, v: 6, sec: 2.5, pre: "key('KeyF', true)",
          script: "if (s.loco === 'manual') M.man = 1; if (!s.grounded && !M.aire && M.man) { M.aire = st; } if (M.aire && st === M.aire + 8) { M.locoAire = s.loco; key('Space', true); } if (M.aire && st === M.aire + 11) key('Space', false);" });
        if (!r.man || !r.aire) R.invalid(`#${k} MOV-12: no llegó al borde en manual`, { ev: r.ev.slice(0, 5) });
        else R.check(r.locoAire !== 'manual' && r.ev.some((e) => /^trick:|trick-denied/.test(e)), `#${k} MOV-12: saliendo del borde en manual, en el aire ya no está en manual (${r.locoAire}) y el 2.º SALTO responde (truco o aviso: ${r.ev.filter((e) => /trick/.test(e)).join(',') || 'nada'})`, 'input', { ev: r.ev.slice(0, 8) }); }
      { const r = await run(page, { p: G.P([20, 0.02, -38]), h: G.H(1.6), v: 4, sec: 1.2, pre: "key('KeyF', true)", script: "if (s.loco === 'manual') M.man = (M.man || 0) + 1;" });
        R.check((r.man ?? 0) >= 40, `#${k} no empeorar: manual en llano entra y se mantiene (${r.man ?? 0} pasos)`, 'input', {}); }
      // ---------------------------------------------------------------- MOV-05 (rampa de FG pegada al bordillo)
      for (const v of [6.45]) {   // a 1,45 y 4,45 m/s esta medida no reproduce el hundimiento en la base
        const r = await run(page, { p: G.P([28.886, 0.316, 10.445]), h: G.H(4.063), v, sec: 1.5, pre: "key('KeyW', true)",
          script: "{ const f = s.footPos, g0 = R.ray(f.x, f.z, f.y + 1.0, 1.6); if (g0 && s.grounded) M.hund = Math.max(M.hund ?? -1, +(g0.y - f.y).toFixed(3)); }" });
        R.check((r.hund ?? 0) <= 0.06, `#${k} MOV-05 ${v} m/s: subiendo la rampa de FG junto al bordillo no se hunde (suelo hasta ${r.hund} m por encima del pie, ≤ 0,06)`, 'input', { end: r.end });
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
