// V7 · copia de tools/v4/esc-routes.mjs (que queda intacto) SIN las secciones del TT antiguo; ver nota dentro.
// V4-ESC-01/02 · Escaleras y perfiles caminables con ENTRADA NORMAL (teclas reales). Fixtures declaradas solo para
// colocar a ANMI al pie de cada recorrido. Mide alturas alcanzadas, etapas de guardado, impactos y caídas.
//  A. TT a pie: pie de escalera → cinco descansos → último giro (D) → tablero 4,2 m; bajada andando.
//  B. TT en tabla: con carrerilla sube tramos según energía; desde parado en un descanso NO sube el siguiente tramo.
//  C. TT paso agachado bajo el descanso 2: patata escondida solo agachado.
//  D. NMG bank: subir rodando a la plataforma (0,6 m), girar arriba, bajar sin caída; subir andando por el bank.
import { Report, runTest, launch, openGame, clickStart, sleep, snap, holdKeys } from '../v4/lib.mjs';

const R = new Report('ESC', 'esc-routes');
const placeTT = (page, x, z, h, yawOff, loco) => page.evaluate((x, z, h, yawOff, loco) => {
  const g = window.__bk, T = window.__bkTHREE, th = 173 * Math.PI / 180, r = 33.0;
  const O = new T.Vector3(r * Math.sin(th), 0, -r * Math.cos(th)), X = new T.Vector3(Math.cos(th), 0, Math.sin(th)), Z = new T.Vector3(-Math.sin(th), 0, Math.cos(th));
  const p = O.clone().addScaledVector(X, x).addScaledVector(Z, z); p.y = h;
  const dir = X.clone().multiplyScalar(Math.cos(yawOff)).addScaledVector(Z, Math.sin(yawOff));
  g.skater.teleport(p, Math.atan2(dir.x, dir.z), loco); g.rig.snapBehind(g.skater); g.input.clear();
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
}, x, z, h, yawOff, loco);

await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page);
    // V7: las secciones A (TT a pie), B (TT en tabla) y C (paso agachado bajo el descanso 2) medían la escalera de cinco descansos y el
    // descanso hueco del TRA TRA TRA anterior, retirados en V7. Su cobertura pasa a tools/v7/tt-routes.mjs (recorrido completo con
    // teclado real), tt-matrix.mjs (escaleras a pie y en tabla, caída, saltos) y tt-talks.mjs. El resto del archivo es el original de V4.
    // ------------------------------------------------ D. NMG bank
    const bank = await page.evaluate(() => { const a = window.__bk.manifest.get('nmg.bank.foot'); return { x: a.pos.x, z: a.pos.z, h: a.heading }; });
    R.fixture('D1: ANMI montada a 6 m del pie del bank NMG, mirando a él', await page.evaluate((b) => { const g = window.__bk, T = window.__bkTHREE; const d = new T.Vector3(Math.sin(b.h), 0, Math.cos(b.h)); const p = new T.Vector3(b.x, 0, b.z).addScaledVector(d, -6); g.skater.teleport(p, b.h, 'ride'); g.rig.snapBehind(g.skater); return [p.x, p.z]; }, bank));
    await sleep(300);
    const bk = await holdKeys(page, ['KeyW'], 2600, { every: 80 });
    const onPlat = bk.filter((q) => q.y > 0.55);
    R.check(onPlat.length > 0 && bk.every((q) => q.loco !== 'impact' && q.loco !== 'bail'), 'D1: sube rodando el bank hasta la plataforma (0,6 m) sin caída', 'input', { maxY: Math.max(...bk.map((q) => q.y)), vAt: onPlat[0]?.vLong });
    // frenar arriba, girar 180 y bajar por el bank
    await holdKeys(page, ['KeyS'], 900, { every: 100 });
    await holdKeys(page, ['KeyD'], 1150, { every: 100 });
    const bd = await holdKeys(page, ['KeyW'], 2200, { every: 80 });
    R.check(bd.at(-1).y < 0.1 && bd.every((q) => q.loco !== 'impact' && q.loco !== 'bail'), 'D1: tras girar arriba baja por el bank (o la escalera) sin caída', 'input', { endY: bd.at(-1).y, states: [...new Set(bd.map((q) => q.state))] });
    R.fixture('D2: ANMI a pie a 3 m del pie del bank', await page.evaluate((b) => { const g = window.__bk, T = window.__bkTHREE; const d = new T.Vector3(Math.sin(b.h), 0, Math.cos(b.h)); const p = new T.Vector3(b.x, 0, b.z).addScaledVector(d, -3); g.skater.teleport(p, b.h, 'walk'); return [p.x, p.z]; }, bank));
    const wk = await holdKeys(page, ['KeyW'], 2600, { every: 100 });
    R.check(Math.max(...wk.map((q) => q.y)) > 0.55, 'D2: el bank también se sube andando', 'input', { maxY: Math.max(...wk.map((q) => q.y)) });
  } finally { await browser.close(); }
});
