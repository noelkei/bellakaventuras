// V10.4 R19 · guardián (usuario: «que la música baje el volumen ligeramente en los diálogos»): en NO ME GUILLO, con un diálogo 2D abierto la
// canción baja ligeramente (55–75 % de su ganancia) y al cerrarlo vuelve (≥ 95 %).
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('musica-dialogo');
const gain = (page) => page.evaluate(() => +(window.__bk.audio.music?.tracks.get('no_me_guillo')?.gain ?? -1).toFixed(3));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(1500);
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, p = g.park.sector('no_me_guillo').P(31, 0); g.skater.teleport(new T.Vector3(p.x, 0, p.z), 0, 'walk'); });
    let g0 = -1; for (let k = 0; k < 40; k++) { await sleep(250); g0 = await gain(page); if (g0 > 0.3) break; } await sleep(1500); g0 = await gain(page);
    await page.evaluate(() => { window.__bk.d2.say({ habla: 'kat', texto: 'Prueba de volumen.', kat: 'habla', kroak: 'espera' }); }); await sleep(1500);
    const g1 = await gain(page);
    await page.evaluate(() => window.__bk.d2.close()); await sleep(1500);
    const g2 = await gain(page);
    R.check(g0 > 0.3 && g1 / g0 >= 0.55 && g1 / g0 <= 0.75, `con el diálogo abierto la música baja ligeramente (${(g1 / g0 * 100).toFixed(0)} %)`, 'input', { g0, g1 });
    R.check(g2 / g0 >= 0.95, `al cerrarlo vuelve (${(g2 / g0 * 100).toFixed(0)} %)`, 'input', { g0, g2 });
  } finally { await b.close(); }
}, { timeoutMs: 200000 });
