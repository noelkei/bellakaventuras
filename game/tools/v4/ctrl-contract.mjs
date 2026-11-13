// V4-CTRL-01…05 · Contrato de conducción local con entrada real (teclado CDP, mando simulado por la API del juego, toque).
// Fixture declarada: colocar a ANMI en el disco central (recta libre de ~30 m hacia +X) para medir sin obstáculos.
// Todo lo demás es entrada normal: teclas W/A/S/D/Q/J/L/Espacio pulsadas de verdad sobre el bucle RAF del juego.
// Mide: giro sin traslación, invariancia de cámara, toggle explícito (sin automontaje), empuje sostenido 0→crucero,
// coast sin desmontar, freno → zona neutra → reversa, W frena la reversa, bajada denegada a velocidad, W+S neutro,
// diagonal sin pérdida de propulsión, salto durante el montaje (no se pierde), autorepeat de Q (un solo cambio).
import { Report, runTest, launch, openGame, clickStart, snap, sleep, holdKeys, VIEWPORTS } from './lib.mjs';

const R = new Report('CTRL', 'ctrl-contract');
const place = (page, x, z, heading, loco = 'walk') => page.evaluate((x, z, h, loco) => {
  const g = window.__bk, s = g.skater, T = window.__bkTHREE;
  s.teleport(new T.Vector3(x, 0, z), h, loco); g.rig.snapBehind(s); g.input.clear();
  return { x, z, h, loco };
}, x, z, heading, loco);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angd = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    const start = await snap(page);
    R.check(start.loco === 'walk', 'estado inicial a pie (tabla en la mano)', 'input', { loco: start.loco });

    // ------------------------------------------------ 1. A/D solas: giran sin trasladar (a pie y en tabla parada)
    for (const loco of ['walk', 'ride']) {
      R.fixture(`giro-${loco}: disco central (-15,0) mirando +X`, await place(page, -15, 0, Math.PI / 2, loco));
      await sleep(250);
      const a = await snap(page);
      const sm = await holdKeys(page, ['KeyD'], 900, { every: 100 });
      const b = await snap(page);
      R.check(dist(a, b) < 0.06 && Math.abs(angd(b.heading, a.heading)) > 1.0, `${loco}: D sola gira (Δyaw>1 rad) sin desplazar (<6 cm)`, 'input',
        { move: +dist(a, b).toFixed(3), dYaw: +angd(b.heading, a.heading).toFixed(3), maxV: Math.max(...sm.map((q) => Math.hypot(q.vx, q.vz))) });
    }

    // ------------------------------------------------ 1b. sentido: D = horario visto desde arriba (rumbo decreciente), A = antihorario
    for (const [key, sign, label] of [['KeyD', -1, 'D gira a la derecha (horario visto desde arriba)'], ['KeyA', 1, 'A gira a la izquierda (antihorario)']]) {
      for (const loco of ['walk', 'ride']) {
        await place(page, -15, -7, Math.PI / 2, loco); await sleep(200);
        const a = await snap(page); await holdKeys(page, [key], 300, { every: 60 }); const b = await snap(page);
        const d = angd(b.heading, a.heading);
        R.check(Math.sign(d) === sign && Math.abs(d) > 0.3 && Math.abs(d) < 1.6, `${loco}: ${label}`, 'input', { dYaw: +d.toFixed(3) });
      }
    }
    // la cámara detrás ve girar a ANMI hacia el lado de la tecla: el frente rota hacia el vector derecho de la cámara
    await place(page, -15, -7, Math.PI / 2, 'walk'); await sleep(300);
    const side = await page.evaluate(async () => {
      const g = window.__bk, T = window.__bkTHREE, s = g.skater;
      const camRight = new T.Vector3(); g.rig.cam.getWorldDirection(camRight); camRight.set(-camRight.z, 0, camRight.x).normalize();
      return { camRight: [camRight.x, camRight.z], f0: [Math.sin(s.heading), Math.cos(s.heading)] };
    });
    await holdKeys(page, ['KeyD'], 250, { every: 50 });
    const f1 = await page.evaluate(() => { const s = window.__bk.skater; return [Math.sin(s.heading), Math.cos(s.heading)]; });
    const toward = (f1[0] - side.f0[0]) * side.camRight[0] + (f1[1] - side.f0[1]) * side.camRight[1];
    R.check(toward > 0.05, 'con la cámara detrás, D lleva el frente hacia la DERECHA de la pantalla', 'input', { toward: +toward.toFixed(3) });

    // ------------------------------------------------ 2. W a pie: avanza hacia su frente; cámara de frente no invierte
    R.fixture('walk: disco central, cámara orbitada ~180° (de frente a ANMI) con J', await place(page, -15, 0, Math.PI / 2, 'walk'));
    await holdKeys(page, ['KeyJ'], 1500, { every: 150 });
    const cam = await snap(page);
    const camVsFront = Math.abs(angd(cam.camYaw, cam.heading));
    const w0 = await snap(page);
    const ws = await holdKeys(page, ['KeyW'], 1600, { every: 100 });
    const w1 = ws.at(-1);
    const mvDir = Math.atan2(w1.x - w0.x, w1.z - w0.z);
    R.check(Math.abs(angd(mvDir, w0.heading)) < 0.15 && dist(w0, w1) > 2, 'walk: W avanza hacia el frente de ANMI aunque la cámara la mire de frente', 'input',
      { camVsFrontRad: +camVsFront.toFixed(2), moved: +dist(w0, w1).toFixed(2), dirErr: +angd(mvDir, w0.heading).toFixed(3) });
    const maxWalk = Math.max(...ws.map((q) => q.vLong));
    R.check(maxWalk > 2.6 && maxWalk <= 3.05 && ws.every((q) => q.loco === 'walk'), 'walk: W sostenida no monta sola (sin automontaje) y llega a velocidad de andar (≤3,0 m/s)', 'input', { maxWalk, locos: [...new Set(ws.map((q) => q.loco))] });

    // ------------------------------------------------ 3. S a pie: frena y luego marcha atrás conservando el frente
    await sleep(600);
    const wb = await holdKeys(page, ['KeyS'], 1200, { every: 100 });
    R.check(wb.some((q) => q.state === 'walk_back' && q.vLong < -0.6) && Math.abs(angd(wb.at(-1).heading, w0.heading)) < 0.05, 'walk: S retrocede despacio con el frente conservado', 'input',
      { minV: Math.min(...wb.map((q) => q.vLong)), states: [...new Set(wb.map((q) => q.state))] });

    // ------------------------------------------------ 4. Q monta (sin regalar velocidad) y autorepeat no duplica
    R.fixture('mount: disco central parado (−19,−7), recta libre hacia +X que no pasa por el cassette central', await place(page, -19, -7, Math.PI / 2, 'walk'));
    await sleep(300);
    await page.keyboard.down('KeyQ'); await sleep(700);    // mantener Q: el navegador repetiría keydown; debe contar una vez
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', repeat: true })); });
    await sleep(100); await page.keyboard.up('KeyQ');
    await sleep(300);
    const m1 = await snap(page);
    const ev = await page.evaluate(() => window.__bk.skater.events.filter((e) => /loco:(mount|dismount|ride|walk)/.test(e.e)).map((e) => e.e));
    R.check(m1.loco === 'ride' && Math.abs(m1.vLong) < 0.2, 'Q: monta una vez y queda parado en la tabla (sin 1,4 m/s regalados)', 'input', { loco: m1.loco, v: m1.vLong, events: ev.slice(-4) });

    // ------------------------------------------------ 5. W sostenida: empuja repetidamente hasta crucero; medición 0→crucero
    const p0 = await snap(page);
    const push = await holdKeys(page, ['KeyW'], 3800, { every: 100 });
    const pushes = await page.evaluate(() => window.__bk.skater.events.length);
    const vmax = Math.max(...push.map((q) => q.vLong));
    const t8 = push.find((q) => q.vLong >= 8)?.clock;
    R.check(vmax > 8.2 && vmax < 9.6, 'ride: W sostenida repite empujes hasta crucero ~9 m/s (semilla 8,5–9,5) sin pasar del cap', 'input',
      { vmax, t0: p0.clock, t8: t8 ? +(t8 - p0.clock).toFixed(2) : null, dist: +dist(p0, push.at(-1)).toFixed(2), states: [...new Set(push.map((q) => q.state))] });

    // ------------------------------------------------ 6. soltar = coast: sigue montada y rodando; deceleración medida
    const c0 = await snap(page);
    await sleep(1500);
    const c1 = await snap(page);
    const coastDecel = (c0.vLong - c1.vLong) / (c1.clock - c0.clock);
    R.check(c1.loco === 'ride' && c1.vLong > 5 && coastDecel < 2.0, 'ride: soltar W rueda (coast) sin bajarse; deceleración suave', 'input', { v0: c0.vLong, v1: c1.vLong, decel: +coastDecel.toFixed(2), loco: c1.loco });

    // ------------------------------------------------ 7. Q a velocidad: denegado y NO se encola
    await page.keyboard.press('KeyQ'); await sleep(150);
    const toastTxt = await page.evaluate(() => document.getElementById('toast').textContent);
    await sleep(600);
    const q1 = await snap(page);
    R.check(q1.loco === 'ride' && /Frena/.test(toastTxt), 'ride: Q a velocidad se niega con «Frena para bajar» y no se encola', 'input', { loco: q1.loco, toast: toastTxt, v: q1.vLong });

    // ------------------------------------------------ 8. A/D en marcha no aceleran
    const t0 = await snap(page);
    const turn = await holdKeys(page, ['KeyA'], 700, { every: 70 });
    const vInc = Math.max(...turn.map((q) => Math.hypot(q.vx, q.vz))) - Math.hypot(t0.vx, t0.vz);
    R.check(vInc < 0.05, 'ride: A en marcha gira sin aumentar la velocidad', 'input', { vInc: +vInc.toFixed(3), dYaw: +angd(turn.at(-1).heading, t0.heading).toFixed(2) });

    // ------------------------------------------------ 9. S frena hasta 0, zona neutra y después reversa ≤ reverseMax
    const b0 = await snap(page);
    const br = await holdKeys(page, ['KeyS'], 2600, { every: 50 });
    const stopIdx = br.findIndex((q) => Math.abs(q.vLong) < 0.15);
    const stop = br[stopIdx];
    const revIdx = br.findIndex((q, i) => i > stopIdx && q.vLong < -0.2);
    const minRev = Math.min(...br.map((q) => q.vLong));
    R.check(stopIdx > 0 && stop && revIdx > stopIdx && minRev > -2.1 && minRev < -1.2, 'ride: S frena, se detiene, espera la intención y luego retrocede ≤2 m/s', 'input',
      { v0: b0.vLong, brakeDist: stop ? +dist(b0, stop).toFixed(2) : null, brakeTime: stop ? +(stop.clock - b0.clock).toFixed(2) : null,
        zeroHold: revIdx > 0 ? +(br[revIdx].clock - stop.clock).toFixed(2) : null, minRev });
    // ------------------------------------------------ 10. W durante la reversa: frena la marcha atrás y empuja adelante (sin girar ±π)
    const h0 = (await snap(page)).heading;
    const fw = await holdKeys(page, ['KeyW'], 1500, { every: 60 });
    const flips = fw.filter((q) => Math.abs(angd(q.heading, h0)) > 1).length;
    R.check(fw.at(-1).vLong > 0.8 && flips === 0, 'ride: W tras la reversa frena y luego avanza, sin voltear el frente', 'input', { vEnd: fw.at(-1).vLong, flips });

    // ------------------------------------------------ 11. W+S = neutro (no empuja)
    R.fixture('ride parado en el disco central', await place(page, -15, -7, Math.PI / 2, 'ride'));
    await sleep(300);
    const ns = await holdKeys(page, ['KeyW', 'KeyS'], 1000, { every: 100 });
    R.check(Math.max(...ns.map((q) => Math.abs(q.vLong))) < 0.1, 'ride: W+S a la vez = neutro (sin empuje ni reversa)', 'input', { maxAbsV: Math.max(...ns.map((q) => Math.abs(q.vLong))) });
    // ------------------------------------------------ 12. diagonal W+D: la propulsión no se reduce (sin normalizar)
    const dg = await holdKeys(page, ['KeyW', 'KeyD'], 2500, { every: 100 });
    const dvmax = Math.max(...dg.map((q) => q.vLong));
    R.check(dvmax > 6, 'ride: W+D empuja con propulsión completa mientras gira', 'input', { vmax: dvmax, dYaw: +angd(dg.at(-1).heading, dg[0].heading).toFixed(2) });

    // ------------------------------------------------ 13. bajar con Q tras frenar; salto pulsado durante el montaje no se pierde
    await holdKeys(page, ['KeyS'], 1300, { every: 100 }); // frena a 0 (y quizá algo de reversa)
    for (let i = 0; i < 30; i++) { const q = await snap(page); if (Math.abs(q.vLong) < 0.5) break; await sleep(100); }
    await page.keyboard.press('KeyQ'); await sleep(700);
    const off = await snap(page);
    R.check(off.loco === 'walk', 'ride parado: Q baja de la tabla', 'input', { loco: off.loco, v: off.vLong });
    await page.keyboard.press('KeyQ'); await sleep(120);
    await page.keyboard.press('Space');
    await sleep(800);
    const ev2 = await page.evaluate(() => window.__bk.skater.events.slice(-12).map((e) => e.e));
    R.check(ev2.includes('loco:ride') && ev2.includes('pop'), 'SALTO pulsado durante el montaje se ejecuta como ollie al terminar (META-A4-007)', 'input', { events: ev2 });

    // ------------------------------------------------ 14. mando simulado: stick X solo gira; Y arriba empuja; LB alterna
    R.fixture('mando simulado conectado (API fakePad del juego; emulación, no mando físico)', { mapping: 'standard' });
    R.fixture('walk parado en el disco central', await place(page, -15, 0, Math.PI / 2, 'walk'));
    const pad = (axes, pressed = []) => page.evaluate((axes, pressed) => { window.__bk.input.fakePad = { id: 'sim', connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) }; }, axes, pressed);
    await pad([0.9, 0, 0, 0]); const g0 = await snap(page); await sleep(800); const g1 = await snap(page);
    R.check(dist(g0, g1) < 0.06 && Math.abs(angd(g1.heading, g0.heading)) > 1, 'mando: stick X solo gira (sin traslación)', 'emulation', { move: dist(g0, g1), dYaw: angd(g1.heading, g0.heading) });
    await pad([0, 0, 0, 0], [4]); await sleep(120); await pad([0, 0, 0, 0]); await sleep(700);
    const g2 = await snap(page);
    R.check(g2.loco === 'ride', 'mando: LB sube a la tabla', 'emulation', { loco: g2.loco });
    await pad([0, -1, 0, 0]); await sleep(1500); const g3 = await snap(page);
    R.check(g3.vLong > 3 && Math.abs(angd(Math.atan2(g3.vx, g3.vz), g3.heading)) < 0.1, 'mando: stick Y arriba (eje −1) empuja hacia el frente', 'emulation', { v: g3.vLong });
    await page.evaluate(() => { window.__bk.input.fakePad = null; });
  } finally { await browser.close(); }

  // ------------------------------------------------ 15. táctil: botón TABLA (toque CDP en móvil emulado)
  const b2 = await launch();
  try {
    const page = await openGame(b2, R, { save: null, viewport: VIEWPORTS.phone });
    await clickStart(page);
    const before = await snap(page);
    const r = await page.evaluate(() => { const b = document.getElementById('btn-board').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: el?.id, label: document.getElementById('btn-board').textContent }; });
    await page.touchscreen.tap(r.x, r.y); await sleep(800);
    const after = await snap(page);
    const label = await page.evaluate(() => document.getElementById('btn-board').textContent);
    R.check(before.loco === 'walk' && after.loco === 'ride' && r.top === 'btn-board' && r.label === 'SUBIR' && label === 'BAJAR', 'táctil: TABLA recibe el toque, sube a la tabla y cambia a BAJAR', 'emulation', { before: before.loco, after: after.loco, hit: r.top, labels: [r.label, label] });
  } finally { await b2.close(); }
});
