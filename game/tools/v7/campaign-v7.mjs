// V7 T7-12 · Campaña completa V7: copia LITERAL de tools/v6/campaign-v6.mjs salvo la sección de TRATRATRA (recorrido nuevo:
// E1, camino, EV1, E2, salto de H, E3, salto final en tabla, EV2, dos charlas y patata del techo; informe en
// game/captures/v4/V7-campaign, que se copia a V7/evidencias). Cabecera original de V6:
// V6 T6-14 · Campaña completa con entrada real: copia LITERAL de tools/v4/campaign-v4.mjs salvo la sección de FASHION GIRL,
// que sigue las rutas V6 (piloto con teclado real, sin teletransportes): subir a la pista por la rampa trasera y bailar los
// tres stages leyendo las flechas con su tiempo, premio, cuña → patata suspendida, bajar a la U desde la pista, salir por el
// deck y bajar la escalera (ACCIÓN + S), y túnel (agachada en la boca, de pie dentro, agachada al salir). Informe en
// game/captures/v4/V6-campaign (lo copia a V6/evidencias quien lo ejecute).
// V4-VAL-02 · Campaña V4 NUEVA y LEGÍTIMA: perfil nuevo (sin guardado), build del dev V4, entrada de TECLADO/RATÓN real
// con piloto asistido declarado (tools/v4/pilot.mjs: solo lee estado y geometría y pulsa teclas). Sin teletransportes,
// setters ni guardados artificiales en la ruta. Orden elegido (libre en el juego): NMG → FG → TT → YY → NV → centro
// (antes de 20) → la 20.ª → revelación → final (fallo si surge, triple, preview, volver, ver otra vez, segundo intento)
// → recarga final. Recargas parciales útiles: NMG (tras la primera patata), mural (parcial → salir → recargar →
// terminar), TT (en la cima antes de hablar). Una pausa y un blur reales. Las incidencias se conservan tal cual en el
// informe (no se re-etiqueta un rojo pasando a fixture).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, directShot } from '../v4/lib.mjs';
import { Pilot, angleDiff } from '../v4/pilot.mjs';
import * as TT from './tt-lib.mjs';

