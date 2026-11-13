// V7 R8 · modo ratón (escritorio): puntero capturado con JUGAR, cámara con el ratón SIN clic, marcha respecto a la vista con paso
// lateral (A/D), tabla que gira hacia la vista, vuelta automática al modo teclado, Esc/«Seguir», diálogos y ajustes.
// Entradas reales: ratón y teclado por CDP (Pointer Lock real de Chrome; los eventos llevan movementX/Y). Fixtures: colocación de
// ANMI (declaradas en el informe). Con `?bktest=1` el juego NO captura el puntero (suites de teclado intactas): aquí se usa
// `?bktest=1&bkmouse=1`.
//  A · JUGAR captura el puntero sin clics extra; mover el ratón (sin botón) gira la cámara y activa el modo ratón con aviso.
//  B · a pie: quieta, la cámara orbita sin girar a ANMI; W va hacia la vista y ANMI se orienta a ella; D/A = paso lateral sin
//      girar (piernas hacia la marcha, tronco al frente); W+D diagonal; S atrás; girar el ratón andando reorienta la marcha.
//  C · en tabla: con W la tabla gira hacia la vista; parada sin W no pivota; D gira la tabla y la vista la acompaña (al soltar no
//      vuelve atrás).
//  D · vuelta al modo teclado: D antes de 4 s sin ratón sigue siendo lateral; tras ≥ 4 s, D devuelve el modo teclado (aviso) y
//      gira; mover el ratón lo recupera; J/L lo devuelve al momento.
//  E · Esc suelta el puntero y pausa; «Seguir» lo recaptura. Un diálogo (La Pantera) lo suelta y al cerrarlo se recaptura (o un
//      clic en el juego lo hace). Ajuste «Ratón» desactivado: no se captura.
//  F · sin `bkmouse` (y en teléfono) no se captura nada y el ajuste no aparece.
// Uso: node game/tools/v7/ux-mouse.mjs --url v7 --task R8
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS } from './lib.mjs';

const R = new Report('ux-mouse');
const D = (r) => Math.round(r * 1800 / Math.PI) / 10;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const st = (page) => page.evaluate(() => {
  const g = window.__bk, s = g.skater, i = g.input, h = s.heading;
  const f = s.vel.x * Math.sin(h) + s.vel.z * Math.cos(h), r = -s.vel.x * Math.cos(h) + s.vel.z * Math.sin(h);
  return { lockEl: document.pointerLockElement?.id ?? null, locked: i.locked, mm: i.mouseMode, ml: i.mouseLook, yaw: g.rig.yaw, heading: h, loco: s.loco,
    x: s.footPos.x, z: s.footPos.z, vx: s.vel.x, vz: s.vel.z, hv: Math.hypot(s.vel.x, s.vel.z), fwd: f, lat: r, strafe: g.visual?.strafeYaw ?? null,
    paused: g.paused, mode: g.mode, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent, stats: { ...i.mouseStats } };
});

