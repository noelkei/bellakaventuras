// V7 T7-07 · MATRIZ de las dos conversaciones, el premio y el guardado de TRA TRA TRA (06 · validación, «patatas y
// conversaciones»). ANMI se coloca sobre el techo (fixture declarada: el acceso real lo acredita tt-routes) y todo lo demás
// se hace con ACCIÓN (E), el botón «Vale», pausa real y recargas reales de la página.
//  A dónde se ofrece HABLAR (techo junto a cada extremo sí; recepción, plaza y centro del techo no; una pulsación = un NPC)
//  B repetir al mismo NPC no completa · C salir antes de cerrar la frase (pausa + recarga) no marca · D pausa congela y no marca
//  E recarga con cada parcial (nadie / Aissa / Juseph / ambos con premio pendiente / premio recogido), sin duplicar premio
//  F guardados V6 (bridgeRest, bridgeReached sin charla, charla hecha sin patata, patata recogida, parcial dañado)
//  G checkpoints antiguos de TT sin suelo o dentro de la obra nueva → pie de E1 con todo el progreso
// Uso: node game/tools/v7/tt-talks.mjs --url dev --task T7-07
import { Report, runTest, launch, openGame, clickStart, sleep, place, arg } from './lib.mjs';
import { Pilot, W, HD, loc, tt, go, talk, KIT, ROOF, LC, TALK_SPOT } from './tt-lib.mjs';

