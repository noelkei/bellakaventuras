// BASE-01/BASE-04: ruta breve repetible y casos negativos conocidos sobre la build servida.
//   node tools/v3/baseline-route.mjs [--url http://127.0.0.1:5190/] [--tag v2]
// Entradas reales de teclado/ratón/toque; las colocaciones iniciales se registran como fixtures.
import { Report, launch, openGame, clickStart, snap, holdKeys, hitTest, sleep, VIEWPORTS } from './lib.mjs';

const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : 'current';
const R = new Report('P0/BASE-01', `route-${tag}`, { method: 'Chrome headless (emulación), RAF real, teclado/ratón/toques del navegador', tag });
const browser = await launch();
try {
  // ---------- escritorio: llegada, empuje, giro, freno, ollie, agachado
  let page = await openGame(browser, R, { viewport: VIEWPORTS.desktop, save: null });
  R.fixture('partida nueva', 'localStorage sin guardado antes de cargar');
  await clickStart(page);
  await sleep(600);
  const s0 = await snap(page); R.note({ arrival: s0 });
  await R.shot(page, `${tag}-01-llegada`);
  const push = await holdKeys(page, ['KeyW'], 2200);
  R.note({ push: push.map((s) => [s.clock, s.speed, s.state, s.loco]) });
  await R.shot(page, `${tag}-02-empuje`);
  const turn = await holdKeys(page, ['KeyW', 'KeyA'], 900);
  R.note({ turn: turn.map((s) => [s.clock, s.speed, s.heading]) });
  const vBrake = (await snap(page)).speed;
  const p0 = await snap(page);
  const brake = await holdKeys(page, ['KeyS'], 1800);
  const stopIdx = brake.findIndex((s) => Math.abs(s.speed) < 0.3);
  const stopAt = stopIdx >= 0 ? brake[stopIdx] : brake.at(-1);
  R.note({ brakeFrom: vBrake, brakeDist: Math.hypot(stopAt.x - p0.x, stopAt.z - p0.z), brakeTime: stopAt.clock - p0.clock, brake: brake.map((s) => [s.clock, s.speed]) });
  await R.shot(page, `${tag}-03-freno`);
  // ollie: rodar y pulsar espacio
  await page.keyboard.down('KeyW'); await sleep(1200);
  const tJump = await page.evaluate(() => performance.now());
  await page.keyboard.press('Space');
  const air = []; for (let i = 0; i < 14; i++) { air.push({ ...(await snap(page)), wall: await page.evaluate(() => performance.now()) }); await sleep(50); }
  await page.keyboard.up('KeyW');
  const lift = air.find((s) => !s.grounded);
  R.note({ ollie: { pressWall: tJump, firstAirborneWallMs: lift ? lift.wall - tJump : null, samples: air.map((s) => [s.clock, s.y, s.state]) } });
  await R.shot(page, `${tag}-04-ollie`);
  await sleep(800);
  const crouch = await holdKeys(page, ['KeyC'], 700);
  R.note({ crouch: crouch.map((s) => [s.clock, s.crouched, s.state]) });
  await R.shot(page, `${tag}-05-agachado`);

  // ---------- hit testing del HUD (ID37): ¿quién recibe el toque en PAUSA y ACCIÓN?
  await page.evaluate(() => { const g = window.__bk; g.offerAction('PRUEBA', () => {}, 'hit-test'); });
  R.fixture('acción ofrecida', 'botón de acción mostrado con offerAction para medir su hit target (no ejecuta actividad)');
  for (const sel of ['#btn-pause', '#btn-action', '#btn-jump', '#btn-crouch', '#btn-cam']) {
    const h = await hitTest(page, sel);
    R.check(!h.visible || h.receives, `hit target ${sel} recibe su propio toque (escritorio)`, 'input', h);
  }
  await page.evaluate(() => window.__bk.withdrawAction('hit-test'));

  // ---------- pausa durante diálogo (ID40): la charla no debe avanzar
  await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('npc.la_pantera'); const T = window.__bkTHREE;
    const p = a.pos.clone().add(new T.Vector3(Math.sin(a.heading) * 1.4, 0, Math.cos(a.heading) * 1.4)); g.skater.teleport(p, a.heading + Math.PI); g.rig.snapBehind(g.skater); });
  R.fixture('frente a La Pantera', 'teleport a 1,4 m de La Pantera para aislar la pausa en charla');
  await sleep(500);
  await page.keyboard.press('KeyE'); await sleep(400);
  const talking = await page.evaluate(() => ({ mode: window.__bk.mode, dialog: !document.getElementById('dialog').hidden }));
  R.check(talking.mode === 'activity' && talking.dialog, 'E inicia la charla con La Pantera', 'input', talking);
  // pausa por la vía que exista: Escape (V3) o clic real sobre el botón de pausa
  await page.keyboard.press('Escape'); await sleep(150);
  let pausedNow = await page.evaluate(() => window.__bk.paused);
  if (!pausedNow) { const b = await page.$('#btn-pause'); const bb = await b.boundingBox(); await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(150); pausedNow = await page.evaluate(() => window.__bk.paused); }
  R.check(pausedNow, 'se puede pausar durante la charla con teclado o clic real', 'input', { pausedNow });
  await page.evaluate(() => { if (!window.__bk.paused) { window.__bk.paused = true; } });
  await sleep(4000);
  const after = await page.evaluate(() => ({ dialog: !document.getElementById('dialog').hidden, done: window.__bk.state.p.activities.pantherTalk, mode: window.__bk.mode }));
  R.check(after.dialog && !after.done, 'durante 4 s de pausa la charla no termina ni concede premio', 'input', after);
  await page.close();

  // ---------- móvil: hit testing con toque real
  page = await openGame(browser, R, { viewport: VIEWPORTS.phone, save: null });
  await page.tap('#btn-start'); await sleep(900);
  await page.evaluate(() => window.__bk.offerAction('PRUEBA', () => {}, 'hit-test'));
  for (const sel of ['#btn-pause', '#btn-action', '#btn-jump', '#btn-crouch', '#btn-cam']) {
    const h = await hitTest(page, sel);
    R.check(!h.visible || h.receives, `hit target ${sel} recibe su propio toque (móvil 390×844)`, 'emulation', h);
  }
  const bb = await (await page.$('#btn-pause')).boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(200);
  R.check(await page.evaluate(() => window.__bk.paused), 'toque real en PAUSA pausa el juego (móvil)', 'emulation');
  await R.shot(page, `${tag}-06-movil-pausa`);
  await page.close();

  // ---------- túnel oculto TRATRATRA (ID38) y bank del perímetro (ID54)
  page = await openGame(browser, R, { viewport: VIEWPORTS.desktop, save: null });
  await clickStart(page);
  const tt = await page.evaluate(() => { const g = window.__bk, b = g.park.boxes.get('tt.under'), T = window.__bkTHREE;
    const yaw = b.yaw; const dir = new T.Vector3(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2));
    // entrada radial: desde el lado interior del descanso, mirando hacia fuera
    const f = g.manifest.fries.find((x) => x.id === 'tratratra.hidden');
    const out = new T.Vector3(f.pos.x, 0, f.pos.z).normalize();
    const start = new T.Vector3(f.pos.x, 0, f.pos.z).addScaledVector(out, -4.2);
    g.skater.teleport(start, Math.atan2(out.x, out.z)); g.rig.snapBehind(g.skater);
    return { start: start.toArray(), fry: f.pos.toArray(), dir: dir.toArray() }; });
  R.fixture('TT hidden: salida 4,2 m antes de la patata, rumbo radial', tt);
  await page.keyboard.down('KeyC'); await sleep(250);
  const ttS = await holdKeys(page, ['KeyW'], 3500);
  await page.keyboard.up('KeyC');
  const ttGot = await page.evaluate(() => window.__bk.state.isCollected('tratratra.hidden'));
  R.check(ttGot, 'TT hidden: agachado y rodando se recoge la patata bajo el descanso', 'input', { last: ttS.at(-1) });
  await R.shot(page, `${tag}-07-tt-hidden`);
  await page.close();
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
