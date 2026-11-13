// Contacto suela–cubierta medido en el GLB EXPORTADO (public/assets/character/anmi.glb), clip a clip y fotograma a
// fotograma, en las fases de apoyo. Error = |altura del tobillo sobre el plano del deck − 0,20 m (tobillo-suela)|.
//   node tools/anmi-contact.mjs [--url http://localhost:5173/]   → captures/anmi-contact.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:5173/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bk && window.__bk.visual && window.__bk.visual.actions, { timeout: 90000 });
const res = await page.evaluate(() => {
  const T = window.__bkTHREE, v = window.__bk.visual;
  const meta = v.meta ?? {};
  const bones = {}; v.model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const board = bones.Board, feet = { L: bones['mixamorigLeftFoot'], R: bones['mixamorigRightFoot'] };
  const mixer = new T.AnimationMixer(v.model);
  // plano del deck en el reposo del hueso Board: normal = +Y del mundo en el reposo
  v.model.updateMatrixWorld(true);
  const restInv = board.matrixWorld.clone().invert();
  const restUp = new T.Vector3(0, 1, 0).transformDirection(restInv).normalize();
  const DECK_TOP = 0.091, ANKLE = 0.200;
  const out = {};
  const clips = ['SK_Idle', 'SK_Ride', 'SK_CarveL', 'SK_CarveR', 'SK_CrouchRide', 'SK_Push', 'SK_Brake', 'SK_Land', 'SK_LandHard', 'SK_Air', 'SK_FlipTuck', 'SK_Grind'];
  for (const name of clips) {
    const a = v.actions.get(name); if (!a) continue;
    const clip = a.getClip(); const act = mixer.clipAction(clip); act.play();
    const n = Math.round(clip.duration * 30);
    const errs = { L: [], R: [] };
    for (let f = 0; f <= n; f++) {
      const ph = f / Math.max(1, n);
      mixer.setTime(Math.min(clip.duration - 1e-4, f / 30)); v.model.updateMatrixWorld(true);
      const bw = board.matrixWorld;
      const up = restUp.clone().transformDirection(bw).normalize();
      const origin = new T.Vector3().setFromMatrixPosition(bw);
      for (const s of ['L', 'R']) {
        if (name === 'SK_Push' && s === 'R') { const c = meta.SK_Push?.contact ?? [0.31, 0.69]; if (ph > 0.1 && ph < 0.9) continue; void c; }
        if (name === 'SK_Brake' && s === 'R') continue; // pie de freno en el suelo
        const p = new T.Vector3().setFromMatrixPosition(feet[s].matrixWorld);
        const h = p.clone().sub(origin).dot(up) - DECK_TOP;
        errs[s].push(Math.abs(h - ANKLE));
      }
    }
    act.stop(); mixer.uncacheAction(clip);
    const stat = (e) => e.length ? { max_cm: +(Math.max(...e) * 100).toFixed(1), mean_cm: +(e.reduce((x, y) => x + y, 0) / e.length * 100).toFixed(1), n: e.length } : null;
    out[name] = { L: stat(errs.L), R: stat(errs.R) };
  }
  return out;
});
await browser.close();
fs.writeFileSync(path.join(HERE, '..', 'captures', process.argv.includes('--baseline') ? 'anmi-contact-baseline.json' : 'anmi-contact.json'), JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(14), 'L', JSON.stringify(v.L), 'R', JSON.stringify(v.R));
