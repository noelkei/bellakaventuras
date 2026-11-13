// ANMI del REMAKE con la MISMA ruta y vistas que tools/capture-baseline.mjs (baseline de plantas):
// idle → push → ride, carve izq/der, ollie+land, freno; además agachado, kickflip y 360 (nuevos).
//   node tools/capture-anmi.mjs [--url http://localhost:5173/]   → captures/anmi-remake/ (+ tools/contact-sheet.py)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'captures', 'anmi-remake');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 420, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 60000 });
await page.evaluate(async () => {
  const g = window.__bk;
  g.autoMode = true;
  g.state.reset();
  document.getElementById('start').hidden = true; g.start();
  document.getElementById('ui').style.display = 'none';
  g.renderer.setPixelRatio(1);
});

// Segmentos: [nombre, pasos[[dur, fwd, turn, jump]]]
const SEGMENTS = [
  ['a_idle_push_ride', [[0.6, 0, 0, 0], [2.4, 1, 0, 0]]],
  ['b_carve', [[0.5, 1, 0, 0], [1.1, 1, -1, 0], [1.1, 1, 1, 0]]],
  ['c_ollie_land', [[0.4, 1, 0, 0], [1.3, 1, 0, 1]]],
  ['d_brake', [[0.3, 1, 0, 0], [1.2, -1, 0, 0]]],
  ['e_crouch', [[0.4, 1, 0, 0], [1.6, 1, 0, 'C'], [0.8, 1, 0, 0]]],
  ['f_kickflip', [[0.3, 1, 0, 0], [0.12, 1, 0, 1], [1.1, 1, 0, 2]]],
  ['g_spin360', [[0.3, 1, 0, 0], [0.12, 1, 0, 1], [1.1, 1, 1, 2]]],
];
const VIEWS = { side: [0, 0], front: [Math.PI / 2, 0], q34: [Math.PI / 4, 0.9] };
const FPS = 15;
const summary = [];
for (const [seg, steps] of SEGMENTS) {
  await page.evaluate((seg) => {
    const g = window.__bk, T = window.__bkTHREE;
    // pista de pruebas: disco central (plano y vacío mientras está sellado)
    g.skater.teleport(new T.Vector3(-16, 0, 0), Math.PI / 2);
    if (seg !== 'a_idle_push_ride') g.skater.speed = 5.5;
    window.__cap = { T };
  }, seg);
  let frame = 0;
  for (const [dur, fwd, turn, jump] of steps) {
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      const info = await page.evaluate(async (fwd, turn, jump, first, fps) => {
        const g = window.__bk, T = window.__bkTHREE, s = g.skater;
        const h = s.heading + turn * 1.1;
        g.autoWish = fwd === 0 ? null : new T.Vector2(Math.sin(h) * fwd, Math.cos(h) * fwd);
        g.input.crouchToggle = jump === 'C';
        if (jump === 1 && first) g.input.pressJump();
        if (jump === 2 && first) { g.input.move = { x: turn, y: 0 }; g.input.pressJump(); }
        if (jump !== 2) g.input.move = { x: 0, y: 0 };
        await g.simulate(1 / fps);
        return { state: s.state, speed: +s.speed.toFixed(2), y: +s.footPos.y.toFixed(3), grounded: s.grounded, crouch: s.isCrouched, trick: s.trick?.kind ?? null, anim: g.visual.activeActions?.join(' ') ?? '', wsum: +(g.visual.weightSum ?? 0).toFixed(3) };
      }, fwd, turn, jump, i === 0, FPS);
      for (const [vn, [yawOff, up]] of Object.entries(VIEWS)) {
        await page.evaluate((yawOff, up) => {
          const g = window.__bk, T = window.__bkTHREE, s = g.skater;
          const c = g.rig.cam; const h = s.heading;
          // vista lateral = a la derecha del rumbo; frontal = delante
          const a = h - Math.PI / 2 + yawOff;
          const at = s.visualPos.clone().add(new T.Vector3(0, 0.85, 0));
          c.position.set(at.x + Math.sin(a) * 3.6, at.y + 0.25 + up, at.z + Math.cos(a) * 3.6);
          c.fov = 45; c.aspect = 1; c.updateProjectionMatrix(); c.lookAt(at);
          g.renderer.render(g.scene, c);
        }, yawOff, up);
        await page.screenshot({ path: path.join(OUT, `${seg}_${vn}_${String(frame).padStart(3, '0')}.png`) });
      }
      summary.push({ seg, frame, ...info });
      frame++;
    }
  }
}
fs.writeFileSync(path.join(OUT, 'route.json'), JSON.stringify({ url, fps: FPS, errors, frames: summary }, null, 1));
await browser.close();
console.log('frames', summary.length, 'errors', errors.length);
