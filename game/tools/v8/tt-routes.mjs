// V7 T7-02..T7-07 · RECORRIDO INTEGRADO de TRA TRA TRA con el controlador real y TECLADO REAL, sin teletransportes entre
// partes (06 · validación): suelo junto a E1 → E1 → camino inferior → PT1 → EV1 (trepa desde +1,20) → P1 → E2 → trasera →
// salto de H con PT2 → E3 → recta → tabla, carrera, R1, ollie → recepción y frenada → EV2 al techo → Aissa → Juseph → PT4 →
// bajada por EV2. La única fixture es la colocación INICIAL junto a la entrada (el viaje desde otros sectores lo cubre la
// campaña). `--order ja` habla primero con Juseph. `--clip` graba el recorrido (fotogramas con marca de tiempo).
// Uso: node game/tools/v7/tt-routes.mjs --url dev --task T7-12 [--order aj|ja] [--clip]
import { Report, runTest, launch, openGame, clickStart, sleep, place, recordClip, arg, flag } from './lib.mjs';
import { Pilot, W, HD, loc, tt, L, go, climb, descend, talk, mount, runJump, KIT, ROOF, HC, RC, LC, TALK_SPOT } from './tt-lib.mjs';

const R = new Report('tt-routes', { meta: { order: arg('order', 'aj') } });
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1200);
    const P = new Pilot(page, R);
    await place(page, R, W(0.6, -7.2), HD(0, 1), 'walk', 'suelo junto a E1 (única fixture del recorrido)');
    await page.waitForFunction(() => window.__bk.npcs.has('aissa') && window.__bk.npcs.has('juseph'), { timeout: 30000 }).catch(() => R.note('NPC sin cargar en 30 s'));
    const route = async () => {
      // ------------------------------------------------------------ 1. E1 y camino inferior
      let r = await go(P, [[0, -4.9], [0, -2.9], [0, -0.6]]);
      R.check(r.ok && Math.abs(r.at.h - (1.2 + 0.03)) < 0.06, 'E1: sube andando los dos tramos hasta el camino (+1,20)', 'input', r.at);
      r = await go(P, [[4.5, 0], [8.8, -0.2]]);
      R.check(r.ok && Math.abs(r.at.h - 1.23) < 0.06, 'camino inferior: llano hasta el giro, sin saltos', 'input', r.at);
      r = await go(P, [[KIT.fries.visible.c[0], KIT.fries.visible.c[1] + 0.2]], { tol: 0.25 }); let s = await tt(page);
      R.check(s.col.includes('tratratra.visible'), 'PT1 recogida sobre el camino, delante de EV1', 'input', { at: r.at, col: s.col });
      // ------------------------------------------------------------ 2. EV1: trepa desde +1,20 hasta P1 +3,20
      r = await go(P, [[KIT.ladders.EV1.at, KIT.ladders.EV1.face - 0.52]], { tol: 0.2 });
      const c1 = await climb(P, page, { expectId: 'tt.EV1' });
      R.check(c1.ok && Math.abs(c1.s.y - 3.23) < 0.08 && c1.minY > 1.15, 'EV1: TREPAR con ACCIÓN y W; base +1,20, desembarco en P1 +3,20', 'input', { id: c1.id, at: loc(c1.s), minY: +c1.minY?.toFixed(3), why: c1.why });
      // ------------------------------------------------------------ 3. E2 y trasera
      const p1y = (KIT.P1.bounds[1] + KIT.P1.bounds[3]) / 2; r = await go(P, [[10.0, p1y], [10.0, KIT.E2.bounds[3] + 0.4], [10.6, HC]], { tol: 0.2 });
      R.check(r.ok && Math.abs(r.at.h - 4.43) < 0.06, 'E2: sube andando a la trasera (+4,40)', 'input', r.at);
      // ------------------------------------------------------------ 4. salto de H (PT2) y descanso
      // (V10.1 P02, D02: andar llega a 2,5 m/s y no a 3; el salto de H a pie pide CARRERILLA desde el fondo del descanso, como a quien juega)
      await go(P, [[11.9, HC]], { tol: 0.25 }); await P.face(HD(-1, 0)); await sleep(150);
      let jumped = false, maxH = 0, minH = 9;   // anda hacia el descanso corrigiendo el rumbo y pulsa SALTO en el canto (R1: con H de 1,84 a pie solo se cruza saltando en el mismo canto o justo después: banda medida −0,05…−0,40 m)
      // carrerilla RECTA (solo W, ya de cara al agujero): la carrera pide 0,8 s de W sin girar; las correcciones de rumbo del piloto la cortaban
      { await P.keys(['KeyW']); const t0 = Date.now();
        while (Date.now() - t0 < 4000) { const p = await L(page); maxH = Math.max(maxH, p.h); minH = Math.min(minH, p.h);
          if (!jumped && p.x <= KIT.rear.hole[2] - 0.1) { await page.keyboard.press('Space'); jumped = true; } if (p.x < KIT.rear.hole[0] - 0.75 || p.h < 3) break; await sleep(12); } }
      await P.release(); await sleep(300); s = await tt(page); let at = loc(s);
      R.check(jumped && at.h > 4.3 && at.x < KIT.rear.hole[0], 'H: se cruza saltando y se aterriza en el descanso', 'input', { at, maxH: +maxH.toFixed(2), minH: +minH.toFixed(2) });
      R.check(s.col.includes('tratratra.medium'), 'PT2 recogida en el aire al saltar H', 'input', s.col);
      R.check(!s.col.includes('tratratra.hidden'), 'PT3 (suelo, mismo eje) NO se recoge desde arriba', 'input', s.col);
      // ------------------------------------------------------------ 5. E3: cuarto de vuelta de 2 m hasta la recta
      const e = KIT.E3, arc = [100, 118, 136, 154, 170].map((d) => [e.center[0] + 1.55 * Math.cos(d * Math.PI / 180), e.center[1] + 1.55 * Math.sin(d * Math.PI / 180)]);
      r = await go(P, [[e.center[0] + 1.0, e.center[1] + 1.6], ...arc, [e.center[0] - 1.6, e.center[1] - 0.4]]);
      R.check(r.ok && Math.abs(r.at.h - 5.63) < 0.06, 'E3: sube el abanico completo y sale a la recta (+5,60) sin resalto', 'input', r.at);
      // ------------------------------------------------------------ 6. recta: tabla, carrera, R1, ollie, recepción y frenada
      r = await go(P, [[7.0, RC]], { tol: 0.3 }); await P.face(HD(-1, 0)); await sleep(150);
      const mounted = await mount(P, page);
      const j = await runJump(P, page, { jumpAt: 0.75 });
      R.measure('salto_final', { vJump: j.vJump, apex: j.apex, landed: j.landed, end: j.end });
      R.check(mounted && j.landed && j.landed.h > 5.5 && j.landed.x < KIT.reception.bounds[2], 'salto final: carrera en tabla desde la salida de E3, R1 + ollie y recepción con apoyo', 'input', { vJump: j.vJump, landed: j.landed });
      const side = KIT.limo.center[0] + KIT.limo.sections.body.w * KIT.limo.scale;
      R.check(j.end.h > 5.5 && j.end.x > side + 0.3 && j.end.sp < 0.3, 'frenada: se detiene sobre la recepción antes de la limo', 'input', { end: j.end, ladoLimo: +side.toFixed(2), margen: +(j.end.x - 0.3 - side).toFixed(2) });
      // ------------------------------------------------------------ 7. EV2 al techo (antes de hablar con nadie)
      await P.ensureFoot();
      const cx = KIT.limo.center[0], ev2 = KIT.ladders.EV2;
      r = await go(P, [[ev2.face + 1.25, ev2.at], [ev2.face + ev2.standoff + 0.5, ev2.at]], { tol: 0.2 }); await P.face(HD(-1, 0));
      const c2 = await climb(P, page, { expectId: 'tt.EV2' });
      R.check(c2.ok && Math.abs(c2.s.y - (ROOF + 0.03)) < 0.1 && c2.minY > 5.55, 'EV2: trepa desde la recepción (+5,60) al techo de la limo', 'input', { id: c2.id, at: loc(c2.s), minY: +c2.minY?.toFixed(3), why: c2.why });
      s = await tt(page);
      R.check(s.pt4 && !s.pt4.available && !s.pt4.visible && !s.heard.aissa && !s.heard.juseph, 'en el techo sin haber hablado: PT4 oculta', 'input', { pt4: s.pt4, heard: s.heard });
      // ------------------------------------------------------------ 8. las dos charlas, en el orden pedido
      const order = arg('order', 'aj') === 'ja' ? ['juseph', 'aissa'] : ['aissa', 'juseph'];
      const spot = TALK_SPOT;
      for (const [i, who] of order.entries()) {
        r = await go(P, [[cx, LC + (who === 'aissa' ? -0.8 : 1.3)], spot[who]], { tol: 0.3 });
        const tk = await talk(P, page);
        R.check(tk.ok && tk.open.talking === who && tk.text[0].toLowerCase() === who, `charla con ${who} desde el techo, junto a su extremo`, 'input', { text: tk.text, at: loc(tk.open) });
        s = await tt(page);
        if (i === 0) R.check(s.heard[who] && !s.heard[order[1]] && !s.act && !s.pt4.available, `tras ${who} sola: escuchada, actividad sin completar, PT4 oculta`, 'input', { heard: s.heard, pt4: s.pt4 });
        else R.check(s.heard.aissa && s.heard.juseph && s.act && s.pt4.available && s.pt4count === 1 && !s.col.includes('tratratra.activity'), 'tras las dos: actividad completa, UNA PT4 disponible y contador sin subir', 'input', { heard: s.heard, pt4: s.pt4, n: s.pt4count, col: s.col });
      }
      // ------------------------------------------------------------ 9. PT4 en el centro del techo y bajada
      const before = (await tt(page)).total;
      r = await go(P, [[cx, LC]], { tol: 0.2 }); await sleep(300); s = await tt(page);
      R.check(s.col.includes('tratratra.activity') && s.total === before + 1 && s.pt4count <= 1, 'PT4 recogida físicamente en el centro del techo (contador +1)', 'input', { col: s.col, total: s.total, at: loc(s) });
      r = await go(P, [[ev2.face - 0.57, ev2.at]], { tol: 0.2 });
      const d2 = await descend(P, page);
      R.check(d2.ok && Math.abs(d2.s.y - 5.63) < 0.08 && d2.minY > 5.55, 'retorno: baja por EV2 hasta la recepción (+5,60), nunca por debajo', 'input', { at: loc(d2.s), minY: +d2.minY?.toFixed(3), why: d2.why });
      s = await tt(page);
      R.check(s.respawns === 0, 'recorrido completo sin reinicios ni recuperaciones', 'input', { respawns: s.respawns });
      R.measure('final', { col: s.col, heard: s.heard, total: s.total });
    };
    if (flag('clip')) await recordClip(page, R, 'recorrido', route, { everyNthFrame: 2, maxWidth: 800, quality: 60 }); else await route();
  } finally { await b.close(); }
}, { timeoutMs: 420000 });
