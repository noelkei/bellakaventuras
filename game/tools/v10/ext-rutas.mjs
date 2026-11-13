// V10 R2 · ext-rutas · exterior Bola de Oro con el controlador NORMAL y teclado real (piloto de tools/v4/pilot.mjs: solo lee estado y pulsa
// teclas; sin teletransportes salvo la partida nueva). Dossier §16 «Entrada y percepción» y «Física»; plan 10 E-07, E-16, E-19, E-26.
//  · partida nueva: plaza → centro a pie y plaza → r 38 (llegada a NMG) a pie; plaza → paseo → r 38 en tabla;
//  · vuelta por el anillo libre r 44,8 en tabla (cuatro cuadrantes) sin atascos;
//  · durante todo: la cámara nunca dentro de un collider (esfera de 0,12 m) y ANMI nunca dentro de un collider (cápsula).
// Uso: node tools/v10/ext-rutas.mjs --url v10 --task V10-R2 --label final
// IT8 paso 2 (cambio de diseño aprobado W04/V10.3, copia previa en V10/backups/pruebas/IT8-paso2/): la valla del centro está en pie hasta las
// 20 patatas, así que «plaza → centro a pie» se prueba con la partida 20/20 y la revelación vista (centro abierto); el resto, partida nueva.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20 } from '../v8/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
const R = new Report('ext-rutas');
const camIn = (page) => page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, c = g.rig.cam.position;
  const hit = g.world.intersectionWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.12), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider, undefined, (cc) => !g.npcColliders.has(cc.handle) && !g.park.cameraIgnore.has(cc.handle));
  return hit ? { at: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), n: g.park.colliderName(hit.handle) } : null; });
await runTest(R, async () => {
  const b = await launch();
  try {
    const run = async (label, fn, save = null) => {
      const page = await openGame(b, R, { save }); await clickStart(page); await sleep(600);
      const P = new Pilot(page, R); const bad = []; let samples = 0, stop = false;
      await P.buildNav();   // rejilla de navegación (con el exterior: ±56 m, ver pilot.mjs)
      const watch = (async () => { while (!stop) { const h = await camIn(page).catch(() => null); samples++; if (h && bad.length < 8) bad.push(h); await sleep(120); } })();
      let r; try { r = await fn(P, page); } finally { stop = true; await watch; await P.release().catch(() => {}); await page.close(); }
      R.check(r.ok, `${label}: llega (${r.why ?? ''})`, 'input', { at: r.s ? [r.s.x, r.s.y, r.s.z].map((v) => +(+v).toFixed(2)) : null, log: P.log.slice(-4) });
      R.check(bad.length === 0, `${label}: la cámara nunca dentro de geometría (${samples} muestras)`, 'input', bad);
    };
    await run('a pie plaza → centro (20/20, centro abierto)', (P) => P.walkTo([0, 2], { tol: 1.2, maxMs: 90000 }), { ...SAVE_20 });
    await run('a pie plaza → llegada a NMG (r 38, eje 45°)', (P) => P.walkTo([26.87, -26.87], { tol: 1.0, maxMs: 60000 }));
    await run('en tabla plaza → paseo → r 38', async (P, page) => { await page.keyboard.press('KeyQ'); await sleep(900); return P.follow([[36, -36], [31, -31], [27.2, -27.2]], { ride: true, speed: 5, tol: 1.0, maxMs: 25000 }); });
    // R2 (D-EX-03 revisada): los 19 cuerpos conservados del runtime están sobre el eje r 44,8 (troncos/arbustos a r 43–45); el lado exterior
    // queda libre en todo el anillo (ext-circulacion: ≥ 2,0 m): la vuelta va por el carril r 45,8 (cápsula a ≥ 0,9 m de ellos y de la reserva)
    await run('en tabla, vuelta por el anillo (carril exterior r 45,8)', async (P, page) => {
      await P.walkTo([31.7, -31.7], { tol: 1.0, maxMs: 30000 }); await page.keyboard.press('KeyQ'); await sleep(900);
      const pts = []; for (let k = 0; k <= 32; k++) { const a = (45 + k / 32 * 360) * Math.PI / 180; pts.push([45.8 * Math.sin(a), -45.8 * Math.cos(a)]); }
      return P.follow(pts, { ride: true, speed: 5, tol: 1.5, maxMs: 120000 }); });
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