await runTest(R, async () => {
  const b = await launch();
  try {
    // ------------------------------------------------ F (primero): sin bkmouse y en teléfono no hay captura
    for (const vp of ['desktop', 'phone']) {
      const page = await openGame(b, R, vp === 'phone' ? { viewport: VIEWPORTS.phone } : {}); await clickStart(page); await sleep(700);
      await page.mouse.move(500, 400); await page.mouse.move(620, 420, { steps: 6 }); await sleep(300);
      const s = await st(page); const row = await page.evaluate(() => document.getElementById('opt-mouse-row').hidden);
      R.check(!s.lockEl && !s.locked && !s.mm && row, `${vp} con ?bktest=1 (sin bkmouse): no se captura el puntero, no hay modo ratón y el ajuste no aparece`, 'input', { ...s, ajusteOculto: row });
      await page.close();
    }

    const page = await openGame(b, R, { query: '?bktest=1&bkmouse=1' });
    // cursor virtual: con el puntero capturado solo cuenta el desplazamiento (movementX/Y)
    const cur = { x: 640, y: 400 };
    await page.mouse.move(cur.x, cur.y);
    const turn = async (dx, dy = 0, steps = 12) => { cur.x += dx; cur.y += dy; await page.mouse.move(cur.x, cur.y, { steps }); await sleep(60); };
    // ------------------------------------------------ A. JUGAR captura; ratón sin botón = cámara + modo ratón
    await clickStart(page); await sleep(500);
    // avisos mostrados (el aviso de zona puede sustituir al de modo después: se registran todos)
    await page.evaluate(() => { window.__toasts = []; const el = document.getElementById('toast'); new MutationObserver(() => { if (!el.hidden) window.__toasts.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true }); });
    const toasts = () => page.evaluate(() => window.__toasts.splice(0));
    let s = await st(page);
    R.check(s.lockEl === 'game' && s.locked && !s.mm, 'A: JUGAR captura el puntero (sin clics extra) y aún no hay modo ratón', 'input', s);
    const flat = await page.evaluate(() => { const z = window.__bk.park.zones.get('act.pantherTalk'); return [z.pos.x, 0, z.pos.z]; });
    const open = [-14, 0, -2];
    await place(page, R, open, 0, 'walk', 'A llano'); await sleep(500);
    s = await st(page); const y0 = s.yaw, h0 = s.heading; await toasts();
    await turn(-180); await sleep(250); s = await st(page); s.toast = (await toasts()).join(' | ');
    R.check(s.mm && s.ml && /Cámara: ratón/.test(s.toast) && Math.abs(D(wrap(s.yaw - y0)) - D(180 * 0.0032)) <= 4,
      'A: mover el ratón SIN pulsar gira la cámara (≈ 33° por 180 px) y activa el modo ratón con el aviso «Cámara: ratón»', 'input', { ...s, giroCam: D(wrap(s.yaw - y0)) });
    // ------------------------------------------------ B. a pie
    R.check(Math.abs(D(wrap(s.heading - h0))) <= 1, 'B: quieta, girar la cámara no gira a ANMI (órbita libre)', 'input', { giroANMI: D(wrap(s.heading - h0)) });
    await page.keyboard.down('KeyW'); await sleep(1500); s = await st(page);
    const mvW = Math.atan2(s.vx, s.vz);
    R.check(Math.abs(D(wrap(s.heading - s.yaw))) <= 6 && Math.abs(D(wrap(mvW - s.yaw))) <= 8 && s.hv > 2.4, 'B: W anda hacia la vista y ANMI se orienta a ella', 'input', { frenteVsVista: D(wrap(s.heading - s.yaw)), marchaVsVista: D(wrap(mvW - s.yaw)), hv: s.hv });
    // girar el ratón andando reorienta la marcha
    const yb = s.yaw; await turn(300, 0, 20); await sleep(700); s = await st(page);
    R.check(Math.abs(D(wrap(s.yaw - yb))) > 40 && Math.abs(D(wrap(s.heading - s.yaw))) <= 8 && Math.abs(D(wrap(Math.atan2(s.vx, s.vz) - s.yaw))) <= 10,
      'B: girando el ratón con W, ANMI y la marcha siguen a la vista', 'input', { giroVista: D(wrap(s.yaw - yb)), frenteVsVista: D(wrap(s.heading - s.yaw)) });
    await page.keyboard.up('KeyW'); await sleep(900);
    for (const [key, sign] of [['KeyD', 1], ['KeyA', -1]]) {
      await place(page, R, open, 0.6, 'walk', `B lateral ${key}`); await sleep(400); await turn(8); await turn(-8); await sleep(200);
      const a = await st(page);
      await page.keyboard.down(key); await sleep(1300); const m = await st(page);
      if (key === 'KeyD') await R.shot(page, 'lateral_D');
      await page.keyboard.up(key); await sleep(700);
      const disp = [m.x - a.x, m.z - a.z], right = [-Math.cos(a.yaw), Math.sin(a.yaw)];
      const along = (disp[0] * right[0] + disp[1] * right[1]) * sign, hd = D(wrap(m.heading - a.heading));
      R.check(along > 1.5 && Math.abs(hd) <= 6 && Math.abs(m.lat) > 2.0 && Math.abs(m.fwd) < 0.4,
        `B: ${key === 'KeyD' ? 'D' : 'A'} = paso lateral a la ${key === 'KeyD' ? 'derecha' : 'izquierda'} de la vista sin girar a ANMI`, 'input', { lateralM: +along.toFixed(2), giroANMI: hd, lat: m.lat, fwd: m.fwd });
      R.check(m.strafe !== null && Math.sign(m.strafe) === -sign && Math.abs(D(m.strafe)) >= 55 && Math.abs(D(m.strafe)) <= 71,
        `B: ${key === 'KeyD' ? 'D' : 'A'}: piernas hacia la marcha (50–70°, procedural) con el tronco al frente`, 'vision', { strafeDeg: m.strafe === null ? null : D(m.strafe) });
    }
    // diagonal y atrás
    await place(page, R, open, 0.6, 'walk', 'B diagonal'); await sleep(400); await turn(8); await turn(-8);
    await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await sleep(1300); s = await st(page);
    await R.shot(page, 'diagonal_WD');
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW'); await sleep(700);
    const diagAng = D(Math.atan2(s.lat, s.fwd));
    R.check(diagAng >= 30 && diagAng <= 48 && Math.abs(D(s.strafe)) >= 25 && Math.abs(D(s.strafe)) <= 48 && s.strafe < 0, 'B: W+D = diagonal adelante-derecha (≈ 39°) con piernas hacia la marcha', 'input', { marchaDeg: diagAng, strafeDeg: D(s.strafe) });
    await place(page, R, open, 0.6, 'walk', 'B atrás'); await sleep(400); await turn(8); await turn(-8);
    await page.keyboard.down('KeyS'); await sleep(1200); s = await st(page); await page.keyboard.up('KeyS'); await sleep(600);
    R.check(s.fwd < -1.2 && s.fwd > -1.7 && Math.abs(D(wrap(s.heading - s.yaw))) <= 6 && Math.abs(D(s.strafe)) < 8, 'B: S = atrás respecto a la vista (≤ 1,6 m/s) mirando al frente', 'input', { fwd: s.fwd, frenteVsVista: D(wrap(s.heading - s.yaw)), strafeDeg: D(s.strafe) });
    // ------------------------------------------------ C. en tabla
    await place(page, R, open, 0, 'ride', 'C tabla'); await sleep(600); await turn(8); await turn(-8);
    s = await st(page); const hr0 = s.heading;
    await turn(-500, 0, 20); await sleep(800); s = await st(page);
    R.check(Math.abs(D(wrap(s.heading - hr0))) <= 2 && Math.abs(D(wrap(s.yaw - hr0))) >= 80, 'C: en tabla PARADA, girar la cámara no pivota la tabla (se puede mirar alrededor)', 'input', { giroTabla: D(wrap(s.heading - hr0)), giroVista: D(wrap(s.yaw - hr0)) });
    await page.keyboard.down('KeyW'); await sleep(1800); s = await st(page);
    R.check(Math.abs(D(wrap(s.heading - s.yaw))) <= 10 && s.hv > 3, 'C: con W la tabla gira hacia la vista y empuja hacia allí', 'input', { tablaVsVista: D(wrap(s.heading - s.yaw)), hv: s.hv });
    const yc = s.yaw; await turn(250, 0, 16); await sleep(1300); s = await st(page);
    R.check(Math.abs(D(wrap(s.heading - s.yaw))) <= 10 && Math.abs(D(wrap(s.yaw - yc))) >= 35, 'C: girando el ratón rodando, la tabla gira hacia la nueva vista', 'input', { tablaVsVista: D(wrap(s.heading - s.yaw)), giroVista: D(wrap(s.yaw - yc)) });
    // (sin W, rodando: a la velocidad de empuje sostenido la curva de D llevaba a ANMI contra el mobiliario y el roce realinea la tabla)
    await page.keyboard.up('KeyW'); await sleep(300);
    s = await st(page); const hd0 = s.heading, yd0 = s.yaw; await page.keyboard.down('KeyD'); await sleep(700); const sd = await st(page); await page.keyboard.up('KeyD'); await sleep(900); const sa = await st(page);
    R.check(Math.abs(D(wrap(sd.heading - hd0))) >= 25 && Math.abs(D(wrap(sd.yaw - sd.heading))) <= 15 && Math.abs(D(wrap(sa.heading - sd.heading))) <= 12 && Math.abs(D(wrap(sa.yaw - sa.heading))) <= 10,
      'C: D sigue girando la tabla, la vista la acompaña y al soltar la tabla no vuelve hacia la vista vieja', 'input',
      { giroD: D(wrap(sd.heading - hd0)), giroVista: D(wrap(sd.yaw - yd0)), vistaVsTabla: D(wrap(sd.yaw - sd.heading)), trasSoltar: D(wrap(sa.heading - sd.heading)), hvAlSoltar: sd.hv, final: { x: sa.x, z: sa.z, hv: sa.hv } });
    await page.keyboard.press('KeyS'); await page.keyboard.down('KeyS'); await sleep(1500); await page.keyboard.up('KeyS');
    // ------------------------------------------------ D. vuelta al modo teclado
    await place(page, R, open, 0.6, 'walk', 'D teclado'); await sleep(300); await turn(10); await turn(-10);
    await sleep(1500); await page.keyboard.down('KeyD'); await sleep(500); s = await st(page); await page.keyboard.up('KeyD');
    R.check(s.mm && Math.abs(s.lat) > 0.8, 'D: D a los 1,5 s sin ratón sigue siendo paso lateral (modo ratón)', 'input', { mm: s.mm, lat: s.lat });
    await page.keyboard.down('KeyW'); await sleep(4300);
    const hk = (await st(page)).heading; await page.keyboard.down('KeyD'); await sleep(250); s = await st(page);
    await sleep(500); const s2 = await st(page); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW'); await sleep(500);
    R.check(!s.mm && /Cámara: teclado/.test((await toasts()).join(' | ') + s.toast) && s.stats.why === 'teclado-sin-raton' && Math.abs(D(wrap(s2.heading - hk))) >= 60 && Math.abs(s2.lat) < 0.4,
      'D: tras ≥ 4 s solo con teclado, D devuelve el modo teclado (aviso «Cámara: teclado») y gira a ANMI', 'input', { mm: s.mm, toast: s.toast, why: s.stats.why, giro: D(wrap(s2.heading - hk)), lat: s2.lat });
    await turn(30); await sleep(200); s = await st(page);
    R.check(s.mm && s.ml, 'D: volver a mover el ratón recupera el modo ratón (sin reiniciar nada)', 'input', s);
    await page.keyboard.down('KeyJ'); await sleep(200); await page.keyboard.up('KeyJ'); s = await st(page);
    R.check(!s.mm && s.stats.why === 'teclas-camara', 'D: J/L/I/K (cámara con teclado) devuelve el modo teclado al momento', 'input', s);
    await turn(30); await sleep(200);
    // ------------------------------------------------ E. Esc, «Seguir», diálogos, ajustes
    await page.keyboard.press('Escape'); await sleep(500); s = await st(page);
    const pauseOpen = await page.evaluate(() => !document.getElementById('pause').hidden);
    R.check(!s.locked && s.paused && pauseOpen, 'E: Esc suelta el puntero y pausa (menú visible)', 'input', { ...s, pauseOpen });
    await page.click('#btn-resume'); await sleep(600); s = await st(page);
    R.check(s.locked && !s.paused && s.ml, 'E: «Seguir» recaptura el puntero y el modo ratón sigue activo', 'input', s);
    await place(page, R, flat, 0, 'walk', 'E diálogo'); await sleep(700);
    await page.keyboard.press('KeyE'); await sleep(900); s = await st(page);
    R.check(s.mode === 'activity' && !s.locked, 'E: al abrir el diálogo de La Pantera se suelta el puntero (se puede pulsar el botón)', 'input', s);
    await page.click('#dialog-ok').catch(() => {}); await sleep(2500); s = await st(page);
    let relock = s.locked ? 'solo' : 'clic';
    if (!s.locked && s.mode === 'explore') { await page.mouse.click(900, 300); await sleep(500); s = await st(page); }
    R.check(s.mode === 'explore' && s.locked, 'E: al cerrar el diálogo el puntero vuelve a capturarse (solo o con un clic en el juego)', 'input', { ...s, relock });
    await page.keyboard.press('KeyP'); await sleep(400);
    await page.click('#btn-settings'); await sleep(300);
    const shown = await page.evaluate(() => !document.getElementById('opt-mouse-row').hidden && document.getElementById('opt-mouse').checked);
    await page.click('#opt-mouse'); await sleep(200); await page.click('#btn-settings-close'); await sleep(200); await page.click('#btn-resume'); await sleep(600);
    await turn(60); await sleep(200); s = await st(page);
    const saved = await page.evaluate(() => window.__bk.state.p.settings.mouseLock);
    R.check(shown && !s.locked && !s.ml && saved === false, 'E: ajuste «Ratón» visible y activado por defecto; desactivado, al volver no se captura el puntero', 'input', { shown, ...s, saved });
    await page.keyboard.press('KeyP'); await sleep(300); await page.click('#btn-settings'); await sleep(200); await page.click('#opt-mouse'); await sleep(150);
    await page.click('#btn-settings-close'); await sleep(200); await page.click('#btn-resume'); await sleep(600); s = await st(page);
    R.check(s.locked, 'E: reactivado, «Seguir» vuelve a capturar el puntero', 'input', s);
    await page.close();
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
