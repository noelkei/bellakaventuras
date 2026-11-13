// Comprobaciones de cierre de tareas abiertas (entrada real):
//   CTRL-05  cruzar la pista de baile andando y en la tabla pasando entre las chicas: sin atascarse ni caer
//   ANIM-05  pausa a mitad de la transición andar→montar: no avanza en pausa y al reanudar termina (sin quedarse a medias)
//   node tools/v3/close-checks.mjs → captures/v3/CLOSE/close-checks.json
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('CLOSE', 'close-checks', { method: 'teclado real con piloto relativo a la cámara; fixtures: posición de salida' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function goTo(tg, { tol = 0.8, vmax = 3, maxMs = 12000 } = {}) {
  const t0 = Date.now(); let o = null;
  while (Date.now() - t0 < maxMs) {
    o = await page.evaluate(({ tg, vmax }) => {
      const g = window.__bk, p = g.skater.footPos, f = g.rig.forward, d = { x: tg.x - p.x, z: tg.z - p.z }, L = Math.hypot(d.x, d.z), right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; }).sort((a, b) => b.dot - a.dot);
      let k = combos[0].k.slice(); const v = g.skater.speed;
      if (v > vmax + 0.5) k = ['KeyS']; else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); } else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      return { L, keys: k, bails: g.skater.bails, respawns: g.skater.respawns };
    }, { tg, vmax });
    if (o.L < tol) break;
    await keys(o.keys); await sleep(30);
  }
  await keys([]); return o;
}

try {
  await clickStart(page); await page.evaluate(async () => { document.getElementById('hint').hidden = true; await window.__bk.loadNpc('bella'); });
  // CTRL-05: cruzar la pista entre las chicas (dos pasadas: a pie con Q y en la tabla)
  const P = (r, da) => page.evaluate(({ r, da }) => { const q = window.__bk.park.sector('fashion_girl').P(r, da); return { x: q.x, z: q.z }; }, { r, da });
  for (const mode of ['walk', 'ride']) {
    const a = await P(26.5, -9), b = await P(37.5, 9);
    R.fixture(`pista FASHION GIRL: salida en el borde interior (${mode})`, 'teleport');
    await page.evaluate(({ a, b, mode }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(a.x, 0, a.z), Math.atan2(b.x - a.x, b.z - a.z), mode === 'walk' ? 'walk' : 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, { a, b, mode });
    if (mode === 'walk') await page.keyboard.press('KeyQ');
    await sleep(300);
    const o1 = await goTo(await P(32, 0.3), { tol: 1.0, vmax: mode === 'walk' ? 2 : 3.5 });
    const o2 = await goTo(b, { tol: 1.2, vmax: mode === 'walk' ? 2 : 3.5 });
    if (mode === 'walk') await page.keyboard.press('KeyQ');
    const near = await page.evaluate(() => { const g = window.__bk; return (g.npcs.get('bella') ?? []).map((n) => +n.root.position.distanceTo(g.manifest.get('dance.center').pos).toFixed(2)); });
    R.check(o1.L < 1.0 && o2.L < 1.2 && o2.respawns === 0 && o2.bails === 0, `CTRL-05 ${mode === 'walk' ? 'a pie' : 'en la tabla'}: cruza la pista por el centro entre las chicas sin atascarse ni caer`, 'input', { o1: o1.L, o2: o2.L, bails: o2.bails, chicasAlCentro: near });
  }
  // ANIM-05: pausa a mitad de la subida a la tabla
  R.fixture('llano de la llegada a pie', 'teleport');
  await page.evaluate(() => { const g = window.__bk, m = g.manifest.spawn; g.skater.teleport(m.pos.clone(), m.heading, 'walk'); g.skater.walkLock = false; g.rig.snapBehind(g.skater); g.input.clear(); });   // «seguir a pie» desactivado tras la prueba anterior
  await sleep(400);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__bk.skater.loco === 'mount', { timeout: 4000 }).catch(() => {});
  await page.keyboard.press('Escape'); await page.keyboard.up('KeyW'); await sleep(80);
  const p0 = await page.evaluate(() => ({ loco: window.__bk.skater.loco, modeT: window.__bk.skater.modeT, clip: window.__bk.visual.currentName, t: window.__bk.visual.mixer?.time }));
  await sleep(1500);
  const p1 = await page.evaluate(() => ({ loco: window.__bk.skater.loco, modeT: window.__bk.skater.modeT, paused: window.__bk.paused, t: window.__bk.visual.mixer?.time }));
  await page.evaluate(() => document.getElementById('btn-resume').click()); await sleep(1500);
  const p2 = await page.evaluate(() => ({ loco: window.__bk.skater.loco, paused: window.__bk.paused, board: !window.__bk.visual.boardHidden }));
  R.check(p0.loco === 'mount' && p1.paused && p1.loco === 'mount' && Math.abs(p1.modeT - p0.modeT) < 1e-6 && p1.t === p0.t && !p2.paused && ['ride', 'idle', 'walk'].includes(p2.loco) && p2.loco !== 'mount' && p2.board,
    'ANIM-05: en pausa a mitad de montar ni la transición ni la animación avanzan; al reanudar termina y la tabla sigue visible', 'input', { p0, p1, p2 });
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await keys([]).catch(() => {}); await browser.close(); R.finish(); }