const R = new Report('V7-campaign', 'campaign-v7');
const SAVE_KEY = 'bellakaventuras.remake.save';
await runTest(R, async () => {
  const browser = await launch();
  try {
    let page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(1000);
    const P = new Pilot(page, R);
    const incid = [];
    const ev = (msg, data) => { R.note({ t: new Date().toISOString().slice(11, 19), msg, ...(data ? { data } : {}) }); console.log('· ' + msg); };
    const st = () => page.evaluate(() => { const g = window.__bk; return { total: g.state.total, collected: g.state.p.collected.slice(), acts: { ...g.state.p.activities }, mode: g.mode, centerOpen: g.centerOpen, cars: g.cars.active, music: g.musicDebug ? { ...g.musicDebug } : null, finalProof: g.state.p.finalProof, partials: { ...g.state.p.partials }, bridgeReached: g.state.p.bridgeReached }; });
    const fries = await page.evaluate(() => Object.fromEntries(window.__bk.manifest.fries.map((f) => [f.id, { pos: f.pos.toArray(), access: f.access, kind: f.kind }])));
    const has = async (id) => (await st()).collected.includes(id);
    const reload = async (why) => {
      await P.release();
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
      await clickStart(page); await sleep(900); await P.buildNav({ cars: (await st()).cars });
      const s = await st(); ev(`recarga (${why})`, { total: s.total }); return s;
    };
    const hideHint = () => page.evaluate(() => { document.getElementById('hint').hidden = true; });
    await hideHint();
    await P.buildNav();
    const walkFry = async (id, opts = {}) => {
      if (await has(id)) return true;
      const f = fries[id];
      const r = await P.walkTo([f.pos[0], f.pos[2]], { tol: 0.35, until: async () => has(id), ...opts });
      const ok = await has(id); if (!ok) incid.push({ id, r: r.why }); ev(`${id}: ${ok ? 'recogida' : 'NO recogida'} andando`, { r: r.why }); return ok;
    };
    // ollie a una patata elevada: salida a ~6 m con cara vertical delante (rayos reales), carrera en tabla y SALTO
    const ollieFry = async (id) => {
      if (await has(id)) return true;
      const f = fries[id];
      const starts = await page.evaluate((fp) => {
        const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, W = g.world, P = new T.Vector3(...fp), out = [];
        const { free, S, H, N } = window.__nav;
        const isFree = (x, z) => { const i = Math.floor((x + H) / S), j = Math.floor((z + H) / S); return i >= 0 && j >= 0 && i < N && j < N && free[i * N + j]; };
        for (let k = 0; k < 36; k++) {
          const a = k / 36 * Math.PI * 2, d = new T.Vector3(Math.sin(a), 0, Math.cos(a)), S0 = P.clone().addScaledVector(d, 6); S0.y = 0;
          if (!isFree(S0.x, S0.z) || !isFree(S0.x + d.x * 2, S0.z + d.z * 2)) continue;
          // libre a ras de suelo hasta la cara, cara vertical delante (borde entre 0,2 y 2,6 m antes de la patata)
          const o = new T.Vector3(S0.x, 0.3, S0.z), dir = P.clone().setY(0.3).sub(o); const L = dir.length(); dir.normalize();
          const h = W.castRayAndGetNormal(new RA.Ray(o, dir), L, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
          if (!h || Math.abs(h.normal.y) > 0.5) continue; const hit = h.timeOfImpact; if (hit < L - 2.6 || hit > L - 0.2) continue;
          let clear = true; for (let q = 0.5; q < hit - 0.3; q += 0.4) if (!isFree(o.x + dir.x * q, o.z + dir.z * q)) { clear = false; break; }
          if (clear) out.push({ S: [S0.x, S0.z], heading: Math.atan2(dir.x, dir.z), edge: L - hit });
        }
        return out;
      }, f.pos);
      for (const s0 of starts.slice(0, 4)) {
        const back = [s0.S[0] - Math.sin(s0.heading) * 2.5, s0.S[1] - Math.cos(s0.heading) * 2.5];
        await P.walkTo(back, { tol: 0.4 });
        await P.face(s0.heading); await P.ensureRide(); await sleep(200);
        await P.keys(['KeyW']); let jumped = false; const t0 = Date.now();
        while (Date.now() - t0 < 6000) {
          const s = await P.state(); const d = Math.hypot(f.pos[0] - s.x, f.pos[2] - s.z);
          if (await has(id)) break;
          const e = angleDiff(s0.heading, s.h); await P.keys(['KeyW', ...(Math.abs(e) > 0.05 ? [e > 0 ? 'KeyA' : 'KeyD'] : [])]);
          if (!jumped && d < s0.edge + 1.35) { await page.keyboard.press('Space'); jumped = true; }
          await sleep(15);
        }
        await P.release(); await sleep(400);
        if (await has(id)) { ev(`${id}: recogida con ollie (salida a 6 m, borde a ${s0.edge.toFixed(2)} m)`); await P.ensureFoot(); return true; }
        await P.ensureFoot();
      }
      incid.push({ id, why: 'ollie sin éxito', starts: starts.length }); ev(`${id}: NO recogida con ollie (${starts.length} salidas)`); return false;
    };
    const crouchFry = async (id, from) => {
      if (await has(id)) return true;
      const f = fries[id];
      await P.walkTo(from, { tol: 0.4 });
      await P.face(Math.atan2(f.pos[0] - from[0], f.pos[2] - from[1]));
      await page.keyboard.down('KeyC'); await sleep(300); await P.keys(['KeyW']);
      const t0 = Date.now(); while (Date.now() - t0 < 6000 && !(await has(id))) await sleep(60);
      await P.release(); await page.keyboard.up('KeyC'); await sleep(200);
      const ok = await has(id); ev(`${id}: ${ok ? 'recogida' : 'NO recogida'} agachada`); if (!ok) incid.push({ id, why: 'agachado' }); return ok;
    };
    const cassette = async (zone, pos) => { await P.walkTo([pos[0] + 1.2, pos[2] + 1.2], { tol: 0.8 }); await sleep(1200); const s = await st(); ev(`cassette ${zone}`, { music: s.music }); };
    const cas = await page.evaluate(() => Object.fromEntries(window.__bk.manifest.cassettes.map((c) => [c.zone, c.pos.toArray()])));
    const zone = (k) => page.evaluate((k) => { const z = window.__bk.park.zones.get(k); return [z.pos.x, z.pos.y, z.pos.z]; }, k);
    const waitMode = async (m, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await st()).mode === m) return true; await sleep(100); } return false; };

    // ======================================================== 1. primera experiencia: andar, tabla, empujar/soltar/frenar/bajar
    const s0 = await P.state();
    R.check(s0.loco === 'walk' && (await st()).total === 0, 'arranque: perfil nuevo, a pie, 0/20', 'input', s0);
    await P.ensureRide(); await P.keys(['KeyW']); await sleep(1300); await P.keys([]); await sleep(700);
    const coast = await P.state(); await P.keys(['KeyS']); for (let k = 0; k < 40; k++) { if ((await P.state()).v < 0.3) break; await sleep(40); } await P.release(); const brk = await P.state();
    const offOk = await P.ensureFoot();
    R.check(coast.v > 1 && brk.v < coast.v && offOk, 'primera experiencia: montar (Q), empujar (W), rodar al soltar, frenar (S) y bajar (Q)', 'input', { coast: coast.v, brake: brk.v, offOk });

    // ======================================================== 2. NO ME GUILLO
    await walkFry('no_me_guillo.visible');
    const before = await st();
    await reload('NMG tras la primera patata');
    const after = await st();
    R.check(after.total === before.total && after.collected.includes('no_me_guillo.visible'), 'recarga parcial en NMG: el progreso se conserva', 'input', { before: before.total, after: after.total });
    await hideHint();
    const pz = await zone('act.pantherTalk'); await P.walkTo([pz[0], pz[2]], { tol: 0.8 });
    // R7 (usuario, 12 oct): la frase de La Pantera ya no se cierra sola: se lee y se pulsa «Vale» (contrato cambiado por decisión)
    const talked = await P.act(/HABLAR/); await sleep(2000); await page.click('#dialog-ok').catch(() => {}); await sleep(1500);
    R.check(talked && (await st()).acts.pantherTalk, 'NMG: charla con La Pantera (E) completa la actividad', 'input', { talked });
    await walkFry('no_me_guillo.activity');
    await walkFry('no_me_guillo.hidden');
    await ollieFry('no_me_guillo.medium');
    await cassette('no_me_guillo', cas.no_me_guillo);
    // pausa real y continuar
    await page.keyboard.press('Escape'); await sleep(500); const pa = await st(); await page.keyboard.press('Escape'); await sleep(300);
    ev('pausa real y continuar', { mode: pa.mode });

    // ======================================================== 3. FASHION GIRL (V6)
    const fgTh = 108 * Math.PI / 180, FO = [30.5 * Math.sin(fgTh), -30.5 * Math.cos(fgTh)], FW = [Math.sin(fgTh), -Math.cos(fgTh)], FS = [-Math.cos(fgTh), -Math.sin(fgTh)];
    const FV = (w, s) => [FO[0] + FW[0] * w + FS[0] * s, FO[1] + FW[1] * w + FS[1] * s];
    const FH = (dw, ds) => Math.atan2(FW[0] * dw + FS[0] * ds, FW[1] * dw + FS[1] * ds);
    const holdUntil = async (keys, ms, cond) => { await P.keys(keys); const t0 = Date.now(); let ok = false; while (Date.now() - t0 < ms) { if (await cond()) { ok = true; break; } await sleep(40); } await P.release(); return ok; };
    const onStage = async () => { const s = await P.state(); return s.y > 0.9 && /BAILAR/.test(s.prompt); };
    // pista por la rampa trasera y baile de tres stages (10/5/3 s; 3/4/5 flechas) leyendo la pantalla
    await P.walkTo(FV(0, 12.6), { tol: 0.4 }); await P.face(FH(0, -1));
    const fgUp = await holdUntil(['KeyW'], 4000, onStage);
    const danced = fgUp && await P.act(/BAILAR/);
    if (danced) {
      for (let r = 0; r < 3; r++) {
        await page.waitForFunction((r) => document.getElementById('dance-round')?.textContent === String(r + 1) && !document.getElementById('dance-timer').classList.contains('frozen') && document.querySelectorAll('#dance-seq span').length === [3, 4, 5][r], { timeout: 20000 }, r).catch(() => {});
        const seq = await page.evaluate(() => [...document.querySelectorAll('#dance-seq span')].map((s) => s.getAttribute('aria-label')));
        for (const k of seq) { await page.keyboard.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[k]); await sleep(200); }
        await sleep(500);
      }
      await page.waitForFunction(() => window.__bk.state.p.activities.danceCombo, { timeout: 25000 }).catch(() => {});
      await waitMode('explore', 25000);
    }
    R.check((await st()).acts.danceCombo, 'FG V6: tres stages con tiempo (10/5/3 s; 3/4/5 flechas) leyendo la pantalla (teclado)', 'input', { up: fgUp, danced });
    // de la pista a la U andando (zona de entrada + transición a 45°) hasta la patata del centro; se sale andando por la zona
    // de entrada; R2: al deck (1,8 m) se sube por la escalera (ACCIÓN + W) y se baja por ella (ACCIÓN + S)
    await P.face(FH(0, -1));
    await holdUntil(['KeyW'], 7000, () => has('fashion_girl.visible'));
    ev(`fashion_girl.visible: ${await has('fashion_girl.visible') ? 'recogida' : 'NO recogida'} bajando a la U desde la pista`);
    await P.face(FH(0, 1));
    await holdUntil(['KeyW'], 6000, async () => { const q = await P.state(); const dx = q.x - FO[0], dz = q.z - FO[1]; return q.y > 0.9 && dx * FS[0] + dz * FS[1] > 1.2; });   // sube a la zona de entrada
    for (const wp of [FV(3.7, 1.6), FV(3.7, -11.5), FV(0, -10.95)]) await P.walkTo(wp, { tol: 0.3 });   // baja por su costado y rodea el muro de la U
    await P.face(FH(0, 1)); await sleep(300);
    const fgClimb = await P.act(/TREPAR/);
    const ladderBusy = () => page.evaluate(() => window.__bk.activities.find((a) => a.id === 'ladderClimb').busy);
    if (fgClimb) { await sleep(800); await holdUntil(['KeyW'], 12000, async () => !(await ladderBusy())); }
    const deckTop = await P.state();
    await sleep(500);
    const fgOffered = /BAJAR/.test((await P.state()).prompt); const fgDown = fgOffered && await P.act(/BAJAR/);
    if (fgDown) { await sleep(1000); await holdUntil(['KeyS'], 9000, async () => !(await ladderBusy())); }
    const fgBottom = await P.state();
    R.check(fgClimb && deckTop.y > 1.7 && fgDown && fgBottom.y < 0.1 && fgBottom.loco === 'walk', 'FG V6: de la U a la zona de entrada andando; al deck por la escalera (ACCIÓN + W) y abajo (ACCIÓN + S)', 'input', { fgClimb, deckY: deckTop.y, fgOffered, fgDown, y: fgBottom.y });
    // túnel: boca agachada, interior de pie, patata al fondo, salida agachada
    // guiado continuo hacia un punto (como corrige una persona con el joystick): W + A/D según el error de rumbo
    const steerTo = async (tgt, extra, ms, cond = async () => false) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { const s = await P.state(); if (await cond(s)) break; const e = angleDiff(Math.atan2(tgt[0] - s.x, tgt[1] - s.z), s.h);
        await P.keys(['KeyW', ...extra, ...(Math.abs(e) > 0.06 ? [e > 0 ? 'KeyA' : 'KeyD'] : [])]); await sleep(60); }
      await P.release();
    };
    await P.walkTo(FV(3.4, -11.4), { tol: 0.35 }); await P.walkTo(FV(6.0, -9.0), { tol: 0.3 });   // rodea el soporte de tablas
    await steerTo(FV(2.6, -9.0), [], 1800);                                   // de pie hasta que el techo de la boca la para
    await page.keyboard.down('KeyC'); await steerTo(FV(1.6, -9.0), [], 3200); await page.keyboard.up('KeyC');   // agachada cruza
    await steerTo(FV(-1.9, -9.0), [], 4000, () => has('fashion_girl.hidden'));   // de pie dentro hasta el fondo
    await steerTo(FV(2.6, -9.0), [], 3500);                                   // vuelta de pie hasta la rampa (techo)
    await page.keyboard.down('KeyC'); await steerTo(FV(4.6, -9.0), [], 3500); await page.keyboard.up('KeyC');
    await steerTo(FV(6.2, -9.0), [], 1200);
    const fgOut = await P.state();
    R.check(await has('fashion_girl.hidden') && fgOut.y > -0.1, 'FG V6: túnel (agachada en la boca, de pie dentro) con la patata del fondo y salida', 'input', { y: fgOut.y });
    // cuña: subir andando hasta el labio bajo la patata suspendida
    await walkFry('fashion_girl.activity');
    await P.walkTo(FV(-4.4, 13.8), { tol: 0.35 }); await P.face(FH(1, 0));   // R2: a la altura de la patata
    await holdUntil(['KeyW'], 3000, () => has('fashion_girl.medium'));
    ev(`fashion_girl.medium: ${await has('fashion_girl.medium') ? 'recogida' : 'NO recogida'} subiendo la cuña`);
    await P.face(FH(-1, 0)); await holdUntil(['KeyW'], 1800, async () => (await P.state()).y < 0.06);   // bajar de la cuña por su rampa
    await P.ensureFoot();
    await cassette('fashion_girl', cas.fashion_girl);

    // ======================================================== 4. TRATRATRA (V7: vuelta ascendente, dos charlas sobre la limo)
    // Sustituye a la sección TT de campaign-v6 (escalera de cinco descansos y charla conjunta, retiradas): mismo método —
    // piloto con teclado real, sin teletransportes ni setters— sobre el recorrido nuevo. Pasos comunes en tt-lib.mjs.
    { const tts = () => TT.tt(page), cx = TT.KIT.limo.center[0], ev2 = TT.KIT.ladders.EV2, hole = TT.KIT.rear.hole;
      // R1: cotas derivadas del contrato (marco girado 180°, trasera ensanchada, H desplazado, E3 al oeste)
      const HX = (hole[0] + hole[2]) / 2, HC = TT.HC, RC = TT.RC, LC = TT.LC, yb = TT.KIT.rear.bounds[1] + 0.2, e = TT.KIT.E3, p1y = (TT.KIT.P1.bounds[1] + TT.KIT.P1.bounds[3]) / 2;
      await P.walkTo(TT.XZ(-3.9, -6.3), { tol: 0.6 });
      await cassette('tratratra', cas.tratratra);
      // PT3 explorando la plaza (sin caer): bajo la recta, entre sus pilares y el del abanico, hasta debajo del agujero
      let r = await TT.go(P, [[-3.9, -5.4], [-3.9, -1.2], [-2.3, RC], [-1.2, yb], [2.5, yb], [7.0, yb], [HX, HC]], { tol: 0.5, maxMs: 50000, until: async () => has('tratratra.hidden') });
      R.check(await has('tratratra.hidden'), 'TT: PT3 recogida explorando la plaza bajo el agujero (sin haber caído)', 'input', { at: r.at });
      r = await TT.go(P, [[7.0, yb], [2.5, yb], [-1.2, yb], [-2.3, RC], [-3.9, -1.2], [-3.9, -5.4], [0.2, -5.7]], { tol: 0.5, maxMs: 50000 });
      // E1 → camino inferior → PT1 → EV1 → P1 → E2
      r = await TT.go(P, [[0, -4.9], [0, -2.9], [0, -0.6], [4.5, 0], [8.8, -0.2], [TT.KIT.fries.visible.c[0], TT.KIT.fries.visible.c[1] + 0.2]], { tol: 0.3, maxMs: 40000 });
      R.check(await has('tratratra.visible') && Math.abs(r.at.h - 1.23) < 0.08, 'TT: sube E1 andando, recorre el camino inferior (+1,20) y recoge PT1 delante de EV1', 'input', r.at);
      await TT.go(P, [[TT.KIT.ladders.EV1.at, TT.KIT.ladders.EV1.face - 0.52]], { tol: 0.2 });
      const c1 = await TT.climb(P, page, { expectId: 'tt.EV1' });
      R.check(c1.ok && Math.abs(c1.s.y - 3.23) < 0.08 && c1.minY > 1.15, 'TT: trepa EV1 desde el camino (+1,20) hasta P1 (+3,20)', 'input', { minY: c1.minY, y: c1.s?.y, why: c1.why });
      r = await TT.go(P, [[10.0, p1y], [10.0, TT.KIT.E2.bounds[3] + 0.4], [10.6, HC]], { tol: 0.2 });
      // salto del agujero con PT2
      await P.face(TT.HD(-1, 0)); await sleep(150); let jumped = false;
      await TT.go(P, [[hole[0] - 0.75, HC]], { tol: 0.3, maxMs: 6000, until: async (q) => { const p = TT.loc(q); if (!jumped && p.x <= hole[2] - 0.1) { await page.keyboard.press('Space'); jumped = true; } return false; } });
      await sleep(300); let s = await tts();
      R.check(TT.loc(s).h > 4.3 && s.col.includes('tratratra.medium'), 'TT: salta el agujero H (PT2 en el aire) y aterriza en el descanso', 'input', { at: TT.loc(s), col: s.col });
      // E3 y salto final en tabla
      const arc = [100, 118, 136, 154, 170].map((d) => [e.center[0] + 1.55 * Math.cos(d * Math.PI / 180), e.center[1] + 1.55 * Math.sin(d * Math.PI / 180)]);
      r = await TT.go(P, [[e.center[0] + 1.0, e.center[1] + 1.6], ...arc, [e.center[0] - 1.6, e.center[1] - 0.4], [7.0, RC]], { tol: 0.3, maxMs: 40000 });
      R.check(Math.abs(r.at.h - 5.63) < 0.08, 'TT: sube el abanico E3 y llega a la recta (+5,60)', 'input', r.at);
      await P.face(TT.HD(-1, 0)); await sleep(150); await TT.mount(P, page);
      const j = await TT.runJump(P, page, { jumpAt: 0.75 });
      const side = cx + TT.KIT.limo.sections.body.w * TT.KIT.limo.scale;
      R.check(j.landed && j.end.h > 5.5 && j.end.x > side + 0.3, 'TT: carrera en tabla, R1 + ollie, recepción y frenada antes de la limo', 'input', { vJump: j.vJump, landed: j.landed, end: j.end });
      await P.ensureFoot(); await sleep(2200);
      await reload('TT sobre la recepción, antes de subir a la limo'); await hideHint();
      s = await tts();
      R.check(s.y > 5.5, 'TT: tras recargar sobre la recepción se reaparece arriba (punto apoyado), con las tres patatas', 'input', { y: s.y, col: s.col });
      // EV2 al techo, dos charlas (Aissa → Juseph) y PT4
      await TT.go(P, [[ev2.face + 1.25, ev2.at], [ev2.face + ev2.standoff + 0.5, ev2.at]], { tol: 0.2 }); await P.face(TT.HD(-1, 0));
      const c2 = await TT.climb(P, page, { expectId: 'tt.EV2' });
      R.check(c2.ok && c2.s.y > TT.ROOF - 0.05, 'TT: trepa EV2 desde la recepción al techo de la limo', 'input', { y: c2.s?.y, why: c2.why });
      await TT.go(P, [[cx, LC - 0.8], TT.TALK_SPOT.aissa], { tol: 0.3 }); const ta = await TT.talk(P, page); s = await tts();
      R.check(ta.ok && s.heard.aissa && !s.act && !s.pt4.available, 'TT: frase de Aissa terminada; sin premio todavía', 'input', { text: ta.text, heard: s.heard });
      await TT.go(P, [[cx, LC + 1.3], TT.TALK_SPOT.juseph], { tol: 0.3 }); const tj = await TT.talk(P, page); s = await tts();
      const before = s.total;
      R.check(tj.ok && s.heard.juseph && s.act && s.pt4.available && s.pt4count === 1 && !s.col.includes('tratratra.activity'), 'TT: frase de Juseph terminada → actividad completa y UNA patata en el centro del techo (contador sin subir)', 'input', { text: tj.text, pt4: s.pt4 });
      await TT.go(P, [[cx, LC]], { tol: 0.2, until: async () => has('tratratra.activity') }); await sleep(300); s = await tts();
      R.check(s.col.includes('tratratra.activity') && s.total === before + 1 && s.col.length === 4, 'TT: patata del techo recogida andando; 4/4 en TRATRATRA', 'input', { col: s.col, total: s.total });
      // retorno: bajar por EV2 a la recepción y dejarse caer a la plaza por su canto (caída física, sin reinicio)
      await TT.go(P, [[ev2.face - 0.57, ev2.at]], { tol: 0.2 }); const d2 = await TT.descend(P, page);
      const r0 = s.respawns; await P.face(TT.HD(0, -1)); await P.keys(['KeyW']); await sleep(1900); await P.release(); await sleep(800);
      const dn = await tts(); ev('TT: bajada por EV2 y caída a la plaza', { y: dn.y, loco: dn.loco });
      R.check(d2.ok && dn.y < 0.2 && dn.respawns === r0 && dn.mode === 'explore', 'TT: baja por EV2 y vuelve a la plaza por sus medios (sin reinicio)', 'input', { y: dn.y, respawns: dn.respawns - r0 });
      await P.buildNav({ cars: (await st()).cars });
    }

    // ======================================================== 5. YINYANG (mural parcial → salir → recargar → terminar)
    await walkFry('yinyang.visible'); await cassette('yinyang', cas.yinyang);
    await walkFry('yinyang.medium'); await walkFry('yinyang.hidden');
    const paint = async (rows, cover) => {
      const b = await page.evaluate(() => { const r = document.getElementById('graffiti-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const n = Math.round(rows * cover);
      for (let i = 0; i < n; i++) { const y = b.y + b.h * (0.04 + 0.92 * i / (rows - 1)); await page.mouse.move(b.x + b.w * 0.03, y); await page.mouse.down(); for (let k = 1; k <= 16; k++) await page.mouse.move(b.x + b.w * (0.03 + 0.94 * k / 16), y); await page.mouse.up(); if (await page.evaluate(() => document.getElementById('graffiti').hidden)) break; }
    };
    const gz = await zone('act.graffiti'); await P.walkTo([gz[0], gz[2]], { tol: 0.8 });
    await P.act(/PINTAR/); await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 8000 }).catch(() => {});
    await paint(18, 0.4); const p1 = await page.evaluate(() => document.getElementById('graffiti-pct')?.textContent);
    await page.click('#graffiti-exit'); await sleep(400);
    await reload('mural parcial'); await hideHint();
    await P.walkTo([gz[0], gz[2]], { tol: 0.8 });
    const cont = await P.act(/SEGUIR PINTANDO/);
    await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 8000 }).catch(() => {});
    const p2 = await page.evaluate(() => document.getElementById('graffiti-pct')?.textContent);
    await paint(18, 1);
    await page.waitForFunction(() => window.__bk.state.p.activities.graffiti, { timeout: 10000 }).catch(() => {}); await waitMode('explore', 10000);
    R.check(cont && p1 === p2 && (await st()).acts.graffiti, 'YY: mural parcial → salir → recargar → «SEGUIR PINTANDO» con la misma cobertura → terminar', 'input', { p1, p2, cont });
    await walkFry('yinyang.activity');

    // ======================================================== 6. NOSVAMOSDEAQUI (circuito en tabla) — la 20.ª se deja para después del centro
    await walkFry('nosvamosdeaqui.visible'); await cassette('nosvamosdeaqui', cas.nosvamosdeaqui);
    const tz = await zone('act.skateTutorial'); await P.walkTo([tz[0], tz[2]], { tol: 0.8 });
    const tutStart = await P.act(/CIRCUITO/);
    const gates = await page.evaluate(() => window.__bk.park.tutorialGates.map((o) => ({ c: [o.c.x, o.c.z], d: [Math.sin(o.yaw), Math.cos(o.yaw)] })));
    // dirección de paso de cada puerta: la que lleva hacia la siguiente
    const nxt = [gates[1].c, [gates[2].c[0] - 3 * Math.abs(gates[2].d[0]), gates[2].c[1] - 3 * Math.abs(gates[2].d[1])], gates[3].c, null];
    gates.forEach((g, i) => { if (i === 0) { const tow = [g.c[0] - tz[0], g.c[1] - tz[2]]; if (g.d[0] * tow[0] + g.d[1] * tow[1] < 0) g.d = [-g.d[0], -g.d[1]]; } else if (i < 3) { const tow = i === 1 ? [nxt[1][0] - g.c[0], nxt[1][1] - g.c[1]] : [gates[3].c[0] - g.c[0], gates[3].c[1] - g.c[1]]; if (g.d[0] * tow[0] + g.d[1] * tow[1] < 0) g.d = [-g.d[0], -g.d[1]]; } else g.d = gates[2].d; });
    const step = () => page.evaluate(() => window.__bk.activities.find((a) => a.id === 'skateTutorial').step);
    await P.ensureRide();
    for (let i = 0; i < 4; i++) {
      for (let tryN = 1; tryN <= 3 && (await step()) <= i; tryN++) {
        // la barra del paso 3 está 1,45 m ANTES del centro de su puerta: carrerilla desde 5,5 m y SALTO ~1,3 m antes de la barra
        const back = i === 2 ? 5.5 : 3;
        const g = gates[i], pre = [g.c[0] - g.d[0] * back, g.c[1] - g.d[1] * back];
        // si ya está sobre el eje de la puerta y antes de ella (p. ej. el túnel justo después de la barra), sigue recto
        const s1 = await P.state(); const al1 = (s1.x - g.c[0]) * g.d[0] + (s1.z - g.c[1]) * g.d[1], la1 = -(s1.x - g.c[0]) * g.d[1] + (s1.z - g.c[1]) * g.d[0];
        let fr = { why: 'en el eje' };
        if (!(al1 > -6.5 && al1 < -0.8 && Math.abs(la1) < 0.9)) { const pl = await P.plan(pre); if (pl.ok) fr = await P.follow([...pl.path, pre], { ride: true, speed: 3.0, tol: 0.8 }); else fr = { ok: false, why: 'plan: ' + pl.why }; }
        const sPre = await P.state();
        await P.face(Math.atan2(g.d[0], g.d[1]), 0.08, 2500);
        if (i === 3) await page.keyboard.down('KeyC');
        await P.keys(['KeyW']); let jumped = false; const t0 = Date.now(); const tr = [];
        while (Date.now() - t0 < 5000) {
          const s = await P.state(); const along = (s.x - g.c[0]) * g.d[0] + (s.z - g.c[1]) * g.d[1];
          const lat = -(s.x - g.c[0]) * g.d[1] + (s.z - g.c[1]) * g.d[0]; tr.push([+along.toFixed(2), +lat.toFixed(2), +s.v.toFixed(2), +s.y.toFixed(2), s.st]);
          const e = angleDiff(Math.atan2(g.d[0], g.d[1]), s.h);
          await P.keys([...(s.v < 3.2 ? ['KeyW'] : []), ...(Math.abs(e) > 0.05 ? [e > 0 ? 'KeyA' : 'KeyD'] : [])]);
          if (i === 2 && !jumped && along > -2.75) { await page.keyboard.press('Space'); jumped = true; }
          if ((await step()) > i) break; if (along > 2.2) break;
          await sleep(15);
        }
        await P.release(); if (i === 3) { await sleep(500); await page.keyboard.up('KeyC'); }
        ev(`NV circuito paso ${i + 1} (intento ${tryN}): ${(await step()) > i ? 'ok' : 'NO'}`, { follow: fr && fr.why, pre: [+sPre.x.toFixed(2), +sPre.z.toFixed(2), +sPre.h.toFixed(2)], loco: sPre.loco, traza: tr.filter((_, q) => q % 4 === 0).slice(0, 30) });
      }
    }
    // paso 5: parar en el círculo y girar la cámara
    const pad = await page.evaluate(() => { const z = window.__bk.park.zones.get('tut.campad'); return [z.pos.x, z.pos.z]; });
    // como un jugador: bajar de la tabla, entrar andando al círculo, quedarse quieta y girar la cámara
    await P.ensureFoot(); await P.walkTo(pad, { tol: 0.35 }); await P.release(); await sleep(300);
    await P.keys(['KeyL']); const tCam = Date.now(); while (Date.now() - tCam < 6000 && !(await st()).acts.skateTutorial) await sleep(100); await P.release();
    const tutDone = (await st()).acts.skateTutorial;
    R.check(tutStart && tutDone && (await has('nosvamosdeaqui.hidden')), 'NV: circuito de 5 pasos en tabla (puerta, conos, barra con SALTO, túnel agachada con su patata, círculo + cámara)', 'input', { tutStart, tutDone, step: await step() });
    await P.ensureFoot();
    await walkFry('nosvamosdeaqui.activity');

    // ======================================================== 7. centro ANTES de 20: libre, cassette, sin coches
    const pre20 = await st();
    await cassette('secrenovio', cas.secrenovio);
    const c0 = await st(); const cp = await P.state();
    R.check(pre20.total === 19 && !c0.cars && !c0.centerOpen && Math.hypot(cp.x, cp.z) < 3, 'centro con 19/20: se llega andando hasta el radiocasete central, sin coches ni desafío', 'input', { total: pre20.total, cars: c0.cars, r: Math.hypot(cp.x, cp.z) });

    // ======================================================== 8. la 20.ª y revelación
    await ollieFry('nosvamosdeaqui.medium');
    const at20 = await st();
    R.check(at20.total === 20, '20/20 recogidas por la ruta', 'input', { total: at20.total, falta: Object.keys(fries).filter((k) => !at20.collected.includes(k)), incid });
    await waitMode('reveal', 6000); await waitMode('explore', 15000);
    const rv = await st();
    R.check(rv.centerOpen && rv.cars, 'a 20: revelación de la superrampa y aparición de los coches', 'input', { centerOpen: rv.centerOpen, cars: rv.cars });

    // ======================================================== 9. final: blur real, aproximación, intento(s), preview, volver, ver otra vez, segundo intento
    await P.buildNav({ cars: true });
    const appr = await page.evaluate(() => { const a = window.__bk.manifest.get('final.approach'); return [a.pos.x, a.pos.z, a.heading]; });
    const back = [appr[0] - 2.5, appr[1]];
    await P.walkTo(back, { tol: 0.5 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(500);
    const bl = await st(); await page.keyboard.press('Escape'); await sleep(300);
    ev('blur real durante la campaña', { mode: bl.mode });
    const carAng = () => page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
    const ahead = (a, t) => ((a - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const attempt = async (n) => {
      await P.walkTo(back, { tol: 0.5 }); await P.face(appr[2]); await P.ensureRide(); await P.face(appr[2], 0.04);
      for (let i = 0; i < 500; i++) { const a = await carAng(); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) break; await sleep(40); }
      const logN = await page.evaluate(() => (window.__bkFinalLog ?? []).length);
      // carrera por el corredor siguiendo su eje (z = 0) hacia las flechas, como un jugador: rumbo hacia un punto 8 m por
      // delante sobre el eje; SALTO dentro de la ventana del labio; W hasta que arma
      let sp = false; const t0 = Date.now(); const trace = [];
      while (Date.now() - t0 < 9000) {
        const s = await page.evaluate(() => { const g = window.__bk, sk = g.skater; return { x: sk.footPos.x, z: sk.footPos.z, h: sk.heading, g: sk.grounded, phase: g.activities[5].phase, n: (window.__bkFinalLog ?? []).length }; });
        if (s.n > logN) break;
        if (s.g && s.phase !== 'flight') {
          const e = angleDiff(Math.atan2(8, -s.z), s.h);
          await P.keys([...(s.phase === 'armed' ? [] : ['KeyW']), ...(Math.abs(e) > 0.02 ? [e > 0 ? 'KeyA' : 'KeyD'] : [])]);
        } else await P.release();
        if (!sp && s.x > -7.8 - 2.6 + 0.5) { await page.keyboard.press('Space'); sp = true; }
        if (trace.length < 400) trace.push([+s.x.toFixed(2), +s.z.toFixed(2), s.phase]);
        await sleep(10);
      }
      R.note({ final_carrera: trace.filter((_, i) => i % 8 === 0) });
      await P.release();
      const log = await page.evaluate(() => (window.__bkFinalLog ?? []).slice(-1)[0] ?? null);
      ev(`final intento ${n}`, log && { armed: log.armed, tripleOk: log.tripleOk, onTable: log.onTable, landX: log.landX, landY: log.landY, launchX: log.launchX });
      return log;
    };
    let ok1 = null; for (let n = 1; n <= 3 && !ok1?.tripleOk; n++) { ok1 = await attempt(n); if (!ok1?.tripleOk) { await waitMode('explore', 8000); await sleep(2500); } }
    const inPv = await waitMode('preview', 6000);
    await sleep(2000);
    const pv = await page.evaluate(() => ({ state: window.__bk.audio.music.previewState, proof: window.__bk.state.p.finalProof }));
    await directShot(page, R, 'final_preview', [9, 1.6, -9], [0, 1, 0], 60).catch(() => {});
    R.check(!!ok1?.tripleOk && inPv && pv.proof?.kind === 'triple_v3', 'final: triple real con SALTO en la ventana → prueba guardada y preview', 'input', { log: ok1 && { armed: ok1.armed, tripleOk: ok1.tripleOk }, pv });
    await page.keyboard.press('Escape'); await waitMode('explore', 5000);
    await page.keyboard.press('Escape'); await sleep(400);
    const again = await page.evaluate(() => !document.getElementById('btn-preview-again').hidden);
    if (again) { await page.click('#btn-preview-again'); await waitMode('preview', 4000); await sleep(1500); await page.keyboard.press('Escape'); await waitMode('explore', 5000); }
    else await page.keyboard.press('Escape');
    R.check(again, 'volver al parque y «ver otra vez» desde la pausa', 'input', { again });
    await sleep(2500);
    const ok2 = await attempt('segundo');
    R.check(!!ok2, 'segundo intento posible tras el logro (resultado registrado)', 'input', ok2 && { tripleOk: ok2.tripleOk, armed: ok2.armed });
    await waitMode('explore', 30000);

    // ======================================================== 10. recarga final
    const fin = await reload('final de campaña');
    R.check(fin.total === 20 && fin.finalProof?.kind === 'triple_v3' && fin.acts.pantherTalk && fin.acts.skateTutorial && fin.acts.graffiti && fin.acts.bridgeTalk && fin.acts.danceCombo, 'recarga final: 20/20, cinco actividades y logro del triple conservados', 'input', { total: fin.total, proof: fin.finalProof, acts: fin.acts });
    const save = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    fs.writeFileSync(path.join(R.dir, 'save_final.json'), save ?? 'null');
    R.note({ incidencias: incid, pilot_log: P.log.slice(-40) });
    R.pendingHuman('Campaña con jugador humano y dispositivos físicos (táctil/mando)');
  } finally { await browser.close(); }
}, { timeoutMs: 2400000 });
