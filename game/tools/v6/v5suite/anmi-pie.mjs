// T5-19 · Poses a pie de ANMI conducidas por el juego (entrada real), con capturas de cámara directa:
//  · SALTO (HUM-A5-009): SPACE parado → fases muestreadas por fotograma (vy, tiempo de aire, tiempo del clip conducido) y
//    captura del ÁPICE en 3 vistas (frente, lateral, espalda) + secuencia (prep/impulso/ápice/recogida/contacto/absorción).
//    Comprobaciones: el clip avanza por fases en orden (no en bucle) y en el ápice brazos y piernas están abiertos (mano
//    izquierda y pies más separados del eje que en reposo).
//  · CAÍDA sin salto (N5-02): andar fuera de un borde (plataforma tut 0,7 m) → pose de caída (fase «fall»), no la del salto.
//  · INCLINACIÓN en el giro con pasos (HUM-A5-007): solo D → la cabeza se desplaza hacia el centro del giro (derecha).
//  · AGACHADA quieta: captura (pose con doble apoyo).
import { Report, runTest, launch, openGame, clickStart, sleep, place, directShot, r3 } from '../lib.mjs';
const R = new Report('anmi-pie');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(600);
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, V = g.visual;
      window.__ap = { on: false, rows: [] };
      const bone = (re) => { let o = null; V.model.traverse((x) => { if (!o && x.isBone && re.test(x.name)) o = x; }); return o; };
      const B = { hL: bone(/LeftHand$/), hR: bone(/RightHand$/), fL: bone(/LeftFoot$/), fR: bone(/RightFoot$/), head: bone(/Head$/), hips: bone(/Hips$/) };
      window.__apB = B;
      const r0 = g.render.bind(g);
      g.render = () => { r0(); const A = window.__ap; if (!A.on) return; const s = g.skater, hb = V.actions.get('SK_HopBoard');
        const loc = (o) => { const p = new T.Vector3(); o.getWorldPosition(p); return V.root.worldToLocal(p); };
        const hip = loc(B.hips), hL = loc(B.hL), fL = loc(B.fL), fR = loc(B.fR), head = loc(B.head);
        A.rows.push({ t: +g.clock.toFixed(3), st: s.state, vy: +s.vy.toFixed(2), air: +s.airTime.toFixed(3), hopAir: s.hopAir, u: hb ? +(hb.time / hb.getClip().duration).toFixed(3) : null, w: hb ? +hb.getEffectiveWeight().toFixed(2) : null,
          handLx: +Math.abs(hL.x - hip.x).toFixed(3), handLy: +(hL.y - hip.y).toFixed(3), feetX: +Math.abs(fL.x - fR.x).toFixed(3), headX: +(head.x - hip.x).toFixed(3), y: +s.footPos.y.toFixed(3) }); };
    });
    const rec = async (fn) => { await page.evaluate(() => { window.__ap.rows = []; window.__ap.on = true; }); await fn(); return page.evaluate(() => { window.__ap.on = false; return window.__ap.rows; }); };
    const shotAround = async (name, deg, h = 1.0, d = 3.0) => page.evaluate(() => { const g = window.__bk, s = g.skater; return [s.visualPos.x, s.visualPos.y, s.visualPos.z, s.heading]; })
      .then(([x, y, z, hd]) => { const a = hd + deg * Math.PI / 180; return directShot(page, R, name, [x + Math.sin(a) * d, y + h, z + Math.cos(a) * d], [x, y + 0.9, z], 45); });
    // ---------------------------------------------------------------- reposo (referencia de apertura)
    await place(page, R, [-14, 0, -2], 0, 'walk', 'salto'); await sleep(800);
    const rest = (await rec(() => sleep(300))).at(-1);
    // ---------------------------------------------------------------- salto
    let apexShot = false;
    const jump = await rec(async () => { await page.keyboard.press('Space');
      for (let i = 0; i < 80; i++) { const q = await page.evaluate(() => ({ vy: window.__bk.skater.vy, st: window.__bk.skater.state })); if (!apexShot && q.st === 'walk_air' && q.vy <= 0.3) { await page.evaluate(() => window.__bk.setPaused(true)); apexShot = true;
          for (const [n, d] of [['apice_frente', 0], ['apice_lateral', 90], ['apice_espalda', 180]]) await shotAround(n, d);
          await page.evaluate(() => window.__bk.setPaused(false)); } await sleep(15); if (q.st !== 'walk_air' && i > 10) break; }
      await sleep(500); });
    const air = jump.filter((r) => r.st === 'walk_air');
    const apex = air.reduce((m, r) => (r.y > (m?.y ?? -9) ? r : m), null);
    const us = air.map((r) => r.u);
    const mono = us.every((u, i) => i === 0 || u >= us[i - 1] - 0.02);
    const landRows = jump.filter((r) => r.st !== 'walk_air' && r.w > 0.05 && r.t > (air.at(-1)?.t ?? 0));
    R.measure('salto', { rest, apex, airFrames: air.length, uFirst: us[0], uLast: us.at(-1), landFrames: landRows.length, landU: landRows.map((r) => r.u) });
    R.check(air.length > 10 && mono && us[0] < 0.2 && us.at(-1) > 0.4, `salto: el clip avanza por fases en orden durante el vuelo (u ${us[0]} → ${us.at(-1)}, ${air.length} fotogramas)`, 'unit', { us: us.filter((_, i) => i % 3 === 0) });
    R.check(apex && apex.handLx > rest.handLx + 0.2 && apex.feetX > rest.feetX + 0.2, `salto: en el ápice brazo izquierdo y piernas abiertos (mano ${apex?.handLx} vs ${rest.handLx} m; pies ${apex?.feetX} vs ${rest.feetX} m)`, 'unit', { apex, rest });
    R.check(landRows.length > 3 && landRows.at(-1).u > landRows[0].u, `salto: recepción con contacto → absorción (${landRows.length} fotogramas)`, 'unit', landRows.map((r) => r.u));
    // secuencia (pausa en 6 instantes del clip, con la pose real del juego: se fuerza el tiempo del clip conducido)
    for (const [n, u] of [['seq1_prep', 0], ['seq2_impulso', 0.115], ['seq3_apice', 0.346], ['seq4_recogida', 0.538], ['seq5_contacto', 0.654], ['seq6_absorcion', 0.808]]) {
      await page.evaluate((u) => { const g = window.__bk, V = g.visual; g.setPaused(true); V.mixer.stopAllAction(); const a = V.actions.get('SK_HopBoard'); a.reset(); a.setEffectiveWeight(1); a.play(); a.time = u * a.getClip().duration; V.mixer.update(0); }, u);
      await shotAround(n, 90);
    }
    await page.evaluate(() => { const g = window.__bk, V = g.visual; for (const n of V.names) { const a = V.actions.get(n); a.enabled = true; a.play(); } g.setPaused(false); });
    R.fixture('secuencia: tiempo del clip SK_HopBoard forzado con el juego en pausa (solo capturas)', {});
    // ---------------------------------------------------------------- caída sin salto
    const plat = await page.evaluate(() => { let best = null; const g = window.__bk; g.world.forEachCollider((c) => { if (g.park.colliderName(c.handle) === 'tut_platform' && !best) { const t = c.translation(), he = c.shape.halfExtents; best = { x: t.x, y: t.y + (he?.y ?? 0), z: t.z, he: he ? [he.x, he.z] : null }; } }); return best; });
    if (!plat) R.invalid('no se encontró tut_platform para la caída');
    else {
      await place(page, R, [plat.x, plat.y + 0.05, plat.z], 0, 'walk', 'caida'); await sleep(700);
      let fallShot = false;
      const fall = await rec(async () => { await page.keyboard.down('KeyW');
        for (let i = 0; i < 200; i++) { const q = await page.evaluate(() => ({ st: window.__bk.skater.state, hop: window.__bk.skater.hopAir, air: window.__bk.skater.airTime })); if (!fallShot && q.st === 'walk_air' && q.air > 0.12) { await page.keyboard.up('KeyW'); await page.evaluate(() => window.__bk.setPaused(true)); fallShot = true; await shotAround('caida_lateral', 90); await page.evaluate(() => window.__bk.setPaused(false)); } if (fallShot && q.st !== 'walk_air') break; await sleep(15); }
        await page.keyboard.up('KeyW'); await sleep(500); });
      const fa = fall.filter((r) => r.st === 'walk_air');
      if (!fa.length) R.invalid('caída: no llegó a caer del borde', fall.slice(-3));
      else R.check(fa.every((r) => !r.hopAir) && fa.filter((r) => r.w > 0.5).every((r) => Math.abs(r.u - 0.4615) < 0.02), `caída sin salto: pose de caída (fase «fall»), no la secuencia del salto (${fa.length} fotogramas)`, 'unit', fa.map((r) => [r.u, r.hopAir, r.w]).slice(0, 12));
    }
    // ---------------------------------------------------------------- inclinación en el giro con pasos (D = derecha)
    await place(page, R, [-14, 0, -2], 0, 'walk', 'giro'); await sleep(600);
    const turn = await rec(async () => { await page.keyboard.down('KeyD'); await sleep(1500); await page.keyboard.up('KeyD'); });
    const hx = turn.slice(15).map((r) => r.headX), hxRest = rest.headX;
    const meanX = hx.reduce((a, x) => a + x, 0) / Math.max(1, hx.length);
    // marco local de ANMI (three): +X = izquierda de ANMI si mira a +Z; a la derecha ⇒ x negativa
    R.measure('giro_cabeza', { meanX: r3(meanX), rest: hxRest });
    R.check(meanX < hxRest - 0.01, `giro a la derecha: la cabeza se inclina hacia el centro del giro (x ${r3(meanX)} vs reposo ${hxRest})`, 'unit', { meanX, hxRest });
    await shotAround('giro_frente', 0);
    // ---------------------------------------------------------------- agachada quieta
    await place(page, R, [-14, 0, -2], 0, 'walk', 'agachada'); await page.keyboard.down('KeyC'); await sleep(1500); await shotAround('agachada_lateral', 90); await shotAround('agachada_frente', 0); await page.keyboard.up('KeyC');
    R.pendingHuman('Lectura visual del salto, la caída, la inclinación y la agachada (capturas y vídeo T5-21) — G8-V');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
