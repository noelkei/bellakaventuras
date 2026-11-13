// R11 · F4 · escaleras y entrada mantenida: TT-03, FG-09, TT-02, MIX-01; bajar de la tabla con stick (TAC-01); AGACHARSE táctil (TAC-02).
import { Report, runTest } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_20 } from './lib-r11.mjs';
const R = new Report('r11-f4-latch');
await runTest(R, async () => { const b = await launch(); try {
  const page = await openGame(b, R, { save: { ...SAVE_20, revealSeen: true } }); await clickStart(page); await sleep(1200);
  // sube (o baja) una escalera con la dirección mantenida y la sigue manteniendo `extra` s tras desembarcar
  const escalera = (zone, code, extra, segunda = false) => page.evaluate(async (zone, code, extra, segunda) => {
    const g = window.__bk, T = window.__bkTHREE, s = g.skater, lad = g.activities.find((a) => a.id === 'ladderClimb');
    const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, key: c }));
    g.autoMode = true; g.input.clear(); const z = g.park.zones.get(zone); s.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.52, z.pos.z), 0, 'walk'); g.rig.snapBehind(s); await g.simulate(0.4);
    const run = async () => { if (segunda) key(code, true); key('KeyE', true); key('KeyE', false); await g.simulate(0.3); key(code, true); let t = 0, firstU = null;
      while (t < 14 && (lad.busy || t < 0.5)) { await g.simulate(0.1); t += 0.1; if (firstU === null && lad.phase === 'topout') firstU = lad.u; }
      const yArr = s.footPos.y; await g.simulate(extra); key(code, false); await g.simulate(0.3); return { yArr: +yArr.toFixed(2), yEnd: +s.footPos.y.toFixed(2), firstTopoutU: firstU === null ? null : +firstU.toFixed(3), t: +t.toFixed(1) }; };
    if (!segunda) return run();
    const a = await run(); g.input.clear(); s.teleport(new T.Vector3(z.pos.x, (z.yMin ?? 0) + 0.52, z.pos.z), 0, 'walk'); await g.simulate(0.4); const b2 = await run(); return { a, b: b2 };
  }, zone, code, extra, segunda);
  for (let k = 1; k <= 2; k++) {
    const ev2 = await escalera('act.ladderFoot.EV2', 'KeyW', 1.5);
    R.check(ev2.yArr > 7.0 && ev2.yEnd > 7.0, `#${k} TT-03: subir EV2 con W mantenida 1,5 s tras llegar: sigue en el techo de la limo (y ${ev2.yArr} → ${ev2.yEnd})`, 'input', ev2);
    const fg = await escalera('act.ladderFoot', 'KeyW', 1.5);
    R.check(fg.yArr > 1.6 && fg.yEnd > 1.6, `#${k} FG-09: subir la escalera de FG con W mantenida 1,5 s tras llegar: sigue en el deck (y ${fg.yArr} → ${fg.yEnd})`, 'input', fg);
    const ev1 = await escalera('act.ladderTop.EV1', 'KeyS', 1.6);
    R.check(ev1.yArr > 1.0 && ev1.yEnd > 1.0, `#${k} TT-02: bajar EV1 con S mantenida 1,6 s tras llegar: sigue en el camino inferior (y ${ev1.yArr} → ${ev1.yEnd})`, 'input', ev1);
    const dos = await escalera('act.ladderFoot', 'KeyW', 0.5, true);
    const us = [fg.firstTopoutU, dos.a.firstTopoutU, dos.b.firstTopoutU];
    R.check(us.every((u) => u === null || u > 0.5), `#${k} MIX-01: tras otra subida, trepar con ↑ pulsada sube entera (topout en u ${JSON.stringify(us)})`, 'input', { us, dos });
  }
  // TAC-01: con mando, BAJAR (LB) a 2,5 m/s frena sola y baja
  for (let k = 1; k <= 2; k++) {
    const r = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.autoMode = true;
      g.input.fakePad = { id: 'r11', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      s.teleport(new T.Vector3(20, 0.02, -30), 0, 'ride'); s.vel.set(0, 0, 2.5); await g.simulate(0.1);
      g.input.fakePad.axes = [0, 1, 0, 0]; await g.simulate(1.6);   // stick abajo: frena… y pasa a marcha atrás
      const vAntes = +s.vLong.toFixed(2);
      g.input.fakePad.buttons[4].pressed = true; await g.simulate(0.1); g.input.fakePad.buttons[4].pressed = false; await g.simulate(2.5); g.input.fakePad.axes = [0, 0, 0, 0];
      const out = { loco: s.loco, vAntes }; g.input.fakePad = null; return out; });
    R.check(r.loco === 'walk', `#${k} TAC-01: con mando, frenando con el stick abajo (vLong ${r.vAntes}) BAJAR baja de la tabla (${r.loco})`, 'input', r);
  }
  // TAC-02: AGACHARSE (alternancia táctil) se apaga al salir 2 m de un paso bajo
  for (let k = 1; k <= 2; k++) {
    // V10 (cambio de diseño aprobado): el túnel del circuito (`tut.tunnel`) pasa a ser el paso agachado T1 de NOSVAMOSDEAQUÍ (`nv.t1`, el paso
    // va por su eje local x): se sale por una boca, 2,5 m más allá del final del techo
    const r = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, old = g.park.boxes.get('tut.tunnel'), bx = old ?? g.park.boxes.get('nv.t1'); g.autoMode = true;
      g.input.crouchToggle = true; s.teleport(new T.Vector3(bx.c.x, 0.02, bx.c.z), 0, 'walk'); await g.simulate(0.6);
      const under = !s.headroomFree(s.footPos);
      const out = old ? [Math.sin(bx.yaw) * 6, Math.cos(bx.yaw) * 6] : [Math.cos(bx.yaw) * (bx.h.x + 2.5), -Math.sin(bx.yaw) * (bx.h.x + 2.5)];
      s.teleport(new T.Vector3(bx.c.x + out[0], 0.02, bx.c.z + out[1]), 0, 'walk'); await g.simulate(0.6);
      const r = { under, toggle: g.input.crouchToggle }; g.input.crouchToggle = false; return r; });
    if (!r.under) R.invalid(`#${k} TAC-02: no se llegó a estar bajo techo`, r); else R.check(!r.toggle, `#${k} TAC-02: la alternancia de AGACHARSE se apaga al salir del paso bajo`, 'input', r);
  }
} finally { await b.close(); } }, { timeoutMs: 900000 });
