// Secuencias de trucos en el runtime real: frontflip y 360 en la lanzadera, backflip final en la superrampa.
//   node tools/capture-tricks.mjs [--url http://localhost:5173/]  → captures/tricks/<truco>_<n>.png + hojas (contact-sheet.py)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'tricks');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({ width: 480, height: 420 });
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
await p.evaluate(() => { const g = window.__bk; document.getElementById('start').hidden = true; g.start(); g.autoMode = true; document.getElementById('ui').style.display = 'none'; g.renderer.setPixelRatio(1); });

async function run(name, setup, step, frames, camFn) {
  await p.evaluate(setup);
  for (let i = 0; i < frames; i++) {
    const done = await p.evaluate(step, i);
    await p.evaluate(camFn);
    await p.screenshot({ path: path.join(OUT, `${name}_q34_${String(i).padStart(3, '0')}.png`) });
    if (done) break;
  }
}
const trickSetup = `(() => { const g = window.__bk; const a = g.manifest.get('trick.approach'); g.skater.teleport(a.pos, a.heading); window.__ph = 0; })()`;
const trickStep = (stick) => new Function('i', `return (async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; const a = g.manifest.get('trick.approach');
  g.autoWish = new T.Vector2(Math.sin(a.heading), Math.cos(a.heading));
  for (let k = 0; k < 4; k++) { // 15 fps de captura (4 pasos de 60 Hz)
    if (window.__ph === 0 && s.grounded && s.footPos.y > 0.75) { g.input.pressJump(); window.__ph = 1; }
    else if (window.__ph === 1 && !s.grounded && s.airTime > 0.15) { g.input.move = ${JSON.stringify(stick)}; g.input.pressJump(); window.__ph = 2; }
    else if (window.__ph === 2 && s.grounded) { g.input.move = { x: 0, y: 0 }; window.__ph = 3; window.__t3 = i; }
    await g.simulate(1 / 60);
  }
  return window.__ph === 3 && i > (window.__t3 ?? 0) + 6; })()`);
const sideCam = `(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; const c = g.rig.cam;
  const a = g.manifest.get('trick.lip'); const side = new T.Vector3(Math.cos(a.heading), 0, -Math.sin(a.heading));
  const at = a.pos.clone().add(new T.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)).multiplyScalar(3.5)); at.y = 1.6;
  c.position.copy(at).addScaledVector(side, 6).add(new T.Vector3(0, 1.2, 0)); c.fov = 52; c.aspect = 480 / 420; c.updateProjectionMatrix(); c.lookAt(s.visualPos.clone().add(new T.Vector3(0, 1, 0)).lerp(at, 0.5)); g.renderer.render(g.scene, c); })()`;
await run('frontflip', trickSetup, trickStep({ x: 0, y: 1 }), 60, sideCam);
await run('spin360', trickSetup, trickStep({ x: 1, y: 0 }), 60, sideCam);
// backflip final: centro abierto, carrerilla y SALTO en la zona
await run('backflip', `(() => { const g = window.__bk; g.debugCollectAll(20); g.park.setCenter(1); g.centerOpen = true; g.cars.setActive(true); g.state.setRevealSeen(); g.setMode('explore'); const a = g.manifest.get('final.approach'); g.skater.teleport(a.pos, a.heading); window.__ph = 0; })()`,
  new Function('i', `return (async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
    for (let k = 0; k < 4; k++) { if (g.mode === 'explore') g.autoWish = new T.Vector2(1, 0); if (window.__ph === 0 && s.footPos.x > -7.5) { g.input.pressJump(); window.__ph = 1; } await g.simulate(1 / 60); }
    return g.mode === 'preview' || (window.__ph === 1 && !s.scripted && s.footPos.x > 12); })()`),
  90,
  `(() => { const g = window.__bk; g.rig.cam.aspect = 480 / 420; g.rig.cam.updateProjectionMatrix(); g.render(); })()`); // cámara del propio juego (perfil de truco)
await b.close();
console.log('ok', fs.readdirSync(OUT).length, 'fotogramas');
