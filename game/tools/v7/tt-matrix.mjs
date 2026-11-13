// V7 T7-04/05 · MATRIZ física de TRA TRA TRA con el controlador real y teclado real. Cada caso parte de una colocación
// declarada (fixture) y se juega con teclas: no sustituye al recorrido integrado (tt-routes), lo complementa con bandas de
// tolerancia y negativos (06 · validación, puntos 1, 4, 5, 6 y matriz de patatas).
//  A escaleras a pie (subir/bajar E1, E2) y tabla escaleras abajo · B caída por H sin salto, sin reinicio, y vuelta andando a E1
//  C banda de despegue del salto de H y PT2 · D negativos de PT2/PT3/PT1 · E salto final A PIE (no llega; no se queda atascada)
//  F salto final EN TABLA: carrera × pulsación × carril, frenada y choque sin frenar · G capó → techo · H bordes de la recta
// Uso: node game/tools/v7/tt-matrix.mjs --url dev --task T7-04 [--only A,C]
import { Report, runTest, launch, openGame, clickStart, sleep, place, arg } from './lib.mjs';
import { Pilot, W, XZ, HD, loc, tt, L, go, mount, runJump, KIT, ROOF, angleDiff, HC, RC, LC } from './tt-lib.mjs';

const R = new Report('tt-matrix');
const only = arg('only') ? new Set(arg('only').split(',')) : null, on = (k) => !only || only.has(k);
const hole = KIT.rear.hole, HX = (hole[0] + hole[2]) / 2, side = KIT.limo.center[0] + KIT.limo.sections.body.w * KIT.limo.scale;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1000);
    const P = new Pilot(page, R);
    const fresh = () => page.evaluate(() => { const g = window.__bk; g.input.clear(); for (const p of g.pickups) if (p.id.startsWith('tratratra') && p.collected) { p.collected = false; g.scene.add(p.group); } g.state.p.collected = g.state.p.collected.filter((c) => !c.startsWith('tratratra')); });
    const stepTrace = async (fn) => { await page.evaluate(() => { const g = window.__bk; if (!g.__o) { g.__o = g.fixedUpdate.bind(g); g.fixedUpdate = (dt) => { g.__o(dt); if (window.__tr) { const s = g.skater; window.__tr.push([s.footPos.x, s.footPos.y, s.footPos.z, s.grounded ? 1 : 0, Math.hypot(s.vel.x, s.vel.z)]); } }; } window.__tr = []; });
      await fn(); const tr = await page.evaluate(() => { const t = window.__tr; window.__tr = null; return t; }); return tr.map(([x, y, z, g, v]) => ({ ...loc({ x, y, z }), g, v })); };
    const walk = async (ms, keys = ['KeyW']) => { await P.keys(keys); await sleep(ms); await P.release(); await sleep(150); };

    // ============================================================ A. escaleras
    if (on('A')) {
      await place(page, R, W(0, -5.6), HD(0, 1), 'walk', 'pie de E1');
      let tr = await stepTrace(() => walk(2600));
      const up = tr.filter((p) => p.y > -4.4 && p.y < -1.4), vUp = up.length ? (up.at(-1).y - up[0].y) / (up.length / 60) : 0;
      const dh = tr.slice(1).map((p, i) => p.h - tr[i].h);
      R.measure('E1_subida', { velocidad_media: +vUp.toFixed(2), salto_max_por_paso: +Math.max(...dh).toFixed(3), fin: tr.at(-1) });
      R.check(tr.at(-1).h > 1.2 && vUp > 2.2, 'E1: se sube andando sin frenazos (≥ 2,2 m/s de media; llano 3,0)', 'input', { vUp: +vUp.toFixed(2) });
      // R1 (usuario): el ritmo lo marca quien juega: ni tirones ni «te sube el juego» (con peldaños físicos medía 8,1 m/s)
      R.check(vUp < 3.4 && Math.max(...dh) < 0.06, 'E1: ritmo de andar (≤ 3,4 m/s en planta) y subida continua, sin saltos de peldaño', 'input', { vUp: +vUp.toFixed(2), saltoMax: +Math.max(...dh).toFixed(3) });
      await place(page, R, W(0, 0.2, 1.23), HD(0, -1), 'walk', 'camino, hacia E1');
      tr = await stepTrace(() => walk(2600));
      R.check(tr.at(-1).h < 0.1 && tr.at(-1).y < -4.4 && tr.every((p) => p.h > -0.05), 'E1: se baja andando hasta la plaza', 'input', tr.at(-1));
      await place(page, R, W(10, (KIT.P1.bounds[1] + KIT.P1.bounds[3]) / 2, 3.23), HD(0, 1), 'walk', 'P1');
      tr = await stepTrace(() => walk(1500));
      R.check(tr.at(-1).h > 4.4, 'E2: se sube andando de P1 a la trasera', 'input', tr.at(-1));
      { const e2 = tr.filter((p) => p.y > KIT.E2.bounds[1] && p.y < KIT.E2.bounds[3]), v = e2.length ? (e2.at(-1).y - e2[0].y) / (e2.length / 60) : 0, j = Math.max(...tr.slice(1).map((p, i) => p.h - tr[i].h));
        R.measure('E2_subida', { velocidad_media: +v.toFixed(2), salto_max_por_paso: +j.toFixed(3) });
        R.check(v > 2.0 && v < 3.4 && j < 0.06, 'E2: ritmo de andar y subida continua', 'input', { v: +v.toFixed(2), saltoMax: +j.toFixed(3) }); }
      // E3: el abanico a pie con el piloto, también continuo y a ritmo de andar
      { const e = KIT.E3; await place(page, R, W(e.center[0] + 1.0, e.center[1] + 1.6, 4.43), HD(-1, 0), 'walk', 'trasera, ante E3');
        const arc = [100, 118, 136, 154, 170].map((d) => [e.center[0] + 1.6 * Math.cos(d * Math.PI / 180), e.center[1] + 1.6 * Math.sin(d * Math.PI / 180)]);
        const t0 = Date.now(); let r3; const tr3 = await stepTrace(async () => { r3 = await go(P, [...arc, [e.center[0] - 1.6, e.center[1] - 0.4]]); });
        const len = tr3.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - tr3[i].x, p.y - tr3[i].y), 0), v3 = len / (tr3.length / 60), j3 = Math.max(...tr3.slice(1).map((p, i) => p.h - tr3[i].h));
        R.measure('E3_subida', { ms: Date.now() - t0, recorrido_m: +len.toFixed(2), velocidad_media: +v3.toFixed(2), salto_max_por_paso: +j3.toFixed(3), fin: r3.at });
        R.check(r3.ok && Math.abs(r3.at.h - 5.63) < 0.06 && v3 < 3.4 && j3 < 0.06, 'E3: se sube a ritmo de andar, continuo, hasta la recta', 'input', { v: +v3.toFixed(2), saltoMax: +j3.toFixed(3), at: r3.at }); }
      await place(page, R, W(10, KIT.E2.bounds[3] + 0.4, 4.43), HD(0, -1), 'walk', 'trasera, hacia E2');
      tr = await stepTrace(() => walk(1250));   // R1: con rampa se baja a ritmo de andar; 1,5 s llegaba al canto sur de P1
      R.check(Math.abs(tr.at(-1).h - 3.23) < 0.08, 'E2: se baja andando hasta P1', 'input', tr.at(-1));
      // en tabla escaleras abajo: rueda sin quedarse clavada ni caerse
      await place(page, R, W(0, 0.9, 1.23), HD(0, -1), 'ride', 'camino en tabla hacia E1');
      tr = await stepTrace(() => walk(2400)); let s = await tt(page);
      R.check(tr.at(-1).h < 0.15 && tr.at(-1).y < -4.4 && s.loco === 'ride', 'E1 en tabla hacia abajo: baja rodando y sigue en la tabla', 'input', { fin: tr.at(-1), loco: s.loco });
      // en tabla contra la escalera desde la plaza: no trepa (se sube a pie)
      await place(page, R, W(0, -8.5), HD(0, 1), 'ride', 'plaza en tabla hacia E1');
      tr = await stepTrace(() => walk(3000));
      R.measure('E1_tabla_subiendo', { hMax: +Math.max(...tr.map((p) => p.h)).toFixed(2), fin: tr.at(-1) });
      R.note('E1 en tabla hacia arriba: informativo (el recorrido se hace a pie)');
    }
    // ============================================================ B. caída por H sin salto y vuelta andando
    if (on('B')) {
      await fresh(); await place(page, R, W(10.6, HC, 4.43), HD(-1, 0), 'walk', 'trasera, hacia H');
      const r0 = (await tt(page)).respawns;
      const tr = await stepTrace(() => walk(1700));
      let s = await tt(page), at = loc(s);
      R.check(at.h < 0.1 && s.respawns === r0 && s.mode === 'explore', 'H sin salto: caída física hasta la plaza, sin reinicio ni recuperación', 'input', { at, respawns: s.respawns - r0 });
      R.check(!s.col.includes('tratratra.medium'), 'caer por H sin saltar NO regala PT2', 'input', s.col);
      R.check(s.col.includes('tratratra.hidden'), 'PT3 se recoge al caer por H (mismo eje, en el suelo)', 'input', s.col);
      R.measure('H_caida', { hMin: +Math.min(...tr.map((p) => p.h)).toFixed(2), pasos: tr.length });
      // vuelta a E1 por el suelo: bajo la recta hacia el oeste (entre sus pilares y el del abanico), rodeando el extremo oeste del camino inferior (bajo él no se cabe) y el cassette
      const yb = KIT.rear.bounds[1] + 0.2, back = await go(P, [[7.4, yb], [2.5, yb], [-1.2, yb], [-2.3, RC], [-3.9, -1.2], [-3.9, -5.4], [0, -5.6]], { tol: 0.6, maxMs: 45000 }); s = await tt(page);
      R.check(back.ok && s.respawns === r0, 'desde debajo de H se sale andando entre los pilares y se vuelve al pie de E1', 'input', { why: back.why, at: loc(s) });
    }
    // ============================================================ C. banda del salto de H
    if (on('C')) {
      const rows = [];
      for (const off of [0.45, 0.25, 0.15, 0.05, 0.0, -0.05, -0.1, -0.15, -0.2, -0.25, -0.3, -0.35, -0.4, -0.5]) {   // SALTO a `off` m del canto este (positivo = antes del canto)
        await fresh(); await place(page, R, W(10.9, HC, 4.43), HD(-1, 0), 'walk', `H off ${off}`);
        let jumped = false;
        const tr = await stepTrace(async () => { await P.keys(['KeyW']); const t0 = Date.now();
          while (Date.now() - t0 < 2600) { const p = await L(page); if (!jumped && p.x <= hole[2] + off) { await page.keyboard.press('Space'); jumped = true; } if (p.x < hole[0] - 0.75 || p.h < 3) break; await sleep(12); }
          await P.release(); await sleep(250); });
        const air = tr.findIndex((p, i) => i > 5 && !p.g), s = await tt(page), at = loc(s);
        rows.push({ pedido: off, despegue: air >= 0 ? +(tr[air].x - hole[2]).toFixed(2) : null, cruza: at.h > 4.3 && at.x < hole[0] + 0.3, pt2: s.col.includes('tratratra.medium'), fin: at });
      }
      R.measure('H_banda', rows);
      const ok = rows.filter((r) => r.cruza), band = ok.length ? [Math.min(...ok.map((r) => r.despegue)), Math.max(...ok.map((r) => r.despegue))] : null;
      R.measure('H_banda_despegue_m', band);
      // R1 (usuario): H pasa a 1,84 × 1,84 (doble de área). A pie solo se cruza saltando en el mismo canto: se mide y se exige que
      // exista (≥ 0,15 m, varios fotogramas); el umbral de 0,30 m de V7 era para el agujero de 1,10
      R.check(ok.length >= 3 && band[1] - band[0] >= 0.15, 'salto de H A PIE: existe banda de despegue (≥ 0,15 m), aunque estrecha con H de 1,84', 'input', { band, n: ok.length });
      // en tabla, con la carrerilla añadida al este de H (1 m más de trasera)
      const brow = [];
      for (const off of [1.0, 0.8, 0.6, 0.4, 0.2, 0.0, -0.2]) {
        await fresh(); await place(page, R, W(KIT.rear.bounds[2] - 0.5, HC, 4.43), HD(-1, 0), 'ride', `H en tabla off ${off}`);
        let jumped = false, v = 0; const t0 = Date.now(); await P.keys(['KeyW']);
        while (Date.now() - t0 < 4000) { const st = await tt(page), p = loc(st); if (!jumped && p.x <= hole[2] + off) { v = st.sp; await P.release(); await page.keyboard.press('Space'); jumped = true; } if (p.x < hole[0] - 1.0 || p.h < 3) break; await sleep(12); }
        await P.release(); await sleep(600); const st = await tt(page), at = loc(st);
        brow.push({ off, v: +v.toFixed(2), cruza: at.h > 4.3 && at.x < hole[0], pt2: st.col.includes('tratratra.medium'), fin: at, loco: st.loco });
      }
      R.measure('H_banda_tabla', brow);
      const bok = brow.filter((r) => r.cruza);
      R.check(bok.length >= 3 && bok.every((r) => r.pt2), 'salto de H EN TABLA con carrerilla desde el extremo este: banda amplia y PT2 en el aire', 'input', brow.map((r) => [r.off, r.v, r.cruza, r.pt2]));
      R.check(ok.every((r) => r.pt2), 'todo salto que cruza H recoge PT2', 'input', ok.map((r) => [r.despegue, r.pt2]));
    }
    // ============================================================ D. negativos de patatas
    if (on('D')) {
      const ys = (hole[3] + KIT.rails.lines.e2_este_y_trasera[4][1]) / 2;   // franja entre H y la barandilla norte
      await fresh(); await place(page, R, W(10.9, ys, 4.43), HD(-1, 0), 'walk', 'franja norte de H');
      await go(P, [[hole[0] - 0.6, ys]], { tol: 0.25, maxMs: 9000 }); let s = await tt(page);   // R1: con el piloto (W a ciegas sigue a la cámara y se desvía)
      R.check(loc(s).h > 4.3 && !s.col.includes('tratratra.medium'), 'andar por el borde de H (sin saltar) no recoge PT2', 'input', { at: loc(s), col: s.col });
      await fresh(); await place(page, R, W(HX, KIT.rear.bounds[3] + 1.2), HD(0, -1), 'walk', 'plaza, al norte de H');
      const r = await go(P, [[HX, HC]], { tol: 0.3 }); s = await tt(page);
      R.check(s.col.includes('tratratra.hidden') && !s.col.includes('tratratra.medium'), 'PT3 se recoge explorando la plaza (sin haber caído); PT2 no se recoge desde abajo', 'input', { at: r.at, col: s.col });
      await page.keyboard.press('Space'); await sleep(700); s = await tt(page);
      R.check(!s.col.includes('tratratra.medium'), 'saltando desde el suelo bajo H tampoco se alcanza PT2', 'input', s.col);
      const crit = await page.evaluate((pts) => { const g = window.__bk; return pts.map(([id, x, y, z]) => { const f = g.manifest.fries.find((q) => q.id === id); return Math.abs(x - f.pos.x) < f.trigger.x && Math.abs(z - f.pos.z) < f.trigger.z && y >= f.reach[0] && y <= f.reach[1]; }); },
        [['tratratra.visible', ...W(KIT.fries.visible.c[0], KIT.fries.visible.c[1], 0.03)], ['tratratra.hidden', ...W(HX, HC, 4.43)], ['tratratra.activity', ...W(KIT.limo.center[0], LC, 5.63)], ['tratratra.activity', ...W(KIT.limo.center[0], LC, 0.03)], ['tratratra.medium', ...W(HX, HC, 4.43)]]);
      R.check(crit.every((v) => !v), 'criterio de recogida: PT1 desde el suelo, PT3 desde la trasera, PT4 desde la recepción o la plaza y PT2 de pie sobre el eje → no', 'unit', crit);
    }
    // ============================================================ E. salto final a pie: no llega y no se queda atascada
    if (on('E')) {
      const rows = [];
      for (const off of [null, 0.6, 0.3, 0.1, 0.0, -0.1, -0.15, -0.2, -0.25]) {   // null = sin saltar; resto = SALTO a `off` m del labio (negativo = ya en el aire)
        await place(page, R, W(4.0, RC, 5.63), HD(-1, 0), 'walk', `recta a pie off ${off}`);
        let jumped = off === null;
        await P.keys(['KeyW']); const t0 = Date.now(); let maxH = 0, minX = 9;
        while (Date.now() - t0 < 4200) { const p = await L(page); maxH = Math.max(maxH, p.h); minX = Math.min(minX, p.x); if (!jumped && p.x <= off) { await page.keyboard.press('Space'); jumped = true; } if (p.h < 0.2 && p.g) break; await sleep(12); }
        await P.release(); await sleep(400);
        const s1 = await tt(page), a1 = loc(s1);
        // ¿control? gira y anda 1,2 s: debe desplazarse
        await P.face(HD(0, -1), 0.15, 2500); await walk(1200); const s2 = await tt(page), a2 = loc(s2);
        rows.push({ off, maxH: +maxH.toFixed(2), fin: a1, grounded: s1.grounded, seMueve: +Math.hypot(a2.x - a1.x, a2.y - a1.y).toFixed(2), recepcion: a1.h > 5.5 && a1.x < KIT.reception.bounds[2] + 0.2 });
      }
      R.measure('salto_final_a_pie', rows);
      R.check(rows.every((r) => !r.recepcion), 'a pie no se alcanza la recepción (con cualquier pulsación)', 'input', rows.map((r) => [r.off, r.fin.h]));
      R.check(rows.every((r) => r.fin.h < 0.2 && r.grounded && r.seMueve > 1.0), 'tras fallar a pie se cae a la plaza con control: ni colgada del canto ni bloqueada', 'input', rows.map((r) => [r.off, r.fin.h, r.seMueve]));
    }
    // ============================================================ F. salto final en tabla: carrera × pulsación × carril
    if (on('F')) {
      const rows = [];
      for (const x0 of [7.2, 6.0, 5.0, 4.0]) for (const ja of [1.0, 0.75, 0.45, 0.15]) {
        const lane = [RC, RC - 0.7, RC + 0.7][rows.length % 3];
        await place(page, R, W(x0, lane, 5.63), HD(-1, 0), 'ride', `carrera ${x0} salto ${ja} carril ${lane}`);
        const j = await runJump(P, page, { jumpAt: ja, lane });
        rows.push({ x0, jumpAt: ja, lane, vJump: j.vJump, apex: j.apex, land: j.landed ? [j.landed.x, j.landed.y, j.landed.sp] : null, stop: [j.end.x, j.end.h, j.end.sp], ok: !!j.landed && j.end.h > 5.5, margen: +(j.end.x - 0.3 - side).toFixed(2) });
      }
      R.measure('salto_final_tabla', rows);
      const ok = rows.filter((r) => r.ok);
      R.check(ok.length >= rows.length - 2, `salto final en tabla: ${ok.length}/${rows.length} combinaciones de carrera, pulsación y carril aterrizan y frenan en la recepción`, 'input', rows.filter((r) => !r.ok).map((r) => [r.x0, r.jumpAt, r.lane, r.stop]));
      R.check(ok.every((r) => r.margen > 0.1), 'frenada: en todos los aciertos queda margen ante la limo', 'input', { minimo: Math.min(...ok.map((r) => r.margen)) });
      // sin frenar: choca con el lateral de la limo a velocidad de carrera → golpe, no caída; sigue sobre la recepción
      await place(page, R, W(7.2, RC, 5.63), HD(-1, 0), 'ride', 'carrera sin frenar');
      const j = await runJump(P, page, { jumpAt: 0.75, brake: false, maxMs: 6000 }); await sleep(600); const s = await tt(page);
      R.measure('sin_frenar', { landed: j.landed, end: loc(s), loco: s.loco });
      R.check(loc(s).h > 5.5 && s.loco !== 'bail' && s.loco !== 'impact', 'sin frenar: toca la limo sin caída ni reinicio y queda sobre la recepción', 'input', { end: loc(s), loco: s.loco });
    }
    // ============================================================ G. del capó se vuelve al techo saltando (nadie queda atrapado)
    if (on('G')) {
      const hood = await page.evaluate(() => window.__bk.manifest.get('tt.hood').pos.toArray());
      const hl = loc({ x: hood[0], y: hood[1], z: hood[2] }); await place(page, R, W(hl.x, hl.y + 0.25, hl.h + 0.03), HD(0, 1), 'walk', 'capó, hacia el techo');   // R1: desplazamiento en el marco local (el mundo va girado)
      await sleep(300); const s0 = loc(await tt(page));
      await P.keys(['KeyW']); await sleep(120); await page.keyboard.press('Space'); await sleep(900); await P.release(); await sleep(200);
      const s1 = loc(await tt(page));
      R.check(s1.h > ROOF - 0.05, 'capó → techo: se sube saltando (0,55 m)', 'input', { de: s0, a: s1 });
    }
    // ============================================================ H. bordes abiertos: de la recta se cae a la plaza (física), sin reinicio
    if (on('H')) {
      await place(page, R, W(3.0, RC - 0.4, 5.63), HD(0, -1), 'walk', 'recta, hacia el canto sur');
      const r0 = (await tt(page)).respawns; await walk(1500); const s = await tt(page);
      R.check(loc(s).h < 1.4 && s.respawns === r0, 'recta sin barandilla (V01): por el canto se cae al camino/plaza sin reinicio', 'input', loc(s));
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
