// V6 T6-10 · Cámara de JUEGO dentro del túnel FG (a pie, de pie en el fondo y agachada en la boca) en escritorio y vertical:
// ANMI visible (proyección dentro del cuadro y sin muro entre cámara y cabeza) y captura.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, holdKeys } from './lib.mjs';
const R = new Report('fg-tunnel-cam');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const vp of ['desktop', 'phone']) {
      const page = await openGame(b, R, { viewport: VIEWPORTS[vp] }); await clickStart(page); await sleep(800);
      for (const [lab, p, h, keys, ms] of [['fondo', V(0.6, -9.0, -0.45), H(-1, 0), ['KeyW'], 700], ['vuelta', V(-1.6, -9.0, -0.45), H(1, 0), ['KeyW'], 900], ['boca', V(4.3, -9.0, 0), H(-1, 0), ['KeyW', 'KeyC'], 1500]]) {
        await place(page, R, p, h, 'walk', lab); await holdKeys(page, keys, ms); await sleep(900);
        const m = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, cam = g.rig.cam; const head = s.footPos.clone().add(new T.Vector3(0, s.isCrouched ? 1.0 : 1.6, 0));
          const n = head.clone().project(cam), f = s.footPos.clone().project(cam);
          const dir = head.clone().sub(cam.position), L = dir.length(); const rc = new T.Raycaster(cam.position.clone(), dir.normalize(), 0.05, L - 0.35); rc.camera = cam; const hit = rc.intersectObject(g.park.root, true).find((x) => x.object.visible && x.object.material && !x.object.material.transparent && x.object.material.colorWrite !== false);
          return { head: [+n.x.toFixed(2), +n.y.toFixed(2)], foot: [+f.x.toFixed(2), +f.y.toFixed(2)], blocked: !!hit, camY: +cam.position.y.toFixed(2), crouch: s.isCrouched }; }).catch((e) => ({ err: String(e) }));
        R.check(!m.err && Math.abs(m.head[0]) < 0.95 && Math.abs(m.head[1]) < 0.95 && !m.blocked, `${vp} ${lab}: ANMI visible con la cámara de juego`, 'emulation', m);
        await page.screenshot({ path: R.file_(`tunel_${lab}_${vp}.png`) });
      }
      await page.close();
    }
  } finally { await b.close(); }
});
