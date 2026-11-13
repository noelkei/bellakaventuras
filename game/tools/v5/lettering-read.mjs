// T5-27 · Lectura del cartel de NMG: capturas con la cámara de pie a 3/8/15 m de frente (altura de ojos 1,6 m) en escritorio,
// 390×844 y 844×390, más la llegada con la cámara de juego. Mide la proporción del rectángulo del cartel proyectado (vista
// frontal ortogonal: ±2 % de 2:1), que la textura servida es el derivado exacto (tamaño 1774×887) y que el material no es
// emisivo. La lectura de NO ME / GUILLO / V2 la juzga quien mira las capturas (G8-V).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, directShot } from './lib.mjs';
const R = new Report('lettering-read');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [lay, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page); await sleep(2500);
      const S = await page.evaluate(() => { const g = window.__bk, m = g.park.signs.find((x) => x.name === 'NMG_LETTERING'); const n = new window.__bkTHREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
        const img = m.material.map?.image; return { pos: [m.position.x, m.position.y, m.position.z], n: [n.x, n.z], tex: img ? [img.width, img.height] : null, emissive: m.material.emissive?.getHex?.() ?? 0, emissiveMap: !!m.material.emissiveMap, rough: m.material.roughness, count: g.park.signs.filter((x) => /NO ME GUILLO/i.test(x.userData.text ?? '')).length }; });
      for (const d of [3, 8, 15]) {
        const pos = [S.pos[0] + S.n[0] * d, 1.6, S.pos[2] + S.n[1] * d];
        await directShot(page, R, `${lay}_${d}m`, pos, S.pos, 60);
        if (d === 8) { const asp = await page.evaluate((pos) => { const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam, m = g.park.signs.find((x) => x.name === 'NMG_LETTERING'); cam.position.set(...pos); cam.lookAt(m.position); cam.updateMatrixWorld();
          const P = (x, y) => { const v = new T.Vector3(x, y, 0).applyMatrix4(m.matrixWorld).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
          const a = P(-1.2, -0.6), bq = P(1.2, -0.6), c = P(-1.2, 0.6); return Math.hypot(bq[0] - a[0], bq[1] - a[1]) / Math.hypot(c[0] - a[0], c[1] - a[1]); }, [S.pos[0] + S.n[0] * 8, S.pos[1], S.pos[2] + S.n[1] * 8]);
          R.check(Math.abs(asp - 2) / 2 <= 0.02, `${lay}: proporción en pantalla 2:1 (${asp.toFixed(3)})`, 'unit', { asp }); }
      }
      await fixture(page, R, `${lay}: llegada con la cámara de juego`, () => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } return {}; });
      await sleep(1500); await R.shot(page, `${lay}_llegada`);
      R.check(S.tex && S.tex[0] === 1774 && S.tex[1] === 887, `${lay}: textura servida = derivado exacto 1774×887`, 'unit', S);
      R.check(S.emissive === 0 && !S.emissiveMap && Math.abs(S.rough - 0.8) < 1e-6, `${lay}: material no emisivo, rugosidad 0,8`, 'unit', S);
      R.check(S.count === 1, `${lay}: un solo cartel de NO ME GUILLO`, 'unit', S);
      await page.close();
    }
    R.pendingHuman('Lectura de NO ME / GUILLO / V2 en las capturas a 3/8/15 m y en la llegada (G8-V)');
  } finally { await b.close(); }
});
