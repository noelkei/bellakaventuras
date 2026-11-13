// Capturas del runtime REAL del remake en Chrome sin interfaz (misma build, misma cámara/HUD salvo que se pida ocultar).
//   node tools/shots.mjs [--url http://localhost:5173/] [--mobile] [--only nombre,nombre] [--out captures/remake]
// Cada toma prepara el estado desde dentro del juego (teleport, simulación con pasos fijos) y fotografía.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const url = arg('--url', 'http://localhost:5173/');
const mobile = args.includes('--mobile') || args.includes('--landscape');
const landscape = args.includes('--landscape');
const only = arg('--only', '');
const OUT = path.resolve(HERE, '..', arg('--out', 'captures/remake'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VP = landscape ? { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true } : mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 };

// js: código que se ejecuta en la página con g (Game), T (THREE), sim(seg), tp(x,y,z,heading)
export const SHOTS = [
  { name: 'arrival', js: `g.state.reset(); const m=g.manifest; tp(m.spawn.pos.x,m.spawn.pos.y,m.spawn.pos.z,m.spawn.heading); g.rig.snapBehind(g.skater); await sim(0.6);` },
  { name: 'overview', hideUi: true, js: `await sim(0.2); g.rig.toFixed({pos:new T.Vector3(0,95,62), target:new T.Vector3(0,0,4), hfov:70}, true); await sim(0.1);` },
  { name: 'top', hideUi: true, js: `await sim(0.1); g.rig.cam.up.set(0,0,-1); g.rig.toFixed({pos:new T.Vector3(0,150,0.01), target:new T.Vector3(0,0,0), hfov:60}, true); await sim(0.1); g.render(); g.rig.cam.up.set(0,1,0);` },
  { name: 'nmg_landmark', hideUi: true, js: `const S=g.park.sector('no_me_guillo'); const p=S.P(26,6,0); tp(p.x,0,p.z,S.out(6)); g.rig.snapBehind(g.skater); g.rig.pitch=0.35; await sim(0.5);` },
  { name: 'tutorial', hideUi: true, js: `const S=g.park.sector('nosvamosdeaqui'); const p=S.P(24,8,0); tp(p.x,0,p.z,S.out(4)); g.rig.snapBehind(g.skater); g.rig.pitch=0.5; await sim(0.5);` },
  { name: 'yinyang', hideUi: true, js: `const S=g.park.sector('yinyang'); const p=S.P(26,-6,0); tp(p.x,0,p.z,S.out(0)); g.rig.snapBehind(g.skater); await sim(0.5);` },
  { name: 'tratratra', hideUi: true, js: `const S=g.park.sector('tratratra'); const p=S.P(22.5,22,0); tp(p.x,0,p.z,S.out(0)+0.6); g.rig.snapBehind(g.skater); g.rig.pitch=0.3; await sim(0.6); g.rig.toFixed({pos:S.P(20,8,6.5), target:S.P(33,-4,3), hfov:72}, true); await sim(0.1);` },
  { name: 'bridge_top', hideUi: true, js: `await g.loadNpc('aissa'); await g.loadNpc('juseph'); const a=g.manifest.get('bridge.top'); tp(a.pos.x,a.pos.y+0.05,a.pos.z,a.heading); g.rig.snapBehind(g.skater); g.rig.pitch=0.35; await sim(0.6);` },
  { name: 'fashion', hideUi: true, js: `await g.loadNpc('bella'); const S=g.park.sector('fashion_girl'); const p=S.P(25,0,0); tp(p.x,0,p.z,S.out(0)); g.rig.snapBehind(g.skater); g.rig.pitch=0.3; await sim(0.6);` },
  { name: 'girls', hideUi: true, js: `await g.loadNpc('bella'); const S=g.park.sector('fashion_girl'); const p=S.P(32,0,0); tp(p.x,0,p.z,S.inward(0)); await sim(1.2); const gs=g.npcs.get('bella'); for (const n of gs) { n.mixer.setTime(0.3); } const c=gs.map(n=>n.root.position.clone()).reduce((a,b)=>a.add(b)).divideScalar(3); g.rig.toFixed({pos:p.clone().add(new T.Vector3(0,2.2,0)).add(c.clone().sub(p).setY(0).normalize().multiplyScalar(-2.5)), target:c.clone().setY(1.2), hfov:95}, true); await sim(0.05);` },
  { name: 'girl1', hideUi: true, js: `await g.loadNpc('bella'); const n=g.npcs.get('bella')[0]; const a=n.root.position; const f=new T.Vector3(Math.sin(n.yaw),0,Math.cos(n.yaw)); g.rig.toFixed({pos:a.clone().addScaledVector(f,1.6).setY(a.y+1.5), target:a.clone().setY(a.y+1.35), hfov:45}, true); await sim(0.3);` },
  { name: 'girl2', hideUi: true, js: `const n=g.npcs.get('bella')[1]; const a=n.root.position; const f=new T.Vector3(Math.sin(n.yaw),0,Math.cos(n.yaw)); g.rig.toFixed({pos:a.clone().addScaledVector(f,1.6).setY(a.y+1.5), target:a.clone().setY(a.y+1.35), hfov:45}, true); await sim(0.3);` },
  { name: 'girl3', hideUi: true, js: `const n=g.npcs.get('bella')[2]; const a=n.root.position; const f=new T.Vector3(Math.sin(n.yaw),0,Math.cos(n.yaw)); g.rig.toFixed({pos:a.clone().addScaledVector(f,1.6).setY(a.y+1.5), target:a.clone().setY(a.y+1.35), hfov:45}, true); await sim(0.3);` },
  { name: 'dance', hideUi: false, js: `await g.loadNpc('bella'); g.autoMode=true; const z=g.park.zones.get('act.danceCombo'); tp(z.pos.x,0,z.pos.z,0); await sim(0.3); g.input.actionQueued=true; await sim(0.3); document.querySelector('#dance-pad button[data-k="up"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); await sim(1.0); g.npcs.get('bella').forEach((n,i)=>n.gesture(i===1?'Jump':'Cheer')); await sim(0.6);` },
  { name: 'mural_final', hideUi: true, js: `if (g.mode!=='explore') { g.activities.find(a=>a.id==='danceCombo').exit(false); await sim(0.3); } g.activities.find(a=>a.id==='graffiti').close(true); const m=g.manifest.get('mural.paint'); tp(m.pos.x,0,m.pos.z,m.heading); g.rig.snapBehind(g.skater); await sim(0.8);` },
  { name: 'center_closed', hideUi: true, js: `const p=g.park.sector('no_me_guillo').P(27,0,0); tp(p.x,0,p.z,g.park.sector('no_me_guillo').inward(0)); g.rig.snapBehind(g.skater); g.rig.pitch=0.45; await sim(0.6);` },
  { name: 'center_reveal_mid', hideUi: true, js: `g.park.setCenter(0.55); g.rig.toFixed({pos:new T.Vector3(-14,7.5,13), target:new T.Vector3(0,1.2,0), hfov:70}, true); await sim(0.1);` },
  { name: 'center_open', hideUi: true, js: `g.park.setCenter(1); g.cars.setActive(true); g.centerOpen=true; const a=g.manifest.get('final.approach'); tp(a.pos.x-2,0,a.pos.z+5,a.heading); g.rig.snapBehind(g.skater); await sim(2.0); g.rig.toFixed({pos:new T.Vector3(-14,9,16), target:new T.Vector3(1,1,0), hfov:72}, true); await sim(0.1);` },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] });