const R = new Report('tt-talks');
const only = arg('only') ? new Set(arg('only').split(',')) : null, on = (k) => !only || only.has(k);
const cx = KIT.limo.center[0], SPOT = { ...TALK_SPOT, center: [cx, LC] };
const KEY = 'bellakaventuras.remake.save';
const fresh = (over = {}) => ({ version: 4, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, bridgeReached: false, finalDone: false, finalProof: null,
  revealSeen: false, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic', 'tt-hole'], settings: {}, ...over });
await runTest(R, async () => {
  const b = await launch();
  try {
    const open = async (save) => { const page = await openGame(b, R, { save }); await clickStart(page); await sleep(900);
      await page.evaluate(() => { const g = window.__bk; g.loadNpc('aissa'); g.loadNpc('juseph'); }); const P = new Pilot(page, R); return { page, P }; };
    const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(900); };
    const roof = (page, who) => place(page, R, W(...SPOT[who], ROOF + 0.03), who === 'juseph' ? HD(0, 1) : HD(0, -1), 'walk', `techo, junto a ${who}`);
    // R13: el punto seguro se guarda cada 1,5 s de juego con ANMI apoyada; antes de una charla que precede a una recarga se espera a que
    // el del techo esté guardado (como al jugar: se sube y luego se habla). Sin esto, si la charla empezaba antes de cumplirse el
    // intervalo, la recarga devolvía a ANMI al inicio y PT4 quedaba oculta por distancia (> 48 m), que es lo correcto.
    const cpRoof = (page) => page.waitForFunction((y) => (window.__bk.state.p.checkpoint?.y ?? -9) > y, { timeout: 5000 }, ROOF - 0.5).catch(() => R.invalid('el punto seguro del techo no se guardó en 5 s', {}));
    const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
    // espera a que ANMI quede apoyada tras la colocación (el primer paso tras abrir la partida puede tardar): hasta 1,5 s
    const prompt = async (page) => { await sleep(350); let p = (await tt(page)).prompt; for (let i = 0; i < 10 && !p; i++) { await sleep(120); p = (await tt(page)).prompt; } return p; };

    // ============================================================ A. dónde se ofrece
    if (on('A')) {
      const { page, P } = await open(null);
      await roof(page, 'aissa'); const pa = await prompt(page);
      await roof(page, 'juseph'); const pj = await prompt(page);
      await roof(page, 'center'); const pc = await prompt(page);
      await place(page, R, W(cx + 1.7, LC, 5.63), HD(-1, 0), 'walk', 'recepción, pegada a la limo'); const pr = await prompt(page);
      await place(page, R, W(cx, KIT.npcs.aissa.zone[1] - 0.05, 0.03), HD(0, -1), 'walk', 'plaza, bajo el capó'); const pg = await prompt(page);
      await place(page, R, W(cx, KIT.npcs.juseph.zone[1] + 0.05, 0.03), HD(0, 1), 'walk', 'plaza, bajo la trasera'); const pg2 = await prompt(page);
      R.check(/HABLAR/.test(pa) && /HABLAR/.test(pj), 'HABLAR se ofrece sobre el techo junto a cada extremo', 'input', { aissa: pa, juseph: pj });
      R.check(!/HABLAR/.test(pc) && !/HABLAR/.test(pr) && !/HABLAR/.test(pg) && !/HABLAR/.test(pg2), 'no se ofrece en el centro del techo, en la recepción ni en la plaza bajo la limo', 'input', { centro: pc, recepcion: pr, plaza: [pg, pg2] });
      // una pulsación = un NPC; doble pulsación no abre otra charla
      await roof(page, 'aissa'); await sleep(300); await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE'); await sleep(400); await page.keyboard.press('KeyE');
      await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 8000 }).catch(() => {}); await sleep(300);
      let s = await tt(page);
      R.check(s.dialog && s.talking === 'aissa' && !s.heard.aissa && !s.heard.juseph, 'doble pulsación (y otra mientras se levanta): una sola charla abierta (Aissa) y nadie marcado al abrir', 'input', { talking: s.talking, heard: s.heard });
      await page.click('#dialog-ok'); await sleep(5500);
      // R1 (usuario): al hablarle se levanta, se gira hacia ANMI, se acerca un poco, dice la frase y vuelve a sentarse como estaba
      const npcAt = (who) => page.evaluate((who) => { const g = window.__bk, n = g.npcs.get(who)[0], f = g.skater.footPos, p = n.root.position;
        return { y: +p.y.toFixed(3), home: n.home && { x: n.home.pos.x, y: n.home.pos.y, z: n.home.pos.z, yaw: n.home.yaw }, yaw: n.yaw, face: Math.atan2(f.x - p.x, f.z - p.z),
          dist: +Math.hypot(f.x - p.x, f.z - p.z).toFixed(3), toHome: n.home ? +p.distanceTo(n.home.pos).toFixed(3) : null, clip: n.current?.getClip().name }; }, who);
      const ad = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      for (const who of ['aissa', 'juseph']) {
        await roof(page, who); await sleep(300); const tk = await talk(P, page, { close: false }); const up = await npcAt(who);
        R.check(tk.ok && up.home && up.y > ROOF - 0.05 && ad(up.yaw, up.face) < 0.35 && up.dist >= 0.85 && up.clip === 'Talk', `${who}: de pie SOBRE EL TECHO, girado hacia ANMI y a ≥ 0,85 m mientras dice su frase`, 'input', { ...up, giro: +ad(up.yaw, up.face).toFixed(2) });
        await page.click('#dialog-ok'); await sleep(5500); const down = await npcAt(who);
        R.check(down.toHome < 0.02 && ad(down.yaw, down.home.yaw) < 0.03 && down.clip === 'SitIdle', `${who}: al cerrar la frase vuelve a sentarse como estaba`, 'input', { toHome: down.toHome, giro: +ad(down.yaw, down.home.yaw).toFixed(3), clip: down.clip });
      }
      await page.close();
    }
    // ============================================================ B. repetir al mismo no completa · ambos órdenes · premio único
    if (on('B')) for (const order of [['aissa', 'aissa', 'juseph'], ['juseph', 'juseph', 'aissa']]) {
      const { page, P } = await open(null); const seq = [];
      for (const who of order) { await roof(page, who); const tk = await talk(P, page); const s = await tt(page); seq.push({ who, ok: tk.ok, text: tk.text?.[1], heard: s.heard, act: s.act, pt4: s.pt4?.available, n: s.pt4count, total: s.total }); }
      R.measure(`orden_${order.join('_')}`, seq);
      R.check(seq[0].heard[order[0]] && !seq[0].act && !seq[0].pt4 && !seq[1].act && !seq[1].pt4 && !seq[1].heard[order[2]], `${order[0]} dos veces: sigue sin completarse y PT4 oculta`, 'input', seq.slice(0, 2));
      R.check(seq[2].act && seq[2].pt4 && seq[2].n === 1 && seq[2].total === 0, `después ${order[2]}: completa, UNA PT4 visible y contador en 0`, 'input', seq[2]);
      // R1 (usuario): cada NPC alterna sus dos frases (1.ª, 2.ª, 1.ª…)
      const LINES = { aissa: ['Oa-oa, deja que te coja...', "Posa pa' la Kodak, tú naciste pa' posar..."], juseph: ['Le di tabla y no se llama Sofía ni es surfer...', 'El diablo ya no viste de Prada, ahora viste Shein...'] };
      { const third = await (async () => { await roof(page, order[0]); return (await talk(P, page)).text?.[1]; })();
        R.check(seq[0].text === LINES[order[0]][0] && seq[1].text === LINES[order[0]][1] && third === LINES[order[0]][0] && seq[2].text === LINES[order[2]][0], `${order[0]} alterna sus dos frases (1.ª, 2.ª, 1.ª) y ${order[2]} empieza por la suya`, 'input', { [order[0]]: [seq[0].text, seq[1].text, third], [order[2]]: seq[2].text }); }
      // repetir charlas con el premio pendiente no crea otra patata ni lo concede
      await roof(page, order[0]); await talk(P, page); await roof(page, order[2]); await talk(P, page); let s = await tt(page);
      R.check(s.pt4count === 1 && s.total === 0 && s.pt4.available, 'repetir las dos charlas con el premio pendiente: sigue habiendo UNA patata sin recoger', 'input', { n: s.pt4count, total: s.total });
      // desde la recepción, bajo el centro, no se recoge; andando por el techo sí
      await place(page, R, W(cx + 1.7, LC, 5.63), HD(-1, 0), 'walk', 'recepción, bajo PT4'); await sleep(500); s = await tt(page);
      const below = s.total;
      await roof(page, order[2]); const r = await go(P, [SPOT.center], { tol: 0.2 }); await sleep(300); s = await tt(page);
      R.check(below === 0 && s.total === 1 && s.col.includes('tratratra.activity'), 'PT4: desde la recepción no; andando hasta el centro del techo sí (+1)', 'input', { below, total: s.total, at: r.at });
      await roof(page, order[0]); await talk(P, page); s = await tt(page);
      R.check(s.total === 1 && s.pt4count === 0, 'hablar otra vez con el premio ya recogido no crea otra patata', 'input', { total: s.total, n: s.pt4count });
      await page.close();
    }
    // ============================================================ C/D. salir antes de cerrar, y pausa
    if (on('C')) {
      const { page, P } = await open(null);
      await roof(page, 'juseph'); let tk = await talk(P, page, { close: false });
      const clock0 = await page.evaluate(() => window.__bk.clock);
      await page.keyboard.press('Escape'); await sleep(1200);
      const paused = await page.evaluate(() => ({ paused: window.__bk.paused, clock: window.__bk.clock }));
      await sleep(1000); const clock1 = await page.evaluate(() => window.__bk.clock);
      R.check(paused.paused && Math.abs(clock1 - paused.clock) < 0.02, 'pausa con la frase abierta: el reloj de simulación se congela', 'input', { clock0, pausa: paused.clock, despues: clock1 });
      let sv = await saved(page);
      R.check(!sv?.partials?.bridgeHeard?.juseph, 'frase abierta y en pausa: Juseph NO está marcado en el guardado', 'input', sv?.partials?.bridgeHeard ?? null);
      await reload(page);   // salir sin cerrar la frase
      let s = await tt(page);
      R.check(!s.heard.juseph && !s.heard.aissa && !s.act && s.mode === 'explore' && !s.dialog, 'salir antes de cerrar (recarga): nadie escuchado, controles libres', 'input', { heard: s.heard, mode: s.mode });
      // pausa y reanudar: la frase sigue abierta; al cerrarla cuenta
      await roof(page, 'juseph'); tk = await talk(P, page, { close: false });
      await page.keyboard.press('Escape'); await sleep(800); await page.keyboard.press('Escape'); await sleep(800);
      s = await tt(page);
      R.check(s.dialog && !s.heard.juseph, 'pausar y reanudar: la frase sigue abierta y sin marcar', 'input', { dialog: s.dialog, paused: await page.evaluate(() => window.__bk.paused) });
      await page.click('#dialog-ok'); await sleep(500); s = await tt(page);
      R.check(s.heard.juseph && s.mode === 'explore' && !s.dialog, 'al cerrarla con «Vale» queda marcada y se devuelven cámara y controles', 'input', { heard: s.heard, mode: s.mode });
      const cam = await page.evaluate(() => window.__bk.rig.mode ?? window.__bk.rig.state ?? null);
      R.measure('camara_tras_charla', cam);
      await page.close();
    }
    // ============================================================ E. recarga con cada parcial
    if (on('E')) {
      const { page, P } = await open(null);
      await reload(page); let s = await tt(page);
      R.check(!s.heard.aissa && !s.heard.juseph && s.pt4 && !s.pt4.available, 'recarga · nadie: PT4 oculta', 'input', s.heard);
      await roof(page, 'aissa'); await cpRoof(page); await talk(P, page); await reload(page); s = await tt(page);
      R.check(s.heard.aissa && !s.heard.juseph && !s.act && !s.pt4.available, 'recarga · solo Aissa: se conserva; Juseph pendiente; PT4 oculta', 'input', s.heard);
      const hasSave = await page.evaluate(() => window.__bk.state.hasSave);
      R.check(hasSave, 'una sola charla basta para que la partida se pueda continuar', 'unit', hasSave);
      await roof(page, 'juseph'); await cpRoof(page); await talk(P, page); await reload(page); s = await tt(page);
      R.check(s.heard.aissa && s.heard.juseph && s.act && s.pt4.available && s.pt4.visible && s.pt4count === 1 && s.total === 0, 'recarga · ambos con premio pendiente: UNA PT4 visible sobre el techo, contador en 0', 'input', { pt4: s.pt4, n: s.pt4count });
      await roof(page, 'aissa'); await go(P, [SPOT.center], { tol: 0.2 }); await sleep(300); await reload(page); s = await tt(page);
      R.check(s.total === 1 && s.col.includes('tratratra.activity') && s.pt4count === 0 && s.act, 'recarga · premio recogido: se conserva y no reaparece', 'input', { total: s.total, n: s.pt4count });
      await page.close();
      // solo Juseph
      const o2 = await open(null); await roof(o2.page, 'juseph'); await talk(o2.P, o2.page); await reload(o2.page); s = await tt(o2.page);
      R.check(s.heard.juseph && !s.heard.aissa && !s.act && !s.pt4.available, 'recarga · solo Juseph: se conserva; Aissa pendiente', 'input', s.heard);
      await o2.page.close();
    }
    // ============================================================ F. guardados V6
    if (on('F')) {
      const other = { collected: ['no_me_guillo.visible', 'fashion_girl.visible', 'tratratra.visible'], activities: { pantherTalk: true, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: true }, settings: { volume: 0.4, orientation: 'horizontal' } };
      const cases = {
        'bridgeRest parcial (descanso 2), sin llegar': [fresh({ ...other, partials: { ...fresh().partials, bridgeRest: 2 } }), { heard: [false, false], act: false, pt4: false }],
        'bridgeReached sin charla': [fresh({ ...other, bridgeReached: true, partials: { ...fresh().partials, bridgeRest: 4 } }), { heard: [false, false], act: false, pt4: false }],
        'charla V6 completada, patata sin recoger': [fresh({ ...other, bridgeReached: true, activities: { ...other.activities, bridgeTalk: true }, partials: { ...fresh().partials, bridgeRest: 4 } }), { heard: [true, true], act: true, pt4: true }],
        'charla V6 completada y patata recogida': [fresh({ ...other, bridgeReached: true, collected: [...other.collected, 'tratratra.activity'], activities: { ...other.activities, bridgeTalk: true } }), { heard: [true, true], act: true, pt4: null, got: true }],
        'parcial bridgeHeard dañado': [fresh({ ...other, partials: { ...fresh().partials, bridgeHeard: { aissa: 'si', juseph: 1 } } }), { heard: [false, false], act: false, pt4: false }],
        'parcial bridgeHeard no objeto': [fresh({ ...other, partials: { ...fresh().partials, bridgeHeard: 'x' } }), { heard: [false, false], act: false, pt4: false }],
        'V7 solo Juseph escuchado': [fresh({ ...other, partials: { ...fresh().partials, bridgeHeard: { aissa: false, juseph: true } } }), { heard: [false, true], act: false, pt4: false }],
        'patata de premio sin charla (incoherente)': [fresh({ ...other, collected: [...other.collected, 'tratratra.activity'] }), { heard: [false, false], act: false, pt4: false, dropped: true }],
      };
      for (const [name, [save, exp]] of Object.entries(cases)) {
        const page = await openGame(b, R, { save }); await clickStart(page); await sleep(700);
        const s = await tt(page), st = await page.evaluate(() => { const p = window.__bk.state.p; return { col: p.collected, acts: p.activities, vol: p.settings.volume, ori: p.settings.orientation }; });
        const expCol = other.collected.length + (exp.got ? 1 : 0);
        const ok = s.heard.aissa === exp.heard[0] && s.heard.juseph === exp.heard[1] && s.act === exp.act && (exp.pt4 === null ? s.pt4count === 0 : s.pt4?.available === exp.pt4 && s.pt4count === 1)
          // V10.5 (E5-06, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_5-cierre): al cargar con V10.5, «Pantalla» vuelve UNA vez a
          // «Automática» en todas las partidas guardadas (se fijaban sin querer, AM-01); el volumen y lo demás se conservan
          && st.col.length === expCol && st.acts.pantherTalk && st.acts.danceCombo && st.vol === 0.4 && st.ori === 'auto';
        R.check(ok, `guardado V6 · ${name}`, 'fixture', { heard: s.heard, act: s.act, pt4: s.pt4, n: s.pt4count, col: st.col, vol: st.vol });
        await page.close();
      }
    }
    // ============================================================ G. checkpoints antiguos de TT
    if (on('G')) {
      const foot = W(...KIT.checkpoint.at);
      // V10 (preparación; copia previa en V10/backups/pruebas/): el guardado es versión 4 (de V9) y sus coordenadas de mundo van SIN el giro de
      // corona (el juego las gira al migrar 4 → 5). `W` da coordenadas de V10: `V9` deshace el giro; `V10` lo aplica a los literales antiguos.
      const A9 = 9 * Math.PI / 180, V9 = (p) => [Math.cos(A9) * p[0] + Math.sin(A9) * p[2], p[1], -Math.sin(A9) * p[0] + Math.cos(A9) * p[2]], V10 = (c) => ({ x: Math.cos(A9) * c.x - Math.sin(A9) * c.z, z: Math.sin(A9) * c.x + Math.cos(A9) * c.z });
      const p1 = V9(W(1.1, KIT.pillars.list[2][1])), p2 = V9(W(-4.5, -6.0));
      const cps = { 'tablero antiguo (+4,20, ya sin suelo)': { x: 4.02, y: 4.2, z: 32.75, heading: 0 }, 'descanso antiguo de la escalera vieja (+1,60)': { x: 21.5, y: 1.6, z: 30.1, heading: 0 },
        'suelo que ahora ocupa un pilar nuevo': { x: p1[0], y: 0, z: p1[2], heading: 0 }, 'suelo libre de TT (se respeta)': { x: p2[0], y: 0, z: p2[2], heading: 1 } };
      for (const [name, cp] of Object.entries(cps)) {
        const page = await openGame(b, R, { save: fresh({ collected: ['no_me_guillo.visible', 'tratratra.visible'], checkpoint: cp, checkpointRevision: 4 }) }); await clickStart(page); await sleep(900);
        const s = await tt(page), free = await page.evaluate(() => { const g = window.__bk; return { grounded: g.skater.grounded, head: g.skater.headroomFree(g.skater.footPos), log: g.log.filter((l) => /checkpoint/.test(l)), total: g.state.total }; });
        const c10 = V10(cp), dFoot = Math.hypot(s.x - foot[0], s.z - foot[2]), dCp = Math.hypot(s.x - c10.x, s.z - c10.z);
        const respect = /se respeta/.test(name), inTT = Math.abs(Math.atan2(c10.x, -c10.z) * 180 / Math.PI + (c10.x < 0 ? 360 : 0) - 189) < 36;   // V10: eje TT 189°
        const ok = respect ? dCp < 0.3 && s.y < 0.2 : (inTT ? dFoot < 0.6 : true) && s.y < 0.3;
        R.check(ok && free.grounded && free.head && free.total === 2, `checkpoint V6 · ${name} → ${respect ? 'mismo punto' : inTT ? 'pie de E1' : 'inicio seguro'}, apoyada, con espacio y con su progreso`, 'fixture', { at: loc(s), dFoot: +dFoot.toFixed(2), log: free.log, total: free.total });
        await page.close();
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
