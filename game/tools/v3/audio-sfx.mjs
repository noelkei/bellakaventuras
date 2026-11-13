// AUD-05: efectos de skate con eventos reales (teclado real y bucle RAF). Registro del motor (`audio.sfxLog`: petición →
// sonó / descartada y por qué) y medidas con analizadores conectados en paralelo a los buses (no alteran la mezcla).
// EMULACIÓN en Chrome sin interfaz: niveles de buses, no salida audible en un dispositivo.
//   node tools/v3/audio-sfx.mjs → captures/v3/P4/AUD-05/sfx.json
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P4/AUD-05', 'sfx', { method: 'teclado real; registro sfxLog del motor; analizadores en paralelo a sfxBus, music.bus y master; fixtures de posición declaradas' });
const browser = await launch();
const page = await openGame(browser, R, { save: null });
const clickSel = async (sel) => { const h = await page.$(sel); const b = await h.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
const log = () => page.evaluate(() => window.__bk.audio.sfxLog.slice());
const mark = () => page.evaluate(() => window.__bk.audio.sfxLog.length);
const since = async (i) => (await log()).slice(i);
const played = (l, n) => l.filter((e) => e.n === n && e.ok);

try {
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  // tomas paralelas de nivel (dBFS) y muestreo del estado de rodadura
  await page.evaluate(() => {
    const a = window.__bk.audio, c = a.ctx;
    const tap = (node) => { const an = c.createAnalyser(); an.fftSize = 2048; node.connect(an); return an; };
    window.__taps = { sfx: tap(a.sfxBus), music: tap(a.music.bus), master: a.analyser };
    window.__lv = [];
    const meas = (an) => { const buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf); let s = 0, p = 0; for (const v of buf) { s += v * v; p = Math.max(p, Math.abs(v)); } return [Math.sqrt(s / buf.length), p]; };
    window.__lvIv = setInterval(() => {
      const s = window.__bk.skater, roll = a.roll;
      const [sr, sp] = meas(window.__taps.sfx), [mr, mp] = meas(window.__taps.music), [, xp] = meas(window.__taps.master);
      window.__lv.push({ t: performance.now(), grounded: s.grounded, riding: s.riding, speed: +s.speed.toFixed(2), braking: s.braking, surf: window.__bk.park.surfaceAt(s.footPos), pos: [+s.footPos.x.toFixed(1), +s.footPos.y.toFixed(2), +s.footPos.z.toFixed(1)],
        rollG: roll ? +roll.gain.gain.value.toFixed(4) : 0, rollF: roll ? +roll.filter.frequency.value.toFixed(0) : 0, scrape: roll ? +roll.scrape.gain.value.toFixed(4) : 0,
        sfxRms: sr, sfxPk: sp, musRms: mr, musPk: mp, masterPk: xp, mg: a.master.gain.value, ctx: c.state });
    }, 30);
  });
  const lv = (t0, t1) => page.evaluate((t0, t1) => window.__lv.filter((x) => x.t >= t0 && x.t <= (t1 ?? 1e15)), t0, t1);
  const now = () => page.evaluate(() => performance.now());
  const db = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

  // 1. andar con W sube solo a la tabla (subida automática por defecto) y empuja: mount + push por contacto del pie
  let i0 = await mark();
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.down('KeyA'); await sleep(3200);
  const lRide = await since(i0);
  R.check(played(lRide, 'mount').length === 1, 'W desde a pie: un «mount» al subir a la tabla', 'input', lRide.filter((e) => e.n === 'mount'));
  R.check(played(lRide, 'push').length >= 2, 'W: «push» por cada contacto del pie (no por fotograma)', 'input', { push: played(lRide, 'push').length, ms: 3200 });
  // 2. tres ollies espaciados: un pop por pulsación y un aterrizaje por caída
  const jumps = [];
  for (let k = 0; k < 3; k++) {
    const i = await mark(), t0 = await now();
    await page.keyboard.press('Space'); await sleep(1500);
    const l = await since(i), samples = await lv(t0, t0 + 1500);
    const air = samples.filter((x) => !x.grounded), gr = samples.filter((x) => x.grounded && x.riding);
    jumps.push({ jump: played(l, 'jump').length, land: played(l, 'land').length, landP: played(l, 'land').map((e) => e.p), rollAir: air.length ? Math.min(...air.map((x) => x.rollG)) : null, rollGround: gr.length ? Math.max(...gr.map((x) => x.rollG)) : null, airN: air.length });
  }
  R.check(jumps.every((j) => j.jump === 1 && j.land === 1), 'Espacio: exactamente un pop y un aterrizaje por ollie (sin repetición por vibración del contacto)', 'input', jumps);
  R.check(jumps.every((j) => j.airN > 3 && j.rollAir < j.rollGround * 0.5), 'la rodadura baja en el aire', 'input', jumps.map((j) => ({ air: j.rollAir, ground: j.rollGround })));
  await page.keyboard.up('KeyA');
  // 3. frenar (S): raspado solo mientras frena con velocidad
  await sleep(1200); let t0 = await now();
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await sleep(900); await page.keyboard.up('KeyS');
  const br = await lv(t0, t0 + 900);
  R.check(br.some((x) => x.braking && x.scrape > 0.02) && br.filter((x) => !x.braking).every((x) => x.scrape < 0.03), 'S: raspado de freno mientras frena; no al rodar', 'input', { maxScrape: Math.max(...br.map((x) => x.scrape)), braking: br.filter((x) => x.braking).length });
  // 4. niveles frente a la música (tomas paralelas antes del master)
  const all = await lv(0);
  const cruise = all.filter((x) => x.riding && x.grounded && x.speed > 2 && x.sfxPk < 0.2);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const lvl = { musicRmsDb: db(mean(all.filter((x) => x.musRms > 1e-4).map((x) => x.musRms))), rollRmsDb: db(mean(cruise.map((x) => x.sfxRms))), sfxPeakDb: db(Math.max(...all.map((x) => x.sfxPk))), masterPeakDb: db(Math.max(...all.map((x) => x.masterPk))) };
  R.check(lvl.rollRmsDb < lvl.musicRmsDb - 6, 'la rodadura queda por debajo de la música (≥ 6 dB): la música manda', 'input', lvl);
  R.check(lvl.masterPeakDb < 0, 'master sin recorte con música + efectos (pico < 0 dBFS)', 'input', lvl);
  R.data.levels = lvl;

  // 5. pausa: no suena nada mientras está pausado ni se acumula para el regreso
  await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW');
  await clickSel('#btn-pause'); await sleep(300); i0 = await mark();
  // (Espacio no: en la pausa el foco está en REANUDAR y lo pulsaría, que es lo esperado de un botón)
  await page.keyboard.press('KeyW'); await page.keyboard.press('KeyC'); await page.keyboard.press('KeyQ'); await sleep(600);
  const lPause = await since(i0), stillPaused = await page.evaluate(() => window.__bk.paused);
  await clickSel('#btn-resume'); await sleep(700);
  const lAfter = await since(i0);
  R.check(stillPaused && lPause.filter((e) => e.ok).length === 0 && lAfter.filter((e) => e.ok && /jump|mount|dismount/.test(e.n)).length === 0, 'en pausa no suena ningún efecto y al reanudar no se disparan los pedidos durante la pausa', 'input', { lPause, lAfter });

  // 6. silencio global: los efectos se piden pero el master está a 0
  await clickSel('#btn-pause'); await sleep(250); await clickSel('#btn-mute'); await clickSel('#btn-resume'); await sleep(500);
  i0 = await mark(); t0 = await now();
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.press('Space'); await sleep(1200); await page.keyboard.up('KeyW');
  const lMute = await since(i0), mu = await lv(t0 + 300);
  R.check(played(lMute, 'jump').length >= 1 && mu.every((x) => x.masterPk < 1e-4), 'MUTE: los eventos siguen (registro) pero la salida del master es silencio', 'input', { events: lMute.map((e) => e.n), masterPkDb: db(Math.max(...mu.map((x) => x.masterPk))), loud: mu.filter((x) => x.masterPk >= 1e-4).slice(0, 6).map((x) => ({ dt: Math.round(x.t - t0), pk: db(x.masterPk), mg: x.mg, ctx: x.ctx })) });
  await clickSel('#btn-pause'); await sleep(250); await clickSel('#btn-mute'); await clickSel('#btn-resume'); await sleep(500);

  // 7. salto pedido bajo techo: «deny», nunca pop
  R.fixture('posición dentro del túnel del circuito (NOSVAMOSDEAQUI), en la tabla; la cápsula entra agachada', 'teleport');
  await page.evaluate(() => { const g = window.__bk, S = g.park.sector('nosvamosdeaqui'), a = S.P(30.2, -2), b = S.P(29.2, -2); g.skater.teleport(a, Math.atan2(b.x - a.x, b.z - a.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await sleep(1400);   // parada en la tabla → se baja (subida automática); a pie y agachado bajo el techo
  i0 = await mark();
  const dState = await page.evaluate(() => { const s = window.__bk.skater; return { loco: s.loco, crouched: s.isCrouched }; });
  await page.keyboard.press('Space'); await sleep(700);
  R.data.denyState = dState;
  const lDeny = await since(i0);
  R.check(lDeny.some((e) => e.n === 'deny' && e.ok) && !lDeny.some((e) => /^(jump|hop)$/.test(e.n)), 'Espacio bajo el techo del túnel: sonido de negación y ningún pop', 'input', lDeny);

  // 8. superficie: tierra de YINYANG frente a hormigón (tono de rodadura a la misma ley de velocidad)
  R.fixture('posición en la tierra de YINYANG (r 36, −8°, en sentido horario); W real hasta subir a la tabla y rodar', 'teleport');
  const conc = all.filter((x) => x.surf === 'concrete' && x.grounded && x.riding && x.speed > 2).map((x) => x.rollF / (220 + x.speed * 80));
  await page.evaluate(() => { const g = window.__bk, S = g.park.sector('yinyang'), a = S.P(36, -8), b = S.P(36, -9); g.skater.teleport(a, Math.atan2(b.x - a.x, b.z - a.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await sleep(300); t0 = await now();
  await page.keyboard.down('KeyW'); await sleep(3800); await page.keyboard.up('KeyW');
  const dirt = (await lv(t0 + 800)).filter((x) => x.surf === 'dirt' && x.grounded && x.riding && x.speed > 2).map((x) => x.rollF / (220 + x.speed * 80));
  R.data.dirtTrace = (await lv(t0)).filter((_, i) => i % 6 === 0).map((x) => [x.surf, x.speed, x.pos, x.rollF]);
  R.check(dirt.length > 5 && conc.length > 5 && mean(dirt) < mean(conc) * 0.7, 'la rodadura cambia de tono en tierra (más grave) frente a hormigón', 'input', { concrete: +mean(conc).toFixed(2), dirt: +mean(dirt).toFixed(2), n: [conc.length, dirt.length] });
  R.data.sfxLog = await log();
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
