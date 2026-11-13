// V8 YY8-12 · Campaña completa V8: copia LITERAL de tools/v7/campaign-v7.mjs (intacto) salvo la sección de YINYANG, que recorre la
// piscina real (R1–R10 del usuario): deck y cassette, patata encima del banco izquierdo (ollie), rana (cuatro frases exactas) →
// pintura parcial → salir → recargar → SEGUIR PINTANDO sin repetir frases → terminar → baile y «Kroak!( Gracias!)» → patata de la
// actividad, y el vaso a pie: E1 abajo (patata al pie) → R2 a N2 → paso bajo el rótulo → patata del lóbulo derecho → vuelta por R2 y
// E1 al deck. Sin debugComplete ni teletransportes en la ruta. Cabecera V7:
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
import { nvW, nvState, nvPilot, nvTalkAndStart } from '../v10/nv-lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
import * as YYL from './yy-lib.mjs';
import { maskStrokes, mouseStrokes } from './yy-paint.mjs';

const R = new Report('V8-campaign', 'campaign-v8');
const SAVE_KEY = 'bellakaventuras.remake.save';
await runTest(R, async () => {
  const browser = await launch();
  try {
    let page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(1000);
    // V10.4 (W-D23, W-D24, W-D35; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_4-R6): partida nueva = tutorial en la plaza
    // blanca. La campaña lo SALTA (el tutorial completo lo prueba v10_4/tutorial): T → pregunta del modo ayuda («No, gracias») → SALTAR la
    // cinemática (Esc) → bienvenida y camino a la primera patata. Los diálogos 2D se avanzan pulsando su botón (el último: en la pregunta,
    // «No, gracias»), como haría quien juega, durante toda la partida.
    const autoD2 = () => page.evaluate(() => { if (window.__autoD2) return; window.__autoD2 = setInterval(() => { const d = document.getElementById('d2');
      if (d && !d.hidden) { const bs = d.querySelectorAll('.d2-btn'), b = bs[bs.length - 1]; if (b && performance.now() - (window.__d2seen ?? 0) > 600) { b.click(); window.__d2seen = performance.now(); } } else window.__d2seen = performance.now(); }, 150); });
    { await page.waitForFunction(() => { const d = document.getElementById('d2'); return d && !d.hidden; }, { timeout: 10000 }).catch(() => {});
      await sleep(500); await page.keyboard.press('KeyT'); await autoD2();
      await page.waitForFunction(() => !document.getElementById('btn-cine-skip').hidden, { timeout: 20000 }).catch(() => {}); await sleep(800); await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__bk.state.p.narr.estado === 'hecho' && window.__bk.mode === 'explore', { timeout: 60000 }).catch(() => {});
      const nz = await page.evaluate(() => ({ ...window.__bk.state.p.narr }));
      R.check(nz.estado === 'hecho' && nz.ayuda === 'no' && nz.vistos.includes('PAR') && !nz.practica, 'V10.4: tutorial saltado (T) → «No, gracias» → cinemática saltada → bienvenida y camino a NMG', 'input', nz); }
    const P = new Pilot(page, R);
    // V10.1 P02 (D02, cambio de diseño aprobado): con W mantenida ANMI corre a 5 m/s; la ruta de la campaña se hizo andando (3 m/s en V10):
    // el piloto anda sin correr (`walkOnly`) salvo donde la ruta pide carrerilla (salto H de TT). Copia previa en V10/backups/pruebas/V10_1-R5
    P.walkOnly = true;
    const incid = [];
    const ev = (msg, data) => { R.note({ t: new Date().toISOString().slice(11, 19), msg, ...(data ? { data } : {}) }); console.log('· ' + msg); };
    const st = () => page.evaluate(() => { const g = window.__bk; return { total: g.state.total, collected: g.state.p.collected.slice(), acts: { ...g.state.p.activities }, mode: g.mode, centerOpen: g.centerOpen, cars: g.cars.active, music: g.musicDebug ? { ...g.musicDebug } : null, finalProof: g.state.p.finalProof, partials: { ...g.state.p.partials }, bridgeReached: g.state.p.bridgeReached }; });
    const fries = await page.evaluate(() => Object.fromEntries(window.__bk.manifest.fries.map((f) => [f.id, { pos: f.pos.toArray(), access: f.access, kind: f.kind }])));
    const has = async (id) => (await st()).collected.includes(id);
    const reload = async (why) => {
      await P.release();
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
      await clickStart(page); await sleep(900); await autoD2(); await P.buildNav({ cars: (await st()).cars });
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
    // V10.4 (bloqueo de 3): las tres patatas de exploración de NMG antes de hablar con La Pantera
    await walkFry('no_me_guillo.hidden');
    await ollieFry('no_me_guillo.medium');
    const pz = await zone('act.pantherTalk'); await P.walkTo([pz[0], pz[2]], { tol: 0.8 });
    // R7 (usuario, 12 oct): la frase de La Pantera ya no se cierra sola: se lee y se pulsa «Vale» (contrato cambiado por decisión)
    const talked = await P.act(/HABLAR/); await sleep(2000); await page.click('#dialog-ok').catch(() => {}); await sleep(1500);
    R.check(talked && (await st()).acts.pantherTalk, 'NMG: charla con La Pantera (E) completa la actividad', 'input', { talked });
    await walkFry('no_me_guillo.activity');
    await cassette('no_me_guillo', cas.no_me_guillo);
    // pausa real y continuar
    await page.keyboard.press('Escape'); await sleep(500); const pa = await st(); await page.keyboard.press('Escape'); await sleep(300);
    ev('pausa real y continuar', { mode: pa.mode });

    // ======================================================== 3. FASHION GIRL (V6)
    const fgTh = (108 + 9) * Math.PI / 180, /* V10 (preparación): marco FG girado con la corona (D-EX-01) */ FO = [30.5 * Math.sin(fgTh), -30.5 * Math.cos(fgTh)], FW = [Math.sin(fgTh), -Math.cos(fgTh)], FS = [-Math.cos(fgTh), -Math.sin(fgTh)];
    const FV = (w, s) => [FO[0] + FW[0] * w + FS[0] * s, FO[1] + FW[1] * w + FS[1] * s];
    const FH = (dw, ds) => Math.atan2(FW[0] * dw + FS[0] * ds, FW[1] * dw + FS[1] * ds);
    const holdUntil = async (keys, ms, cond) => { await P.keys(keys); const t0 = Date.now(); let ok = false; while (Date.now() - t0 < ms) { if (await cond()) { ok = true; break; } await sleep(40); } await P.release(); return ok; };
    const onStage = async () => { const s = await P.state(); return s.y > 0.9 && /BAILAR/.test(s.prompt); };
    // V10.4: se sube primero a la pista por la rampa trasera (sin bailar: el baile queda para después de las tres patatas)
    await P.walkTo(FV(0, 12.6), { tol: 0.4 }); await P.face(FH(0, -1)); await holdUntil(['KeyW'], 4000, onStage);
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
    // V10.3 (W05, W-D08/W-D34; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_3-cierre): sin túnel; la patata escondida está
    // encima del tramo alto del muro bajo, junto a la radio: andando hasta el muro y de un salto encima
    await P.walkTo(FV(3.4, -11.4), { tol: 0.35 }); await P.walkTo(FV(-2.1, -10.7), { tol: 0.3 }); await P.face(FH(0, -1));
    await page.keyboard.down('KeyW'); await sleep(350); await page.keyboard.press('Space'); await holdUntil(['KeyW'], 1600, () => has('fashion_girl.hidden')); await page.keyboard.up('KeyW');
    await P.face(FH(0, 1)); await page.keyboard.down('KeyW'); await sleep(250); await page.keyboard.press('Space'); await sleep(900); await page.keyboard.up('KeyW');   // bajar del muro
    const fgOut = await P.state();
    R.check(await has('fashion_girl.hidden') && fgOut.y < 0.2, 'FG V10.3: andando hasta el muro de la radio, de un salto encima con la patata escondida y abajo otra vez', 'input', { y: fgOut.y });
    // cuña: subir andando hasta el labio bajo la patata suspendida
    await P.walkTo(FV(-4.4, 13.8), { tol: 0.35 }); await P.face(FH(1, 0));   // R2: a la altura de la patata
    await holdUntil(['KeyW'], 3000, () => has('fashion_girl.medium'));
    ev(`fashion_girl.medium: ${await has('fashion_girl.medium') ? 'recogida' : 'NO recogida'} subiendo la cuña`);
    await P.face(FH(-1, 0)); await holdUntil(['KeyW'], 1800, async () => (await P.state()).y < 0.06);   // bajar de la cuña por su rampa
    // V10.4 (bloqueo de 3): el baile, ya con las tres patatas de exploración de FG; después, la patata del premio
    // pista por la rampa trasera y baile de tres stages leyendo la pantalla (V10.1 P25, cambio de diseño aprobado: 15/10/5 s y 4 flechas en
    // cada stage; antes 10/5/3 s y 3/4/5 flechas; copia previa en V10/backups/pruebas/V10_1-R5)
    await P.walkTo(FV(0, 12.6), { tol: 0.4 }); await P.face(FH(0, -1));
    const fgUp = await holdUntil(['KeyW'], 4000, onStage);
    const danced = fgUp && await P.act(/BAILAR/);
    // V10.2 Q05 (D-05a, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_2-R3): Bella reta antes del baile y contesta al
    // ganar la primera vez: la campaña lee la frase y la cierra con E (teclado real), pasados los 250 ms de guarda del diálogo
    const bellaVale = async (ms) => { const ok = await page.waitForFunction(() => !document.getElementById('dialog').hidden && document.getElementById('dialog-name').textContent === 'Bella', { timeout: ms }).then(() => true).catch(() => false);
      if (ok) { await sleep(450); await page.keyboard.press('KeyE'); await sleep(400); } return ok; };
    const retoBella = danced ? await bellaVale(4000) : false;
    if (danced) {
      for (let r = 0; r < 3; r++) {
        await page.waitForFunction((r) => document.getElementById('dance-round')?.textContent === String(r + 1) && !document.getElementById('dance-timer').classList.contains('frozen') && document.querySelectorAll('#dance-seq span').length === [4, 4, 4][r], { timeout: 20000 }, r).catch(() => {});
        const seq = await page.evaluate(() => [...document.querySelectorAll('#dance-seq span')].map((s) => s.getAttribute('aria-label')));
        for (const k of seq) { await page.keyboard.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[k]); await sleep(200); }
        await sleep(500);
      }
      await page.waitForFunction(() => window.__bk.state.p.activities.danceCombo, { timeout: 25000 }).catch(() => {});
      // V10.5 (E5-12, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_5-R2): tras ganar van la celebración, el break final de todos
      // (V10.4 R17, ~6 s) y la llegada de la cámara de la charla antes del bocadillo: la frase de Bella sale pasados los 8 s que se esperaban
      const finBella = await bellaVale(16000); R.note(`FG: Bella reta ${retoBella} y contesta al ganar ${finBella}`);
      await waitMode('explore', 25000);
    }
    R.check((await st()).acts.danceCombo, 'FG V6: tres stages con tiempo (15/10/5 s; 4 flechas) leyendo la pantalla (teclado)', 'input', { up: fgUp, danced });
    await walkFry('fashion_girl.activity');
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
      // (V10.1 P02, D02: andar llega a 2,5 m/s y no a 3; el salto de H a pie pide CARRERILLA desde el fondo del descanso, como a quien juega)
      await TT.go(P, [[11.9, HC]], { tol: 0.25 }); await P.face(TT.HD(-1, 0)); await sleep(150); let jumped = false; P.walkOnly = false;
      // carrerilla RECTA (solo W, ya de cara al agujero): la carrera pide 0,8 s de W sin girar; las correcciones de rumbo del piloto la cortaban
      { await P.keys(['KeyW']); const t0 = Date.now();
        while (Date.now() - t0 < 4000) { const p = TT.loc(await tts()); if (!jumped && p.x <= hole[2] - 0.1) { await page.keyboard.press('Space'); jumped = true; } if (p.x < hole[0] - 0.75 || p.h < 3) break; await sleep(12); }
        await P.release(); }
      await sleep(300); let s = await tts(); P.walkOnly = true;
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

    // ======================================================== 5. YINYANG V8 (piscina, rana y grafiti de T1)
    await cassette('yinyang', cas.yinyang);
    { const okB = await ollieFry('yinyang.medium'); R.check(okB, 'YY: patata encima del banco izquierdo recogida con un ollie', 'input', { okB }); await P.ensureFoot(); }
    // V10.4 (bloqueo de 3): el vaso a pie (patatas visible y oculta) ANTES de hablar con la rana; la media (banco) ya está
    // el vaso a pie: E1 abajo (patata al pie) → R2 a N2 → paso bajo el rótulo → patata del lóbulo derecho → vuelta por R2 y E1
    { await P.walkTo(YYL.XZ(-9.7, 31.4), { tol: 0.4 }); await P.face(YYL.HD(1, 0));
      await YYL.goL(P, [[-8.6, 31.4], [-7.6, 31.4], [-7.2, 31.4]]); await sleep(400);
      const gotV = await has('yinyang.visible');
      await YYL.goL(P, [[-6.0, 31.1], [-4.9, 30.9], [-3.0, 30.6], [-1.2, 28.3], [1.4, 27.9], [4.0, 28.2], [6.5, 29.9]], { maxMs: 40000 }); await sleep(400);
      const gotH = await has('yinyang.hidden');
      await YYL.goL(P, [[4.0, 28.2], [1.4, 27.9], [-1.2, 28.3], [-3.0, 30.0], [-5.6, 31.0], [-7.2, 31.3], [-8.4, 31.4], [-9.6, 31.4]], { maxMs: 50000 }); await sleep(500);
      const s5 = await page.evaluate(() => ({ y: window.__bk.skater.footPos.y, resp: window.__bk.skater.respawns }));
      R.check(gotV && gotH && Math.abs(s5.y) < 0.08, 'YY: patata al pie de E1 y patata del lóbulo derecho recogidas a pie (E1 → R2 → N2 → paso bajo el rótulo) y vuelta al deck por R2 y E1', 'input', { gotV, gotH, s5 });
      await P.buildNav({ cars: (await st()).cars }); }

    { const INTRO = ['Kroak...( Esta era mi casa antes...)', 'Kroak...( Ahora es un skatepark...)', 'Kroak...( El pago para usarlo es que me hagas un graffiti para mi colección...)', 'Kroak!( Más te vale que esté bien BELLAKO!!!)'];
      const gz = await zone('act.graffiti');
      // V10.2 R6 (entorno de la prueba, copia previa en V10/backups/pruebas/V10_2-R6): desde el banco, el camino recto a la rana cruza el vaso y el
      // piloto a veces caía dentro y no salía (falla igual en la versión anterior: 1 de 2). Rodeo por el paseo rosa exterior (r 38,6)
      { const rr = 38.6, wp = [155, 165, 172].map((a) => [rr * Math.cos(a * Math.PI / 180), rr * Math.sin(a * Math.PI / 180)]); await P.follow(wp, { tol: 0.6, maxMs: 25000 }); }
      await P.walkTo([gz[0], gz[2]], { tol: 0.6 });
      await page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 }).catch(() => {});
      const talked = await P.act(/HABLAR/, 8000); const lines = [];
      for (let i = 0; i < 4; i++) { await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 6000 }).catch(() => {}); lines.push(await page.evaluate(() => document.getElementById('dialog-text').textContent)); await page.click('#dialog-ok'); await sleep(350); }
      R.check(talked && JSON.stringify(lines) === JSON.stringify(INTRO), 'YY: HABLAR a pie con la rana → las cuatro frases exactas en orden', 'input', lines);
      await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 }).catch(() => {});
      const strokes = await maskStrokes(page); await mouseStrokes(page, strokes.slice(0, Math.round(strokes.length * 0.4)));
      const p1 = await page.evaluate(() => document.getElementById('graffiti-pct')?.textContent);
      await page.click('#graffiti-exit'); await sleep(500);
      await reload('grafiti parcial'); await hideHint();
      await P.walkTo([gz[0], gz[2]], { tol: 0.6 }); await page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 }).catch(() => {});
      const cont = await P.act(/SEGUIR PINTANDO/, 8000); await sleep(500);
      const dlg = await page.evaluate(() => !document.getElementById('dialog').hidden);
      await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 }).catch(() => {});
      const p2 = await page.evaluate(() => document.getElementById('graffiti-pct')?.textContent);
      await mouseStrokes(page, await maskStrokes(page));
      await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 12000 }).catch(() => {});
      const th = await page.evaluate(() => ({ t: document.getElementById('dialog-text').textContent, clip: window.__bk.npcs.get('rana')?.[0]?.current?.getClip().name, act: window.__bk.state.p.activities.graffiti }));
      R.check(cont && !dlg && p1 === p2 && th.act && th.t === 'Kroak!( Gracias!)' && th.clip === 'Dance', 'YY: parcial → salir → recargar → SEGUIR PINTANDO (sin repetir frases) con la misma cobertura → terminar → la rana baila y da las gracias', 'input', { p1, p2, cont, dlg, th });
      await page.click('#dialog-ok'); await waitMode('explore', 10000); }   // V10.4: su premio se deja para la 20.ª
    // ======================================================== 6. NOSVAMOSDEAQUI V10 (cambio de diseño aprobado: el circuito tutorial se sustituye por el
    // grind de RG1 con Fennec, dossier NVDA v4): paso agachado T1 (patata oculta), escalinata E1 hasta M1 (patata visible), charla con Fennec
    // arriba del puente y grind completo con entrada real (equilibrio A/D y agachado C en el aviso de la vuelta), premio abajo. La patata de la
    // bajada B1 (media) se deja como 20.ª
    { const L = (x, y, h = 0) => nvW(page, x, y, h);
      await cassette('nosvamosdeaqui', cas.nosvamosdeaqui);
      // T1: desde el lado +x, agachada (C mantenida) hasta la patata bajo la losa
      const t0 = await L(7.6, 28.9); await P.walkTo([t0[0], t0[2]], { tol: 0.35 });
      const t1 = await L(4.6, 28.9); await page.keyboard.down('KeyC'); await sleep(300);
      await P.follow([[t1[0], t1[2]]], { tol: 0.35, maxMs: 12000, until: async () => has('nosvamosdeaqui.hidden') });
      await P.follow([[t0[0], t0[2]]], { tol: 0.4, maxMs: 12000 }); await page.keyboard.up('KeyC'); await sleep(300);
      const gotHidden = await has('nosvamosdeaqui.hidden');
      // E1 → M1
      const e0 = await L(-7, 27.3), e1 = await L(-7, 32.0), m1 = await L(-7, 33.6);
      await P.walkTo([e0[0], e0[2]], { tol: 0.35 }); await P.follow([[e1[0], e1[2]], [m1[0], m1[2]]], { tol: 0.4, maxMs: 20000 });
      const gotVisible = await has('nosvamosdeaqui.visible'); const yTop = (await P.state()).y;
      R.check(gotHidden && gotVisible && yTop > 3.2, 'NV: patata oculta agachada bajo T1 y patata visible arriba de la escalinata E1 (a pie)', 'input', { gotHidden, gotVisible, yTop });
      // V10.4 (bloqueo de 3): la media de la bajada B1 ANTES del grind (antes era la 20.ª): M1 → M2 → bajar por B1 andando, y otra vez arriba por E1
      { const m2 = await L(-10.1, 33.5), b0 = await L(-10.1, 31.8), b1 = await L(-10.1, 27.6);
        await P.follow([[m2[0], m2[2]], [b0[0], b0[2]], [b1[0], b1[2]]], { tol: 0.4, maxMs: 30000, until: async () => has('nosvamosdeaqui.medium') });
        R.check(await has('nosvamosdeaqui.medium'), 'NV: patata de la bajada B1 recogida andando', 'input');
        await P.walkTo([e0[0], e0[2]], { tol: 0.35 }); await P.follow([[e1[0], e1[2]], [m1[0], m1[2]]], { tol: 0.4, maxMs: 20000 }); }
      // charla con Fennec y grind
      const tz = await zone('act.skateTutorial'); const p1 = await L(-3.5, 33.6, 3.4);
      await P.follow([[p1[0], p1[2]], [tz[0], tz[2]]], { tol: 0.6, maxMs: 20000 });
      const talk = await nvTalkAndStart(page);
      let grindOk = false, tries = 0;
      while (talk.ok && !grindOk && tries < 4) { tries++; await nvPilot(page, { crouch: true, maxMs: 40000 }); const s = await nvState(page); grindOk = s.done;
        if (!grindOk) { await sleep(1800); const r = await nvTalkAndStart(page); if (!r.ok) break; } }
      let fin = null; const tf = Date.now(); while (Date.now() - tf < 8000) { const s = await nvState(page); if (s.dialog) { fin = s.dialog; await page.click('#dialog-ok'); break; } await sleep(150); }
      R.check(talk.ok && grindOk && fin === 'Miau! (Wow, aquí tienes tu regalo!', 'NV: charla con Fennec (frases literales) → grind de RG1 completado con equilibrio y agachado → Fennec abajo con su frase final', 'input', { talk, grindOk, tries, fin });
      await waitMode('explore', 8000); await P.ensureFoot(); await P.buildNav({ cars: (await st()).cars });
      await walkFry('nosvamosdeaqui.activity'); }

    // ======================================================== 7. centro ANTES de 20: libre, cassette, sin coches
    // V10.3 (W04, W-D33; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_3-cierre): antes de 20 la valla cierra el centro y los coches
    // derrapan detrás; se llega andando hasta la valla frente al radiocasete (se ve tras la malla) y salta el aviso de la señal rota
    const pre20 = await st();
    { const r0 = Math.hypot(cas.secretnovio[0], cas.secretnovio[2]) || 1, k = 23.3 / r0; await P.walkTo([cas.secretnovio[0] * k, cas.secretnovio[2] * k], { tol: 0.5, maxMs: 90000 }); }
    const c0 = await st(); const cp = await P.state(), fence = await page.evaluate(() => window.__bk.park.vallaUp);
    R.check(pre20.total === 19 && c0.cars && fence && !c0.centerOpen && Math.hypot(cp.x, cp.z) > 22.2 && Math.hypot(cp.x, cp.z) < 24.5, 'centro con 19/20: valla de pie, coches detrás y se llega andando a la valla frente al radiocasete', 'input', { total: pre20.total, cars: c0.cars, fence, r: Math.hypot(cp.x, cp.z) });

    // ======================================================== 8. la 20.ª y revelación
    // V10.4: la 20.ª es el premio de YINYANG, junto al muro pintado (a ras de suelo); con el recorrido 2D, FIN-01/02 → revelación → FIN-03 → guía de SN → FIN-04
    await walkFry('yinyang.activity');
    const at20 = await st();
    R.check(at20.total === 20, '20/20 recogidas por la ruta', 'input', { total: at20.total, falta: Object.keys(fries).filter((k) => !at20.collected.includes(k)), incid });
    await page.waitForFunction(() => window.__bk.state.p.narr.vistos.includes('FIN') && window.__bk.mode === 'explore', { timeout: 60000 }).catch(() => {});
    const rv = await st();
    R.check(rv.centerOpen && rv.cars, 'a 20: revelación de la superrampa y aparición de los coches', 'input', { centerOpen: rv.centerOpen, cars: rv.cars });

    // ======================================================== 9. final V10 (cambio de diseño aprobado: reto de SECRETNOVIO en lugar de la superrampa y el
    // triple): cruzar el anillo andando cuando ningún coche está cerca, blur real, escalera (TREPAR + W), ¡BAJAR!, SALTO en la ventana →
    // logro y preview; volver al parque; «ver otra vez» desde la pausa; segundo intento
    await P.ensureFoot(); await P.buildNav({ cars: false });
    // V10.3 (U-14: coches a 10,5 m/s; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_3-cierre): antes se esperaba a que ningún
    // coche estuviera a < 80° de ANMI (pensado para 8,75 m/s); ahora se predice con la pose analítica de los coches dónde estarán mientras ANMI cruza
    // andando hacia el centro (2,4 m/s) y solo se cruza si ninguno pasa a menos de 5 m de su camino
    const carNear = () => page.evaluate(() => { const g = window.__bk, C = g.cars, w = C.avgSpeed / C.R, p = g.skater.footPos, r0 = Math.hypot(p.x, p.z), ux = p.x / r0, uz = p.z / r0;
      for (let t = 0; t <= 6; t += 0.1) { const rr = r0 - 2.4 * t; if (rr < 13.5) break; for (const c of C.cars) { const q = window.__bkCarPose(C.phase + c.offset - w * t).pos; if (Math.hypot(q.x - ux * rr, q.z - uz * rr) < 5) return true; } }
      return false; });
    { const me = await P.state(), r = Math.hypot(me.x, me.z), k = 24.5 / Math.max(1, r); await P.walkTo([me.x * k, me.z * k], { tol: 0.6 }); }   // al borde exterior del anillo
    for (let i = 0; i < 600 && (await carNear()); i++) await sleep(40);
    { const me = await P.state(), r = Math.hypot(me.x, me.z), k = 13.5 / Math.max(1, r); await P.walkTo([me.x * k, me.z * k], { tol: 0.6, maxMs: 15000 }); }   // cruzar
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(500);
    const bl = await st(); await page.keyboard.press('Escape'); await sleep(300);
    ev('blur real durante la campaña', { mode: bl.mode });
    let ok1 = null; for (let n = 1; n <= 3 && !ok1?.end?.done; n++) { ok1 = await snRun(page, R, { jump: 'hot', place: false }); ev(`reto intento ${n}`, { done: ok1.end.done, fails: ok1.end.fails, apex: ok1.log.apex }); if (!ok1.end.done) { await waitMode('explore', 8000); await sleep(1500); } }
    const inPv = await waitMode('preview', 6000);
    await sleep(2000);
    const pv = await page.evaluate(() => ({ state: window.__bk.audio.music.previewState, proof: window.__bk.state.p.finalProof }));
    await directShot(page, R, 'final_preview', [9, 1.6, -9], [0, 1, 0], 60).catch(() => {});
    R.check(!!ok1?.end?.done && inPv && pv.proof?.kind === 'secretnovio_v10', 'final: reto de SECRETNOVIO (escalera, bajada, SALTO en la ventana, trucazo, recepción en D) → logro guardado y preview', 'input', { end: ok1?.end, pv });
    for (let i = 0; i < 20 && (await st()).mode === 'preview'; i++) { await page.keyboard.press('Escape'); await sleep(600);   /* V10.1: la escena final se salta con Esc (ya no hay ventana con «cerrar»; copia previa en V10_1-SNROT) */ }
    await waitMode('explore', 5000);
    await page.keyboard.press('Escape'); await sleep(400);
    const again = await page.evaluate(() => !document.getElementById('btn-preview-again').hidden);
    if (again) { await page.click('#btn-preview-again'); await waitMode('preview', 4000); await sleep(1500); for (let i = 0; i < 20 && (await st()).mode === 'preview'; i++) { await page.keyboard.press('Escape'); await sleep(600);   /* V10.1: la escena final se salta con Esc (ya no hay ventana con «cerrar»; copia previa en V10_1-SNROT) */ } await waitMode('explore', 5000); }
    else await page.keyboard.press('Escape');
    R.check(again, 'volver al parque y «ver otra vez» desde la pausa', 'input', { again });
    await sleep(2500);
    const ok2 = await snRun(page, R, { jump: 'hot', place: false });
    R.check(!!ok2 && (ok2.end.done || ok2.end.ok >= 1), 'segundo intento posible tras el logro (resultado registrado)', 'input', ok2 && { done: ok2.end.done, ok: ok2.end.ok, fails: ok2.end.fails });
    for (let i = 0; i < 20 && (await st()).mode === 'preview'; i++) { await page.keyboard.press('Escape'); await sleep(600);   /* V10.1: la escena final se salta con Esc (ya no hay ventana con «cerrar»; copia previa en V10_1-SNROT) */ }
    await waitMode('explore', 30000);

    // ======================================================== 10. recarga final
    const fin = await reload('final de campaña');
    R.check(fin.total === 20 && fin.finalProof?.kind === 'secretnovio_v10' && fin.acts.pantherTalk && fin.acts.skateTutorial /* V10: clave interna conservada (D-NV-01) = grind de RG1 */ && fin.acts.graffiti && fin.acts.bridgeTalk && fin.acts.danceCombo, 'recarga final: 20/20, cinco actividades y logro del triple conservados', 'input', { total: fin.total, proof: fin.finalProof, acts: fin.acts });
    const save = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    fs.writeFileSync(path.join(R.dir, 'save_final.json'), save ?? 'null');
    R.note({ incidencias: incid, pilot_log: P.log.slice(-40) });
    R.pendingHuman('Campaña con jugador humano y dispositivos físicos (táctil/mando)');
  } finally { await browser.close(); }
}, { timeoutMs: 2400000 });
