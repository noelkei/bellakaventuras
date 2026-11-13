// R11 · F3 · centro y triple: CEN-02, CEN-01, MOV-09, PEN-01, FPS-03, EVT-01, SIS-12 (pasos fijos, teclas despachadas).
import { Report, runTest } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_20 } from './lib-r11.mjs';
const R = new Report('r11-f3-centro');
const S20 = { ...SAVE_20, revealSeen: true };
await runTest(R, async () => { const b = await launch(); try {
  const page = await openGame(b, R, { save: S20 }); await clickStart(page); await sleep(1200);
  for (let k = 1; k <= 2; k++) {
    const r = await page.evaluate(async (k) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, F = window.__bkTuning.final, fin = g.activities.find((a) => a.id === 'finalTriple'), out = {};
      const key = (code, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code }));
      const settle = async () => { if (g.mode === 'preview') g.closePreview(); for (let i = 0; i < 40 && (g.mode !== 'explore' || fin.phase !== 'idle'); i++) await g.simulate(0.2); };
      g.autoMode = true;
      // CEN-02: quieta 30 s en el ancla de reintento: ningún coche la golpea
      g.cars.setActive(true, 0); await settle(); const a = g.park.manifest.get('final.approach'); g.input.clear(); s.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(s);
      const h0 = g.carHits ?? 0; await g.simulate(30); out.cen02 = { anchorX: +a.pos.x.toFixed(2), hits: (g.carHits ?? 0) - h0 };
      g.cars.setActive(false, 0);   // el resto de casos sin coches (un coche en la carrerilla anula el intento: precondición, no fallo)
      // CEN-01: pasada sin SALTO a 8 m/s: sin teletransporte ni aviso de fallo; queda registrada en __bkFinalLog
      await settle(); g.input.clear(); s.teleport(new T.Vector3(F.approachX, 0.02, 0), Math.PI / 2, 'ride'); s.vel.set(8, 0, 0); g.rig.snapBehind(s);
      const fl0 = (window.__bkFinalLog ?? []).length; let jumps = 0, prev = s.footPos.clone(); const t0 = []; const toastEl = document.getElementById('toast'); let failToast = false;
      await g.simulate(6, () => { if (s.footPos.distanceTo(prev) > 1.5) jumps++; prev = s.footPos.clone(); if (!toastEl.hidden && /Sin SALTO arriba/.test(toastEl.textContent)) failToast = true; });
      out.cen01 = { jumps, failToast, logged: (window.__bkFinalLog ?? []).length - fl0 };
      // MOV-09: parada (y de espaldas) en tabla sobre el kicker: no la acelera
      await settle(); s.teleport(new T.Vector3(F.kickStartX + 1.5, 0.3, 0), Math.PI / 2, 'ride'); s.vel.set(0, 0, 0); await g.simulate(2); const v1 = Math.hypot(s.vel.x, s.vel.z);
      await settle(); s.teleport(new T.Vector3(F.kickStartX + 1.5, 0.3, 0), -Math.PI / 2, 'ride'); s.vel.set(0, 0, 0); await g.simulate(2); const v2 = Math.hypot(s.vel.x, s.vel.z);
      out.mov09 = { parada: +v1.toFixed(2), espaldas: +v2.toFixed(2) };
      // PEN-01: tras una pasada por la superrampa el punto seguro no queda sobre ella
      await settle(); s.teleport(new T.Vector3(F.approachX, 0.02, 0), Math.PI / 2, 'ride'); s.vel.set(8, 0, 0); key('KeyW', true); await g.simulate(2.2); key('KeyW', false); await g.simulate(1);
      const ls = s.lastSafe; out.pen01 = { lastSafe: [ls.x, ls.y, ls.z].map((v) => +v.toFixed(2)), sobreRampa: Math.abs(ls.z) < F.width / 2 + 0.6 && ls.x > F.kickStartX - 1.6 && ls.x < F.bankEndX + 0.6 };
      // FPS-03: SALTO en el primer paso de vuelo (sin haber armado) arma el triple
      await settle(); s.teleport(new T.Vector3(F.approachX, 0.02, 0), Math.PI / 2, 'ride'); s.vel.set(8, 0, 0); let pressed = false;
      const fl1 = (window.__bkFinalLog ?? []).length;
      await g.simulate(6, () => { if (!pressed && fin.phase === 'flight' && !fin.armed && !s.grounded && s.airTime > 0 && s.airTime < 0.1) { key('Space', true); key('Space', false); pressed = true; } });
      const last = (window.__bkFinalLog ?? []).slice(fl1).at(-1); out.fps03 = { pressed, armed: last?.armed ?? null, ok: last?.tripleOk ?? null };
      // EVT-01: recolocación por vacío durante el vuelo: el juego vuelve a explorar sin intento colgado
      await settle(); s.teleport(new T.Vector3(F.approachX, 0.02, 0), Math.PI / 2, 'ride'); s.vel.set(8, 0, 0); let rec = false, armedJ = false, modeAt = null;
      await g.simulate(4, () => { if (!armedJ && s.grounded && s.footPos.x >= F.lipX - 0.55) { key('Space', true); key('Space', false); armedJ = true; }
        if (!rec && fin.phase === 'flight' && fin.armed !== false && g.mode === 'final' && s.airTime > 0.3) { modeAt = g.mode; g.recover(); rec = true; } });
      await g.simulate(1.5); out.evt01 = { rec, modeAt, mode: g.mode, phase: fin.phase };
      return out; }, k);
    R.check(r.cen02.hits === 0, `#${k} CEN-02: quieta 30 s en el ancla de reintento (x ${r.cen02.anchorX}) ningún coche la golpea (${r.cen02.hits})`, 'input', r.cen02);
    R.check(r.cen01.jumps === 0 && !r.cen01.failToast && r.cen01.logged >= 1, `#${k} CEN-01: pasar sin SALTO no teletransporta ni avisa de fallo (y queda registrada)`, 'input', r.cen01);
    R.check(r.mov09.parada < 1 && r.mov09.espaldas < 1, `#${k} MOV-09: parada o de espaldas sobre el kicker no acelera (${r.mov09.parada}, ${r.mov09.espaldas} m/s)`, 'input', r.mov09);
    R.check(!r.pen01.sobreRampa, `#${k} PEN-01: tras pasar por la superrampa el punto seguro no queda sobre ella (${JSON.stringify(r.pen01.lastSafe)})`, 'input', r.pen01);
    if (!r.fps03.pressed) R.invalid(`#${k} FPS-03: no se llegó al primer paso de vuelo`, r.fps03); else R.check(r.fps03.armed === true, `#${k} FPS-03: SALTO en el primer paso de vuelo arma el triple`, 'input', r.fps03);
    if (!r.evt01.rec) R.invalid(`#${k} EVT-01: no se llegó al vuelo armado`, r.evt01); else R.check(r.evt01.mode === 'explore' && r.evt01.phase === 'idle', `#${k} EVT-01: recolocar durante el vuelo deja el juego en explorar sin intento colgado`, 'input', r.evt01);
  }
  // SIS-12: la revelación 20/20 no quita el control en el aire (espera a ANMI apoyada) y la deja quieta
  const page2 = await openGame(b, R, { save: S20 }); await clickStart(page2); await sleep(1200);
  const r2 = await page2.evaluate(async () => { const g = window.__bk, s = g.skater, T = window.__bkTHREE;
    g.autoMode = true; await g.simulate(0.3); if (g.mode !== 'explore') return { skip: true };
    g.state.p.revealSeen = false; g.centerOpen = false; g.cars.setActive(false, 0); g.revealT = -1;
    s.teleport(new T.Vector3(20, 0.02, -30), 0, 'ride'); s.vel.set(0, 0, 7); s.vy = 7; s.grounded = false; await g.simulate(0.05);
    g.beginReveal(); let modeAir = null; let maxSp = 0;
    await g.simulate(3, () => { if (modeAir === null && !s.grounded) modeAir = g.mode; if (g.mode === 'reveal') maxSp = Math.max(maxSp, Math.hypot(s.vel.x, s.vel.z)); });
    return { modeAir, maxSp: +maxSp.toFixed(2) }; });
  if (r2.skip) R.invalid('SIS-12: la revelación ya había empezado al cargar', r2); else R.check(r2.modeAir !== 'reveal' && r2.maxSp < 0.5, `SIS-12: la revelación espera a que ANMI toque suelo y la deja quieta (modo en el aire: ${r2.modeAir}; velocidad máx. ${r2.maxSp})`, 'input', r2);
} finally { await b.close(); } }, { timeoutMs: 900000 });
