// V10 R5 · nv-grind · actividad del grind de RG1 con Fennec (dossier NVDA v4 §7, §8, §12; plan 20 N-11…N-21, N-35…N-41).
// Entradas REALES de teclado (un piloto lee el estado —inclinación, fase, aviso— y pulsa A/D y C como lo haría un jugador atento); la única
// fixture es colocar a ANMI en la zona de la charla (declarada). Casos:
//  A · sin tocar nada: pierde el equilibrio en pocos segundos → aviso, reintento arriba en P1, nada del progreso cambia;
//  B · equilibrando pero SIN agacharse: cae en el cruce bajo de la vuelta (X1) → reintento;
//  C · equilibrando y agachándose en el aviso: llega al final; Fennec aparece ABAJO y dice la frase final; la patata premio aparece y se recoge
//      andando hasta ella; recargar conserva todo (Fennec abajo, actividad hecha, premio recogido, sin duplicados);
//  medidas en C: tabla perpendicular a la tangente (|Δ − 90°| ≤ 10°) en todo el recorrido, sin saltos de orientación (el giro por paso sigue
//  al de la tangente ± 3°; R4, antes «< 15°/paso», que suponía curvas suaves), pies sobre
//  el tubo (≤ 3 cm sobre tubo + tabla), cámara lenta en el aviso (factor ≤ 0,5) y agachada en ±0,45 m del cruce, cámara nunca dentro de geometría;
//  D · «reducir movimiento»: sin cámara lenta (factor 1) y se puede completar igual.
// Uso: node tools/v10/nv-grind.mjs --url v10 --task V10-R5 --label final [--cases A,B,C,D]
import { Report, runTest, launch, openGame, clickStart, sleep, arg } from '../v8/lib.mjs';
const R = new Report('nv-grind');
const CASES = arg('cases', 'A,B,C,D').split(',');
const st = (page) => page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'skateTutorial'), s = g.skater, c = g.rig.cam.position, RA = window.__bkRapier;
  const camHit = g.world.intersectionWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.1), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (cc) => !g.npcColliders.has(cc.handle) && !g.park.cameraIgnore.has(cc.handle) && !g.park.b.thin.has(cc.handle));
  return { phase: a.phase, s: a.s, lean: a.lean, leanV: a.leanV, warned: a.warned, k: a.slowK, crouched: a.crouched, fails: a.failures.length, ok: a.successes, mode: g.mode, done: g.state.p.activities.skateTutorial,
    col: g.state.p.collected.slice(), foot: [s.footPos.x, s.footPos.y, s.footPos.z], dialog: !document.getElementById('dialog').hidden ? document.getElementById('dialog-text').textContent : null, camIn: camHit ? g.park.colliderName(camHit.handle) : null,
    action: !document.getElementById('btn-action')?.hidden ? document.getElementById('btn-action')?.textContent : null }; });
