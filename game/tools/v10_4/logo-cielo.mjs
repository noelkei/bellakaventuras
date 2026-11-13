// V10.4 R18 · guardián (usuario: «tiene que quedarse también el disponible el 30 / 10, en todos los dispositivos»): tras la escena final y al
// recargar con el final hecho, el logo de nubes y la fecha («disponible el» y «30 / 10») siguen formados en el cielo, en su sitio de reposo
// (borde de abajo ≥ 15° desde el centro del parque, por encima de los edificios) y ninguna nube del cielo se queda delante.
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('logo-cielo');
const st = (page) => page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, L = g.skyLogo; if (!L) return null;
  const b = new T.Box3().setFromObject(L.group), c = L.group.position, d = Math.hypot(c.x, c.z), el = Math.atan2(b.min.y, d) * 180 / Math.PI;
  const im = g.scene.getObjectByName('SKY_CLOUDS'), m = new T.Matrix4(), p = new T.Vector3(), dir = new T.Vector3(c.x, 0, c.z).normalize(); let front = 0;
  for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); const s = new T.Vector3().setFromMatrixScale(m); if (s.x < 1e-3) continue; p.setFromMatrixPosition(m).applyMatrix4(im.parent.matrixWorld); if (p.clone().setY(0).normalize().dot(dir) > Math.cos(12 * Math.PI / 180)) front++; }
  return { logo: L.logo.k, fecha: L.fecha.k, fecha2: L.fecha2?.k ?? 1, vis: L.logo.mesh.visible && L.fecha.mesh.visible, elevBottom: +el.toFixed(1), front }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { query: '?bktest=1&narr=off&escena' }); await clickStart(page);
    for (let k = 0; k < 80 && !(await page.evaluate(() => !!window.__bk.cine?.active)); k++) await sleep(250);
    await sleep(1500); await page.evaluate(() => window.__bk.cine.end(true)); await sleep(2500);
    const a = await st(page);
    R.check(!!a && a.logo === 1 && a.fecha === 1 && a.fecha2 === 1 && a.vis, 'tras la escena final: «Bellakaciones», «disponible el» y «30 / 10» siguen formados en el cielo', 'input', a);
    R.check(!!a && a.elevBottom >= 15 && a.front === 0, `en reposo: borde de abajo a ${a?.elevBottom}° desde el centro (≥ 15°) y sin nubes delante (${a?.front})`, 'input', a);
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
    await page.evaluate(() => { const u = new URL(location.href); }); await clickStart(page); await sleep(3000);
    await page.evaluate(() => { if (window.__bk.cine?.active) window.__bk.cine.end(true); }); await sleep(2500);
    const c = await st(page);
    R.check(!!c && c.logo === 1 && c.fecha === 1 && c.fecha2 === 1 && c.vis, 'al recargar con el final hecho: logo y fecha completos en el cielo', 'input', c);
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
