// Sesión de juego en TIEMPO REAL (bucle real del juego, teclado y ratón como un jugador) con registro y capturas.
//   node tools/play-session.mjs [--url http://localhost:5173/]  → captures/audit/play/*.png + play.json
// Mide: latencia SALTO→despegue, control con teclado relativo a cámara, parada en zonas de actividad, flujo de charla/actividad.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'audit', 'play');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 });
await p.goto(url, { waitUntil: 'load' });
await p.evaluate(() => localStorage.removeItem('bellakaventuras.remake.save')); await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
await p.click('#btn-start');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const st = (label) => p.evaluate((label) => { const g = window.__bk, s = g.skater; return { label, t: +g.clock.toFixed(2), pos: s.footPos.toArray().map((v) => +v.toFixed(1)), v: +s.speed.toFixed(1), state: s.state, zone: g.zone, mode: g.mode, action: document.getElementById('prompt').hidden ? null : document.getElementById('btn-action').textContent, fps: +(1000 / g.frameMs).toFixed(0) }; }, label);
let shot = 0;
const snap = async (name) => { await p.screenshot({ path: path.join(OUT, `${String(shot++).padStart(2, '0')}_${name}.png`) }); };
const hold = async (keys, ms) => { for (const k of keys) await p.keyboard.down(k); await sleep(ms); for (const k of keys) await p.keyboard.up(k); };
await sleep(1500); log.push(await st('inicio')); await snap('llegada');

// 1. Ir hacia La Pantera con W (cámara detrás) y soltar: ¿se para cerca?
await hold(['KeyW'], 1200); log.push(await st('W 1,2 s')); await sleep(1500); log.push(await st('soltado 1,5 s')); await snap('tras_soltar');
// 2. Girar en el sitio: A durante 1 s desde casi parado
await sleep(2500); log.push(await st('antes de girar')); await hold(['KeyA'], 1000); log.push(await st('A 1 s')); await snap('girar_A');
// 3. Latencia de salto real: pulsar Espacio y medir hasta despegue
await hold(['KeyW'], 900);
const lat = await p.evaluate(async () => { const g = window.__bk, s = g.skater; const t0 = performance.now(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 60);
  return new Promise((res) => { const chk = () => { if (s.vy > 0.5) res({ msHastaDespegue: Math.round(performance.now() - t0) }); else if (performance.now() - t0 > 500) res({ msHastaDespegue: '>500' }); else requestAnimationFrame(chk); }; chk(); }); });
log.push({ label: 'latencia salto', ...lat }); await sleep(800);
// 4. Intentar hablar con La Pantera: conducir hasta su zona como un jugador (W + giros hacia ella) y pulsar E
const goTo = async (anchor, maxMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const d = await p.evaluate((a) => { const g = window.__bk, s = g.skater; const t = g.manifest.get(a).pos; const fwd = g.rig.forward; const dx = t.x - s.footPos.x, dz = t.z - s.footPos.z; const dist = Math.hypot(dx, dz); const right = { x: -fwd.z, z: fwd.x }; const ang = Math.atan2(dx * right.x + dz * right.z, dx * fwd.x + dz * fwd.z); return { dist, ang, prompt: !document.getElementById('prompt').hidden }; }, anchor);
    if (d.prompt) return { llegado: true, dist: +d.dist.toFixed(1), ms: Date.now() - t0 };
    const keys = d.dist > 3 ? ['KeyW'] : []; if (d.ang > 0.25) keys.push('KeyD'); if (d.ang < -0.25) keys.push('KeyA');
    await hold(keys.length ? keys : ['KeyW'], 120);
  }
  return { llegado: false, ms: maxMs };
};
const r1 = await goTo('npc.la_pantera', 15000); log.push({ label: 'llegar a La Pantera', ...r1 });
let visible = 0; for (let i = 0; i < 20; i++) { if (await p.$eval('#prompt', (e) => !e.hidden)) visible++; await sleep(50); }
log.push({ label: 'botón HABLAR visible tras llegar (de 1 s)', s: visible / 20 }); await snap('pantera_boton');
await p.keyboard.press('KeyE'); await sleep(400); await snap('pantera_charla');
log.push(await st('tras E')); log.push({ label: 'texto diálogo', text: await p.$eval('#dialog-text', (e) => e.textContent) });
await sleep(3200);
// 5. Ir al mural de YINYANG y probar a activar PINTAR
await p.evaluate(() => { const g = window.__bk; const S = g.park.sector('yinyang'); g.skater.teleport(S.P(24, -12), S.out(-6)); g.rig.snapBehind(g.skater); });
await sleep(500);
const r2 = await goTo('mural.paint', 15000); log.push({ label: 'llegar a PINTAR', ...r2 });
visible = 0; for (let i = 0; i < 20; i++) { if (await p.$eval('#prompt', (e) => !e.hidden)) visible++; await sleep(50); }
log.push({ label: 'botón PINTAR visible tras llegar (de 1 s)', s: visible / 20, estado: await st('pintar') }); await snap('pintar');
// 6. Ver ANMI rodando de cerca (lateral) a 60 fps reales: capturas seguidas
await p.evaluate(() => { const g = window.__bk; g.skater.teleport(new window.__bkTHREE.Vector3(-14, 0, 6), Math.PI / 2); g.rig.snapBehind(g.skater); });
await p.keyboard.down('KeyW'); await sleep(1200);
for (let i = 0; i < 6; i++) { await snap(`rodando_${i}`); await sleep(90); }
await p.keyboard.up('KeyW');
fs.writeFileSync(path.join(OUT, 'play.json'), JSON.stringify(log, null, 1));
for (const l of log) console.log(JSON.stringify(l));
await b.close();
