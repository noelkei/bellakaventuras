// Secuencias de clips de ANMI en el RUNTIME (GLB final, luz del juego): N fotogramas por clip desde varias vistas,
// montados en una lámina por clip.  node tools/v3/capture-clip.mjs SK_Idle,SK_Push [--views side,front,q,feet] [--n 8]
//   → captures/v3/P2/clips/<clip>.jpg
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const clips = (process.argv[2] ?? 'SK_Idle').split(',');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const views = arg('--views', 'side,front,q').split(',');
const N = +arg('--n', 8);
const R = new Report('P2/clips', 'capture', { clips, views, n: N });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 520, height: 560, deviceScaleFactor: 1 }, save: null, query: '' });
await clickStart(page);
await page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE; g.autoMode = true;
  document.getElementById('hud').hidden = true; document.getElementById('touch').hidden = true; document.getElementById('hint').hidden = true;
  const S = g.park.sector('no_me_guillo'); const p = S.P(44, -10);
  g.skater.teleport(p, 0, 'ride'); g.skater.frozen = true;
  window.__cap = { p };
});
const dir = R.dir;
for (const clip of clips) {
  const frames = [];
  for (const vw of views) {
    for (let i = 0; i < N; i++) {
      const buf = await page.evaluate(async ({ clip, vw, i, N }) => {
        const g = window.__bk, T = window.__bkTHREE, v = g.visual, p = window.__cap.p;
        const a = v.actions.get(clip); if (!a) return null;
        v.play(clip, { loop: true, fade: 0 });
        const d = a.getClip().duration; a.time = d * (i / Math.max(1, N - 1)) * 0.999; a.paused = true;
        for (const x of v.actions.values()) if (x !== a) { x.stop(); }
        a.setEffectiveWeight(1); a.enabled = true;
        v.mixer.update(0);
        v.root.position.set(p.x, p.y, p.z); v.root.quaternion.identity(); v.root.rotation.set(0, 0, 0);
        v.root.updateMatrixWorld(true);
        const off = { side: [2.6, 0.9, 0], front: [0, 0.9, -2.6], q: [1.9, 1.6, -1.9], feet: [0.9, 0.35, 0.6], back: [0, 0.9, 2.6] }[vw];
        const tgt = new T.Vector3(p.x, p.y + (vw === 'feet' ? 0.12 : 0.85), p.z);
        g.rig.mode = 'fixed'; g.rig.cam.position.set(p.x + off[0], p.y + off[1], p.z + off[2]); g.rig.cam.lookAt(tgt);
        g.rig.cam.fov = vw === 'feet' ? 30 : 45; g.rig.cam.updateProjectionMatrix();
        g.renderer.render(g.scene, g.rig.cam);
        return true;
      }, { clip, vw, i, N });
      if (!buf) { R.note(`${clip} no existe`); break; }
      frames.push(await page.screenshot({ type: 'png' }));
    }
  }
  if (!frames.length) continue;
  const W = 260, H = 280, cols = N;
  const tiles = await Promise.all(frames.map((f) => sharp(f).resize(W, H).toBuffer()));
  const sheet = sharp({ create: { width: W * cols, height: H * views.length, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((t, k) => ({ input: t, left: (k % cols) * W, top: Math.floor(k / cols) * H })));
  await sheet.jpeg({ quality: 82 }).toFile(path.join(dir, `${clip}.jpg`));
  console.log('SHEET', clip);
}
await browser.close(); R.finish();