const page = await browser.newPage();
await page.setViewport(VP);
if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
await page.evaluate(() => { const g = window.__bk; g.autoMode = true; document.getElementById('start').hidden = true; g.start(); });
fs.mkdirSync(OUT, { recursive: true });
const tag = landscape ? 'mobile-land' : mobile ? 'mobile' : 'desktop';
for (const sh of SHOTS) {
  if (only && !only.split(',').includes(sh.name)) continue;
  await page.evaluate(async (js, hideUi) => {
    const g = window.__bk, T = window.__bkTHREE;
    const sim = (s) => g.simulate(s);
    const tp = (x, y, z, h) => { g.skater.teleport(new T.Vector3(x, y, z), h); };
    document.getElementById('ui').style.visibility = hideUi ? 'hidden' : 'visible';
    document.getElementById('hint').hidden = true;
    await (new Function('g', 'T', 'sim', 'tp', `return (async () => { ${js} })()`))(g, T, sim, tp);
    g.render();
  }, sh.js, !!sh.hideUi);
  await page.screenshot({ path: path.join(OUT, `${tag}_${sh.name}.png`) });
  const info = await page.evaluate(() => { const g = window.__bk; return { dc: g.stats.drawCalls, tris: g.stats.tris, pos: g.skater.footPos.toArray().map((v) => +v.toFixed(2)) }; });
  console.log(sh.name.padEnd(16), JSON.stringify(info));
}
console.log('errores', errors.length ? errors : 'ninguno');
await browser.close();
