// EXT-01: fakie/revert y trucos por dirección con TECLADO REAL (sin tocar trick ni rotación). Fixture declarada: solo la
// posición de salida (inicio de carrera en llano NMG o ancla trick.approach de la lanzadera del perímetro, esquina 315°).
//   A · llano: ollie + EXTRA+izq → 180 → fakie con velocidad conservada → seguir → frenar → doble toque EXTRA → revert
//   B · lanzadera: SALTO en el labio + truco en el aire: kickflip (sin dirección), heelflip (D), frontflip (W), backflip (S),
//       360 (EXTRA+D)
//   C · llano: frontflip tras un ollie pequeño → rechazado por aire, sin caída
//   node tools/v3/tricks.mjs → captures/v3/P5/EXT-01/tricks.json + secuencias *.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P5/EXT-01', 'tricks', { method: 'teclado real; fixture = posición de salida declarada; resultados del trickLog/eventos del controlador; ángulo acumulado sin envolver' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const S = () => page.evaluate(() => { const s = window.__bk.skater; return { loco: s.loco, state: s.state, fakie: s.fakie, speed: +s.speed.toFixed(2), grounded: s.grounded, trick: s.trick ? { kind: s.trick.kind, angle: +s.trick.angle.toFixed(2) } : null, log: s.trickLog.slice(-1)[0] ?? null, nlog: s.trickLog.length, ev: s.events.slice(-12).map((e) => e.e), y: +s.footPos.y.toFixed(2) }; });
const down = (k) => page.keyboard.down(k), up = (k) => page.keyboard.up(k);
const press = (k) => page.keyboard.press(k);
const waitFor = async (fn, ms, step = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await S(); if (fn(s)) return s; await sleep(step); } return null; };
async function film(name, ms) {
  const shots = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) { shots.push(await page.screenshot({ type: 'jpeg', quality: 70 })); await sleep(90); }
  const W = 300, H = 207; const tiles = await Promise.all(shots.slice(0, 16).map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * 8, height: H * Math.ceil(tiles.length / 8), channels: 3, background: '#fff' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * W, top: Math.floor(i / 8) * H }))).jpeg({ quality: 78 }).toFile(path.join(R.dir, `${name}.jpg`));
}
const placeFlat = () => page.evaluate(() => {
  const g = window.__bk, S = g.park.sector('no_me_guillo'); const p = S.P(44, -10);
  g.skater.teleport(p, S.ccw(-10) + Math.PI, 'ride'); g.rig.snapBehind(g.skater); g.input.clear();
});
const placeKicker = () => page.evaluate(() => {
  const g = window.__bk, a = g.manifest.get('trick.approach');
  g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear();
});
const lipDist = () => page.evaluate(() => { const g = window.__bk, l = g.manifest.get('trick.lip').pos, p = g.skater.footPos; return Math.hypot(p.x - l.x, p.z - l.z); });

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });

  // ---------------------------------------------------------------- A: 180 → fakie → revert
  await placeFlat(); await sleep(300);
  await down('KeyW'); await sleep(2300); await up('KeyW');
  const v0 = (await S()).speed;
  await press('Space'); await sleep(130);
  await down('KeyA'); await sleep(40); await press('KeyF'); await sleep(120); await up('KeyA');
  let s = await waitFor((x) => x.grounded && x.nlog > 0 && x.loco === 'ride', 2500);
  R.check(!!s && s.log?.kind === 'spin180' && s.log.ok && s.fakie, 'A: ollie + EXTRA+izquierda = 180 limpio y aterriza en fakie', 'input', { s, v0 });
  R.check(!!s && s.speed >= v0 * 0.75, 'A: el 180 conserva velocidad (≥75 %)', 'input', { v0, v1: s?.speed });
  await sleep(900);
  s = await S();
  R.check(s.fakie && s.loco === 'ride' && s.speed > 0.8, 'A: sigue rodando en fakie', 'input', s);
  await down('KeyS'); await waitFor((x) => x.speed < 2.4, 4000); await up('KeyS');
  await press('KeyF'); await sleep(110); await press('KeyF');
  s = await waitFor((x) => !x.fakie && x.loco === 'ride', 1500);
  R.check(!!s && (await S()).ev.includes('revert'), 'A: doble toque EXTRA lento en fakie = revert y vuelve a regular', 'input', s ?? (await S()));

  // ---------------------------------------------------------------- B: lanzadera
  const results = {};
  const TRICKS = [
    ['kickflip', [], 'Space'], ['heelflip', ['KeyD'], 'Space'], ['frontflip', ['KeyW'], 'Space'], ['backflip', ['KeyS'], 'Space'], ['spin360', ['KeyD'], 'KeyF'],
  ];
  for (const [kind, hold, key] of TRICKS) {
    await placeKicker(); await sleep(400);
    const n0 = (await S()).nlog;
    await down('KeyW');
    const t0 = Date.now(); let d = 99; while (Date.now() - t0 < 6000) { d = await lipDist(); if (d < 0.9) break; await sleep(15); }
    const lipSpeed = (await S()).speed;
    await page.evaluate(() => { const s = window.__bk.skater; window.__airMax = 0; window.__airIv = setInterval(() => { window.__airMax = Math.max(window.__airMax, s.airTime); }, 10); });
    await press('Space'); await sleep(40);
    await up('KeyW'); await sleep(110);
    for (const k of hold) await down(k);
    await sleep(40); await press(key); await sleep(140);
    for (const k of hold) await up(k);
    const filming = kind === 'frontflip' || kind === 'spin360' ? film(`B_${kind}`, 1500) : null;
    s = await waitFor((x) => x.nlog > n0 && x.grounded, 4000);
    if (filming) await filming;
    await sleep(500); const after = await S();
    const airMax = await page.evaluate(() => { clearInterval(window.__airIv); return +window.__airMax.toFixed(2); });
    results[kind] = { log: s?.log, after: { loco: after.loco, fakie: after.fakie, speed: after.speed }, lipDist: +d.toFixed(2), lipSpeed, airMax, ev: s?.ev };
    R.check(!!s && s.log?.kind === kind && s.log.ok && after.loco !== 'bail', `B: ${kind} desde la lanzadera con aire suficiente, aterrizado`, 'input', results[kind]);
  }
  R.data.kicker = results;

  // ---------------------------------------------------------------- C: intento insuficiente
  await placeFlat(); await sleep(300);
  await down('KeyW'); await sleep(2300); await up('KeyW');
  const nC = (await S()).nlog;
  await press('Space'); await sleep(130); await down('KeyW'); await press('Space'); await sleep(100); await up('KeyW');
  await sleep(1300); s = await S();
  R.check(s.ev.some((e) => e.startsWith('trick-denied:frontflip')) && s.nlog === nC && s.loco === 'ride', 'C: frontflip tras ollie pequeño se rechaza (aire) y sigue rodando sin caída', 'input', s);
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