/** Piloto de equilibrio: pulsa hacia el lado contrario de la caída con anticipación (inclinación + velocidad); agacha al ver el aviso si `crouch`. */
async function pilot(page, { crouch = true, maxMs = 30000 } = {}) {
  let held = null, ch = false; const t0 = Date.now(), log = { camIn: [], maxLean: 0 };
  const press = async (k) => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  while (Date.now() - t0 < maxMs) {
    const s = await st(page); if (s.camIn && log.camIn.length < 5) log.camIn.push(s.camIn); log.maxLean = Math.max(log.maxLean, Math.abs(s.lean ?? 0));
    if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await sleep(40); continue; } break; }
    const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18;
    await press(pred > 0.03 ? 'KeyA' : pred < -0.03 ? 'KeyD' : null);   // inclina a la derecha → corrige a la izquierda (A)
    if (crouch && s.warned && !ch) { ch = true; await page.keyboard.down('KeyC'); }
    await sleep(25);
  }
  await press(null); if (ch) await page.keyboard.up('KeyC');
  return log;
}
async function toFennec(page, R) {
  await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.skateTutorial'); g.input.clear(); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); });
  R.fixture('ANMI en la zona de la charla con Fennec (arriba del puente)', {});
  await sleep(500);
}
async function talkAndStart(page) {
  // HABLAR (tres frases con su botón) → EMPEZAR GRIND (la segunda vez directamente EMPEZAR)
  for (let i = 0; i < 8; i++) { const s = await st(page); if (s.dialog) { await page.click('#dialog-ok'); await sleep(250); continue; }
    if (s.action && /EMPEZAR|REPETIR/.test(s.action)) { await page.keyboard.press('KeyE'); await sleep(300); return true; }
    if (s.action && /HABLAR/.test(s.action)) { await page.keyboard.press('KeyE'); await sleep(450); continue; } await sleep(250); }
  return false;
}
await runTest(R, async () => {
  const b = await launch();
  try {
    if (CASES.includes('A')) { const page = await openGame(b, R, { save: null }); await clickStart(page); await toFennec(page, R);
      const ok = await talkAndStart(page); const s0 = await st(page); const t0 = Date.now(); let s = s0;
      while (Date.now() - t0 < 12000) { s = await st(page); if (s.fails > 0 && s.phase === 'off') break; await sleep(100); }
      R.check(ok && s.fails === 1 && s.phase === 'off' && !s.done && JSON.stringify(s.col) === JSON.stringify(s0.col), `A · sin equilibrar se cae en ${((Date.now() - t0) / 1000).toFixed(1)} s y vuelve arriba sin perder nada`, 'input', { s, ok });
      await page.close(); }
    if (CASES.includes('B')) { const page = await openGame(b, R, { save: null }); await clickStart(page); await toFennec(page, R);
      await talkAndStart(page); const log = await pilot(page, { crouch: false }); const s = await st(page);
      R.check(s.fails === 1 && !s.done, 'B · equilibrando pero sin agacharse: cae en el cruce bajo de la vuelta y no completa', 'input', { s, log });
      await page.close(); }
    for (const red of [false, true]) { const tag = red ? 'D' : 'C'; if (!CASES.includes(tag)) continue;
      const save = red ? { version: 5, migV10: 99, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, bridgeReached: false, finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: 7, saveEpoch: 'nvg', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: true, reducedMotionSet: true, orientation: 'auto', mouseLock: true }, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, bridgeHeard: { aissa: false, juseph: false }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: false, danceRounds: 0 } } : null;
      const page = await openGame(b, R, { save }); await clickStart(page); await toFennec(page, R);
      await talkAndStart(page); const log = await pilot(page, { crouch: true, maxMs: 40000 });
      let s = await st(page); const t0 = Date.now(); while (Date.now() - t0 < 6000 && !s.dialog) { await sleep(150); s = await st(page); }
      const tr = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); return a.trace.slice(); });
      const X = await page.evaluate(() => window.__bk.activities.find((x) => x.id === 'skateTutorial').R?.crossing?.lower_s ?? null);
      const perp = tr.every((p) => Math.abs(p.dh - Math.PI / 2) < 10 * Math.PI / 180);
      // R4: RG1 tiene curvas de radio ≈ 0,3 m en las ondas finales (la tangente gira hasta 18° cada 0,1 m): un giro grande por paso NO es un
      // salto si sigue a la tangente. «Salto» = el giro de la tabla en un paso se separa del giro de la tangente del rail en ese paso (> 3°)
      const geo = await page.evaluate((ss) => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); return ss.map((s) => { const t = a.R.tangent(s); return Math.atan2(t.x, t.z) + Math.PI / 2; }); }, tr.map((p) => p.s));
      const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
      let jump = 0, turnMax = 0; for (let i = 1; i < tr.length; i++) { const dm = wrap(tr[i].h - tr[i - 1].h), dg = wrap(geo[i] - geo[i - 1]); turnMax = Math.max(turnMax, Math.abs(dm)); jump = Math.max(jump, Math.abs(wrap(dm - dg))); }
      const slow = Math.min(...tr.map((p) => p.k)), atX = tr.filter((p) => X !== null && Math.abs(p.s - X) < 0.45);
      R.measure(`traza_${tag}`, { n: tr.length, slowMin: slow, saltoMax: jump, X, cruces: atX.length });
      R.check(s.done && s.ok >= 1, `${tag} · equilibrando y agachándose en el aviso: completa el grind`, 'input', { s, log });
      R.check(perp && tr.length > 50, `${tag} · tabla perpendicular a la tangente del tubo en todo el recorrido (|Δ − 90°| ≤ 10°, ${tr.length} muestras)`, 'input', { malos: tr.filter((p) => Math.abs(p.dh - Math.PI / 2) >= 10 * Math.PI / 180).slice(0, 4) });
      R.check(jump < 3 * Math.PI / 180, `${tag} · sin saltos de orientación: el giro por paso sigue a la tangente de RG1 (desvío máx ${(jump * 180 / Math.PI).toFixed(1)}°; giro máx ${(turnMax * 180 / Math.PI).toFixed(1)}°/paso)`, 'input');
      R.check(atX.length > 0 && atX.every((p) => p.cr), `${tag} · agachada al pasar bajo el cruce de la vuelta`, 'input', { atX: atX.slice(0, 4) });
      R.check(red ? slow > 0.99 : slow <= 0.5, red ? 'D · con «reducir movimiento» no hay cámara lenta' : `C · cámara lenta en el aviso de la vuelta (factor mínimo ${slow.toFixed(2)})`, 'input');
      R.check(log.camIn.length === 0, `${tag} · la cámara del grind nunca dentro de geometría`, 'input', log.camIn);
      if (!red) {
        R.check(!!s.dialog && s.dialog.includes('Miau! (Wow, aquí tienes tu regalo!'), 'C · Fennec abajo dice la frase final literal', 'input', { dialog: s.dialog });
        await page.click('#dialog-ok').catch(() => {}); await sleep(900);
        const fen = await page.evaluate(() => { const g = window.__bk, f = g.npcs.get('fennec')?.[0], a = g.manifest.get('nv.fennec.bottom'); return { n: g.npcs.get('fennec')?.length ?? 0, d: f ? Math.hypot(f.root.position.x - a.pos.x, f.root.position.z - a.pos.z) : null,
          fry: g.pickups.filter((p) => p.id === 'nosvamosdeaqui.activity').map((p) => ({ av: p.available, col: p.collected, pos: p.spawn.pos.toArray() })) }; });
        R.check(fen.n === 1 && fen.d !== null && fen.d < 0.2, 'C · un solo Fennec, ahora abajo junto a la salida', 'input', fen);
        R.check(fen.fry.length === 1 && fen.fry[0].av && !fen.fry[0].col, 'C · la patata premio aparece (recogida física pendiente)', 'input', fen.fry);
        // recogerla andando (piloto de tools/v4) y recargar
        const { Pilot } = await import('../v4/pilot.mjs'); const P = new Pilot(page, R); await P.buildNav(); const fp = fen.fry[0].pos;
        await P.walkTo([fp[0], fp[2]], { tol: 0.4, maxMs: 30000 }); await sleep(800);
        const col = await page.evaluate(() => window.__bk.state.p.collected.includes('nosvamosdeaqui.activity'));
        R.check(col, 'C · la patata premio se recoge andando hasta ella', 'input');
        await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await page.click('#btn-start'); await sleep(2500);
        const after = await page.evaluate(() => { const g = window.__bk, f = g.npcs.get('fennec')?.[0], a = g.manifest.get('nv.fennec.bottom'); return { done: g.state.p.activities.skateTutorial, col: g.state.p.collected.filter((c) => c === 'nosvamosdeaqui.activity').length, fen: f ? Math.hypot(f.root.position.x - a.pos.x, f.root.position.z - a.pos.z) : null, nfen: g.npcs.get('fennec')?.length ?? 0, avail: g.pickups.filter((p) => p.id === 'nosvamosdeaqui.activity' && !p.collected).length }; });
        R.check(after.done && after.col === 1 && after.avail === 0 && (after.fen === null || after.fen < 0.2) && after.nfen <= 1, 'C · tras recargar: actividad hecha, premio recogido una vez, sin duplicado, Fennec abajo', 'fixture', after);
      }
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
