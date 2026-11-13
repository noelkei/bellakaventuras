// V4-CAM-03/LOOK-01 · A/B del tipo de sombra en la MISMA sesión y el MISMO fotograma (simulación pausada, cámara directa):
// se dibuja con PCFSoftShadowMap (three r18x lo sustituye por PCF con aviso) y con PCFShadowMap explícito y se comparan los
// píxeles. Comprueba además que el juego ya no emite el aviso.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('LOOK-01', 'shadow-ab');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    const warns = []; page.on('console', (m) => { if (/warn/.test(m.type())) warns.push(m.text().slice(0, 200)); });
    await clickStart(page); await sleep(2500);
    const loadWarns = warns.slice();   // avisos de la CARGA del juego (el A/B pone PCFSoft a propósito y avisa)
    const res = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam; g.paused = true;
      cam.position.set(14, 4.5, -38); cam.lookAt(new T.Vector3(17, 0.6, -28)); cam.updateMatrixWorld();
      const grab = () => { g.renderer.render(g.scene, cam); const c = document.getElementById('game'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const t0 = g.renderer.shadowMap.type;
      g.renderer.shadowMap.type = T.PCFSoftShadowMap; g.renderer.shadowMap.needsUpdate = true; grab(); const A = grab();
      g.renderer.shadowMap.type = T.PCFShadowMap; g.renderer.shadowMap.needsUpdate = true; grab(); const B = grab();
      g.renderer.shadowMap.type = t0;
      let mx = 0, n = 0; for (let i = 0; i < A.length; i += 4) { const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])); if (d > mx) mx = d; if (d > 2) n++; }
      return { maxDiff: mx, changed: n, px: A.length / 4, typeInGame: t0, PCF: T.PCFShadowMap };
    });
    R.check(res.maxDiff <= 2, 'A/B en el mismo fotograma: PCFSoftShadowMap (sustituido) y PCFShadowMap dan la misma imagen', 'vision', res);
    R.check(res.typeInGame === res.PCF, 'el juego declara PCFShadowMap', 'static', res);
    R.check(!loadWarns.some((w) => /PCFSoftShadowMap/.test(w)), 'sin el aviso «PCFSoftShadowMap has been removed» al cargar el juego', 'static', loadWarns);
  } finally { await browser.close(); }
});
